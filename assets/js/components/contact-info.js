/*
 * <contact-info></contact-info>               -> full block: phone, email, address and hours (dark background)
 * <contact-info variant="inline"></contact-info> -> phone · email on one line
 *
 * Single source for contact details; edit them in SITE (assets/js/components.js).
 */
customElements.define('contact-info', class extends HTMLElement {
  connectedCallback() {
    const { phone, email, address, officeHours, consultationHours } = window.SITE;
    const tel = phone.replace(/[^\d+]/g, '');
    const phoneHtml = tel ? `<a href="tel:${tel}" class="hover:text-copper">${phone}</a>` : phone;
    const emailHtml = `<a href="mailto:${email}" class="hover:text-copper">${email}</a>`;

    if (this.getAttribute('variant') === 'inline') {
      this.innerHTML = `
        <div class="flex flex-wrap gap-x-8 gap-y-2 text-sm font-semibold">
          <span>${phoneHtml}</span><span>${emailHtml}</span>
        </div>`;
      return;
    }

    const row = (label, value, icon) => `
      <div class="flex gap-4">
        <span class="mt-1 grid size-10 shrink-0 place-items-center rounded-full bg-white/5 text-rose">${icon}</span>
        <div>
          <p class="font-display text-2xl text-rose">${label}</p>
          <p class="mt-1 text-white/85">${value}</p>
        </div>
      </div>`;
    const icon = (d) => `<svg class="size-5" fill="none" stroke="currentColor" stroke-width="1.8" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

    this.innerHTML = `
      <div class="space-y-8">
        ${row('Phone', phoneHtml, icon('M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2'))}
        ${row('Email', emailHtml, icon('M3 6h18v12H3zM3 6l9 7 9-7'))}
        ${row('Visit', `${address}.<br><span class="mt-2 block text-sm text-white/65">${officeHours} ${consultationHours}</span>`,
              icon('M12 21s7-6.1 7-11.5A7 7 0 0 0 5 9.5C5 14.9 12 21 12 21zM12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5z'))}
      </div>`;
  }
});
