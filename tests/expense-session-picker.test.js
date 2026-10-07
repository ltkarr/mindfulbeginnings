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

const names = [
  'sessionEndDate',
  'expenseSessionPickerLabel',
  'expenseSessionPickerMatches',
  'expenseSessionOnOrAfterToday',
  'expenseSessionPickerRows',
  'fmtYMD',
  'readExpenseSession'
];

const sandbox = { Date, String, Array };
vm.createContext(sandbox);
vm.runInContext(names.map((n) => extractFunction(admin, n)).join('\n'), sandbox);

const TODAY = '2026-10-07';

function sess(partial) {
  return Object.assign({
    id: partial.code || 'x',
    code: '',
    date: '',
    course: '',
    location: '',
    city: '',
    isCancelled: false,
    isHold: false
  }, partial);
}

const rows = [
  sess({ id: 'past-1', code: 'SS-260815', date: '2026-08-15', course: 'Safe Sitter', location: 'Bethesda' }),
  sess({ id: 'past-2', code: 'SAH-260920', date: '2026-09-20', course: 'Safe@Home', location: 'Rockville' }),
  sess({ id: 'cancel-past', code: 'GP-260901', date: '2026-09-01', course: 'Grandparents: Getting Started', location: 'Potomac', isCancelled: true }),
  sess({ id: 'cancel-future', code: 'IB-261010', date: '2026-10-10', course: 'Intro to Babysitting', location: 'Virtual', isCancelled: true }),
  sess({ id: 'today', code: 'BR-261007', date: '2026-10-07', course: 'Baby Ready', location: 'Silver Spring' }),
  sess({ id: 'guc', code: 'GUC-261107', date: '2026-11-07', course: 'Glenmont UMC Craft Fair', location: 'Glenmont' }),
  sess({ id: 'sah', code: 'SAH-261115', date: '2026-11-15', course: 'Safe@Home', location: 'Bethesda' }),
  sess({ id: 'rp', code: 'RP-261115', date: '2026-11-15', course: 'Ready. Period.', location: 'Virtual' }),
  sess({ id: 'rua', code: 'RUA-261121', date: '2026-11-21', course: 'Represent us at Darnestown Presbyterian Church', location: 'Darnestown' }),
  sess({ id: 'dec', code: 'SS-261220', date: '2026-12-20', course: 'Safe Sitter', location: 'Potomac' }),
  sess({ id: 'jan', code: 'SS-270110', date: '2027-01-10', course: 'Safe Sitter', location: 'Bethesda' }),
  sess({ id: 'feb', code: 'AKW-270214', date: '2027-02-14', course: 'All Kids Welcome', location: 'Olney' }),
  sess({ id: 'mar', code: 'SR-270321', date: '2027-03-21', course: 'Stay Ready', location: 'Virtual' }),
  sess({ id: 'apr', code: 'CRE-270418', date: '2027-04-18', course: 'Care Ready', location: 'Rockville' }),
  sess({ id: 'hold', code: 'MF-HOLD', date: '', course: 'Mindful Families club', location: 'Greenbelt', isHold: true, holdTerm: 'Fall 2026' }),
  sess({
    id: 'recur',
    code: 'CLUB-1',
    date: '2026-09-01',
    course: 'After school club',
    location: 'School',
    isRecurring: true,
    recurEndDate: '2026-12-01'
  })
];

function ids(list, opts) {
  return sandbox.expenseSessionPickerRows(list, Object.assign({ today: TODAY }, opts)).map((s) => s.id);
}

test('picker labels use middle dots and keep a long course name intact', () => {
  const label = sandbox.expenseSessionPickerLabel(rows.find((s) => s.id === 'rua'));
  assert.equal(
    label,
    'RUA-261121 · Nov 21, 2026 · Represent us at Darnestown Presbyterian Church · Darnestown'
  );
  assert.equal(label.indexOf('\u2014'), -1);
  assert.equal(label.indexOf('—'), -1);

  const cancelled = sandbox.expenseSessionPickerLabel(rows.find((s) => s.id === 'cancel-future'));
  assert.match(cancelled, / · Cancelled$/);
  assert.equal(cancelled.indexOf('—'), -1);

  const hold = sandbox.expenseSessionPickerLabel(rows.find((s) => s.id === 'hold'));
  assert.equal(hold, 'MF-HOLD · Fall 2026 · Mindful Families club · Greenbelt · On hold');
});

test('an empty search lists only upcoming sessions, soonest first, and skips cancelled', () => {
  const picked = ids(rows, { query: '', includePast: false, limit: 20 });
  assert.deepEqual(picked, ['today', 'recur', 'guc', 'rp', 'sah', 'rua', 'dec', 'jan', 'feb', 'mar', 'apr']);
  assert.ok(!picked.includes('past-1'));
  assert.ok(!picked.includes('past-2'));
  assert.ok(!picked.includes('cancel-future'));
  assert.ok(!picked.includes('cancel-past'));
  assert.ok(!picked.includes('hold'));
});

