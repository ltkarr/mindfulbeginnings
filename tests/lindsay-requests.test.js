'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'migrations/20261007_girl_scout_and_recurring_expenses.sql'), 'utf8');

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

function loadAdmin(extra) {
  const sandbox = Object.assign({
    COURSES: {
      'Safe Sitter®': { requiresSafeSitter: true, hours: 5 },
      'Girl Scout Badge Class': { requiresRN: true, hours: 1, maxStudents: 15 },
      'Intro to Babysitting': { hours: 1 }
    },
    MAT_NEEDS: { 'Safe Sitter®': { infant: 1 } },
    MAT_BOOKS: {},
    expenses: []
  }, extra || {});
  sandbox.expenseLedger = function(){ return sandbox.expenses || []; };
  vm.runInNewContext(
    [
      extractFn(admin, 'isGirlScoutBadgeCourseName'),
      extractFn(admin, 'sessionRequiresRN'),
      extractFn(admin, 'sessionRequiresSafeSitter'),
      extractFn(admin, 'sessionWhoCanTeach'),
      extractFn(admin, 'matNormTitle'),
      extractFn(admin, 'matAliasCourse'),
      extractFn(admin, 'normalizeExpenseRecurrence'),
      extractFn(admin, 'expenseRecurDate'),
      extractFn(admin, 'expenseRecurHorizon'),
      extractFn(admin, 'expenseOccurrences'),
      extractFn(admin, 'expensePosts'),
      extractFn(admin, 'linkedExpenses')
    ].join('\n'),
    sandbox
  );
  return sandbox;
}

test('Girl Scout Badge Class is its own RN-only type, not Safe Sitter', () => {
  const api = loadAdmin();
  const job = { course: 'Girl Scout Badge Class', requiresRN: true, requiresSS: false };
  assert.equal(api.sessionRequiresRN(job), true);
  assert.equal(api.sessionRequiresSafeSitter(job), false);
  assert.equal(api.sessionWhoCanTeach(job), 'RN instructors only');
  assert.equal(api.sessionWhoCanTeach({ course: 'Safe Sitter®' }), 'Safe Sitter® instructors only');
  assert.equal(api.sessionRequiresRN({ course: 'Intro to Babysitting', requiresRN: true }), true);
  assert.equal(api.matAliasCourse('Girl Scout Badge Class'), '');
  assert.equal(api.matAliasCourse('Girl Scouts — First Aid Badge Workshop'), '');
  assert.equal(api.matAliasCourse('SafeSitter @Norwood'), 'Safe Sitter®');
  assert.match(admin, /'Girl Scout Badge Class':\{price:45,price2027:45,priceNew:45,priceNew2027:45,matCost:0,hours:1,maxStudents:15,requiresRN:true\}/);
  assert.match(admin, /<option>Girl Scout Badge Class<\/option>/);
  assert.match(admin, /id="m-rnonly"/);
  assert.doesNotMatch(admin, /'Girl Scout Badge Class':\{[^}\n]*requiresSafeSitter/);
});

test('Add expense stays at the top of Finances', () => {
  const fin = admin.slice(admin.indexOf('id="screen-finances"'), admin.indexOf('id="screen-instructors"'));
  const addAt = fin.indexOf('id="add-expense-btn"');
  assert.ok(addAt > 0);
  assert.ok(addAt < fin.indexOf('Organization invoices'));
  assert.ok(addAt < fin.indexOf('Overhead expenses'));
  assert.equal((fin.match(/\+ Add expense/g) || []).length, 1);
});

test('a monthly expense counts once in each month until it is stopped', () => {
  const api = loadAdmin();
  const row = {
    id: 'sub',
    amount: 12,
    date: '2026-01-31',
    recurrence: 'monthly',
    recurUntil: '2026-04-15',
    recurActive: true,
    sessionId: null
  };
  assert.equal(JSON.stringify(api.expenseOccurrences(row).map(p => p.date)), JSON.stringify([
    '2026-01-31',
    '2026-02-28',
    '2026-03-31'
  ]));
  const stopped = Object.assign({}, row, { recurActive: false, recurUntil: '2026-02-01' });
  assert.equal(JSON.stringify(api.expenseOccurrences(stopped).map(p => p.date)), JSON.stringify(['2026-01-31']));
  const once = { id: 'once', amount: 40, date: '2026-05-02', recurrence: '', sessionId: 'sess' };
  api.expenses = [once, row];
  assert.equal(api.linkedExpenses('sess').length, 1);
  assert.equal(api.linkedExpenses('sess')[0].id, 'once');
  const yearPosts = api.expensePosts().filter(p => String(p.date).startsWith('2026') && p.id === 'sub');
  assert.equal(yearPosts.length, 3);
  assert.equal(yearPosts.reduce((s, p) => s + p.amount, 0), 36);
});

test('GSFA-270303 keeps its code and is RN-only, not Safe Sitter', () => {
  assert.match(sql, /where code = 'GSFA-270303'/);
  assert.match(sql, /course = 'Girl Scout Badge Class'/);
  assert.match(sql, /requires_rn = true/);
  assert.match(sql, /requires_safe_sitter = false/);
  assert.match(sql, /v_girl_scout/);
  assert.match(sql, /Girl Scout Badge Class/);
  assert.doesNotMatch(sql, /set code =/);
  assert.match(instructor, /girl scouts\?\/i\.test\(c\)&&\/badge\/i\.test\(c\)/);
  assert.match(instructor, /requiresSafeSitter=false/);
  assert.match(register, /id="terms-girl-scout"/);
  assert.match(register, /isGirlScoutBadgeCourse\(s\.course\)/);
  assert.match(register, /It is not a Safe Sitter/);
});
