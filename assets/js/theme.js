/*
 * Site theme for the Tailwind browser build.
 *
 * This is the one place for colors, fonts and small reusable classes.
 * It injects a <style type="text/tailwindcss"> block that Tailwind reads,
 * so it must load (without defer) BEFORE the Tailwind CDN script.
 *
 * Every token below becomes a utility, e.g. --color-copper -> bg-copper / text-copper,
 * --font-display -> font-display.
 */
(function () {
  const css = String.raw`
@theme {
  --color-ink: #0d1216;        /* dark navy sections */
  --color-night: #0f1015;      /* darker variant */
  --color-cream: #f5f1e8;      /* light sections on inner pages */
  --color-paper: #fbf9f4;      /* cards on cream */
  --color-copper: #b9785c;     /* primary accent: buttons, numbers */
  --color-copper-dark: #9c5f45;
  --color-rose: #c99a86;       /* soft accent labels on dark */
  --color-brown: #6b4518;      /* feature panels */
  --color-amber: #c8883a;      /* amber band */
  --color-muted: #6b6560;      /* body text on cream */

  --font-display: "DM Serif Display", Georgia, serif;
  --font-sans: "Public Sans", ui-sans-serif, system-ui, sans-serif;
}

@layer base {
  html { scroll-behavior: smooth; }
  body { @apply font-sans antialiased; }
  h1, h2, h3, h4 { @apply font-display font-normal; }
}

@layer components {
  .container-site { @apply mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8; }
  .eyebrow { @apply text-xs font-semibold uppercase tracking-[0.2em] text-copper; }
  /* Use together: class="btn btn-primary" or class="btn btn-ghost" */
  .btn { @apply inline-flex items-center justify-center gap-2 rounded-sm px-6 py-3 text-sm font-semibold uppercase tracking-wider transition duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-copper disabled:cursor-not-allowed disabled:opacity-40; }
  .btn-primary { @apply bg-copper text-white hover:bg-copper-dark; }
  .btn-ghost { @apply border border-current hover:bg-black/5; }
  .card { @apply rounded-md bg-paper p-6 shadow-sm ring-1 ring-black/5 sm:p-8; }
  .field-label { @apply mb-1.5 block text-sm font-semibold text-ink; }
  .field { @apply block w-full rounded-sm border border-black/15 bg-white px-3.5 py-2.5 text-ink placeholder:text-black/35 focus:border-copper focus:ring-2 focus:ring-copper/30 focus:outline-none; }
  .field-error { @apply mt-1 text-sm text-red-700; }
  .field-hint { @apply mt-1 text-xs text-muted; }
  /* Radio/checkbox "chip": <label class="pill"><input type="radio" class="accent-copper"> Text</label> */
  .pill { @apply inline-flex cursor-pointer items-center gap-2 rounded-sm border border-black/15 bg-white px-3.5 py-2 text-sm transition hover:border-copper/60 has-checked:border-copper has-checked:bg-copper/10; }
  /* Sub-heading that groups fields inside a form step */
  .form-section { @apply border-b border-black/10 pb-2 font-sans text-xs font-bold uppercase tracking-[0.15em] text-copper-dark; }
  /* The logo on a dark background: a cream medallion it was designed for. <span class="seal size-12"><img src="…svg" alt=""></span> */
  .seal { @apply grid shrink-0 place-items-center rounded-full bg-[radial-gradient(circle_at_50%_45%,#fffdf9,#f5f1e8)] ring-1 ring-[#ae8e5d]/50; }
  .seal > img { @apply block h-auto w-[74%]; } /* the logo is a bit taller than wide: ~82% of the circle's height */
  /* Booking form: x-field adds .is-required to a question the settings make required */
  .is-required > .field-label::after, .is-required > legend::after { content: " *"; @apply text-red-700; }
}
`;
  const style = document.createElement('style');
  style.type = 'text/tailwindcss';
  style.textContent = css;
  document.head.appendChild(style);

  // Plain CSS (not Tailwind), so x-cloak hides things from the very first paint, before Tailwind has built its styles.
  const cloak = document.createElement('style');
  cloak.textContent = '[x-cloak] { display: none !important; }';
  document.head.appendChild(cloak);
})();
