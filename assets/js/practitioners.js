/*
 * Practitioners page (clinic-practitioners.html): law student practitioners (LSP) in the PocketBase
 * `practitioners` collection. Usage: <body x-data="practitioners">. Needs auth.js and crud.js; load BEFORE Alpine.
 *
 * API rules in PocketBase: verified staff can view; only admins (role = "admin") can add, edit
 * and delete. This page hides those buttons for everyone else.
 */

// Must match the `level` and `status` select values in PocketBase.
const PRACTITIONER_LEVELS = ['Level 1', 'Level 2']; // Rule 138-A
const PRACTITIONER_STATUSES = [
  { value: 'active', label: 'Active' },
  { value: 'occupied', label: 'Occupied' },
  { value: 'inactive', label: 'Inactive' },
];

const emptyPractitionerForm = () => ({
  fname: '', lname: '', email: '', contactno: '', level: 'Level 1',
  active_cases: '', archived_cases: '', status: 'active',
});

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
    statuses: PRACTITIONER_STATUSES,
    me: Auth.user,
    columns: [
      { key: 'lname,fname', label: 'Name', sortable: true },
      { key: 'level', label: 'Level', sortable: true },
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

    init() {
      pb.authStore.onChange(() => (this.me = pb.authStore.record));
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

    // ---------- Add / edit ----------

    openCreate() {
      this.editing = null;
      this.resetForm(emptyPractitionerForm());
      this.$refs.formDialog.showModal();
    },

    openEdit(p) {
      this.editing = p;
      this.resetForm({
        fname: p.fname || '', lname: p.lname || '', email: p.email || '', contactno: p.contactno || '',
        level: p.level || 'Level 1', active_cases: p.active_cases ?? '', archived_cases: p.archived_cases ?? '',
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
      } catch (err) {
        this.formErrors = this.fieldErrorsFrom(err);
        this.formError = Object.keys(this.formErrors).length ? 'Please fix the highlighted fields.' : this.messageFor(err, 'save');
      } finally {
        this.saving = false;
      }
    },
  }));
});
