/*
 * Users page (clinic-users.html): list, create, edit and delete accounts in the PocketBase
 * `users` collection. Usage: <body x-data="users">. Needs auth.js and crud.js; load BEFORE Alpine.
 *
 * What each person may do is enforced by the collection's API rules in PocketBase, not here
 * (README → "Users page: PocketBase setup"). This page only hides actions that would fail:
 *  - admins (role = "admin") see every user and can add, edit (email, password, verified,
 *    role) and delete them;
 *  - everyone else sees only their own account and can change their name, photo and password.
 */

const USER_ROLES = [
  { value: 'admin', label: 'Admin' },
  { value: 'staff', label: 'Staff' },
];

// Must match the avatar field's settings in PocketBase.
const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/svg+xml', 'image/gif', 'image/webp'];
const AVATAR_MAX_BYTES = 5 * 1024 * 1024; // PocketBase's default when "Max file size" is empty

const emptyUserForm = () => ({
  name: '', email: '', role: 'staff', verified: false,
  confirmEmail: 'send', // new users: 'send' a verification email, or mark 'verified' now
  password: '', passwordConfirm: '', oldPassword: '',
  avatar: null, removeAvatar: false,
});

document.addEventListener('alpine:init', () => {
  Alpine.data('users', () => crudPage({
    collection: 'users',
    singular: 'user',
    plural: 'users',
    searchFields: ['name', 'email'],
    filters: { verifiedFilter: '', roleFilter: '' }, // verifiedFilter: '' | 'yes' | 'no'
    sortKey: 'created',
    sortDir: 'desc',
  }, {
    roles: USER_ROLES,
    me: Auth.user,
    columns: [
      { key: 'name', label: 'User', sortable: true },
      { key: 'role', label: 'Role', sortable: false },
      { key: 'verified', label: 'Email', sortable: true },
      { key: 'created', label: 'Added', sortable: true },
    ],

    // Add / edit dialog
    editing: null, // the record being edited, or null when adding
    form: emptyUserForm(),
    formErrors: {},
    formError: '',
    saving: false,
    avatarPreview: '',

    init() {
      pb.authStore.onChange(() => (this.me = pb.authStore.record));
    },

    get isAdmin() {
      return this.me?.role === 'admin';
    },

    isSelf(user) {
      return user?.id === this.me?.id;
    },

    extraFilters() {
      const parts = [];
      if (this.verifiedFilter) parts.push(pb.filter('verified = {:v}', { v: this.verifiedFilter === 'yes' }));
      if (this.roleFilter) parts.push(pb.filter('role = {:r}', { r: this.roleFilter }));
      return parts;
    },

    // ---------- Display helpers ----------

    avatarURL(user) {
      return user?.avatar ? pb.files.getURL(user, user.avatar) : '';
    },

    initial(user) {
      return (user?.name || user?.email || '?').charAt(0).toUpperCase();
    },

    roleLabel(value) {
      return this.roles.find((r) => r.value === value)?.label || 'Staff';
    },

    // ---------- Add / edit ----------

    openCreate() {
      this.editing = null;
      this.resetForm(emptyUserForm());
      this.$refs.formDialog.showModal();
    },

    openEdit(user) {
      this.editing = user;
      this.resetForm({ ...emptyUserForm(), name: user.name || '', email: user.email || '', role: user.role || 'staff', verified: !!user.verified });
      this.avatarPreview = this.avatarURL(user);
      this.$refs.formDialog.showModal();
    },

    resetForm(form) {
      this.form = form;
      this.formErrors = {};
      this.formError = '';
      this.avatarPreview = '';
      if (this.$refs.avatarInput) this.$refs.avatarInput.value = '';
    },

    closeForm() {
      this.$refs.formDialog.close();
    },

    // Admins can change any account's email/verified/password without the old password
    // ("Manage" access); people editing their own account without it can't change their email.
    get canEditEmail() {
      return this.isAdmin;
    },

    get needsOldPassword() {
      return !!this.editing && this.isSelf(this.editing) && !this.isAdmin && !!this.form.password;
    },

    pickAvatar(event) {
      const file = event.target.files[0];
      if (!file) return;
      delete this.formErrors.avatar;
      if (!AVATAR_TYPES.includes(file.type)) {
        this.formErrors.avatar = 'Use a JPG, PNG, GIF, WebP or SVG image.';
      } else if (file.size > AVATAR_MAX_BYTES) {
        this.formErrors.avatar = 'The photo must be 5 MB or smaller.';
      } else {
        this.form.avatar = file;
        this.form.removeAvatar = false;
        this.avatarPreview = URL.createObjectURL(file);
        return;
      }
      event.target.value = '';
    },

    clearAvatar() {
      this.form.avatar = null;
      this.form.removeAvatar = !!this.editing?.avatar;
      this.avatarPreview = '';
      this.$refs.avatarInput.value = '';
    },

    validate() {
      const f = this.form;
      const e = {};
      if (!this.editing || this.canEditEmail) {
        if (!f.email.trim()) e.email = 'Enter an email address.';
        else if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e.email = 'Enter a valid email address.';
      }
      if (!this.editing || f.password) {
        if (f.password.length < 8) e.password = 'Use at least 8 characters.';
        if (f.password !== f.passwordConfirm) e.passwordConfirm = 'The passwords don\'t match.';
      }
      if (this.needsOldPassword && !f.oldPassword) e.oldPassword = 'Enter your current password.';
      if (this.formErrors.avatar) e.avatar = this.formErrors.avatar;
      this.formErrors = e;
      return !Object.keys(e).length;
    },

    // The request body: only fields this person is allowed to change.
    payload() {
      const f = this.form;
      const self = this.editing && this.isSelf(this.editing);
      const data = { name: f.name.trim() };

      if (!this.editing) {
        Object.assign(data, {
          email: f.email.trim(),
          emailVisibility: false,
          password: f.password,
          passwordConfirm: f.passwordConfirm,
          role: f.role,
          verified: f.confirmEmail === 'verified',
        });
      } else {
        if (this.canEditEmail && f.email.trim() !== this.editing.email) data.email = f.email.trim();
        if (this.isAdmin && !self) Object.assign(data, { role: f.role, verified: f.verified });
        if (f.password) {
          Object.assign(data, { password: f.password, passwordConfirm: f.passwordConfirm });
          if (this.needsOldPassword) data.oldPassword = f.oldPassword;
        }
      }

      if (f.avatar) data.avatar = f.avatar; // the SDK switches to a file upload automatically
      else if (f.removeAvatar) data.avatar = null;
      return data;
    },

    async save() {
      if (!this.validate()) return;
      this.saving = true;
      this.formError = '';
      const users = pb.collection('users');
      const f = this.form;
      try {
        if (!this.editing) {
          const record = await users.create(this.payload());
          let note = '';
          if (f.confirmEmail === 'send') {
            try {
              await users.requestVerification(record.email);
              note = ' We emailed them a verification link.';
            } catch {
              note = ' The verification email couldn\'t be sent; use "Send link" in the list to try again.';
            }
          }
          this.flash(`${this.displayName(record)} was added.${note}`);
        } else {
          const self = this.isSelf(this.editing);
          const record = await users.update(this.editing.id, this.payload());
          // A new password signs out every session, this one included: sign back in with it.
          if (self && f.password) {
            try {
              await users.authWithPassword(record.email, f.password);
            } catch {
              return Auth.signOut();
            }
          }
          this.flash(`Changes to ${this.displayName(record)} were saved.`);
        }
        this.closeForm();
        this.load();
      } catch (err) {
        this.formErrors = this.fieldErrorsFrom(err);
        this.formError = Object.keys(this.formErrors).length ? 'Please fix the highlighted fields.' : this.messageFor(err, 'save');
      } finally {
        this.saving = false;
      }
    },

    // ---------- Verification email ----------

    async sendVerification(user) {
      try {
        await pb.collection('users').requestVerification(user.email);
        this.flash(`Sent a verification link to ${user.email}.`);
      } catch (err) {
        this.flash(this.messageFor(err, 'send'));
      }
    },
  }));
});
