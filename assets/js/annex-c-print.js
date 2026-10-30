/*
 * Printable Annex "C" (clinic-annex-c.html): the Request for Legal Assistance Form, word for word, ready for the
 * browser's Print / Save as PDF. Usage: <body x-data="annexCPrint">. Needs auth.js, appointments.js (formatSchedule),
 * clinic-records.js and intake-c.js (ANNEX_C); load BEFORE Alpine.
 *
 *   clinic-annex-c.html#<intake id>          filled in from intake_requests and its appointment
 *   clinic-annex-c.html?blank=<paper number> a blank form again, for a number that's been issued
 *   clinic-annex-c.html?issue                asks how many blank forms, issues the numbers (logged against whoever asks)
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('annexCPrint', () => ({
    loading: true,
    error: '',
    saved: false, // just saved from clinic-intake.html
    intake: null,
    row: null, // appointments_overview: the assignment and the schedule
    a: {}, // intake.json
    options: ANNEX_C,
    blanks: [], // reference numbers to print blank forms for
    issuing: false, // showing the "how many?" box
    issueCount: 5,
    issueError: '',
    issueBusy: false,

    async init() {
      const params = new URLSearchParams(location.search);
      this.saved = params.has('saved');
      if (params.has('issue')) {
        this.issuing = true;
        this.loading = false;
        return;
      }
      if (params.get('blank')) {
        this.blanks = [params.get('blank').toUpperCase()];
        this.loading = false;
        return;
      }
      const id = location.hash.slice(1);
      if (!/^[a-z0-9]{15}$/.test(id)) {
        this.error = 'No intake was chosen. Open this from an appointment\'s "Annex C" button.';
        this.loading = false;
        return;
      }
      try {
        this.intake = await pb.collection('intake_requests').getOne(id, { requestKey: null });
        this.row = await pb.collection('appointments_overview').getOne(this.intake.appointment_id, { requestKey: null });
        this.a = this.intake.json && typeof this.intake.json === 'object' ? this.intake.json : {};
        document.title = `Annex C · ${this.intake.reference}`;
      } catch (err) {
        this.error = err?.status === 404 ? 'This intake no longer exists.' : 'The intake couldn\'t be loaded. Check your connection and try again.';
      } finally {
        this.loading = false;
      }
    },

    async issue() {
      this.issueBusy = true;
      this.issueError = '';
      try {
        this.blanks = await issuePaperForms(pb.authStore.record, Number(this.issueCount));
        this.issuing = false;
      } catch (err) {
        this.issueError = err?.fields?.count || 'The numbers couldn\'t be issued. Please try again.';
      } finally {
        this.issueBusy = false;
      }
    },

    // ---------- Helpers used by the markup ----------

    box: (on) => (on ? '[ ✓ ]' : '[   ]'),
    has: (list, item) => Array.isArray(list) && list.includes(item),

    // One form per page: the filled one, or a blank one for each number.
    get forms() {
      return this.intake ? [{ reference: this.intake.reference, blank: false }] : this.blanks.map((reference) => ({ reference, blank: true }));
    },

    dateOf(value) {
      return value ? formatSchedule(value, { time: false }) : '';
    },

    get mobileLine() {
      return this.intake?.mobile_no || '';
    },

    get assignedTo() {
      if (!this.row) return '';
      return [this.row.lsp_name && `LSP: ${this.row.lsp_name}`, this.row.sl_name && `Supervising lawyer: ${this.row.sl_name}`].filter(Boolean).join('   ·   ');
    },

    get interviewSchedule() {
      return this.row?.scheduled_at ? formatSchedule(this.row.scheduled_at) : '';
    },

    get paperNote() {
      const i = this.intake;
      if (!i) return '';
      if (i.voided) return `VOIDED: ${i.void_reason}`;
      const parts = [];
      if (i.source === 'PAPER') parts.push(`Encoded from a paper form${i.paper_ref_written && i.paper_ref_written !== i.reference ? ` marked "${i.paper_ref_written}"` : ''}.`);
      if (this.row?.encoded_late) parts.push(`Filed late: ${i.late_reason}`);
      return parts.join(' ');
    },

    print() {
      window.print();
    },
  }));
});
