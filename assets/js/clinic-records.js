/*
 * Saving the staff records that have to stay together: Annex C, paper form numbers, reference numbers, the audit log.
 * Needs auth.js; load BEFORE the page's own script.
 *
 * Each save is one PocketBase batch, so all of it is saved or none of it. The API rules check it all again on the server
 * (pocketbase/annex-c-d-schema.js), for anyone skipping these pages. A refused rule only says "Failed to create record",
 * so the reasons people need to read are worked out here first.
 */

const clinicUserName = (user) => user?.name || user?.email || '';

const clinicManilaToday = () => new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);

// A PocketBase date string for a Manila date and time.
const clinicManilaUTC = (date, time) => new Date(`${date}T${time || '00:00'}:00+08:00`).toISOString().replace('T', ' ');

// A record id made here, so one batch can create an appointment and the records pointing at it.
function clinicRecordId() {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  return [...crypto.getRandomValues(new Uint8Array(15))].map((b) => chars[b % chars.length]).join('');
}

// A reason someone can act on: { field: message }. The pages show it next to that field.
function clinicRefusal(field, message) {
  return Object.assign(new Error(message), { fields: { [field]: message } });
}

// ---------- The audit log ----------

function auditRow(user, action, collection, id, reference, changes) {
  return {
    target_collection: collection, target_id: id || '', target_reference: reference || '', action,
    user_id: user.id, user_name: clinicUserName(user), changes: changes || {},
  };
}

// What `changes` would really change on `record`, as { field: { from, to } }.
function clinicDiff(record, changes) {
  const diff = {};
  for (const [key, value] of Object.entries(changes)) {
    if (JSON.stringify(record[key]) !== JSON.stringify(value)) diff[key] = { from: record[key], to: value };
  }
  return diff;
}

// ---------- Batches ----------

// The request in a batch that failed, shaped like an ordinary SDK error, so the pages read it the usual way.
function batchError(err) {
  const failed = Object.values(err?.response?.data?.requests || {})[0]?.response;
  if (!failed) return err;
  return Object.assign(new Error(failed.message || 'The batch failed.'), { status: failed.status, response: failed });
}

async function sendBatch(batch) {
  try {
    return await batch.send({ requestKey: null });
  } catch (err) {
    throw batchError(err);
  }
}

// Updates a record and logs what changed, together. Returns the saved record.
async function updateAndLog(user, collection, record, changes) {
  const batch = pb.createBatch();
  batch.collection(collection).update(record.id, changes);
  const diff = clinicDiff(record, changes);
  if (Object.keys(diff).length) batch.collection('audit_log').create(auditRow(user, 'update', collection, record.id, record.reference, diff));
  const [saved] = await sendBatch(batch);
  return saved.body;
}

// Deletes a record, leaving a copy of it in the log.
async function deleteAndLog(user, collection, record) {
  const batch = pb.createBatch();
  batch.collection('audit_log').create(auditRow(user, 'delete', collection, record.id, record.reference, record));
  batch.collection(collection).delete(record.id);
  await sendBatch(batch);
}

// ---------- Reference numbers ----------

// The next `count` numbers: 'online' → SNMC-2026-000123 (walk-ins and other staff entries), 'paper' → SNMC-2026-M0042.
// Both start again at 1 in the new year, and anything already in use is skipped. Returns the numbers and the counter
// update that goes in the same batch: if someone else takes a number first, the rules refuse the whole batch, and the
// save starts again from the new counter (see `withNewNumbers`).
async function nextReferences(kind, count = 1) {
  const { items: [c] } = await pb.collection('intake_controls').getList(1, 1, { requestKey: null });
  const year = Number(clinicManilaToday().slice(0, 4));
  const newYear = c.ref_year !== year;
  const key = kind === 'paper' ? 'ref_paper_next' : 'ref_next';
  const format = (n) => `${c.ref_prefix || 'SNMC'}-${year}-${kind === 'paper' ? `M${String(n).padStart(4, '0')}` : String(n).padStart(6, '0')}`;
  const taken = async (reference) => {
    const filter = pb.filter('reference = {:r}', { r: reference });
    const found = await Promise.all(['appointments', 'paper_forms'].map((name) => pb.collection(name).getList(1, 1, { filter, fields: 'id', requestKey: null })));
    return found.some((res) => res.totalItems > 0);
  };

  let next = newYear ? 1 : Math.max(1, c[key]);
  const references = [];
  while (references.length < count) {
    if (!(await taken(format(next)))) references.push(format(next));
    next++;
  }
  const counter = newYear ? { ref_year: year, ref_next: 1, ref_paper_next: 1, [key]: next } : { [key]: next };
  return { references, controlsId: c.id, counter };
}

// Someone else took the same number while this was being saved: only then is it worth trying again.
function numberClash(err) {
  const failed = Object.values(err?.response?.data?.requests || {})[0];
  const data = failed?.response?.data || {};
  return failed?.response?.status === 400 && (data.reference?.code === 'validation_not_unique' || !Object.keys(data).length);
}

