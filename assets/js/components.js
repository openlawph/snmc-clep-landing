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
  officeHours: 'Monday to Friday, 9:00 AM to 4:00 PM.',
  consultationHours: 'Consultations Tuesday and Thursday, 1:00 PM to 5:00 PM by appointment.',

  // Top navigation. `key` matches the `active` attribute on <site-header>.
  nav: [
    { key: 'home', label: 'Home', href: 'index.html' },
    { key: 'about', label: 'About Us', href: 'about.html' },
    { key: 'services', label: 'Our Services', href: 'services.html' },
    { key: 'team', label: 'Our Team', href: 'team.html' },
    { key: 'book', label: 'Book a Visit', href: 'book.html' },
    { key: 'donate', label: 'Donate', href: 'donate.html' },
  ],
};

/* Scales-of-justice mark used in the header. */
window.SITE.logoSvg = `
<svg viewBox="0 0 48 48" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M24 6v34M14 42h20M10 12h28M24 8l0 0"/>
  <path d="M10 12 4 26h12L10 12zM38 12l-6 14h12L38 12z"/>
  <path d="M4 26a6 4 0 0 0 12 0M32 26a6 4 0 0 0 12 0"/>
</svg>`;

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
