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

const alerts = { innerHTML: '' };
const focused = { id: '' };
const sandbox = {
  jobDataCache: {},
  instructors: [],
  registrations: [],
  orgPartners: [],
  sessions: [],
  dashUpcomingScope: 'all',
  dashUpcomingInstructor: 'all',
  dashPrepView: 'active',
  renderCount: 0,
  Date,
  String,
  Number,
  Math,
  packingBringLine: function () { return ''; },
  packingRegisteredCount: function () { return 0; },
  packingKitCount: function () { return 0; },
  packingKitHtml: function () { return '<div class="pack-bring">synthetic kit</div>'; },
  sessionUsesManikins: function () { return false; },
  MBTeachingChecklists: { forSession: function () { return { id: 'sheet' }; } }
};
sandbox.window = sandbox;
sandbox.renderDashboard = function () { sandbox.renderCount += 1; };
sandbox.document = {
  getElementById: function (id) {
    if (id === 'reminder-alerts') return alerts;
    if (id === 'dash-prep-tab-active' || id === 'dash-prep-tab-complete') {
      return { focus: function () { focused.id = id; } };
    }
    return null;
  }
};
vm.createContext(sandbox);
vm.runInContext(
  [
    'escapeHtml',
    'adminPlaceText',
    'fmtSessDate',
    'sessionInstructorList',
    'sessionInstructorNames',
    'sessionIsOrganization',
    'sessionHostDisplayName',
    'checklistInstructorLabel',
    'checklistHostLabel',
    'isLiveReg',
    'materialsCheckedStamp',
    'preClassMaterialsLabel',
    'preClassInstrReminderLabel',
    'preClassStudentReminderLabel',
    'preClassFinalRosterLabel',
    'preClassLiveStudentCount',
    'preClassNeedsStudentReminder',
    'preClassShowsStudentCount',
    'preClassTaskList',
    'preClassChecklistDone',
    'dashPrepIsComplete',
    'dashPrepPartition',
    'dashPrepEmptyCopy',
    'dashPrepViewFromKey',
    'setDashPrepView',
    'onDashPrepTabKey',
    'dashSessionDayDiff',
    'dashUpcomingSessions',
    'dashChecklistSessions',
    'dashTeachingSlots',
    'dashVisibleUpcoming',
    'dashFortnightLoad',
    'dashInstructorChoices',
    'dashPacksWithAnother',
    'renderDashUpcoming'
  ].map((n) => extractFunction(admin, n)).join('\n'),
  sandbox
);

function sess(id, date, flags) {
  return Object.assign({
    id: id,
    course: 'Sample Safe Sitter',
    date: date,
    isHold: false,
    isCancelled: false,
    isVirtual: false,
    hasHost: true,
    instructorId: 'alex',
    contactName: 'River Host',
    location: 'Sample Library',
    participantsExpected: null,
    adminPrivateNotes: '',
    priceOverride: null
  }, flags);
}

const DONE = {
  materialsSent: true,
  instrReminderSent: true,
  classReminderSent: true,
  hostReminderSent: false
};

function ids(rows) {
  return Array.from(rows || [], (s) => (s ? s.id : ''));
}

function paint(today) {
  sandbox.renderDashUpcoming(today || new Date(2026, 10, 6));
  return alerts.innerHTML;
}

