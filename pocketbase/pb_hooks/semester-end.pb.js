/// <reference path="../pb_data/types.d.ts" />

/*
 * SNMC Law Legal Clinic: end of semester for LSPs (PocketBase JS hook).
 *
 * Each LSP (`practitioners`) belongs to one semester (`semester_id` → `semesters`, whose `end_date` admins
 * set on the LSPs page). Every night at 00:05 Manila time this sets every LSP whose semester has ended
 * (end date before today) to Inactive. Run again on a later night it changes nothing, and if the server
 * was down it catches up on the next run. Admins keep an LSP on by moving them to the next semester.
 *
 * Install on the PocketBase server (README → "LSPs and semesters"):
 *   1. Copy this file into the `pb_hooks` folder next to `pb_data`.
 *   2. Restart PocketBase. The job shows under Settings → Crons as "lspSemesterEnd".
 */
cronAdd("lspSemesterEnd", "5 16 * * *", () => { // 16:05 UTC = 00:05 Manila (UTC+8, no daylight saving)
  // Today's date in Manila. end_date is a date at 00:00 UTC, so "before today 00:00" means it has ended.
  const today = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const ended = $app.findRecordsByFilter("semesters", "end_date < {:today}", "", 0, 0, { today: today + " 00:00:00.000Z" });

  let changed = 0;
  for (const semester of ended) {
    const lsps = $app.findRecordsByFilter("practitioners", "semester_id = {:id} && status != 'inactive'", "", 0, 0, { id: semester.id });
    for (const lsp of lsps) {
      lsp.set("status", "inactive");
      $app.save(lsp);
      changed++;
    }
  }
  if (changed) console.log("[semester-end] set " + changed + " LSP(s) to Inactive");
});
