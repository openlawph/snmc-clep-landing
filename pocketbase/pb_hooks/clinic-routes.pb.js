/// <reference path="../pb_data/types.d.ts" />

/*
 * SNMC Law Legal Clinic: server routes for intake (Annex C), paper form numbers and booked slots.
 * `intake_requests` and `paper_forms` have no write rules, so these are the only way to change them.
 *
 * Install: README → "Installing the server files".
 */

// Which time slots are full in a month, e.g. { full: { '2026-11-03': ['13:00'] } }. Public: the booking calendar uses
// it, and it says nothing about who booked.
routerAdd('GET', '/api/clinic/slots', (e) => {
  const lib = require(`${__hooks}/clinic-lib.js`);
  const month = String(e.request.url.query().get('month') || '');
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw lib.refuse('month', 'bad_month', 'Ask for a month like 2026-11.');
  return e.json(200, { full: lib.fullSlots(e.app, month) });
});

// Files an Annex C. With `appointment_id` it receives that booking; without one it also creates the appointment, so a
// walk-in always has both. Everything happens in one transaction: all of it is saved, or none of it.
routerAdd('POST', '/api/clinic/intakes', (e) => {
  const lib = require(`${__hooks}/clinic-lib.js`);
  if (!e.auth.getBool('verified')) throw new ForbiddenError('Your account isn\'t verified.');
  const body = e.requestInfo().body || {};
  const answers = body.answers && typeof body.answers === 'object' ? body.answers : {};

  const fullName = lib.text(body.full_name);
  const address = lib.text(body.address);
  const email = lib.text(body.email);
  const mobile = lib.normalizeMobile(body.mobile_no);
  const dateReceived = lib.text(body.date_received);
  const source = body.source === 'PAPER' ? 'PAPER' : 'DIGITAL';
  const scheduleDate = lib.text(body.schedule_date);
  const scheduleTime = lib.text(body.schedule_time);
  const today = lib.manila().date;

  // Same checks as the page, for anything that doesn't come through it.
  if (!fullName) throw lib.refuse('full_name', 'required', 'Enter the applicant\'s full name.');
  if (!mobile && !email && !address) throw lib.refuse('mobile_no', 'required', 'Enter at least one way to reach the applicant.');
  if (mobile && !/^\+?[0-9]{7,19}$/.test(mobile)) throw lib.refuse('mobile_no', 'invalid', 'Enter a valid phone number.');
  if (email && !/^\S+@\S+\.\S+$/.test(email)) throw lib.refuse('email', 'invalid', 'Enter a valid email address.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateReceived)) throw lib.refuse('date_received', 'required', 'Enter the date received.');
  if (dateReceived > today) throw lib.refuse('date_received', 'future', 'The date received can\'t be in the future.');
  if (!lib.text(answers.nature)) throw lib.refuse('nature', 'required', 'Describe the request.');
  if (!lib.list(answers.assistance).length && !lib.text(answers.assistance_other)) throw lib.refuse('assistance', 'required', 'Choose the assistance requested.');
  if (!lib.list(answers.practice_areas).length && !lib.text(answers.practice_other)) throw lib.refuse('practice_areas', 'required', 'Choose a practice area.');
  if (scheduleDate && !/^\d{4}-\d{2}-\d{2}$/.test(scheduleDate)) throw lib.refuse('schedule_date', 'invalid', 'Enter a valid interview date.');

  const c = lib.controls(e.app);
  const lateDays = Math.floor((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${dateReceived}T00:00:00Z`).getTime()) / 86400000);
  const late = lateDays > c.getInt('late_days');
  const lateReason = lib.text(body.late_reason);
  if (late && !lateReason) throw lib.refuse('late_reason', 'required', `This was received ${lateDays} days ago. Say why it wasn't filed sooner.`);

  const written = source === 'PAPER' ? lib.text(body.paper_number).toUpperCase() : '';
  const result = {};

  e.app.runInTransaction((tx) => {
    let appointment = null;
    if (body.appointment_id) {
      appointment = lib.firstOrNull(tx, 'appointments', 'id = {:id}', { id: lib.text(body.appointment_id) });
      if (!appointment) throw lib.refuse('appointment_id', 'not_found', 'That appointment no longer exists.');
      const existing = lib.activeIntake(tx, appointment.id);
      if (existing) throw lib.refuse('appointment_id', 'already_received', 'This appointment has already been received.');
    }

    // The number written on a paper form: one we issued is used as it is; anything else is kept for searching, and
    // gets a proper number. A number that's been used already is the one thing refused: that's a mistake to look at.
    let paperForm = null;
    let unissued = false;
    let reference = appointment ? appointment.getString('reference') : '';
    if (source === 'PAPER') {
      paperForm = written ? lib.firstOrNull(tx, 'paper_forms', 'reference = {:r}', { r: written }) : null;
      if (paperForm && paperForm.getString('status') === 'ENCODED') throw lib.refuse('paper_number', 'paper_used', `${written} has already been encoded.`);
      if (paperForm && paperForm.getString('status') === 'VOID') throw lib.refuse('paper_number', 'paper_void', `${written} was voided and can't be used.`);
      if (!paperForm && written && lib.firstOrNull(tx, 'appointments', 'reference = {:r}', { r: written })) throw lib.refuse('paper_number', 'paper_used', `${written} is already in use.`);
      if (paperForm && !appointment) reference = written;
      unissued = !paperForm;
    }
    if (!reference) reference = lib.allocate(tx, source === 'PAPER' ? 'paper' : 'online')[0];
    if (appointment && !appointment.getString('reference')) appointment.set('reference', reference); // an old booking with none

    const previous = appointment ? lib.latestStatus(tx, appointment.id) : null;
    const lspId = lib.text(body.lsp_id) || (previous ? previous.getString('lsp_id') : '');
    const slId = lib.text(body.sl_id) || (previous ? previous.getString('sl_id') : '');
    lib.checkAssignable(tx, lspId, slId, previous);

    const scheduledAt = scheduleDate ? lib.manilaToUTC(scheduleDate, scheduleTime || '09:00') : '';
    if (body.disposition === 'INTERVIEW' && !scheduledAt && (!appointment || appointment.getDateTime('scheduled_at').isZero())) {
      throw lib.refuse('schedule_date', 'required', 'Enter the interview schedule.');
    }

    // ---------- The appointment ----------
    const isNew = !appointment;
    if (isNew) {
      appointment = new Record(tx.findCollectionByNameOrId('appointments'));
      const areas = [...lib.list(answers.practice_areas), lib.text(answers.practice_other)].filter(Boolean).join(', ');
      appointment.set('reference', reference);
      appointment.set('title', [fullName, areas].filter(Boolean).join(' — '));
      appointment.set('email', email);
      appointment.set('mobile_no', mobile);
      appointment.set('possible_duplicate', !body.not_duplicate && lib.recentSameMobile(tx, mobile));
      // Shaped like the online form, so the printed intake form and the ULAS declaration fill in the same way.
      appointment.set('json', {
        source: 'staff', annexC: true, addedBy: lib.userName(e.auth), addedAt: new Date().toISOString(), concern: lib.text(answers.nature),
        B_personal: { fullName, address, mobile, email },
        F_legalIssue: { practiceAreas: lib.list(answers.practice_areas), other: lib.text(answers.practice_other), requestedAssistance: lib.list(answers.assistance), requestedOther: lib.text(answers.assistance_other) },
        G_caseFacts: { narrative: lib.text(answers.nature), referralSources: lib.list(answers.referral), referralOther: lib.text(answers.referral_other) },
      });
    }
    if (scheduledAt) appointment.set('scheduled_at', scheduledAt);
    tx.save(appointment);

    // ---------- Annex C ----------
    const intake = new Record(tx.findCollectionByNameOrId('intake_requests'));
    intake.load({
      reference, appointment_id: appointment.id, date_received: lib.manilaToUTC(dateReceived),
      contact_mode: lib.text(body.contact_mode), contact_mode_other: lib.text(body.contact_mode_other),
      full_name: fullName, address, mobile_no: mobile, email,
      urgency: lib.text(body.urgency), disposition: lib.text(body.disposition), disposition_other: lib.text(body.disposition_other),
      received_by: e.auth.id, received_by_name: lib.userName(e.auth), received_at: lib.dbDate(Date.now()),
      source, paper_ref_written: written, unissued_paper: unissued, encoded_late: late, late_reason: lateReason, json: answers,
    });
    tx.save(intake);

    if (paperForm) {
      paperForm.set('status', 'ENCODED');
      paperForm.set('intake_id', intake.id);
      tx.save(paperForm);
    }

    // ---------- History ----------
    const closes = body.disposition === 'IMMEDIATE_REFERRAL' && !scheduledAt;
    const current = previous ? previous.getString('app_status').trim() : 'PENDING';
    const status = closes ? 'DONE' : (current === 'PENDING' && (scheduledAt || !appointment.getDateTime('scheduled_at').isZero()) ? 'SCHEDULED' : current);
    const row = new Record(tx.findCollectionByNameOrId('appointments_status'));
    row.load({
      app_id: appointment.id, user_id: e.auth.id, app_status: status, lsp_id: lspId, sl_id: slId,
      remarks: [closes ? 'Immediate referral (Annex C).' : 'Intake received (Annex C).', lib.text(body.remarks)].filter(Boolean).join(' '),
    });
    tx.save(row);

    lib.audit(tx, e.auth, isNew ? 'intake_create' : 'intake_receive', 'intake_requests', intake.id, reference, { source, unissued, late });
    Object.assign(result, { id: intake.id, appointment_id: appointment.id, reference, encoded_late: late, unissued_paper: unissued });
  });

  return e.json(200, result);
}, $apis.requireAuth('users'));

// Issues numbers for blank paper forms. Who took them and when is on the record, so forms never filed in show up.
routerAdd('POST', '/api/clinic/paper-forms', (e) => {
  const lib = require(`${__hooks}/clinic-lib.js`);
  if (!e.auth.getBool('verified')) throw new ForbiddenError('Your account isn\'t verified.');
  const count = Number((e.requestInfo().body || {}).count);
  if (!Number.isInteger(count) || count < 1 || count > 50) throw lib.refuse('count', 'bad_count', 'Enter a number from 1 to 50.');
  const issued = [];
  e.app.runInTransaction((tx) => {
    const collection = tx.findCollectionByNameOrId('paper_forms');
    for (const reference of lib.allocate(tx, 'paper', count)) {
      const form = new Record(collection);
      form.load({ reference, status: 'ISSUED', issued_by: e.auth.id, issued_by_name: lib.userName(e.auth) });
      tx.save(form);
      issued.push(reference);
    }
    lib.audit(tx, e.auth, 'paper_issue', 'paper_forms', '', '', { references: issued });
  });
  return e.json(200, { references: issued });
}, $apis.requireAuth('users'));

// Voiding keeps the record and says why. Admins only.
routerAdd('POST', '/api/clinic/paper-forms/{id}/void', (e) => {
  const lib = require(`${__hooks}/clinic-lib.js`);
  if (e.auth.getString('role') !== 'admin' || !e.auth.getBool('verified')) throw new ForbiddenError('Only admins can void a paper form.');
  const reason = lib.text((e.requestInfo().body || {}).reason);
  if (!reason) throw lib.refuse('reason', 'required', 'Say why this number is being voided.');
  const form = e.app.findRecordById('paper_forms', e.request.pathValue('id'));
  if (form.getString('status') !== 'ISSUED') throw lib.refuse('id', 'not_issued', 'Only a number that hasn\'t been encoded can be voided.');
  form.set('status', 'VOID');
  form.set('void_reason', reason);
  e.app.save(form);
  lib.audit(e.app, e.auth, 'paper_void', 'paper_forms', form.id, form.getString('reference'), { reason });
  return e.json(200, { id: form.id });
}, $apis.requireAuth('users'));

routerAdd('POST', '/api/clinic/intakes/{id}/void', (e) => {
  const lib = require(`${__hooks}/clinic-lib.js`);
  if (e.auth.getString('role') !== 'admin' || !e.auth.getBool('verified')) throw new ForbiddenError('Only admins can void an intake.');
  const reason = lib.text((e.requestInfo().body || {}).reason);
  if (!reason) throw lib.refuse('reason', 'required', 'Say why this intake is being voided.');
  const intake = e.app.findRecordById('intake_requests', e.request.pathValue('id'));
  if (intake.getBool('voided')) throw lib.refuse('id', 'already_void', 'This intake has already been voided.');
  intake.set('voided', true);
  intake.set('void_reason', reason);
  e.app.save(intake);
  lib.audit(e.app, e.auth, 'intake_void', 'intake_requests', intake.id, intake.getString('reference'), { reason });
  return e.json(200, { id: intake.id });
}, $apis.requireAuth('users'));
