/*
 * Practitioners page (clinic-practitioners.html): law student practitioners (LSP) in the PocketBase
 * `practitioners` collection. Usage: <body x-data="practitioners">. Needs auth.js and crud.js; load BEFORE Alpine.
 *
 * API rules in PocketBase: verified staff can view; only admins (role = "admin") can add, edit
 * and delete. This page hides those buttons for everyone else.
 *
 * Semesters (the `semesters` collection, managed in the "Semesters" card on this page): each LSP belongs
 * to one (`semester_id`). The night after a semester's end date, the PocketBase job in
 * pocketbase/pb_hooks/semester-end.pb.js sets its LSPs to Inactive.
 */

// Must match the `level`, `year_level` and `status` select values in PocketBase.
const PRACTITIONER_LEVELS = ['Level 1', 'Level 2']; // Rule 138-A
const PRACTITIONER_YEAR_LEVELS = ['1st year', '2nd year', '3rd year', '4th year']; // year in law school
const SEMESTER_NAMES = ['1st semester', '2nd semester', 'Summer']; // `semester` select values in `semesters`
const PRACTITIONER_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'inactive', label: 'Inactive' },
];

const emptyPractitionerForm = () => ({
  fname: '', lname: '', email: '', contactno: '', level: 'Level 1', year_level: '', semester_id: '',
  active_cases: '', archived_cases: '', status: 'active',
});

const emptySemesterForm = () => ({ school_year: '', semester: '', end_date: '' });

// Today's date at the clinic (Manila) as 'YYYY-MM-DD', whatever time zone this device is in.
const manilaToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(new Date());

