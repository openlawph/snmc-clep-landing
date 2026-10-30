/*
 * Site Settings (clinic-site-settings.html): settings for the whole public website.
 * Usage: <body x-data="siteSettings">. Needs auth.js, appointments.js (Manila time helpers) and the clinic hours
 * helpers in components.js; load BEFORE Alpine.
 *
 * Saved to the single record in the PocketBase `site_settings` collection: anyone can read it (the public
 * pages check it, assets/js/maintenance.js), only admins (role = "admin") can change it.
 *  - maintenance          on = visitors see "We'll be back soon" and PocketBase refuses online bookings
 *  - maintenance_message  optional text on that page (otherwise a default in English + Bisaya)
 *  - maintenance_until    optional "Expected back" date and time (Manila)
 *  - office_days, office_open, office_close   office hours, shown on the public site
 *  - intake_days, intake_open, intake_close   when the online booking form is open to visitors; outside these
 *                                             hours PocketBase refuses their bookings too (appointments create rule)
 *  - hotline              the emergency number on the public form (Annex D sends people there)
 * Days are 'mon'…'sun', times 'HH:MM', Manila time.
 */
document.addEventListener('alpine:init', () => {
  Alpine.data('siteSettings', () => ({
    me: Auth.user,
    recordId: '',
    days: CLINIC_DAYS,
    hourGroups: [
      { key: 'office', title: 'Office hours', hint: 'When the clinic office is open. Shown on the public site: the booking page and the contact details.' },
      { key: 'intake', title: 'Online booking hours',
        hint: 'Visitors can only open the booking form during these hours. Outside them they see when it opens again, and PocketBase refuses online bookings too. Signed-in staff can always use the form. Shorter hours give spammers and other abusers less time to try.' },
    ],
    form: { maintenance: false, message: '', untilDate: '', untilTime: '', hotline: '', office: { days: [], open: '', close: '' }, intake: { days: [], open: '', close: '' } },
    now: clinicNow(), // updated every 30 seconds, for the "open now" line
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
      setInterval(() => (this.now = clinicNow()), 30000);
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
      const hours = (prefix) => ({ days: record[`${prefix}_days`] || [], open: record[`${prefix}_open`] || '', close: record[`${prefix}_close`] || '' });
      this.form = {
        maintenance: !!record.maintenance, message: record.maintenance_message || '', untilDate: until.date, untilTime: until.time,
        hotline: record.hotline || '', office: hours('office'), intake: hours('intake'),
      };
      this.updated = record.updated || '';
      this.savedJSON = JSON.stringify(this.payload());
    },

    payload() {
      const f = this.form;
      const inWeekOrder = (days) => CLINIC_DAYS.map((d) => d.key).filter((key) => days.includes(key));
      return {
        maintenance: f.maintenance,
        maintenance_message: f.message.trim(),
        maintenance_until: f.untilDate ? manilaToUTC(f.untilDate, f.untilTime || '09:00') : '',
        hotline: f.hotline.trim(),
        office_days: inWeekOrder(f.office.days), office_open: f.office.open, office_close: f.office.close,
        intake_days: inWeekOrder(f.intake.days), intake_open: f.intake.open, intake_close: f.intake.close,
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

    // ---------- Office and online booking hours ----------

    toggleDay(group, key) {
      const days = this.form[group].days;
      this.form[group].days = days.includes(key) ? days.filter((d) => d !== key) : [...days, key];
    },

    copyOfficeHours() {
      this.form.intake = { ...this.form.office, days: [...this.form.office.days] };
    },

    // What's wrong with the office or online booking hours (group 'office' | 'intake'); '' = fine.
    hoursError(group) {
      const h = this.form[group];
      if (!h.days.length) return 'Choose at least one day.';
      if (!h.open || !h.close) return 'Enter an opening and a closing time.';
      if (h.close <= h.open) return 'The closing time has to be after the opening time (on the same day).';
      return '';
    },

    get hoursInvalid() {
      return !!(this.hoursError('office') || this.hoursError('intake'));
    },

    // e.g. "Monday to Friday, 9:00 AM to 4:00 PM", for the hours as they are in the form.
    hoursSummary(group) {
      return this.hoursError(group) ? '' : describeHours(this.form[group]);
    },

    // Whether visitors can book online right now, going by the SAVED settings.
    get intakeStatus() {
      const hours = clinicHours(this.saved, 'intake');
      if (!hours) return '';
      if (this.saved.maintenance) return 'Right now online booking is closed to visitors anyway, because maintenance mode is on.';
      if (hoursOpenAt(hours, this.now)) return `Online booking is open to visitors now, until ${formatSlot(hours.close)}.`;
      const next = nextOpening(hours, this.now);
      return `Online booking is closed to visitors now${next ? `. It opens again ${formatSchedule(manilaToUTC(next.date, next.time))}` : ''}.`;
    },

    // Turning maintenance ON asks first; everything else saves straight away.
    requestSave() {
      if (!this.isAdmin || !this.dirty || this.hoursInvalid) return;
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
