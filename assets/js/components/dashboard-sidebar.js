/*
 * <dashboard-sidebar active="users"></dashboard-sidebar>
 * Sidebar for the staff pages (clinic-*.html): logo, menu, signed-in user, Sign out.
 * `active` = the `key` of the current page in DASHBOARD_NAV.
 *
 * On small screens it's a slide-out drawer. Open it from the page with
 *   <button @click="$dispatch('open-sidebar')">…</button>
 *
 * Needs assets/js/auth.js. Only load it on staff pages (it names them), never on public pages.
 * Uses Alpine (x-data), so it must render before Alpine starts.
 */

// Items with `href: null` aren't built yet and show as "Soon".
const DASHBOARD_NAV = [
  { key: 'dashboard', label: 'Dashboard', href: 'clinic-dashboard.html', icon: 'M3 12 12 4l9 8M5 10v10h5v-6h4v6h5V10' },
  { key: 'intake', label: 'New intake', href: 'clinic-intake.html', icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6M12 18v-6M9 15h6' },
  { key: 'appointments', label: 'Appointments', href: 'clinic-appointments.html', icon: 'M8 2v4M16 2v4M3 9h18M5 4h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2z' },
  { key: 'users', label: 'Users', href: 'clinic-users.html', icon: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM22 19v-1a4 4 0 0 0-3-3.87M16 4.13a3 3 0 0 1 0 5.74' },
  { key: 'lawyers', label: 'Lawyers', href: 'clinic-lawyers.html', icon: 'M12 3v18M7 21h10M4 7h16M4 7l-3 7h6L4 7zM20 7l-3 7h6l-3-7z' },
  { key: 'practitioners', label: 'LSPs', href: 'clinic-practitioners.html', icon: 'M22 10 12 5 2 10l10 5 10-5zM6 12v5c3 2 9 2 12 0v-5M22 10v6' },
  { key: 'clients', label: 'Client Records', href: null, icon: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6zM14 2v6h6M8 13h8M8 17h5' },
  { key: 'settings', label: 'Intake Settings', href: 'clinic-settings.html', icon: 'M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6' },
  { key: 'site', label: 'Site Settings', href: 'clinic-site-settings.html', icon: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z' },
];

customElements.define('dashboard-sidebar', class extends HTMLElement {
  connectedCallback() {
    const active = this.getAttribute('active');
    const icon = (d) => `<svg class="size-5 shrink-0" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="${d}"/></svg>`;

    const item = (it) => {
      if (!it.href) {
        return `<span class="flex cursor-default items-center gap-3 rounded-sm px-3 py-2.5 text-[15px] text-white/35">
            ${icon(it.icon)} ${it.label}
            <span class="ml-auto rounded-sm bg-white/5 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wider">Soon</span>
          </span>`;
      }
      const isActive = it.key === active;
      return `<a href="${it.href}"${isActive ? ' aria-current="page"' : ''}
           class="flex items-center gap-3 rounded-sm px-3 py-2.5 text-[15px] transition ${isActive ? 'bg-white/10 text-white [&>svg]:text-copper' : 'text-white/65 hover:bg-white/5 hover:text-white'}">
          ${icon(it.icon)} ${it.label}
        </a>`;
    };

    // The user's name/email are shown with x-text (never inserted as HTML).
    this.innerHTML = `
      <div x-data="{ open: false, user: Auth.user, init() { pb.authStore.onChange(() => (this.user = pb.authStore.record)); } }"
           @open-sidebar.window="open = true" @keydown.escape.window="open = false">
        <div x-show="open" x-cloak x-transition.opacity @click="open = false" class="fixed inset-0 z-40 bg-black/50 lg:hidden"></div>

        <aside :class="open && 'max-lg:translate-x-0!'"
               class="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-ink text-white transition-transform duration-200 max-lg:-translate-x-full">
          <a href="clinic-dashboard.html" class="flex items-center gap-3 border-b border-white/10 px-5 py-5">
            <img src="${window.SITE.emblem}" alt="" class="h-12 w-auto shrink-0">
            <span class="leading-tight">
              <span class="block font-display text-lg">Legal Clinic</span>
              <span class="block text-xs uppercase tracking-[0.2em] text-rose">Dashboard</span>
            </span>
          </a>

          <nav class="flex-1 space-y-1 overflow-y-auto p-3" aria-label="Dashboard">
            ${DASHBOARD_NAV.map(item).join('')}
          </nav>

          <div class="border-t border-white/10 p-3">
            <div class="flex items-center gap-3 px-3 py-2">
              <span class="grid size-9 shrink-0 place-items-center rounded-full bg-copper/20 font-semibold text-copper" aria-hidden="true"
                    x-text="(user?.name || user?.email || '?').charAt(0).toUpperCase()"></span>
              <span class="min-w-0 leading-tight">
                <span class="block truncate text-sm text-white" x-text="user?.name || user?.email"></span>
                <span class="block truncate text-xs text-white/50" x-text="user?.role === 'admin' ? 'Admin · ' + user.email : user?.email"></span>
              </span>
            </div>
            <button type="button" @click="Auth.signOut()"
                    class="mt-1 flex w-full items-center gap-3 rounded-sm px-3 py-2.5 text-[15px] text-white/65 transition hover:bg-white/5 hover:text-white">
              ${icon('M15 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 17l5-5-5-5M15 12H3')}
              Sign out
            </button>
            <a href="index.html" class="flex items-center gap-2 px-3 py-2 text-xs text-white/50 hover:text-white">
              <span aria-hidden="true">←</span> Back to public site
            </a>
          </div>
        </aside>
      </div>`;
  }
});
