/*
 * Intake Form Settings (clinic-settings.html): which days, time slots and fields the public booking
 * form (index.html) offers. Usage: <body x-data="intakeSettings">. Needs auth.js and intake.js
 * (INTAKE_WEEKDAYS, INTAKE_STEPS, INTAKE_FIELDS, formatSlot); load BEFORE Alpine.
 *
 * Everything is saved to the single record in the PocketBase `intake_settings` collection.
 * Anyone can read it (the booking form needs it); only admins (role = "admin") can change it.
 */

// Time slots admins can choose from: every 30 minutes, 7:00 AM to 7:00 PM.
const SETTINGS_FIRST_SLOT = 7 * 60;
const SETTINGS_LAST_SLOT = 19 * 60;
const SETTINGS_SLOT_MINUTES = 30;

const hhmm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

document.addEventListener('alpine:init', () => {
  Alpine.data('intakeSettings', () => ({
    me: Auth.user,
    weekdays: INTAKE_WEEKDAYS,
    steps: INTAKE_STEPS,
    fields: INTAKE_FIELDS,

    recordId: '',
    days: [],
    slots: [],
    hidden: [],
    savedJSON: '', // what's in PocketBase, to spot unsaved changes
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
        const res = await pb.collection('intake_settings').getList(1, 1);
        const record = res.items[0];
        if (!record) throw Object.assign(new Error('missing'), { status: 404 });
        this.recordId = record.id;
        this.apply(record);
      } catch (err) {
        this.loadError = err?.status === 404
          ? 'The settings record is missing in PocketBase (collection "intake_settings").'
          : err?.status === 0 ? 'Couldn\'t reach the server. Check your internet connection and try again.'
          : 'The settings couldn\'t be loaded. Please try again.';
      } finally {
        this.loading = false;
      }
    },

    apply(record) {
      this.days = Array.isArray(record.days) ? [...record.days] : [];
      this.slots = Array.isArray(record.time_slots) ? [...record.time_slots] : [];
      this.hidden = Array.isArray(record.hidden_fields) ? [...record.hidden_fields] : [];
      this.updated = record.updated || '';
      this.savedJSON = JSON.stringify(this.payload());
    },

    // Sorted, so the order things were clicked in doesn't count as a change.
    payload() {
      const dayOrder = this.weekdays.map((w) => w.key);
      return {
        days: [...this.days].sort((a, b) => dayOrder.indexOf(a) - dayOrder.indexOf(b)),
        time_slots: [...this.slots].sort(),
        hidden_fields: [...this.hidden].sort(),
      };
    },

    get dirty() {
      return !this.loading && !this.loadError && JSON.stringify(this.payload()) !== this.savedJSON;
    },

    discard() {
      const saved = JSON.parse(this.savedJSON);
      this.days = saved.days;
      this.slots = saved.time_slots;
      this.hidden = saved.hidden_fields;
      this.saveError = '';
    },

    // ---------- Days ----------

    toggleDay(key) {
      this.days = this.days.includes(key) ? this.days.filter((d) => d !== key) : [...this.days, key];
    },

    // ---------- Time slots ----------

    get slotGroups() {
      const all = [];
      for (let m = SETTINGS_FIRST_SLOT; m <= SETTINGS_LAST_SLOT; m += SETTINGS_SLOT_MINUTES) all.push(hhmm(m));
      return [
        { label: 'Morning', slots: all.filter((s) => s < '12:00') },
        { label: 'Afternoon', slots: all.filter((s) => s >= '12:00' && s < '17:00') },
        { label: 'Evening', slots: all.filter((s) => s >= '17:00') },
      ];
    },

    toggleSlot(slot) {
      this.slots = this.slots.includes(slot) ? this.slots.filter((s) => s !== slot) : [...this.slots, slot];
    },

    // Every hour from `from` to `to` (inclusive), e.g. useHourly(8, 16) → 8:00 AM … 4:00 PM.
    useHourly(from, to) {
      this.slots = Array.from({ length: to - from + 1 }, (_, i) => hhmm((from + i) * 60));
    },

    // ---------- Fields ----------

    fieldsFor(step) {
      return this.fields.filter((f) => f.step === step);
    },

    isShown(field) {
      return field.locked || !this.hidden.includes(field.key);
    },

    toggleField(field) {
      if (field.locked) return;
      this.hidden = this.hidden.includes(field.key) ? this.hidden.filter((k) => k !== field.key) : [...this.hidden, field.key];
    },

    hiddenCount(step) {
      return this.fieldsFor(step).filter((f) => !this.isShown(f)).length;
    },

    // The booking form skips a step when none of its fields are shown.
    stepSkipped(step) {
      return this.fieldsFor(step).every((f) => !this.isShown(f));
    },

    setStep(step, shown) {
      const keys = this.fieldsFor(step).filter((f) => !f.locked).map((f) => f.key);
      this.hidden = shown ? this.hidden.filter((k) => !keys.includes(k)) : [...new Set([...this.hidden, ...keys])];
    },

    // ---------- Summary and saving ----------

    get summary() {
      const p = this.payload();
      const days = this.weekdays.filter((w) => p.days.includes(w.key)).map((w) => w.plural);
      const dayText = days.length > 1 ? `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}` : days[0] || 'No days';
      const slots = p.time_slots;
      const slotText = !slots.length ? 'no time slots'
        : `${slots.length} time slot${slots.length === 1 ? '' : 's'} (${formatSlot(slots[0])}${slots.length > 1 ? ` – ${formatSlot(slots[slots.length - 1])}` : ''})`;
      return `${dayText} · ${slotText} · ${p.hidden_fields.length} field${p.hidden_fields.length === 1 ? '' : 's'} hidden`;
    },

    get problems() {
      const list = [];
      if (!this.days.length) list.push('Choose at least one consultation day.');
      if (!this.slots.length) list.push('Choose at least one time slot.');
      return list;
    },

    get updatedLabel() {
      if (!this.updated) return '';
      return new Date(this.updated.replace(' ', 'T')).toLocaleString('en-PH', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
    },

    async save() {
      if (this.problems.length || !this.isAdmin) return;
      this.saving = true;
      this.saveError = '';
      try {
        const record = await pb.collection('intake_settings').update(this.recordId, this.payload());
        this.apply(record);
        this.flash('Saved. The booking form uses the new settings from now on.');
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
      this._toastTimer = setTimeout(() => (this.toast = ''), 4000);
    },
  }));
});
