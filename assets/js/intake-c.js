/*
 * Staff intake: the Request for Legal Assistance Form, Annex "C" (clinic-intake.html).
 * Usage: <body x-data="annexC">. Needs auth.js, intake.js (INTAKE_OPTIONS, normalizeMobile) and appointments.js (Manila
 * time helpers); load BEFORE Alpine.
 *
 *   clinic-intake.html               a new intake (walk-in, phone call…): files Annex C and creates the appointment
 *   clinic-intake.html#<appointment> receives that booking: prefilled from the online form, for staff to check
 *
 * Saving is fileIntake() in clinic-records.js: it gives the reference and saves everything together, and the API rules
 * check it again on the server. Afterwards the page moves on to clinic-annex-c.html, to print it or save it as a PDF.
 */

// The choices on the form, word for word. The print page (annex-c-print.js) uses them too.
const ANNEX_C = {
  modes: ANNEX_C_LABELS.modes,
  preferredContact: ['Mobile (SMS, Voice Call, etc.)', 'Email', 'Messenger'],
  assistance: INTAKE_OPTIONS.assistance,
  referral: ['Walk-in', 'Court', 'PAO', 'IBP', 'Barangay', 'LGU', 'University', 'NGO', 'Friend / Relative', 'Social Media'],
  practiceAreas: ['Civil', 'Criminal', 'Labor', 'Family', 'Environmental', 'Administrative', 'Human Rights'],
  urgency: [
    { value: 'HIGH', label: 'High', hint: 'The matter will be prejudiced unless the clinic acts at once.' },
    { value: 'MEDIUM', label: 'Medium', hint: 'The matter has a deadline or a consequence that is approaching but not imminent, and delay will narrow the options' },
    { value: 'LOW', label: 'Low', hint: 'No period is running and no present prejudice is apparent. The matter can be scheduled in the ordinary course.' },
  ],
  dispositions: ANNEX_C_LABELS.dispositions,
};

// How answers on the online form (old wording too) read on Annex C. Only a starting point: staff check them.
const ANNEX_C_FROM_ONLINE = {
  practiceAreas: {
    'Family Law': 'Family', 'Violence Against Women and Children': 'Family', 'Family / Custody / VAWC': 'Family',
    'Criminal Law': 'Criminal', Criminal: 'Criminal', 'Drug-Related Case (RA 9165)': 'Criminal',
    'Children in Conflict with the Law (CICL)': 'Criminal', 'Cyberlibel / Online Harassment': 'Criminal',
    'Labor and Employment': 'Labor', 'Labor / Employment': 'Labor',
    'Civil Dispute': 'Civil', Civil: 'Civil', 'Land or Property': 'Civil', 'Land Dispute / Property': 'Civil', Contracts: 'Civil',
    'Human Rights': 'Human Rights', 'Environmental Law': 'Environmental', Environmental: 'Environmental',
    'Government or Administrative Matter': 'Administrative', Administrative: 'Administrative',
  },
  assistance: { 'Limited Legal Service / Drafting': 'Document Preparation', 'Continuing Representation': 'Representation', 'Legal Referral': 'Referral' },
  referral: {
    Facebook: 'Social Media', 'Social Media': 'Social Media', University: 'University', Barangay: 'Barangay', 'Barangay VAWC': 'Barangay',
    'Local Government Unit': 'LGU', CSWDO: 'LGU', Court: 'Court', RTC: 'Court', "Public Attorney's Office": 'PAO', PAO: 'PAO',
    'Integrated Bar of the Philippines': 'IBP', 'Friend or Relative': 'Friend / Relative', 'Friend / Relative': 'Friend / Relative',
  },
  preferredContact: { 'Phone Call': 'Mobile (SMS, Voice Call, etc.)', SMS: 'Mobile (SMS, Voice Call, etc.)', Email: 'Email' },
};

// Maps online answers across; those with no Annex C equivalent are returned separately, to go under "Other".
function annexCMap(values, map, allowed) {
  const mapped = [];
  const others = [];
  for (const value of Array.isArray(values) ? values : []) {
    const target = map[value] || (allowed.includes(value) ? value : '');
    if (target) { if (!mapped.includes(target)) mapped.push(target); } else others.push(value);
  }
  return { mapped, others };
}

