/*
 * Appointments page (clinic-appointments.html) + appointment helpers shared with the dashboard.
 * Usage: <body x-data="appointments">. Needs auth.js, crud.js and intake.js (makeAppointmentReference, normalizeMobile);
 * load BEFORE Alpine.
 *
 * PocketBase:
 *  - appointments           one booking: reference, title, email, mobile_no, scheduled_at, json (form answers)
 *  - appointments_status    history log, one row per change: app_status, remarks, lsp_id → practitioners,
 *                           sl_id → lawyers, user_id → the staff member who made the change
 *  - appointments_overview  view: every appointment with its latest status / LSP / SL (the list reads this)
 * Changing the status or the assignment adds a new status row; the history itself is never edited here.
 * Staff can add appointments, update them and add status rows; only admins can delete.
 */

// Must match the `app_status` select values in PocketBase.
const APPT_STATUSES = [
  { value: 'PENDING', label: 'Pending', badge: 'bg-amber/15 text-[#8a5a1c] ring-amber/30' },
  { value: 'SCHEDULED', label: 'Scheduled', badge: 'bg-sky-600/10 text-sky-800 ring-sky-600/25' },
  { value: 'WIP', label: 'In progress', badge: 'bg-violet-600/10 text-violet-800 ring-violet-600/25' },
  { value: 'DONE', label: 'Done', badge: 'bg-emerald-600/10 text-emerald-800 ring-emerald-600/25' },
  { value: 'CANCELLED', label: 'Cancelled', badge: 'bg-black/5 text-muted ring-black/10' },
];

const apptStatus = (value) => APPT_STATUSES.find((s) => s.value === value) || APPT_STATUSES[0];

// Appointment times are clinic (Manila) times, whatever time zone the viewer's device is in.
const CLINIC_TZ = 'Asia/Manila';

// PocketBase date → { date: 'YYYY-MM-DD', time: 'HH:MM' } in Manila time ({ '', '' } if empty).
function manilaParts(value) {
  if (!value) return { date: '', time: '' };
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: CLINIC_TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(value.replace(' ', 'T'))).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, time: `${parts.hour}:${parts.minute}` };
}

// Manila date ('YYYY-MM-DD') + time ('HH:MM') → PocketBase date string (UTC).
function manilaToUTC(date, time) {
  return new Date(`${date}T${time || '00:00'}:00+08:00`).toISOString().replace('T', ' ');
}

// Midnight today in Manila, as a PocketBase date string (for "upcoming" filters).
function manilaTodayStartUTC() {
  return manilaToUTC(manilaParts(new Date().toISOString()).date, '00:00');
}

