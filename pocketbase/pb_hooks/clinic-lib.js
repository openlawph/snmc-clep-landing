/*
 * SNMC Law Legal Clinic: helpers shared by the clinic-*.pb.js hooks. Not a hook itself (only *.pb.js files run on
 * their own). Load it INSIDE a handler, because PocketBase runs each handler in isolation:
 *   const lib = require(`${__hooks}/clinic-lib.js`);
 */

const MANILA_MS = 8 * 60 * 60 * 1000; // Manila is UTC+8, with no daylight saving
const OPEN_FILTER = 'app_status != "DONE" && app_status != "CANCELLED"';
// On appointments_overview, an appointment with no status row has these columns NULL: `= ""` alone misses those.
const UNASSIGNED_FILTER = '(lsp_id = null || lsp_id = "" || sl_id = null || sl_id = "")';
const NO_INTAKE_FILTER = '(intake_id = null || intake_id = "")';
const BOOKING_DAYS_AHEAD = 100; // the form offers 90; a little room for someone filling it in overnight
const NARRATIVE_MAX_WORDS = 300;

// ---------- Small helpers ----------

// 'YYYY-MM-DD' and 'HH:MM' in Manila for a Date (default: now).
function manila(date) {
  const iso = new Date((date ? date.getTime() : Date.now()) + MANILA_MS).toISOString();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16), year: Number(iso.slice(0, 4)), day: new Date(iso).getUTCDay() };
}

// A PocketBase date string for a Manila date and time.
function manilaToUTC(date, time) {
  return new Date(`${date}T${time || '00:00'}:00+08:00`).toISOString().replace('T', ' ');
}

const dbDate = (ms) => new Date(ms).toISOString().replace('T', ' ');
const text = (value) => String(value == null ? '' : value).trim();
const list = (value) => (Array.isArray(value) ? value.map(text).filter(Boolean) : []);

// Same as normalizeMobile() in assets/js/intake.js.
function normalizeMobile(value) {
  const compact = String(value || '').replace(/[^\d+]/g, '');
  return /^\+639\d{9}$/.test(compact) ? '0' + compact.slice(3) : compact;
}

// A JSON field's value as a plain object (empty object if there's nothing usable).
function jsonOf(value) {
  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : JSON.parse(toString(value));
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (_) {
    return {};
  }
}

// A refusal the pages can recognise: { data: { <field>: { code, message } } }. It has to carry a field: the booking
// form takes a refusal with no field errors to mean online booking is closed.
function refuse(field, code, message) {
  return new BadRequestError(message, { [field]: new ValidationError(code, message) });
}

// The first record matching, or null (findFirstRecordByFilter throws when there's none).
function firstOrNull(app, collection, filter, params) {
  try {
    return app.findFirstRecordByFilter(collection, filter, params || {});
  } catch (_) {
    return null;
  }
}

function controls(app) {
  return app.findFirstRecordByFilter('intake_controls', "id != ''");
}

// ---------- Reference numbers ----------

// Takes the next `count` numbers: 'online' → SNMC-2026-000123, 'paper' → SNMC-2026-M0042. Both start again at 1 in the
// new year. Anything already in use is skipped, so an admin moving a counter can't cause a clash.
function allocate(app, kind, count) {
  const references = [];
  app.runInTransaction((tx) => {
    const c = controls(tx);
    const year = manila().year;
    if (c.getInt('ref_year') !== year) {
      c.set('ref_year', year);
      c.set('ref_next', 1);
      c.set('ref_paper_next', 1);
    }
    const key = kind === 'paper' ? 'ref_paper_next' : 'ref_next';
    let next = Math.max(1, c.getInt(key));
    const prefix = `${c.getString('ref_prefix') || 'SNMC'}-${year}-`;
    const format = (n) => prefix + (kind === 'paper' ? `M${String(n).padStart(4, '0')}` : String(n).padStart(6, '0'));
    const taken = (ref) => firstOrNull(tx, 'appointments', 'reference = {:r}', { r: ref }) || firstOrNull(tx, 'paper_forms', 'reference = {:r}', { r: ref });
    for (let i = 0; i < (count || 1); i++) {
      while (taken(format(next))) next++;
      references.push(format(next));
      next++;
    }
    c.set(key, next);
    tx.save(c);
  });
  return references;
}

// ---------- Audit log ----------

function userName(auth) {
  if (!auth) return '';
  return auth.getString('name') || auth.getString('email');
}

