'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const sheets = require(path.join(root, 'js/teaching-checklists.js'));
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const buildFile = fs.readFileSync(path.join(root, 'admin-build.txt'), 'utf8').trim();

function idFor(course) {
  const sheet = sheets.forCourse(course);
  return sheet ? sheet.id : null;
}

test('active courses map to the current teaching checklists', () => {
  const cases = {
    'Safe Sitter®': 'safe-sitter',
    'SafeSitter @Norwood': 'safe-sitter',
    'Safe Sitter® Babysitting Essentials': 'ss-essentials',
    'Intro to Babysitting': 'intro-babysitting',
    'Intro to Babysitting — Greenwood': 'intro-babysitting',
    'Safe@Home': 'safe-at-home',
    'Safe@Home — Series': 'safe-at-home-series',
    'Grandparents: Getting Started': 'grandparents',
    'Safe Sitter® Grandparents: Getting Started': 'grandparents',
    'Stay Ready: Choking Rescue and CPR': 'stay-ready',
    'Stay Ready™: Choking Rescue, CPR, and Seizure Response': 'stay-ready',
    'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes': 'season-ready',
    'Season Ready™: Safety Skills for Student Athletes': 'season-ready',
    'Campus Ready: Safety Skills for College Life': 'campus-ready',
    'All Kids Welcome': 'all-kids-welcome',
    'Girl Scouts — First Aid Badge Workshop': 'gs-first-aid',
    'First Aid Badge Workshop': 'gs-first-aid',
    'My First Babysitters Club': 'my-first-club',
    'My First Babysitters Club — Single Session': 'my-first-single',
    'Little Medics': 'little-medics',
    'Ready. Period.': 'ready-period',
    'Social Ready': 'social-ready',
    'Babysitting Grandkids Workshop': 'grandkids',
    'Baby Ready': 'baby-ready',
    'Baby Ready + CPR Certification': 'baby-ready-cpr',
    'Care Ready': 'care-ready',
    'Steady and Ready': 'steady-and-ready',
    'Red Cross Babysitter\'s Training + Pediatric First Aid/CPR/AED': 'rc-bt-peds',
    'Red Cross Babysitter\'s Training + Pediatric First Aid/CPR/AED (Online + Classroom)': 'rc-bt-peds',
    'Adult & Pediatric First Aid/CPR/AED Certification': 'rc-adult-peds',
    'Adult & Pediatric First Aid/CPR/AED Certification (Online + Classroom)': 'rc-adult-peds',
    'Adult & Pediatric First Aid/CPR/AED Certification (Hybrid)': 'rc-adult-peds',
    'Group CPR Certification for Workplaces': 'rc-workplace'
  };
  Object.keys(cases).forEach(function (course) {
    assert.equal(idFor(course), cases[course], course);
  });
});

test('courses with no current checklist stay unmatched', () => {
  [
    'Adult First Aid/CPR/AED Certification',
    'Adult First Aid/CPR/AED Certification (Hybrid)',
    'Basic Life Support (BLS) Certification',
    'Basic Life Support (BLS) Certification (Hybrid)',
    'Babysitter\'s Training',
    'Girl Scout Badge Class',
    'Pet Sitter\'s Club',
    'Lunchroom Lifesaver',
    'Middle School Ready',
    'Screen Ready',
    'Safe & Ready Families',
    'Safe@Home — Virtual',
    'Babysitting Grandkids Workshop — Virtual',
    'Ready. Period. virtual',
    ''
  ].forEach(function (course) {
    assert.equal(idFor(course), null, course);
  });
});

test('virtual sessions and virtual course names do not get a teaching checklist', () => {
  assert.equal(sheets.forSession({ course: 'Safe@Home', isVirtual: true }), null);
  assert.equal(sheets.forSession({ course: 'Safe Sitter®', isVirtual: true }), null);
  assert.equal(sheets.forSession({ course: 'Safe@Home — Series', isVirtual: true }), null);
  assert.equal(sheets.forSession({ course: 'Ready. Period.', isVirtual: true }), null);
  assert.equal(sheets.forSession({ course: 'Safe@Home', isVirtual: false }).id, 'safe-at-home');
  assert.equal(sheets.forSession({ course: 'Ready. Period.', isVirtual: false }).id, 'ready-period');
  assert.equal(sheets.byId('safe-at-home-virtual'), null);
  assert.equal(sheets.byId('ready-period-virtual'), null);
  assert.equal(sheets.list().some(function (sheet) { return /virtual/i.test(sheet.id) || /virtual/i.test(sheet.title); }), false);
});

