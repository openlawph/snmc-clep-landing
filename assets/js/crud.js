/*
 * Shared list / delete / message logic for staff pages that manage a PocketBase collection
 * (clinic-users.html, clinic-lawyers.html, …). Needs assets/js/auth.js; load BEFORE the page's
 * own script.
 *
 *   Alpine.data('lawyers', () => crudPage({
 *     collection: 'lawyers', singular: 'lawyer', plural: 'lawyers',
 *     searchFields: ['fname', 'lname', 'email'],  // every word typed must match one of these
 *     filters: { statusFilter: '' },              // extra <select> filters; reset by "Clear"
 *     sortKey: 'lname,fname', sortDir: 'asc',
 *   }, {
 *     extraFilters() { return this.statusFilter ? [pb.filter('status = {:s}', { s: this.statusFilter })] : []; },
 *     displayName(record) { return record.fname + ' ' + record.lname; },
 *     …page-specific state, getters and methods (they override the shared ones)…
 *   }));
 *
 * Paging, search and sorting run on the server. The page's own init() runs after the shared one.
 * If the list reads a view, set `writeCollection` to the collection deletes go to, and define
 * `afterDelete(record)` on the page to do more after a delete (e.g. close a detail dialog).
 */
function crudPage(config, page = {}) {
  const base = {
    rows: [],
    total: 0,
    totalPages: 1,
    page: 1,
    perPage: 10,
    search: '',
    ...config.filters,
    sortKey: config.sortKey || 'created',
    sortDir: config.sortDir || 'desc',
    loading: true,
    loadError: '',
    toast: '',

    // Delete dialog (markup: <dialog x-ref="deleteDialog">)
    deleteTarget: null,
    deleting: false,
    deleteError: '',

    init() {
      ['search', 'perPage', ...Object.keys(config.filters || {})].forEach((k) => this.$watch(k, () => this.goTo(1)));
      this.load();
    },

    get hasFilters() {
      return !!this.search || Object.keys(config.filters || {}).some((k) => this[k] !== config.filters[k]);
    },

    clearFilters() {
      this.search = '';
      Object.assign(this, config.filters);
    },

    extraFilters() {
      return [];
    },

    filterString() {
      const words = this.search.trim().split(/\s+/).filter(Boolean);
      const parts = words.map((w) => '(' + config.searchFields.map((f) => pb.filter(`${f} ~ {:w}`, { w })).join(' || ') + ')');
      return [...parts, ...this.extraFilters()].join(' && ');
    },

    // "lname,fname" sorts by both; descending flips each.
    sortString() {
      return this.sortKey.split(',').map((k) => (this.sortDir === 'desc' ? '-' : '') + k).join(',');
    },

    async load() {
      this.loading = true;
      this.loadError = '';
      try {
        const res = await pb.collection(config.collection).getList(this.page, this.perPage, {
          filter: this.filterString(),
          sort: this.sortString(),
        });
        this.rows = res.items;
        this.total = res.totalItems;
        this.totalPages = Math.max(1, res.totalPages);
        this.loading = false;
        if (this.page > this.totalPages) this.goTo(this.totalPages); // e.g. after deleting the last row of a page
      } catch (err) {
        if (err.isAbort) return; // a newer request replaced this one (the SDK cancels duplicates)
        this.rows = [];
        this.loadError = this.messageFor(err, 'load');
        this.loading = false;
      }
    },

    // Several changes in one go (e.g. "Clear" resets every filter) still load only once.
    goTo(page) {
      this.page = page;
      if (this._loadQueued) return;
      this._loadQueued = true;
      queueMicrotask(() => {
        this._loadQueued = false;
        this.load();
      });
    },

    sortBy(key) {
      if (this.sortKey === key) this.sortDir = this.sortDir === 'asc' ? 'desc' : 'asc';
      else { this.sortKey = key; this.sortDir = key === 'created' ? 'desc' : 'asc'; }
      this.goTo(1);
    },

    ariaSort(key) {
      if (this.sortKey !== key) return 'none';
      return this.sortDir === 'asc' ? 'ascending' : 'descending';
    },

    get rangeLabel() {
      if (!this.total) return `No ${config.plural}`;
      const start = (this.page - 1) * this.perPage + 1;
      return `Showing ${start}–${Math.min(start + this.perPage - 1, this.total)} of ${this.total}`;
    },

    displayName(record) {
      return record?.name || record?.email || record?.id || '';
    },

    formatDate(value) {
      if (!value) return '';
      return new Date(value.replace(' ', 'T')).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
    },

    flash(message) {
      this.toast = message;
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => (this.toast = ''), 4000);
    },

    // Turns an SDK error into a sentence.
    messageFor(err, action) {
      if (err?.status === 0) return 'Couldn\'t reach the server. Check your internet connection and try again.';
      if (err?.status === 401) return 'Your session has ended. Please sign in again.';
      if (err?.status === 403) return action === 'load' ? `You don't have permission to see ${config.plural}.` : 'You don\'t have permission to do that.';
      if (err?.status === 404) return `That ${config.singular} no longer exists.`;
      if (err?.status === 400 && action === 'load') return 'The list couldn\'t be loaded with these filters.';
      return err?.response?.message || 'Something went wrong. Please try again.';
    },

    // PocketBase field errors ({ email: { code, message } }) → { email: 'message' }.
    fieldErrorsFrom(err) {
      const errors = {};
      for (const [key, value] of Object.entries(err?.response?.data || {})) {
        errors[key] = value?.code === 'validation_not_unique'
          ? `Another ${config.singular} already uses this ${key === 'email' ? 'email' : 'value'}.`
          : value?.message || 'Check this field.';
      }
      return errors;
    },

    askDelete(record) {
      this.deleteTarget = record;
      this.deleteError = '';
      this.$refs.deleteDialog.showModal();
    },

    async confirmDelete() {
      this.deleting = true;
      this.deleteError = '';
      try {
        await pb.collection(config.writeCollection || config.collection).delete(this.deleteTarget.id);
        this.flash(`${this.displayName(this.deleteTarget)} was deleted.`);
        this.$refs.deleteDialog.close();
        this.afterDelete?.(this.deleteTarget);
        this.load();
      } catch (err) {
        this.deleteError = this.messageFor(err, 'delete');
      } finally {
        this.deleting = false;
      }
    },
  };

  // Merge with property descriptors so getters stay getters; the page's own members win.
  const merged = Object.defineProperties({}, {
    ...Object.getOwnPropertyDescriptors(base),
    ...Object.getOwnPropertyDescriptors(page),
  });
  merged.init = function () {
    base.init.call(this);
    page.init?.call(this);
  };
  return merged;
}