// Runs `attempt` (which builds and sends one batch), again with fresh numbers if another save got to them first.
async function withNewNumbers(attempt) {
  for (let tries = 1; ; tries++) {
    try {
      return await attempt();
    } catch (err) {
      if (tries >= 5 || !numberClash(err)) throw batchError(err);
    }
  }
}

// ---------- Paper forms ----------

// Issues numbers for blank paper forms. Who took them and when is on the record, so forms never filed in show up.
function issuePaperForms(user, count) {
  if (!Number.isInteger(count) || count < 1 || count > 50) return Promise.reject(clinicRefusal('count', 'Enter a number from 1 to 50.'));
  return withNewNumbers(async () => {
    const { references, controlsId, counter } = await nextReferences('paper', count);
    const batch = pb.createBatch();
    for (const reference of references) {
      batch.collection('paper_forms').create({ reference, status: 'ISSUED', issued_by: user.id, issued_by_name: clinicUserName(user) });
    }
    batch.collection('intake_controls').update(controlsId, counter);
    batch.collection('audit_log').create(auditRow(user, 'paper_issue', 'paper_forms', '', '', { references }));
    await batch.send({ requestKey: null });
    return references;
  });
}

async function voidPaperForm(user, form, reason) {
  const batch = pb.createBatch();
  batch.collection('paper_forms').update(form.id, { status: 'VOID', void_reason: reason });
  batch.collection('audit_log').create(auditRow(user, 'paper_void', 'paper_forms', form.id, form.reference, { reason }));
  await sendBatch(batch);
}

// ---------- Annex C ----------

async function voidIntakeRecord(user, intake, reason) {
  const batch = pb.createBatch();
  batch.collection('intake_requests').update(intake.id, { voided: true, void_reason: reason });
  batch.collection('audit_log').create(auditRow(user, 'intake_void', 'intake_requests', intake.id, intake.reference, { reason }));
  await sendBatch(batch);
}

// A newly assigned LSP or lawyer who has been set to Inactive is refused; someone already on the case can stay.
function assignmentProblem(lspId, slId, previous, practitioners, lawyers) {
  const inactive = (list, id) => list.find((p) => p.id === id)?.status === 'inactive';
  if (lspId && lspId !== (previous?.lsp_id || '') && inactive(practitioners, lspId)) {
    return ['lsp_id', 'This LSP is inactive (their semester has ended). Choose someone else, or move them to the current semester first.'];
  }
  if (slId && slId !== (previous?.sl_id || '') && inactive(lawyers, slId)) {
    return ['sl_id', 'This supervising lawyer is inactive. Choose someone else.'];
  }
  return null;
}

