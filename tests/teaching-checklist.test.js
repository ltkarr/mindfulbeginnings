'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('missing ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

function teachSource() {
  const start = admin.indexOf('function teachPlain(');
  const end = admin.indexOf('function printTeachingChecklist(');
  assert.ok(start > 0 && end > start);
  return admin.slice(start, end);
}

const sandbox = {
  Date, String, Number, Math, Object, Array, isNaN,
  jobDataCache: {},
  registrations: [],
  COURSES: {
    'Safe Sitter®': { hours: 5 },
    'Safe Sitter® Babysitting Essentials': { hours: 4 },
    'Adult & Pediatric First Aid/CPR/AED Certification': { hours: 3.75, redCross: true, requiresLeadTeacher: true },
    "Babysitter's Training": { hours: 4.25, redCross: true, requiresLeadTeacher: true },
    'Baby Ready + CPR Certification': { hours: 5 },
    'Care Ready': { hours: 2.5 },
    'Safe@Home — Virtual': { hours: 1, virtual: true }
  }
};
vm.createContext(sandbox);
vm.runInContext(
  [
    'escapeHtml',
    'fmtSessDate',
    'sessionEndTime',
    'preClassMaterialsLabel',
    'preClassInstrReminderLabel',
    'preClassShowsStudentCount',
    'preClassTaskList',
    'isGirlScoutBadgeCourseName',
    'courseRequiresLeadTeacher'
  ].map((name) => extractFunction(admin, name)).join('\n') + '\n' + teachSource(),
  sandbox
);

function sess(partial) {
  return Object.assign({
    id: partial.id || 's1',
    course: 'Safe Sitter®',
    date: '2026-10-31',
    time: '9:00 AM',
    code: 'SS-261031',
    location: 'Host home',
    isVirtual: false,
    isHold: false,
    isCancelled: false,
    hasHost: true,
    isCustomJob: false
  }, partial);
}

function kit(counts) {
  sandbox.packingBringCounts = function () { return Object.assign({}, counts); };
}

