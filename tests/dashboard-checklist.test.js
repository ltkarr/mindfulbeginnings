'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const admin = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

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

const sandbox = {
  jobDataCache: {},
  instructors: [],
  registrations: [],
  orgPartners: [],
  Date,
  String,
  Number,
  Math
};
vm.createContext(sandbox);
vm.runInContext(
  [
    'sessionInstructorList',
    'sessionInstructorNames',
    'sessionHostDisplayName',
    'checklistInstructorLabel',
    'checklistHostLabel',
    'preClassTaskList',
    'preClassChecklistDone',
    'dashChecklistSessions'
  ].map((n) => extractFunction(admin, n)).join('\n'),
  sandbox
);

function sess(id, date, flags) {
  return Object.assign({ id, course: 'Safe Sitter®', date, isHold: false, isCancelled: false, hasHost: true, instructorId: 'i1' }, flags);
}

test('a finished pre-class checklist drops off and the next incomplete class fills in', () => {
  const today = new Date(2026, 8, 26);
  sandbox.jobDataCache = {
    done: { materialsSent: true, instrReminderSent: true, hostReminderSent: true, classReminderSent: true },
    soon: { materialsSent: true, instrReminderSent: false, hostReminderSent: true, classReminderSent: true },
    later: { materialsSent: false }
  };
  const rows = [
    sess('done', '2026-09-27'),
    sess('soon', '2026-09-30'),
    sess('later', '2026-10-20'),
    sess('old', '2026-09-01'),
    sess('hold', '2026-09-28', { isHold: true })
  ];
  const shown = sandbox.dashChecklistSessions(rows, today).map((s) => s.id);
  assert.deepEqual(shown, ['soon']);

  sandbox.jobDataCache.soon.classReminderSent = true;
  sandbox.jobDataCache.soon.instrReminderSent = true;
  const backfill = sandbox.dashChecklistSessions(rows, today).map((s) => s.id);
  assert.deepEqual(backfill, ['later']);

  sandbox.jobDataCache.later = { materialsSent: true, instrReminderSent: true, hostReminderSent: true, classReminderSent: true };
  assert.deepEqual(sandbox.dashChecklistSessions(rows, today), []);
});