document.addEventListener('alpine:init', () => {
  Alpine.data('practitioners', () => crudPage({
    collection: 'practitioners',
    singular: 'practitioner',
    plural: 'practitioners',
    searchFields: ['fname', 'lname', 'email', 'contactno'],
    filters: { statusFilter: '', levelFilter: '' },
    sortKey: 'lname,fname',
    sortDir: 'asc',
  }, {
    levels: PRACTITIONER_LEVELS,
    yearLevels: PRACTITIONER_YEAR_LEVELS,
    statuses: PRACTITIONER_STATUSES,
    me: Auth.user,
    columns: [
      { key: 'lname,fname', label: 'Name', sortable: true },
      { key: 'level', label: 'Level', sortable: true },
      { key: 'year_level', label: 'Year level', sortable: true },
      { key: 'semester_id.end_date', label: 'School year', sortable: true },
      { key: 'contactno', label: 'Contact', sortable: false },
      { key: 'active_cases', label: 'Active cases', sortable: true, numeric: true },
      { key: 'archived_cases', label: 'Archived cases', sortable: true, numeric: true },
      { key: 'status', label: 'Status', sortable: true },
    ],

    // Add / edit dialog
    editing: null, // the record being edited, or null when adding
    form: emptyPractitionerForm(),
    formErrors: {},
    formError: '',
    saving: false,

    // Semesters card, and the school year picker in the LSP form
    semesterNames: SEMESTER_NAMES,
    semesters: [], // newest end date first
    semesterCounts: {}, // semester id → number of LSPs in it
    semestersError: '',
    semesterEditing: null,
    semesterForm: emptySemesterForm(),
    semesterErrors: {},
    semesterError: '',
    savingSemester: false,
    semesterDeleteTarget: null,
    deletingSemester: false,
    semesterDeleteError: '',

    init() {
      pb.authStore.onChange(() => (this.me = pb.authStore.record));
      this.loadSemesters();
    },

    afterDelete() {
      this.loadSemesters(); // an LSP fewer in its semester
    },

    get isAdmin() {
      return this.me?.role === 'admin';
    },

    extraFilters() {
      const parts = [];
      if (this.statusFilter) parts.push(pb.filter('status = {:s}', { s: this.statusFilter }));
      if (this.levelFilter) parts.push(pb.filter('level = {:l}', { l: this.levelFilter }));
      return parts;
    },

    displayName(p) {
      return [p?.fname, p?.lname].filter(Boolean).join(' ') || p?.email || '';
    },

    initials(p) {
      return ((p?.fname || '').charAt(0) + (p?.lname || '').charAt(0)).toUpperCase() || '?';
    },

    statusLabel(value) {
      return this.statuses.find((s) => s.value === value)?.label || value || '—';
    },

    statusClass(value) {
      return {
        active: 'bg-emerald-600/10 text-emerald-800 ring-emerald-600/25',
        occupied: 'bg-amber/15 text-[#8a5a1c] ring-amber/30',
        inactive: 'bg-black/5 text-muted ring-black/10',
      }[value] || 'bg-black/5 text-muted ring-black/10';
    },

    // ---------- Semesters ----------

    async loadSemesters() {
      this.semestersError = '';
      try {
        // requestKey: null, so these don't cancel (or get cancelled by) the LSP list's own request.
        const [semesters, lsps] = await Promise.all([
          pb.collection('semesters').getFullList({ sort: '-end_date', requestKey: null }),
          pb.collection('practitioners').getFullList({ fields: 'semester_id', requestKey: null }),
        ]);
        this.semesters = semesters;
        this.semesterCounts = lsps.reduce((counts, p) => {
          if (p.semester_id) counts[p.semester_id] = (counts[p.semester_id] || 0) + 1;
          return counts;
        }, {});
      } catch (err) {
        if (err.isAbort) return;
        this.semestersError = this.messageFor(err, 'load');
      }
    },

    semesterById(id) {
      return this.semesters.find((s) => s.id === id) || null;
    },

    // '2026-2027' → 'SY 2026–2027'
    schoolYearLabel(sem) {
      return sem ? 'SY ' + sem.school_year.replace('-', '–') : '';
    },

    // '1st semester · SY 2026–2027 (ends Dec 15, 2026)', for the picker
    termLabel(sem) {
      if (!sem) return '';
      const ends = this.semesterEnded(sem) ? 'ended' : 'ends';
      return `${sem.semester} · ${this.schoolYearLabel(sem)} (${ends} ${this.formatDate(sem.end_date)})`;
    },

    // Ended = its end date is before today (Manila). Its LSPs go Inactive the night after the end date.
    semesterEnded(sem) {
      return !!sem && sem.end_date.slice(0, 10) < manilaToday();
    },

    // The semester new LSPs most likely belong to: the one ending soonest that hasn't ended.
    get currentSemesterId() {
      const open = this.semesters.filter((s) => !this.semesterEnded(s));
      return open.length ? open[open.length - 1].id : '';
    },

    openSemesterCreate() {
      this.semesterEditing = null;
      this.resetSemesterForm(emptySemesterForm());
      this.$refs.semesterDialog.showModal();
    },

    openSemesterEdit(sem) {
      this.semesterEditing = sem;
      this.resetSemesterForm({ school_year: sem.school_year, semester: sem.semester, end_date: sem.end_date.slice(0, 10) });
      this.$refs.semesterDialog.showModal();
    },

    resetSemesterForm(form) {
      this.semesterForm = form;
      this.semesterErrors = {};
      this.semesterError = '';
    },

    validateSemester() {
      const f = this.semesterForm;
      const e = {};
      const [from, to] = f.school_year.trim().split('-').map(Number);
      if (!/^\d{4}-\d{4}$/.test(f.school_year.trim()) || to !== from + 1) e.school_year = 'Use the form 2026-2027.';
      if (!f.semester) e.semester = 'Choose the semester.';
      if (!f.end_date) e.end_date = 'Enter the last day of the semester.';
      this.semesterErrors = e;
      return !Object.keys(e).length;
    },

    async saveSemester() {
      if (!this.validateSemester()) return;
      this.savingSemester = true;
      this.semesterError = '';
      const f = this.semesterForm;
      const data = { school_year: f.school_year.trim(), semester: f.semester, end_date: `${f.end_date} 00:00:00.000Z` };
      try {
        const collection = pb.collection('semesters');
        const sem = this.semesterEditing ? await collection.update(this.semesterEditing.id, data) : await collection.create(data);
        this.flash(`${sem.semester}, ${this.schoolYearLabel(sem)} was ${this.semesterEditing ? 'saved' : 'added'}.`);
        this.$refs.semesterDialog.close();
        this.loadSemesters();
      } catch (err) {
        // The unique index on (school_year, semester) reports on both fields.
        if (err?.response?.data?.school_year?.code === 'validation_not_unique' || err?.response?.data?.semester?.code === 'validation_not_unique') {
          this.semesterErrors = { semester: 'This semester is already in the list.' };
          this.semesterError = 'Please fix the highlighted fields.';
        } else {
          this.semesterErrors = this.fieldErrorsFrom(err);
          this.semesterError = Object.keys(this.semesterErrors).length ? 'Please fix the highlighted fields.' : this.messageFor(err, 'save');
        }
      } finally {
        this.savingSemester = false;
      }
    },

    askSemesterDelete(sem) {
      this.semesterDeleteTarget = sem;
      this.semesterDeleteError = '';
      this.$refs.semesterDeleteDialog.showModal();
    },

    async confirmSemesterDelete() {
      this.deletingSemester = true;
      this.semesterDeleteError = '';
      try {
        await pb.collection('semesters').delete(this.semesterDeleteTarget.id);
        this.flash(`${this.semesterDeleteTarget.semester}, ${this.schoolYearLabel(this.semesterDeleteTarget)} was deleted.`);
        this.$refs.semesterDeleteDialog.close();
        this.loadSemesters();
      } catch (err) {
        this.semesterDeleteError = this.messageFor(err, 'delete');
      } finally {
        this.deletingSemester = false;
      }
    },

    // ---------- Add / edit ----------

    openCreate() {
      this.editing = null;
      this.resetForm({ ...emptyPractitionerForm(), semester_id: this.currentSemesterId });
      this.$refs.formDialog.showModal();
    },

    openEdit(p) {
      this.editing = p;
      this.resetForm({
        fname: p.fname || '', lname: p.lname || '', email: p.email || '', contactno: p.contactno || '',
        level: p.level || 'Level 1', year_level: p.year_level || '', semester_id: p.semester_id || '', active_cases: p.active_cases ?? '', archived_cases: p.archived_cases ?? '',
        status: p.status || 'active',
      });
      this.$refs.formDialog.showModal();
    },

    resetForm(form) {
      this.form = form;
      this.formErrors = {};
      this.formError = '';
    },

    closeForm() {
      this.$refs.formDialog.close();
    },

    validate() {
      const f = this.form;
      const e = {};
      const wholeNumber = (v) => v === '' || (Number.isInteger(Number(v)) && Number(v) >= 0);
      if (!f.fname.trim()) e.fname = 'Enter the first name.';
      if (!f.lname.trim()) e.lname = 'Enter the last name.';
      if (f.email.trim() && !/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Enter a valid email address, or leave it blank.';
      if (!/^[0-9+()\- ]*$/.test(f.contactno)) e.contactno = 'Use digits, spaces and + - ( ) only.';
      if (!f.level) e.level = 'Choose a level.';
      if (!f.year_level) e.year_level = 'Choose a year level.';
      if (!f.semester_id) e.semester_id = 'Choose the school year and semester.';
      if (!wholeNumber(f.active_cases)) e.active_cases = 'Use a whole number, 0 or more.';
      if (!wholeNumber(f.archived_cases)) e.archived_cases = 'Use a whole number, 0 or more.';
      if (!f.status) e.status = 'Choose a status.';
      this.formErrors = e;
      return !Object.keys(e).length;
    },

    payload() {
      const f = this.form;
      const num = (v) => (v === '' ? 0 : Number(v));
      return {
        fname: f.fname.trim(),
        lname: f.lname.trim(),
        email: f.email.trim(),
        contactno: f.contactno.trim(),
        level: f.level,
        year_level: f.year_level,
        semester_id: f.semester_id,
        active_cases: num(f.active_cases),
        archived_cases: num(f.archived_cases),
        status: f.status,
      };
    },

    async save() {
      if (!this.validate()) return;
      this.saving = true;
      this.formError = '';
      const collection = pb.collection('practitioners');
      try {
        if (!this.editing) {
          const record = await collection.create(this.payload());
          this.flash(`${this.displayName(record)} was added.`);
        } else {
          const record = await collection.update(this.editing.id, this.payload());
          this.flash(`Changes to ${this.displayName(record)} were saved.`);
        }
        this.closeForm();
        this.load();
        this.loadSemesters(); // the LSP counts per semester
      } catch (err) {
        this.formErrors = this.fieldErrorsFrom(err);
        this.formError = Object.keys(this.formErrors).length ? 'Please fix the highlighted fields.' : this.messageFor(err, 'save');
      } finally {
        this.saving = false;
      }
    },
  }));
});
