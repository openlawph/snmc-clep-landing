/*
 * Booking + client intake wizard (index.html).
 * Usage: <form x-data="intake" …>. Must load BEFORE Alpine (it registers on `alpine:init`),
 * and after assets/js/i18n.js (client-facing text goes through $t / x-t so it can be shown in Bisaya).
 *
 * Fields follow the clinic's Unified Client Intake Form (Form No. SNMC-CIF-001).
 * The client fills in Sections B–I and K online. Sections A (administrative) and
 * J (assessment) are for clinic staff and are completed at the intake interview.
 *
 * Which days, times and questions the form offers, and which questions must be answered, come from
 * the public PocketBase `intake_settings` record, which admins edit in the staff area (see README).
 * In the markup, x-field="key" on a question shows/hides it, marks it required (*) and shows its error.
 *
 * The form is UI-only for now: submit() validates, builds the payload (toPayload) and
 * shows the "Request received" screen. Wire the real submission up in sendRequest() below.
 */

// Checkbox/radio choices, copied from the paper form. Edit here to change the options
// (and add the Bisaya wording to assets/js/i18n-vs.js). The English value is what gets saved.
const INTAKE_OPTIONS = {
  sex: ['Female', 'Male'],
  civilStatus: ['Single', 'Married', 'Separated', 'Widowed'],
  education: ['No formal schooling', 'Elementary level', 'Elementary graduate', 'High school level', 'High school graduate', 'Vocational / Technical', 'College level', 'College graduate', 'Post-graduate'],
  relationships: ['Self', 'Spouse', 'Child', 'Parent', 'Sibling', 'Other dependent'],
  sectors: [ // Section D
    'Women', 'Children (below 18)', 'Youth', 'Senior Citizen',
    'Person with Disability (PWD)', 'Indigenous Peoples (IP)', 'Urban Poor / Informal Settler',
    'Person Deprived of Liberty (PDL)', 'Probationer / Parolee / Pardonee', 'Survivor of Violence / Abuse',
    'Person with Diverse SOGIESC',
  ],
  practiceAreas: [ // Section F
    'Criminal', 'Civil', 'Labor / Employment', 'Family / Custody / VAWC', 'Administrative',
    'Human Rights', 'Environmental', 'Land Dispute / Property', 'Cyberlibel / Online Harassment',
    'Drug-Related Case (RA 9165)', 'Children in Conflict with the Law (CICL)',
  ],
  assistance: ['Legal Advice', 'Limited Legal Service / Drafting', 'Continuing Representation', 'Legal Referral'],
  referralSources: ['Barangay VAWC', 'PNP', 'CSWDO', 'RTC', 'PAO', 'Friend / Relative', 'Social Media'], // Section G.6
  documents: [ // Section K
    'Valid Government-Issued ID', 'Barangay Certificate of Indigency',
    'DSWD Certificate of Indigency', 'Latest Income Tax Return / Pay Slip',
    'Police Blotter / Incident Report', 'Court Subpoena / Complaint / Pleadings',
    'Contracts / Affidavits / Certificates',
  ],
};

// Used until the settings load from PocketBase, and if they can't be loaded.
const INTAKE_DEFAULT_SETTINGS = {
  days: ['tue', 'thu'],
  time_slots: ['13:00', '14:00', '15:00', '16:00'], // 24-hour "HH:MM"
  hidden_fields: [],
  required_fields: ['lastName', 'firstName', 'mobile', 'narrative'],
  locked_fields: ['lastName', 'firstName', 'mobile', 'narrative'], // "Always ask": can't be turned off until unlocked
};

// Days the clinic can offer (never Sunday). `day` = Date#getDay(); `plural` is used in sentences.
const INTAKE_WEEKDAYS = [
  { key: 'mon', day: 1, label: 'Monday', plural: 'Mondays' },
  { key: 'tue', day: 2, label: 'Tuesday', plural: 'Tuesdays' },
  { key: 'wed', day: 3, label: 'Wednesday', plural: 'Wednesdays' },
  { key: 'thu', day: 4, label: 'Thursday', plural: 'Thursdays' },
  { key: 'fri', day: 5, label: 'Friday', plural: 'Fridays' },
  { key: 'sat', day: 6, label: 'Saturday', plural: 'Saturdays' },
];

