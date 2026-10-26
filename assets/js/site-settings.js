/*
 * Site Settings (clinic-site-settings.html): settings for the whole public website.
 * Usage: <body x-data="siteSettings">. Needs auth.js and appointments.js (Manila time helpers); load BEFORE Alpine.
 *
 * Saved to the single record in the PocketBase `site_settings` collection: anyone can read it (the public
 * pages check it, assets/js/maintenance.js), only admins (role = "admin") can change it.
 *  - maintenance          on = visitors see "We'll be back soon" and PocketBase refuses online bookings
 *  - maintenance_message  optional text on that page (otherwise a default in English + Bisaya)
 *  - maintenance_until    optional "Expected back" date and time (Manila)
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('siteSettings', () => ({
    me: Auth.user,
    recordId: '',
    form: { maintenance: false, message: '', untilDate: '', untilTime: '' },
    savedJSON: '',
    updated: '',
    loading: true,
    loadError: '',
    saving: false,
    saveError: '',
    toast: '',

    init() {
      pb.authStore.onChange(() => (this.me = pb.authStore.record));
      window.addEventListener('beforeunload', (e) => { if (this.dirty) e.preventDefault(); });
      this.load();
    },

    get isAdmin() {
      return this.me?.role === 'admin';
    },

    async load() {
      this.loading = true;
      this.loadError = '';
      try {
        const record = (await pb.collection('site_settings').getList(1, 1)).items[0];
        if (!record) throw Object.assign(new Error('missing'), { status: 404 });
        this.recordId = record.id;
        this.apply(record);
      } catch (err) {
        this.loadError = err?.status === 404
          ? 'The settings record is missing in PocketBase (collection "site_settings").'
          : 'The settings couldn\'t be loaded. Please try again.';
      } finally {
        this.loading = false;
      }
    },

    apply(record) {
      const until = manilaParts(record.maintenance_until);
      this.form = { maintenance: !!record.maintenance, message: record.maintenance_message || '', untilDate: until.date, untilTime: until.time };
      this.updated = record.updated || '';
      this.savedJSON = JSON.stringify(this.payload());
    },

    payload() {
      const f = this.form;
      return {
        maintenance: f.maintenance,
        maintenance_message: f.message.trim(),
        maintenance_until: f.untilDate ? manilaToUTC(f.untilDate, f.untilTime || '09:00') : '',
      };
    },

    get saved() {
      return JSON.parse(this.savedJSON || '{}');
    },

    get dirty() {
      return !this.loading && !this.loadError && JSON.stringify(this.payload()) !== this.savedJSON;
    },

    get liveLabel() {
      return this.saved.maintenance ? 'In maintenance mode' : 'Live';
    },

    get untilLabel() {
      return this.saved.maintenance_until ? formatSchedule(this.saved.maintenance_until) : '';
    },

    get updatedLabel() {
      return this.updated ? formatSchedule(this.updated) : '';
    },

    discard() {
      this.apply({ ...this.saved, updated: this.updated });
      this.saveError = '';
    },

    clearUntil() {
      this.form.untilDate = '';
      this.form.untilTime = '';
    },

    // Turning maintenance ON asks first; everything else saves straight away.
    requestSave() {
      if (!this.isAdmin || !this.dirty) return;
      if (this.form.maintenance && !this.saved.maintenance) return this.$refs.confirmDialog.showModal();
      this.save();
    },

    async save() {
      if (this.$refs.confirmDialog.open) this.$refs.confirmDialog.close();
      this.saving = true;
      this.saveError = '';
      const turningOn = this.form.maintenance && !this.saved.maintenance;
      const turningOff = !this.form.maintenance && this.saved.maintenance;
      try {
        const record = await pb.collection('site_settings').update(this.recordId, this.payload());
        this.apply(record);
        this.flash(turningOn ? 'Maintenance mode is on. Visitors now see the maintenance page.'
          : turningOff ? 'Maintenance mode is off. The site is live again.'
          : 'Saved.');
      } catch (err) {
        this.saveError = err?.status === 0 ? 'Couldn\'t reach the server. Check your internet connection and try again.'
          : err?.status === 404 || err?.status === 403 ? 'You don\'t have permission to change these settings.'
          : err?.response?.message || 'The settings couldn\'t be saved. Please try again.';
      } finally {
        this.saving = false;
      }
    },

    flash(message) {
      this.toast = message;
      clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => (this.toast = ''), 5000);
    },
  }));
});