// PocketBase date → "Tue, 27 Oct 2026 · 1:00 PM" (Manila time).
function formatSchedule(value, { time = true } = {}) {
  if (!value) return '';
  const d = new Date(value.replace(' ', 'T'));
  const day = d.toLocaleDateString('en-PH', { timeZone: CLINIC_TZ, weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  return time ? `${day} · ${d.toLocaleTimeString('en-PH', { timeZone: CLINIC_TZ, hour: 'numeric', minute: '2-digit' })}` : day;
}

const personName = (p) => [p?.fname, p?.lname].filter(Boolean).join(' ');

// Form answers (the `json` field) → [{ title, rows: [[label, value]] }] for display. Empty answers are left out.
const ANSWER_SECTIONS = {
  appointment: 'Appointment', B_personal: 'B · Personal information', C_household: 'C · Household & income',
  D_sectors: 'D · Sector', E_conflictCheck: 'E · Conflict check', F_legalIssue: 'F · Legal issue',
  G_caseFacts: 'G · Case facts', H_privacyConsent: 'H · Data privacy consent', I_declaration: 'I · Declaration',
  K_documents: 'K · Documents',
};
const ANSWER_LABELS = { dob: 'Date of birth', residentOfLapuLapu: 'Resident of Lapu-Lapu City', mobile: 'Mobile', addressPhone: 'Address / phone' };
const humanize = (key) => ANSWER_LABELS[key] || key.replace(/_/g, ' ').replace(/([a-z])([A-Z])/g, '$1 $2').replace(/^./, (c) => c.toUpperCase()).replace(/ ([A-Z])(?=[a-z])/g, (m, c) => ' ' + c.toLowerCase());

function answerRows(value, label = '') {
  if (value === null || value === undefined || value === '' || (Array.isArray(value) && !value.length)) return [];
  if (Array.isArray(value)) {
    if (value.every((v) => typeof v !== 'object')) return [[label, value.join(', ')]];
    return value.map((item, i) => [`${label} ${i + 1}`, Object.values(item).filter((v) => v !== '' && v !== null).join(' · ')]);
  }
  if (typeof value === 'object') return Object.entries(value).flatMap(([k, v]) => answerRows(v, label ? `${label} – ${humanize(k)}` : humanize(k)));
  if (typeof value === 'boolean') return [[label, value ? 'Yes' : 'No']];
  return [[label, String(value)]];
}

function answerSections(json) {
  if (!json || typeof json !== 'object') return [];
  const sections = [];
  const general = Object.entries(json).filter(([k, v]) => !ANSWER_SECTIONS[k] && (typeof v !== 'object' || v === null || Array.isArray(v)));
  if (general.length) sections.push({ title: 'Submission', rows: general.flatMap(([k, v]) => answerRows(v, humanize(k))) });
  for (const [key, title] of Object.entries(ANSWER_SECTIONS)) if (key in json) sections.push({ title, rows: answerRows(json[key]) });
  for (const [k, v] of Object.entries(json)) if (!ANSWER_SECTIONS[k] && v && typeof v === 'object' && !Array.isArray(v)) sections.push({ title: humanize(k), rows: answerRows(v) });
  return sections.filter((s) => s.rows.length);
}

const emptyNewAppointment = () => ({
  name: '', concern: '', mobile: '', email: '', date: '', time: '',
  app_status: 'SCHEDULED', lsp_id: '', sl_id: '', remarks: '',
});

document.addEventListener('alpine:init', () => {
  Alpine.data('appointments', () => crudPage({
    collection: 'appointments_overview',
    writeCollection: 'appointments',
    singular: 'appointment',
    plural: 'appointments',
    searchFields: ['reference', 'title', 'email', 'mobile_no', 'lsp_name', 'sl_name'],
    filters: { whenFilter: 'upcoming', statusFilter: '', lspFilter: '', slFilter: '' },
    sortKey: 'scheduled_at',
    sortDir: 'asc',
  }, {
    statuses: APPT_STATUSES,
    me: Auth.user,
    practitioners: [],
    lawyers: [],
    columns: [
      { key: 'scheduled_at', label: 'When', sortable: true },
      { key: 'title', label: 'Client', sortable: true },
      { key: 'app_status', label: 'Status', sortable: true },
      { key: 'lsp_name', label: 'LSP', sortable: true },
      { key: 'sl_name', label: 'Supervising lawyer', sortable: true },
      { key: 'created', label: 'Received', sortable: true },
    ],

    // Detail dialog
    current: null, // appointments_overview row
    booking: null, // appointments record (answers in .json)
    history: [],
    detailLoading: false,
    detailError: '',
    update: { app_status: 'PENDING', lsp_id: '', sl_id: '', remarks: '' },
    updating: false,
    updateError: '',
    editingBooking: false,
    bookingForm: {},
    bookingErrors: {},
    savingBooking: false,
    bookingError: '',

    // New appointment dialog
    newForm: emptyNewAppointment(),
    newErrors: {},
    creating: false,
    createError: '',

    init() {
      pb.authStore.onChange(() => (this.me = pb.authStore.record));
      this.loadPeople();
      // clinic-appointments.html#<id> opens that appointment (links from the dashboard).
      const openFromHash = () => {
        const id = location.hash.slice(1);
        if (/^[a-z0-9]{15}$/.test(id) && id !== this.current?.id) this.open(id);
      };
      this.$nextTick(openFromHash);
      window.addEventListener('hashchange', openFromHash);
    },

    get isAdmin() {
      return this.me?.role === 'admin';
    },

    // Everyone the LSP / SL dropdowns can offer.
    async loadPeople() {
      try {
        const [practitioners, lawyers] = await Promise.all([
          pb.collection('practitioners').getFullList({ sort: 'lname,fname', requestKey: 'people-p' }),
          pb.collection('lawyers').getFullList({ sort: 'lname,fname', requestKey: 'people-l' }),
        ]);
        this.practitioners = practitioners;
        this.lawyers = lawyers;
      } catch (err) {
        if (!err.isAbort) console.warn('[appointments] could not load practitioners / lawyers:', err);
      }
    },

    extraFilters() {
      const parts = [];
      const today = manilaTodayStartUTC();
      if (this.whenFilter === 'upcoming') parts.push(pb.filter('scheduled_at >= {:t}', { t: today }));
      if (this.whenFilter === 'past') parts.push(pb.filter('scheduled_at != "" && scheduled_at < {:t}', { t: today }));
      if (this.whenFilter === 'nodate') parts.push('scheduled_at = ""');
      if (this.statusFilter === 'open') parts.push('app_status != "DONE" && app_status != "CANCELLED"');
      else if (this.statusFilter) parts.push(pb.filter('app_status = {:s}', { s: this.statusFilter }));
      for (const [key, value] of [['lsp_id', this.lspFilter], ['sl_id', this.slFilter]]) {
        if (value === 'none') parts.push(`(${key} = null || ${key} = "")`);
        else if (value) parts.push(pb.filter(`${key} = {:id}`, { id: value }));
      }
      return parts;
    },

    // ---------- Display helpers ----------

    displayName(row) {
      return row?.reference || row?.title || 'this appointment';
    },

    statusLabel: (value) => apptStatus(value).label,
    statusClass: (value) => apptStatus(value).badge,
    formatSchedule: (value, opts) => formatSchedule(value, opts),
    personName,
    answerSections,

    personOption(p) {
      return `${p.lname}, ${p.fname}${p.level ? ` (${p.level})` : ''}${p.status && p.status !== 'active' ? ` · ${p.status}` : ''}`;
    },

    // ---------- Detail ----------

    async open(id) {
      this.current = null;
      this.booking = null;
      this.history = [];
      this.detailError = '';
      this.updateError = '';
      this.editingBooking = false;
      this.detailLoading = true;
      if (!this.$refs.detailDialog.open) this.$refs.detailDialog.showModal();
      history.replaceState(null, '', `#${id}`);
      try {
        const [row, booking, log] = await Promise.all([
          pb.collection('appointments_overview').getOne(id, { requestKey: null }),
          pb.collection('appointments').getOne(id, { requestKey: null }),
          pb.collection('appointments_status').getFullList({
            filter: pb.filter('app_id = {:id}', { id }), sort: '-created', expand: 'user_id,lsp_id,sl_id', requestKey: null,
          }),
        ]);
        this.current = row;
        this.booking = booking;
        this.history = log;
        this.update = { app_status: row.app_status || 'PENDING', lsp_id: row.lsp_id || '', sl_id: row.sl_id || '', remarks: '' };
      } catch (err) {
        this.detailError = err?.status === 404 ? 'This appointment no longer exists.' : this.messageFor(err, 'open');
      } finally {
        this.detailLoading = false;
      }
    },

    closeDetail() {
      this.$refs.detailDialog.close();
    },

    onDetailClosed() {
      history.replaceState(null, '', location.pathname + location.search);
    },

    afterDelete() {
      if (this.$refs.detailDialog.open) this.closeDetail();
    },

    get updateChanged() {
      const c = this.current;
      if (!c) return false;
      const u = this.update;
      return u.app_status !== (c.app_status || 'PENDING') || u.lsp_id !== (c.lsp_id || '') || u.sl_id !== (c.sl_id || '') || !!u.remarks.trim();
    },

    // Adds a status row: the new status / assignment, who made the change, and remarks.
    async saveUpdate() {
      if (!this.updateChanged) return;
      this.updating = true;
      this.updateError = '';
      const c = this.current;
      const u = this.update;
      try {
        await pb.collection('appointments_status').create({
          app_id: c.id, user_id: this.me.id, app_status: u.app_status,
          lsp_id: u.lsp_id, sl_id: u.sl_id, remarks: u.remarks.trim(),
        });
        const assignedNow = (u.lsp_id && u.lsp_id !== (c.lsp_id || '')) || (u.sl_id && u.sl_id !== (c.sl_id || ''));
        this.flash(assignedNow ? 'Assignment saved.' : 'Status updated.');
        await this.open(c.id);
        this.load();
      } catch (err) {
        this.updateError = this.messageFor(err, 'save');
      } finally {
        this.updating = false;
      }
    },

    historyPerson(entry, key) {
      return personName(entry.expand?.[key]) || (entry[key] ? '(removed)' : '');
    },

    historyAuthor(entry) {
      const u = entry.expand?.user_id;
      return u?.name || u?.email || (entry.user_id ? 'a staff member' : '');
    },

    // ---------- Edit booking details ----------

    startEditBooking() {
      const b = this.booking;
      const when = manilaParts(b.scheduled_at);
      this.bookingForm = { title: b.title || '', email: b.email || '', mobile_no: b.mobile_no || '', date: when.date, time: when.time };
      this.bookingErrors = {};
      this.bookingError = '';
      this.editingBooking = true;
    },

    validateContact(f, e) {
      if (!f.mobile && !f.email) e.mobile = 'Enter a mobile number or an email.';
      if (f.mobile && !/^[0-9+()\- ]{7,}$/.test(f.mobile)) e.mobile = 'Enter a valid phone number.';
      if (f.email && !/^\S+@\S+\.\S+$/.test(f.email)) e.email = 'Enter a valid email address.';
      if (f.time && !f.date) e.date = 'Pick a date for this time.';
    },

    async saveBooking() {
      const f = this.bookingForm;
      const e = {};
      if (!f.title.trim()) e.title = 'Enter a title, e.g. the client\'s name and concern.';
      this.validateContact({ mobile: f.mobile_no.trim(), email: f.email.trim(), date: f.date, time: f.time }, e);
      if (e.mobile) { e.mobile_no = e.mobile; delete e.mobile; }
      this.bookingErrors = e;
      if (Object.keys(e).length) return;
      this.savingBooking = true;
      this.bookingError = '';
      try {
        await pb.collection('appointments').update(this.booking.id, {
          title: f.title.trim(), email: f.email.trim(), mobile_no: normalizeMobile(f.mobile_no),
          scheduled_at: f.date ? manilaToUTC(f.date, f.time) : '',
        });
        this.flash('Booking details saved.');
        await this.open(this.booking.id);
        this.load();
      } catch (err) {
        this.bookingErrors = this.fieldErrorsFrom(err);
        this.bookingError = Object.keys(this.bookingErrors).length ? 'Please fix the highlighted fields.' : this.messageFor(err, 'save');
      } finally {
        this.savingBooking = false;
      }
    },

    // ---------- New appointment (walk-ins, phone calls) ----------

    openCreate() {
      this.newForm = emptyNewAppointment();
      this.newErrors = {};
      this.createError = '';
      this.$refs.newDialog.showModal();
    },

    async createAppointment() {
      const f = this.newForm;
      const e = {};
      if (!f.name.trim()) e.name = 'Enter the client\'s name.';
      this.validateContact({ mobile: f.mobile.trim(), email: f.email.trim(), date: f.date, time: f.time }, e);
      this.newErrors = e;
      if (Object.keys(e).length) return;
      this.creating = true;
      this.createError = '';
      try {
        const reference = makeAppointmentReference();
        const record = await pb.collection('appointments').create({
          reference,
          title: [f.name.trim(), f.concern.trim()].filter(Boolean).join(' — '),
          email: f.email.trim(),
          mobile_no: normalizeMobile(f.mobile),
          scheduled_at: f.date ? manilaToUTC(f.date, f.time) : '',
          json: { source: 'staff', addedBy: this.me?.name || this.me?.email || '', addedAt: new Date().toISOString(), concern: f.concern.trim() },
        });
        if (f.app_status !== 'PENDING' || f.lsp_id || f.sl_id || f.remarks.trim()) {
          await pb.collection('appointments_status').create({
            app_id: record.id, user_id: this.me.id, app_status: f.app_status,
            lsp_id: f.lsp_id, sl_id: f.sl_id, remarks: f.remarks.trim(),
          });
        }
        this.$refs.newDialog.close();
        this.flash(`${reference} was added.`);
        this.load();
        this.open(record.id);
      } catch (err) {
        this.newErrors = this.fieldErrorsFrom(err);
        this.createError = Object.keys(this.newErrors).length ? 'Please fix the highlighted fields.' : this.messageFor(err, 'save');
      } finally {
        this.creating = false;
      }
    },
  }));
});
