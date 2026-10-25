/*
 * Booking + client intake wizard (index.html).
 * Usage: <form x-data="intake" …>. Must load BEFORE Alpine (it registers on `alpine:init`).
 *
 * Fields follow the clinic's Unified Client Intake Form (Form No. SNMC-CIF-001).
 * The client fills in Sections B–I and K online. Sections A (administrative) and
 * J (assessment) are for clinic staff and are completed at the intake interview.
 *
 * The form is UI-only for now: submit() validates, builds the payload (toPayload) and
 * shows the "Request received" screen. Wire the real submission up in sendRequest() below.
 */

// Set to true to turn required-field validation back on (step checks + consent/signature gate on Submit).
const INTAKE_VALIDATION = false;

// Checkbox/radio choices, copied from the paper form. Edit here to change the options.
const INTAKE_OPTIONS = {
  timeSlots: ['1:00 PM', '2:00 PM', '3:00 PM', '4:00 PM'],
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

document.addEventListener('alpine:init', () => {
  Alpine.data('intake', () => ({
    opt: INTAKE_OPTIONS,
    step: 1,
    steps: ['Book a slot', 'Personal information', 'Household & sector', 'Legal issue', 'Case facts', 'Consent & declaration'],
    headings: [
      'Choose your consultation slot',
      'Tell us about you',
      'Your household',
      'What is your legal concern?',
      'What happened?',
      'Review and submit',
    ],
    consultationDays: [2, 4], // Tuesday, Thursday (Date#getDay)
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

    get today() {
      const d = new Date(); // local date, as YYYY-MM-DD (same format as <input type="date">)
      return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    },

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

    get canSubmit() {
      if (!INTAKE_VALIDATION) return true;
      const f = this.form;
      return f.privacyConsent === 'agree' && f.declarationTrue && f.declarationNoRelationship && f.signature.trim().length >= 3;
    },

    peso(n) {
      return '₱' + Number(n || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 });
    },

    formatDate(value) {
      if (!value) return '—';
      const [y, m, d] = value.split('-').map(Number);
      return new Date(y, m - 1, d).toLocaleDateString('en-GB', {
        weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
      });
    },

    list(values, other) {
      const all = [...values, other && `Other: ${other}`].filter(Boolean);
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

    // Returns an errors object for the given step; empty object = valid.
    validate(step) {
      if (!INTAKE_VALIDATION) return {};
      const f = this.form;
      const e = {};
      const blank = (v) => !String(v).trim();

      if (step === 1) {
        if (!f.date) {
          e.date = 'Pick a preferred date.';
        } else {
          const [y, m, d] = f.date.split('-').map(Number);
          const day = new Date(y, m - 1, d).getDay();
          if (f.date < this.today) e.date = 'Pick a date from today onwards.';
          else if (!this.consultationDays.includes(day)) e.date = 'Consultations are on Tuesdays and Thursdays only.';
        }
        if (!f.time) e.time = 'Choose a time slot.';
      }

      if (step === 2) {
        if (blank(f.lastName)) e.lastName = 'Enter your last name.';
        if (blank(f.firstName)) e.firstName = 'Enter your first name.';
        if (!f.dob) e.dob = 'Enter your date of birth.';
        else if (f.dob > this.today) e.dob = 'Date of birth cannot be in the future.';
        if (!f.sex) e.sex = 'Choose one.';
        if (!f.civilStatus) e.civilStatus = 'Choose your civil status.';
        if (!/^(09|\+639)\d{9}$/.test(f.mobile.replace(/[\s-]/g, ''))) e.mobile = 'Enter a mobile number like 0917 000 0000.';
        if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(f.email)) e.email = 'Enter a valid email address, or leave it blank.';
        if (blank(f.address)) e.address = 'Enter your complete address.';
        if (blank(f.barangay)) e.barangay = 'Enter your barangay.';
        if (blank(f.city)) e.city = 'Enter your city or municipality.';
        if (!f.residentLLC) e.residentLLC = 'Choose one.';
      }

      if (step === 3) {
        if (f.household.some((row) => row.amount !== '' && Number(row.amount) < 0)) e.household = 'Monthly amounts cannot be negative.';
        if (f.ownsOtherProperty === 'Yes' && f.propertyValue === '') e.propertyValue = 'Enter the estimated net value.';
        if (f.hasOtherAssets === 'Yes' && f.assetsValue === '') e.assetsValue = 'Enter the estimated net value.';
      }

      if (step === 4) {
        if (!f.practiceAreas.length && blank(f.practiceOther)) e.practiceAreas = 'Choose at least one category, or describe it under "Other".';
        if (!f.assistance.length) e.assistance = 'Choose the kind of help you need.';
        if (blank(f.opposingName)) e.opposingName = "The other party's name is required for the conflict-of-interest check.";
        if (f.priorConsult === 'Yes' && blank(f.priorConsultDetails)) e.priorConsultDetails = 'Tell us who you consulted.';
      }

      if (step === 5) {
        if (f.narrative.trim().length < 30) e.narrative = 'Tell us a little more about what happened (a few sentences at least).';
        if (f.caseFiled === 'Yes' && blank(f.caseDetails)) e.caseDetails = 'Enter the court and case number, if you know them.';
        if (f.pendingHearing === 'Yes' && !f.hearingDate) e.hearingDate = 'Enter the hearing or deadline date.';
      }

      if (step === 6) {
        if (f.privacyConsent !== 'agree') e.privacyConsent = 'We can only process an online request if you agree to the data privacy terms.';
        if (!f.declarationTrue || !f.declarationNoRelationship) e.declaration = 'Please tick both declarations.';
        if (f.signature.trim().length < 3) e.signature = 'Type your full name as your signature.';
      }
      return e;
    },

    next() {
      this.errors = this.validate(this.step);
      if (Object.keys(this.errors).length) return this.focusFirstError();
      this.step++;
      // Prefill the "Self" row of the household table with the applicant's name.
      if (this.step === 3 && !this.form.household[0].name) this.form.household[0].name = this.fullName;
      this.scrollTop();
    },

    back() {
      this.errors = {};
      this.step--;
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
      for (let s = 1; s <= this.steps.length; s++) {
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
    toPayload() {
      const f = JSON.parse(JSON.stringify(this.form));
      return {
        formNo: 'SNMC-CIF-001',
        submittedAt: new Date().toISOString(),
        appointment: { date: f.date, time: f.time, firstTime: f.firstTime },
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
