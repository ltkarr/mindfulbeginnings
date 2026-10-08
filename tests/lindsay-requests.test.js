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
const rnSql = fs.readFileSync(path.join(root, 'migrations/20261008_girl_scout_badge_rn_optional.sql'), 'utf8');

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
      'Girl Scout Badge Class': { hours: 1, maxStudents: 15 },
      'Stay Ready: Choking Rescue and CPR': { hours: 1.5, requiresRN: true },
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

test('Girl Scout badge RN-only is the session checkbox, not the course type', () => {
  const api = loadAdmin();
  const checked = { course: 'Girl Scout Badge Class', requiresRN: true, requiresSS: false };
  const open = { course: 'Girl Scout Badge Class', requiresRN: false, requiresSS: false };
  const workshop = { course: 'Girl Scouts — First Aid Badge Workshop', requiresRN: false, requiresSS: true };
  assert.equal(api.sessionRequiresRN(checked), true);
  assert.equal(api.sessionRequiresRN(open), false);
  assert.equal(api.sessionRequiresRN(workshop), false);
  assert.equal(api.sessionRequiresRN({ course: 'Girl Scouts badge day' }), false);
  assert.equal(api.sessionRequiresSafeSitter(checked), false);
  assert.equal(api.sessionRequiresSafeSitter(workshop), false);
  assert.equal(api.sessionWhoCanTeach(checked), 'RN instructors only');
  assert.equal(api.sessionWhoCanTeach(open), 'Any instructor');
  assert.equal(api.sessionWhoCanTeach({ course: 'Stay Ready: Choking Rescue and CPR' }), 'RN instructors only');
  assert.equal(api.sessionWhoCanTeach({ course: 'Safe Sitter®' }), 'Safe Sitter® instructors only');
  assert.equal(api.sessionRequiresRN({ course: 'Intro to Babysitting', requiresRN: true }), true);
  assert.equal(api.matAliasCourse('Girl Scout Badge Class'), '');
  assert.equal(api.matAliasCourse('Girl Scouts — First Aid Badge Workshop'), '');
  assert.equal(api.matAliasCourse('SafeSitter @Norwood'), 'Safe Sitter®');
  assert.match(admin, /'Girl Scout Badge Class':\{price:45,price2027:45,priceNew:45,priceNew2027:45,matCost:0,hours:1,maxStudents:15\}/);
  assert.doesNotMatch(admin, /'Girl Scout Badge Class':\{[^}\n]*requiresRN/);
  assert.doesNotMatch(admin, /'Girl Scouts — First Aid Badge Workshop':\{[^}\n]*requiresRN/);
  assert.match(admin, /<option>Girl Scout Badge Class<\/option>/);
  assert.match(admin, /id="m-rnonly"/);
  assert.doesNotMatch(admin, /'Girl Scout Badge Class':\{[^}\n]*requiresSafeSitter/);
  const addForm = extractFn(admin, 'openAddSession');
  assert.match(addForm, /id="m-rnonly"/);
  assert.doesNotMatch(addForm, /id="m-rnonly"[^>]*checked/);
  assert.doesNotMatch(extractFn(admin, 'sessionRequiresRN'), /girl scout/i);
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

test('GSFA-270303 keeps its code and is not Safe Sitter', () => {
  assert.match(sql, /where code = 'GSFA-270303'/);
  assert.match(sql, /course = 'Girl Scout Badge Class'/);
  assert.match(sql, /requires_rn = true/);
  assert.match(sql, /requires_safe_sitter = false/);
  assert.doesNotMatch(sql, /set code =/);
  const rnBody = rnSql.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
  assert.doesNotMatch(rnBody, /requires_rn\s*=/);
  assert.doesNotMatch(rnBody, /set course/i);
  assert.match(rnBody, /set instructor_id = v_id/);
  assert.match(instructor, /girl scouts\?\/i\.test\(c\)&&\/badge\/i\.test\(c\)/);
  assert.match(instructor, /requiresRN=false/);
  assert.match(instructor, /requiresSafeSitter=false/);
  assert.match(register, /id="terms-girl-scout"/);
  assert.match(register, /isGirlScoutBadgeCourse\(s\.course\)/);
  assert.match(register, /It is not a Safe Sitter/);
});

function rnGate(src) {
  const start = src.indexOf('if v_requires_rn');
  assert.ok(start >= 0);
  const end = src.indexOf('end if;', start);
  return src.slice(start, end);
}

test('claiming a Girl Scout badge job follows requires_rn, not the course name', () => {
  const gate = rnGate(rnSql);
  assert.match(gate, /v_requires_rn/);
  assert.match(gate, /Stay Ready: Choking Rescue and CPR/);
  assert.match(gate, /Campus Ready: Safety Skills for College Life/);
  assert.match(gate, /Ready\. Period\./);
  assert.match(gate, /Season Ready/);
  assert.doesNotMatch(gate, /v_girl_scout/);
  assert.doesNotMatch(gate, /Girl Scout/);
  assert.doesNotMatch(gate, /first aid/i);
  assert.match(rnSql, /if not v_girl_scout/);
  assert.doesNotMatch(extractFn(instructor, 'sessionRequiresRN'), /girl scout/i);
  const patchStart = instructor.indexOf('Object.keys(COURSES).forEach(c=>{');
  const patchEnd = instructor.indexOf('});', patchStart);
  const patch = instructor.slice(patchStart, patchEnd);
  assert.match(patch, /if\(!girlScoutBadge&&\/stay ready\|campus ready\|ready\\\. \?period\|season ready\|first aid\/i\.test\(c\)\)/);
  const gsBlock = patch.slice(patch.indexOf('if(girlScoutBadge){'));
  assert.match(gsBlock, /requiresRN=false/);
  assert.doesNotMatch(gsBlock, /requiresRN=true/);
});

test('an unchecked Girl Scout badge job is open to a non-RN, and a checked one is not', () => {
  const patchStart = instructor.indexOf('Object.keys(COURSES).forEach(c=>{');
  const patchEnd = instructor.indexOf('});', patchStart) + 3;
  const sandbox = {
    COURSES: {
      'Girl Scout Badge Class': { hours: 1, maxStudents: 15, requiresRN: true },
      'Girl Scouts — First Aid Badge Workshop': { hours: 1, maxStudents: 15, requiresRN: true },
      'Stay Ready: Choking Rescue and CPR': { hours: 1.5 },
      'Community First Aid': { hours: 1 },
      'Safe Sitter®': { hours: 5 }
    },
    me: { isRN: false, safeSitterCertified: true, safeSitterTrainingDate: '2024-01-01' },
    RN_RESTRICTION_KNOWN: true
  };
  vm.runInNewContext(
    [
      instructor.slice(patchStart, patchEnd),
      extractFn(instructor, 'isSafeSitterCertified'),
      extractFn(instructor, 'canTeach'),
      extractFn(instructor, 'sessionRequiresRN'),
      extractFn(instructor, 'sessionRequiresSafeSitter'),
      extractFn(instructor, 'canTeachSession')
    ].join('\n'),
    sandbox
  );
  assert.equal(sandbox.COURSES['Girl Scout Badge Class'].requiresRN, false);
  assert.equal(sandbox.COURSES['Girl Scouts — First Aid Badge Workshop'].requiresRN, false);
  assert.equal(sandbox.COURSES['Girl Scout Badge Class'].requiresSafeSitter, false);
  assert.equal(sandbox.COURSES['Stay Ready: Choking Rescue and CPR'].requiresRN, true);
  assert.equal(sandbox.COURSES['Community First Aid'].requiresRN, true);
  const openBadge = { course: 'Girl Scout Badge Class', requiresRN: false, requiresSS: false, isCustomJob: false };
  const checkedBadge = { course: 'Girl Scout Badge Class', requiresRN: true, requiresSS: false, isCustomJob: false };
  const openWorkshop = { course: 'Girl Scouts — First Aid Badge Workshop', requiresRN: false, requiresSS: false, isCustomJob: false };
  assert.equal(sandbox.canTeachSession(openBadge), true);
  assert.equal(sandbox.canTeachSession(openWorkshop), true);
  assert.equal(sandbox.canTeachSession(checkedBadge), false);
  assert.equal(sandbox.canTeachSession({ course: 'Stay Ready: Choking Rescue and CPR', requiresRN: false, isCustomJob: false }), false);
  assert.equal(sandbox.canTeach('Community First Aid'), false);
  sandbox.me.isRN = true;
  assert.equal(sandbox.canTeachSession(checkedBadge), true);
  assert.equal(sandbox.canTeachSession({ course: 'Stay Ready: Choking Rescue and CPR', isCustomJob: false }), true);
});

test('the Girl Scout RN checkbox stays changeable', () => {
  const rnBox = { checked: false, disabled: false };
  const note = { style: { display: '' }, innerHTML: '' };
  const sel = { value: 'Girl Scout Badge Class' };
  const ids = { 'm-rnonly': rnBox, 'm-rn-notice': note, 'm-course': sel };
  const box = {
    COURSES: {
      'Girl Scout Badge Class': { hours: 1, maxStudents: 15 },
      'Stay Ready: Choking Rescue and CPR': { hours: 1.5, requiresRN: true }
    },
    document: { getElementById(id) { return ids[id] || null; } }
  };
  vm.runInNewContext(
    [extractFn(admin, 'isGirlScoutBadgeCourseName'), extractFn(admin, 'updateRnNotice')].join('\n'),
    box
  );
  box.updateRnNotice();
  assert.equal(rnBox.checked, false);
  assert.equal(rnBox.disabled, false);
  rnBox.checked = true;
  box.updateRnNotice();
  assert.equal(rnBox.checked, true);
  assert.equal(rnBox.disabled, false);
  assert.equal(note.style.display, 'block');
  sel.value = 'Stay Ready: Choking Rescue and CPR';
  rnBox.checked = false;
  box.updateRnNotice();
  assert.equal(rnBox.checked, true);
  assert.equal(rnBox.disabled, true);
});

test('saving or editing an expense does not open a session', () => {
  const fields = {
    'm-edesc': { value: 'Cursor Monthly' },
    'm-eamt': { value: '20' },
    'm-edate': { value: '2026-10-01' },
    'm-ecat': { value: 'Software' },
    'm-erecur': { value: 'monthly' },
    'm-euntil': { value: '' }
  };
  const sandbox = {
    expenses: [],
    sessions: [{ id: 'gsfa', code: 'GSFA-270303', course: 'Girl Scout Badge Class', isCustomJob: false, date: '2027-03-03', time: '5:00–6:30 PM' }],
    _costSessionId: 'gsfa',
    opened: [],
    modalClosed: false,
    document: { getElementById(id) { return fields[id] || { value: '' }; } },
    sid() { return 'exp-new'; },
    readExpensePay() { return ''; },
    readExpenseSession() { return null; },
    closeModal() { sandbox.modalClosed = true; },
    renderExpenses() {},
    renderDashboard() {},
    renderFinances() {},
    renderSessions() {},
    openLinkedSession(id) { sandbox.opened.push(id); },
    openEditSession(id) { sandbox.opened.push(id); },
    writeExpenseRow() { return Promise.resolve(true); },
    Date
  };
  vm.runInNewContext(
    [
      extractFn(admin, 'normalizeExpenseRecurrence'),
      extractFn(admin, 'finishExpenseEdit'),
      extractFn(admin, 'saveExpense'),
      extractFn(admin, 'updateExpense')
    ].join('\n'),
    sandbox
  );
  assert.doesNotMatch(extractFn(admin, 'finishExpenseEdit'), /openLinkedSession|openEditSession/);
  assert.doesNotMatch(extractFn(admin, 'openAddExpense'), /_expenseReturnSession|_costSessionId/);
  assert.doesNotMatch(extractFn(admin, 'openEditExpense'), /_expenseReturnSession|_costSessionId/);
  sandbox.saveExpense();
  assert.deepEqual(sandbox.opened, []);
  assert.equal(sandbox.modalClosed, true);
  assert.equal(sandbox.expenses.length, 1);
  assert.equal(sandbox.expenses[0].recurrence, 'monthly');
  assert.equal(sandbox.expenses[0].description, 'Cursor Monthly');
  sandbox.modalClosed = false;
  sandbox.finishExpenseEdit('gsfa');
  assert.deepEqual(sandbox.opened, []);
  sandbox.expenses = [{
    id: 'e1',
    description: 'Cursor Yearly',
    amount: 240,
    date: '2026-01-01',
    category: 'Software',
    paymentMethod: '',
    sessionId: null,
    recurrence: 'yearly',
    recurUntil: '',
    recurActive: true
  }];
  fields['m-edesc'].value = 'Cursor Yearly';
  fields['m-eamt'].value = '240';
  fields['m-erecur'].value = 'yearly';
  sandbox.modalClosed = false;
  sandbox.updateExpense('e1');
  assert.deepEqual(sandbox.opened, []);
  assert.equal(sandbox.modalClosed, true);
  assert.equal(sandbox.expenses[0].recurrence, 'yearly');
  assert.equal(sandbox._costSessionId, 'gsfa');
});
