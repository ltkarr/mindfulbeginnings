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
  assert.match(buildFile, /pack-counts/);
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
    extractFunction(admin, 'teachingChecklistApi'),
    extractFunction(admin, 'teachingChecklistAttendance'),
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

test('teaching checklists show anticipated and registered counts, and virtual classes stay out', () => {
  function view(anticipated, registered) {
    return sheets.attendanceView({ anticipated: anticipated, registered: registered });
  }
  const higher = view(15, 8);
  assert.equal(higher.anticipatedLabel, 'Anticipated participants: 15');
  assert.equal(higher.registeredLabel, 'Registered participants: 8');
  assert.equal(higher.over, false);

  const missing = view(null, 8);
  assert.equal(missing.anticipatedLabel, 'Anticipated participants: Not provided');
  assert.equal(missing.registeredLabel, 'Registered participants: 8');
  assert.equal(view('', 0).anticipatedLabel, 'Anticipated participants: Not provided');
  assert.equal(view('', 0).registeredLabel, 'Registered participants: 0');
  assert.equal(view(0, 0).anticipatedLabel, 'Anticipated participants: 0');
  assert.notEqual(view(0, 0).anticipatedLabel, view(null, 0).anticipatedLabel);

  const over = view(8, 10);
  assert.equal(over.anticipatedLabel, 'Anticipated participants: 8');
  assert.equal(over.registeredLabel, 'Registered participants: 10');
  assert.match(over.overNote, /already above the anticipated count/);
  assert.match(over.overNote, /stay with the registered count/);
  assert.doesNotMatch(over.overNote, /pack fewer|fewer than/i);

  function sheet(attendance) {
    return sheets.printHtml(sheets.byId('safe-sitter'), {
      date: '2026-11-13',
      time: '9:00 AM',
      place: 'Sample host home',
      code: 'SS-SAMPLE',
      instructor: 'Priya Shah',
      attendance: attendance,
      adminPrivateNotes: 'Private referral note should never print',
      wifiInfo: 'network secret',
      notes: 'Door code 1234'
    });
  }
  const html15 = sheet({ anticipated: 15, registered: 8 });
  assert.match(html15, /class="teach-pdf-counts"/);
  assert.match(html15, /Anticipated participants: 15/);
  assert.match(html15, /Registered participants: 8/);
  assert.doesNotMatch(html15, /Private referral|network secret|Door code|1234/);
  const htmlMissing = sheet({ anticipated: null, registered: 0 });
  assert.match(htmlMissing, /Anticipated participants: Not provided/);
  assert.match(htmlMissing, /Registered participants: 0/);
  assert.doesNotMatch(htmlMissing, /Anticipated participants: 0/);
  const htmlZero = sheet({ anticipated: 0, registered: 0 });
  assert.match(htmlZero, /Anticipated participants: 0/);
  const htmlOver = sheet({ anticipated: 8, registered: 10 });
  assert.match(htmlOver, /Anticipated participants: 8/);
  assert.match(htmlOver, /Registered participants: 10/);
  assert.match(htmlOver, /Packing quantities stay with the registered count/);
  const blank = sheets.printHtml(sheets.byId('safe-sitter'), null);
  assert.doesNotMatch(blank, /Anticipated participants/);
  assert.equal(sheets.forSession({ course: 'Safe Sitter®', isVirtual: true, participantsExpected: 15 }), null);
  assert.equal(sheets.forCourse('Safe Sitter® — Virtual'), null);
  assert.equal(sheets.anticipatedFromSession({ participantsExpected: 15, maxStudentsOverride: 16, adminPrivateNotes: 'Expected participants: 4' }), 15);
  assert.equal(sheets.anticipatedFromSession({ participantsExpected: 0, maxStudentsOverride: 16 }), 0);
  assert.equal(sheets.anticipatedFromSession({ participantsExpected: null, maxStudentsOverride: 8, notes: 'Expected participants: 6' }), null);
  assert.equal(sheets.anticipatedFromSession({ maxStudentsOverride: 16 }), null);
  assert.match(admin, /function checklistHeadcountHtml/);
  assert.match(admin, /checklistHeadcountHtml\(s\)/);
  assert.match(admin, /anticipatedFromSession/);
  assert.doesNotMatch(admin.slice(admin.indexOf('function teachingChecklistAttendance'), admin.indexOf('function teachingChecklistMeta')), /adminPrivateNotes|wifiInfo|maxStudentsOverride/);
  const sandbox = {
    MBTeachingChecklists: sheets,
    adminPlaceText: function () { return 'Sample host home'; },
    packingRegisteredCount: function (s) {
      return (s && s._registered) || 0;
    }
  };
  vm.createContext(sandbox);
  function extractFunction(src, name) {
    const start = src.indexOf('function ' + name + '(');
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
  vm.runInContext([
    extractFunction(admin, 'teachingChecklistApi'),
    extractFunction(admin, 'teachingChecklistAttendance'),
    extractFunction(admin, 'checklistHeadcountHtml'),
    extractFunction(admin, 'teachingChecklistMeta')
  ].join('\n'), sandbox);
  const meta = sandbox.teachingChecklistMeta({
    course: 'Safe Sitter®',
    isVirtual: false,
    participantsExpected: 15,
    maxStudentsOverride: 16,
    adminPrivateNotes: 'Private referral note',
    wifiInfo: 'network secret',
    notes: 'Door code 9999',
    _registered: 8
  });
  assert.equal(meta.attendance.anticipated, 15);
  assert.equal(meta.attendance.registered, 8);
  assert.doesNotMatch(JSON.stringify(meta), /Private referral|network secret|Door code|9999|maxStudents/);
  assert.equal(sandbox.checklistHeadcountHtml({ course: 'Safe Sitter®', isVirtual: true, participantsExpected: 15, _registered: 8 }), '');
  assert.match(sandbox.checklistHeadcountHtml({ course: 'Safe Sitter®', isVirtual: false, participantsExpected: 0, _registered: 0 }), /Anticipated participants: 0/);
  assert.match(sandbox.checklistHeadcountHtml({ course: 'Safe Sitter®', isVirtual: false, participantsExpected: null, _registered: 3 }), /Not provided/);
});
