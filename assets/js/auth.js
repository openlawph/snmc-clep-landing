/*
 * PocketBase connection + sign-in helpers, shared by login.html and protected pages.
 *
 * Load order (in <head>, NOT deferred, so a protected page stays hidden until checked):
 *   <script src="https://cdn.jsdelivr.net/npm/pocketbase@0.28.1/dist/pocketbase.umd.js"></script>
 *   <script src="assets/js/auth.js"></script>
 *
 * Protect a page by adding `data-auth-required` to its <html> tag. The page stays hidden
 * until the session is confirmed with the server; anyone not signed in, or signed in with an
 * account whose email isn't verified, is sent to login.html and brought back afterwards.
 *
 * This only guards the page in the browser. What actually keeps clinic data private is the
 * API rules on each PocketBase collection (see README → "Sign-in and the dashboard").
 */

const PB_URL = 'https://capi.snmclaw.com'; // keep in sync with SITE.apiUrl in components.js (loads later)
const AUTH_COLLECTION = 'users';
const LOGIN_PAGE = 'login.html';
const DEFAULT_AFTER_LOGIN = 'clinic-dashboard.html';

window.pb = new PocketBase(PB_URL);

window.Auth = {
  get user() {
    return pb.authStore.record;
  },

  // Signed in to the staff collection with a verified email (checked locally; see requireAuth).
  isAllowed() {
    const user = pb.authStore.record;
    return pb.authStore.isValid && !!user && user.collectionName === AUTH_COLLECTION && user.verified === true;
  },

  // Only allow redirects to one of our own pages (blocks ?next=https://evil.example).
  safeNext(next) {
    return /^[a-z0-9-]+\.html(#[a-z0-9-]*)?$/i.test(next || '') ? next : DEFAULT_AFTER_LOGIN;
  },

  toLogin(reason) {
    const here = location.pathname.split('/').pop() + location.hash;
    const params = new URLSearchParams({ next: this.safeNext(here) });
    if (reason) params.set('reason', reason);
    location.replace(`${LOGIN_PAGE}?${params}`);
  },

  async signIn(email, password) {
    const { record } = await pb.collection(AUTH_COLLECTION).authWithPassword(email, password);
    if (!record.verified) {
      pb.authStore.clear();
      const err = new Error('Email not verified');
      err.unverified = true;
      throw err;
    }
    return record;
  },

  signOut() {
    pb.authStore.clear();
    location.replace(`${LOGIN_PAGE}?reason=signed-out`);
  },

  // Turns SDK errors into a sentence for the person signing in.
  errorMessage(err) {
    if (err?.unverified) return 'Your email address hasn\'t been verified yet.';
    switch (err?.status) {
      case 0: return 'Couldn\'t reach the server. Check your internet connection and try again.';
      case 400: return 'Incorrect email or password.';
      case 429: return 'Too many attempts. Please wait a minute and try again.';
      default: return 'Something went wrong. Please try again.';
    }
  },

  // Confirms the saved session with the server (catches deleted, disabled or unverified
  // accounts and expired tokens), then shows the page.
  async requireAuth() {
    if (!this.isAllowed()) {
      const reason = !pb.authStore.token ? '' : pb.authStore.isValid ? 'unverified' : 'expired';
      pb.authStore.clear();
      return this.toLogin(reason);
    }
    try {
      await pb.collection(AUTH_COLLECTION).authRefresh();
    } catch (err) {
      pb.authStore.clear();
      return this.toLogin(err.status === 0 ? 'offline' : 'expired');
    }
    if (!this.isAllowed()) {
      pb.authStore.clear();
      return this.toLogin('unverified');
    }
    document.documentElement.classList.add('auth-ok');
    // Signed out in another tab, or the token was cleared: leave the page.
    pb.authStore.onChange(() => { if (!this.isAllowed()) this.toLogin('signed-out'); });
  },
};

// Protected pages: hide the body until requireAuth() confirms the session.
if (document.documentElement.hasAttribute('data-auth-required')) {
  const style = document.createElement('style');
  style.textContent = 'html[data-auth-required]:not(.auth-ok) body { visibility: hidden; }';
  document.head.appendChild(style);
  Auth.requireAuth();
}
