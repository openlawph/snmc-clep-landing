// Single-line "Invite a user" form for clinic-users.html (staff can add non-admin users).
(() => {
  const API = 'https://capi.snmclaw.com';
  // Shares the signed-in session with the rest of the site (same localStorage key).
  const pb = new PocketBase(API);

  // Admin is deliberately NOT listed here. PocketBase's Create rule also refuses it.
  const ROLES = [
    { value: 'staff', label: 'Staff' },
    { value: 'student', label: 'Student' },
    { value: 'lawyer', label: 'Lawyer' },
    { value: 'client', label: 'Client' },
    { value: 'tester', label: 'Tester' },
  ];

  const randomPassword = () => {
    const chars = 'abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const a = new Uint8Array(24);
    crypto.getRandomValues(a);
    return Array.from(a, (b) => chars[b % chars.length]).join('');
  };

  const firstError = (e) => {
    const data = e?.response?.data || {};
    const key = Object.keys(data)[0];
    if (key) return `${key}: ${data[key].message}`;
    if (e?.status === 403 || e?.status === 400) return 'Not allowed, or the email is already used.';
    return 'Could not add the user. Please try again.';
  };

  document.addEventListener('alpine:init', () => {
    Alpine.data('inviteUser', () => ({
      roles: ROLES,
      f: { name: '', email: '', role: ROLES[0].value },
      busy: false,
      msg: '',
      isError: false,

      say(text, error = false) { this.msg = text; this.isError = error; },

      async submit() {
        const name = this.f.name.trim();
        const email = this.f.email.trim().toLowerCase();
        const role = this.f.role;
        const me = pb.authStore.record;

        if (!me) return this.say('Please sign in again.', true);
        if (!name) return this.say('Enter a name.', true);
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return this.say('Enter a valid email.', true);
        if (role === 'admin' || !ROLES.some((r) => r.value === role)) return this.say('Choose a role.', true);

        this.busy = true;
        this.say('');
        try {
          const password = randomPassword();
          await pb.collection('users').create({
            name,
            email,
            role,
            password,
            passwordConfirm: password,
            invited_by: me.id,
          });
        } catch (e) {
          this.busy = false;
          return this.say(firstError(e), true);
        }

        // The new user sets their own password from this email (it also verifies their email).
        try {
          await pb.collection('users').requestPasswordReset(email);
          this.say(`Added ${name}. A link to set their password was sent to ${email}.`);
        } catch (e) {
          this.say(`Added ${name}, but the email could not be sent. Ask an admin to resend it.`, true);
        }

        this.f = { name: '', email: '', role: ROLES[0].value };
        this.busy = false;
        // Refresh the table below (the "users" component on <body>).
        try { Alpine.$data(document.body).load?.(); } catch (_) {}
      },
    }));
  });
})();
