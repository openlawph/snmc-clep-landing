/*
 * Clinic dashboard (clinic-dashboard.html).
 * Usage: <body x-data="dashboard">. Must load BEFORE Alpine (it registers on `alpine:init`).
 * The page is protected by assets/js/auth.js (`data-auth-required` on <html>).
 *
 * The sidebar switches views with the URL hash (#users, #lawyers, …). Only the Dashboard
 * view is built; the others show a placeholder.
 *
 * The appointments table is SAMPLE DATA generated in sampleAppointments() below, so it
 * always shows upcoming Tuesday/Thursday slots. Replace it with the real bookings once
 * the intake form (assets/js/intake.js → sendRequest) saves them somewhere.
 */

const DASHBOARD_VIEWS = [
  { key: 'dashboard', label: 'Dashboard', icon: 'M3 12 12 4l9 8M5 10v10h5v-6h4v6h5V10' },
  { key: 'users', label: 'Users', icon: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.87M16 4.13a3 3 0 0 1 0 5.74' },
  { key: 'lawyers', label: 'Lawyers', icon: 'M12 3v18M7 21h10M4 7h16M4 7l-3 7h6L4 7zM20 7l-3 7h6l-3-7z' },
  { key: 'appointments', label: 'Appointments', icon: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' },
  { key: 'clients', label: 'Client Records', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6M8 13h8M8 17h5' },
];

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
    if (![2, 4].includes(day.getDay())) continue; // Tuesday, Thursday
    INTAKE_OPTIONS.timeSlots.forEach((time, slot) => {
      if (rand() > 0.6) return;
      const hour = 13 + slot; // slots start at 1:00 PM
      const at = new Date(day);
      at.setHours(hour);
      rows.push({
        reference: `SNMC-${at.getFullYear()}-${String(Math.floor(rand() * 9000) + 1000)}`,
        at: at.getTime(),
        time,
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
    views: DASHBOARD_VIEWS,
    statuses: APPOINTMENT_STATUSES,
    view: 'dashboard',
    sidebarOpen: false,

    // Signed-in staff member (assets/js/auth.js has already confirmed the session)
    user: Auth.user,
    get userName() {
      return this.user?.name || this.user?.email || '';
    },
    get userInitial() {
      return this.userName.charAt(0).toUpperCase();
    },

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
      const fromHash = () => {
        const key = location.hash.slice(1);
        this.view = this.views.some((v) => v.key === key) ? key : 'dashboard';
        this.sidebarOpen = false;
      };
      fromHash();
      window.addEventListener('hashchange', fromHash);
      // Any filter change goes back to the first page.
      ['search', 'statusFilter', 'lawyerFilter', 'perPage'].forEach((k) => this.$watch(k, () => (this.page = 1)));
    },

    get currentView() {
      return this.views.find((v) => v.key === this.view);
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