test('the empty list is short: the next eight sessions', () => {
  const picked = ids(rows, { query: '' });
  assert.equal(picked.length, 8);
  assert.equal(picked[0], 'today');
  assert.equal(picked[1], 'recur');
});

test('past and cancelled sessions appear when Include past is on and she is searching', () => {
  const safe = ids(rows, { query: 'safe', includePast: false, limit: 20 });
  assert.deepEqual(safe, ['sah', 'dec', 'jan']);

  const safePast = ids(rows, { query: 'safe', includePast: true, limit: 20 });
  assert.deepEqual(safePast, ['sah', 'dec', 'jan', 'past-2', 'past-1']);

  const intro = ids(rows, { query: 'Intro', includePast: false });
  assert.deepEqual(intro, []);
  const introPast = ids(rows, { query: 'Intro', includePast: true });
  assert.deepEqual(introPast, ['cancel-future']);

  const grandparents = ids(rows, { query: 'Grandparents', includePast: true });
  assert.deepEqual(grandparents, ['cancel-past']);
});

test('checking Include past does not replace the empty upcoming list with the archive', () => {
  const picked = ids(rows, { query: '', includePast: true });
  assert.equal(picked.length, 8);
  assert.equal(picked[0], 'today');
  assert.ok(!picked.includes('past-1'));
});

test('a saved link to a past or cancelled session still matches a search for it', () => {
  assert.deepEqual(ids(rows, { query: '', selected: 'past-2' }).includes('past-2'), false);
  assert.deepEqual(ids(rows, { query: 'SAH-260920', selected: 'past-2', includePast: false }), ['past-2']);
  assert.deepEqual(ids(rows, { query: 'Babysitting', selected: 'cancel-future', includePast: false }), ['cancel-future']);
  assert.deepEqual(ids(rows, { query: 'Rockville', includePast: false }), ['apr']);
  assert.deepEqual(ids(rows, { query: 'Rockville', selected: 'past-2', includePast: false }), ['apr', 'past-2']);
});

test('search matches code, formatted date, course, and location', () => {
  assert.deepEqual(ids(rows, { query: 'RUA-261121' }), ['rua']);
  assert.deepEqual(ids(rows, { query: 'Nov 21' }), ['rua']);
  assert.deepEqual(ids(rows, { query: 'darnestown' }), ['rua']);
  assert.deepEqual(ids(rows, { query: 'Ready. Period.' }), ['rp']);
  assert.deepEqual(ids(rows, { query: 'Fall 2026', includePast: true }), ['hold']);
  assert.deepEqual(ids(rows, { query: 'Fall 2026', includePast: false }), []);
});

test('new picker copy does not add an em dash, and the expense form uses the combobox', () => {
  const start = admin.indexOf('// Session link on an expense.');
  const end = admin.indexOf('function readExpenseSession()');
  const src = admin.slice(start, end);
  assert.ok(start > 0);
  assert.equal(src.indexOf('—'), -1);
  assert.equal(src.indexOf('\u2014'), -1);
  assert.match(src, /Include past sessions/);
  assert.match(src, /Unlink session/);
  assert.match(src, /No matching sessions/);
  assert.match(src, /role="combobox"/);

  const cssStart = admin.indexOf('.sess-pick-head{');
  const cssEnd = admin.indexOf('.modal-bg{');
  const css = admin.slice(cssStart, cssEnd);
  assert.equal(css.indexOf('—'), -1);
  assert.match(css, /text-overflow:ellipsis/);

  const form = admin.slice(admin.indexOf('function expenseFormHtml'), admin.indexOf('function openAddExpense'));
  assert.match(form, /expenseSessionPickerHtml\(/);
  assert.match(form, /id="m-epay"/);
  assert.match(form, /Instructor pay is tracked on each session/);
  assert.doesNotMatch(form, /size="6"/);
  assert.doesNotMatch(form, /filterExpenseSessions/);
  assert.doesNotMatch(admin, /function filterExpenseSessions/);
  assert.doesNotMatch(admin, /function expenseSessionOptions/);

  const save = admin.slice(admin.indexOf('async function saveExpense'), admin.indexOf('function openEditExpense'));
  const update = admin.slice(admin.indexOf('async function updateExpense'), admin.indexOf('// Insert or update one expense'));
  assert.match(save, /sessionId:readExpenseSession\(\)/);
  assert.match(update, /e\.sessionId=readExpenseSession\(\)/);
  assert.match(admin, /session_id:e\.sessionId\|\|null/);

  const filter = admin.slice(admin.indexOf('function renderExpenses'), admin.indexOf('function expenseFormHtml'));
  assert.match(filter, /expenseSessionChoices\(\)/);
  assert.match(filter, /sessionChoiceLabel\(s\)/);
});
