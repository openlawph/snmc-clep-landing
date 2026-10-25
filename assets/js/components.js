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

  // SNMC Legal Aid seal, used in the header, footer, booking intro and as the favicon.
  logo: 'assets/img/snmc-legal-aid-logo.png',

  // Top navigation. `key` matches the `active` attribute on <site-header>.
  // For now the booking page (index.html) is the only page linked. home.html, about.html,
  // services.html, team.html and donate.html still exist; add them back here to relink them.
  nav: [
    { key: 'book', label: 'Book a Visit', href: 'index.html' },
  ],
};

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
