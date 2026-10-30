/*
 * Clinic dashboard (clinic-dashboard.html): a few counts and the upcoming appointments.
 * Usage: <body x-data="dashboard">. Needs auth.js, crud.js, intake.js and appointments.js; load BEFORE Alpine.
 * The page is protected by assets/js/auth.js (`data-auth-required` on <html>); the sidebar is
 * <dashboard-sidebar> (assets/js/components/dashboard-sidebar.js).
 *
 * Reads the PocketBase `appointments_overview` view (see appointments.js). The list/calendar toggle
 * switches between the upcoming table and a month calendar. Clicking an appointment in either slides
 * in a sheet where staff can set the status and assign an LSP and a supervising lawyer (each save adds
 * a row to `appointments_status`, like the Appointments page). The sheet links to the full record there.
 *
 * "Needs attention" is what the nightly email reports (pocketbase/pb_hooks/clinic-daily.pb.js), live. It stays out of
 * the way when there's nothing to do.
 */

const OPEN_FILTER = 'app_status != "DONE" && app_status != "CANCELLED"';
const UNASSIGNED_FILTER = '(lsp_id = null || lsp_id = "" || sl_id = null || sl_id = "")';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const VIEW_KEY = 'dashboard-view';
const todayManila = () => manilaParts(new Date().toISOString()).date;
const storedView = () => {
  try { return localStorage.getItem(VIEW_KEY) === 'calendar' ? 'calendar' : 'list'; } catch { return 'list'; }
};

// 'YYYY-MM-DD' + n days → 'YYYY-MM-DD' (plain calendar arithmetic, no time zones involved).
function addDays(date, n) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

