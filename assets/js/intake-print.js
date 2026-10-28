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

document.addEventListener('alpine:init', () => {
  Alpine.data('intakePrint', () => ({
    loading: true,
    error: '',
    row: null,
    a: {}, // booking.json
    me: Auth.user,
    options: INTAKE_OPTIONS,

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
      if (!b.lastName && !b.firstName) return this.row?.title || '';
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
      return [this.B.barangay, this.B.city].filter(Boolean).join(' / ');
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