// Files an Annex C. With `appointment_id` it receives that booking; without one it also creates the appointment, so a
// walk-in always has both. Returns { id, appointment_id, reference, encoded_late, unissued_paper }.
function fileIntake(user, body, { practitioners = [], lawyers = [], lateDays = 3 } = {}) {
  const text = (value) => String(value == null ? '' : value).trim();
  const answers = body.answers || {};
  const fullName = text(body.full_name);
  const email = text(body.email);
  const address = text(body.address);
  const mobile = normalizeMobile(body.mobile_no);
  const source = body.source === 'PAPER' ? 'PAPER' : 'DIGITAL';
  const written = source === 'PAPER' ? text(body.paper_number).toUpperCase() : '';
  const receivedAgo = Math.floor((Date.parse(`${clinicManilaToday()}T00:00:00Z`) - Date.parse(`${body.date_received}T00:00:00Z`)) / 86400000);

  return withNewNumbers(async () => {
    const appointment = body.appointment_id ? await pb.collection('appointments').getOne(body.appointment_id, { requestKey: null }).catch((err) => {
      throw err?.status === 404 ? clinicRefusal('appointment_id', 'That appointment no longer exists.') : err;
    }) : null;
    if (appointment) {
      const { items } = await pb.collection('intake_requests').getList(1, 1, { filter: pb.filter('appointment_id = {:id} && voided = false', { id: appointment.id }), fields: 'id', requestKey: null });
      if (items.length) throw clinicRefusal('appointment_id', 'This appointment has already been received.');
    }

    // The number written on a paper form: one we issued is used as it is; anything else is kept for searching, and gets
    // a proper number. A number that's been used already is the one thing refused: that's a mistake to look at.
    let paperForm = null;
    let reference = appointment?.reference || '';
    if (source === 'PAPER' && written) {
      const filter = pb.filter('reference = {:r}', { r: written });
      paperForm = (await pb.collection('paper_forms').getList(1, 1, { filter, requestKey: null })).items[0] || null;
      if (paperForm?.status === 'ENCODED') throw clinicRefusal('paper_number', `${written} has already been encoded.`);
      if (paperForm?.status === 'VOID') throw clinicRefusal('paper_number', `${written} was voided and can't be used.`);
      if (!paperForm && (await pb.collection('appointments').getList(1, 1, { filter, fields: 'id', requestKey: null })).totalItems) {
        throw clinicRefusal('paper_number', `${written} is already in use.`);
      }
      if (paperForm && !appointment) reference = written;
    }
    const unissued = source === 'PAPER' && !paperForm;
    const numbers = reference ? null : await nextReferences(source === 'PAPER' ? 'paper' : 'online');
    if (numbers) [reference] = numbers.references;

    const history = appointment ? await pb.collection('appointments_status').getList(1, 1, { filter: pb.filter('app_id = {:id}', { id: appointment.id }), sort: '-created', requestKey: null }) : null;
    const previous = history?.items[0] || null;
    const lspId = text(body.lsp_id) || previous?.lsp_id || '';
    const slId = text(body.sl_id) || previous?.sl_id || '';
    const problem = assignmentProblem(lspId, slId, previous, practitioners, lawyers);
    if (problem) throw clinicRefusal(...problem);

    const scheduledAt = body.schedule_date ? clinicManilaUTC(body.schedule_date, body.schedule_time || '09:00') : '';
    if (body.disposition === 'INTERVIEW' && !scheduledAt && !appointment?.scheduled_at) throw clinicRefusal('schedule_date', 'Enter the interview schedule.');

    const batch = pb.createBatch();

    // ---------- The appointment ----------
    const appointmentId = appointment?.id || clinicRecordId();
    if (appointment) {
      const changes = {};
      if (scheduledAt && scheduledAt !== appointment.scheduled_at) changes.scheduled_at = scheduledAt;
      if (!appointment.reference) changes.reference = reference; // an old booking with none
      if (body.not_duplicate) changes.not_duplicate = true;
      if (Object.keys(changes).length) batch.collection('appointments').update(appointment.id, changes);
    } else {
      const areas = [...(answers.practice_areas || []), text(answers.practice_other)].filter(Boolean).join(', ');
      batch.collection('appointments').create({
        id: appointmentId, reference, title: [fullName, areas].filter(Boolean).join(' — '), email, mobile_no: mobile, scheduled_at: scheduledAt, not_duplicate: !!body.not_duplicate,
        // Shaped like the online form, so the printed intake form and the ULAS declaration fill in the same way.
        json: {
          source: 'staff', annexC: true, addedBy: clinicUserName(user), addedAt: new Date().toISOString(), concern: text(answers.nature),
          B_personal: { fullName, address, mobile, email },
          F_legalIssue: { practiceAreas: answers.practice_areas || [], other: text(answers.practice_other), requestedAssistance: answers.assistance || [], requestedOther: text(answers.assistance_other) },
          G_caseFacts: { narrative: text(answers.nature), referralSources: answers.referral || [], referralOther: text(answers.referral_other) },
        },
      });
    }

    // ---------- Annex C ----------
    const intakeId = clinicRecordId();
    batch.collection('intake_requests').create({
      id: intakeId, reference, appointment_id: appointmentId, date_received: clinicManilaUTC(body.date_received),
      contact_mode: text(body.contact_mode), contact_mode_other: text(body.contact_mode_other),
      full_name: fullName, address, mobile_no: mobile, email,
      urgency: text(body.urgency), disposition: text(body.disposition), disposition_other: text(body.disposition_other),
      received_by: user.id, received_by_name: clinicUserName(user),
      source, paper_ref_written: written, unissued_paper: unissued, late_reason: text(body.late_reason), json: answers,
    });
    if (paperForm) batch.collection('paper_forms').update(paperForm.id, { status: 'ENCODED', intake_id: intakeId });

    // ---------- History ----------
    const closes = body.disposition === 'IMMEDIATE_REFERRAL' && !scheduledAt;
    const hasDate = !!(scheduledAt || appointment?.scheduled_at);
    const current = previous ? previous.app_status.trim() : 'PENDING';
    batch.collection('appointments_status').create({
      app_id: appointmentId, user_id: user.id, app_status: closes ? 'DONE' : (current === 'PENDING' && hasDate ? 'SCHEDULED' : current), lsp_id: lspId, sl_id: slId,
      remarks: [closes ? 'Immediate referral (Annex C).' : 'Intake received (Annex C).', text(body.remarks)].filter(Boolean).join(' '),
    });

    if (numbers) batch.collection('intake_controls').update(numbers.controlsId, numbers.counter);
    const late = receivedAgo > lateDays;
    batch.collection('audit_log').create(auditRow(user, appointment ? 'intake_receive' : 'intake_create', 'intake_requests', intakeId, reference, { source, unissued, late }));

    await batch.send({ requestKey: null });
    return { id: intakeId, appointment_id: appointmentId, reference, encoded_late: late, unissued_paper: unissued };
  });
}
