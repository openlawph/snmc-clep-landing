/*
 * <legal-notice></legal-notice>                 -> default "no fees" notice
 * <legal-notice title="Before you book">…custom text…</legal-notice>
 * <legal-notice tone="dark">                    -> for use on dark backgrounds
 *
 * Callout box for fee/confidentiality notices. Child HTML replaces the default text.
 * Add `i18n` to translate the title with x-t (assets/js/i18n.js; needs an x-data around it).
 */
customElements.define('legal-notice', class extends HTMLElement {
  connectedCallback() {
    const title = this.getAttribute('title') || 'Important notice';
    const dark = this.getAttribute('tone') === 'dark';
    const t = this.hasAttribute('i18n') ? ' x-t' : '';
    const body = this.innerHTML.trim() || `
      <p>The clinic charges no fees at any stage. If anyone asks you for payment in the clinic's name,
      report it to the Clinical Program Director immediately.</p>`;
    this.removeAttribute('title');

    this.innerHTML = `
      <aside class="flex gap-4 rounded-md border-l-4 border-copper p-5 sm:p-6 ${dark ? 'bg-white/5 text-white/80' : 'bg-copper/10 text-ink/80'}" role="note">
        <svg class="mt-0.5 size-6 shrink-0 text-copper" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true">
          <path d="M12 3 2.5 20h19L12 3z"/><path d="M12 10v4M12 17.5v.01"/>
        </svg>
        <div class="space-y-3 text-sm leading-relaxed">
          <p class="text-xs font-semibold uppercase tracking-[0.2em] ${dark ? 'text-rose' : 'text-copper-dark'}"${t}>${title}</p>
          ${body}
        </div>
      </aside>`;
  }
});
