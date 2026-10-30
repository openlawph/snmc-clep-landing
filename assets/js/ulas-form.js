/*
 * ULAS Qualified Beneficiary Declaration (clinic-ulas-form.html#<appointment id>).
 * Usage: <body x-data="ulasForm">. Needs auth.js, appointments.js (formatSchedule, manilaParts, personName),
 * pdf-lib (global PDFLib) and the blank form assets/forms/ulas-annex-b.pdf; load BEFORE Alpine.
 *
 * The form is the Supreme Court's Annex "B" (declaration) with Annex "B-1" and "B-2" (covered lawyer's
 * certifications), kept exactly as issued: it is a scan, so we only stamp the answers on top of it and never
 * change the legal text. assets/forms/ulas-annex-b.pdf is that scan shrunk to ~150 KB (see tools/optimize-annex-b.py).
 *
 * The form is prefilled from the appointment (the client's intake answers, the assigned lawyer, the date);
 * staff review and fix anything in the page, then press "Create PDF". Signatures, the notary's jurat and the
 * lawyers' roll numbers are left blank on purpose: those are written by hand.
 */

const ULAS_FORM_URL = 'assets/forms/ulas-annex-b.pdf';
const ULAS_PAGE_HEIGHT = 934.56; // pt; layout y values below are measured from the TOP of the page

// Where each answer goes. Single line: { page, x, y (text baseline), w (max width) }.
// Area (wrapped over several lines): { page, x, y (first baseline), w, h (height available) }.
// Check boxes: { page, x, y } = the middle of the box.
const ULAS_LAYOUT = {
  city:        { page: 0, x: 99,  y: 122.5, w: 108 },
  declarant:   { page: 0, x: 154, y: 202.5, w: 88 },
  residence:   { page: 0, x: 99,  y: 217.5, w: 144 },
  declarantFil:{ page: 0, x: 174, y: 266.5, w: 90 },
  residenceFil:{ page: 0, x: 99,  y: 282.5, w: 102 },
  fullName:    { page: 0, x: 252, y: 338,   w: 274 },
  contact:     { page: 0, x: 252, y: 370,   w: 274 },
  income:      { page: 0, x: 252, y: 399,   w: 274, h: 44 },
  employer:    { page: 0, x: 252, y: 462,   w: 274, h: 60 },
  position:    { page: 0, x: 252, y: 542,   w: 274, h: 60 },
  familyIncome:{ page: 0, x: 252, y: 626,   w: 274, h: 60 },
  legalAid:    { page: 1, x: 143, y: 91,    w: 396, h: 66 },
  explanation: { page: 1, x: 143, y: 776,   w: 396, h: 76, next: { page: 2, x: 128, y: 91, w: 398, h: 125 } },
  documents:   { page: 2, x: 128, y: 286,   w: 398, h: 108 },
  executedOn:  { page: 2, x: 256, y: 468,   w: 270 },
  signedName:  { page: 2, x: 256, y: 550,   w: 270 },
  // Annex B-1
  b1Lawyer:    { page: 3, x: 162, y: 164.5, w: 170 },
  b1Date:      { page: 3, x: 436, y: 180.5, w: 88 },
  b1Applicant: { page: 3, x: 184, y: 196.5, w: 170 },
  // Annex B-2
  b2Applicant: { page: 4, x: 172, y: 217.5, w: 175 },
  b2Declared:  { page: 4, x: 449, y: 198.5,   w: 76 },
  b2CertDate:  { page: 4, x: 248, y: 248.5, w: 114 },
  b2Atty:      { page: 4, x: 100, y: 265,   w: 172 },
};

// Boxes of item 3, in order. Positions are the box centres.
const ULAS_GROUND_BOXES = [
  { page: 1, x: 150, y: 266 },
  { page: 1, x: 150, y: 363 },
  { page: 1, x: 150, y: 492 },
  { page: 1, x: 150, y: 591 },
];

// Standard PDF fonts only cover Western characters; anything else would stop the PDF from being made.
const ulasSafe = (text) => String(text ?? '').replace(/\s*\n\s*/g, ' ').replace(/[^\x20-\x7E -ÿ‘’“”–—•]/g, '?').trim();