test('checklist copy is printable and does not carry draft notes', () => {
  const text = sheets.visibleText();
  assert.doesNotMatch(text, /—|–/);
  assert.doesNotMatch(text, /mannequin/i);
  assert.match(text, /manikin/i);
  assert.doesNotMatch(text, /Not found/i);
  assert.doesNotMatch(text, /Lindsay to fill/i);
  assert.doesNotMatch(text, /\bARCHIVE\b/);
  assert.doesNotMatch(text, /staged-wound/i);
  sheets.list().forEach(function (sheet) {
    const count = sheet.sections.reduce(function (n, section) { return n + section.items.length; }, 0);
    assert.ok(count >= 3, sheet.id + ' has items');
    assert.ok(sheet.title && !/—|–/.test(sheet.title), sheet.id);
  });
});

test('Girl Scouts sheet forbids fake injuries and Red Cross sheets pack manikins', () => {
  const gs = sheets.printHtml(sheets.byId('gs-first-aid'), null);
  assert.match(gs, /No fake blood/);
  assert.doesNotMatch(gs, /staged-wound/i);
  assert.match(gs, /moulage/);
  const rc = sheets.printHtml(sheets.byId('rc-bt-peds'), null);
  assert.match(rc, /manikin/i);
  assert.doesNotMatch(rc, /mannequin/i);
  assert.match(rc, /Red Cross Learning Center/);
  assert.match(sheets.byId('rc-workplace').title, /Workplace/);
  assert.match(sheets.printHtml(sheets.byId('rc-adult-peds'), null), /2 infant manikins/);
});

test('a session printout includes the date, place, and code', () => {
  const html = sheets.printHtml(sheets.byId('safe-sitter'), {
    date: '2026-11-14',
    time: '9:00 AM',
    place: 'Beth El, 123 Maple St, Alexandria, VA 22314',
    code: 'SS-4410',
    sessionTitle: 'Safe Sitter® at Beth El'
  });
  assert.match(html, /Mindful Beginnings/);
  assert.match(html, /Teaching checklist/);
  assert.match(html, /Saturday, November 14, 2026/);
  assert.match(html, /9:00 AM/);
  assert.match(html, /Beth El, 123 Maple St, Alexandria, VA 22314/);
  assert.match(html, /Code SS-4410/);
  assert.match(html, /Instructor: Unassigned/);
  assert.match(html, /Safe Sitter® at Beth El/);
  assert.match(html, /teach-box/);
  assert.match(html, /Infant manikin and child manikin/);
  const blank = sheets.printHtml(sheets.byId('safe-at-home'), null);
  assert.doesNotMatch(blank, /Code /);
  assert.doesNotMatch(blank, /November/);
  assert.doesNotMatch(blank, /Instructor:/);
  const escaped = sheets.printHtml(sheets.byId('safe-at-home'), {
    place: '<script>',
    code: 'A&B',
    sessionTitle: '<img>'
  });
  assert.match(escaped, /&lt;script&gt;/);
  assert.match(escaped, /A&amp;B/);
  assert.match(escaped, /&lt;img&gt;/);
  assert.doesNotMatch(escaped, /<script>/);
});

test('upcoming classes with a checklist are listed, and the rest are not', () => {
  const rows = sheets.upcoming([
    { id: 'later', course: 'Safe@Home', date: '2026-12-20', time: '1:00 PM' },
    { id: 'am', course: 'Safe Sitter®', date: '2026-11-14', time: '9:00 AM', code: 'SS-1' },
    { id: 'pm', course: 'Care Ready', date: '2026-11-14', time: '1:00 PM' },
    { id: 'old', course: 'Safe Sitter®', date: '2026-11-01', time: '9:00 AM' },
    { id: 'hold', course: 'Safe Sitter®', date: '2026-11-16', isHold: true },
    { id: 'cx', course: 'Baby Ready', date: '2026-11-16', isCancelled: true },
    { id: 'bls', course: 'Basic Life Support (BLS) Certification', date: '2026-11-18' },
    { id: 'zoom', course: 'Safe Sitter®', date: '2026-11-15', time: '10:00 AM', isVirtual: true },
    { id: 'sahz', course: 'Safe@Home — Virtual', date: '2026-11-15', time: '11:00 AM', isVirtual: true },
    { id: 'far', course: 'Stay Ready: Choking Rescue and CPR', date: '2027-02-01' }
  ], '2026-11-05', 60);
  assert.deepEqual(rows.map(function (s) { return s.id; }), ['am', 'pm', 'later']);
});

test('a session printout names the instructor, or says unassigned', () => {
  const named = sheets.printHtml(sheets.byId('care-ready'), {
    date: '2026-11-14',
    instructor: 'Lindsay Karr (owner) + Priya Shah'
  });
  assert.match(named, /Instructor: Lindsay Karr \(owner\) \+ Priya Shah/);
  const empty = sheets.printHtml(sheets.byId('care-ready'), { instructor: '' });
  assert.match(empty, /Instructor: Unassigned/);
  const tbd = sheets.printHtml(sheets.byId('care-ready'), { instructor: 'TBD' });
  assert.match(tbd, /Instructor: Unassigned/);
  const escaped = sheets.printHtml(sheets.byId('care-ready'), { instructor: '<Ann>' });
  assert.match(escaped, /Instructor: &lt;Ann&gt;/);
  assert.doesNotMatch(escaped, /<Ann>/);
});

