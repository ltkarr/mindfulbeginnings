'use strict';

const fs = require('fs');
const path = require('path');
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
    'Safe@Home — Virtual': 'safe-at-home-virtual',
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
    'Babysitting Grandkids Workshop — Virtual': 'grandkids',
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
    ''
  ].forEach(function (course) {
    assert.equal(idFor(course), null, course);
  });
});

test('a virtual Safe@Home or Ready. Period. session uses the virtual sheet', () => {
  assert.equal(sheets.forSession({ course: 'Safe@Home', isVirtual: true }).id, 'safe-at-home-virtual');
  assert.equal(sheets.forSession({ course: 'Safe@Home', isVirtual: false }).id, 'safe-at-home');
  assert.equal(sheets.forSession({ course: 'Safe@Home — Series', isVirtual: true }).id, 'safe-at-home-series');
  assert.equal(sheets.forSession({ course: 'Ready. Period.', isVirtual: true }).id, 'ready-period-virtual');
  assert.equal(sheets.forSession({ course: 'Ready. Period.', isVirtual: false }).id, 'ready-period');
  const virtual = sheets.byId('ready-period-virtual');
  const text = virtual.sections.map(function (section) { return section.items.join('\n'); }).join('\n');
  assert.match(text, /Confirm with families/);
  assert.match(text, /one pad, a glass of water, a large spoon, and a towel ready before class/);
  assert.doesNotMatch(text, /big spoon/);
  assert.doesNotMatch(text, /do not bring class materials/i);
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
  assert.match(html, /Safe Sitter® at Beth El/);
  assert.match(html, /teach-box/);
  assert.match(html, /Infant manikin and child manikin/);
  const blank = sheets.printHtml(sheets.byId('safe-at-home'), null);
  assert.doesNotMatch(blank, /Code /);
  assert.doesNotMatch(blank, /November/);
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
    { id: 'far', course: 'Stay Ready: Choking Rescue and CPR', date: '2027-02-01' }
  ], '2026-11-05', 60);
  assert.deepEqual(rows.map(function (s) { return s.id; }), ['am', 'pm', 'later']);
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
  assert.match(buildFile, /teaching-checklists/);
});
