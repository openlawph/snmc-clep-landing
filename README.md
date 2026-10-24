# snmc-clep-landing

Website for the **Sto. Niño Mactan College – School of Law Legal Clinic** (snmclaw.com).
It's plain static HTML with no build step and no server-side code: upload the files as they are.

## Stack

| What | How | Why |
|---|---|---|
| Styling | [Tailwind CSS v4](https://tailwindcss.com) browser build via CDN | Utility classes directly in the HTML |
| Interactivity | [Alpine.js 3](https://alpinejs.dev) via CDN | Mobile menu and the booking wizard |
| Components | Native **Web Components** (`customElements.define`) in `assets/js/components/` | Shared header/footer/etc. with no framework, no build, and no `fetch` (works on any static host, even when opened as a local file) |
| Fonts | Google Fonts: DM Serif Display (headings), Public Sans (body) | |

## Structure

```
index.html          Home
about.html          About Us
services.html       Our Services
team.html           Our Team
book.html           Book a Visit (4-step intake wizard)
donate.html         Donate
assets/
  js/theme.js       Colors, fonts and shared classes (.btn, .card, .field, .eyebrow…)
  js/components.js  SITE settings: phone, email, address, hours, NAV LINKS + scroll-reveal helper
  js/components/    One file per component (see below)
  js/intake.js      Logic for the booking wizard (Alpine component "intake")
  img/              Images (currently placeholders; see below)
```

### Components

| Tag | Used for |
|---|---|
| `<site-header active="home">` | Sticky top nav + mobile menu. `active` = the `key` of the current page in `SITE.nav` |
| `<site-footer>` | Footer |
| `<page-intro eyebrow="…" title="…"><p>intro</p></page-intro>` | Dark title band at the top of inner pages |
| `<legal-notice title="…" tone="dark"><p>…</p></legal-notice>` | Callout box for notices (defaults to the "no fees" notice) |
| `<contact-info>` / `<contact-info variant="inline">` | Phone, email, address, hours (from `SITE`) |

Page-specific content (cards, lists, paragraphs) stays as plain HTML in each page, so edit it right there.

Add `data-reveal` to any element to fade it in on scroll (`data-reveal-delay="120"` to stagger).

## Common edits

- **Phone number, email, address, hours:** `assets/js/components.js` → `window.SITE` (the phone is still `[add clinic number]`).
- **Nav links:** `SITE.nav` in the same file.
- **Colors / fonts:** the `@theme` block in `assets/js/theme.js`. For example, `--color-copper` becomes the `bg-copper` / `text-copper` classes.
- **Add a page:** copy an existing page (e.g. `about.html`), keep the `<head>` "Shared head" block as it is, set `<site-header active="…">`, and add the page to `SITE.nav`.
- **Images:** the files in `assets/img/` are labelled placeholders. Export the real photos from the Canva design and save them over these files with the same names:
  `hero.jpg`, `step-book.jpg`, `step-intake.jpg`, `step-plan.jpg`, `law-books.jpg`, `gavel.jpg`, `supervising-bg.jpg`, `team-basalo.jpg`, `team-sugod.jpg`, `team-carlo.jpg`, `team-sunset.jpg`.

## Booking form

`book.html` is the online version of the **Unified Client Intake Form (SNMC-CIF-001)**, split into 6 steps:

| Step | Form sections |
|---|---|
| 1. Book a slot | Appointment date/time (Tue & Thu only) |
| 2. Personal information | B: applicant personal information |
| 3. Household & sector | C: household composition & financial eligibility · D: sector classification |
| 4. Legal issue | F: practice area, requested assistance, opposing party · E: conflict check & prior consultation |
| 5. Case facts | G: narrative & case facts · K: documents checklist + optional uploads |
| 6. Consent & declaration | Review of all answers · H: data privacy consent · I: declaration + typed signature |

Sections **A** (administrative) and **J** (staff assessment) are for clinic staff, so they are not on the public form.
Checkbox and radio choices are in `INTAKE_OPTIONS` at the top of `assets/js/intake.js`. `toPayload()` there groups the answers by form section (`B_personal`, `C_household`, …).

The form validates each step, then shows a "Request received" screen with a reference number, but **it does not send the data anywhere yet**.
To connect it, implement `sendRequest()` in `assets/js/intake.js` (for example, POST to Formspree, a Google Apps Script, or a PHP endpoint if the host supports PHP).

## Preview locally

Any static server works, e.g.:

```bash
python -m http.server 8080
```

Then open http://localhost:8080. Opening `index.html` straight from disk also works (the map embed and fonts need internet).

## Going to production (optional)

The Tailwind CDN build compiles CSS in the browser, which is fine for a site this size. For faster first paint, use the [Tailwind standalone CLI](https://tailwindcss.com/blog/standalone-cli) (a single executable, no Node) to generate a static CSS file once. To do that, move the CSS from `theme.js` into an `input.css` (after `@import "tailwindcss";`), build it, then swap the `theme.js` + CDN `<script>` tags for a `<link rel="stylesheet">`. The page markup doesn't change.
