/*
 * Intake Form Settings (clinic-settings.html): which days, time slots and questions the public booking
 * form (index.html) offers. Usage: <body x-data="intakeSettings">. Needs auth.js and intake.js
 * (INTAKE_WEEKDAYS, INTAKE_STEPS, INTAKE_FIELDS, INTAKE_DEFAULT_SETTINGS) and formatSlot() from components.js; load BEFORE Alpine.
 *
 * Each question can be asked or not, required or not, and locked as "Always ask" (then neither can be
 * changed until someone unlocks it, which asks for confirmation). Core questions (INTAKE_FIELDS
 * `core: true`) are always asked and required.
 *
 * Everything is saved to the single record in the PocketBase `intake_settings` collection.
 * Anyone can read it (the booking form needs it); only admins (role = "admin") can change it.
 *
 * The "Reference numbers & safeguards" card is saved separately, to `intake_controls` (staff read, admins change, the
 * public can't see it). It only sends what changed, so saving it can't undo a number given out in the meantime, and the
 * API rules refuse to move a counter backwards. See pocketbase/annex-c-d-schema.js.
 */

// Time slots admins can choose from: every 30 minutes, 7:00 AM to 7:00 PM.
const SETTINGS_FIRST_SLOT = 7 * 60;
const SETTINGS_LAST_SLOT = 19 * 60;
const SETTINGS_SLOT_MINUTES = 30;