test('each dashboard session and the Manage menu can print a checklist without a new API route', () => {
  const reminder = admin.slice(admin.indexOf('// ── Pre-class action reminders'), admin.indexOf('// ─── SESSIONS'));
  assert.match(reminder, /Print checklist \(PDF\)/);
  assert.match(reminder, /printTeachingChecklist\(/);
  assert.match(extractFunction(admin, 'renderDashMatChecklist'), /Print checklist \(PDF\)/);
  const menu = extractFunction(admin, 'openSessionMenu');
  const printAt = menu.indexOf("label:'Print checklist (PDF)'");
  const aboutAt = menu.indexOf('openSessionAbout');
  const holdAt = menu.indexOf('if(s.isHold){');
  assert.ok(printAt > aboutAt && printAt < holdAt);
  const printFn = admin.slice(admin.indexOf('function printTeachingChecklist('), admin.indexOf('function toggleReminderFlag('));
  assert.match(printFn, /window\.print\(\)/);
  assert.match(printFn, /teach-printing/);
  assert.doesNotMatch(printFn, /fetch\(|\/api\//);
  assert.match(admin, /id="teach-print-sheet"/);
  const src = teachSource() + printFn;
  assert.doesNotMatch(src, /\u2014|\u2013/);
  const apiFiles = [];
  (function walk(dir) {
    fs.readdirSync(dir, { withFileTypes: true }).forEach((ent) => {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(full);
      else if (ent.name.endsWith('.js')) apiFiles.push(full);
    });
  })(path.join(root, 'api'));
  assert.equal(apiFiles.length, 12);
});

test('a Safe Sitter checklist names the class, the people, the kit, and the pre-class to-dos', () => {
  sandbox.jobDataCache = { s1: { materialsSent: true, instrReminderSent: false, hostReminderSent: false, classReminderSent: false } };
  sandbox.packingRegisteredCount = function () { return 8; };
  sandbox.sessionUsesManikins = function () { return true; };
  sandbox.matCourseBooks = function () { return ['ssHandbook', 'ssNotebook']; };
  sandbox.checklistInstructorLabel = function () { return 'Jane Doe'; };
  sandbox.checklistHostLabel = function () { return 'Dana Rivera'; };
  sandbox.sessionIsOrganization = function () { return false; };
  sandbox.adminPlaceText = function () { return '4218 Silverwood Ln, Bethesda, MD 20816'; };
  kit({ infant: 1, child: 1, av: 1, ssHandbook: 8, ssNotebook: 8 });
  const model = sandbox.teachingChecklistModel(sess({ id: 's1', instructorId: 'i1' }), new Date(2026, 9, 26, 12));
  assert.equal(model.course, 'Safe Sitter®');
  assert.equal(model.when, 'Saturday, October 31, 2026');
  assert.equal(model.time, '9:00 AM to 2:00 PM');
  assert.equal(model.place, '4218 Silverwood Ln, Bethesda, MD 20816');
  assert.equal(model.instructor, 'Jane Doe');
  assert.equal(model.hostRole, 'Host');
  assert.equal(model.host, 'Dana Rivera');
  assert.equal(model.rosterText, '8 students registered');
  assert.equal(model.code, 'SS-261031');
  assert.ok(model.supplies.includes('1 infant CPR manikin'));
  assert.ok(model.supplies.includes('1 child CPR manikin'));
  assert.ok(model.supplies.includes('1 AV kit'));
  assert.ok(model.supplies.includes('Batteries + screwdriver'));
  assert.ok(model.supplies.includes('8 Safe Sitter handbooks'));
  assert.ok(model.supplies.includes('8 Safe Sitter notebooks'));
  assert.ok(model.supplies.includes('8 Safe Sitter certificates'));
  assert.equal(model.supplies.some((line) => /wallet card/i.test(line)), false);
  assert.deepEqual(Array.from(model.todos, (t) => t.label), [
    'Put out handbooks & supplies',
    'Send reminder + roster to instructor',
    'Host reminder, 1 week before',
    'Family reminder, before class'
  ]);
  assert.equal(model.todos[0].done, true);
  assert.equal(model.todos[1].done, false);
  const html = sandbox.teachingChecklistHtml(model);
  assert.match(html, /Teaching checklist/);
  assert.match(html, /class="is-done"/);
  assert.match(html, /&#10003;/);
  assert.match(html, /Printed October 26, 2026/);
  assert.match(html, /does not send any email or text/);
  assert.doesNotMatch(html, /\$\d|price/i);
  assert.doesNotMatch(html, /\u2014|\u2013/);
});

test('an empty roster still lists the handbooks and certificates to pack once students register', () => {
  sandbox.packingRegisteredCount = function () { return 0; };
  sandbox.sessionUsesManikins = function () { return true; };
  sandbox.matCourseBooks = function () { return ['ssHandbook', 'ssNotebook']; };
  sandbox.jobDataCache = { empty: {} };
  kit({ infant: 1, child: 1, av: 1 });
  const lines = sandbox.teachingChecklistSupplyLines(sess({ id: 'empty' }));
  assert.ok(lines.includes('1 infant CPR manikin'));
  assert.ok(lines.includes('Safe Sitter handbooks, one per student (none registered yet)'));
  assert.ok(lines.includes('Safe Sitter notebooks, one per student (none registered yet)'));
  assert.ok(lines.includes('Safe Sitter certificates, one per student (none registered yet)'));
});

test('course paper matches the class: completion cards, wallet cards, or participation certificates', () => {
  sandbox.packingRegisteredCount = function () { return 6; };
  sandbox.matCourseBooks = function (course) {
    if (String(course).indexOf('Essentials') >= 0) return ['ssHandbook', 'ssNotebook'];
    if (String(course).indexOf('Safe@Home') >= 0) return ['sahHandbook'];
    if (String(course).indexOf('Grandparents') >= 0) return ['gpHandbook'];
    return [];
  };
  sandbox.sessionUsesManikins = function (s) { return s.course === 'Care Ready' || s.course.indexOf('Baby Ready') === 0; };
  kit({});

  const essentials = sandbox.teachingChecklistSupplyLines(sess({ course: 'Safe Sitter® Babysitting Essentials' }));
  assert.ok(essentials.includes('6 Safe Sitter completion cards'));
  assert.equal(essentials.some((line) => line === '6 Safe Sitter certificates'), false);

  const red = sandbox.teachingChecklistSupplyLines(sess({ course: 'Adult & Pediatric First Aid/CPR/AED Certification' }));
  assert.ok(red.includes('CPR manikins'));
  assert.ok(red.includes('Batteries + screwdriver'));
  assert.ok(red.includes('6 Red Cross certification wallet cards'));
  assert.equal(red.some((line) => /Safe Sitter certificate/.test(line)), false);
  assert.equal(red.filter((line) => line === 'CPR manikins').length, 1);

  kit({ infant: 1, child: 1, av: 1 });
  const baby = sandbox.teachingChecklistSupplyLines(sess({ course: 'Baby Ready + CPR Certification' }));
  assert.ok(baby.includes('1 infant CPR manikin'));
  assert.ok(baby.includes('6 CPR certification cards'));
  assert.equal(baby.some((line) => /Red Cross certification wallet/.test(line)), false);

  kit({});
  sandbox.sessionUsesManikins = function () { return false; };
  const scout = sandbox.teachingChecklistSupplyLines(sess({ course: 'Girl Scouts — First Aid Badge Workshop' }));
  assert.ok(scout.includes('6 certificates of participation'));
  assert.equal(scout.some((line) => /manikin|Safe Sitter certificate/i.test(line)), false);
  assert.equal(sandbox.teachingChecklistModel(sess({ course: 'Girl Scouts — First Aid Badge Workshop' })).course, 'Girl Scouts - First Aid Badge Workshop');

  const care = sandbox.teachingChecklistSupplyLines(sess({ course: 'Care Ready' }));
  sandbox.sessionUsesManikins = function (s) { return s.course === 'Care Ready'; };
  const careKit = sandbox.teachingChecklistSupplyLines(sess({ course: 'Care Ready' }));
  assert.equal(care.some((line) => /manikin/i.test(line)), false);
  assert.ok(careKit.includes('CPR manikins'));
  assert.equal(careKit.some((line) => /^\d+ infant/.test(line)), false);
});

test('a stored time range is kept, and a virtual class does not pack a lock-box kit', () => {
  sandbox.packingRegisteredCount = function () { return 4; };
  sandbox.matCourseBooks = function () { return ['sahHandbook']; };
  sandbox.sessionUsesManikins = function () { return false; };
  kit({ sahHandbook: 4, av: 1 });
  const ranged = sandbox.teachingChecklistModel(sess({ time: '9:00 AM \u2013 2:00 PM' }));
  assert.equal(ranged.time, '9:00 AM to 2:00 PM');
  assert.doesNotMatch(ranged.time, /to 2:00 PM to/);

  const zoom = sandbox.teachingChecklistModel(sess({
    course: 'Safe@Home — Virtual',
    isVirtual: true,
    zoomLink: 'https://zoom.us/j/1',
    time: '4:00 PM'
  }));
  assert.equal(zoom.place, 'Virtual (Zoom): https://zoom.us/j/1');
  assert.deepEqual(Array.from(zoom.supplies), []);
  assert.match(zoom.supplyNote, /Nothing to pack from the lock box/);
  assert.equal(zoom.course, 'Safe@Home - Virtual');
  const html = sandbox.teachingChecklistHtml(zoom);
  assert.match(html, /Nothing to pack from the lock box/);
  assert.doesNotMatch(html, /manikin/i);
});

test('a custom job keeps the short to-do list and does not invent a roster', () => {
  sandbox.jobDataCache = { booth: { materialsSent: false, instrReminderSent: true } };
  sandbox.packingRegisteredCount = function () { return 0; };
  sandbox.matCourseBooks = function () { return null; };
  sandbox.sessionUsesManikins = function () { return false; };
  sandbox.checklistInstructorLabel = function () { return 'Lindsay Karr (owner)'; };
  sandbox.checklistHostLabel = function () { return 'No host'; };
  sandbox.sessionIsOrganization = function () { return false; };
  sandbox.adminPlaceText = function () { return 'Nation\'s Capital fairgrounds'; };
  kit({});
  const model = sandbox.teachingChecklistModel(sess({
    id: 'booth',
    course: 'Represent us at a booth',
    isCustomJob: true,
    hasHost: false,
    instructorId: 'i1',
    code: ''
  }));
  assert.equal(model.rosterText, 'No class roster');
  assert.equal(model.code, '');
  assert.deepEqual(Array.from(model.todos, (t) => [t.label, t.done]), [
    ['Put out materials for the instructor', false],
    ['Send reminder to instructor', true]
  ]);
  assert.match(model.supplyNote, /Nothing on the equipment list/);
  const html = sandbox.teachingChecklistHtml(model);
  assert.doesNotMatch(html, /Session code/);
  assert.match(html, /Lindsay Karr \(owner\)/);
});

test('names on the sheet are escaped, and an organization is labeled as one', () => {
  sandbox.packingRegisteredCount = function () { return 1; };
  sandbox.matCourseBooks = function () { return []; };
  sandbox.sessionUsesManikins = function () { return false; };
  sandbox.checklistInstructorLabel = function () { return 'Ann & Lee'; };
  sandbox.checklistHostLabel = function () { return '<img alt=x>'; };
  sandbox.sessionIsOrganization = function () { return true; };
  sandbox.adminPlaceText = function () { return 'Temple Beth El'; };
  sandbox.jobDataCache = { org: {} };
  kit({});
  const model = sandbox.teachingChecklistModel(sess({
    id: 'org',
    course: 'Safe@Home <script>',
    hasHost: false,
    hostedFor: 'org1'
  }));
  assert.equal(model.hostRole, 'Organization');
  assert.equal(model.rosterText, '1 student registered');
  const html = sandbox.teachingChecklistHtml(model);
  assert.match(html, /Organization/);
  assert.match(html, /Ann &amp; Lee/);
  assert.match(html, /&lt;img alt=x&gt;/);
  assert.match(html, /Safe@Home &lt;script&gt;/);
  assert.doesNotMatch(html, /<img|<script>/);
});