test('prep is complete only when every checklist task is done, not the lock box alone', () => {
  const today = new Date(2026, 10, 6);
  const open = sess('open', '2026-11-10');
  const lockOnly = sess('lock', '2026-11-11');
  const partial = sess('partial', '2026-11-12');
  const ready = sess('ready', '2026-11-13');
  const missing = sess('missing', '2026-11-14');
  const custom = sess('booth', '2026-11-15', { isCustomJob: true, course: 'Sample booth' });
  const zoom = sess('zoom', '2026-11-16', { isVirtual: true, course: 'Sample Safe@Home — Virtual' });
  sandbox.registrations = [];
  sandbox.jobDataCache = {
    lock: { materialsSent: true },
    partial: { materialsSent: true, instrReminderSent: true, classReminderSent: false },
    ready: Object.assign({}, DONE),
    booth: { materialsSent: true, instrReminderSent: false },
    zoom: { materialsSent: true }
  };
  assert.equal(sandbox.dashPrepIsComplete(open), false);
  assert.equal(sandbox.dashPrepIsComplete(lockOnly), false);
  assert.equal(sandbox.dashPrepIsComplete(partial), false);
  assert.equal(sandbox.dashPrepIsComplete(missing), false);
  assert.equal(sandbox.dashPrepIsComplete(custom), false);
  assert.equal(sandbox.dashPrepIsComplete(zoom), false);
  assert.equal(sandbox.preClassTaskList(zoom).some((t) => t.key === 'materialsSent'), false);
  assert.equal(sandbox.dashPrepIsComplete(ready), true);
  assert.equal(sandbox.dashPrepIsComplete(ready), sandbox.preClassChecklistDone(ready));

  sandbox.jobDataCache.ready.classReminderSent = false;
  assert.equal(sandbox.dashPrepIsComplete(ready), false);
  sandbox.jobDataCache.ready.classReminderSent = true;
  assert.equal(sandbox.dashPrepIsComplete(ready), true);

  const rows = [open, lockOnly, partial, ready, missing, custom, zoom];
  const before = JSON.stringify(rows);
  const split = sandbox.dashPrepPartition(sandbox.dashUpcomingSessions(rows, today));
  assert.deepEqual(ids(split.complete), ['ready']);
  assert.deepEqual(ids(split.active), ['open', 'lock', 'partial', 'missing', 'booth', 'zoom']);
  assert.equal(split.active.some((s) => split.complete.indexOf(s) >= 0), false);
  assert.equal(JSON.stringify(rows), before);
  assert.equal(rows.every((s) => s.isCancelled === false && s.isHold === false), true);
  assert.equal(Object.prototype.hasOwnProperty.call(ready, 'prepComplete'), false);

  sandbox.jobDataCache.zoom = {
    materialsSent: false,
    instrReminderSent: true,
    classReminderSent: true,
    instrFinalRosterSent: true
  };
  sandbox.registrations = [{ sessionId: 'zoom', payStatus: 'paid', studentName: 'Student Example' }];
  assert.equal(sandbox.dashPrepIsComplete(zoom), true);
  sandbox.jobDataCache.zoom.instrFinalRosterSent = false;
  assert.equal(sandbox.dashPrepIsComplete(zoom), false);
});

test('a checklist with no tasks follows the existing done rule and is not a new status', () => {
  const quiet = sess('quiet', '2026-11-20', {
    isVirtual: true,
    ownerTaught: true,
    instructorId: null,
    course: 'Sample owner Zoom'
  });
  sandbox.registrations = [];
  sandbox.jobDataCache = {};
  assert.deepEqual(Array.from(sandbox.preClassTaskList(quiet), (t) => t.key), []);
  assert.equal(sandbox.preClassChecklistDone(quiet), true);
  assert.equal(sandbox.dashPrepIsComplete(quiet), true);
  const split = sandbox.dashPrepPartition([quiet]);
  assert.deepEqual(ids(split.complete), ['quiet']);
  assert.deepEqual(ids(split.active), []);
});

test('missing rows and a host reminder do not invent or block completion', () => {
  const emptySplit = sandbox.dashPrepPartition(null);
  const emptyAgain = sandbox.dashPrepPartition(undefined);
  assert.equal(emptySplit.active.length, 0);
  assert.equal(emptySplit.complete.length, 0);
  assert.equal(emptyAgain.active.length, 0);
  assert.equal(emptyAgain.complete.length, 0);
  const blank = sess('blank', '2026-11-10');
  sandbox.jobDataCache = {};
  const none = sandbox.dashPrepPartition([blank, null]);
  assert.equal(none.active.length, 2);
  assert.equal(none.active[0].id, 'blank');
  assert.equal(none.active[1], null);
  assert.equal(none.complete.length, 0);

  const hosted = sess('hosted', '2026-11-10');
  sandbox.jobDataCache = {
    hosted: { materialsSent: true, instrReminderSent: true, hostReminderSent: false, classReminderSent: true }
  };
  assert.equal(sandbox.preClassTaskList(hosted).some((t) => t.key === 'hostReminderSent'), false);
  assert.equal(sandbox.dashPrepIsComplete(hosted), true);
});

