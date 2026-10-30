/// <reference path="../pb_data/types.d.ts" />

/*
 * SNMC Law Legal Clinic: the nightly check, so nobody has to keep watching the dashboard.
 * Every night at 00:10 Manila time it looks for anything that has slipped and, ONLY if it finds something, emails the
 * admins (or the addresses in Intake Settings). Quiet means fine. The email has references and counts only, never
 * client names or case facts. Run it by hand from PocketBase → Settings → Crons ("clinicDailyCheck").
 *
 * Install: README → "Installing the server files".
 */
cronAdd('clinicDailyCheck', '10 16 * * *', () => { // 16:10 UTC = 00:10 Manila
  const lib = require(`${__hooks}/clinic-lib.js`);
  const app = $app;
  const c = lib.controls(app);
  const gateFrom = c.getDateTime('gate_from').string();
  const startOfToday = lib.manilaToUTC(lib.manila().date);
  const dayAgo = lib.dbDate(Date.now() - 86400000);
  const lines = [];

  const refs = (rows) => {
    const shown = rows.slice(0, 15).map((r) => r.getString('reference'));
    return shown.join(', ') + (rows.length > shown.length ? ` and ${rows.length - shown.length} more` : '');
  };
  const report = (label, rows) => { if (rows.length) lines.push(`${label} (${rows.length}): ${refs(rows)}`); };
  const find = (filter, params) => app.findRecordsByFilter('appointments_overview', filter, 'scheduled_at', 0, 0, params || {});

  report('Date has passed but still open', find(
    `scheduled_at != "" && scheduled_at < {:today} && ${lib.OPEN_FILTER} && created >= {:gate}`, { today: startOfToday, gate: gateFrom }));
  report('Date has passed with no Annex C received', find(
    `scheduled_at != "" && scheduled_at < {:today} && ${lib.NO_INTAKE_FILTER} && app_status != "CANCELLED" && created >= {:gate}`, { today: startOfToday, gate: gateFrom }));
  report('Urgent and unassigned for over a day', find(
    `(client_urgent = true || urgency = "HIGH") && ${lib.UNASSIGNED_FILTER} && ${lib.OPEN_FILTER} && created < {:dayAgo}`, { dayAgo }));
  report('Possible duplicates in the last day', find('possible_duplicate = true && created >= {:dayAgo}', { dayAgo }));

  const paperCutoff = lib.dbDate(Date.now() - c.getInt('late_days') * 86400000);
  const paper = app.findRecordsByFilter('paper_forms', 'status = "ISSUED" && created < {:cutoff}', 'created', 0, 0, { cutoff: paperCutoff });
  report(`Paper forms issued over ${c.getInt('late_days')} days ago and never encoded`, paper);

  const late = app.findRecordsByFilter('intake_requests', 'encoded_late = true && created >= {:dayAgo} && voided = false', 'created', 0, 0, { dayAgo });
  report('Filed late in the last day', late);
  const unissued = app.findRecordsByFilter('intake_requests', 'unissued_paper = true && created >= {:dayAgo} && voided = false', 'created', 0, 0, { dayAgo });
  report('Filed in the last day from a paper form with no issued number', unissued);

  // The one-time setup. These stay in the email until they're done.
  const settings = app.settings();
  if (!settings.backups.cron) lines.push('Setup: automatic backups are off (Settings → Backups).');
  if (!settings.rateLimits.enabled || !settings.rateLimits.rules.some((r) => r.label === 'appointments:create')) lines.push('Setup: the appointments:create rate limit is missing (Settings → Rate limits).');
  if (!$os.getenv('TURNSTILE_SECRET')) lines.push('Setup: the spam check is off (TURNSTILE_SECRET isn\'t set on the server).');

  if (!lines.length) return; // nothing to report: no email
  try {
    lib.sendAlert(app, `Legal Clinic: ${lines.length} thing${lines.length === 1 ? '' : 's'} to look at`, 'The nightly check found the following:', lines);
  } catch (err) {
    console.error('[clinic] could not send the nightly email:', err, lines);
  }
});
