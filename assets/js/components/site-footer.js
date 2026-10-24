/*
 * <site-footer></site-footer>
 * Address/email strip + legal links. Details come from SITE in assets/js/components.js.
 */
customElements.define('site-footer', class extends HTMLElement {
  connectedCallback() {
    const { school, email, nav, name } = window.SITE;
    const year = new Date().getFullYear();

    this.innerHTML = `
      <footer class="bg-black text-white/70">
        <div class="container-site grid gap-10 py-12 md:grid-cols-[2fr_1fr]">
          <div>
            <p class="font-display text-2xl text-white">${name}</p>
            <p class="mt-3 max-w-md text-sm leading-relaxed">
              ${school} · Soong, Lapu-Lapu City, Cebu ·
              <a href="mailto:${email}" class="text-rose underline-offset-4 hover:underline">${email}</a>
            </p>
          </div>
          <nav aria-label="Footer" class="grid grid-cols-2 gap-x-6 gap-y-2 text-sm">
            ${nav.map((item) => `<a href="${item.href}" class="hover:text-white">${item.label}</a>`).join('')}
          </nav>
        </div>
        <div class="border-t border-white/10">
          <div class="container-site flex flex-col gap-3 py-5 text-xs sm:flex-row sm:items-center sm:justify-between">
            <p>&copy; ${year} ${school}. Legal services are free of charge.</p>
            <div class="flex gap-5">
              <!-- TODO: point these at the real Terms and Privacy pages when they exist -->
              <a href="#" class="hover:text-white">Terms &amp; Support</a>
              <a href="#" class="hover:text-white">Privacy Policy</a>
            </div>
          </div>
        </div>
      </footer>`;
  }
});