test('saved checklist flags round-trip, so a reload keeps the same tab', () => {
  const box = {
    INSTR_FINAL_ROSTER_COL: true,
    MATERIALS_SENT_AT_COL: true,
    MATERIALS_OUT_AT_COL: true,
    BADGE_SUMMARY_COL: true,
    RED_CROSS_REPORTED_COL: true
  };
  vm.createContext(box);
  vm.runInContext([extractFunction(admin, 'jobFromDB'), extractFunction(admin, 'jobToDB')].join('\n'), box);
  const stored = box.jobToDB('ready', {
    materialsSent: true,
    instrReminderSent: true,
    classReminderSent: true,
    hostReminderSent: false,
    waitlist: []
  });
  assert.equal(stored.materials_sent, true);
  assert.equal(stored.instr_reminder_sent, true);
  assert.equal(stored.class_reminder_sent, true);
  assert.equal(Object.prototype.hasOwnProperty.call(stored, 'prep_complete'), false);
  const restored = box.jobFromDB(stored);
  sandbox.registrations = [];
  sandbox.jobDataCache = { ready: restored };
  const ready = sess('ready', '2026-11-13');
  assert.equal(sandbox.dashPrepIsComplete(ready), true);
  const undone = box.jobFromDB(box.jobToDB('ready', Object.assign({}, restored, { classReminderSent: false, waitlist: [] })));
  sandbox.jobDataCache.ready = undone;
  assert.equal(sandbox.dashPrepIsComplete(ready), false);
  const split = sandbox.dashPrepPartition([ready]);
  assert.deepEqual(ids(split.active), ['ready']);
  assert.deepEqual(ids(split.complete), []);
});