function audit(app, auth, action, collection, id, reference, changes) {
  try {
    const record = new Record(app.findCollectionByNameOrId('audit_log'));
    record.set('target_collection', collection);
    record.set('target_id', id || '');
    record.set('target_reference', reference || '');
    record.set('action', action);
    if (auth && auth.collection().name === 'users') record.set('user_id', auth.id);
    record.set('user_name', auth && auth.collection().name !== 'users' ? 'PocketBase superuser' : userName(auth));
    record.set('changes', changes || {});
    app.save(record);
  } catch (err) {
    console.error('[clinic] could not write to the audit log:', err); // never let the log stop the work itself
  }
}

// What changed between two records, as { field: { from, to } }.
function diff(before, after) {
  const a = JSON.parse(JSON.stringify(before));
  const b = JSON.parse(JSON.stringify(after));
  const changes = {};
  for (const key of Object.keys(b)) {
    if (key === 'updated' || key === 'collectionId' || key === 'collectionName') continue;
    if (JSON.stringify(a[key]) !== JSON.stringify(b[key])) changes[key] = { from: a[key], to: b[key] };
  }
  return changes;
}

// ---------- Email ----------

// Who gets the alerts: intake_controls.alert_emails, or every verified admin if that's empty.
function alertRecipients(app) {
  const listed = controls(app).getString('alert_emails').split(/[,;\s]+/).filter((a) => /^\S+@\S+\.\S+$/.test(a));
  if (listed.length) return listed;
  return app.findRecordsByFilter('users', 'role = "admin" && verified = true', '', 0, 0).map((u) => u.getString('email')).filter(Boolean);
}

const escapeHtml = (value) => String(value).replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));

// `lines` go out as a list. Keep client names and case facts OUT of them: email isn't private enough for those.
function sendAlert(app, subject, intro, lines) {
  const to = alertRecipients(app);
  if (!to.length) {
    console.warn('[clinic] no one to send this alert to:', subject);
    return false;
  }
  const meta = app.settings().meta;
  app.newMailClient().send(new MailerMessage({
    from: { address: meta.senderAddress, name: meta.senderName },
    to: to.map((address) => ({ address })),
    subject,
    html: `<p>${escapeHtml(intro)}</p><ul>${lines.map((l) => `<li>${escapeHtml(l)}</li>`).join('')}</ul><p>https://clinic.snmclaw.com/clinic-dashboard.html</p>`,
  }));
  return true;
}

// ---------- Annex D: urgency ----------

// Reads Part III of the online form. `emergency` (the immediate email) is Annex D's own list: detention, a threat to
// safety, or a court hearing within 48 hours.
function urgencyOf(answers) {
  const u = (answers.annexD && answers.annexD.urgency) || {};
  const flags = list(u.flags).filter((f) => !/none of the above/i.test(f));
  const date = /^\d{4}-\d{2}-\d{2}$/.test(u.date || '') ? u.date : '';
  const hearing = flags.some((f) => /hearing/i.test(f));
  const soon = !!date && new Date(`${date}T23:59:59+08:00`).getTime() - Date.now() <= 48 * 60 * 60 * 1000;
  return { urgent: flags.length > 0, date, flags, emergency: flags.some((f) => /detained|threat/i.test(f)) || (hearing && soon) };
}

// ---------- Online bookings: what visitors can't do ----------

function wordCount(value) {
  return text(value).split(/\s+/).filter(Boolean).length;
}