test('dashboard no longer renders the removed widgets', () => {
  assert.doesNotMatch(admin, /id="needs-regs"/);
  assert.doesNotMatch(admin, /id="upcoming-list"/);
  assert.doesNotMatch(admin, /id="recent-list"/);
  assert.doesNotMatch(admin, /Sessions needing registrations/);
  assert.doesNotMatch(admin, /Recent registrations/);
  assert.match(admin, /id="reminder-alerts"/);
  assert.match(admin, /id="dash-materials"/);
  assert.match(admin, /All caught up — no upcoming class still needs checklist work/);
  assert.match(admin, /dashChecklistSessions\(sessions, now\)\.filter\(function\(s\)\{return !preClassChecklistDone\(s\);\}/);
});

test('a wall of finished green checklists is removed from the dashboard', () => {
  const today = new Date(2026, 8, 26);
  const done = { materialsSent: true, instrReminderSent: true, hostReminderSent: true, classReminderSent: true };
  sandbox.jobDataCache = {
    welcome: done,
    gp: done,
    fri: done,
    sat: done,
    open: { materialsSent: true, instrReminderSent: true, hostReminderSent: true, classReminderSent: false }
  };
  const rows = [
    sess('welcome', '2026-09-27', { course: "Service Unit 60-6 (Nation's Capital Girl Scouts) Welcome Event!", hasHost: false }),
    sess('gp', '2026-09-30', { course: 'Grandparents: Getting Started' }),
    sess('fri', '2026-10-02', { course: 'Safe Sitter®' }),
    sess('sat', '2026-10-03', { course: 'Safe Sitter®' }),
    sess('open', '2026-10-08', { course: 'Campus Ready: Safety Skills for College Life' })
  ];
  const shown = sandbox.dashChecklistSessions(rows, today).map((s) => s.id);
  assert.deepEqual(shown, ['open']);
  rows.filter((s) => s.id !== 'open').forEach((s) => assert.equal(sandbox.preClassChecklistDone(s), true));
  assert.equal(sandbox.preClassChecklistDone(rows[4]), false);
});

test('checklist cards name the instructor and the host, or say when either is missing', () => {
  sandbox.instructors = [
    { id: 'i1', name: 'Jane Doe' },
    { id: 'i2', name: 'Bob Smith' }
  ];
  sandbox.registrations = [];
  sandbox.orgPartners = [];
  sandbox.jobDataCache = { claimed: { instructorId: 'i1' } };

  const assigned = sess('claimed', '2026-10-16', { contactName: 'Dana Rivera', instructorId: null });
  assert.equal(sandbox.checklistInstructorLabel(assigned), 'Jane Doe');
  assert.equal(sandbox.checklistHostLabel(assigned), 'Dana Rivera');

  const owner = sess('owner', '2026-10-16', { ownerTaught: true, instructorId: null, secondInstructorId: 'i2', contactName: '' });
  assert.equal(sandbox.checklistInstructorLabel(owner), 'Lindsay Karr (owner) + Bob Smith');

  const open = sess('open-job', '2026-10-16', { instructorId: null, contactName: '   ', hasHost: true });
  assert.equal(sandbox.checklistInstructorLabel(open), 'No instructor');
  assert.equal(sandbox.checklistHostLabel(open), 'No host');

  sandbox.registrations = [
    { sessionId: 'reg-host', payStatus: 'paid', parentName: 'Not Host', studentName: 'A Student' },
    { sessionId: 'reg-host', payStatus: 'host', parentName: 'Sam Parent', studentName: 'Kid Host' },
    { sessionId: 'other', payStatus: 'host', parentName: 'Other Host', studentName: 'Nope' }
  ];
  const fromReg = sess('reg-host', '2026-10-16', { instructorId: 'i1', contactName: '' });
  assert.equal(sandbox.checklistHostLabel(fromReg), 'Sam Parent');

  sandbox.registrations = [
    { sessionId: 'kid-host', payStatus: 'host', parentName: '', studentName: 'Kid Host' }
  ];
  assert.equal(sandbox.checklistHostLabel(sess('kid-host', '2026-10-16', { contactName: '' })), 'Kid Host');

  sandbox.orgPartners = [{ id: 'org1', name: 'Temple Beth El', contactName: 'Alex Chen' }];
  const fromOrg = sess('org', '2026-10-16', { instructorId: null, contactName: '', hasHost: false, hostedFor: 'org1' });
  assert.equal(sandbox.checklistHostLabel(fromOrg), 'Alex Chen');
  sandbox.orgPartners = [{ id: 'org1', name: 'Temple Beth El', contactName: '' }];
  assert.equal(sandbox.checklistHostLabel(fromOrg), 'Temple Beth El');

  const named = sess('both', '2026-10-16', { contactName: 'Dana Rivera', hostedFor: 'org1' });
  sandbox.registrations = [{ sessionId: 'both', payStatus: 'host', parentName: 'Sam Parent', studentName: 'Kid' }];
  assert.equal(sandbox.sessionHostDisplayName(named), 'Dana Rivera');

  const block = admin.slice(admin.indexOf('// ── Pre-class action reminders'), admin.indexOf('renderOrgBilling();'));
  assert.match(block, /checklistInstructorLabel\(s\)/);
  assert.match(block, /checklistHostLabel\(s\)/);
  assert.match(block, /roleLine\('Instructor',instrLabel,'No instructor'\)/);
  assert.match(block, /roleLine\('Host',hostLabel,'No host'\)/);
  assert.match(block, /escapeHtml\(value\)/);
  assert.match(block, /Send reminder \+ roster to instructor/);
  assert.match(block, /Host reminder — 1 week before/);
  assert.match(block, /Family reminder — before class/);
  assert.match(block, /openInstructorReminder\('\$\{s\.id\}'\)/);
  assert.match(block, /openHostReminder\('\$\{s\.id\}'\)/);
  assert.match(block, /openClassReminder\('\$\{s\.id\}'\)/);
});