test('the dashboard tabs are mutually exclusive and keep filters, links, and undo', () => {
  const today = new Date(2026, 10, 6);
  sandbox.dashUpcomingScope = 'all';
  sandbox.dashUpcomingInstructor = 'all';
  sandbox.dashPrepView = 'active';
  sandbox.instructors = [
    { id: 'alex', name: 'Alex Example' },
    { id: 'blake', name: 'Blake Example' }
  ];
  sandbox.registrations = [
    { sessionId: 'open', payStatus: 'paid', studentName: 'Student Example' }
  ];
  sandbox.sessions = [
    sess('open', '2026-11-10', { course: 'Sample North Safe Sitter' }),
    sess('ready', '2026-11-12', { course: 'Sample East Care Ready' }),
    sess('zoom', '2026-11-18', { course: 'Sample Zoom Class', isVirtual: true }),
    sess('far', '2026-12-20', { course: 'Sample Far Class', instructorId: 'blake' }),
    sess('past', '2026-11-01', { course: 'Sample Past Class' }),
    sess('hold', '2026-11-11', { course: 'Sample Hold Class', isHold: true }),
    sess('cancelled', '2026-11-11', { course: 'Sample Cancelled Class', isCancelled: true })
  ];
  sandbox.jobDataCache = {
    open: { materialsSent: true, instrReminderSent: false, classReminderSent: false },
    ready: Object.assign({}, DONE),
    zoom: { instrReminderSent: false, instrFinalRosterSent: false },
    far: Object.assign({}, DONE, { instructorId: 'blake' })
  };
  const snapshot = JSON.stringify(sandbox.sessions);

  let html = paint(today);
  assert.match(html, /Sample North Safe Sitter/);
  assert.match(html, /Sample Zoom Class/);
  assert.match(html, /On Zoom\. No kit to pack\./);
  assert.doesNotMatch(html, /Sample East Care Ready/);
  assert.doesNotMatch(html, /Sample Far Class/);
  assert.doesNotMatch(html, /Sample Past Class/);
  assert.doesNotMatch(html, /Sample Hold Class/);
  assert.doesNotMatch(html, /Sample Cancelled Class/);
  assert.match(html, /role="tablist"/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /id="dash-prep-tab-active"/);
  assert.match(html, /PREP COMPLETE/);
  assert.match(html, /Needs prep <span class="dash-prep-count">2<\/span>/);
  assert.match(html, /PREP COMPLETE <span class="dash-prep-count">2<\/span>/);
  assert.match(html, /data-prep-view="active"/);
  assert.match(html, /2 still need prep\./);
  assert.match(html, /All upcoming/);
  assert.match(html, /Next 2 weeks/);
  assert.match(html, /Print packing list/);
  assert.match(html, /Print checklist/);
  assert.match(html, /toggleMaterialsFromDash\('open'/);
  assert.match(html, /2 in-person sessions in the next 2 weeks/);
  assert.doesNotMatch(html, /admin_private_notes|adminPrivateNotes|payment agreement|access code|PIN/);
  assert.equal(JSON.stringify(sandbox.sessions), snapshot);

  sandbox.dashPrepView = 'complete';
  html = paint(today);
  assert.match(html, /Sample East Care Ready/);
  assert.match(html, /Sample Far Class/);
  assert.match(html, /Prep complete/);
  assert.match(html, /toggleReminderFlag\('ready'/);
  assert.match(html, /toggleMaterialsFromDash\('ready'/);
  assert.doesNotMatch(html, /Sample North Safe Sitter/);
  assert.doesNotMatch(html, /Sample Zoom Class/);
  assert.match(html, /data-prep-view="complete"/);
  assert.match(html, /aria-selected="true"/);
  assert.match(html, /2 with prep complete\./);
  assert.match(html, /Print packing list/);
  assert.match(html, /Print checklist/);

  sandbox.jobDataCache.ready.classReminderSent = false;
  sandbox.dashPrepView = 'active';
  html = paint(today);
  assert.match(html, /Sample East Care Ready/);
  assert.doesNotMatch(html, /Sample Far Class/);
  sandbox.dashPrepView = 'complete';
  html = paint(today);
  assert.doesNotMatch(html, /Sample East Care Ready/);
  assert.match(html, /Sample Far Class/);
  assert.match(html, /1 with prep complete\./);

  sandbox.jobDataCache.ready.classReminderSent = true;
  sandbox.dashPrepView = 'active';
  sandbox.dashUpcomingScope = '14';
  html = paint(today);
  assert.match(html, /Needs prep <span class="dash-prep-count">2<\/span>/);
  assert.match(html, /PREP COMPLETE <span class="dash-prep-count">1<\/span>/);
  assert.doesNotMatch(html, /Sample Far Class/);
  sandbox.dashPrepView = 'complete';
  html = paint(today);
  assert.match(html, /Sample East Care Ready/);
  assert.doesNotMatch(html, /Sample Far Class/);
  assert.doesNotMatch(html, /Sample North Safe Sitter/);

  sandbox.dashUpcomingScope = 'all';
  sandbox.dashUpcomingInstructor = 'id:blake';
  sandbox.dashPrepView = 'active';
  html = paint(today);
  assert.match(html, /No sessions for this instructor still need prep\./);
  assert.match(html, /Needs prep <span class="dash-prep-count">0<\/span>/);
  assert.match(html, /PREP COMPLETE <span class="dash-prep-count">1<\/span>/);
  assert.doesNotMatch(html, /Sample North Safe Sitter/);
  sandbox.dashPrepView = 'complete';
  html = paint(today);
  assert.match(html, /Sample Far Class/);
  assert.doesNotMatch(html, /Sample East Care Ready/);

  sandbox.sessions = [sess('past-only', '2026-10-01', { course: 'Sample Gone Class' })];
  sandbox.dashUpcomingInstructor = 'all';
  sandbox.dashUpcomingScope = 'all';
  sandbox.dashPrepView = 'active';
  html = paint(today);
  assert.match(html, /No upcoming sessions\./);
  assert.match(html, /Needs prep <span class="dash-prep-count">0<\/span>/);
  assert.match(html, /PREP COMPLETE <span class="dash-prep-count">0<\/span>/);
  assert.doesNotMatch(html, /Sample Gone Class/);
  sandbox.dashPrepView = 'complete';
  html = paint(today);
  assert.match(html, /No upcoming sessions\./);
  assert.doesNotMatch(html, /Sample Gone Class/);
});

test('arrow keys move between the prep tabs and other keys do not', () => {
  assert.equal(sandbox.dashPrepViewFromKey('active', 'ArrowRight'), 'complete');
  assert.equal(sandbox.dashPrepViewFromKey('complete', 'ArrowLeft'), 'active');
  assert.equal(sandbox.dashPrepViewFromKey('active', 'ArrowDown'), 'complete');
  assert.equal(sandbox.dashPrepViewFromKey('complete', 'ArrowUp'), 'active');
  assert.equal(sandbox.dashPrepViewFromKey('complete', 'Home'), 'active');
  assert.equal(sandbox.dashPrepViewFromKey('active', 'End'), 'complete');
  assert.equal(sandbox.dashPrepViewFromKey('active', 'Tab'), '');
  assert.equal(sandbox.dashPrepViewFromKey('active', 'Enter'), '');

  sandbox.dashPrepView = 'active';
  sandbox.renderCount = 0;
  focused.id = '';
  let prevented = 0;
  sandbox.onDashPrepTabKey({
    key: 'ArrowRight',
    preventDefault: function () { prevented += 1; }
  });
  assert.equal(sandbox.dashPrepView, 'complete');
  assert.equal(prevented, 1);
  assert.equal(sandbox.renderCount, 1);
  assert.equal(focused.id, 'dash-prep-tab-complete');

  prevented = 0;
  sandbox.onDashPrepTabKey({
    key: 'Tab',
    preventDefault: function () { prevented += 1; }
  });
  assert.equal(prevented, 0);
  assert.equal(sandbox.dashPrepView, 'complete');
});

test('the prep tab is inside the dashboard card and does not add app navigation or a migration', () => {
  const navStart = admin.indexOf('class="nav-items"');
  const navEnd = admin.indexOf('class="sidebar-footer"');
  const nav = admin.slice(navStart, navEnd);
  assert.doesNotMatch(nav, /PREP COMPLETE/);
  assert.doesNotMatch(nav, /dashPrep/);
  const render = extractFunction(admin, 'renderDashUpcoming');
  assert.match(render, /dashPrepPartition\(rows\)/);
  assert.doesNotMatch(render, /isCancelled\s*=/);
  assert.doesNotMatch(render, /isHold\s*=/);
  assert.doesNotMatch(render, /adminPrivateNotes|admin_private_notes|paidFee|instructor_directions|paymentAgreement/);
  assert.doesNotMatch(render, /upsertJobData|sb\.from/);
  assert.match(extractFunction(admin, 'toggleReminderFlag'), /renderDashboard\(\)/);
  assert.match(extractFunction(admin, 'toggleReminderFlag'), /upsertJobData\(sessId\)/);
  assert.match(extractFunction(admin, 'toggleMaterialsFromDash'), /renderDashboard\(\)/);
  assert.match(extractFunction(admin, 'setMaterialsSent'), /upsertJobData\(sessId\)/);
  assert.equal(fs.existsSync(path.join(root, 'migrations', 'prep_complete.sql')), false);
  const screen = admin.slice(admin.indexOf('id="screen-dashboard"'), admin.indexOf('id="screen-requests"'));
  assert.match(screen, /id="reminder-alerts"/);
  assert.match(screen, /id="dash-metrics"/);
  assert.match(screen, /id="dash-upcoming"/);
  assert.match(screen, /id="dash-cash"/);
  assert.doesNotMatch(screen, /PREP COMPLETE/);
});
