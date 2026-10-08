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

function checkbox(fnSrc, id) {
  const at = fnSrc.indexOf('id="' + id + '"');
  assert.ok(at >= 0, 'missing ' + id);
  return fnSrc.slice(fnSrc.lastIndexOf('<input', at), fnSrc.indexOf('>', at) + 1);
}

test('Add expense stays at the top of Finances', () => {
  const fin = admin.slice(admin.indexOf('id="screen-finances"'), admin.indexOf('id="screen-instructors"'));
  const headerStart = fin.indexOf('class="page-header"');
  const titleAt = fin.indexOf('class="page-title">Finances');
  const addAt = fin.indexOf('id="add-expense-btn"');
  const headerClose = fin.indexOf('</div>', addAt);
  assert.ok(headerStart >= 0 && headerStart < titleAt && titleAt < addAt && addAt < headerClose);
  assert.ok(addAt < fin.indexOf('id="fin-table"'));
  assert.ok(addAt < fin.indexOf('>Organization invoices<'));
});

test('expenses can repeat weekly, monthly, or yearly', () => {
  assert.match(admin, /const EXP_RECUR_OPTS=\[\['','One time'\],\['weekly','Weekly'\],\['monthly','Monthly'\],\['yearly','Yearly'\]\]/);
});

test('RN-only is a changeable checkbox on standard and custom jobs', () => {
  const addStandard = checkbox(extractFn(admin, 'openAddSession'), 'm-rnonly');
  const editStandard = checkbox(extractFn(admin, 'openEditSession'), 'm-rnonly');
  const addCustom = checkbox(extractFn(admin, 'openAddCustomJob'), 'cj-rnonly');
  const editCustom = checkbox(extractFn(admin, 'openEditCustomJob'), 'cj-rnonly');
  for (const box of [addStandard, editStandard, addCustom, editCustom]) {
    assert.doesNotMatch(box, /disabled/);
  }
  assert.doesNotMatch(addStandard, /checked/);
  assert.doesNotMatch(addCustom, /checked/);
  assert.match(editStandard, /s\.requiresRN\?'checked':''/);
  assert.match(editCustom, /s\.requiresRN\?'checked':''/);
});

test('Girl Scout Badge Class is a course option with grades K through 8', () => {
  assert.match(admin, /<option>Girl Scout Badge Class<\/option>/);
  assert.match(extractFn(admin, 'openAddSession'), /<option>Girl Scout Badge Class<\/option>/);
  const sandbox = {};
  vm.runInNewContext(
    [extractFn(register, 'isGirlScoutBadgeCourse'), extractFn(register, 'registrationGradeOptions')].join('\n'),
    sandbox
  );
  const html = sandbox.registrationGradeOptions('Girl Scout Badge Class');
  assert.match(html, /Kindergarten/);
  assert.match(html, /8th grade/);
  assert.equal(html.includes('9th grade'), false);
});

test('saving an expense never opens a session modal', () => {
  for (const name of ['finishExpenseEdit', 'saveExpense', 'updateExpense']) {
    assert.doesNotMatch(extractFn(admin, name), /openLinkedSession|openEditSession|openEditCustomJob|openAddSession/);
  }
  assert.match(extractFn(admin, 'closeModal'), /_costSessionId=null/);
});
