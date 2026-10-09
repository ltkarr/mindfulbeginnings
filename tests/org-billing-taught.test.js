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
  sessions: [],
  invoices: [],
  invoiceLineFor: (s) => ({ sessionId: s.id, amount: s.amount == null ? 150 : s.amount }),
  Date,
  Intl,
  String,
  Number,
  Math,
  Array,
  Object
};
vm.createContext(sandbox);
vm.runInContext(
  [
    'sessionEndDate',
    'fmtYMD',
    'sessionEndMinutes',
    'newYorkClock',
    'sessionEndTimeText',
    'sessionIsComplete',
    'orgSessionsStillToTeach',
    'invoicedSessionIds',
    'uninvoicedOrgGroups'
  ].map((n) => extractFunction(admin, n)).join('\n'),
  sandbox
);

// 8:34 AM and 3:01 PM Eastern on Friday, October 9, 2026 (EDT, UTC-4).
const MORNING = new Date('2026-10-09T12:34:00Z');
const BEFORE_END = new Date('2026-10-09T18:59:00Z');
const AT_END = new Date('2026-10-09T19:00:00Z');
const AFTER_END = new Date('2026-10-09T19:01:00Z');
const NEXT_DAY = new Date('2026-10-10T12:34:00Z');

function troop(overrides) {
  return Object.assign({
    id: 'ss-261009',
    code: 'SS-261009',
    course: 'Safe Sitter®',
    date: '2026-10-09',
    time: '10:00 AM - 3:00 PM',
    billToOrg: 'GS Troop 42086 (Lynne Chandler)',
    isHold: false,
    isCancelled: false,
    amount: 150
  }, overrides);
}

function billableIds(now) {
  return sandbox.uninvoicedOrgGroups(now).flatMap((g) => g.sessions.map((s) => s.id));
}

test('SS-261009 is not billable at 8:34 AM ET on Oct 9, and is after 3:00 PM ET', () => {
  const ny = sandbox.newYorkClock(MORNING);
  assert.equal(ny.ymd, '2026-10-09');
  assert.equal(ny.minutes, 8 * 60 + 34);
  assert.equal(sandbox.sessionEndMinutes('10:00 AM - 3:00 PM'), 15 * 60);

  const today = troop();
  const past = troop({ id: 'ss-261002', code: 'SS-261002', date: '2026-10-02' });
  sandbox.sessions = [today, past];
  sandbox.invoices = [];

  assert.equal(sandbox.sessionIsComplete(today, MORNING), false);
  assert.equal(sandbox.sessionIsComplete(today, BEFORE_END), false);
  assert.equal(sandbox.sessionIsComplete(today, AT_END), true);
  assert.equal(sandbox.sessionIsComplete(today, AFTER_END), true);
  assert.equal(sandbox.sessionIsComplete(past, MORNING), true);

  assert.deepEqual(billableIds(MORNING), ['ss-261002']);
  assert.deepEqual(sandbox.orgSessionsStillToTeach(sandbox.sessions, MORNING).map((s) => s.id), ['ss-261009']);

  assert.deepEqual(billableIds(AFTER_END), ['ss-261009', 'ss-261002']);
  assert.deepEqual(sandbox.orgSessionsStillToTeach(sandbox.sessions, AFTER_END).map((s) => s.id), []);

  const morningGroups = sandbox.uninvoicedOrgGroups(MORNING);
  assert.equal(morningGroups.length, 1);
  assert.equal(morningGroups[0].org, 'GS Troop 42086 (Lynne Chandler)');
  assert.equal(morningGroups[0].total, 150);
  assert.equal(morningGroups[0].sessions[0].id, 'ss-261002');
});

test('an unreadable end time becomes billable the day after the class date', () => {
  const fuzzy = troop({ id: 'fuzzy', time: 'Morning' });
  const shorthand = troop({ id: 'short', time: '1:00-4:00 PM' });
  assert.equal(sandbox.sessionEndMinutes('Morning'), null);
  assert.equal(sandbox.sessionEndMinutes('9:00 AM'), null);
  assert.equal(sandbox.sessionEndMinutes('1:00-4:00 PM'), 16 * 60);
  assert.equal(sandbox.sessionEndMinutes('9:00 a.m. – 3:00 p.m.'), 15 * 60);
  assert.equal(sandbox.sessionEndMinutes('6:30–7:30pm'), 19 * 60 + 30);

  assert.equal(sandbox.sessionIsComplete(fuzzy, MORNING), false);
  assert.equal(sandbox.sessionIsComplete(fuzzy, AFTER_END), false);
  assert.equal(sandbox.sessionIsComplete(fuzzy, NEXT_DAY), true);
  assert.equal(sandbox.sessionIsComplete(shorthand, new Date('2026-10-09T19:59:00Z')), false);
  assert.equal(sandbox.sessionIsComplete(shorthand, new Date('2026-10-09T20:00:00Z')), true);
});

test('a later meeting day uses that day\'s end time, and a cancelled class stays off both lists', () => {
  const twoDay = troop({
    id: 'two-day',
    date: '2026-10-08',
    time: '10:00 AM - 3:00 PM',
    extraDates: ['2026-10-09'],
    extraDays: [{ date: '2026-10-09', time: '1:00-4:00 PM' }]
  });
  assert.equal(sandbox.sessionEndDate(twoDay), '2026-10-09');
  assert.equal(sandbox.sessionEndTimeText(twoDay), '1:00-4:00 PM');
  assert.equal(sandbox.sessionIsComplete(twoDay, AFTER_END), false);
  assert.equal(sandbox.sessionIsComplete(twoDay, new Date('2026-10-09T20:00:00Z')), true);

  const cancelled = troop({ id: 'cancelled', isCancelled: true });
  assert.equal(sandbox.sessionIsComplete(cancelled, MORNING), true);
  sandbox.sessions = [twoDay, cancelled, troop({ id: 'ss-261002', date: '2026-10-02' })];
  sandbox.invoices = [];
  assert.deepEqual(billableIds(MORNING), ['ss-261002']);
  assert.deepEqual(sandbox.orgSessionsStillToTeach(sandbox.sessions, MORNING).map((s) => s.id), ['two-day']);
});