const hhmm = (minutes) => `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const toggled = (list, item) => (list.includes(item) ? list.filter((x) => x !== item) : [...list, item]);

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
    required: [],
    locked: [],
    savedJSON: '', // what's in PocketBase, to spot unsaved changes
    updated: '',
    loading: true,
    loadError: '',
    saving: false,
    saveError: '',
    toast: '',
    unlockTarget: null, // question waiting for "Unlock?" confirmation

    // Reference numbers & safeguards (intake_controls)
    controls: null, // the saved record; null = not installed on the server yet
    controlsForm: {},
    controlErrors: {},
    controlError: '',
    savingControls: false,
    paperOpen: [], // paper numbers issued and not filed in yet
    voidTarget: null,
    voidReason: '',
    voidError: '',
    voiding: false,

    init() {
      pb.authStore.onChange(() => (this.me = pb.authStore.record));
      window.addEventListener('beforeunload', (e) => { if (this.dirty || this.controlsDirty) e.preventDefault(); });
      this.load();
      this.loadControls();
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
      const list = (value, fallback) => (Array.isArray(value) ? [...value] : [...fallback]);
      this.days = list(record.days, []);
      this.slots = list(record.time_slots, []);
      this.hidden = list(record.hidden_fields, []);
      this.required = list(record.required_fields, INTAKE_DEFAULT_SETTINGS.required_fields);
      this.locked = list(record.locked_fields, INTAKE_DEFAULT_SETTINGS.locked_fields);
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
        required_fields: [...this.required].sort(),
        locked_fields: [...this.locked].sort(),
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
      this.required = saved.required_fields;
      this.locked = saved.locked_fields;
      this.saveError = '';
    },

    // ---------- Days ----------

    toggleDay(key) {
      this.days = toggled(this.days, key);
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
      this.slots = toggled(this.slots, slot);
    },

    // Every hour from `from` to `to` (inclusive), e.g. useHourly(8, 16) → 8:00 AM … 4:00 PM.
    useHourly(from, to) {
      this.slots = Array.from({ length: to - from + 1 }, (_, i) => hhmm((from + i) * 60));
    },

    // ---------- Questions ----------

    fieldsFor(step) {
      return this.fields.filter((f) => f.step === step);
    },

    isLocked(field) {
      return !!field.core || this.locked.includes(field.key);
    },

    isShown(field) {
      return this.isLocked(field) || !this.hidden.includes(field.key);
    },

    isRequired(field) {
      if (field.core) return true;
      return field.canRequire !== false && this.isShown(field) && this.required.includes(field.key);
    },

    // Uploads stay off until the spam check is on the server: anonymous uploads without it could fill the disk.
    needsSpamCheck(field) {
      return !!field.needsSpamCheck && !INTAKE_UPLOADS.enabled;
    },

    canChangeAsk(field) {
      return this.isAdmin && !this.isLocked(field) && !this.needsSpamCheck(field);
    },

    canChangeRequired(field) {
      return this.isAdmin && !this.isLocked(field) && field.canRequire !== false && this.isShown(field);
    },

    toggleAsk(field) {
      if (this.canChangeAsk(field)) this.hidden = toggled(this.hidden, field.key);
    },

    toggleRequired(field) {
      if (this.canChangeRequired(field)) this.required = toggled(this.required, field.key);
    },

    // Locking makes sure the question is asked; unlocking asks for confirmation first.
    toggleLock(field) {
      if (!this.isAdmin || field.core || this.needsSpamCheck(field)) return;
      if (this.locked.includes(field.key)) {
        this.unlockTarget = field;
        this.$refs.unlockDialog.showModal();
      } else {
        this.locked = [...this.locked, field.key];
        this.hidden = this.hidden.filter((k) => k !== field.key);
      }
    },

    confirmUnlock() {
      this.locked = this.locked.filter((k) => k !== this.unlockTarget.key);
      this.$refs.unlockDialog.close();
    },

    hiddenCount(step) {
      return this.fieldsFor(step).filter((f) => !this.isShown(f)).length;
    },

    requiredCount(step) {
      return this.fieldsFor(step).filter((f) => this.isRequired(f)).length;
    },

    // The booking form skips a step when none of its questions are asked.
    stepSkipped(step) {
      return this.fieldsFor(step).every((f) => !this.isShown(f));
    },

    // "All on" / "All off" for a step; locked questions stay as they are.
    setStep(step, shown) {
      const keys = this.fieldsFor(step).filter((f) => !this.isLocked(f) && !this.needsSpamCheck(f)).map((f) => f.key);
      this.hidden = shown ? this.hidden.filter((k) => !keys.includes(k)) : [...new Set([...this.hidden, ...keys])];
    },

    canChangeStep(step) {
      return this.isAdmin && this.fieldsFor(step).some((f) => !this.isLocked(f));
    },

    // ---------- Summary and saving ----------

    get summary() {
      const p = this.payload();
      const days = this.weekdays.filter((w) => p.days.includes(w.key)).map((w) => w.plural);
      const dayText = days.length > 1 ? `${days.slice(0, -1).join(', ')} and ${days[days.length - 1]}` : days[0] || 'No days';
      const slots = p.time_slots;
      const slotText = !slots.length ? 'no time slots'
        : `${slots.length} time slot${slots.length === 1 ? '' : 's'} (${formatSlot(slots[0])}${slots.length > 1 ? ` – ${formatSlot(slots[slots.length - 1])}` : ''})`;
      const count = (fn) => this.fields.filter(fn).length;
      const off = count((f) => !this.isShown(f));
      const required = count((f) => this.isRequired(f));
      const always = count((f) => this.isLocked(f));
      return `${dayText} · ${slotText} · ${off} question${off === 1 ? '' : 's'} off · ${required} required · ${always} always asked`;
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
        this.apply(await updateAndLog(this.me, 'intake_settings', { id: this.recordId, ...JSON.parse(this.savedJSON) }, this.payload()));
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

    // ---------- Reference numbers & safeguards ----------

    async loadControls() {
      try {
        const { items: [record] } = await pb.collection('intake_controls').getList(1, 1, { requestKey: null });
        if (!record) return;
        this.applyControls(record);
        this.paperOpen = await pb.collection('paper_forms').getFullList({ filter: 'status = "ISSUED"', sort: 'created', requestKey: null });
      } catch (err) {
        console.warn('[settings] the reference number settings aren\'t available:', err?.status);
      }
    },

    applyControls(record) {
      this.controls = record;
      this.controlsForm = {
        ref_prefix: record.ref_prefix, ref_next: record.ref_next, ref_paper_next: record.ref_paper_next, late_days: record.late_days,
        slot_capacity: record.slot_capacity, max_open_per_mobile: record.max_open_per_mobile,
      };
    },

    get controlsChanges() {
      if (!this.controls) return {};
      const changes = {};
      for (const [key, value] of Object.entries(this.controlsForm)) {
        const typed = typeof this.controls[key] === 'number' ? Number(value) : String(value).trim();
        if (typed !== this.controls[key]) changes[key] = typed;
      }
      return changes;
    },

    get controlsDirty() {
      return Object.keys(this.controlsChanges).length > 0;
    },

    get nextReferencePreview() {
      const f = this.controlsForm;
      const year = this.controls?.ref_year || new Date().getFullYear();
      return `${f.ref_prefix}-${year}-${String(f.ref_next).padStart(6, '0')}`;
    },

    get nextPaperPreview() {
      const f = this.controlsForm;
      const year = this.controls?.ref_year || new Date().getFullYear();
      return `${f.ref_prefix}-${year}-M${String(f.ref_paper_next).padStart(4, '0')}`;
    },

    async saveControls() {
      if (!this.isAdmin || !this.controlsDirty) return;
      this.controlError = '';
      this.controlErrors = {};
      // Forward only: the numbers below have been given out already.
      for (const [key, label] of [['ref_next', 'next number'], ['ref_paper_next', 'next paper number']]) {
        if (Number(this.controlsForm[key]) < this.controls[key]) this.controlErrors[key] = `The ${label} can't go below ${this.controls[key]}: lower numbers are already in use.`;
      }
      if (Object.keys(this.controlErrors).length) { this.controlError = 'Please fix the highlighted fields.'; return; }
      this.savingControls = true;
      try {
        this.applyControls(await updateAndLog(this.me, 'intake_controls', this.controls, this.controlsChanges));
        this.flash('Saved.');
      } catch (err) {
        const fields = err?.response?.data || {};
        this.controlErrors = Object.fromEntries(Object.entries(fields).map(([key, value]) => [key, value?.message || 'Check this field.']));
        this.controlError = Object.keys(this.controlErrors).length ? 'Please fix the highlighted fields.'
          : err?.status === 0 ? 'Couldn\'t reach the server. Check your internet connection and try again.'
          : err?.status === 400 ? 'The server refused this. Reload the page: someone may have taken a number in the meantime.'
          : err?.response?.message || 'The settings couldn\'t be saved. Please try again.';
      } finally {
        this.savingControls = false;
      }
    },

    paperAge(form) {
      return Math.floor((Date.now() - new Date(form.created.replace(' ', 'T')).getTime()) / 86400000);
    },

    askVoid(form) {
      this.voidTarget = form;
      this.voidReason = '';
      this.voidError = '';
      this.$refs.voidDialog.showModal();
    },

    async confirmVoid() {
      if (!this.voidReason.trim()) { this.voidError = 'Say why this number is being voided.'; return; }
      this.voiding = true;
      this.voidError = '';
      try {
        await voidPaperForm(this.me, this.voidTarget, this.voidReason.trim());
        this.paperOpen = this.paperOpen.filter((p) => p.id !== this.voidTarget.id);
        this.$refs.voidDialog.close();
        this.flash(`${this.voidTarget.reference} was voided.`);
      } catch (err) {
        this.voidError = err?.status === 0 ? 'Couldn\'t reach the server. Check your internet connection and try again.' : 'It couldn\'t be voided. Reload the page: it may have been filed in already.';
      } finally {
        this.voiding = false;
      }
    },
  }));
});
