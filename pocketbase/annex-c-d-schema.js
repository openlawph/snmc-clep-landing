/*
 * SNMC Law Legal Clinic: database changes for Annex C (staff intake) and Annex D (online request).
 * Goes through PocketBase's API, so nothing has to be copied to the server. The rules that must hold even for someone
 * skipping the website are API rules and views here, because those need no server files.
 *
 * How to run: take a backup (PocketBase admin → Settings → Backups), stay on that page, press F12 → Console, paste this
 * whole file, press Enter, then:
 *
 *   await clinicSchema().apply()    adds everything. Safe to run again.
 *   await clinicSchema().undo()     takes it all out. Refuses once an Annex C has been filed: restore the backup instead.
 *
 *   appointments          + client_urgent, urgent_deadline (from the form), not_duplicate (staff say it's someone else)
 *                         + the booking rules below; the reference and the urgency answers can't be edited afterwards
 *   appointments_status   + the status rules below
 *   appointments_overview + the Annex C columns, and two the database works out so nobody can fake them:
 *                           possible_duplicate and encoded_late
 *   site_settings         + hotline (Annex D's emergency notice)
 *   intake_settings       urgency becomes required; file uploads stay off (they need the spam check on the server)
 *   intake_requests       NEW: Annex C. Every one has exactly one appointment. Can't be edited, only voided by an admin.
 *   paper_forms           NEW: numbers issued for paper forms
 *   intake_controls       NEW: one record, reference numbers and limits
 *   audit_log             NEW: who changed what. The pages write it; nobody can edit it, or sign someone else's name.
 *   appointment_slots_full, appointment_times_offered, appointment_mobile_limit, appointments_received, appointments_close_free
 *                         NEW: views the rules read. Only the first is public, and it has no personal data.
 *   Settings              the Batch API is switched on, so a page's changes are saved together or not at all
 */