async function ulasFillPdf(PDFLib, blankBytes, v) {
  const { PDFDocument, StandardFonts, rgb } = PDFLib;
  const pdf = await PDFDocument.load(blankBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const ink = rgb(0.04, 0.1, 0.35); // dark blue, so what was typed reads apart from the printed form
  const pages = pdf.getPages();
  const flip = (y) => ULAS_PAGE_HEIGHT - y;

  // One line on a blank of the form: shrinks to fit; if it would be too small to read, `short` is used instead.
  const line = (key, text, short = '') => {
    const at = ULAS_LAYOUT[key];
    text = ulasSafe(text);
    if (!text) return;
    const fits = (t, min) => { let size = 10; while (size > min && font.widthOfTextAtSize(t, size) > at.w) size -= 0.25; return size; };
    if (short && font.widthOfTextAtSize(text, 6.5) > at.w) text = ulasSafe(short);
    const size = fits(text, 5.5);
    pages[at.page].drawText(text, { x: at.x, y: flip(at.y), size, font, color: ink });
  };

  // Wraps words into lines no wider than w.
  const wrap = (text, w, size) => {
    const lines = [];
    let current = '';
    for (const word of ulasSafe(text).split(' ')) {
      const trial = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(trial, size) <= w) current = trial;
      else { if (current) lines.push(current); current = word; }
    }
    if (current) lines.push(current);
    return lines;
  };

  // Writes text into a box, shrinking it to fit; what still doesn't fit moves to `next` (or is cut with a note).
  const area = (key, text) => {
    const at = ULAS_LAYOUT[key];
    text = ulasSafe(text);
    if (!text) return;
    let size = 10;
    const lead = (s) => s * 1.25;
    const rows = (a, s) => Math.max(1, Math.floor((a.h - 2) / lead(s)));
    while (size > 6.5 && wrap(text, at.w, size).length > rows(at, size) + (at.next ? rows(at.next, size) : 0)) size -= 0.5;
    const all = wrap(text, at.w, size);
    const fit = rows(at, size);
    const first = all.slice(0, fit);
    let rest = all.slice(fit);
    const draw = (a, ls) => ls.forEach((t, i) => pages[a.page].drawText(t, { x: a.x, y: flip(a.y + i * lead(size)), size, font, color: ink }));
    if (at.next) {
      draw(at, first);
      const nextFit = rows(at.next, size);
      draw(at.next, rest.slice(0, nextFit));
      rest = rest.slice(nextFit);
    } else draw(at, first);
    if (rest.length) {
      const target = at.next || at;
      const lastRow = Math.min(rows(target, size), at.next ? rows(at.next, size) : rows(at, size)) - 1;
      pages[target.page].drawText('(continued on a separate sheet)', { x: target.x, y: flip(target.y + (lastRow + 1) * lead(size)), size: 7, font, color: ink });
    }
  };

  const tick = (box) => {
    const s = 4.2; // a cross inside the 10 pt box
    const page = pages[box.page];
    const y = flip(box.y);
    page.drawLine({ start: { x: box.x - s, y: y - s }, end: { x: box.x + s, y: y + s }, thickness: 1.4, color: ink });
    page.drawLine({ start: { x: box.x - s, y: y + s }, end: { x: box.x + s, y: y - s }, thickness: 1.4, color: ink });
  };

  line('city', v.city);
  line('declarant', v.name);
  line('residence', v.address, v.addressShort);
  line('declarantFil', v.name);
  line('residenceFil', v.address, v.addressShort);
  line('fullName', v.name);
  line('contact', v.contact);
  area('income', v.income);
  area('employer', v.employer);
  area('position', v.position);
  area('familyIncome', v.familyIncome);
  area('legalAid', v.legalAid);
  area('explanation', v.explanation);
  area('documents', v.documents);
  line('executedOn', v.executedOn);
  line('signedName', v.name);
  v.grounds.forEach((on, i) => on && tick(ULAS_GROUND_BOXES[i]));

  // Annex B-1 / B-2 hold the lawyer's own name and roll number: those stay for the lawyer to write.
  line('b1Lawyer', v.lawyer);
  line('b1Date', v.interviewedOn);
  line('b1Applicant', v.name);
  if (v.includeB2) {
    line('b2Applicant', v.name);
    line('b2Declared', v.executedOn);
    line('b2CertDate', v.interviewedOn);
    line('b2Atty', v.lawyer);
  } else pdf.removePage(4);
  if (!v.includeB1) pdf.removePage(3);

  return pdf.save();
}

