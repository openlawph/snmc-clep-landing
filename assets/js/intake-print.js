/*
 * Printable intake form (clinic-intake-print.html#<appointment id>): the clinic's Unified Client Intake Form
 * (SNMC-CIF-001) filled in from the appointment, ready for the browser's Print / Save as PDF.
 * Usage: <body x-data="intakePrint">. Needs auth.js, appointments.js (formatSchedule, manilaParts, personName)
 * and intake.js (INTAKE_OPTIONS); load BEFORE Alpine.
 *
 * Answers come from the booking's `json` (see toPayload in intake.js). Appointments added by staff have no
 * answers, so only the administrative section and the contact details are filled; the rest is left to write in.
 * Section A is completed from the appointment itself: date, case file number, the assigned LSP and supervising
 * lawyer, and the signed-in staff member as interviewer. Section J is always left blank (staff assessment).
 */

const BLANK_LINES = 5;

// SNMC-CIF-001 is a fixed form, so its lists stay as printed even though the online form now uses Annex D's wording.
const CIF_OPTIONS = {
  practiceAreas: [
    'Criminal', 'Civil', 'Labor / Employment', 'Family / Custody / VAWC', 'Administrative',
    'Human Rights', 'Environmental', 'Land Dispute / Property', 'Cyberlibel / Online Harassment',
    'Drug-Related Case (RA 9165)', 'Children in Conflict with the Law (CICL)',
  ],
  assistance: ['Legal Advice', 'Limited Legal Service / Drafting', 'Continuing Representation', 'Legal Referral'],
  referralSources: ['Barangay VAWC', 'PNP', 'CSWDO', 'RTC', 'PAO', 'Friend / Relative', 'Social Media'],
};

// Which box on the form an online answer ticks. An answer the form has no box for is printed under "Other".
const CIF_FROM_ONLINE = {
  'Criminal Law': 'Criminal', 'Civil Dispute': 'Civil', 'Labor and Employment': 'Labor / Employment', 'Family Law': 'Family / Custody / VAWC',
  'Violence Against Women and Children': 'Family / Custody / VAWC', 'Government or Administrative Matter': 'Administrative',
  'Environmental Law': 'Environmental', 'Land or Property': 'Land Dispute / Property',
  'Document Preparation': 'Limited Legal Service / Drafting', Representation: 'Continuing Representation', Referral: 'Legal Referral',
  Court: 'RTC', "Public Attorney's Office": 'PAO', 'Friend or Relative': 'Friend / Relative',
};

// Answers (old or new wording) → { ticked: boxes on the form, others: answers with no box }.
function cifSplit(kind, answers) {
  const boxes = CIF_OPTIONS[kind];
  const ticked = [];
  const others = [];
  for (const answer of Array.isArray(answers) ? answers : []) {
    const box = boxes.includes(answer) ? answer : CIF_FROM_ONLINE[answer];
    if (box && boxes.includes(box)) ticked.push(box);
    else others.push(answer);
  }
  return { ticked, others };
}

document.addEventListener('alpine:init', () => {
  Alpine.data('intakePrint', () => ({
    loading: true,
    error: '',
    row: null,
    a: {}, // booking.json
    me: Auth.user,
    options: { ...INTAKE_OPTIONS, ...CIF_OPTIONS },

    async init() {
      const id = location.hash.slice(1);
      if (!/^[a-z0-9]{15}$/.test(id)) {
        this.error = 'No appointment was chosen. Open this from an appointment\'s "Print intake form" button.';
        this.loading = false;
        return;
      }
      try {
        const [row, booking] = await Promise.all([
          pb.collection('appointments_overview').getOne(id, { requestKey: null }),
          pb.collection('appointments').getOne(id, { requestKey: null }),
        ]);
        this.row = row;
        this.a = booking.json && typeof booking.json === 'object' ? booking.json : {};
        document.title = `Intake form · ${row.reference || row.title}`;
      } catch (err) {
        this.error = err?.status === 404 ? 'This appointment no longer exists.' : 'The appointment couldn\'t be loaded. Check your connection and try again.';
      } finally {
        this.loading = false;
      }
    },

    // ---------- Helpers used by the markup ----------

    get B() { return this.a.B_personal || {}; },
    get C() { return this.a.C_household || {}; },
    get F() { return this.a.F_legalIssue || {}; },
    get G() { return this.a.G_caseFacts || {}; },
    get E() { return this.a.E_conflictCheck || {}; },
    get D() { return this.a.annexD || {}; },

    get areas() { return cifSplit('practiceAreas', this.F.practiceAreas); },
    get help() { return cifSplit('assistance', this.F.requestedAssistance); },
    get heard() { return cifSplit('referralSources', this.G.referralSources); },
    get areasOther() { return [...this.areas.others, this.F.other].filter(Boolean).join(', '); },
    get helpOther() { return [...this.help.others, this.F.requestedOther].filter(Boolean).join(', '); },
    get heardOther() { return [...this.heard.others, this.G.referralOther].filter(Boolean).join(', '); },

    // Answers can be a string or a { details } object (the "Yes — details" questions).
    yes: (v) => (v && typeof v === 'object') || v === 'Yes',
    no: (v) => v === 'No' || v === 'None',
    detail: (v, key) => (v && typeof v === 'object' ? v[key] || '' : ''),

    has: (list, item) => Array.isArray(list) && list.includes(item),
    box: (on) => (on ? '[ ✓ ]' : '[   ]'),
    list: (items, other) => [...(Array.isArray(items) ? items : []), other].filter(Boolean).join(', '),
    peso: (n) => (n || n === 0 ? Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : ''),

    // 03/25/1999 style, as the paper form asks (MM/DD/YYYY).
    mdy(iso) {
      const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
      return m ? `${m[2]}/${m[3]}/${m[1]}` : iso || '';
    },

    get fullName() {
      const b = this.B;
      if (b.fullName) return b.fullName; // started from Annex C, which has one line for the name
      if (!b.lastName && !b.firstName) return (this.row?.title || '').split(' — ')[0];
      return [b.lastName, b.firstName, b.middleName].filter(Boolean).join(', ');
    },

    get intakeDate() {
      return this.row?.scheduled_at ? formatSchedule(this.row.scheduled_at, { time: false }) : '';
    },

    get timeStarted() {
      return this.row?.scheduled_at ? manilaParts(this.row.scheduled_at).time : '';
    },

    get interviewer() {
      return this.me?.name || this.me?.email || '';
    },

    // The household table always shows at least the five rows of the paper form.
    get householdRows() {
      const rows = Array.isArray(this.C.members) ? this.C.members.filter((m) => m.name || m.source || m.amount) : [];
      return [...rows, ...Array(Math.max(0, BLANK_LINES - rows.length)).fill({})];
    },

    get contact() {
      const b = this.B;
      return [b.mobile || this.row?.mobile_no, b.email || this.row?.email].filter(Boolean).join(' / ');
    },

    get locationLine() {
      return [this.B.barangay, this.B.city, this.B.province].filter(Boolean).join(' / ');
    },

    get urgencyFlags() {
      return (this.D.urgency?.flags || []).filter((flag) => !/none of the above/i.test(flag));
    },

    get preferredContact() {
      return [...(this.D.preferredContact || []), this.D.preferredContactOther].filter(Boolean).join(', ');
    },

    get firstTimeNote() {
      const first = this.a.appointment?.firstTime;
      return first === 'No' ? 'Follow-up visit (returning client)' : first === 'Yes' ? 'First visit' : '';
    },

    print() {
      window.print();
    },
  }));
});