function clinicSchema({ api = location.origin, token } = {}) {
  const auth = token || JSON.parse(localStorage.getItem('__pb_superusers__/_') || localStorage.getItem('pocketbase_auth') || '{}').token;

  const STAFF = '@request.auth.collectionName = "users" && @request.auth.verified = true';
  const ADMIN = `${STAFF} && @request.auth.role = "admin"`;
  const unset = (...names) => names.map((name) => `@request.body.${name}:isset = false`).join(' && ');
  const signedBy = (id, name) => `${id} = @request.auth.id && (${name} = @request.auth.name || ${name} = @request.auth.email)`;

  const stamps = () => [
    { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
    { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
  ];

  // ---------- What's on the server before this runs (apply checks it's still so, undo puts it back) ----------

  const BEFORE = {
    appointmentsCreate: `// Signed-in staff can always book (walk-ins added on the dashboard, tests from the public form).
@request.auth.collectionName = "users" || (
  // Visitors: only while maintenance mode is off (Site Settings)…
  @collection.site_settings.maintenance ?= false &&
  // …and during the online booking hours set in Site Settings: intake_days, from intake_open until intake_close.
  // Those are Manila times; @now is UTC, so the clock is moved 8 hours ahead (Manila has no daylight saving).
  @collection.site_settings.intake_open ?<= strftime('%H:%M', @now, '+8 hours') &&
  @collection.site_settings.intake_close ?> strftime('%H:%M', @now, '+8 hours') && (
    // %w = day of the week in Manila, 0 = Sunday
    (strftime('%w', @now, '+8 hours') = '1' && @collection.site_settings.intake_days:each ?= 'mon') ||
    (strftime('%w', @now, '+8 hours') = '2' && @collection.site_settings.intake_days:each ?= 'tue') ||
    (strftime('%w', @now, '+8 hours') = '3' && @collection.site_settings.intake_days:each ?= 'wed') ||
    (strftime('%w', @now, '+8 hours') = '4' && @collection.site_settings.intake_days:each ?= 'thu') ||
    (strftime('%w', @now, '+8 hours') = '5' && @collection.site_settings.intake_days:each ?= 'fri') ||
    (strftime('%w', @now, '+8 hours') = '6' && @collection.site_settings.intake_days:each ?= 'sat') ||
    (strftime('%w', @now, '+8 hours') = '0' && @collection.site_settings.intake_days:each ?= 'sun')
  )
)`,
    appointmentsUpdate: STAFF,
    statusCreate: `${STAFF} && @request.body.user_id = @request.auth.id`,
  };

  // ---------- Rules ----------

  const dayOffered = (number, key) => `(strftime('%w', scheduled_at, '+8 hours') = '${number}' && @collection.intake_settings.days:each ?= '${key}')`;

  // What a visitor's booking has to be. A refused rule only says "Failed to create record", so the form works out which
  // of these it was and says so (sendRequest in intake.js).
  const APPOINTMENTS_CREATE = BEFORE.appointmentsCreate.replace(/\n\)$/, ` &&
  // …for a time the form offers: ahead of now, within 100 days, on an open day, at an offered time…
  scheduled_at > @now && scheduled_at < strftime('%Y-%m-%d', @now, '+100 days') &&
  @collection.appointment_times_offered.slot ?= strftime('%H:%M', scheduled_at, '+8 hours') && (
    ${dayOffered(1, 'mon')} || ${dayOffered(2, 'tue')} || ${dayOffered(3, 'wed')} ||
    ${dayOffered(4, 'thu')} || ${dayOffered(5, 'fri')} || ${dayOffered(6, 'sat')}
  ) &&
  // …that isn't full (Intake Settings: clients per time slot)…
  @collection.appointment_slots_full.scheduled_at != scheduled_at &&
  // …from a number without too many upcoming bookings (Intake Settings: open bookings per mobile number)…
  (mobile_no = "" || @collection.appointment_mobile_limit.mobile_no != mobile_no) &&
  // …with a reference, and nothing that's only for staff.
  reference != "" && ${unset('not_duplicate')}
)`);

  // Staff can correct the details. A reference stays as it was, except giving one to an old booking that has none.
  const APPOINTMENTS_UPDATE = `${STAFF} &&
(@request.body.reference:isset = false || @request.body.reference = reference || reference = "") &&
${unset('client_urgent', 'urgent_deadline')}`;

  // An inactive LSP or lawyer can't be newly assigned; someone already on the case stays until they're replaced.
  const assignable = (field) => `(${field} = "" || ${field}.status != "inactive" ||
  (@collection.appointments_overview:current.id ?= app_id && @collection.appointments_overview:current.${field} ?= ${field}))`;

  const STATUS_CREATE = `${BEFORE.statusCreate} &&
// In progress and Done need a received Annex C. Appointments from before Annex C came in don't.
((app_status != "WIP" && app_status != "DONE") || @collection.appointments_received.id ?= app_id) &&
// Done needs an LSP and a lawyer, unless it's an immediate referral.
(app_status != "DONE" || (lsp_id != "" && sl_id != "") || @collection.appointments_close_free.id ?= app_id) &&
// Cancelled needs a reason.
(app_status != "CANCELLED" || remarks != "") &&
${assignable('lsp_id')} &&
${assignable('sl_id')}`;

  // Staff only ever move a counter forward (taking numbers); admins can also change the limits. The year is the one
  // exception: a new year starts the numbers again at 1.
  const CONTROLS_UPDATE = `${STAFF} && ${unset('gate_from')} &&
(@request.body.ref_year:isset = false || @request.body.ref_year > ref_year) &&
(@request.body.ref_next:isset = false || @request.body.ref_next > ref_next || @request.body.ref_year > ref_year) &&
(@request.body.ref_paper_next:isset = false || @request.body.ref_paper_next > ref_paper_next || @request.body.ref_year > ref_year) &&
(@request.auth.role = "admin" || (${unset('ref_prefix', 'late_days', 'slot_capacity', 'max_open_per_mobile')}))`;

  const INTAKE_CREATE = `${STAFF} && ${signedBy('received_by', 'received_by_name')} &&
voided = false && void_reason = "" && date_received <= @now && appointment_id.reference = reference`;

  // An Annex C can't be edited, only voided: the record stays, with the reason.
  const INTAKE_UPDATE = `${ADMIN} && voided = false && @request.body.voided = true && @request.body.void_reason != "" &&
${unset('reference', 'appointment_id', 'date_received', 'contact_mode', 'contact_mode_other', 'full_name', 'address', 'mobile_no', 'email',
    'urgency', 'disposition', 'disposition_other', 'received_by', 'received_by_name', 'source', 'paper_ref_written', 'unissued_paper', 'late_reason', 'json')}`;

  const PAPER_CREATE = `${STAFF} && ${signedBy('issued_by', 'issued_by_name')} && status = "ISSUED" && intake_id = "" && void_reason = ""`;
  const PAPER_UPDATE = `status = "ISSUED" && ${unset('reference', 'issued_by', 'issued_by_name')} && (
  (${STAFF} && @request.body.status = "ENCODED" && @request.body.intake_id != "" && ${unset('void_reason')}) ||
  (${ADMIN} && @request.body.status = "VOID" && @request.body.void_reason != "" && ${unset('intake_id')})
)`;

  const AUDIT_CREATE = `${STAFF} && ${signedBy('user_id', 'user_name')}`;

  // ---------- Views ----------

  // The latest status of appointment `a`.
  const LATEST_STATUS = "COALESCE((SELECT TRIM(st.app_status) FROM appointments_status st WHERE st.app_id = a.id ORDER BY st.created DESC LIMIT 1), 'PENDING')";

  // time_slots is a JSON list, which a rule can't look inside: this turns it into rows.
  const TIMES_OFFERED = `SELECT (ROW_NUMBER() OVER ()) AS id, CAST(j.value AS TEXT) AS slot
FROM intake_settings s, json_each(s.time_slots) j`;

  const SLOTS_FULL = `SELECT (ROW_NUMBER() OVER ()) AS id, a.scheduled_at AS scheduled_at
FROM appointments a
WHERE a.scheduled_at != '' AND ${LATEST_STATUS} != 'CANCELLED'
GROUP BY a.scheduled_at
HAVING COUNT(*) >= (SELECT slot_capacity FROM intake_controls LIMIT 1)`;

  const MOBILE_LIMIT = `SELECT (ROW_NUMBER() OVER ()) AS id, a.mobile_no AS mobile_no
FROM appointments a
WHERE a.mobile_no != '' AND a.scheduled_at >= strftime('%Y-%m-%d %H:%M:%fZ', 'now') AND ${LATEST_STATUS} NOT IN ('DONE', 'CANCELLED')
GROUP BY a.mobile_no
HAVING COUNT(*) >= (SELECT max_open_per_mobile FROM intake_controls LIMIT 1)`;

  const beforeGate = 'a.created < (SELECT gate_from FROM intake_controls LIMIT 1)';
  const RECEIVED = `SELECT a.id AS id FROM appointments a
WHERE ${beforeGate} OR EXISTS (SELECT 1 FROM intake_requests i WHERE i.appointment_id = a.id AND i.voided = FALSE)`;
  const CLOSE_FREE = `SELECT a.id AS id FROM appointments a
WHERE ${beforeGate} OR EXISTS (SELECT 1 FROM intake_requests i WHERE i.appointment_id = a.id AND i.voided = FALSE AND i.disposition = 'IMMEDIATE_REFERRAL')`;

  // Every appointment with its latest status and assignment: the query from before this, with the Annex C columns added
  // (from the appointment's intake that hasn't been voided). Without them it's the original, for the undo.
  // urgency_rank is for sorting, most urgent first: staff's assessment decides; until there is one, a client who says it's
  // urgent goes to the top, and one not yet looked at goes above anything staff have assessed as Low.
  const overviewQuery = (annexColumns) => `SELECT
  a.id AS id,
  a.reference AS reference,
  a.title AS title,
  a.email AS email,
  a.mobile_no AS mobile_no,
  a.scheduled_at AS scheduled_at,
  a.created AS created,
  COALESCE(TRIM(s.app_status), 'PENDING') AS app_status,
  s.remarks AS remarks,
  s.lsp_id AS lsp_id,
  s.sl_id AS sl_id,
  (p.fname || ' ' || p.lname) AS lsp_name,
  (l.fname || ' ' || l.lname) AS sl_name,
  s.created AS status_updated${annexColumns ? `,
  a.client_urgent AS client_urgent,
  a.urgent_deadline AS urgent_deadline,
  CAST(CASE WHEN a.mobile_no != '' AND a.not_duplicate = FALSE AND EXISTS (
    SELECT 1 FROM appointments o WHERE o.mobile_no = a.mobile_no AND o.id != a.id AND o.created < a.created AND o.created >= datetime(a.created, '-30 days')
  ) THEN 1 ELSE 0 END AS BOOLEAN) AS possible_duplicate,
  i.id AS intake_id,
  i.urgency AS urgency,
  i.disposition AS disposition,
  i.received_at AS received_at,
  CAST(CASE WHEN i.id IS NOT NULL AND julianday(date(i.received_at, '+8 hours')) - julianday(date(i.date_received, '+8 hours')) > (SELECT late_days FROM intake_controls LIMIT 1)
    THEN 1 ELSE 0 END AS BOOLEAN) AS encoded_late,
  i.source AS intake_source,
  i.paper_ref_written AS paper_ref_written,
  CAST(CASE
    WHEN i.urgency = 'HIGH' THEN 0
    WHEN i.urgency = 'MEDIUM' THEN 1
    WHEN i.urgency = 'LOW' THEN 3
    WHEN a.client_urgent = TRUE THEN 0
    ELSE 2
  END AS INT) AS urgency_rank` : ''}
FROM appointments a
LEFT JOIN (
  SELECT st.app_id, st.app_status, st.remarks, st.lsp_id, st.sl_id, st.created,
         ROW_NUMBER() OVER (PARTITION BY st.app_id ORDER BY st.created DESC) AS rn
  FROM appointments_status st
) s ON s.app_id = a.id AND s.rn = 1
LEFT JOIN practitioners p ON p.id = s.lsp_id
LEFT JOIN lawyers l ON l.id = s.sl_id${annexColumns ? `
LEFT JOIN intake_requests i ON i.appointment_id = a.id AND i.voided = FALSE` : ''}`;

  // ---------- Talking to PocketBase ----------

  async function call(method, path, body) {
    const res = await fetch(api + path, {
      method,
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw Object.assign(new Error(`${method} ${path}: ${res.status} ${JSON.stringify(json)}`), { status: res.status, json });
    return json;
  }
  const collection = (name) => call('GET', `/api/collections/${name}`).catch((err) => { if (err.status === 404) return null; throw err; });
  const patch = (name, body) => call('PATCH', `/api/collections/${name}`, body);
  const firstRecord = async (name) => (await call('GET', `/api/collections/${name}/records?perPage=1`)).items[0];
  const sameRule = (a, b) => String(a || '').replace(/\s+/g, ' ').trim() === String(b || '').replace(/\s+/g, ' ').trim();

  async function addFields(name, fields) {
    const current = await collection(name);
    const missing = fields.filter((f) => !current.fields.some((have) => have.name === f.name));
    if (missing.length) await patch(name, { fields: [...current.fields, ...missing] });
  }

  async function create(definition) {
    if (await collection(definition.name)) return false;
    await call('POST', '/api/collections', definition);
    return true;
  }

  // ---------- Adding ----------

  async function apply() {
    const [appointments, status, users] = await Promise.all([collection('appointments'), collection('appointments_status'), collection('users')]);
    const already = sameRule(appointments.createRule, APPOINTMENTS_CREATE);
    if (!already && !sameRule(appointments.createRule, BEFORE.appointmentsCreate)) throw new Error('The appointments create rule has been changed since this was written. Check it before running this.');
    if (!sameRule(status.createRule, BEFORE.statusCreate) && !sameRule(status.createRule, STATUS_CREATE)) throw new Error('The appointments_status create rule has been changed since this was written. Check it before running this.');

    await call('PATCH', '/api/settings', { batch: { enabled: true, maxRequests: 60, timeout: 5, maxBodySize: 0 } });

    await addFields('appointments', [
      { name: 'client_urgent', type: 'bool' },
      { name: 'urgent_deadline', type: 'date' },
      { name: 'not_duplicate', type: 'bool' },
    ]);
    await addFields('site_settings', [{ name: 'hotline', type: 'text', max: 60 }]);

    const settings = await firstRecord('intake_settings');
    const hidden = settings.hidden_fields || [];
    const required = settings.required_fields || [];
    await call('PATCH', `/api/collections/intake_settings/records/${settings.id}`, {
      hidden_fields: hidden.includes('attachments') ? hidden : [...hidden, 'attachments'],
      required_fields: required.includes('urgencyFlags') ? required : [...required, 'urgencyFlags'],
    });

    await create({
      type: 'base', name: 'intake_requests', listRule: STAFF, viewRule: STAFF, createRule: INTAKE_CREATE, updateRule: INTAKE_UPDATE, deleteRule: null,
      fields: [
        { name: 'reference', type: 'text', required: true, max: 40 },
        { name: 'appointment_id', type: 'relation', required: true, collectionId: appointments.id, maxSelect: 1, cascadeDelete: false },
        { name: 'date_received', type: 'date', required: true },
        { name: 'contact_mode', type: 'select', required: true, maxSelect: 1, values: ['WALK_IN', 'TELEPHONE', 'EMAIL', 'ONLINE', 'REFERRAL', 'OUTREACH', 'OTHER'] },
        { name: 'contact_mode_other', type: 'text', max: 200 },
        { name: 'full_name', type: 'text', required: true, max: 200 },
        { name: 'address', type: 'text', max: 500 },
        { name: 'mobile_no', type: 'text', max: 20 },
        { name: 'email', type: 'email' },
        { name: 'urgency', type: 'select', required: true, maxSelect: 1, values: ['HIGH', 'MEDIUM', 'LOW'] },
        { name: 'disposition', type: 'select', required: true, maxSelect: 1, values: ['REGISTRATION', 'IMMEDIATE_REFERRAL', 'EMERGENCY', 'INTERVIEW', 'OTHER'] },
        { name: 'disposition_other', type: 'text', max: 200 },
        // A snapshot of the name too: LSP accounts are removed when they leave, and the record has to keep saying who it was.
        { name: 'received_by', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        { name: 'received_by_name', type: 'text', max: 200 },
        { name: 'source', type: 'select', required: true, maxSelect: 1, values: ['DIGITAL', 'PAPER'] },
        { name: 'paper_ref_written', type: 'text', max: 60 },
        { name: 'unissued_paper', type: 'bool' },
        { name: 'late_reason', type: 'text', max: 500 },
        { name: 'voided', type: 'bool' },
        { name: 'void_reason', type: 'text', max: 500 },
        { name: 'json', type: 'json' },
        // The server's clock, so nobody can backdate when it was really filed.
        { name: 'received_at', type: 'autodate', onCreate: true, onUpdate: false },
        ...stamps(),
      ],
      indexes: [
        // Voiding an intake lets the appointment be received again, under the same reference.
        'CREATE UNIQUE INDEX idx_intake_requests_appointment ON intake_requests (appointment_id) WHERE voided = FALSE',
        'CREATE UNIQUE INDEX idx_intake_requests_reference ON intake_requests (reference) WHERE voided = FALSE',
        'CREATE INDEX idx_intake_requests_received ON intake_requests (date_received)',
      ],
    });
    const requests = await collection('intake_requests');

    await create({
      type: 'base', name: 'paper_forms', listRule: STAFF, viewRule: STAFF, createRule: PAPER_CREATE, updateRule: PAPER_UPDATE, deleteRule: null,
      fields: [
        { name: 'reference', type: 'text', required: true, max: 40 },
        { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['ISSUED', 'ENCODED', 'VOID'] },
        { name: 'issued_by', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        { name: 'issued_by_name', type: 'text', max: 200 },
        { name: 'intake_id', type: 'relation', collectionId: requests.id, maxSelect: 1, cascadeDelete: false },
        { name: 'void_reason', type: 'text', max: 500 },
        ...stamps(),
      ],
      indexes: ['CREATE UNIQUE INDEX idx_paper_forms_reference ON paper_forms (reference)'],
    });

    const madeControls = await create({
      type: 'base', name: 'intake_controls', listRule: STAFF, viewRule: STAFF, createRule: null, updateRule: CONTROLS_UPDATE, deleteRule: null,
      fields: [
        { name: 'ref_prefix', type: 'text', required: true, max: 12, pattern: '^[A-Z0-9]+$' },
        { name: 'ref_year', type: 'number', onlyInt: true },
        { name: 'ref_next', type: 'number', required: true, onlyInt: true, min: 1 },
        { name: 'ref_paper_next', type: 'number', required: true, onlyInt: true, min: 1 },
        { name: 'late_days', type: 'number', onlyInt: true, min: 0, max: 60 },
        { name: 'slot_capacity', type: 'number', required: true, onlyInt: true, min: 1, max: 50 },
        { name: 'max_open_per_mobile', type: 'number', required: true, onlyInt: true, min: 1, max: 50 },
        { name: 'gate_from', type: 'date', required: true },
        ...stamps(),
      ],
    });
    if (madeControls) {
      await call('POST', '/api/collections/intake_controls/records', {
        ref_prefix: 'SNMC', ref_year: new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCFullYear(), ref_next: 1, ref_paper_next: 1,
        late_days: 3, slot_capacity: 1, max_open_per_mobile: 3,
        gate_from: new Date().toISOString().replace('T', ' '), // appointments older than this are exempt from the Annex C gate
      });
    }

    await create({
      type: 'base', name: 'audit_log', listRule: STAFF, viewRule: STAFF, createRule: AUDIT_CREATE, updateRule: null, deleteRule: null,
      fields: [
        { name: 'target_collection', type: 'text', required: true, max: 60 },
        { name: 'target_id', type: 'text', max: 40 },
        { name: 'target_reference', type: 'text', max: 60 },
        { name: 'action', type: 'text', required: true, max: 40 },
        { name: 'user_id', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
        { name: 'user_name', type: 'text', max: 200 },
        { name: 'changes', type: 'json' },
        ...stamps(),
      ],
      indexes: ['CREATE INDEX idx_audit_log_target ON audit_log (target_id)'],
    });

    // Public, for the booking calendar: when, and nothing about who.
    await create({ type: 'view', name: 'appointment_slots_full', listRule: '', viewRule: '', viewQuery: SLOTS_FULL });
    // Only the rules read these (rules aren't held back by a collection's own list rule).
    await create({ type: 'view', name: 'appointment_times_offered', listRule: null, viewRule: null, viewQuery: TIMES_OFFERED });
    await create({ type: 'view', name: 'appointment_mobile_limit', listRule: null, viewRule: null, viewQuery: MOBILE_LIMIT });
    await create({ type: 'view', name: 'appointments_received', listRule: null, viewRule: null, viewQuery: RECEIVED });
    await create({ type: 'view', name: 'appointments_close_free', listRule: null, viewRule: null, viewQuery: CLOSE_FREE });

    await patch('appointments_overview', { viewQuery: overviewQuery(true) });
    await patch('appointments', { createRule: APPOINTMENTS_CREATE, updateRule: APPOINTMENTS_UPDATE });
    await patch('appointments_status', { createRule: STATUS_CREATE });
    return 'Applied.';
  }

  // ---------- Taking it out ----------

  async function undo() {
    const requests = await collection('intake_requests');
    if (requests) {
      const { totalItems } = await call('GET', '/api/collections/intake_requests/records?perPage=1&fields=id');
      if (totalItems) throw new Error(`${totalItems} Annex C record(s) have been filed. Restore the backup instead of undoing this.`);
    }
    await patch('appointments', { createRule: BEFORE.appointmentsCreate, updateRule: BEFORE.appointmentsUpdate });
    await patch('appointments_status', { createRule: BEFORE.statusCreate });
    await patch('appointments_overview', { viewQuery: overviewQuery(false) });
    for (const name of ['appointments_close_free', 'appointments_received', 'appointment_mobile_limit', 'appointment_times_offered', 'appointment_slots_full', 'audit_log', 'intake_controls', 'paper_forms', 'intake_requests']) {
      if (await collection(name)) await call('DELETE', `/api/collections/${name}`);
    }
    const drop = async (name, fields) => {
      const current = await collection(name);
      await patch(name, { fields: current.fields.filter((f) => !fields.includes(f.name)) });
    };
    const settings = await firstRecord('intake_settings');
    await call('PATCH', `/api/collections/intake_settings/records/${settings.id}`, { required_fields: (settings.required_fields || []).filter((key) => key !== 'urgencyFlags') });
    await drop('site_settings', ['hotline']);
    await drop('appointments', ['client_urgent', 'urgent_deadline', 'not_duplicate']);
    return 'Undone. The Batch API is still on; it does nothing by itself.';
  }

  return { apply, undo };
}
if (typeof module !== 'undefined') module.exports = clinicSchema;
