# snmc-clep-landing

Website for the **Sto. Niño Mactan College – School of Law Legal Clinic** (snmclaw.com).
It's plain static HTML with no build step and no server-side code: upload the files as they are.

## Stack

| What | How | Why |
|---|---|---|
| Styling | [Tailwind CSS v4](https://tailwindcss.com) browser build via CDN | Utility classes directly in the HTML |
| Interactivity | [Alpine.js 3](https://alpinejs.dev) via CDN | Mobile menu and the booking wizard |
| Database / sign-in | [PocketBase JS SDK](https://github.com/pocketbase/js-sdk) 0.28.1 via CDN (UMD build, global `PocketBase`) | Staff sign-in and data at https://capi.snmclaw.com (staff pages only; the booking form just reads its public settings with `fetch`) |
| Languages | `assets/js/i18n.js` (no library) | Booking form in EN (English) or VS (Visayan / Bisaya) |
| Components | Native **Web Components** (`customElements.define`) in `assets/js/components/` | Shared header/footer/etc. with no framework, no build, and no `fetch` (works on any static host, even when opened as a local file) |
| Fonts | Google Fonts: DM Serif Display (headings), Public Sans (body) | |

## Structure

```
index.html          Book a Visit (6-step intake wizard): the main page for now
book.html           Redirects to index.html so old links keep working
home.html           Former home page (not linked in the nav for now)
about.html          About Us (not linked in the nav for now)
services.html       Our Services (not linked in the nav for now)
team.html           Our Team (not linked in the nav for now)
donate.html         Donate (not linked in the nav for now)
clinic-dashboard.html  Staff dashboard: upcoming-appointments data table (sign-in required, not linked publicly)
clinic-users.html   Staff: list, add, edit and delete user accounts (sign-in required)
clinic-lawyers.html Staff: list, add, edit and delete lawyers (sign-in required)
clinic-settings.html Staff: Intake Form Settings (open days, time slots, which questions the booking form asks)
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
  js/dashboard.js   Logic for the clinic dashboard (Alpine component "dashboard"): sample data, table search/sort/paging
  js/crud.js        Shared logic for staff list pages: server-side search/sort/paging, delete dialog, error messages
  js/users.js       Logic for the Users page (Alpine component "users")
  js/lawyers.js     Logic for the Lawyers page (Alpine component "lawyers")
  js/settings.js    Logic for the Intake Form Settings page (Alpine component "intakeSettings")
  img/              Images (currently placeholders; see below) + snmc-legal-aid-logo.png
```

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
- **Logo:** the SNMC Legal Aid seal (`assets/img/snmc-legal-aid-logo.png`, `SITE.logo`) is **off the public pages for now** until there's a high-res SVG; the header shows the small scales icon (`SITE.logoSvg`) instead. The seal is still the favicon and appears on the staff pages. To put it back on the booking page, add `logo` to its `<page-intro>`; for the header/footer, see git history.
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
| 5. Case facts | G: narrative & case facts · K: documents checklist + optional uploads |
| 6. Consent & declaration | Review of all answers · H: data privacy consent · I: declaration + typed signature |

Sections **A** (administrative) and **J** (staff assessment) are for clinic staff, so they are not on the public form.
Checkbox and radio choices are in `INTAKE_OPTIONS` at the top of `assets/js/intake.js` (add the Bisaya wording to `assets/js/i18n-vs.js` too). `toPayload()` there groups the answers by form section (`B_personal`, `C_household`, …).

The form checks each step (required questions, mobile/email format), then shows a "Request received" screen with a reference number, but **it does not send the data anywhere yet**.
To connect it, implement `sendRequest()` in `assets/js/intake.js` (for example, POST to Formspree, a Google Apps Script, or a PHP endpoint if the host supports PHP).

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

`clinic-dashboard.html` has summary cards plus an **upcoming appointments** data table with search, status/lawyer filters, sortable columns and pagination, all in Alpine (no extra library).

The appointments are **sample data** generated in `sampleAppointments()` in `assets/js/dashboard.js`. Swap that for the real bookings once the intake form saves them somewhere. 
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
| `appointments` | A booking: `title`, `email`, `mobile_no`, `json` (the full form) | Anyone can create; staff read |
| `appointments_status` | History log, one row per change: `app_id` → appointment, `user_id` → who made the change, `app_status` (PENDING / SCHEDULED / WIP / DONE), `remarks`, **`lsp_id` → practitioners**, **`sl_id` → lawyers** | Superuser only for now |
| `appointments_view` (view) | Each appointment's **latest** status row, with `lsp_id`, `sl_id`, `lsp_name`, `sl_name` | Superuser only for now |
| `appointments_pending` (view) | Appointments with no status row yet | Superuser only for now |
| `intake_settings` | One record: booking days, time slots, hidden / required / always-asked questions | Anyone reads, admins update |

**Assigning an LSP and a Supervising Lawyer:** add an `appointments_status` row for the appointment with `lsp_id` and `sl_id` set (along with the status). The newest row is the current assignment, so reassigning is just a new row, and the log keeps who changed it and when. When adding a row for any other reason (e.g. SCHEDULED → WIP), copy the current `lsp_id` / `sl_id` across so the assignment carries forward.

Before staff can do this from the dashboard, `appointments_status` and the two views need API rules (they're superuser-only today), e.g. List/View `@request.auth.verified = true`, Create `@request.auth.verified = true && @request.body.user_id = @request.auth.id`.
