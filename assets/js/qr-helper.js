/* QR helper (qrcodejs 1.0.0 must be loaded first).
   - window.qrHelper.show(url?)  opens the overlay (defaults to the current address)
   - Floating "QR code" button: only on index.html, only while the booking wizard
     is on step 1 (index.html reports this with the 'qr-wizard' event).
   - clinic-appointments.html has its own button inside the appointment dialog. */
(function () {
  'use strict';
  if (window.qrHelper || typeof QRCode !== 'function') return;

  var wizardOk = true;
  function onIndex() {
    var last = location.pathname.split('/').pop();
    return last === '' || last === 'index' || last === 'index.html';
  }

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text) e.textContent = text;
    return e;
  }

  // qrcodejs computes the matrix; we draw it as inline SVG (no canvas / data: image)
  function drawQr(holder, text) {
    holder.replaceChildren();
    var q = new QRCode(document.createElement('div'), {
      text: text, width: 256, height: 256, correctLevel: QRCode.CorrectLevel.M
    });
    var m = q && q._oQRCode;
    if (!m || typeof m.getModuleCount !== 'function') throw new Error('QR model not available');
    var NS = 'http://www.w3.org/2000/svg', n = m.getModuleCount(), d = '';
    for (var r = 0; r < n; r++)
      for (var c = 0; c < n; c++)
        if (m.isDark(r, c)) d += 'M' + c + ' ' + r + 'h1v1h-1z';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 ' + n + ' ' + n);
    svg.setAttribute('shape-rendering', 'crispEdges');
    svg.setAttribute('role', 'img');
    svg.setAttribute('aria-label', 'QR code for this page');
    svg.setAttribute('class', 'block w-full h-auto');
    var path = document.createElementNS(NS, 'path');
    path.setAttribute('d', d);
    path.setAttribute('fill', '#000');
    svg.append(path);
    holder.append(svg);
  }

  var dlg, holder, urlText, opener, btn;

  function build() {
    dlg = el('dialog',
      'm-auto w-[min(92vw,22rem)] rounded-2xl bg-white p-0 text-neutral-900 shadow-2xl ' +
      'backdrop:bg-black/60 print:hidden');
    var box = el('div', 'p-5');
    var title = el('p', 'mb-3 text-center text-base font-semibold', 'Scan to open this page');
    var frame = el('div', 'mx-auto w-full max-w-[16rem] rounded-lg bg-white p-3 ring-1 ring-neutral-200');
    holder = el('div');
    frame.append(holder);
    urlText = el('p', 'mt-3 break-all text-center text-xs text-neutral-600 select-all');
    var close = el('button',
      'mt-4 w-full rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white', 'Close');
    close.type = 'button';
    box.append(title, frame, urlText, close);
    dlg.append(box);

    close.addEventListener('click', function () { dlg.close(); });
    dlg.addEventListener('click', function (e) { if (e.target === dlg) dlg.close(); });
    dlg.addEventListener('close', function () {   // give focus back to whatever opened it
      if (opener && opener.isConnected && !opener.hidden) opener.focus();
      opener = null;
    });
    document.body.append(dlg);
  }

  function show(url) {
    if (!dlg) build();
    url = typeof url === 'string' && url ? url : location.href;
    opener = document.activeElement;
    urlText.textContent = url;
    holder.replaceChildren();
    if (!/^https?:/.test(url)) {
      holder.append(el('p', 'text-center text-sm',
        'A QR code only works for pages on the web, not files opened from disk.'));
    } else {
      try { drawQr(holder, url); }
      catch (e) {
        holder.replaceChildren(el('p', 'text-center text-sm', 'Could not make a QR code for this address.'));
      }
    }
    // opened on top of another modal (e.g. the appointment dialog)? showModal() stacks above it
    if (!dlg.open) dlg.showModal();
  }

  window.qrHelper = { show: show };

  /* ----- floating button (index.html, wizard step 1 only) ----- */
  function updateButton() {
    if (!btn) return;
    var ok = onIndex() && wizardOk;
    btn.hidden = !ok;
    if (!ok && dlg && dlg.open) dlg.close();
  }
  window.addEventListener('qr-wizard', function (e) {   // sent by x-effect in index.html
    wizardOk = !!(e.detail && e.detail.show);
    updateButton();
  });

  function init() {
    if (!onIndex()) return;
    btn = el('button',
      'fixed bottom-4 right-4 z-40 print:hidden rounded-full bg-neutral-900/90 px-4 py-2 ' +
      'text-sm font-medium text-white shadow-lg hover:bg-neutral-900 focus:outline-2 ' +
      'focus:outline-offset-2 focus:outline-neutral-900', 'QR code');
    btn.type = 'button';
    btn.setAttribute('aria-haspopup', 'dialog');
    btn.title = 'Show a QR code for this page';
    btn.addEventListener('click', function () { show(); });
    document.body.append(btn);
    updateButton();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