test('the bingo or raffle line is only on Safe Sitter and Essentials', () => {
  const line = 'Bingo prizes AND/OR raffle tickets for an Amazon gift card';
  assert.equal(sheets.sharedSupply, line);
  const prizeIds = { 'safe-sitter': true, 'ss-essentials': true };
  sheets.list().forEach(function (sheet) {
    const html = sheets.printHtml(sheet, { date: '2026-11-14', instructor: 'Lindsay Karr' });
    const hits = html.split(line).length - 1;
    assert.equal(hits, prizeIds[sheet.id] ? 1 : 0, sheet.id);
  });
  ['Safe Sitter®', 'SafeSitter @Norwood', 'Safe Sitter at Beth El', 'Safe Sitter® Babysitting Essentials'].forEach(function (name) {
    const sheet = sheets.forCourse(name);
    assert.ok(sheet && prizeIds[sheet.id], name);
    assert.equal(sheets.usesSharedSupply(name), true, name);
    assert.equal(sheets.printHtml(sheet, null).split(line).length - 1, 1, name);
  });
  ['Safe@Home', 'Safe@Home — Series', 'Grandparents: Getting Started', 'Babysitting Grandkids Workshop', 'Care Ready', 'Baby Ready', 'Intro to Babysitting', 'Ready. Period.', 'Safe Sitter instructors'].forEach(function (name) {
    assert.equal(sheets.usesSharedSupply(name), false, name);
    const sheet = sheets.forCourse(name);
    if (sheet) assert.equal(sheets.printHtml(sheet, null).split(line).length - 1, 0, name);
  });
  assert.equal(sheets.forSession({ course: 'Safe Sitter®', isVirtual: true }), null);
  const safe = sheets.printHtml(sheets.byId('safe-sitter'), null);
  assert.match(safe, /Game pouch \(blue zippered\)/);
  assert.match(safe, /Tape and a fake cell phone/);
  assert.doesNotMatch(safe, /raffle ticket pouch/);
  assert.doesNotMatch(safe, /Bingo prizes,/);
  assert.match(admin, /usesSharedSupply\(course\)/);
  assert.match(admin, /packingKitHtml\(\{course:s\.course/);
  assert.doesNotMatch(admin, /Bingo prizes AND\/OR raffle tickets for an Amazon gift card/);

  function extractFunction(src, name) {
    const start = src.indexOf('function ' + name + '(');
    if (start < 0) throw new Error('missing ' + name);
    let i = src.indexOf('{', start);
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') {
        depth--;
        if (depth === 0) return src.slice(start, j + 1);
      }
    }
    throw new Error('unclosed ' + name);
  }
  const pack = { MBTeachingChecklists: sheets, escapeHtml: function (t) { return String(t == null ? '' : t); } };
  vm.createContext(pack);
  vm.runInContext(extractFunction(admin, 'packingKitHtml'), pack);
  const rows = [
    { course: 'Safe Sitter®', bring: 'Bring: 1 AV kit', manikins: true },
    { course: 'Safe Sitter® Babysitting Essentials', bring: 'Bring: 1 AV kit', manikins: true },
    { course: 'Safe@Home', bring: 'Bring: 1 AV kit', manikins: false },
    { course: 'Grandparents: Getting Started', bring: 'Bring: 1 AV kit', manikins: true },
    { course: 'Care Ready', bring: 'Bring: 1 infant manikin', manikins: true }
  ];
  const packed = rows.map(function (row) { return pack.packingKitHtml(row); }).join('\n');
  assert.equal(packed.split(line).length - 1, 2);
  assert.equal(pack.packingKitHtml({ bring: 'Bring: 1 AV kit', manikins: false }).split(line).length - 1, 0);
  assert.match(pack.packingKitHtml(rows[0]), /Batteries \+ screwdriver/);
});

