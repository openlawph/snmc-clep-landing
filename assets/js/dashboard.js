/*
 * Clinic dashboard (clinic-dashboard.html): a few counts and the upcoming appointments.
 * Usage: <body x-data="dashboard">. Needs auth.js, crud.js, intake.js and appointments.js; load BEFORE Alpine.
 * The page is protected by assets/js/auth.js (`data-auth-required` on <html>); the sidebar is
 * <dashboard-sidebar> (assets/js/components/dashboard-sidebar.js).
 *
 * Reads the PocketBase `appointments_overview` view (see appointments.js). Clicking a row opens
 * that appointment on the Appointments page.
 */

const OPEN_FILTER = 'app_status != "DONE" && app_status != "CANCELLED"';
const UNASSIGNED_FILTER = '(lsp_id = null || lsp_id = "" || sl_id = null || sl_id = "")';

document.addEventListener('alpine:init', () => {
  Alpine.data('dashboard', () => crudPage({
    collection: 'appointments_overview',
    singular: 'appointment',
    plural: 'upcoming appointments',
    searchFields: ['reference', 'title', 'mobile_no', 'email', 'lsp_name', 'sl_name'],
    filters: { statusFilter: 'open', assignFilter: '' },
    sortKey: 'scheduled_at',
    sortDir: 'asc',
  }, {
    statuses: APPT_STATUSES,
    columns: [
      { key: 'scheduled_at', label: 'When' },
      { key: 'title', label: 'Client' },
      { key: 'app_status', label: 'Status' },
      { key: 'lsp_name', label: 'LSP' },
      { key: 'sl_name', label: 'Supervising lawyer' },
    ],
    stats: [
      { key: 'week', label: 'In the next 7 days', value: '–' },
      { key: 'upcoming', label: 'Upcoming (open)', value: '–' },
      { key: 'pending', label: 'Pending', value: '–' },
      { key: 'unassigned', label: 'Need an LSP or lawyer', value: '–' },
    ],

    init() {
      this.loadStats();
    },

    // Upcoming only, from today (Manila time).
    extraFilters() {
      const parts = [pb.filter('scheduled_at >= {:t}', { t: manilaTodayStartUTC() })];
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
      };
      await Promise.all(this.stats.map(async (stat) => {
        try { stat.value = await count(filters[stat.key]); } catch { stat.value = '?'; }
      }));
    },

    statusLabel: (value) => apptStatus(value).label,
    statusClass: (value) => apptStatus(value).badge,
    formatSchedule: (value, opts) => formatSchedule(value, opts),

    openRow(row) {
      location.href = `clinic-appointments.html#${row.id}`;
    },
  }));
});
