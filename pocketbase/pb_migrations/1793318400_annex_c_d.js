/// <reference path="../pb_data/types.d.ts" />

/*
 * SNMC Law Legal Clinic: database changes for Annex C (staff intake) and Annex D (online request).
 * Adds only: nothing is removed or renamed, and existing records keep working.
 *
 *   appointments          + attachments, and client_urgent / urgent_deadline / possible_duplicate (set by the server)
 *   site_settings         + hotline (Annex D's emergency notice)
 *   intake_settings       file uploads are switched off until the spam check is live
 *   intake_requests       NEW: Annex C. Every one has exactly one appointment.
 *   paper_forms           NEW: numbers issued for paper forms
 *   intake_controls       NEW: one record, reference numbers and safeguard limits
 *   audit_log             NEW: who changed what
 *   appointments_overview + the Annex C columns
 *
 * New collections can only be changed through pb_hooks (createRule etc. are null = superusers only), so nobody can
 * get around the rules by talking to the API directly.
 *
 * Install on the PocketBase server (README → "Installing the server files"): copy this folder next to `pb_data` and
 * restart PocketBase. It runs once, by itself.
 */
const CLINIC_STAFF = '@request.auth.collectionName = "users" && @request.auth.verified = true';
const CLINIC_ADMIN = `${CLINIC_STAFF} && @request.auth.role = "admin"`;

