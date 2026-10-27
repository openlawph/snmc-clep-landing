/*
 * Shared site settings + small helpers used by the components in assets/js/components/.
 *
 * Edit contact details and the navigation HERE — every page picks them up.
 * Load order (see any page's <head>): theme.js -> Tailwind -> components.js -> components/*.js -> Alpine.
 */
window.SITE = {
  name: 'SNMC Law Legal Clinic',
  school: 'Sto. Niño Mactan College – School of Law',
  phone: '[add clinic number]', // TODO: replace with the clinic's phone number
  email: 'legal-clinic@snmclaw.com',
  address: 'Sto. Niño Mactan College – School of Law, Soong, Lapu-Lapu City, Cebu',
  // Admins set the office hours in Site Settings; these show until they load, and if they can't be loaded.
  officeHours: { days: ['mon', 'tue', 'wed', 'thu', 'fri'], open: '09:00', close: '16:00' },
  consultationHours: 'Consultations Tuesday and Thursday, 1:00 PM to 5:00 PM by appointment.',

  // PocketBase server (the booking form reads its public settings from here; staff pages use assets/js/auth.js).
  apiUrl: 'https://capi.snmclaw.com',

  // Cloudflare Turnstile "security check" on the booking form. Paste the widget's SITE key here (it's public);
  // the SECRET key goes on the PocketBase server only (README → "Spam protection"). Empty = no check shown.
  turnstileSiteKey: '',

  // SNMC Legal Aid seal in full colour (SVG), for light backgrounds. The sign-in page, favicon and
  // preloader point at the same file.
  logo: 'assets/img/snmc-legal-aid.svg',
  // The full seal (with lettering) in plain white, for dark backgrounds: <page-intro logo>.
  logoWhite: 'assets/img/snmc-legal-aid-white.svg',
  // The same emblem in plain white (no lettering), for dark backgrounds: header, footer, maintenance page and staff sidebar.
  emblem: 'assets/img/snmc-legal-aid-emblem-white.svg',

  // Top navigation. `key` matches the `active` attribute on <site-header>.
  // For now the booking page (index.html) is the only page linked. home.html, about.html,
  // services.html, team.html and donate.html still exist; add them back here to relink them.
  nav: [
    { key: 'book', label: 'Book a Visit', href: 'index.html' },
  ],
};

// The public PocketBase `site_settings` record (maintenance mode, hours), fetched once per page and shared;
// null if it can't be loaded. { fresh: true } asks the server again (e.g. to find out why a booking was refused).
function fetchSiteSettings({ fresh = false } = {}) {
  if (fresh || !fetchSiteSettings.promise) {
    fetchSiteSettings.promise = fetch(`${window.SITE.apiUrl}/api/collections/site_settings/records?perPage=1`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error(`HTTP ${res.status}`))))
      .then((data) => data.items?.[0] || null)
      .catch((err) => {
        console.warn('[site settings] could not be loaded:', err.message);
        return null;
      });
  }
  return fetchSiteSettings.promise;
}

/*
 * Clinic hours: office hours, and the hours the online booking form is open to visitors ("intake hours").
 * Admins set both in Site Settings. They're saved on the site_settings record as office_days / office_open /
 * office_close and intake_days / intake_open / intake_close: days 'mon'…'sun', times 'HH:MM' in Manila time.
 * Outside the intake hours PocketBase refuses visitors' bookings too (README → "Site Settings").
 */

// Monday first, as Site Settings lists them. `day` = Date#getDay() (Sunday = 0).
const CLINIC_DAYS = [
  { key: 'mon', day: 1, label: 'Monday' },
  { key: 'tue', day: 2, label: 'Tuesday' },
  { key: 'wed', day: 3, label: 'Wednesday' },
  { key: 'thu', day: 4, label: 'Thursday' },
  { key: 'fri', day: 5, label: 'Friday' },
  { key: 'sat', day: 6, label: 'Saturday' },
  { key: 'sun', day: 0, label: 'Sunday' },
];

