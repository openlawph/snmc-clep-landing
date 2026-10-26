# snmc-clep-landing

Website for the **Sto. Niño Mactan College – School of Law Legal Clinic** (snmclaw.com).
It's plain static HTML with no build step and no server-side code: upload the files as they are.

## Stack

| What | How | Why |
|---|---|---|
| Styling | [Tailwind CSS v4](https://tailwindcss.com) browser build 4.3.3 via CDN | Utility classes directly in the HTML |
| Interactivity | [Alpine.js](https://alpinejs.dev) 3.17.5 via CDN | Mobile menu and the booking wizard |
| Database / sign-in | [PocketBase JS SDK](https://github.com/pocketbase/js-sdk) 0.28.1 via CDN (UMD build, global `PocketBase`) | Staff sign-in and data at https://capi.snmclaw.com (staff pages only; the booking form just reads its public settings with `fetch`) |
| Languages | `assets/js/i18n.js` (no library) | Booking form in EN (English) or VS (Visayan / Bisaya) |
| Components | Native **Web Components** (`customElements.define`) in `assets/js/components/` | Shared header/footer/etc. with no framework, no build, and no `fetch` (works on any static host, even when opened as a local file) |
| Fonts | Google Fonts: DM Serif Display (headings), Public Sans (body) | |

## Structure

```
index.html          Book a Visit (6-step intake wizard): the main page for now
book.html           Redirects to index.html so old links keep working
404.html            "Page not found" (GitHub Pages shows it for any address that doesn't exist)
home.html           Former home page (not linked in the nav for now)
about.html          About Us (not linked in the nav for now)
services.html       Our Services (not linked in the nav for now)
team.html           Our Team (not linked in the nav for now)
donate.html         Donate (not linked in the nav for now)
clinic-dashboard.html  Staff dashboard: counts + upcoming appointments (sign-in required, not linked publicly)
clinic-appointments.html Staff: all appointments; open one to change status, assign LSP + supervising lawyer, edit, delete
clinic-users.html   Staff: list, add, edit and delete user accounts (sign-in required)
clinic-lawyers.html Staff: list, add, edit and delete lawyers (sign-in required)
clinic-practitioners.html Staff: list, add, edit and delete law student practitioners (LSP)
clinic-settings.html Staff: Intake Form Settings (open days, time slots, which questions the booking form asks)
clinic-site-settings.html Staff: Site Settings (maintenance mode)
login.html          Staff sign-in (PocketBase), not linked publicly
assets/
  js/theme.js       Colors, fonts and shared classes (.btn, .card, .field, .eyebrow…)
  js/components.js  SITE settings: phone, email, address, hours, NAV LINKS + scroll-reveal helper
  js/components/    One file per component (see below)
  js/intake.js      Logic for the booking wizard (Alpine component "intake") + the field list, weekdays and default settings
  js/i18n.js        EN / VS translation helpers (x-t, $t) for the booking form
  js/i18n-vs.js     Bisaya wording, keyed by the English text
  js/auth.js        PocketBase client (API URL) + sign-in helpers; guards pages marked data-auth-required
  js/login.js       Logic for the sign-in page (Alpine component "login")
  js/dashboard.js   Logic for the clinic dashboard (Alpine component "dashboard")
  js/appointments.js Logic for the Appointments page (Alpine component "appointments") + shared appointment helpers
  js/crud.js        Shared logic for staff list pages: server-side search/sort/paging, delete dialog, error messages
  js/users.js       Logic for the Users page (Alpine component "users")
  js/lawyers.js     Logic for the Lawyers page (Alpine component "lawyers")
  js/practitioners.js Logic for the Practitioners page (Alpine component "practitioners")
  js/settings.js    Logic for the Intake Form Settings page (Alpine component "intakeSettings")
  js/site-settings.js Logic for the Site Settings page (Alpine component "siteSettings")
  js/maintenance.js Public pages only: shows "We'll be back soon" while maintenance mode is on
  js/preloader.js   Every page: the logo preloader shown while the page gets ready (see "Preloader")
  img/              Images (currently placeholders; see below)
  img/snmc-legal-aid.svg           SNMC Legal Aid logo (brick): sidebar, sign-in page, favicon, SITE.logo
  img/snmc-legal-aid-animated.svg  Same logo drawing itself in (~3.5 s, plays once), used by the preloader
  img/favicon-32.png, img/apple-touch-icon.png  PNG copies of the logo for browsers that can't use an SVG icon (Safari, iPhone home screen)
  img/snmc-legal-aid-logo.png      Old low-res seal: no longer used by the site (kept for the Annex B branch)
```

### Preloader

`assets/js/preloader.js` loads in every page's shared head (right after `theme.js`, not deferred) and covers the page with the SNMC Legal Aid logo on a warm off-white backdrop until the page is ready: Alpine has started, Tailwind's styles and the fonts are in, and the maintenance check (public pages) or sign-in check (staff pages) is done. Then it fades out.

- **First page of a visit** (per browser tab): the animated logo draws itself once, then the page fades in. If the page still isn't ready, a thin gold bar shows under the logo.
- **Every page after that:** quick pages simply fade in; the still logo and bar only appear if loading takes more than about a third of a second, so moving around the staff pages doesn't replay the intro.
- Visitors who ask their device for **reduced motion** get the still logo without the drawing or the sliding bar.
- It never stays more than 10 seconds. Because it covers the page while Tailwind builds its styles, Tailwind loads `defer`red, so on a slow phone the logo appears right away instead of a blank screen.
- The timings are at the top of `preloader.js`, the backdrop and bar colors in its CSS. To use another color of the logo (maroon, wine), replace the two SVG files with the matching pair.

### Components

| Tag | Used for |
|---|---|
| `<site-header active="home">` | Sticky top nav + mobile menu. `active` = the `key` of the current page in `SITE.nav` |
| `<site-footer>` | Footer |
| `<page-intro eyebrow="…" title="…" logo><p>intro</p></page-intro>` | Dark title band at the top of inner pages (`logo` shows the SNMC Legal Aid seal beside the title) |
| `<legal-notice title="…" tone="dark"><p>…</p></legal-notice>` | Callout box for notices (defaults to the "no fees" notice) |
| `<contact-info>` / `<contact-info variant="inline">` | Phone, email, address, hours (from `SITE`) |
| `<dashboard-sidebar active="users">` | Staff pages only: sidebar menu, signed-in user, Sign out (open on mobile with `$dispatch('open-sidebar')`) |

Page-specific content (cards, lists, paragraphs) stays as plain HTML in each page, so edit it right there.

Add `data-reveal` to any element to fade it in on scroll (`data-reveal-delay="120"` to stagger).

## Common edits

- **Phone number, email, address, hours:** `assets/js/components.js` → `window.SITE` (the phone is still `[add clinic number]`).
- **Nav links:** `SITE.nav` in the same file. Only Book a Visit is linked for now; add the other pages back there to relink them in the header and footer.
- **Logo:** the SNMC Legal Aid seal is `assets/img/snmc-legal-aid.svg` (`SITE.logo`), used for the favicon, the staff sidebar and the sign-in page. It's designed for light backgrounds. The public header still shows the small scales icon (`SITE.logoSvg`); to show the seal on the booking page, add `logo` to its `<page-intro>`. If the logo changes, re-export `favicon-32.png` (32 × 32, transparent) and `apple-touch-icon.png` (180 × 180, on `#fbf9f4`) from the new SVG too.
- **Colors / fonts:** the `@theme` block in `assets/js/theme.js`. For example, `--color-copper` becomes the `bg-copper` / `text-copper` classes.
- **Add a page:** copy an existing page (e.g. `about.html`), keep the `<head>` "Shared head" block as it is, set `<site-header active="…">`, and add the page to `SITE.nav`.
- **Images:** the files in `assets/img/` are labelled placeholders. Export the real photos from the Canva design and save them over these files with the same names:
  `hero.jpg`, `step-book.jpg`, `step-intake.jpg`, `step-plan.jpg`, `law-books.jpg`, `gavel.jpg`, `supervising-bg.jpg`, `team-basalo.jpg`, `team-sugod.jpg`, `team-carlo.jpg`, `team-sunset.jpg`.

## Booking form

`index.html` is the online version of the **Unified Client Intake Form (SNMC-CIF-001)**, split into 6 steps:

| Step | Form sections |
|---|---|
| 1. Book a slot | Appointment date (calendar of open days) and time slot, set in Intake Settings |
| 2. Personal information | B: applicant personal information |
| 3. Household & sector | C: household composition & financial eligibility · D: sector classification |
| 4. Legal issue | F: practice area, requested assistance, opposing party · E: conflict check & prior consultation |
| 5. Case facts | G: narrative & case facts · K: documents checklist + file picker (only file names are sent for now) |
| 6. Consent & declaration | Review of all answers · H: data privacy consent · I: declaration + typed signature |

Sections **A** (administrative) and **J** (staff assessment) are for clinic staff, so they are not on the public form.
Checkbox and radio choices are in `INTAKE_OPTIONS` at the top of `assets/js/intake.js` (add the Bisaya wording to `assets/js/i18n-vs.js` too). `toPayload()` there groups the answers by form section (`B_personal`, `C_household`, …).

The form checks each step (required questions, mobile/email format), then `sendRequest()` in `assets/js/intake.js` saves it as a record in the PocketBase `appointments` collection: a reference (e.g. SNMC-2026-4K7Q2D), a title (name + concern), mobile, email, the chosen date and time (`scheduled_at`, Manila time) and every answer in `json`. The client sees the reference on the "Request received" screen; staff see the booking on the Appointments page as **Pending**. If it can't be sent, the client gets a message and their answers stay on screen. Uploaded files aren't sent yet (only their names are). See "Spam protection" for the security check before Submit.

## Preview locally

Any static server works, e.g.:

```bash
python -m http.server 8080
```

Then open http://localhost:8080. Opening `index.html` straight from disk also works (the map embed and fonts need internet).

## Going to production (optional)

The Tailwind CDN build compiles CSS in the browser, which is fine for a site this size. For faster first paint, use the [Tailwind standalone CLI](https://tailwindcss.com/blog/standalone-cli) (a single executable, no Node) to generate a static CSS file once. To do that, move the CSS from `theme.js` into an `input.css` (after `@import "tailwindcss";`), build it, then swap the `theme.js` + CDN `<script>` tags for a `<link rel="stylesheet">`. The page markup doesn't change.

## Clinic dashboard

Staff pages are named `clinic-*.html` and share `<dashboard-sidebar active="…">` (`assets/js/components/dashboard-sidebar.js`). Its menu is `DASHBOARD_NAV` in that file; items with `href: null` show as "Soon". Only load that component on staff pages, never on public ones (it names them).

`clinic-dashboard.html` shows counts (next 7 days, upcoming, pending, needing an LSP or lawyer) and the upcoming appointments; clicking one opens it on the Appointments page.

### Appointments

`clinic-appointments.html` lists every booking (online and walk-in) from the `appointments_overview` view: search, filters (upcoming / past / no date, status, LSP, supervising lawyer), sorting and paging run on the server. Opening one (or linking to `clinic-appointments.html#<id>`) shows:

- **Status & assignment:** pick the status, the LSP and the supervising lawyer, add remarks, **Save update**. Each save adds an `appointments_status` row with your name, so the history shows who changed what and when.
- **History:** every update, newest first.
- **Booking details:** reference, date and time, mobile, email; **Edit** changes them (the client isn't notified).
- **Form answers:** everything the client entered online, by form section.
- **Delete** (admins only) removes the booking and its history. To keep a record, set the status to **Cancelled** instead.

**New appointment** adds a walk-in or phone booking (name, concern, contact, date and time, and optionally the status, LSP and lawyer).
## Sign-in and the dashboard

- `login.html` signs staff in with email + password against the PocketBase `users` collection. It also handles "forgot password" and re-sending the verification email (both links in those emails open PocketBase's own confirmation pages). There is no sign-up: create staff accounts in the PocketBase admin at https://capi.snmclaw.com/_/.
- Every `clinic-*.html` page has `data-auth-required` on its `<html>` tag. `assets/js/auth.js` keeps the page hidden, confirms the saved session with the server (`authRefresh`), and sends anyone who isn't signed in, or whose email isn't verified, to `login.html` (then back again after signing in). Add the same attribute and the two `<script>` tags (PocketBase SDK + `auth.js`) to protect another page.
- The session is kept in the browser's localStorage (`pocketbase_auth`) by the SDK. Sign out clears it.

**Important:** the check in `auth.js` only hides the page. Anyone can still download the HTML, and the real protection for clinic data is PocketBase's **API rules**. In the PocketBase admin:

- On every collection the dashboard reads (appointments, clients…), set the List/View rules to `@request.auth.id != "" && @request.auth.verified = true` (or tighter).
- On the `users` collection, set the **Auth rule** to `verified = true` so unverified accounts can't get a token at all.

## Users page: PocketBase setup

`clinic-users.html` reads and writes the PocketBase `users` collection directly (paging, search and sorting run on the server). It needs a **role** on each user and API rules that let admins manage everyone. Until those are set, everyone (you included) only sees their own account there.

1. **Add a role field.** PocketBase admin → Collections → `users` → New field → **Select**, name `role`, single choice, values `admin` and `staff`. (To add more roles later, add them here and to `USER_ROLES` in `assets/js/users.js`.)
2. **Make yourself an admin.** Open your own record in `users`, set `role` to `admin` and tick **verified**.
3. **Set the API rules** (`users` → API Rules). Copy each one exactly:

| Rule | Value |
|---|---|
| List/Search | `@request.auth.verified = true && (id = @request.auth.id \|\| @request.auth.role = "admin")` |
| View | `@request.auth.verified = true && (id = @request.auth.id \|\| @request.auth.role = "admin")` |
| Create | `@request.auth.verified = true && @request.auth.role = "admin"` |
| Update | `@request.auth.verified = true && (@request.auth.role = "admin" \|\| (id = @request.auth.id && @request.body.role:isset = false && @request.body.verified:isset = false && @request.body.email:isset = false))` |
| Delete | `@request.auth.verified = true && @request.auth.role = "admin" && id != @request.auth.id` |
| Manage (under Options) | `@request.auth.verified = true && @request.auth.role = "admin"` |
| Auth rule (under Options) | `verified = true` |

(In the table, `\|\|` is just `||`; type two plain pipe characters in PocketBase.)

What that gives you: admins see every user and can add, edit (including email, password, role and verified, without the old password) and delete anyone except themselves. Everyone else sees only their own account and can change their name, photo and password (with their current password), but not their role, email or verified status.

### Lost the PocketBase admin password?

The admin login at https://capi.snmclaw.com/_/ is a PocketBase **superuser**, separate from the dashboard users.

- **Email reset:** on that login page, click **Forgotten password?**. This only works if PocketBase's mail settings (SMTP) were set up.
- **On the server (always works):** PocketBase runs on your own server behind Cloudflare. Sign in to that machine and, in the folder with the `pocketbase` program, run:

  ```bash
  ./pocketbase superuser upsert you@example.com 'a-new-strong-password'
  ```

  This creates the superuser or resets its password. If PocketBase runs in Docker, run the same command inside the container, e.g. `docker exec -it <container> /pb/pocketbase superuser upsert …` (the path depends on the image).

## Lawyers page

`clinic-lawyers.html` manages the PocketBase `lawyers` collection: first and last name, email, contact number, active and archived case counts, ULAS creditable hours and a status (active / occupied / inactive). Search covers names, email and number; you can filter by status and sort by name, cases, hours or status. Verified staff can view the list; only admins can add, edit or delete (the collection's API rules enforce this).

## Intake Form Settings

`clinic-settings.html` (sidebar → Intake Settings) controls the public booking form. It saves to the single record in the PocketBase `intake_settings` collection, which anyone can read (the booking form needs it) and only admins can change.

- **Consultation days:** any of Monday to Saturday. The booking calendar only lets clients pick these days, from today up to 90 days ahead (`INTAKE_BOOKING_DAYS_AHEAD` in `intake.js`).
- **Time slots:** any times from 7:00 AM to 7:00 PM in 30-minute steps. On today's date, slots that have already started aren't offered.
- **Questions:** each one has three controls.
  - **Ask:** show it or not. If every question in a step is off, the form skips that step.
  - **Required:** clients can't continue without answering it (marked with a red * on the form). Questions that always have an answer (a pre-selected Yes/No) can't be required; for questions with a follow-up, "required" means the follow-up must be filled in when they answer Yes.
  - **Always ask (lock):** the question stays on and neither switch can be changed until someone unlocks it, which asks for confirmation. Use it for whatever the group has agreed on.

  Date, time, data privacy consent and the declaration are always asked and required. The list is `INTAKE_FIELDS` in `assets/js/intake.js`; each key matches an `x-field="…"` in `index.html`, which shows/hides the question, adds the * and shows its error.
- **Stored as:** `hidden_fields`, `required_fields` and `locked_fields` (lists of question keys) on the `intake_settings` record.

If the settings can't be loaded, the form falls back to `INTAKE_DEFAULT_SETTINGS` (Tuesdays and Thursdays, 1:00–4:00 PM, every question shown; name, contact number and the facts of the case required and always asked).

## Languages (EN / VS)

The first page of the booking form has a **Language / Pinulongan** menu: EN (English) or VS (Visayan / Bisaya). The choice is remembered in that browser. The header and footer stay in English.

- Text on the page uses `x-t` (translate the element's English text), `x-t:placeholder` (an attribute) or `$t('…')` in Alpine expressions. See the top of `assets/js/i18n.js`.
- The Bisaya wording is in `assets/js/i18n-vs.js`, keyed by the exact English text. Anything missing shows in English, so a changed English sentence needs its key updated there too.
- Answers are always saved in English, and the payload records which language the client used (`language`).
- **Please have a native Bisaya speaker on the team review `i18n-vs.js`**, especially the legal wording.

## Database (PocketBase)

All at https://capi.snmclaw.com. "Staff" = signed-in user with a verified email; "admin" = staff with `role = "admin"`.

| Collection | What it holds | Who can read / write |
|---|---|---|
| `users` | Staff accounts: name, email, photo, `role` (admin / staff) | Admins: everyone. Staff: only themselves (see "Users page") |
| `lawyers` | Supervising lawyers (SL): name, email, contact no., active / archived cases, ULAS hours, status | Staff read, admins write |
| `practitioners` | Law student practitioners (LSP): name, email, contact no., `level` (Level 1 / Level 2 under Rule 138-A), active / archived cases, status | Staff read, admins write |
| `appointments` | A booking: `reference`, `title`, `email`, `mobile_no` (digits only), `scheduled_at`, `json` (the full form) | Anyone can create (the booking form) **unless maintenance mode is on**; staff read, edit and always create; admins delete |
| `appointments_status` | History log, one row per change: `app_id` → appointment (deleted with it), `user_id` → who made the change, `app_status` (PENDING / SCHEDULED / WIP / DONE / CANCELLED), `remarks`, **`lsp_id` → practitioners**, **`sl_id` → lawyers** | Staff read and add rows (only in their own name); admins edit and delete |
| `appointments_overview` (view) | **Every** appointment with its latest status (PENDING if none), `lsp_id` / `lsp_name`, `sl_id` / `sl_name` | Staff read |
| `appointments_view` (view) | Each appointment's **latest** status row, with `lsp_id`, `sl_id`, `lsp_name`, `sl_name` | Staff read |
| `appointments_pending` (view) | Appointments with no status row yet | Staff read |
| `intake_settings` | One record: booking days, time slots, hidden / required / always-asked questions | Anyone reads, admins update |
| `site_settings` | One record: `maintenance` (on/off), `maintenance_message`, `maintenance_until` | Anyone reads, admins update |

**Assigning an LSP and a Supervising Lawyer:** add an `appointments_status` row for the appointment with `lsp_id` and `sl_id` set (along with the status). The newest row is the current assignment, so reassigning is just a new row, and the log keeps who changed it and when. When adding a row for any other reason (e.g. SCHEDULED → WIP), copy the current `lsp_id` / `sl_id` across so the assignment carries forward.

The Appointments page does this for you: **Save update** adds the row (with the current LSP and lawyer carried over), so nobody has to copy IDs by hand.

## Spam protection

Anyone can create an `appointments` record (that's how the public form books), so there are two layers against bots:

**1. Security check (Cloudflare Turnstile).** The booking form shows a check above Submit (usually one tick, sometimes nothing). It only appears once a site key is set, and only protects you once the server checks it too:

1. **Create the widget:** Cloudflare dashboard → **Turnstile** → **Add widget**. Name it e.g. "SNMC booking", add the hostname `clinic.snmclaw.com` (and `localhost` if you test locally), keep the mode **Managed**. Copy the **Site key** and the **Secret key**.
2. **Site key → website:** put the site key in `turnstileSiteKey` in `assets/js/components.js` and push. The check now shows on the form. (The site key is public; never put the secret key in this repo.)
3. **Secret key → PocketBase server:** copy `pocketbase/pb_hooks/turnstile.pb.js` into the `pb_hooks` folder next to PocketBase's `pb_data`, set the environment variable `TURNSTILE_SECRET` to the secret key (e.g. `Environment=TURNSTILE_SECRET=…` in the systemd service, or `-e TURNSTILE_SECRET=…` for Docker), and restart PocketBase. From then on, online bookings without a valid check are refused.

Do step 2 before step 3: once the secret is set, bookings without a token are refused. Until the secret is set, the hook lets bookings through and logs a warning. Signed-in staff adding walk-ins never need the check. To test locally, Cloudflare's test site key `1x00000000000000000000AA` always passes (it shows "For testing only").

**2. Booking limit per connection (PocketBase).** PocketBase admin → **Settings** → **Rate limits** → add a rule: label `appointments:create`, audience **Guest only**, max **10** requests per **600** seconds. That's at most 10 online bookings per 10 minutes from one internet address; staff aren't affected. (Mobile networks often put many phones behind one address, so don't go much lower.) Without this rule only PocketBase's general `*:create` limit applies: 20 per 5 seconds, which a bot can easily live with.

## Site Settings: maintenance mode

`clinic-site-settings.html` (sidebar → Site Settings). Admins can change it; other staff can only look.

- **Maintenance mode on:** every public page (anything that loads `assets/js/maintenance.js`) shows a "We'll be back soon / Mobalik mi dayon" page with the clinic's email, and PocketBase refuses new online bookings (the `appointments` create rule checks `site_settings.maintenance`). Staff pages and walk-in bookings keep working. Turning it on asks for confirmation.
- **Message** (optional): replaces the default English + Bisaya text. **Expected back** (optional): shown on the page in Manila time; it doesn't switch the site back on by itself.
- **Staff can still see the site:** anyone signed in to the dashboard in that browser sees the normal site with a yellow notice at the top. **Preview the maintenance page** (or add `?maintenance-preview` to a public page's address) shows the maintenance page anyway.
- If the setting can't be loaded within about 2 seconds (e.g. PocketBase is down), the public site is shown as normal.
- Adding a new public page: put `<script src="assets/js/maintenance.js"></script>` right after `theme.js` in its `<head>` (not deferred). Never add it to staff pages.

## Error pages

- **404:** GitHub Pages serves `404.html` for any address that doesn't exist, at that address (e.g. `/old/page.html`). It has `<base href="/">` so its styles and links work however deep the address is, says "We can't find that page" in English and Bisaya, and links to the booking page. It's a public page, so maintenance mode applies to it too.
- **No JavaScript:** the booking page shows a plain notice (English and Bisaya, with the clinic email) to anyone with JavaScript turned off, since the form can't work without it.
- **Other errors (500 and so on):** GitHub Pages only supports a custom 404; anything else (e.g. GitHub being down) shows GitHub's own page and can't be changed. Problems reaching PocketBase are handled on the pages themselves: the booking form shows a message and keeps the answers, the settings fall back to defaults, and staff pages send you to sign-in with an explanation.

## Security

- **Libraries are pinned.** Tailwind, Alpine and the PocketBase SDK load from jsDelivr at an exact version with an `integrity` hash, so a new release can't change the site without anyone noticing, and the browser refuses a file that doesn't match. To upgrade one, change the version in the `<script>` tag on **every** page and replace its hash with the new file's, e.g.:

  ```bash
  curl -s https://cdn.jsdelivr.net/npm/alpinejs@3.17.5/dist/cdn.min.js | openssl dgst -sha384 -binary | openssl base64 -A
  ```

  (prefix the result with `sha384-`). Use the file's full path (`dist/…`), not the short package URL: jsDelivr re-minifies short URLs, so their hash can change.
- **Content Security Policy.** Each page's shared head has a `Content-Security-Policy` meta tag: scripts only from this site, jsDelivr and Cloudflare Turnstile; data only to this site and `capi.snmclaw.com`. A new CDN library, font, image host or API won't load until its host is added there, on every page. (`'unsafe-eval'` is needed by Alpine; there are no inline `<script>`s, so keep it that way.)
- **Client data stays out of the HTML.** Pages show it with `x-text` / `textContent`, never as HTML; keep it that way (no `x-html` / `innerHTML` with anything from PocketBase or a visitor).
- **Staff pages** have `noindex` and aren't linked from public pages, but anyone can still open them; the PocketBase API rules ("Database") are what keep the data private.

## Beta launch checklist

Things only an admin can do (outside this repo), in rough order of importance:

1. **GitHub → Settings → Pages → tick "Enforce HTTPS".** Right now `http://clinic.snmclaw.com` loads without encryption, so on public Wi-Fi the page (and what's typed into it) could be read or changed.
2. **PocketBase superuser:** change the password (it was shared in a chat), and turn on **MFA** (`_superusers` collection → Options → Multi-factor authentication; it uses the email OTP, and mail is already set up).
3. **Lock the `testing` collection:** its Create rule is empty, which means *anyone on the internet* can add records to it. Nothing on the site uses it: set its rules to superusers only (lock icon) or delete it.
4. **Spam protection** (see above): the `appointments:create` rate limit, and the Turnstile keys + hook. Until both are done, the public booking form is protected only by PocketBase's general limits.
5. **Backups:** PocketBase admin → Settings → Backups → turn on automatic backups (e.g. cron `0 3 * * *`, keep 7). They're currently off, so a broken server or a bad delete means lost bookings. Store them on S3 if you can (S3 is already set up for files) so a dead server doesn't take the backups with it.
6. **Cloudflare:** make sure the PocketBase server only accepts connections from Cloudflare (firewall). PocketBase trusts the `CF-Connecting-IP` header for rate limits, so anyone who can reach the server directly could fake their address and get around the limits.
7. **Maintenance mode:** turn it **off** in Site Settings when the beta starts (it's on now).
8. **Content:** have a native Bisaya speaker review `assets/js/i18n-vs.js`; the attach-files box on step 5 tells clients that only file names are sent, so turn that question off in Intake Settings if you'd rather not show it until uploads work.