test('AV kit pieces print on AV courses, and Safe Sitter above 8 is three of each', () => {
  const parts = sheets.avParts;
  assert.deepEqual(parts, [
    'Laptop, case, and speakers (Mindful Beginnings)',
    'Projector, case, and remote (Mindful Beginnings). The host provides the wall or screen.',
    'USB-C to HDMI adapter (in the AV kit)',
    'Power strip or cord (in the AV kit)'
  ]);
  sheets.list().forEach(function (sheet) {
    const html = sheets.printHtml(sheet, null);
    parts.forEach(function (part) {
      const hits = html.split(part).length - 1;
      assert.equal(hits, sheets.usesAvKit(sheet) ? 1 : 0, sheet.id + ' ' + part);
    });
  });
  assert.equal(sheets.usesAvKit(sheets.byId('ready-period')), false);
  assert.equal(sheets.usesAvKit(sheets.byId('gs-first-aid')), false);
  assert.equal(sheets.usesAvKit(sheets.byId('intro-babysitting')), false);
  assert.match(sheets.printHtml(sheets.byId('safe-sitter'), null), /1 each for 8 or fewer students, 3 each above 8/);
  assert.match(sheets.printHtml(sheets.byId('ss-essentials'), null), /3 each above 8/);
  assert.doesNotMatch(sheets.printHtml(sheets.byId('safe-sitter'), null), /2 each above 8/);
  assert.doesNotMatch(sheets.printHtml(sheets.byId('ss-essentials'), null), /2 each above 8/);
  assert.match(sheets.printHtml(sheets.byId('grandparents'), null), /2 each above 8/);
  assert.equal(sheets.forSession({ course: 'Safe Sitter®', isVirtual: true }), null);
  assert.equal(sheets.forSession({ course: 'Ready. Period.', isVirtual: true }), null);
});

test('the admin dashboard can print a checklist the same way it prints a packing list', () => {
  assert.match(admin, /<script src="\/js\/teaching-checklists\.js"><\/script>/);
  assert.match(admin, /id="dash-teach-checks"/);
  assert.match(admin, /id="teach-print-sheet"/);
  assert.match(admin, /function renderDashTeachingChecks\(/);
  assert.match(admin, /function printTeachingChecklist\(/);
  assert.match(admin, /function openTeachingChecklistPrint\(/);
  assert.match(admin, /printTeachingChecklist\('\$\{s\.id\}'\)/);
  assert.match(admin, /Print teaching checklist/);
  assert.match(admin, /body\.teach-printing/);
  assert.match(admin, /window\.print\(\)/);
  const build = admin.match(/window\.MB_ADMIN_BUILD='([^']+)'/);
  assert.equal(build && build[1], buildFile);
  assert.match(buildFile, /prep-sections/);
  assert.match(admin, /instructor:instructor/);
  assert.match(admin, /sessionInstructorNames\(s,''\)/);
  assert.match(admin, /Virtual classes do not use a teaching checklist/);
});

test('admin sends the assigned instructor names onto the printed sheet', () => {
  function extractFunction(src, name) {
    const start = src.indexOf('function ' + name + '(');
    if (start < 0) throw new Error('missing ' + name);
    let i = src.indexOf('{', start);
    let depth = 0;
    for (let j = i; j < src.length; j++) {
      if (src[j] === '{') depth++;
      else if (src[j] === '}') {
        depth--;
        if (depth === 0) return src.slice(start, j + 1);
      }
    }
    throw new Error('unclosed ' + name);
  }
  const sandbox = {
    instructors: [
      { id: 'p', name: 'Priya Shah' },
      { id: 'b', name: 'Bob Smith' }
    ],
    jobDataCache: { s1: { instructorId: 'p' } },
    adminPlaceText: function () { return 'Beth El'; }
  };
  vm.createContext(sandbox);
  vm.runInContext([
    extractFunction(admin, 'sessionInstructorList'),
    extractFunction(admin, 'sessionInstructorNames'),
    extractFunction(admin, 'teachingChecklistMeta')
  ].join('\n'), sandbox);
  const named = sandbox.teachingChecklistMeta({
    id: 's1',
    course: 'Care Ready',
    date: '2026-11-14',
    time: '9:00 AM',
    code: 'CR-1',
    ownerTaught: false,
    instructorId: null,
    secondInstructorId: 'b',
    isVirtual: false
  });
  assert.equal(named.instructor, 'Priya Shah + Bob Smith');
  const html = sheets.printHtml(sheets.byId('care-ready'), named);
  assert.match(html, /Instructor: Priya Shah \+ Bob Smith/);
  assert.match(html, /Beth El/);
  assert.match(html, /Code CR-1/);

  const owner = sandbox.teachingChecklistMeta({
    id: 'own',
    course: 'Safe Sitter®',
    ownerTaught: true,
    secondInstructorId: null,
    isVirtual: false
  });
  assert.equal(owner.instructor, 'Lindsay Karr (owner)');

  sandbox.jobDataCache = {};
  const none = sandbox.teachingChecklistMeta({
    id: 'none',
    course: 'Care Ready',
    ownerTaught: false,
    instructorId: null,
    isVirtual: false
  });
  assert.equal(none.instructor, '');
  assert.match(sheets.printHtml(sheets.byId('care-ready'), none), /Instructor: Unassigned/);
});
