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

const sandbox = { jobDataCache: {}, Date, String, Number, Math };
vm.createContext(sandbox);
vm.runInContext(
  ['preClassTaskList', 'preClassChecklistDone', 'dashChecklistSessions'].map((n) => extractFunction(admin, n)).join('\n'),
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
