/*
 * <site-header active="home"></site-header>
 * Sticky top navigation. Links come from SITE.nav in assets/js/components.js.
 * The mobile menu toggle uses Alpine (x-data), so this must render before Alpine starts.
 */
customElements.define('site-header', class extends HTMLElement {
  connectedCallback() {
    const { nav, name, logo } = window.SITE;
    const active = this.getAttribute('active');

    const link = (item, mobile) => {
      const isActive = item.key === active;
      const base = mobile
        ? 'block rounded-sm px-3 py-3 text-base'
        : 'relative py-2 text-[15px] after:absolute after:inset-x-0 after:-bottom-0.5 after:h-px after:origin-left after:bg-copper after:transition after:duration-300';
      const state = isActive
        ? (mobile ? 'bg-white/10 text-white' : 'text-white after:scale-x-100')
        : (mobile ? 'text-white/70 hover:bg-white/5 hover:text-white' : 'text-white/65 hover:text-white after:scale-x-0 hover:after:scale-x-100');
      return `<a href="${item.href}" class="${base} ${state}"${isActive ? ' aria-current="page"' : ''}>${item.label}</a>`;
    };

    this.innerHTML = `
      <header x-data="{ open: false }" @keydown.escape.window="open = false"
              class="sticky top-0 z-50 border-b border-white/10 bg-black/95 backdrop-blur">
        <div class="container-site flex h-16 items-center justify-between gap-6">
          <a href="index.html" class="flex items-center gap-3 text-white">
            <img src="${logo}" alt="" class="h-12 w-auto">

            <span class="font-display text-lg leading-tight">${name}</span>
          </a>

          <nav class="hidden items-center gap-7 lg:flex" aria-label="Main">
            ${nav.map((item) => link(item, false)).join('')}
          </nav>

          <button type="button" class="-mr-2 rounded-sm p-2 text-white lg:hidden" @click="open = !open"
                  :aria-expanded="open" aria-controls="mobile-nav" aria-label="Toggle menu">
            <svg x-show="!open" class="size-6" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg>
            <svg x-show="open" x-cloak class="size-6" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6 6 18"/></svg>
          </button>
        </div>

        <nav id="mobile-nav" x-show="open" x-cloak x-transition.opacity.duration.200ms
             class="border-t border-white/10 bg-black lg:hidden" aria-label="Main mobile">
          <div class="container-site flex flex-col gap-1 py-3">
            ${nav.map((item) => link(item, true)).join('')}
          </div>
        </nav>
      </header>`;
  }
});