const clinicStamps = () => [
  { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
  { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
];

// Every appointment with its latest status and assignment: the query from before this migration, with the Annex C
// columns added (from the appointment's intake that hasn't been voided). Without them it's the original, for the undo.
// urgency_rank is for sorting, most urgent first: staff's assessment decides; until there is one, a client who says it's
// urgent goes to the top, and one not yet looked at goes above anything staff have assessed as Low.
const clinicOverviewQuery = (annexColumns) => `SELECT
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
  a.possible_duplicate AS possible_duplicate,
  i.id AS intake_id,
  i.urgency AS urgency,
  i.disposition AS disposition,
  i.received_at AS received_at,
  i.encoded_late AS encoded_late,
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

migrate((app) => {
  // ---------- Existing collections ----------
  const appointments = app.findCollectionByNameOrId('appointments');
  appointments.fields.add(new FileField({
    name: 'attachments', maxSelect: 5, maxSize: 5 * 1024 * 1024, protected: true,
    mimeTypes: ['application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'],
  }));
  appointments.fields.add(new BoolField({ name: 'client_urgent' }));
  appointments.fields.add(new DateField({ name: 'urgent_deadline' }));
  appointments.fields.add(new BoolField({ name: 'possible_duplicate' }));
  app.save(appointments);

  const site = app.findCollectionByNameOrId('site_settings');
  site.fields.add(new TextField({ name: 'hotline', max: 60 }));
  app.save(site);

  const intakeSettings = app.findFirstRecordByFilter('intake_settings', "id != ''");
  const hidden = JSON.parse(toString(intakeSettings.get('hidden_fields')) || '[]') || [];
  if (!hidden.includes('attachments')) intakeSettings.set('hidden_fields', [...hidden, 'attachments']);
  const required = JSON.parse(toString(intakeSettings.get('required_fields')) || '[]') || [];
  if (!required.includes('urgencyFlags')) intakeSettings.set('required_fields', [...required, 'urgencyFlags']);
  app.save(intakeSettings);

  // ---------- Annex C ----------
  const users = app.findCollectionByNameOrId('users');
  const requests = new Collection({
    type: 'base', name: 'intake_requests', listRule: CLINIC_STAFF, viewRule: CLINIC_STAFF, createRule: null, updateRule: null, deleteRule: null,
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
      { name: 'received_at', type: 'date', required: true },
      { name: 'source', type: 'select', required: true, maxSelect: 1, values: ['DIGITAL', 'PAPER'] },
      { name: 'paper_ref_written', type: 'text', max: 60 },
      { name: 'unissued_paper', type: 'bool' },
      { name: 'encoded_late', type: 'bool' },
      { name: 'late_reason', type: 'text', max: 500 },
      { name: 'voided', type: 'bool' },
      { name: 'void_reason', type: 'text', max: 500 },
      { name: 'json', type: 'json' },
      ...clinicStamps(),
    ],
    indexes: [
      // Voiding an intake lets the appointment be received again, under the same reference.
      'CREATE UNIQUE INDEX idx_intake_requests_appointment ON intake_requests (appointment_id) WHERE voided = FALSE',
      'CREATE UNIQUE INDEX idx_intake_requests_reference ON intake_requests (reference) WHERE voided = FALSE',
      'CREATE INDEX idx_intake_requests_received ON intake_requests (date_received)',
    ],
  });
  app.save(requests);

  const paper = new Collection({
    type: 'base', name: 'paper_forms', listRule: CLINIC_STAFF, viewRule: CLINIC_STAFF, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: 'reference', type: 'text', required: true, max: 40 },
      { name: 'status', type: 'select', required: true, maxSelect: 1, values: ['ISSUED', 'ENCODED', 'VOID'] },
      { name: 'issued_by', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'issued_by_name', type: 'text', max: 200 },
      { name: 'intake_id', type: 'relation', collectionId: requests.id, maxSelect: 1, cascadeDelete: false },
      { name: 'void_reason', type: 'text', max: 500 },
      ...clinicStamps(),
    ],
    indexes: ['CREATE UNIQUE INDEX idx_paper_forms_reference ON paper_forms (reference)'],
  });
  app.save(paper);

  // ---------- Reference numbers and limits ----------
  const controls = new Collection({
    type: 'base', name: 'intake_controls', listRule: CLINIC_STAFF, viewRule: CLINIC_STAFF, createRule: null, updateRule: CLINIC_ADMIN, deleteRule: null,
    fields: [
      { name: 'ref_prefix', type: 'text', required: true, max: 12, pattern: '^[A-Z0-9]+$' },
      { name: 'ref_year', type: 'number', onlyInt: true },
      { name: 'ref_next', type: 'number', required: true, onlyInt: true, min: 1 },
      { name: 'ref_paper_next', type: 'number', required: true, onlyInt: true, min: 1 },
      { name: 'late_days', type: 'number', onlyInt: true, min: 0, max: 60 },
      { name: 'slot_capacity', type: 'number', required: true, onlyInt: true, min: 1, max: 50 },
      { name: 'max_open_per_mobile', type: 'number', required: true, onlyInt: true, min: 1, max: 50 },
      { name: 'alert_emails', type: 'text', max: 500 },
      { name: 'gate_from', type: 'date', required: true },
      ...clinicStamps(),
    ],
  });
  app.save(controls);

  const manilaYear = new Date(Date.now() + 8 * 60 * 60 * 1000).getUTCFullYear();
  const controlRecord = new Record(controls);
  controlRecord.load({
    ref_prefix: 'SNMC', ref_year: manilaYear, ref_next: 1, ref_paper_next: 1, late_days: 3, slot_capacity: 1, max_open_per_mobile: 3,
    alert_emails: '', gate_from: new Date().toISOString().replace('T', ' '), // appointments older than this are exempt from the Annex C gate
  });
  app.save(controlRecord);

  // ---------- Audit log ----------
  const auditLog = new Collection({
    type: 'base', name: 'audit_log', listRule: CLINIC_STAFF, viewRule: CLINIC_STAFF, createRule: null, updateRule: null, deleteRule: null,
    fields: [
      { name: 'target_collection', type: 'text', required: true, max: 60 },
      { name: 'target_id', type: 'text', max: 40 },
      { name: 'target_reference', type: 'text', max: 60 },
      { name: 'action', type: 'text', required: true, max: 40 },
      { name: 'user_id', type: 'relation', collectionId: users.id, maxSelect: 1, cascadeDelete: false },
      { name: 'user_name', type: 'text', max: 200 },
      { name: 'changes', type: 'json' },
      ...clinicStamps(),
    ],
    indexes: ['CREATE INDEX idx_audit_log_target ON audit_log (target_id)'],
  });
  app.save(auditLog);

  // ---------- The list every staff page reads ----------
  const overview = app.findCollectionByNameOrId('appointments_overview');
  overview.viewQuery = clinicOverviewQuery(true);
  app.save(overview);
}, (app) => {
  const overview = app.findCollectionByNameOrId('appointments_overview');
  overview.viewQuery = clinicOverviewQuery(false);
  app.save(overview);

  for (const name of ['audit_log', 'intake_controls', 'paper_forms', 'intake_requests']) app.delete(app.findCollectionByNameOrId(name));

  const site = app.findCollectionByNameOrId('site_settings');
  site.fields.removeByName('hotline');
  app.save(site);

  const appointments = app.findCollectionByNameOrId('appointments');
  for (const name of ['attachments', 'client_urgent', 'urgent_deadline', 'possible_duplicate']) appointments.fields.removeByName(name);
  app.save(appointments);
});
