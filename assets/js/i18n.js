/*
 * Small translation layer for the booking form: EN (English) and VS (Visayan / Cebuano). No library.
 * Load before Alpine, followed by the word lists (assets/js/i18n-vs.js).
 *
 *   x-t                    on an element whose content is plain English text → shown translated
 *   x-t.html               same, for text with simple markup (<strong>…)
 *   x-t:placeholder        translates that attribute (any attribute name works)
 *   $t('Age: {age}', { age })   in any Alpine expression → translated text, {placeholders} filled in
 *   $store.i18n.lang       'en' | 'vs' (x-model it from a <select>); remembered in this browser
 *
 * Translations are keyed by the English text in I18N_STRINGS. Anything missing falls back to English.
 * The element needs to be inside an x-data scope for Alpine to process it.
 */

const I18N_LANGS = [
  { code: 'en', label: 'EN', name: 'English', html: 'en' },
  { code: 'vs', label: 'VS', name: 'Visaya', html: 'ceb' },
];

window.I18N_STRINGS = window.I18N_STRINGS || {};

document.addEventListener('alpine:init', () => {
  let saved = 'en';
  try { saved = localStorage.getItem('snmc-lang') || 'en'; } catch { /* storage blocked: stay in English */ }

  Alpine.store('i18n', {
    langs: I18N_LANGS,
    lang: I18N_LANGS.some((l) => l.code === saved) ? saved : 'en',

    init() {
      // Runs again whenever `lang` changes.
      Alpine.effect(() => {
        document.documentElement.lang = I18N_LANGS.find((l) => l.code === this.lang).html;
        try { localStorage.setItem('snmc-lang', this.lang); } catch { /* not remembered, that's fine */ }
      });
    },

    t(key, params) {
      let text = this.lang === 'en' ? key : (window.I18N_STRINGS[this.lang]?.[key] ?? key);
      if (params) text = text.replace(/\{(\w+)\}/g, (m, name) => (params[name] ?? m));
      return text;
    },

    monthName(index) {
      const custom = window.I18N_STRINGS[this.lang]?.$months;
      return custom ? custom[index] : new Date(2000, index, 1).toLocaleDateString('en-GB', { month: 'long' });
    },

    // Sunday first: 0 → 'Sunday' / 'Domingo'
    weekday(index) {
      const custom = window.I18N_STRINGS[this.lang]?.$weekdays;
      return custom ? custom[index] : new Date(2000, 0, 2 + index).toLocaleDateString('en-GB', { weekday: 'long' });
    },

    // Sunday first, e.g. ['Sun', 'Mon', …]
    weekdayShort(index) {
      const custom = window.I18N_STRINGS[this.lang]?.$weekdaysShort;
      return custom ? custom[index] : new Date(2000, 0, 2 + index).toLocaleDateString('en-GB', { weekday: 'short' });
    },

    // 'YYYY-MM-DD' → "Tuesday, 27 October 2026" / "Martes, 27 Oktubre 2026"
    formatDate(ymd) {
      const [y, m, d] = ymd.split('-').map(Number);
      const date = new Date(y, m - 1, d);
      const days = window.I18N_STRINGS[this.lang]?.$weekdays;
      if (!days) return date.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
      return `${days[date.getDay()]}, ${d} ${this.monthName(m - 1)} ${y}`;
    },
  });

  Alpine.magic('t', () => (key, params) => Alpine.store('i18n').t(key, params));

  Alpine.directive('t', (el, { value, modifiers }, { effect }) => {
    const store = Alpine.store('i18n');
    if (value) {
      const key = el.getAttribute(value);
      effect(() => el.setAttribute(value, store.t(key)));
    } else if (modifiers.includes('html')) {
      const key = el.innerHTML.replace(/\s+/g, ' ').trim();
      effect(() => { el.innerHTML = store.t(key); }); // translations are our own static strings
    } else {
      const key = el.textContent.replace(/\s+/g, ' ').trim();
      effect(() => { el.textContent = store.t(key); });
    }
  });
});
