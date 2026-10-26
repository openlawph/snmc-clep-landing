/*
 * Logo preloader: the SNMC Legal Aid logo on a full-screen backdrop while the page gets ready.
 * Load it on EVERY page, in <head> right after theme.js, NOT deferred (it has to cover the very first paint).
 *
 *  - First page of a visit (per browser tab): the animated logo draws itself once (about 3.5 s), then the
 *    page fades in. If the page still isn't ready, a thin bar shows under the logo until it is.
 *  - Every page after that: quick pages just fade in; the (still) logo and bar only appear if loading takes
 *    longer than a moment, so moving around the staff pages doesn't replay the intro.
 *  - "Ready" = Alpine has started, Tailwind's styles and the fonts are in, and the page's own check is done
 *    (maintenance.js on public pages, auth.js on staff pages). After MAX_MS it gets out of the way regardless.
 *  - Reduced motion: the still logo, no drawing or sliding bar.
 *
 * Plain CSS on purpose: Tailwind hasn't built its styles yet when this runs. The overlay is decorative
 * (aria-hidden), sits outside <body>, and is removed once it has faded out.
 */
(() => {
  const root = document.documentElement;
  const here = document.currentScript.src; // logo URLs are relative to this file (404.html has a <base>)
  const LOGO_ANIMATED = new URL('../img/snmc-legal-aid-animated.svg', here).href;
  const LOGO_STILL = new URL('../img/snmc-legal-aid.svg', here).href;

  const INTRO_KEY = 'snmc-preloader-intro'; // sessionStorage: the intro already played in this tab
  const INTRO_MS = 3500; // the animated logo is fully drawn by then (the banner settles by ~3.9 s)
  const QUICK_DELAY_MS = 350; // later pages: show the logo only if loading takes longer than this…
  const QUICK_MIN_MS = 600; // …and then keep it up at least this long, so it doesn't flicker
  const MAX_MS = 10000;
  const FADE_MS = 500;

  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let firstPage = false;
  try {
    firstPage = sessionStorage.getItem(INTRO_KEY) !== '1';
    sessionStorage.setItem(INTRO_KEY, '1');
  } catch { /* storage blocked: treat every page as a later one */ }
  const mode = !firstPage ? 'quick' : reducedMotion ? 'still' : 'intro';

  const style = document.createElement('style');
  style.textContent = `
    .snmc-preloader {
      position: fixed; inset: 0; z-index: 2147483647;
      display: grid; place-items: center;
      background: radial-gradient(circle at 50% 44%, #fffdf9 0%, #fbf9f4 42%, #f5f1e8 100%);
      transition: opacity ${FADE_MS}ms ease, visibility 0s linear ${FADE_MS}ms;
    }
    .snmc-preloader.is-done { opacity: 0; visibility: hidden; pointer-events: none; }
    .snmc-preloader__mark {
      display: flex; flex-direction: column; align-items: center; gap: clamp(20px, 4vmin, 32px);
      transform: translateY(-3vh);
      transition: transform ${FADE_MS + 200}ms cubic-bezier(.2, .7, .2, 1);
    }
    .snmc-preloader.is-done .snmc-preloader__mark { transform: translateY(-3vh) scale(1.05); }
    .snmc-preloader__logo { display: block; width: clamp(170px, 40vmin, 280px); height: auto; aspect-ratio: 982 / 1082; }
    .snmc-preloader__bar {
      position: relative; overflow: hidden; width: 96px; height: 2px; border-radius: 2px;
      background: rgba(174, 142, 93, .22); opacity: 0; transition: opacity .4s ease;
    }
    .snmc-preloader__bar::after {
      content: ""; position: absolute; inset: 0; width: 40%; border-radius: inherit; background: #ae8e5d;
      animation: snmc-preloader-bar 1.3s cubic-bezier(.45, 0, .55, 1) infinite;
    }
    .snmc-preloader.is-waiting .snmc-preloader__bar { opacity: 1; }
    .snmc-preloader--quick .snmc-preloader__mark { opacity: 0; animation: snmc-preloader-in .35s ease ${QUICK_DELAY_MS}ms forwards; }
    @keyframes snmc-preloader-bar { from { transform: translateX(-100%); } to { transform: translateX(250%); } }
    @keyframes snmc-preloader-in { to { opacity: 1; } }
    @media (prefers-reduced-motion: reduce) {
      .snmc-preloader__mark { transition: none; }
      .snmc-preloader.is-done .snmc-preloader__mark { transform: translateY(-3vh); }
      .snmc-preloader__bar::after { animation: none; width: 100%; opacity: .45; }
    }
    @media print { .snmc-preloader { display: none; } }`;
  document.head.appendChild(style);

  const el = document.createElement('div');
  el.className = `snmc-preloader snmc-preloader--${mode}${mode === 'quick' ? ' is-waiting' : ''}`;
  el.setAttribute('aria-hidden', 'true');
  el.innerHTML = `<div class="snmc-preloader__mark">
      <img class="snmc-preloader__logo" alt="" src="${mode === 'intro' ? LOGO_ANIMATED : LOGO_STILL}">
      <div class="snmc-preloader__bar"></div>
    </div>`;
  root.appendChild(el); // <body> doesn't exist yet; the overlay sits beside it

  const started = performance.now();
  let done = false;

  // Intro: the drawing starts when the logo file has loaded, so time it from then.
  let introOver = mode !== 'intro';
  if (!introOver) {
    const logo = el.querySelector('img');
    const endIntro = () => {
      setTimeout(() => {
        introOver = true;
        if (!done) el.classList.add('is-waiting'); // still loading after the intro: show the bar
      }, INTRO_MS);
    };
    if (logo.complete) endIntro();
    else {
      logo.addEventListener('load', endIntro, { once: true });
      logo.addEventListener('error', () => (introOver = true), { once: true });
    }
  }

  function hide() {
    if (done) return;
    done = true;
    el.classList.add('is-done');
    setTimeout(() => el.remove(), FADE_MS + 250);
  }

  let alpineStarted = false;
  document.addEventListener('alpine:initialized', () => (alpineStarted = true), { once: true });
  const gatesOpen = () => !root.classList.contains('maintenance-check')
    && (!root.hasAttribute('data-auth-required') || root.classList.contains('auth-ok'));
  const stylesIn = () => !!document.body && getComputedStyle(document.body).fontFamily.includes('Public Sans');
  const fontsIn = () => !document.fonts || document.fonts.status === 'loaded';

  let readyAt = 0;
  (function check() {
    if (done) return;
    const now = performance.now();
    if (now - started > MAX_MS) return hide();
    if (!readyAt && alpineStarted && gatesOpen() && stylesIn()) readyAt = now;
    // Once ready, give the fonts up to 1.5 s more so the text doesn't change font right after the fade.
    const settled = readyAt && (fontsIn() || now - readyAt > 1500);
    const shownLongEnough = mode !== 'quick' || now - started < QUICK_DELAY_MS || now - started > QUICK_DELAY_MS + QUICK_MIN_MS;
    if (settled && introOver && shownLongEnough) return requestAnimationFrame(() => requestAnimationFrame(hide));
    setTimeout(check, 50);
  })();

  // Coming back with the Back button can restore a page that was still loading: just show it.
  window.addEventListener('pageshow', (e) => { if (e.persisted) hide(); });
})();