if (typeof document !== 'undefined') document.addEventListener('alpine:init', () => {
  Alpine.data('ulasForm', () => ({
    loading: true,
    error: '',
    row: null,
    f: null, // the editable values (see prefill)
    creating: false,
    pdfUrl: '',
    pdfName: '',
    pdfError: '',
    me: Auth.user,

    async init() {
      const id = location.hash.slice(1);
      if (!/^[a-z0-9]{15}$/.test(id)) {
        this.error = 'No appointment was chosen. Open this from an appointment\'s "ULAS declaration" button.';
        this.loading = false;
        return;
      }
      try {
        const [row, booking] = await Promise.all([
          pb.collection('appointments_overview').getOne(id, { requestKey: null }),
          pb.collection('appointments').getOne(id, { requestKey: null }),
        ]);
        this.row = row;
        this.f = this.prefill(row, booking.json && typeof booking.json === 'object' ? booking.json : {});
      } catch (err) {
        this.error = err?.status === 404 ? 'This appointment no longer exists.' : 'The appointment couldn\'t be loaded. Check your connection and try again.';
      } finally {
        this.loading = false;
      }
    },

    prefill(row, a) {
      const b = a.B_personal || {};
      const c = a.C_household || {};
      const fx = a.F_legalIssue || {};
      const g = a.G_caseFacts || {};
      // Titles read "Name — concern", so only the first part is the name.
      const name = b.fullName || [b.firstName, b.middleName, b.lastName].filter(Boolean).join(' ') || (row.title || '').split(' — ')[0];
      const self = Array.isArray(c.members) ? c.members.find((m) => /self/i.test(m.relationship || '')) : null;
      const total = Number(c.totalMonthlyIncome);
      const members = Number(c.totalMembers) || 0;
      const areas = [...(fx.practiceAreas || []), fx.other].filter(Boolean).join(', ');
      const help = [...(fx.requestedAssistance || []), fx.requestedOther].filter(Boolean).join(', ');
      const docs = a.K_documents || {};
      const when = row.scheduled_at ? manilaParts(row.scheduled_at).date : manilaParts(new Date().toISOString()).date;
      const noProperty = c.otherProperty === 'No';
      return {
        city: b.city || 'Lapu-Lapu',
        name,
        address: [b.address, b.barangay, b.city, b.province].filter(Boolean).join(', '),
        addressShort: [b.barangay, b.city].filter(Boolean).join(', '), // for the short blanks in the opening paragraph
        contact: [b.mobile || row.mobile_no, b.email || row.email].filter(Boolean).join(' / '),
        income: [b.occupation, self?.source].filter((x, i, arr) => x && arr.indexOf(x) === i).join(' / ') || 'N/A',
        employer: 'N/A',
        position: 'N/A',
        familyIncome: c.totalMonthlyIncome !== undefined && c.totalMonthlyIncome !== '' && !Number.isNaN(total)
          ? `PHP ${total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}${members ? ` (household of ${members})` : ''}` : '',
        legalAid: [help && areas ? `${help}: ${areas}.` : help || areas, g.narrative].filter(Boolean).join(' '),
        grounds: [false, false, noProperty, false],
        explanation: members && !Number.isNaN(total) ? `The applicant's household has ${members} member${members === 1 ? '' : 's'} with a combined monthly income of PHP ${total.toLocaleString('en-PH', { minimumFractionDigits: 2 })}.${noProperty ? ' The household owns no land or house other than the present residence.' : ''}` : '',
        documents: [...(docs.checklist || []), docs.additional].filter(Boolean).join('; '),
        executedOn: this.longDate(when),
        interviewedOn: this.longDate(when),
        lawyer: row.sl_name || '',
        includeB1: true,
        includeB2: true,
      };
    },

    // 2026-10-28 → "October 28, 2026"
    longDate(iso) {
      const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
      return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])).toLocaleDateString('en-US', { timeZone: 'UTC', month: 'long', day: 'numeric', year: 'numeric' }) : '';
    },

    groundLabels: [
      'I have no money or property sufficient and available for food, shelter, and basic necessities for myself and my family.',
      'My gross monthly income, together with that of my immediate family, does not exceed double the monthly minimum wage in the place where I reside.',
      'I do not own real property with a fair market value of more than PHP 300,000.00 as stated in its current tax declaration.',
      'I have no sufficient means to afford the adequate legal services sought above.',
    ],

    async createPdf() {
      this.creating = true;
      this.pdfError = '';
      try {
        const res = await fetch(ULAS_FORM_URL);
        if (!res.ok) throw new Error(`form ${res.status}`);
        const bytes = await ulasFillPdf(PDFLib, await res.arrayBuffer(), this.f);
        if (this.pdfUrl) URL.revokeObjectURL(this.pdfUrl);
        this.pdfUrl = URL.createObjectURL(new Blob([bytes], { type: 'application/pdf' }));
        this.pdfName = `ULAS-declaration-${this.row.reference || this.row.id}.pdf`;
      } catch (err) {
        console.error('[ulas] could not make the PDF:', err);
        this.pdfError = 'The PDF couldn\'t be created. Check your connection and try again.';
      } finally {
        this.creating = false;
      }
    },
  }));
});
