/*
 * Maintenance mode for the public pages. Load it on every PUBLIC page only, in <head>, NOT deferred.
 *
 * Reads the public PocketBase `site_settings` record (SITE.apiUrl). While `maintenance` is on, visitors
 * get a "We'll be back soon" page (in English and Bisaya) instead of the site, and PocketBase refuses
 * online bookings. Anyone signed in to the staff dashboard in this browser still sees the site, with a
 * notice at the top. Add ?maintenance-preview to the address to see the maintenance page anyway.
 * The page stays hidden while this checks; if the settings can't be loaded quickly, the site is shown.
 */
(() => {
  const root = document.documentElement;
  const style = document.createElement('style');
  style.textContent = 'html.maintenance-check body { visibility: hidden; }';
  document.head.appendChild(style);
  root.classList.add('maintenance-check');
  const reveal = () => root.classList.remove('maintenance-check');
  const failSafe = setTimeout(reveal, 2500);

  const preview = new URLSearchParams(location.search).has('maintenance-preview');

  // Signed in to the staff dashboard in this browser? (The PocketBase SDK keeps the session here.)
  const signedInStaff = () => {
    try {
      const auth = JSON.parse(localStorage.getItem('pocketbase_auth') || 'null');
      return !!auth?.token && auth.record?.collectionName === 'users';
    } catch { return false; }
  };

  const formatUntil = (value) => new Date(value.replace(' ', 'T')).toLocaleString('en-PH', {
    timeZone: 'Asia/Manila', weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit',
  });

  function showMaintenancePage(settings) {
    const site = window.SITE;
    document.title = `We'll be back soon · ${site.name}`;
    document.body.innerHTML = `
      <main class="grid min-h-dvh place-items-center bg-ink px-4 py-16 text-white">
        <div class="w-full max-w-xl text-center">
          <img src="${site.emblem}" alt="" class="mx-auto block h-auto w-40 opacity-90 sm:w-48">
          <p class="eyebrow mt-8">${site.name}</p>
          <h1 class="mt-4 text-4xl leading-tight sm:text-5xl">We'll be back soon</h1>
          <p class="mt-2 font-display text-2xl text-white/60" lang="ceb">Mobalik mi dayon</p>
          <div class="mt-8 space-y-4 text-lg leading-relaxed text-white/80">
            <p data-message></p>
            <p data-message-vs lang="ceb" class="text-base text-white/60"></p>
          </div>
          <p data-until class="mt-8 hidden rounded-md bg-white/5 px-4 py-3 text-sm text-white/80"></p>
          <p class="mt-10 text-sm text-white/60">
            For urgent concerns, email <a class="text-rose underline-offset-4 hover:underline" href="mailto:${site.email}">${site.email}</a>.
          </p>
        </div>
      </main>`;
    // The admin's own message (if any) is shown as typed, never as HTML.
    const custom = (settings.maintenance_message || '').trim();
    document.querySelector('[data-message]').textContent = custom
      || 'The clinic\'s website and online booking are being updated. Please check back later.';
    document.querySelector('[data-message-vs]').textContent = custom
      ? '' : 'Gina-update ang website ug online booking sa klinika. Palihug balik sa ulahi.';
    if (settings.maintenance_until) {
      const until = document.querySelector('[data-until]');
      until.textContent = `Expected back: ${formatUntil(settings.maintenance_until)}`;
      until.classList.remove('hidden');
    }
  }

  function showStaffNotice() {
    const bar = document.createElement('div');
    bar.className = 'relative z-[60] bg-amber px-4 py-2 text-center text-sm font-semibold text-ink';
    bar.textContent = 'Maintenance mode is on: visitors see a "We\'ll be back soon" page. You can see the site because you\'re signed in as staff.';
    document.body.prepend(bar);
  }

  document.addEventListener('DOMContentLoaded', async () => {
    try {
      const controller = new AbortController();
      setTimeout(() => controller.abort(), 2300);
      const res = await fetch(`${window.SITE.apiUrl}/api/collections/site_settings/records?perPage=1`, { signal: controller.signal });
      const settings = (await res.json()).items?.[0] || {};
      if (preview) showMaintenancePage(settings);
      else if (settings.maintenance) signedInStaff() ? showStaffNotice() : showMaintenancePage(settings);
    } catch (err) {
      console.warn('[maintenance] could not check maintenance mode; showing the site.', err.message);
    }
    clearTimeout(failSafe);
    reveal();
  });
})();
