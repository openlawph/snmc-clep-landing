/*
 * One-off import of the 15 law student practitioners into the PocketBase `practitioners` collection.
 *
 * How to run: sign in as an admin, open clinic-practitioners.html, open the browser console (F12),
 * paste this whole file and press Enter. It uses the page's logged-in `pb` client, so no password is
 * needed here. Set YEAR_LEVEL and LEVEL below first; run it once only (it skips people already listed).
 *
 * The collection has no student-number field, so only the names are imported.
 */
(async () => {
  const YEAR_LEVEL = '4th year'; // '1st year' | '2nd year' | '3rd year' | '4th year' — CHECK before running
  const LEVEL = 'Level 1';       // 'Level 1' | 'Level 2'
  const STATUS = 'active';

  const people = [
    ['Rosenith D.', 'Augusto'], ['Adriane Joseph B.', 'Adaptar'], ['Niña Vi', 'Bote'],
    ['Valerie Cris G.', 'Cernio'], ['Gwyneth Yvanne A.', 'Gonzaga'], ['Romualdo Jr. P.', 'Hipe'],
    ['Eliakim III T.', 'Insong'], ['Daphne Marie C.', 'Limosnero'], ['April Joy A.', 'Lloren'],
    ['Jan Edwin Vincent G.', 'Maghuyop'], ['Geni-vi I.', 'Obregon'], ['Janica Gee C.', 'Otom'],
    ['Gerline Mae O.', 'Pableo'], ['Gee-Ann', 'Paluca'], ['Hans Bernard C.', 'Sinugbuhan'],
  ];

  // Newest semester (the one the LSPs belong to); change if they belong to another.
  const semester = (await pb.collection('semesters').getList(1, 1, { sort: '-end_date' })).items[0];
  if (!semester) throw new Error('No semester exists yet. Add one in the Semesters card first.');
  console.log('Using semester', semester.school_year, semester.semester);

  const existing = await pb.collection('practitioners').getFullList({ fields: 'fname,lname' });
  const have = new Set(existing.map((p) => `${p.fname}|${p.lname}`.toLowerCase()));

  for (const [fname, lname] of people) {
    if (have.has(`${fname}|${lname}`.toLowerCase())) { console.log('skip', fname, lname); continue; }
    await pb.collection('practitioners').create({
      fname, lname, email: '', contactno: '', level: LEVEL, year_level: YEAR_LEVEL,
      semester_id: semester.id, active_cases: 0, archived_cases: 0, status: STATUS,
    });
    console.log('added', fname, lname);
  }
  console.log('Done. Reload the page.');
})();