// Office ('office') or online booking ('intake') hours from a site_settings record:
// { days: ['mon', …], open: '09:00', close: '16:00' }, or null if the record doesn't have them.
function clinicHours(record, prefix) {
  const days = record?.[`${prefix}_days`];
  const open = record?.[`${prefix}_open`];
  const close = record?.[`${prefix}_close`];
  return Array.isArray(days) && days.length && open && close ? { days, open, close } : null;
}

// '13:00' → '1:00 PM'
function formatSlot(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'AM' : 'PM'}`;
}

// Today's date, the time now and the day of the week at the clinic (Manila), whatever time zone the device is
// set to, e.g. { date: '2026-10-27', time: '13:05', day: 2 } (day as Date#getDay(), Sunday = 0).
const MANILA_CLOCK = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Manila', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
function clinicNow() {
  const p = Object.fromEntries(MANILA_CLOCK.formatToParts(new Date()).map((part) => [part.type, part.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}`, day: new Date(Date.UTC(p.year, p.month - 1, p.day)).getUTCDay() };
}

// Are `hours` open at `now` (clinicNow())? From the opening time up to, not including, the closing time.
function hoursOpenAt(hours, now) {
  const today = CLINIC_DAYS.find((d) => d.day === now.day).key;
  return hours.days.includes(today) && now.time >= hours.open && now.time < hours.close;
}

// When `hours` next open after `now` (clinicNow()): { date: 'YYYY-MM-DD', time: 'HH:MM', daysAhead: 0–7 }, or null.
function nextOpening(hours, now) {
  const [y, m, d] = now.date.split('-').map(Number);
  for (let ahead = 0; ahead <= 7; ahead++) {
    const date = new Date(Date.UTC(y, m - 1, d + ahead));
    const key = CLINIC_DAYS.find((w) => w.day === date.getUTCDay()).key;
    if (hours.days.includes(key) && (ahead > 0 || now.time < hours.open)) {
      return { date: date.toISOString().slice(0, 10), time: hours.open, daysAhead: ahead };
    }
  }
  return null;
}

// { days, open, close } → 'Monday to Friday, 9:00 AM to 4:00 PM'. Three or more days in a row read as a range.
// `t` and `dayName` translate it (the booking form passes its Bisaya ones); the defaults are English.
function describeHours(hours, t = fillText, dayName = (d) => d.label) {
  const open = CLINIC_DAYS.filter((d) => hours.days.includes(d.key));
  const runs = []; // days in a row, e.g. [[Mon, Tue, Wed], [Fri]]
  open.forEach((d, i) => {
    if (i && CLINIC_DAYS.indexOf(d) === CLINIC_DAYS.indexOf(open[i - 1]) + 1) runs[runs.length - 1].push(d);
    else runs.push([d]);
  });
  const parts = open.length === 7 ? [t('Every day')]
    : runs.flatMap((run) => (run.length > 2 ? [t('{from} to {to}', { from: dayName(run[0]), to: dayName(run[run.length - 1]) })] : run.map(dayName)));
  const days = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} ${t('and')} ${parts[parts.length - 1]}` : parts[0];
  return `${days}, ${t('{from} to {to}', { from: formatSlot(hours.open), to: formatSlot(hours.close) })}`;
}

// English stand-in for the booking form's $t(): just fills in the {placeholders}.
function fillText(text, params) {
  return text.replace(/\{(\w+)\}/g, (m, name) => params?.[name] ?? m);
}

/*
 * Scroll reveal: add `data-reveal` to any element to fade it up when it scrolls into view.
 * Optional `data-reveal-delay="150"` (ms) to stagger siblings.
 * Content stays visible if JS fails, because the hidden state is only applied here.
 */
document.addEventListener('DOMContentLoaded', () => {
  const els = document.querySelectorAll('[data-reveal]');
  if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  els.forEach((el) => {
    el.style.transitionDelay = (el.dataset.revealDelay || 0) + 'ms';
    el.classList.add('transition', 'duration-700', 'ease-out', 'opacity-0', 'translate-y-6');
  });

  const io = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.remove('opacity-0', 'translate-y-6');
      io.unobserve(entry.target);
    });
  }, { threshold: 0.12 });

  els.forEach((el) => io.observe(el));
});