const INTAKE_STEPS = ['Book a slot', 'Personal information', 'Household & sector', 'Legal issue', 'Case facts', 'Consent & declaration'];

// Questions on the form, for the Intake Settings page. Admins can turn each one off, make it required,
// or lock it as "Always ask" (then it can't be turned off or changed until someone unlocks it).
//   core: true        always asked and required (the booking can't work without it)
//   canRequire: false the question always has an answer (a pre-selected choice), so "required" doesn't apply
//   requiredNote      what "required" means for questions with a follow-up
// A step whose questions are all turned off is skipped.
const INTAKE_FIELDS = [
  { key: 'date', step: 1, label: 'Preferred date', core: true },
  { key: 'time', step: 1, label: 'Time slot', core: true },
  { key: 'firstTime', step: 1, label: 'First time with the clinic?', canRequire: false },
  { key: 'lastName', step: 2, label: 'Last name' },
  { key: 'firstName', step: 2, label: 'First name' },
  { key: 'middleName', step: 2, label: 'Middle name' },
  { key: 'nickname', step: 2, label: 'Nickname / alias' },
  { key: 'dob', step: 2, label: 'Date of birth' },
  { key: 'sex', step: 2, label: 'Sex' },
  { key: 'civilStatus', step: 2, label: 'Civil status' },
  { key: 'citizenship', step: 2, label: 'Citizenship' },
  { key: 'religion', step: 2, label: 'Religion' },
  { key: 'education', step: 2, label: 'Educational attainment' },
  { key: 'language', step: 2, label: 'Language / dialect' },
  { key: 'occupation', step: 2, label: 'Occupation / employment' },
  { key: 'disability', step: 2, label: 'Disability' },
  { key: 'mobile', step: 2, label: 'Contact number' },
  { key: 'email', step: 2, label: 'Email' },
  { key: 'address', step: 2, label: 'Complete address' },
  { key: 'barangay', step: 2, label: 'Barangay' },
  { key: 'city', step: 2, label: 'City / municipality' },
  { key: 'residentLLC', step: 2, label: 'Resident of Lapu-Lapu City?' },
  { key: 'household', step: 3, label: 'Household members & income', requiredNote: 'Required: every member needs a name.' },
  { key: 'property', step: 3, label: 'Property and assets', requiredNote: 'Required: the estimated value is needed when they answer Yes.' },
  { key: 'sectors', step: 3, label: 'Sector classification' },
  { key: 'practiceAreas', step: 4, label: 'Practice area / category' },
  { key: 'assistance', step: 4, label: 'Requested assistance / service' },
  { key: 'opposingParty', step: 4, label: 'Opposing party (names, relationship, contact)', requiredNote: 'Required: the opposing party\'s name is needed.' },
  { key: 'represented', step: 4, label: 'Already represented by an attorney?', canRequire: false },
  { key: 'priorConsult', step: 4, label: 'Consulted the clinic or an attorney before?', requiredNote: 'Required: details are needed when they answer Yes.' },
  { key: 'opposingConsulted', step: 4, label: 'Has the opposing party consulted the clinic?', canRequire: false },
  { key: 'narrative', step: 5, label: 'Narrative of facts', requiredNote: 'Required: at least a few sentences.' },
  { key: 'personsInvolved', step: 5, label: 'Persons involved' },
  { key: 'incident', step: 5, label: 'When and where it happened', requiredNote: 'Required: the date is needed.' },
  { key: 'existingDocuments', step: 5, label: 'Documents that presently exist' },
  { key: 'caseFiled', step: 5, label: 'Complaint or case already filed?', requiredNote: 'Required: court and case number are needed when they answer Yes.' },
  { key: 'pendingHearing', step: 5, label: 'Pending hearings or deadlines?', requiredNote: 'Required: the date is needed when they answer Yes.' },
  { key: 'referralSources', step: 5, label: 'How they learned about the clinic' },
  { key: 'documents', step: 5, label: 'Documents checklist' },
  { key: 'attachments', step: 5, label: 'Attach copies (photo / PDF uploads)' },
  { key: 'privacyConsent', step: 6, label: 'Data privacy consent', core: true },
  { key: 'declaration', step: 6, label: 'Declarations and typed signature', core: true },
];

