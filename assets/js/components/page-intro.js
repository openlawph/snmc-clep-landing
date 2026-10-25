/*
 * <page-intro eyebrow="About the clinic" title="The clinical legal education arm…" logo>
 *   <p>Optional intro paragraph(s)…</p>
 * </page-intro>
 * Dark title band used at the top of every inner page. Child HTML becomes the intro text.
 * Add the `logo` attribute to show the SNMC Legal Aid seal beside the title.
 */
customElements.define('page-intro', class extends HTMLElement {
  connectedCallback() {
    const eyebrow = this.getAttribute('eyebrow') || '';
    const title = this.getAttribute('title') || '';
    const showLogo = this.hasAttribute('logo');
    const body = this.innerHTML.trim();
    this.removeAttribute('title'); // avoid the browser tooltip over the whole band

    this.innerHTML = `
      <section class="relative overflow-hidden bg-ink text-white">
        <div aria-hidden="true" class="pointer-events-none absolute -right-32 -top-32 size-96 rounded-full bg-copper/15 blur-3xl"></div>
        <div class="container-site relative flex flex-col gap-10 py-16 sm:py-24 md:flex-row md:items-center md:justify-between">
          <div>
            <p class="eyebrow">${eyebrow}</p>
            <h1 class="mt-4 max-w-3xl text-4xl leading-tight sm:text-5xl">${title}</h1>
            ${body ? `<div class="mt-6 max-w-3xl space-y-4 text-lg leading-relaxed text-white/75">${body}</div>` : ''}
          </div>
          ${showLogo ? `<img src="${window.SITE.logo}" alt="SNMC Legal Aid seal: “The law is for all.” Est. 2024" class="order-first w-40 shrink-0 md:order-none md:w-64 lg:w-80">` : ''}
        </div>
      </section>`;
  }
});
