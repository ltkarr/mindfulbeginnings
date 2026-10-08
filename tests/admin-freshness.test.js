'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const vercel = fs.readFileSync(path.join(root, 'vercel.json'), 'utf8');
const buildFile = fs.readFileSync(path.join(root, 'admin-build.txt'), 'utf8').trim();

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

test('admin HTML and its scripts are not cached by the browser or the Vercel CDN', () => {
  const cfg = JSON.parse(vercel);
  const headers = cfg.headers || [];
  function rule(source) {
    const hit = headers.find((h) => h.source === source);
    assert.ok(hit, 'vercel.json is missing a cache rule for ' + source);
    const map = {};
    hit.headers.forEach((h) => { map[h.key] = h.value; });
    return map;
  }
  for (const source of ['/(.*)\\.html', '/admin-build.txt', '/js/(.*)']) {
    const map = rule(source);
    assert.match(map['Cache-Control'] || '', /no-store/, source + ' Cache-Control must be no-store');
    assert.match(map['Cache-Control'] || '', /max-age=0/, source + ' Cache-Control must be max-age=0');
    assert.equal(map['Vercel-CDN-Cache-Control'], 'no-store', source + ' must set Vercel-CDN-Cache-Control: no-store');
    assert.equal(map['CDN-Cache-Control'], 'no-store', source + ' must set CDN-Cache-Control: no-store');
  }
});

test('an open admin tab can see when a new admin.html is deployed', () => {
  const m = admin.match(/window\.MB_ADMIN_BUILD='([^']+)'/);
  assert.ok(m, 'admin.html is missing window.MB_ADMIN_BUILD');
  assert.equal(m[1], buildFile, 'admin.html build id and admin-build.txt drifted apart');
  assert.match(admin, /fetch\('\/admin-build\.txt\?mb='/);
  assert.match(admin, /location\.reload\(\)/);
  assert.match(admin, /modal-root/);
});

test('closing a form forgets the last session, and a Yearly expense save does not reopen it', () => {
  assert.match(extractFn(admin, 'closeModal'), /_costSessionId=null/);
  assert.doesNotMatch(extractFn(admin, 'finishExpenseEdit'), /openLinkedSession|openEditSession/);
  assert.doesNotMatch(extractFn(admin, 'updateExpense'), /openLinkedSession|openEditSession/);
  const fields = {
    'm-edesc': { value: 'Cursor Yearly' },
    'm-eamt': { value: '240' },
    'm-edate': { value: '2026-01-01' },
    'm-ecat': { value: 'Software' },
    'm-erecur': { value: 'yearly' },
    'm-euntil': { value: '' }
  };
  const sandbox = {
    expenses: [{
      id: 'e1',
      description: 'Cursor',
      amount: 20,
      date: '2026-01-01',
      category: 'Software',
      paymentMethod: '',
      sessionId: null,
      recurrence: 'monthly',
      recurUntil: '',
      recurActive: true
    }],
    _costSessionId: 'gsfa',
    opened: [],
    modal: 'Edit expense',
    document: { getElementById(id) { return fields[id] || { value: '' }; } },
    closeModal() { sandbox.modal = ''; sandbox._costSessionId = null; },
    renderExpenses() {},
    renderDashboard() {},
    renderFinances() {},
    renderSessions() {},
    openLinkedSession(id) { sandbox.opened.push(id); sandbox.modal = 'Edit session'; },
    openEditSession(id) { sandbox.opened.push(id); sandbox.modal = 'Edit session'; },
    readExpensePay() { return ''; },
    readExpenseSession() { return null; },
    writeExpenseRow() { return Promise.resolve(true); }
  };
  vm.runInNewContext(
    [extractFn(admin, 'normalizeExpenseRecurrence'), extractFn(admin, 'finishExpenseEdit'), extractFn(admin, 'updateExpense')].join('\n'),
    sandbox
  );
  sandbox.updateExpense('e1');
  assert.deepEqual(sandbox.opened, [], 'saving an expense opened a session');
  assert.equal(sandbox.modal, '', 'the expense modal was not closed');
  assert.equal(sandbox.expenses[0].recurrence, 'yearly');
  assert.equal(sandbox._costSessionId, null);
});

test('Girl Scout Badge Class does not force or grey the RN checkbox', () => {
  assert.doesNotMatch(admin, /'Girl Scout Badge Class':\{[^}\n]*requiresRN/);
  const rnBox = { checked: true, disabled: false };
  const note = { style: { display: '' }, innerHTML: '' };
  const sel = { value: 'Girl Scout Badge Class' };
  const ids = { 'm-rnonly': rnBox, 'm-rn-notice': note, 'm-course': sel };
  const box = {
    COURSES: { 'Girl Scout Badge Class': { hours: 1, maxStudents: 15 } },
    document: { getElementById(id) { return ids[id] || null; } }
  };
  vm.runInNewContext(
    [extractFn(admin, 'isGirlScoutBadgeCourseName'), extractFn(admin, 'updateRnNotice')].join('\n'),
    box
  );
  box.updateRnNotice();
  assert.equal(rnBox.disabled, false, 'RN checkbox was greyed for a Girl Scout badge course');
  assert.equal(rnBox.checked, true);
  assert.doesNotMatch(note.innerHTML, /must be taught by a certified registered nurse/);
  assert.match(note.innerHTML, /marked RN instructors only/);
});
