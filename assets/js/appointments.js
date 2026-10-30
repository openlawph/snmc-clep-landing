/*
 * Appointments page (clinic-appointments.html) + appointment helpers shared with the dashboard.
 * Usage: <body x-data="appointments">. Needs auth.js, crud.js and intake.js (normalizeMobile); load BEFORE Alpine.
 *
 * PocketBase:
 *  - appointments           one booking: reference, title, email, mobile_no, scheduled_at, json (form answers),
 *                           client_urgent and urgent_deadline (from the form), not_duplicate (staff's answer)
 *  - appointments_status    history log, one row per change: app_status, remarks, lsp_id → practitioners,
 *                           sl_id → lawyers, user_id → the staff member who made the change
 *  - appointments_overview  view: every appointment with its latest status / LSP / SL and its Annex C (the list reads this)
 *  - intake_requests        Annex C: filed on clinic-intake.html, see intake-c.js
 *  - audit_log              who changed what; written with each change (clinic-records.js), and can't be edited
 * Changing the status or the assignment adds a new status row; the history itself is never edited here.
 * New appointments start on clinic-intake.html, so a walk-in always has its Annex C. The API rules enforce the status
 * rules (pocketbase/annex-c-d-schema.js); what's here says why before someone tries, which a refused rule can't.
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

// Must match the `urgency` select values on intake_requests (Annex C).
const APPT_URGENCIES = [
  { value: 'HIGH', label: 'High', badge: 'bg-red-600/10 text-red-800 ring-red-600/25' },
  { value: 'MEDIUM', label: 'Medium', badge: 'bg-amber/15 text-[#8a5a1c] ring-amber/30' },
  { value: 'LOW', label: 'Low', badge: 'bg-black/5 text-muted ring-black/10' },
];
const apptUrgency = (value) => APPT_URGENCIES.find((u) => u.value === value);

// How the Annex C codes read. The form itself is in intake-c.js.
const ANNEX_C_LABELS = {
  modes: [
    { value: 'WALK_IN', label: 'Walk-in' }, { value: 'TELEPHONE', label: 'Telephone' }, { value: 'EMAIL', label: 'Email' },
    { value: 'ONLINE', label: 'Online Form' }, { value: 'REFERRAL', label: 'Referral' },
    { value: 'OUTREACH', label: 'Legal Aid Caravan / Outreach' }, { value: 'OTHER', label: 'Other' },
  ],
  dispositions: [
    { value: 'REGISTRATION', label: 'Proceed to Registration' }, { value: 'IMMEDIATE_REFERRAL', label: 'Immediate Referral' },
    { value: 'EMERGENCY', label: 'Emergency Handling' }, { value: 'INTERVIEW', label: 'Schedule Preliminary Interview' },
    { value: 'OTHER', label: 'Other' },
  ],
};

// When Annex C became required (intake_controls.gate_from): older appointments don't need one. '' = can't tell (the
// database changes aren't in yet), so nothing is held back here.
async function loadGateFrom() {
  try {
    const { items } = await pb.collection('intake_controls').getList(1, 1, { requestKey: null });
    return items[0]?.gate_from || '';
  } catch {
    return '';
  }
}

// Must this appointment have its Annex C before it can start or finish?
const intakeGated = (row, gateFrom) => !!gateFrom && !!row && !row.intake_id && row.created >= gateFrom;
// ...and is someone actually waiting to do it? Not once it's closed.
const needsReceiving = (row, gateFrom) => intakeGated(row, gateFrom) && row.app_status !== 'DONE' && row.app_status !== 'CANCELLED';
const statusNeedsIntake = (value) => value === 'WIP' || value === 'DONE';

// What's stopping this status or assignment change, in words ('' = nothing). The API rules refuse the same things.
function statusChangeProblem(row, update, gateFrom, previous, practitioners, lawyers) {
  if (statusNeedsIntake(update.app_status) && intakeGated(row, gateFrom)) return 'Receive the intake (Annex C) first. Open the appointment and press "Receive intake".';
  const exempt = !gateFrom || row.created < gateFrom || row.disposition === 'IMMEDIATE_REFERRAL';
  if (update.app_status === 'DONE' && !exempt && (!update.lsp_id || !update.sl_id)) return 'Assign an LSP and a supervising lawyer before marking this as done.';
  if (update.app_status === 'CANCELLED' && !update.remarks.trim()) return 'Add a remark saying why this is being cancelled.';
  return assignmentProblem(update.lsp_id, update.sl_id, previous, practitioners, lawyers)?.[1] || '';
}

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
  K_documents: 'K · Documents', annexD: 'Annex D · Online request',
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

document.addEventListener('alpine:init', () => {
  Alpine.data('appointments', () => crudPage({
    collection: 'appointments_overview',
    writeCollection: 'appointments',
    singular: 'appointment',
    plural: 'appointments',
    searchFields: ['reference', 'title', 'email', 'mobile_no', 'lsp_name', 'sl_name', 'paper_ref_written'],
    filters: { tab: 'pending', statusFilter: '', lspFilter: '', slFilter: '', urgencyFilter: '' },
    sortKey: 'scheduled_at',
    sortDir: 'asc',
  }, {
    statuses: APPT_STATUSES,
    urgencies: APPT_URGENCIES,
    gateFrom: '',
    tabs: [
      { value: 'pending', label: 'Pending', hint: 'Waiting to be confirmed or assigned' },
      { value: 'receive', label: 'To receive', hint: 'No Annex C yet, and still open' },
      { value: 'scheduled', label: 'Scheduled', hint: 'Confirmed or in progress, today onward' },
      { value: 'followup', label: 'Follow-ups', hint: 'Returning clients (not their first visit), today onward' },
      { value: 'past', label: 'Past', hint: 'The appointment date has passed' },
      { value: 'all', label: 'All', hint: 'Every appointment' },
    ],
    followIds: [],
    me: Auth.user,
    practitioners: [],
    lawyers: [],
    columns: [
      { key: 'scheduled_at', label: 'When', sortable: true },
      { key: 'title', label: 'Client', sortable: true },
      { key: 'app_status', label: 'Status', sortable: true },
      { key: 'urgency_rank', label: 'Urgency', sortable: true },
      { key: 'lsp_name', label: 'LSP', sortable: true },
      { key: 'sl_name', label: 'Lawyer', sortable: true },
      { key: 'created', label: 'Submitted', sortable: true, wide: true }, // on wider screens only, so the rest fits a 1280 laptop
    ],

    // Detail dialog
    current: null, // appointments_overview row
    booking: null, // appointments record (answers in .json)
    intake: null, // intake_requests record (Annex C), if received
    history: [],
    changes: [], // audit_log rows for this appointment
    fileToken: '', // lets staff open the client's uploads, which are protected
    voidOpen: false,
    voidReason: '',
    voidError: '',
    voiding: false,
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

    init() {
      pb.authStore.onChange(() => (this.me = pb.authStore.record));
      this.loadPeople();
      loadGateFrom().then((gate) => { this.gateFrom = gate; if (this.tab === 'receive') this.load(); });
      // Past appointments read best newest first; the others soonest first.
      this.$watch('tab', (t) => (this.sortDir = t === 'past' && this.sortKey === 'scheduled_at' ? 'desc' : this.sortKey === 'scheduled_at' ? 'asc' : this.sortDir));
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

    // Returning clients answered "No" to "First time with the clinic?"; that answer lives in the booking's json.
    async beforeLoad() {
      if (this.tab !== 'followup') return;
      const found = await pb.collection('appointments').getFullList({
        filter: 'json.appointment.firstTime = "No"', fields: 'id', requestKey: 'followups',
      });
      this.followIds = found.map((r) => r.id);
    },

    // Tabs: the date decides what is "past"; undated bookings stay in the live tabs until given a date.
    extraFilters() {
      const parts = [];
      const today = manilaTodayStartUTC();
      const live = pb.filter('(scheduled_at = "" || scheduled_at >= {:t})', { t: today });
      if (this.tab === 'pending') parts.push('app_status = "PENDING"', live);
      else if (this.tab === 'receive') {
        parts.push('(intake_id = null || intake_id = "") && app_status != "DONE" && app_status != "CANCELLED"');
        if (this.gateFrom) parts.push(pb.filter('created >= {:g}', { g: this.gateFrom }));
      } else if (this.tab === 'scheduled') parts.push('(app_status = "SCHEDULED" || app_status = "WIP")', live);
      else if (this.tab === 'followup') {
        parts.push('app_status != "DONE" && app_status != "CANCELLED"', live);
        parts.push(this.followIds.length ? '(' + this.followIds.map((id) => pb.filter('id = {:id}', { id })).join(' || ') + ')' : 'id = ""');
      } else if (this.tab === 'past') parts.push(pb.filter('scheduled_at != "" && scheduled_at < {:t}', { t: today }));
      if (this.statusFilter === 'open') parts.push('app_status != "DONE" && app_status != "CANCELLED"');
      else if (this.statusFilter) parts.push(pb.filter('app_status = {:s}', { s: this.statusFilter }));
      if (this.urgencyFilter === 'client') parts.push('client_urgent = true');
      else if (this.urgencyFilter) parts.push(pb.filter('urgency = {:u}', { u: this.urgencyFilter }));
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
    urgencyOf: apptUrgency,
    formatSchedule: (value, opts) => formatSchedule(value, opts),
    personName,
    answerSections,

    needsReceiving(row) {
      return needsReceiving(row, this.gateFrom);
    },

    // In progress and Done wait for Annex C (the server refuses them too).
    statusLocked(value) {
      return statusNeedsIntake(value) && intakeGated(this.current, this.gateFrom);
    },

    // Annex C rows and labels for the card in the dialog.
    get intakeRows() {
      const i = this.intake;
      if (!i) return [];
      const label = (list, value) => list.find((item) => item.value === value)?.label || value || '—';
      return [
        ['Date received', formatSchedule(i.date_received, { time: false })],
        ['Received by', i.received_by_name || '—'],
        ['Filed', formatSchedule(i.received_at)],
        ['Mode of contact', label(ANNEX_C_LABELS.modes, i.contact_mode)],
        ['Urgency', label(APPT_URGENCIES, i.urgency)],
        ['Disposition', label(ANNEX_C_LABELS.dispositions, i.disposition) + (i.disposition_other ? `: ${i.disposition_other}` : '')],
      ];
    },

    attachmentUrl(name) {
      return pb.files.getURL(this.booking, name, { token: this.fileToken });
    },

    personOption(p) {
      return `${p.lname}, ${p.fname}${p.level ? ` (${p.level})` : ''}${p.status && p.status !== 'active' ? ` · ${p.status}` : ''}`;
    },

    // ---------- Detail ----------

    async open(id) {
      // Only the most recently opened appointment may fill the dialog (an earlier, slower load is dropped).
      const ticket = (this._openTicket = (this._openTicket || 0) + 1);
      this.current = null;
      this.booking = null;
      this.intake = null;
      this.history = [];
      this.changes = [];
      this.fileToken = '';
      this.voidOpen = false;
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
        const [intake, changes, fileToken] = await Promise.all([
          row.intake_id ? pb.collection('intake_requests').getOne(row.intake_id, { requestKey: null }) : null,
          // By reference too: filing and voiding its Annex C are logged against the Annex C.
          pb.collection('audit_log').getFullList({ filter: pb.filter('target_id = {:id} || (target_reference != "" && target_reference = {:r})', { id, r: booking.reference }), sort: '-created', requestKey: null }).catch(() => []),
          booking.attachments?.length ? pb.files.getToken({ requestKey: null }) : '',
        ]);
        if (ticket !== this._openTicket) return;
        this.current = row;
        this.booking = booking;
        this.intake = intake;
        this.history = log;
        this.changes = changes;
        this.fileToken = fileToken;
        this.update = { app_status: row.app_status || 'PENDING', lsp_id: row.lsp_id || '', sl_id: row.sl_id || '', remarks: '' };
      } catch (err) {
        if (ticket !== this._openTicket) return;
        this.detailError = err?.status === 404 ? 'This appointment no longer exists.' : this.messageFor(err, 'open');
      } finally {
        if (ticket === this._openTicket) this.detailLoading = false;
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

    // An appointment with an Annex C is part of the record (the database refuses too). Otherwise a copy goes in the log.
    async confirmDelete() {
      this.deleting = true;
      this.deleteError = '';
      try {
        if (this.deleteTarget.intake_id) throw clinicRefusal('id', 'This appointment has an Annex C, so it can\'t be deleted. Set its status to Cancelled instead.');
        await deleteAndLog(this.me, 'appointments', await pb.collection('appointments').getOne(this.deleteTarget.id, { requestKey: null }));
        this.flash(`${this.displayName(this.deleteTarget)} was deleted.`);
        this.$refs.deleteDialog.close();
        this.afterDelete();
        this.load();
      } catch (err) {
        this.deleteError = err?.fields?.id || this.messageFor(err, 'delete');
      } finally {
        this.deleting = false;
      }
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
      this.updateError = '';
      const c = this.current;
      const u = this.update;
      const problem = statusChangeProblem(c, u, this.gateFrom, c, this.practitioners, this.lawyers);
      if (problem) { this.updateError = problem; return; }
      this.updating = true;
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
        this.updateError = err?.status === 400 ? 'The server refused this change. Reload the page and check the appointment, then try again.' : this.messageFor(err, 'save');
      } finally {
        this.updating = false;
      }
    },

    // Keeps the Annex C and says why; the appointment goes back to "to receive". Admins only (the API rules check).
    async voidIntake() {
      if (!this.voidReason.trim()) { this.voidError = 'Say why this is being voided.'; return; }
      this.voiding = true;
      this.voidError = '';
      try {
        await voidIntakeRecord(this.me, this.intake, this.voidReason.trim());
        this.voidReason = '';
        this.flash('Annex C voided.');
        await this.open(this.current.id);
        this.load();
      } catch (err) {
        this.voidError = err?.status === 400 ? 'This Annex C couldn\'t be voided. Reload the page and check it hasn\'t been voided already.' : this.messageFor(err, 'save');
      } finally {
        this.voiding = false;
      }
    },

    // One line per audit_log row, e.g. "title, email".
    changeSummary(entry) {
      if (entry.action === 'delete') return 'deleted';
      if (entry.action === 'intake_create' || entry.action === 'intake_receive') return 'Annex C filed';
      if (entry.action === 'intake_void') return `Annex C voided: ${entry.changes?.reason || ''}`;
      return Object.keys(entry.changes || {}).map((key) => key.replace(/_/g, ' ')).join(', ') || entry.action;
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
        await updateAndLog(this.me, 'appointments', this.booking, {
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
  }));
});