document.addEventListener('alpine:init', () => {
  Alpine.data('dashboard', () => {
    const page = crudPage({
      collection: 'appointments_overview',
      singular: 'appointment',
      plural: 'upcoming appointments',
      searchFields: ['reference', 'title', 'mobile_no', 'email', 'lsp_name', 'sl_name'],
      filters: { statusFilter: 'open', assignFilter: '' },
      sortKey: 'urgency_rank,scheduled_at', // most urgent first, then soonest; the list can switch to soonest first
      sortDir: 'asc',
    }, {
      statuses: APPT_STATUSES,
      me: Auth.user,
      practitioners: [],
      lawyers: [],
      gateFrom: '',
      attention: [], // [{ key, label, count, items: [{ id, reference, href }] }]; only what has something in it
      columns: [
        { key: 'scheduled_at', label: 'When' },
        { key: 'title', label: 'Client' },
        { key: 'app_status', label: 'Status' },
        { key: 'urgency', label: 'Urgency' },
        { key: 'lsp_name', label: 'LSP' },
        { key: 'sl_name', label: 'Supervising lawyer' },
      ],
      stats: [
        { key: 'week', label: 'In the next 7 days', value: '–' },
        { key: 'upcoming', label: 'Upcoming (open)', value: '–' },
        { key: 'pending', label: 'Pending', value: '–' },
        { key: 'unassigned', label: 'Need an LSP or lawyer', value: '–' },
        { key: 'receive', label: 'To receive (Annex C)', value: '–' },
        { key: 'high', label: 'High urgency', value: '–' },
      ],

      // List / calendar
      view: storedView(),
      month: todayManila().slice(0, 7), // 'YYYY-MM'
      selectedDay: todayManila(),
      monthRows: [],
      monthLoading: false,
      monthError: '',
      weekdays: WEEKDAYS,

      // Detail sheet
      sheetOpen: false,
      current: null, // appointments_overview row
      history: [],
      detailLoading: false,
      detailError: '',
      update: { app_status: 'PENDING', lsp_id: '', sl_id: '', remarks: '' },
      updating: false,
      updateError: '',

      async init() {
        pb.authStore.onChange(() => (this.me = pb.authStore.record));
        this.$watch('sortKey', () => this.goTo(1));
        this.gateFrom = await loadGateFrom();
        if (!this.gateFrom) this.sortKey = 'scheduled_at'; // the server files aren't installed: there's no urgency to sort by
        this.loadStats();
        this.loadAttention();
        this.loadPeople();
        this.$watch('view', (v) => {
          try { localStorage.setItem(VIEW_KEY, v); } catch { /* private window: the choice just isn't remembered */ }
          this.load();
        });
        this.$watch('month', () => this.load());
        this.$watch('sheetOpen', (open) => document.body.classList.toggle('overflow-hidden', open));
      },

      // The list shows upcoming appointments from today (Manila time); the calendar shows the month on screen.
      extraFilters() {
        const parts = this.view === 'calendar'
          ? [pb.filter('scheduled_at >= {:a} && scheduled_at < {:b}', { a: manilaToUTC(this.gridStart), b: manilaToUTC(this.gridEnd) })]
          : [pb.filter('scheduled_at >= {:t}', { t: manilaTodayStartUTC() })];
        if (this.statusFilter === 'open') parts.push(OPEN_FILTER);
        else if (this.statusFilter) parts.push(pb.filter('app_status = {:s}', { s: this.statusFilter }));
        if (this.assignFilter === 'unassigned') parts.push(UNASSIGNED_FILTER);
        return parts;
      },

      async loadStats() {
        const today = manilaTodayStartUTC();
        const nextWeek = new Date(`${manilaParts(new Date().toISOString()).date}T00:00:00+08:00`);
        nextWeek.setDate(nextWeek.getDate() + 7);
        const weekEnd = nextWeek.toISOString().replace('T', ' ');
        const count = (filter) => pb.collection('appointments_overview')
          .getList(1, 1, { filter, fields: 'id', requestKey: null })
          .then((res) => res.totalItems);
        const filters = {
          week: `${pb.filter('scheduled_at >= {:a} && scheduled_at < {:b}', { a: today, b: weekEnd })} && ${OPEN_FILTER}`,
          upcoming: `${pb.filter('scheduled_at >= {:a}', { a: today })} && ${OPEN_FILTER}`,
          pending: 'app_status = "PENDING"',
          unassigned: `${OPEN_FILTER} && ${UNASSIGNED_FILTER}`,
          receive: `(intake_id = null || intake_id = "") && ${OPEN_FILTER} && ${pb.filter('created >= {:g}', { g: this.gateFrom })}`,
          high: `(urgency = "HIGH" || client_urgent = true) && ${OPEN_FILTER}`,
        };
        await Promise.all(this.stats.map(async (stat) => {
          try { stat.value = await count(filters[stat.key]); } catch { stat.value = '?'; }
        }));
      },

      // What has slipped. Each query failing on its own (say, on an older server) just leaves its line out.
      async loadAttention() {
        if (!this.gateFrom) return; // the server files aren't installed yet
        const today = manilaTodayStartUTC();
        const open = `${OPEN_FILTER} && ${pb.filter('created >= {:g}', { g: this.gateFrom })}`;
        const lines = [
          { key: 'urgent', label: 'Urgent, with no LSP or lawyer yet', filter: `(urgency = "HIGH" || client_urgent = true) && ${UNASSIGNED_FILTER} && ${OPEN_FILTER}` },
          { key: 'overdue', label: 'Date has passed but still open', filter: `scheduled_at != "" && ${pb.filter('scheduled_at < {:t}', { t: today })} && ${open}` },
          { key: 'undated', label: 'No date yet', filter: `scheduled_at = "" && ${open}` },
          { key: 'duplicate', label: 'Possibly the same person twice', filter: `possible_duplicate = true && ${open}` },
          { key: 'late', label: 'Filed late', filter: `encoded_late = true && ${open}` },
        ];
        const found = await Promise.all(lines.map(async (line) => {
          try {
            const res = await pb.collection('appointments_overview').getList(1, 4, { filter: line.filter, sort: 'scheduled_at', fields: 'id,reference', requestKey: null });
            return { ...line, count: res.totalItems, items: res.items.map((r) => ({ id: r.id, reference: r.reference, href: `clinic-appointments.html#${r.id}` })) };
          } catch {
            return { ...line, count: 0, items: [] };
          }
        }));
        try {
          const { items: [controls] } = await pb.collection('intake_controls').getList(1, 1, { requestKey: null });
          const cutoff = new Date(Date.now() - (controls?.late_days ?? 3) * 86400000).toISOString().replace('T', ' ');
          const paper = await pb.collection('paper_forms').getList(1, 4, { filter: pb.filter('status = "ISSUED" && created < {:c}', { c: cutoff }), sort: 'created', requestKey: null });
          found.push({
            key: 'paper', label: 'Paper forms given out but never filed in', count: paper.totalItems,
            items: paper.items.map((p) => ({ id: p.id, reference: `${p.reference} (${p.issued_by_name || 'unknown'})`, href: 'clinic-settings.html#paper' })),
          });
        } catch { /* leaves the line out, like the others */ }
        this.attention = found.filter((line) => line.count);
      },

      statusLabel: (value) => apptStatus(value).label,
      statusClass: (value) => apptStatus(value).badge,
      urgencyOf: apptUrgency,
      formatSchedule: (value, opts) => formatSchedule(value, opts),

      needsReceiving(row) {
        return needsReceiving(row, this.gateFrom);
      },

      // In progress and Done wait for Annex C (the server refuses them too).
      statusLocked(value) {
        return statusNeedsIntake(value) && intakeGated(this.current, this.gateFrom);
      },

      // ---------- Calendar ----------

      get monthLabel() {
        const [y, m] = this.month.split('-').map(Number);
        return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-PH', { timeZone: 'UTC', month: 'long', year: 'numeric' });
      },

      // The grid starts on the Sunday on or before the 1st and runs whole weeks.
      get gridStart() {
        const first = `${this.month}-01`;
        return addDays(first, -new Date(`${first}T00:00:00Z`).getUTCDay());
      },

      get gridEnd() {
        const [y, m] = this.month.split('-').map(Number);
        const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
        const offset = new Date(`${this.month}-01T00:00:00Z`).getUTCDay();
        return addDays(this.gridStart, Math.ceil((offset + daysInMonth) / 7) * 7);
      },

      get cells() {
        const byDay = {};
        for (const row of this.monthRows) (byDay[manilaParts(row.scheduled_at).date] ||= []).push(row);
        const today = todayManila();
        const cells = [];
        for (let date = this.gridStart; date < this.gridEnd; date = addDays(date, 1)) {
          cells.push({ date, day: Number(date.slice(8)), inMonth: date.startsWith(this.month), isToday: date === today, items: byDay[date] || [] });
        }
        return cells;
      },

      get selectedItems() {
        return this.cells.find((c) => c.date === this.selectedDay)?.items || [];
      },

      get selectedLabel() {
        return new Date(`${this.selectedDay}T00:00:00+08:00`)
          .toLocaleDateString('en-PH', { timeZone: CLINIC_TZ, weekday: 'long', day: 'numeric', month: 'long' });
      },

      shiftMonth(n) {
        const [y, m] = this.month.split('-').map(Number);
        this.month = new Date(Date.UTC(y, m - 1 + n, 1)).toISOString().slice(0, 7);
        this.selectedDay = this.month === todayManila().slice(0, 7) ? todayManila() : `${this.month}-01`;
      },

      goToToday() {
        this.month = todayManila().slice(0, 7);
        this.selectedDay = todayManila();
      },

      async loadMonth() {
        this.monthLoading = true;
        this.monthError = '';
        try {
          this.monthRows = await pb.collection('appointments_overview').getFullList({
            filter: this.filterString(), sort: 'scheduled_at', requestKey: 'month',
          });
          this.monthLoading = false;
        } catch (err) {
          if (err.isAbort) return; // a newer request replaced this one
          this.monthRows = [];
          this.monthError = this.messageFor(err, 'load');
          this.monthLoading = false;
        }
      },

      timeOf: (row) => formatSchedule(row.scheduled_at).split(' · ')[1] || '',
      needsAssignment: (row) => !row.lsp_id || !row.sl_id,

      // ---------- Detail sheet ----------

      async loadPeople() {
        try {
          const [practitioners, lawyers] = await Promise.all([
            pb.collection('practitioners').getFullList({ sort: 'lname,fname', requestKey: 'people-p' }),
            pb.collection('lawyers').getFullList({ sort: 'lname,fname', requestKey: 'people-l' }),
          ]);
          this.practitioners = practitioners;
          this.lawyers = lawyers;
        } catch (err) {
          if (!err.isAbort) console.warn('[dashboard] could not load practitioners / lawyers:', err);
        }
      },

      personOption(p) {
        return `${p.lname}, ${p.fname}${p.level ? ` (${p.level})` : ''}${p.status && p.status !== 'active' ? ` · ${p.status}` : ''}`;
      },

      async openRow(row) {
        // Only the most recently opened appointment may fill the sheet (an earlier, slower load is dropped).
        const ticket = (this._openTicket = (this._openTicket || 0) + 1);
        if (!this.sheetOpen) this._opener = document.activeElement;
        this.current = null;
        this.history = [];
        this.detailError = '';
        this.updateError = '';
        this.detailLoading = true;
        this.sheetOpen = true;
        this.$nextTick(() => this.$refs.sheetClose?.focus());
        try {
          const [fresh, log] = await Promise.all([
            pb.collection('appointments_overview').getOne(row.id, { requestKey: null }),
            pb.collection('appointments_status').getFullList({
              filter: pb.filter('app_id = {:id}', { id: row.id }), sort: '-created', expand: 'user_id,lsp_id,sl_id', requestKey: null,
            }),
          ]);
          if (ticket !== this._openTicket) return;
          this.current = fresh;
          this.history = log;
          this.update = { app_status: fresh.app_status || 'PENDING', lsp_id: fresh.lsp_id || '', sl_id: fresh.sl_id || '', remarks: '' };
        } catch (err) {
          if (ticket !== this._openTicket) return;
          this.detailError = err?.status === 404 ? 'This appointment no longer exists.' : this.messageFor(err, 'open');
        } finally {
          if (ticket === this._openTicket) this.detailLoading = false;
        }
      },

      closeSheet() {
        if (!this.sheetOpen) return;
        this.sheetOpen = false;
        this._openTicket = (this._openTicket || 0) + 1;
        this._opener?.focus?.();
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
          await this.openRow(c);
          this.load();
          this.loadStats();
          this.loadAttention();
        } catch (err) {
          // The server's own rules come back as a field error, with a sentence saying what to do.
          this.updateError = Object.values(this.fieldErrorsFrom(err))[0] || this.messageFor(err, 'save');
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
    });

    // The list and the calendar read different data: route the shared load() to the one on screen.
    const loadList = page.load;
    page.load = function () {
      return this.view === 'calendar' ? this.loadMonth() : loadList.call(this);
    };
    return page;
  });
});