// How far ahead clients can book.
const INTAKE_BOOKING_DAYS_AHEAD = 90;

// '13:00' → '1:00 PM'
function formatSlot(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// Local date as 'YYYY-MM-DD' (same format as <input type="date">).
function ymdOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

// Reads the public intake_settings record (SITE.apiUrl in components.js). Falls back to the defaults.
async function fetchIntakeSettings() {
  try {
    const res = await fetch(`${window.SITE.apiUrl}/api/collections/intake_settings/records?perPage=1`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const record = (await res.json()).items?.[0];
    if (!record) throw new Error('no settings record');
    return {
      days: Array.isArray(record.days) && record.days.length ? record.days : INTAKE_DEFAULT_SETTINGS.days,
      time_slots: Array.isArray(record.time_slots) && record.time_slots.length ? [...record.time_slots].sort() : INTAKE_DEFAULT_SETTINGS.time_slots,
      hidden_fields: Array.isArray(record.hidden_fields) ? record.hidden_fields : [],
      required_fields: Array.isArray(record.required_fields) ? record.required_fields : INTAKE_DEFAULT_SETTINGS.required_fields,
      locked_fields: Array.isArray(record.locked_fields) ? record.locked_fields : INTAKE_DEFAULT_SETTINGS.locked_fields,
    };
  } catch (err) {
    console.warn('[intake] using the default days and times:', err.message);
    return { ...INTAKE_DEFAULT_SETTINGS };
  }
}

document.addEventListener('alpine:init', () => {
  // x-field="key" on a question's wrapper: shows it only when it's asked, adds .is-required (the *),
  // marks its first input aria-required / aria-invalid, and shows errors[key] under it.
  Alpine.directive('field', (el, { expression: key }, { effect }) => {
    const data = Alpine.$data(el);
    const error = document.createElement('p');
    error.className = 'field-error';
    el.appendChild(error);
    const control = el.querySelector('input, select, textarea'); // the calendar has none; its group has aria-invalid
    effect(() => {
      const required = data.isRequired(key);
      const message = data.errors[key] || '';
      el.style.display = data.shown(key) ? '' : 'none';
      el.classList.toggle('is-required', required);
      error.textContent = message;
      error.style.display = message ? '' : 'none';
      if (control) {
        control.setAttribute('aria-required', String(required));
        control.setAttribute('aria-invalid', String(!!message));
      }
    });
  });

  Alpine.data('intake', () => ({
    opt: INTAKE_OPTIONS,
    settings: { ...INTAKE_DEFAULT_SETTINGS },
    settingsLoaded: false,
    step: 1,
    steps: INTAKE_STEPS,
    headings: [
      'Choose your consultation slot',
      'Tell us about you',
      'Your household',
      'What is your legal concern?',
      'What happened?',
      'Review and submit',
    ],
    calendarMonth: '', // 'YYYY-MM' shown in the date picker
    submitting: false,
    submitted: false,
    reference: '',
    errors: {},

    form: {
      // Step 1 — appointment
      date: '', time: '', firstTime: 'Yes',

      // Step 2 — Section B: applicant personal information
      lastName: '', firstName: '', middleName: '', nickname: '',
      dob: '', sex: '', civilStatus: '', citizenship: 'Filipino', religion: '',
      education: '', language: '', occupation: '', disability: '',
      mobile: '', email: '', address: '', barangay: '', city: 'Lapu-Lapu City', residentLLC: '',

      // Step 3 — Section C: household & financial eligibility
      household: [{ name: '', relationship: 'Self', source: '', amount: '' }],
      ownsOtherProperty: 'No', propertyValue: '',
      hasOtherAssets: 'None', assetsValue: '',
      // Section D: vulnerability / sector
      sectors: [], sectorOther: '',

      // Step 4 — Section F: legal issue
      practiceAreas: [], practiceOther: '',
      assistance: [],
      opposingName: '', opposingRelationship: '', opposingContact: '',
      represented: 'No',
      // Section E: conflict check & prior consultation
      priorConsult: 'No', priorConsultDetails: '',
      opposingConsulted: 'Unknown',

      // Step 5 — Section G: narrative & case facts
      narrative: '', personsInvolved: '',
      incidentDate: '', incidentPlace: '',
      existingDocuments: '',
      caseFiled: 'No', caseDetails: '',
      pendingHearing: 'No', hearingDate: '', hearingVenue: '',
      referralSources: [], referralOther: '',
      // Section K: documents the client has / will bring
      documents: [], documentsOther: '', files: [],

      // Step 6 — Sections H & I
      privacyConsent: '', // 'agree' | 'disagree'
      declarationTrue: false,
      declarationNoRelationship: false,
      signature: '',
    },

    init() {
      this.calendarMonth = this.today.slice(0, 7);
      fetchIntakeSettings().then((settings) => {
        this.settings = settings;
        this.settingsLoaded = true;
        // Drop a choice the new settings no longer allow (picked while the settings were loading).
        if (this.form.date && !this.isAvailable(this.form.date)) this.form.date = '';
        if (this.form.time && !this.availableSlots.includes(this.form.time)) this.form.time = '';
        this.jumpToFirstOpenMonth();
      });
    },

    // Text in the current language (assets/js/i18n.js).
    tr(key, params) {
      return this.$store.i18n.t(key, params);
    },

    // ---------- Settings: visible fields and steps ----------

    shown(key) {
      const field = INTAKE_FIELDS.find((f) => f.key === key);
      return !!field?.core || this.settings.locked_fields.includes(key) || !this.settings.hidden_fields.includes(key);
    },

    isRequired(key) {
      const field = INTAKE_FIELDS.find((f) => f.key === key);
      if (!field) return false;
      if (field.core) return true;
      return field.canRequire !== false && this.shown(key) && this.settings.required_fields.includes(key);
    },

    stepHasRequired(step) {
      return INTAKE_FIELDS.some((f) => f.step === step && this.isRequired(f.key));
    },

    // Steps that still have something to fill in, e.g. [1, 2, 5, 6].
    get activeSteps() {
      return [1, 2, 3, 4, 5, 6].filter((s) => INTAKE_FIELDS.some((f) => f.step === s && this.shown(f.key)));
    },

    get position() {
      return this.activeSteps.indexOf(this.step) + 1;
    },

    get lastStep() {
      return this.activeSteps[this.activeSteps.length - 1];
    },

    // ---------- Date picker ----------

    get today() {
      return ymdOf(new Date());
    },

    get maxDate() {
      const d = new Date();
      d.setDate(d.getDate() + INTAKE_BOOKING_DAYS_AHEAD);
      return ymdOf(d);
    },

    get openDays() {
      return INTAKE_WEEKDAYS.filter((w) => this.settings.days.includes(w.key)).map((w) => w.day);
    },

    // e.g. "Tuesdays and Thursdays" / "Martes ug Huwebes"
    get daysText() {
      const names = INTAKE_WEEKDAYS.filter((w) => this.settings.days.includes(w.key)).map((w) => this.tr(w.plural));
      return names.length > 1 ? `${names.slice(0, -1).join(', ')} ${this.tr('and')} ${names[names.length - 1]}` : names[0] || '';
    },

    // e.g. "1:00 PM to 4:00 PM" (first and last slot)
    get hoursText() {
      const slots = this.settings.time_slots;
      if (slots.length === 1) return formatSlot(slots[0]);
      return this.tr('{from} to {to}', { from: formatSlot(slots[0]), to: formatSlot(slots[slots.length - 1]) });
    },

    isAvailable(ymd) {
      if (!ymd || ymd < this.today || ymd > this.maxDate) return false;
      const [y, m, d] = ymd.split('-').map(Number);
      if (!this.openDays.includes(new Date(y, m - 1, d).getDay())) return false;
      return this.slotsFor(ymd).length > 0;
    },

    // Today only offers slots that haven't started yet.
    slotsFor(ymd) {
      if (ymd !== this.today) return this.settings.time_slots;
      const now = new Date();
      const nowHHMM = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      return this.settings.time_slots.filter((s) => s > nowHHMM);
    },

    get availableSlots() {
      return this.form.date ? this.slotsFor(this.form.date) : [];
    },

    // Weeks of the shown month, Sunday first; days outside the month are null.
    get calendarDays() {
      const [y, m] = this.calendarMonth.split('-').map(Number);
      const first = new Date(y, m - 1, 1);
      const daysInMonth = new Date(y, m, 0).getDate();
      const cells = Array(first.getDay()).fill(null);
      for (let d = 1; d <= daysInMonth; d++) {
        const ymd = ymdOf(new Date(y, m - 1, d));
        cells.push({ ymd, day: d, available: this.isAvailable(ymd), isToday: ymd === this.today });
      }
      return cells;
    },

    get monthLabel() {
      const [y, m] = this.calendarMonth.split('-').map(Number);
      return `${this.$store.i18n.monthName(m - 1)} ${y}`;
    },

    get canPrevMonth() {
      return this.calendarMonth > this.today.slice(0, 7);
    },

    get canNextMonth() {
      return this.calendarMonth < this.maxDate.slice(0, 7);
    },

    shiftMonth(delta) {
      const [y, m] = this.calendarMonth.split('-').map(Number);
      this.calendarMonth = ymdOf(new Date(y, m - 1 + delta, 1)).slice(0, 7);
    },

    // If nothing can be booked in the current month any more, show the next one.
    jumpToFirstOpenMonth() {
      if (this.form.date) return (this.calendarMonth = this.form.date.slice(0, 7));
      for (let i = 0; i < 4 && !this.calendarDays.some((c) => c?.available) && this.canNextMonth; i++) this.shiftMonth(1);
    },

    pickDate(ymd) {
      if (!this.isAvailable(ymd)) return;
      this.form.date = ymd;
      if (!this.availableSlots.includes(this.form.time)) this.form.time = '';
      delete this.errors.date;
    },

    dayLabel(cell) {
      return this.formatDate(cell.ymd) + (cell.available ? '' : ` (${this.tr('unavailable')})`);
    },

    // ---------- Derived values ----------

    get fullName() {
      const f = this.form;
      return [f.lastName && `${f.lastName},`, f.firstName, f.middleName].filter(Boolean).join(' ');
    },

    get age() {
      if (!this.form.dob) return '';
      const [y, m, d] = this.form.dob.split('-').map(Number);
      const now = new Date();
      let age = now.getFullYear() - y;
      if (now.getMonth() + 1 < m || (now.getMonth() + 1 === m && now.getDate() < d)) age--;
      return age >= 0 ? age : '';
    },

    get householdTotal() {
      return this.form.household.reduce((sum, row) => sum + (Number(row.amount) || 0), 0);
    },

    // Consent, both declarations and the typed signature are always needed.
    get canSubmit() {
      const f = this.form;
      return f.privacyConsent === 'agree' && f.declarationTrue && f.declarationNoRelationship && f.signature.trim().length >= 3;
    },

    // Review on the last step: one block per visible step, rows for visible fields only.
    get reviewBlocks() {
      const f = this.form;
      const tr = (k, p) => this.tr(k, p);
      const where = 'SNMC School of Law, Soong, Lapu-Lapu City';
      const blocks = [
        { step: 1, title: 'Appointment', rows: [
          ['date', 'Date', this.formatDate(f.date)],
          ['time', 'Time', f.time && formatSlot(f.time)],
          ['date', 'Where', where],
        ] },
        { step: 2, title: 'Personal information', rows: [
          ['lastName', 'Name', this.fullName],
          ['dob', 'Date of birth', f.dob && this.formatDate(f.dob) + (this.age !== '' ? ` (${tr('age {age}', { age: this.age })})` : '')],
          ['mobile', 'Contact', [f.mobile, this.shown('email') && f.email].filter(Boolean).join(' · ')],
          ['address', 'Address', [f.address, this.shown('barangay') && f.barangay, this.shown('city') && f.city].filter(Boolean).join(', ')],
        ] },
        { step: 3, title: 'Household', rows: [
          ['household', 'Members', f.household.length],
          ['household', 'Monthly income', this.peso(this.householdTotal)],
          ['sectors', 'Sectors', this.list(f.sectors, f.sectorOther)],
        ] },
        { step: 4, title: 'Legal issue', rows: [
          ['practiceAreas', 'Category', this.list(f.practiceAreas, f.practiceOther)],
          ['assistance', 'Assistance', this.list(f.assistance)],
          ['opposingParty', 'Opposing party', f.opposingName],
        ] },
        { step: 5, title: 'Case facts', rows: [
          ['narrative', 'Narrative', f.narrative.length > 140 ? f.narrative.slice(0, 140) + '…' : f.narrative],
          ['documents', 'Documents', this.list(f.documents, f.documentsOther)],
        ] },
      ];
      return blocks
        .filter((b) => this.activeSteps.includes(b.step))
        .map((b) => ({ ...b, rows: b.rows.filter(([key]) => this.shown(key)).map(([, label, value]) => [label, value]) }))
        .filter((b) => b.rows.length);
    },

    peso(n) {
      return '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 });
    },

    formatDate(value) {
      return value ? this.$store.i18n.formatDate(value) : '—';
    },

    // Option values are saved in English; show them in the current language.
    list(values, other) {
      const all = [...values.map((v) => this.tr(v)), other && this.tr('Other: {text}', { text: other })].filter(Boolean);
      return all.length ? all.join(', ') : '—';
    },

    addMember() {
      this.form.household.push({ name: '', relationship: '', source: '', amount: '' });
    },

    removeMember(i) {
      this.form.household.splice(i, 1);
    },

    onFiles(event) {
      this.form.files = [...event.target.files].map((f) => f.name);
    },

    // ---------- Validation and navigation ----------

    // Returns an errors object for the given step (keys match INTAKE_FIELDS); empty = valid.
    // Required questions must be answered; anything typed in must also look right (mobile, email, dates).
    validate(step) {
      const f = this.form;
      const e = {};
      const blank = (v) => !String(v ?? '').trim();
      const need = (key) => this.isRequired(key);
      const tr = (k) => this.tr(k);
      const answer = tr('Please answer this question.');
      const pickOne = tr('Choose at least one.');

      if (step === 1) {
        if (!f.date) e.date = tr('Pick a preferred date.');
        else if (!this.isAvailable(f.date)) e.date = tr('Pick an available date on the calendar.');
        if (!f.time || !this.availableSlots.includes(f.time)) e.time = tr('Choose a time slot.');
      }

      if (step === 2) {
        const textFields = {
          lastName: 'Enter your last name.', firstName: 'Enter your first name.', address: 'Enter your complete address.',
          barangay: 'Enter your barangay.', city: 'Enter your city or municipality.',
          middleName: '', nickname: '', citizenship: '', religion: '', language: '', occupation: '', disability: '',
        };
        for (const [key, message] of Object.entries(textFields)) if (need(key) && blank(f[key])) e[key] = message ? tr(message) : answer;
        if (need('dob') && !f.dob) e.dob = tr('Enter your date of birth.');
        else if (f.dob && f.dob > this.today) e.dob = tr('Date of birth cannot be in the future.');
        if (need('sex') && !f.sex) e.sex = tr('Choose one.');
        if (need('civilStatus') && !f.civilStatus) e.civilStatus = tr('Choose your civil status.');
        if (need('education') && !f.education) e.education = tr('Choose one.');
        if (need('residentLLC') && !f.residentLLC) e.residentLLC = tr('Choose one.');
        const mobile = f.mobile.replace(/[\s-]/g, '');
        if ((need('mobile') || mobile) && !/^(09|\+639)\d{9}$/.test(mobile)) e.mobile = tr('Enter a mobile number like 0917 000 0000.');
        if (need('email') && blank(f.email)) e.email = tr('Enter a valid email address.');
        else if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = tr(need('email') ? 'Enter a valid email address.' : 'Enter a valid email address, or leave it blank.');
      }

      if (step === 3) {
        if (this.shown('household')) {
          if (f.household.some((row) => row.amount !== '' && Number(row.amount) < 0)) e.household = tr('Monthly amounts cannot be negative.');
          else if (need('household') && f.household.some((row) => blank(row.name))) e.household = tr('Enter a name for each household member.');
        }
        if (need('property') && f.ownsOtherProperty === 'Yes' && f.propertyValue === '') e.propertyValue = tr('Enter the estimated net value.');
        if (need('property') && f.hasOtherAssets === 'Yes' && f.assetsValue === '') e.assetsValue = tr('Enter the estimated net value.');
        if (need('sectors') && !f.sectors.length && blank(f.sectorOther)) e.sectors = pickOne;
      }

      if (step === 4) {
        if (need('practiceAreas') && !f.practiceAreas.length && blank(f.practiceOther)) e.practiceAreas = tr('Choose at least one category, or describe it under "Other / not sure".');
        if (need('assistance') && !f.assistance.length) e.assistance = tr('Choose the kind of help you need.');
        if (need('opposingParty') && blank(f.opposingName)) e.opposingParty = tr('The other party\'s name is required for the conflict-of-interest check.');
        if (need('priorConsult') && f.priorConsult === 'Yes' && blank(f.priorConsultDetails)) e.priorConsultDetails = tr('Tell us who you consulted.');
      }

      if (step === 5) {
        if (need('narrative') && f.narrative.trim().length < 30) e.narrative = tr('Tell us a little more about what happened (a few sentences at least).');
        if (need('personsInvolved') && blank(f.personsInvolved)) e.personsInvolved = answer;
        if (need('incident') && !f.incidentDate) e.incident = tr('Enter the date it happened.');
        else if (f.incidentDate && f.incidentDate > this.today) e.incident = tr('The date cannot be in the future.');
        if (need('existingDocuments') && blank(f.existingDocuments)) e.existingDocuments = answer;
        if (need('caseFiled') && f.caseFiled === 'Yes' && blank(f.caseDetails)) e.caseDetails = tr('Enter the court and case number, if you know them.');
        if (need('pendingHearing') && f.pendingHearing === 'Yes' && !f.hearingDate) e.hearingDate = tr('Enter the hearing or deadline date.');
        if (need('referralSources') && !f.referralSources.length && blank(f.referralOther)) e.referralSources = pickOne;
        if (need('documents') && !f.documents.length && blank(f.documentsOther)) e.documents = pickOne;
        if (need('attachments') && !f.files.length) e.attachments = tr('Attach at least one file.');
      }

      if (step === 6) {
        if (f.privacyConsent !== 'agree') e.privacyConsent = tr('We can only process an online request if you agree to the data privacy terms.');
        if (!f.declarationTrue || !f.declarationNoRelationship) e.declaration = tr('Please tick both declarations.');
        if (f.signature.trim().length < 3) e.signature = tr('Type your full name as your signature.');
      }
      return e;
    },

    next() {
      this.errors = this.validate(this.step);
      if (Object.keys(this.errors).length) return this.focusFirstError();
      this.step = this.activeSteps[this.position] ?? this.lastStep;
      // Prefill the "Self" row of the household table with the applicant's name.
      if (this.step === 3 && !this.form.household[0].name) this.form.household[0].name = this.fullName;
      this.scrollTop();
    },

    back() {
      this.errors = {};
      this.step = this.activeSteps[this.position - 2] ?? this.activeSteps[0];
      this.scrollTop();
    },

    // Jump back to any completed step (stepper and "Edit" links on the review step).
    goTo(target) {
      if (target < this.step && !this.submitted) {
        this.errors = {};
        this.step = target;
        this.scrollTop();
      }
    },

    async submit() {
      for (const s of this.activeSteps) {
        const errs = this.validate(s);
        if (Object.keys(errs).length) {
          this.step = s;
          this.errors = errs;
          return this.focusFirstError();
        }
      }
      this.submitting = true;
      try {
        this.reference = await this.sendRequest(this.toPayload());
        this.submitted = true;
        this.scrollTop();
      } finally {
        this.submitting = false;
      }
    },

    // Shapes the answers by section of form SNMC-CIF-001, so staff can map them to the paper form.
    // Answers are always in English; `language` records which language the client used.
    toPayload() {
      const f = JSON.parse(JSON.stringify(this.form));
      return {
        formNo: 'SNMC-CIF-001',
        submittedAt: new Date().toISOString(),
        language: this.$store.i18n.lang,
        hiddenFields: this.settings.hidden_fields,
        appointment: { date: f.date, time: f.time && formatSlot(f.time), firstTime: f.firstTime },
        B_personal: {
          lastName: f.lastName, firstName: f.firstName, middleName: f.middleName, nickname: f.nickname,
          dateOfBirth: f.dob, age: this.age, sex: f.sex, civilStatus: f.civilStatus,
          citizenship: f.citizenship, religion: f.religion, education: f.education, language: f.language,
          occupation: f.occupation, disability: f.disability, mobile: f.mobile, email: f.email,
          address: f.address, barangay: f.barangay, city: f.city, residentOfLapuLapu: f.residentLLC,
        },
        C_household: {
          members: f.household,
          totalMembers: f.household.length,
          totalMonthlyIncome: this.householdTotal,
          otherProperty: f.ownsOtherProperty === 'Yes' ? { netValue: f.propertyValue } : 'No',
          otherAssets: f.hasOtherAssets === 'Yes' ? { netValue: f.assetsValue } : 'None',
        },
        D_sectors: { sectors: f.sectors, other: f.sectorOther },
        E_conflictCheck: {
          priorConsultation: f.priorConsult === 'Yes' ? { details: f.priorConsultDetails } : 'No',
          opposingPartyConsultedClinic: f.opposingConsulted,
        },
        F_legalIssue: {
          practiceAreas: f.practiceAreas, other: f.practiceOther, requestedAssistance: f.assistance,
          opposingParty: { names: f.opposingName, relationship: f.opposingRelationship, addressPhone: f.opposingContact },
          currentlyRepresentedByAttorney: f.represented,
        },
        G_caseFacts: {
          narrative: f.narrative, personsInvolved: f.personsInvolved,
          incident: { date: f.incidentDate, place: f.incidentPlace },
          existingDocuments: f.existingDocuments,
          caseFiled: f.caseFiled === 'Yes' ? { courtAndCaseNo: f.caseDetails } : 'No',
          pendingHearing: f.pendingHearing === 'Yes' ? { date: f.hearingDate, courtVenue: f.hearingVenue } : 'No',
          referralSources: f.referralSources, referralOther: f.referralOther,
        },
        H_privacyConsent: f.privacyConsent === 'agree' ? 'I AGREE' : 'I DO NOT AGREE',
        I_declaration: { signature: f.signature, date: this.today },
        K_documents: { checklist: f.documents, additional: f.documentsOther, attachedFiles: f.files },
      };
    },

    /*
     * TODO: send the request somewhere real (e.g. Formspree, Google Apps Script, or a PHP
     * endpoint on the host). Return the reference number shown to the client.
     * Note: `attachedFiles` only holds file NAMES; uploading files needs a FormData POST.
     */
    async sendRequest(payload) {
      console.info('[intake] submission (not sent anywhere yet):', payload);
      await new Promise((r) => setTimeout(r, 600));
      const n = String(Math.floor(Math.random() * 9000) + 1000);
      return `SNMC-${new Date().getFullYear()}-${n}`;
    },

    focusFirstError() {
      this.$nextTick(() => {
        const el = this.$root.querySelector('[aria-invalid="true"]');
        if (el) el.focus();
      });
    },

    scrollTop() {
      this.$nextTick(() => this.$root.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    },
  }));
});
