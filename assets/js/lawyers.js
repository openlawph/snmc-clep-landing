/*
 * Lawyers page (clinic-lawyers.html): list, add, edit and delete records in the PocketBase
 * `lawyers` collection. Usage: <body x-data="lawyers">. Needs auth.js and crud.js; load BEFORE Alpine.
 *
 * API rules in PocketBase: verified staff can view; only admins (role = "admin") can add, edit
 * and delete. This page hides those buttons for everyone else.
 */

// Must match the `status` select values in PocketBase.
const LAWYER_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'inactive', label: 'Inactive' },
];

const emptyLawyerForm = () => ({
  fname: '', lname: '', email: '', contactno: '',
  active_cases: '', archived_cases: '', ulas_creditable_hrs: '',
  status: 'active',
});

document.addEventListener('alpine:init', () => {
  Alpine.data('lawyers', () => crudPage({
    collection: 'lawyers',
    singular: 'lawyer',
    plural: 'lawyers',
    searchFields: ['fname', 'lname', 'email', 'contactno'],
    filters: { statusFilter: '' },
    sortKey: 'lname,fname',
    sortDir: 'asc',
  }, {
    statuses: LAWYER_STATUSES,
    me: Auth.user,
    columns: [
      { key: 'lname,fname', label: 'Name', sortable: true },
      { key: 'contactno', label: 'Contact', sortable: false },
      { key: 'active_cases', label: 'Active cases', sortable: true, numeric: true },
      { key: 'archived_cases', label: 'Archived cases', sortable: true, numeric: true },
      { key: 'ulas_creditable_hrs', label: 'ULAS hours', sortable: true, numeric: true },
      { key: 'status', label: 'Status', sortable: true },
    ],

    // Add / edit dialog
    editing: null, // the record being edited, or null when adding
    form: emptyLawyerForm(),
    formErrors: {},
    formError: '',
    saving: false,

    init() {
      pb.authStore.onChange(() => (this.me = pb.authStore.record));
    },

    get isAdmin() {
      return this.me?.role === 'admin';
    },

    extraFilters() {
      return this.statusFilter ? [pb.filter('status = {:s}', { s: this.statusFilter })] : [];
    },

    displayName(lawyer) {
      return [lawyer?.fname, lawyer?.lname].filter(Boolean).join(' ') || lawyer?.email || '';
    },

    initials(lawyer) {
      return ((lawyer?.fname || '').charAt(0) + (lawyer?.lname || '').charAt(0)).toUpperCase() || '?';
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

    formatHours(value) {
      return Number(value || 0).toLocaleString('en-PH', { maximumFractionDigits: 2 });
    },

    // ---------- Add / edit ----------

    openCreate() {
      this.editing = null;
      this.resetForm(emptyLawyerForm());
      this.$refs.formDialog.showModal();
    },

    openEdit(lawyer) {
      this.editing = lawyer;
      this.resetForm({
        fname: lawyer.fname || '', lname: lawyer.lname || '', email: lawyer.email || '', contactno: lawyer.contactno || '',
        active_cases: lawyer.active_cases ?? '', archived_cases: lawyer.archived_cases ?? '',
        ulas_creditable_hrs: lawyer.ulas_creditable_hrs ?? '', status: lawyer.status || 'active',
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
      if (!wholeNumber(f.active_cases)) e.active_cases = 'Use a whole number, 0 or more.';
      if (!wholeNumber(f.archived_cases)) e.archived_cases = 'Use a whole number, 0 or more.';
      if (f.ulas_creditable_hrs !== '' && !(Number(f.ulas_creditable_hrs) >= 0)) e.ulas_creditable_hrs = 'Use a number, 0 or more.';
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
        active_cases: num(f.active_cases),
        archived_cases: num(f.archived_cases),
        ulas_creditable_hrs: num(f.ulas_creditable_hrs),
        status: f.status,
      };
    },

    async save() {
      if (!this.validate()) return;
      this.saving = true;
      this.formError = '';
      const lawyers = pb.collection('lawyers');
      try {
        if (!this.editing) {
          const record = await lawyers.create(this.payload());
          this.flash(`${this.displayName(record)} was added.`);
        } else {
          const record = await lawyers.update(this.editing.id, this.payload());
          this.flash(`Changes to ${this.displayName(record)} were saved.`);
        }
        this.closeForm();
        this.load();
      } catch (err) {
        this.formErrors = this.fieldErrorsFrom(err);
        this.formError = Object.keys(this.formErrors).length ? 'Please fix the highlighted fields.' : this.messageFor(err, 'save');
      } finally {
        this.saving = false;
      }
    },
  }));
});
