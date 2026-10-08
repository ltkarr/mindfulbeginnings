'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');

function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed function ' + name);
}

function load(names, extra) {
  const sandbox = Object.assign({
    escapeHtml: function (s) { return String(s == null ? '' : s); },
    matToday: function () { return '2026-10-08'; },
    coNoEquipment: function () { return false; },
    coUsesExisting: function () { return false; },
    sessions: [],
    equipment: []
  }, extra || {});
  vm.runInNewContext(names.map(function (name) { return extractFn(admin, name); }).join('\n'), sandbox);
  return sandbox;
}

test('job_data is not ordered by id, so load does not 400', () => {
  const fn = extractFn(admin, 'fetchAll');
  assert.match(fn, /table==='job_data'\?'session_id':'id'/);
  assert.match(fn, /q\.order\(stableOrder/);
  assert.doesNotMatch(fn, /order\('id'/);
});

test('a cancelled session is not an overdue equipment alert', () => {
  const api = load(['coSessionCancelled', 'coReservationNeverLeft', 'coIsOverdue', 'matCheckoutStatusLabel']);
  const cancelled = { id: 'ss', isCancelled: true, cancelledAt: '2026-08-31T12:31:03.116Z' };
  api.sessions = [cancelled];
  const reserved = {
    id: 'co',
    sessionId: 'ss',
    returnedDate: null,
    dueDate: '2026-09-23',
    outDate: '2026-09-07',
    notes: 'Reserved when the session was saved'
  };
  assert.equal(api.coIsOverdue(reserved), false);
  assert.equal(api.coReservationNeverLeft(reserved), true);
  assert.equal(api.matCheckoutStatusLabel(reserved, '2026-10-08'), 'Released — session cancelled');
  const out = Object.assign({}, reserved, { outDate: '2026-08-01', person: 'Ada' });
  assert.equal(api.coIsOverdue(out), false);
  assert.equal(api.matCheckoutStatusLabel(out, '2026-10-08'), 'Needs return — session cancelled');
  api.sessions = [{ id: 'live', isCancelled: false }];
  const live = Object.assign({}, reserved, { sessionId: 'live' });
  assert.equal(api.coIsOverdue(live), true);
  assert.equal(api.matCheckoutStatusLabel(live, '2026-10-08'), 'Overdue');
  assert.doesNotMatch(extractFn(admin, 'releaseEquipmentForCancelledSession'), /\.delete\(/);
  assert.match(extractFn(admin, 'releaseEquipmentForCancelledSession'), /returned_date/);
});

test('consumables warn when reserved is greater than on hand', () => {
  const api = load(['matConsumableShortages'], {
    equipment: [{ id: 'h', name: 'Safe@Home handbooks', qty: 102 }],
    matEqIsConsumable: function () { return true; },
    matPhysicallyOut: function () { return 0; },
    matReservedAhead: function () { return 104; }
  });
  const short = api.matConsumableShortages();
  assert.equal(short.length, 1);
  assert.equal(short[0].reserved, 104);
  assert.equal(short[0].onHand, 102);
  assert.equal(short[0].short, 2);
  assert.match(admin, /Low stock — more reserved than on hand/);
  api.matReservedAhead = function () { return 10; };
  assert.equal(api.matConsumableShortages().length, 0);
});

test('handbook need follows registered students and shows capacity as if full', () => {
  const api = load(['sessionHeadcount', 'sessionFullHeadcount', 'dashMatBookPhrase'], {
    seatsOnSession: function () { return 0; },
    sessionMaxStudents: function () { return 16; }
  });
  const session = { id: 'oct16', course: 'Safe Sitter®' };
  assert.equal(api.sessionHeadcount(session), 0);
  assert.equal(api.sessionFullHeadcount(session), 16);
  assert.equal(api.sessionHeadcount(session, 4), 4);
  const phrase = api.dashMatBookPhrase({ ssHandbook: 4, ssNotebook: 4 }, 16);
  assert.match(phrase, /4 handbooks/);
  assert.match(phrase, /4 notebooks/);
  assert.match(phrase, /16 if the class fills/);
  assert.match(admin, /if the class fills/);
  assert.doesNotMatch(extractFn(admin, 'sessionHeadcount'), /sessionMaxStudents/);
});

test('SFF-261011 keeps Oct 11 and the Oct 18 rain date visible', () => {
  const api = load(['sessionRainDate', 'sessionDateRainHtml']);
  const moved = { code: 'SFF-261011', date: '2026-10-18' };
  const rain = api.sessionRainDate(moved);
  assert.equal(rain.event, '2026-10-11');
  assert.equal(rain.rain, '2026-10-18');
  const onRain = api.sessionDateRainHtml(moved);
  assert.match(onRain, /Rain date/);
  assert.match(onRain, /Oct 11/);
  const onEvent = api.sessionDateRainHtml({ code: 'SFF-261011', date: '2026-10-11' });
  assert.match(onEvent, /Rain date/);
  assert.match(onEvent, /Oct 18/);
  assert.match(extractFn(admin, 'sessionAboutWhenText'), /sessionRainDate/);
  assert.match(admin, /sessionDateRainHtml\(s\)/);
});

test('the session Manage menu is a button with keyboard and screen-reader state', () => {
  assert.match(admin, /aria-haspopup="menu"/);
  assert.match(admin, /aria-expanded="false"/);
  assert.match(admin, /aria-expanded','true'/);
  assert.match(admin, /setAttribute\('role','menu'\)/);
  assert.match(admin, /role="menuitem"/);
  const keys = extractFn(admin, '_sessionMenuKey');
  assert.match(keys, /Escape/);
  assert.match(keys, /ArrowDown/);
  assert.match(keys, /ArrowUp/);
  assert.match(keys, /Home/);
  assert.match(keys, /End/);
  assert.match(extractFn(admin, 'closeSessionMenu'), /\.focus\(\)/);
  assert.match(extractFn(admin, 'openSessionMenu'), /first\.focus\(\)/);
});

test('dashboard money and registration labels say which period and which rows', () => {
  assert.match(admin, /Revenue this month/);
  assert.match(admin, /Booked for classes dated in \$\{monthName\} \$\{y\}/);
  assert.match(admin, /Collected in \$\{y\}/);
  assert.match(admin, /Expected in \$\{y\}/);
  assert.match(admin, /will not add up to the month/);
  assert.match(admin, /Host seats, waitlist, and cancelled are not included/);
  assert.match(admin, /Includes host seats\. Waitlist and cancelled are not included/);
  assert.doesNotMatch(admin, /Hired \(unassigned\)/);
  assert.match(admin, /Hired - not yet assigned to a job/);
});

test('the finances table scrolls sideways and Repeat until is off for one-time expenses', () => {
  assert.match(admin, /#fin-table\{width:max-content;min-width:100%\}/);
  assert.match(admin, /\.tbl-wrap\{overflow-x:auto/);
  assert.match(admin, /max-width:calc\(100vw - var\(--sidebar-w\)\)/);
  const sync = extractFn(admin, 'syncExpenseRepeatUntil');
  assert.match(sync, /wrap\.hidden=one/);
  assert.match(sync, /input\.disabled=one/);
  assert.match(sync, /if\(one\)input\.value=''/);
  assert.match(admin, /id="m-euntil-wrap"/);
  assert.match(extractFn(admin, 'updateExpense'), /e\.recurUntil=e\.recurrence\?/);
});

test('earlier layout locks still hold', () => {
  const fin = admin.slice(admin.indexOf('id="screen-finances"'), admin.indexOf('id="screen-instructors"'));
  const addAt = fin.indexOf('id="add-expense-btn"');
  assert.ok(addAt > 0 && addAt < fin.indexOf('id="fin-table"'));
  assert.match(admin, /\['weekly','Weekly'\],\['monthly','Monthly'\],\['yearly','Yearly'\]/);
  assert.match(admin, /id="m-rnonly"/);
  assert.match(admin, /id="cj-rnonly"/);
  assert.doesNotMatch(admin, /id="cj-rnonly"[^>]*disabled/);
  assert.match(admin, /<option>Girl Scout Badge Class<\/option>/);
  assert.doesNotMatch(extractFn(admin, 'finishExpenseEdit'), /openLinkedSession|openEditSession/);
  const grades = {};
  vm.runInNewContext(
    [extractFn(register, 'isGirlScoutBadgeCourse'), extractFn(register, 'registrationGradeOptions')].join('\n'),
    grades
  );
  const html = grades.registrationGradeOptions('Girl Scout Badge Class');
  assert.match(html, /Kindergarten/);
  assert.match(html, /8th grade/);
  assert.equal(html.includes('9th grade'), false);
});
