/// <reference path="../pb_data/types.d.ts" />

/*
 * SNMC Law Legal Clinic: rules for every new or changed appointment, whoever or whatever sends it.
 * Install: README → "Installing the server files".
 */

// A new appointment: the server decides the reference and the flags, whatever the request says.
onRecordCreateRequest((e) => {
  const lib = require(`${__hooks}/clinic-lib.js`);
  const answers = lib.jsonOf(e.record.get('json'));
  if (!e.auth) lib.checkVisitorBooking(e.app, e.record, answers);

  const urgency = lib.urgencyOf(answers);
  e.record.set('client_urgent', urgency.urgent);
  e.record.set('urgent_deadline', urgency.date ? lib.manilaToUTC(urgency.date) : '');
  e.record.set('possible_duplicate', lib.recentSameMobile(e.app, e.record.getString('mobile_no')));
  e.record.set('reference', ''); // given when it's saved (below)

  e.next();

  // Annex D's emergencies shouldn't wait for someone to open the dashboard. A mail problem mustn't lose the booking.
  if (urgency.emergency) {
    try {
      lib.sendAlert(e.app, `URGENT intake: ${e.record.getString('reference')}`,
        'An online request says the client needs help urgently. Please call them now.',
        [`Reference: ${e.record.getString('reference')}`, ...urgency.flags, ...(urgency.date ? [`Date given: ${urgency.date}`] : [])]);
    } catch (err) {
      console.error('[clinic] could not send the urgent intake email:', err);
    }
  }
}, 'appointments');

// The reference is given at the moment of saving, because that only happens once every request hook has passed. So a
// bot failing the security check (turnstile.pb.js) doesn't use up a number, whichever hook happens to run first.
onRecordCreate((e) => {
  if (!e.record.getString('reference')) {
    const lib = require(`${__hooks}/clinic-lib.js`);
    e.record.set('reference', lib.allocate(e.app, 'online')[0]);
  }
  e.next();
}, 'appointments');

// References and the server's flags can't be changed afterwards.
onRecordUpdateRequest((e) => {
  const lib = require(`${__hooks}/clinic-lib.js`);
  if (!e.hasSuperuserAuth()) {
    const before = e.record.original();
    if (e.record.getString('reference') !== before.getString('reference')) {
      throw lib.refuse('reference', 'reference_locked', 'A reference number can\'t be changed once it has been given.');
    }
    for (const key of ['client_urgent', 'urgent_deadline', 'possible_duplicate']) e.record.set(key, before.get(key));
  }
  e.next();
}, 'appointments');

// An appointment with an Annex C is part of the record: void the Annex C first. Without this PocketBase would still
// refuse (the relation is required), but with a message nobody could act on.
onRecordDeleteRequest((e) => {
  const lib = require(`${__hooks}/clinic-lib.js`);
  if (lib.firstOrNull(e.app, 'intake_requests', 'appointment_id = {:id}', { id: e.record.id })) {
    throw lib.refuse('id', 'has_intake', 'This appointment has an Annex C, so it can\'t be deleted. Set its status to Cancelled instead.');
  }
  e.next();
}, 'appointments');