// Throws a refusal unless this slot can be booked by a visitor. Staff don't go through here.
function checkVisitorBooking(app, record, answers) {
  const when = record.getDateTime('scheduled_at');
  if (when.isZero()) throw refuse('scheduled_at', 'slot_invalid', 'Pick a date and time for your visit.');
  const at = when.time().unixMilli();
  const slot = manila(new Date(at));
  const now = manila();
  const settings = app.findFirstRecordByFilter('intake_settings', "id != ''");
  const days = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
  const offered = settings.getStringSlice('days');
  const times = settings.getStringSlice('time_slots');
  const usable = at > Date.now() && slot.date >= now.date && at - Date.now() < BOOKING_DAYS_AHEAD * 86400000
    && (!offered.length || offered.includes(days[slot.day]))
    && (!times.length || times.includes(slot.time));
  if (!usable) throw refuse('scheduled_at', 'slot_invalid', 'That date or time is not offered. Please pick another.');

  const c = controls(app);
  const booked = app.findRecordsByFilter('appointments_overview', 'scheduled_at = {:t} && app_status != "CANCELLED"', '', c.getInt('slot_capacity') + 1, 0, { t: when.string() });
  if (booked.length >= c.getInt('slot_capacity')) throw refuse('scheduled_at', 'slot_full', 'That time slot was just taken. Please choose another.');

  const mobile = record.getString('mobile_no');
  if (mobile) {
    const open = app.findRecordsByFilter('appointments_overview', `mobile_no = {:m} && scheduled_at >= {:t} && ${OPEN_FILTER}`, '', c.getInt('max_open_per_mobile') + 1, 0, { m: mobile, t: dbDate(Date.now()) });
    if (open.length >= c.getInt('max_open_per_mobile')) throw refuse('mobile_no', 'mobile_cap', 'This number already has several upcoming bookings. Please call or visit the clinic.');
  }

  const narrative = answers.G_caseFacts && answers.G_caseFacts.narrative;
  if (wordCount(narrative) > NARRATIVE_MAX_WORDS) throw refuse('json', 'narrative_long', `Please keep your description to ${NARRATIVE_MAX_WORDS} words.`);

  if (record.getUnsavedFiles('attachments').length) {
    if (!$os.getenv('TURNSTILE_SECRET') || settings.getStringSlice('hidden_fields').includes('attachments')) {
      throw refuse('attachments', 'uploads_off', 'File uploads are switched off. Please bring copies to your visit.');
    }
  }
}

// Has this mobile number been seen in the last 30 days (not counting `exceptId`)?
function recentSameMobile(app, mobile, exceptId) {
  if (!mobile) return false;
  const since = dbDate(Date.now() - 30 * 86400000);
  return !!firstOrNull(app, 'appointments', 'mobile_no = {:m} && created >= {:s} && id != {:id}', { m: mobile, s: since, id: exceptId || '' });
}

function fullSlots(app, month) {
  const [y, m] = month.split('-').map(Number);
  const next = new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 7);
  const rows = app.findRecordsByFilter('appointments_overview', 'scheduled_at >= {:a} && scheduled_at < {:b} && app_status != "CANCELLED"', '', 0, 0,
    { a: manilaToUTC(`${month}-01`), b: manilaToUTC(`${next}-01`) });
  const counts = {};
  for (const row of rows) {
    const s = manila(new Date(row.getDateTime('scheduled_at').time().unixMilli()));
    const key = `${s.date} ${s.time}`;
    counts[key] = (counts[key] || 0) + 1;
  }
  const capacity = controls(app).getInt('slot_capacity');
  const full = {};
  for (const [key, count] of Object.entries(counts)) {
    if (count < capacity) continue;
    const [date, time] = key.split(' ');
    (full[date] = full[date] || []).push(time);
  }
  return full;
}

// ---------- Annex C ----------

function activeIntake(app, appointmentId) {
  return firstOrNull(app, 'intake_requests', 'appointment_id = {:id} && voided = false', { id: appointmentId });
}

// Appointments from before Annex C came in don't need one.
function needsIntake(app, appointment) {
  return appointment.getDateTime('created').string() >= controls(app).getDateTime('gate_from').string();
}

// Throws if a newly assigned LSP or lawyer has been set to Inactive. `previous` = the latest status row, if any.
function checkAssignable(app, lspId, slId, previous) {
  if (lspId && lspId !== (previous ? previous.getString('lsp_id') : '')) {
    const lsp = firstOrNull(app, 'practitioners', 'id = {:id}', { id: lspId });
    if (lsp && lsp.getString('status') === 'inactive') throw refuse('lsp_id', 'lsp_inactive', 'This LSP is inactive (their semester has ended). Choose someone else, or move them to the current semester first.');
  }
  if (slId && slId !== (previous ? previous.getString('sl_id') : '')) {
    const lawyer = firstOrNull(app, 'lawyers', 'id = {:id}', { id: slId });
    if (lawyer && lawyer.getString('status') === 'inactive') throw refuse('sl_id', 'sl_inactive', 'This supervising lawyer is inactive. Choose someone else.');
  }
}

function latestStatus(app, appointmentId) {
  const rows = app.findRecordsByFilter('appointments_status', 'app_id = {:id}', '-created', 1, 0, { id: appointmentId });
  return rows.length ? rows[0] : null;
}

module.exports = {
  OPEN_FILTER, UNASSIGNED_FILTER, NO_INTAKE_FILTER, manila, manilaToUTC, dbDate, text, list, normalizeMobile, jsonOf, refuse, firstOrNull, controls, allocate,
  userName, audit, diff, sendAlert, urgencyOf, checkVisitorBooking, recentSameMobile, fullSlots,
  activeIntake, needsIntake, checkAssignable, latestStatus,
};
