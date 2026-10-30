/*
 * Staff sign-in page (login.html).
 * Usage: <div x-data="login">. Needs assets/js/auth.js; must load BEFORE Alpine.
 *
 * Views: sign in · forgot password · email not verified · "check your inbox".
 * There is no sign-up: staff accounts are created in the PocketBase admin (capi.snmclaw.com/_/).
 * The verification and password-reset emails link to PocketBase's own confirmation pages.
 */

const LOGIN_NOTICES = {
  'signed-out': 'You\'ve been signed out.',
  idle: 'You were signed out after an hour with no activity. Please sign in again.',
  expired: 'Your session has ended. Please sign in again.',
  unverified: 'Your email address hasn\'t been verified yet.',
  offline: 'Couldn\'t reach the server to check your session. Please sign in again.',
};

document.addEventListener('alpine:init', () => {
  Alpine.data('login', () => {
    const params = new URLSearchParams(location.search);
    return {
      view: 'signin', // signin | forgot | unverified | sent
      email: '',
      password: '',
      showPassword: false,
      busy: false,
      error: '',
      sentMessage: '',
      notice: LOGIN_NOTICES[params.get('reason')] || '',
      next: Auth.safeNext(params.get('next')),

      init() {
        // Already signed in: go straight on (the protected page re-checks with the server).
        if (Auth.isAllowed()) location.replace(this.next);
      },

      show(view) {
        this.view = view;
        this.error = '';
        this.notice = '';
        // Focus the first field of the view that's now showing.
        // (x-show reveals elements on the next animation frame, so wait for it too)
        this.$nextTick(() => requestAnimationFrame(() => [...this.$root.querySelectorAll('[data-autofocus]')].find((el) => el.offsetParent)?.focus()));
      },

      async run(task) {
        this.busy = true;
        this.error = '';
        try {
          await task();
        } catch (err) {
          if (err.unverified) return this.show('unverified');
          this.error = Auth.errorMessage(err);
        } finally {
          this.busy = false;
        }
      },

      signIn() {
        if (!this.email || !this.password) return (this.error = 'Enter your email and password.');
        return this.run(async () => {
          await Auth.signIn(this.email.trim(), this.password);
          location.replace(this.next);
        });
      },

      // PocketBase answers the same way whether or not the email exists, so we do too.
      resetPassword() {
        if (!this.email) return (this.error = 'Enter your email address.');
        return this.run(async () => {
          await pb.collection('users').requestPasswordReset(this.email.trim());
          this.sentMessage = 'If an account uses that email, we\'ve sent a link to reset the password.';
          this.show('sent');
        });
      },

      resendVerification() {
        return this.run(async () => {
          await pb.collection('users').requestVerification(this.email.trim());
          this.sentMessage = 'We\'ve sent a new verification link. Open it, then come back and sign in.';
          this.show('sent');
        });
      },
    };
  });
});
