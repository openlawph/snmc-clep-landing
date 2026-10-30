/// <reference path="../pb_data/types.d.ts" />

/*
 * SNMC Law Legal Clinic: the rules that hold even if someone skips the website.
 *  - status changes: In progress / Done need a received Annex C, and so on
 *  - settings: counters can't go backwards, uploads can't be switched on without the spam check
 *  - audit log: every change and delete on the records that matter
 *
 * Install: README → "Installing the server files".
 */

// ---------- Status changes ----------
onRecordCreateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next();
  const lib = require(`${__hooks}/clinic-lib.js`);

  const status = e.record.getString('app_status').trim();
  const appointmentId = e.record.getString('app_id');
  const appointment = lib.firstOrNull(e.app, 'appointments', 'id = {:id}', { id: appointmentId });
  if (!appointment) return e.next(); // PocketBase reports the bad relation itself

  const intake = lib.activeIntake(e.app, appointmentId);
  const gated = lib.needsIntake(e.app, appointment);
  if ((status === 'WIP' || status === 'DONE') && gated && !intake) {
    throw lib.refuse('app_status', 'needs_intake', 'Receive the intake (Annex C) first. Open the appointment and press "Receive intake".');
  }
  if (status === 'DONE' && gated && !(intake && intake.getString('disposition') === 'IMMEDIATE_REFERRAL')) {
    if (!e.record.getString('lsp_id') || !e.record.getString('sl_id')) {
      throw lib.refuse('app_status', 'needs_assignment', 'Assign an LSP and a supervising lawyer before marking this as done.');
    }
  }
  if (status === 'CANCELLED' && !e.record.getString('remarks').trim()) {
    throw lib.refuse('remarks', 'needs_reason', 'Add a remark saying why this is being cancelled.');
  }
  lib.checkAssignable(e.app, e.record.getString('lsp_id'), e.record.getString('sl_id'), lib.latestStatus(e.app, appointmentId));
  e.next();
}, 'appointments_status');

// ---------- Reference numbers and limits ----------
onRecordUpdateRequest((e) => {
  if (e.hasSuperuserAuth()) return e.next(); // the way out if a counter ever really has to be corrected
  const lib = require(`${__hooks}/clinic-lib.js`);
  const before = e.record.original();
  // Forward only: the numbers below have been given out already.
  if (e.record.getInt('ref_next') < before.getInt('ref_next')) {
    throw lib.refuse('ref_next', 'ref_backwards', `The next number can't go below ${before.getInt('ref_next')}: lower numbers are already in use.`);
  }
  if (e.record.getInt('ref_paper_next') < before.getInt('ref_paper_next')) {
    throw lib.refuse('ref_paper_next', 'ref_backwards', `The next paper number can't go below ${before.getInt('ref_paper_next')}: lower numbers are already in use.`);
  }
  e.record.set('ref_year', before.getInt('ref_year'));
  e.record.set('gate_from', before.get('gate_from'));
  e.next();
}, 'intake_controls');

// Anonymous uploads without the spam check could fill the server's disk.
onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/clinic-lib.js`);
  const hiddenBefore = e.record.original().getStringSlice('hidden_fields');
  const turningOn = hiddenBefore.includes('attachments') && !e.record.getStringSlice('hidden_fields').includes('attachments');
  if (turningOn && !$os.getenv('TURNSTILE_SECRET')) {
    throw lib.refuse('hidden_fields', 'uploads_need_turnstile', 'File uploads can\'t be turned on until the spam check (Turnstile) is set up on the server.');
  }
  e.next();
}, 'intake_settings');

// ---------- Audit log ----------
onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/clinic-lib.js`);
  const changes = lib.diff(e.record.original(), e.record);
  e.next();
  if (Object.keys(changes).length) lib.audit(e.app, e.auth, 'update', e.record.collection().name, e.record.id, e.record.getString('reference'), changes);
}, 'appointments', 'appointments_status', 'intake_controls', 'intake_settings', 'site_settings');

onRecordDeleteRequest((e) => {
  const lib = require(`${__hooks}/clinic-lib.js`);
  const snapshot = JSON.parse(JSON.stringify(e.record));
  e.next();
  lib.audit(e.app, e.auth, 'delete', e.record.collection().name, e.record.id, snapshot.reference || '', snapshot);
}, 'appointments', 'appointments_status');