const emptyAnnexC = () => ({
  date_received: manilaParts(new Date().toISOString()).date, contact_mode: 'WALK_IN', contact_mode_other: '',
  full_name: '', address: '', mobile_no: '', email: '', preferred_contact: [], preferred_other: '',
  nature: '', assistance: [], assistance_other: '', is_urgent: 'No', urgent_details: '',
  referral: [], referral_other: '', practice_areas: [], practice_other: '', urgency: '',
  lsp_id: '', sl_id: '', schedule_date: '', schedule_time: '', disposition: '', disposition_other: '',
  on_paper: false, paper_number: '', late_reason: '', not_duplicate: false, remarks: '',
});

document.addEventListener('alpine:init', () => {
  Alpine.data('annexC', () => ({
    me: Auth.user,
    options: ANNEX_C,
    form: emptyAnnexC(),
    appointment: null, // the booking being received; null = a new intake
    errors: {},
    formError: '',
    loading: true,
    loadError: '',
    saving: false,
    dirty: false,
    lateDays: 3, // intake_controls.late_days
    slotCapacity: 1, // intake_controls.slot_capacity
    practitioners: [],
    lawyers: [],
    duplicates: [],
    slotTaken: 0, // how many others are booked at the interview time

    async init() {
      pb.authStore.onChange(() => (this.me = pb.authStore.record));
      window.addEventListener('beforeunload', (e) => { if (this.dirty) e.preventDefault(); });
      this.$watch('form.schedule_date', () => this.checkSlot());
      this.$watch('form.schedule_time', () => this.checkSlot());
      let openingBooking = false;
      try {
        const [controls, practitioners, lawyers] = await Promise.all([
          pb.collection('intake_controls').getList(1, 1, { requestKey: null }),
          pb.collection('practitioners').getFullList({ sort: 'lname,fname', requestKey: null }),
          pb.collection('lawyers').getFullList({ sort: 'lname,fname', requestKey: null }),
        ]);
        const c = controls.items[0];
        if (c) { this.lateDays = c.late_days; this.slotCapacity = c.slot_capacity; }
        this.practitioners = practitioners;
        this.lawyers = lawyers;
        const id = location.hash.slice(1);
        if (/^[a-z0-9]{15}$/.test(id)) {
          openingBooking = true;
          await this.loadBooking(id);
        }
      } catch (err) {
        this.loadError = err?.status !== 404 ? 'The form couldn\'t be loaded. Check your connection and try again.'
          : openingBooking ? 'This appointment no longer exists.'
          : 'The form can\'t open yet: the database changes for Annex C haven\'t been applied (README → "Applying the database changes").';
      } finally {
        this.loading = false;
      }
    },

    // Receiving a booking: fills in what the client already told us.
    async loadBooking(id) {
      const [booking, row] = await Promise.all([
        pb.collection('appointments').getOne(id, { requestKey: null }),
        pb.collection('appointments_overview').getOne(id, { requestKey: null }),
      ]);
      if (row.intake_id) {
        this.dirty = false;
        location.replace(`clinic-annex-c.html#${row.intake_id}`); // already received: show it instead
        return;
      }
      this.appointment = booking;
      const a = booking.json && typeof booking.json === 'object' ? booking.json : {};
      const b = a.B_personal || {};
      const fx = a.F_legalIssue || {};
      const g = a.G_caseFacts || {};
      const d = a.annexD || {};
      const f = this.form;
      const maps = ANNEX_C_FROM_ONLINE;
      f.contact_mode = a.source === 'staff' ? 'WALK_IN' : 'ONLINE';
      f.full_name = b.fullName || [b.firstName, b.middleName, b.lastName].filter(Boolean).join(' ') || (booking.title || '').split(' — ')[0];
      f.address = [b.address, b.barangay, b.city, b.province].filter(Boolean).join(', ');
      f.mobile_no = b.mobile || booking.mobile_no || '';
      f.email = b.email || booking.email || '';
      f.nature = g.narrative || a.concern || '';

      const contact = annexCMap(d.preferredContact, maps.preferredContact, ANNEX_C.preferredContact);
      f.preferred_contact = contact.mapped;
      f.preferred_other = [...contact.others, d.preferredContactOther].filter(Boolean).join(', ');
      const help = annexCMap(fx.requestedAssistance, maps.assistance, ANNEX_C.assistance.map((o) => o.value));
      f.assistance = help.mapped;
      f.assistance_other = [...help.others, fx.requestedOther].filter(Boolean).join(', ');
      const heard = annexCMap(g.referralSources, maps.referral, ANNEX_C.referral);
      f.referral = heard.mapped;
      f.referral_other = [...heard.others, g.referralOther].filter(Boolean).join(', ');
      const areas = annexCMap(fx.practiceAreas, maps.practiceAreas, ANNEX_C.practiceAreas);
      f.practice_areas = areas.mapped;
      f.practice_other = [...areas.others, fx.other].filter(Boolean).join(', ');

      const flags = (d.urgency?.flags || []).filter((flag) => !/none of the above/i.test(flag));
      f.is_urgent = flags.length ? 'Yes' : 'No';
      f.urgent_details = [...flags, d.urgency?.date].filter(Boolean).join(' ');
      if (booking.scheduled_at) {
        const when = manilaParts(booking.scheduled_at);
        f.schedule_date = when.date;
        f.schedule_time = when.time;
      }
      f.lsp_id = row.lsp_id || '';
      f.sl_id = row.sl_id || '';
      this.checkDuplicates();
    },

    personOption(p) {
      return `${p.lname}, ${p.fname}${p.level ? ` (${p.level})` : ''}${p.status && p.status !== 'active' ? ` · ${p.status}` : ''}`;
    },

    // ---------- Things worth a warning ----------

    get receivedDaysAgo() {
      if (!this.form.date_received) return 0;
      const today = manilaParts(new Date().toISOString()).date;
      return Math.floor((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${this.form.date_received}T00:00:00Z`)) / 86400000);
    },

    get isLate() {
      return this.receivedDaysAgo > this.lateDays;
    },

    // Same number or name in the last 30 days. Staff open the earlier record, or say it's someone else.
    async checkDuplicates() {
      const mobile = normalizeMobile(this.form.mobile_no);
      const name = this.form.full_name.trim();
      if (!mobile && name.length < 4) { this.duplicates = []; return; }
      const since = new Date(Date.now() - 30 * 86400000).toISOString().replace('T', ' ');
      const who = [mobile && pb.filter('mobile_no = {:m}', { m: mobile }), name.length >= 4 && pb.filter('title ~ {:n}', { n: name })].filter(Boolean).join(' || ');
      try {
        const found = await pb.collection('appointments_overview').getList(1, 5, {
          filter: `${pb.filter('created >= {:s} && id != {:id}', { s: since, id: this.appointment?.id || '' })} && (${who})`,
          sort: '-created', fields: 'id,reference,title,created', requestKey: 'annex-c-duplicates',
        });
        this.duplicates = found.items;
      } catch (err) {
        if (!err.isAbort) console.warn('[annex c] could not check for duplicates:', err);
      }
    },

    async checkSlot() {
      const f = this.form;
      this.slotTaken = 0;
      if (!f.schedule_date || !f.schedule_time) return;
      try {
        const found = await pb.collection('appointments_overview').getList(1, 1, {
          filter: pb.filter('scheduled_at = {:t} && app_status != "CANCELLED" && id != {:id}', { t: manilaToUTC(f.schedule_date, f.schedule_time), id: this.appointment?.id || '' }),
          fields: 'id', requestKey: 'annex-c-slot',
        });
        this.slotTaken = found.totalItems;
      } catch (err) {
        if (!err.isAbort) console.warn('[annex c] could not check the slot:', err);
      }
    },

    // ---------- Saving ----------

    validate() {
      const f = this.form;
      const e = {};
      const today = manilaParts(new Date().toISOString()).date;
      if (!f.date_received) e.date_received = 'Enter the date received.';
      else if (f.date_received > today) e.date_received = 'The date received can\'t be in the future.';
      if (!f.full_name.trim()) e.full_name = 'Enter the applicant\'s full name.';
      if (!f.mobile_no.trim() && !f.email.trim() && !f.address.trim()) e.mobile_no = 'Enter at least one way to reach the applicant.';
      if (f.mobile_no.trim() && !/^\+?[0-9]{7,19}$/.test(normalizeMobile(f.mobile_no))) e.mobile_no = 'Enter a valid phone number.';
      if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Enter a valid email address.';
      if (!f.nature.trim()) e.nature = 'Describe the request.';
      if (!f.assistance.length && !f.assistance_other.trim()) e.assistance = 'Choose the assistance requested.';
      if (!f.practice_areas.length && !f.practice_other.trim()) e.practice_areas = 'Choose a practice area.';
      if (!f.urgency) e.urgency = 'Choose the urgency.';
      if (!f.disposition) e.disposition = 'Choose the disposition.';
      if (f.disposition === 'INTERVIEW' && !f.schedule_date) e.schedule_date = 'Enter the interview schedule.';
      if (this.isLate && !f.late_reason.trim()) e.late_reason = `This was received ${this.receivedDaysAgo} days ago. Say why it wasn't filed sooner.`;
      if (!this.appointment && this.duplicates.length && !f.not_duplicate) e.not_duplicate = 'Open the earlier record, or tick the box if this is a different person.';
      return e;
    },

    focusFirstError() {
      this.$nextTick(() => {
        const el = this.$root.querySelector('[aria-invalid="true"]');
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus({ preventScroll: true }); }
      });
    },

    async save() {
      if (this.saving) return;
      this.errors = this.validate();
      this.formError = '';
      if (Object.keys(this.errors).length) {
        this.formError = 'Please fix the highlighted fields.';
        return this.focusFirstError();
      }
      this.saving = true;
      const f = this.form;
      try {
        const saved = await fileIntake(this.me, {
          appointment_id: this.appointment?.id || '',
          date_received: f.date_received, contact_mode: f.contact_mode, contact_mode_other: f.contact_mode_other,
          full_name: f.full_name, address: f.address, mobile_no: f.mobile_no, email: f.email,
          urgency: f.urgency, disposition: f.disposition, disposition_other: f.disposition_other,
          source: f.on_paper ? 'PAPER' : 'DIGITAL', paper_number: f.paper_number, late_reason: f.late_reason,
          not_duplicate: f.not_duplicate, schedule_date: f.schedule_date, schedule_time: f.schedule_time,
          lsp_id: f.lsp_id, sl_id: f.sl_id, remarks: f.remarks,
          answers: {
            preferred_contact: f.preferred_contact, preferred_other: f.preferred_other.trim(), nature: f.nature.trim(),
            assistance: f.assistance, assistance_other: f.assistance_other.trim(), is_urgent: f.is_urgent, urgent_details: f.urgent_details.trim(),
            referral: f.referral, referral_other: f.referral_other.trim(), practice_areas: f.practice_areas, practice_other: f.practice_other.trim(),
          },
        }, { practitioners: this.practitioners, lawyers: this.lawyers, lateDays: this.lateDays });
        this.dirty = false;
        location.href = `clinic-annex-c.html?saved#${saved.id}`;
      } catch (err) {
        const fields = err?.fields || err?.response?.data || {};
        this.errors = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value?.message || value || 'Check this field.']));
        this.formError = Object.keys(this.errors).length ? 'Please fix the highlighted fields.'
          : err?.status === 0 ? 'Couldn\'t reach the server. Check your internet connection and try again. Nothing was saved.'
          : err?.status === 400 ? 'The server refused this, so nothing was saved. Reload the page and check it hasn\'t been filed already.'
          : err?.response?.message || 'Something went wrong. Nothing was saved. Please try again.';
        this.focusFirstError();
      } finally {
        this.saving = false;
      }
    },
  }));
});
