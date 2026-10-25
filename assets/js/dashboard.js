/*
 * Clinic dashboard (clinic-dashboard.html).
 * Usage: <body x-data="dashboard">. Must load BEFORE Alpine (it registers on `alpine:init`).
 * The page is protected by assets/js/auth.js (`data-auth-required` on <html>); the sidebar is
 * <dashboard-sidebar> (assets/js/components/dashboard-sidebar.js).
 *
 * The appointments table is SAMPLE DATA generated in sampleAppointments() below, so it
 * always shows upcoming Tuesday/Thursday slots. Replace it with the real bookings once
 * the intake form (assets/js/intake.js → sendRequest) saves them somewhere.
 */

const APPOINTMENT_STATUSES = ['Pending', 'Confirmed', 'Rescheduled'];

// Sample appointments: the next 6 weeks of Tuesday/Thursday slots, about 60% booked.
// A fixed seed keeps the same rows on every reload.
function sampleAppointments() {
  const lawyers = ['Atty. Maria Sugod', 'Atty. GM Basalo', 'Atty. Wae Carlo', 'Unassigned'];
  const clients = [
    'Ana Dela Cruz', 'Jose Santos', 'Maricel Villanueva', 'Rogelio Bautista', 'Liza Mendoza',
    'Ramon Ocampo', 'Teresita Aquino', 'Noel Ramos', 'Jocelyn Garcia', 'Arnel Flores',
    'Rowena Castillo', 'Danilo Reyes', 'Cristina Navarro', 'Edgar Pascual', 'Marites Gonzales',
    'Ferdinand Lim', 'Gemma Torres', 'Ricardo Cabrera', 'Lorna Fernandez', 'Benjie Salazar',
  ];
  const areas = INTAKE_OPTIONS.practiceAreas;
  let seed = 2024;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const pick = (list) => list[Math.floor(rand() * list.length)];

  const rows = [];
  const day = new Date();
  day.setHours(0, 0, 0, 0);
  for (let i = 0; i < 42; i++) {
    day.setDate(day.getDate() + 1);
    if (![2, 4].includes(day.getDay())) continue; // Tuesday, Thursday (the default intake settings)
    INTAKE_DEFAULT_SETTINGS.time_slots.forEach((hhmm) => {
      if (rand() > 0.6) return;
      const [hour, minute] = hhmm.split(':').map(Number);
      const at = new Date(day);
      at.setHours(hour, minute);
      rows.push({
        reference: `SNMC-${at.getFullYear()}-${String(Math.floor(rand() * 9000) + 1000)}`,
        at: at.getTime(),
        time: formatSlot(hhmm),
        client: pick(clients),
        area: pick(areas),
        lawyer: pick(lawyers),
        status: pick(APPOINTMENT_STATUSES),
        firstTime: rand() > 0.35,
      });
    });
  }
  return rows;
}

document.addEventListener('alpine:init', () => {
  Alpine.data('dashboard', () => ({
    statuses: APPOINTMENT_STATUSES,
    appointments: sampleAppointments(),

    // Data-table state
    search: '',
    statusFilter: '',
    lawyerFilter: '',
    sortKey: 'at',
    sortDir: 'asc',
    perPage: 10,
    page: 1,
    columns: [
      { key: 'at', label: 'Date & time' },
      { key: 'reference', label: 'Reference' },
      { key: 'client', label: 'Client' },
      { key: 'area', label: 'Legal concern' },
      { key: 'lawyer', label: 'Assigned to' },
      { key: 'status', label: 'Status' },
    ],

    init() {
      // Any filter change goes back to the first page.
      ['search', 'statusFilter', 'lawyerFilter', 'perPage'].forEach((k) => this.$watch(k, () => (this.page = 1)));
    },

    get lawyers() {
      return [...new Set(this.appointments.map((a) => a.lawyer))].sort();
    },

    get filtered() {
      const q = this.search.trim().toLowerCase();
      return this.appointments.filter((a) =>
        (!this.statusFilter || a.status === this.statusFilter) &&
        (!this.lawyerFilter || a.lawyer === this.lawyerFilter) &&
        (!q || [a.reference, a.client, a.area, a.lawyer, a.status, this.formatDate(a.at)].join(' ').toLowerCase().includes(q)));
    },

    get sorted() {
      const dir = this.sortDir === 'asc' ? 1 : -1;
      const k = this.sortKey;
      return [...this.filtered].sort((a, b) => (a[k] > b[k] ? dir : a[k] < b[k] ? -dir : a.at - b.at));
    },

    get pageCount() {
      return Math.max(1, Math.ceil(this.sorted.length / this.perPage));
    },

    get rows() {
      const start = (this.page - 1) * this.perPage;
      return this.sorted.slice(start, start + this.perPage);
    },

    get rangeLabel() {
      const total = this.sorted.length;
      if (!total) return 'No appointments';
      const start = (this.page - 1) * this.perPage + 1;
      return `Showing ${start}–${Math.min(start + this.perPage - 1, total)} of ${total}`;
    },

    // Summary cards above the table
    get stats() {
      const weekEnd = Date.now() + 7 * 24 * 60 * 60 * 1000;
      const a = this.appointments;
      return [
        { label: 'Upcoming appointments', value: a.length },
        { label: 'In the next 7 days', value: a.filter((x) => x.at < weekEnd).length },
        { label: 'Awaiting confirmation', value: a.filter((x) => x.status === 'Pending').length },
        { label: 'Not yet assigned', value: a.filter((x) => x.lawyer === 'Unassigned').length },
      ];
    },

    sortBy(key) {
      if (this.sortKey === key) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      else { this.sortKey = key; this.sortDir = 'asc'; }
      this.page = 1;
    },

    ariaSort(key) {
      if (this.sortKey !== key) return 'none';
      return this.sortDir === 'asc' ? 'ascending' : 'descending';
    },

    clearFilters() {
      this.search = '';
      this.statusFilter = '';
      this.lawyerFilter = '';
    },

    formatDate(ms) {
      return new Date(ms).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    },

    statusClass(status) {
      return {
        Pending: 'bg-amber/15 text-[#8a5a1c] ring-amber/30',
        Confirmed: 'bg-emerald-600/10 text-emerald-800 ring-emerald-600/25',
        Rescheduled: 'bg-copper/15 text-copper-dark ring-copper/30',
      }[status];
    },
  }));
});
