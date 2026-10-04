'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

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

function loadReferral() {
  const sandbox = {};
  vm.runInNewContext(
    [
      extractFn(admin, 'escapeHtml'),
      'const HEARD_NOTE_RE=/\\[How they heard about us:\\s*([^\\]]+)\\]/i;',
      extractFn(admin, 'referralSourceLabel'),
      extractFn(admin, 'sessionReferralBreakdown'),
      extractFn(admin, 'sessionReferralSummaryHtml'),
      extractFn(admin, 'referralSourceCellHtml'),
      extractFn(admin, 'referralSourceDetailHtml')
    ].join('\n'),
    sandbox
  );
  return sandbox;
}

test('public form still saves how they heard on the registration', () => {
  assert.match(register, /id="p-referral"/);
  assert.match(register, /How did you hear about us\?/);
  assert.match(register, /Facebook\/Instagram/);
  assert.match(register, /referral_source:referralSource\|\|''/);
  assert.match(admin, /referralSource:r\.referral_source\|\|''/);
});

test('a blank answer reads as Not specified, and a stored answer is shown as written', () => {
  const api = loadReferral();
  assert.equal(api.referralSourceLabel({}), 'Not specified');
  assert.equal(api.referralSourceLabel({ referralSource: '   ' }), 'Not specified');
  assert.equal(api.referralSourceLabel({ referralSource: null }), 'Not specified');
  assert.equal(api.referralSourceLabel({ referralSource: 'Nextdoor' }), 'Nextdoor');
  assert.equal(api.referralSourceLabel({ referralSource: 'Other: Mary Parks' }), 'Other: Mary Parks');
  assert.equal(api.referralSourceLabel({
    referralSource: '',
    notes: 'Nut allergy [How they heard about us: Girl Scouts] bring inhaler'
  }), 'Girl Scouts');
  assert.equal(api.referralSourceLabel({
    referralSource: 'Facebook/Instagram',
    notes: '[How they heard about us: Girl Scouts]'
  }), 'Facebook/Instagram');
});

test('a session breakdown counts each answer and keeps blanks visible', () => {
  const api = loadReferral();
  const rows = api.sessionReferralBreakdown([
    { referralSource: 'Nextdoor' },
    { referralSource: 'Facebook/Instagram' },
    { referralSource: 'Facebook/Instagram' },
    { referralSource: '' },
    { referralSource: '  ' },
    { notes: '[How they heard about us: Nextdoor]' }
  ]);
  assert.equal(JSON.stringify(rows), JSON.stringify([
    { source: 'Facebook/Instagram', count: 2 },
    { source: 'Nextdoor', count: 2 },
    { source: 'Not specified', count: 2 }
  ]));
  assert.equal(api.sessionReferralBreakdown([]).length, 0);
  assert.equal(api.sessionReferralSummaryHtml([]), '');
});

test('session summary and registration detail name the source, and escape it', () => {
  const api = loadReferral();
  const nasty = '<img src=x onerror=alert(1)>';
  const summary = api.sessionReferralSummaryHtml([
    { referralSource: 'Facebook/Instagram' },
    { referralSource: 'Facebook/Instagram' },
    { referralSource: nasty },
    { referralSource: '' }
  ]);
  assert.match(summary, /How they heard about us/);
  assert.match(summary, /Facebook\/Instagram/);
  assert.match(summary, />2</);
  assert.match(summary, /Not specified/);
  assert.doesNotMatch(summary, /<img/);
  assert.match(summary, /&lt;img/);

  const blank = api.referralSourceDetailHtml({ referralSource: '' });
  assert.match(blank, /How did you hear about us\?/);
  assert.match(blank, /Not specified/);
  assert.doesNotMatch(blank, />\s*<\/div><\/div>$/);

  const named = api.referralSourceCellHtml({ referralSource: 'Katy Greenberg' });
  assert.match(named, /Katy Greenberg/);
  const missing = api.referralSourceCellHtml({ referralSource: '' });
  assert.match(missing, /Not specified/);
  assert.doesNotMatch(missing, />—</);
});

test('opening a session lists the summary, and each registration row shows the answer', () => {
  const fn = admin.slice(admin.indexOf('function renderRegs('), admin.indexOf('function renderRegAlerts('));
  assert.match(fn, /How they heard/);
  assert.match(fn, /referralSourceCellHtml\(r\)/);
  assert.match(fn, /sf\?sessionReferralSummaryHtml\(list\):''/);
  assert.match(fn, /colspan="11"/);
  assert.match(admin, /id="reg-referral"/);
  const edit = admin.slice(admin.indexOf('function openEditReg('), admin.indexOf('async function saveEditReg('));
  assert.match(edit, /referralSourceDetailHtml\(r\)/);
  assert.ok(edit.indexOf('referralSourceDetailHtml') < edit.indexOf('m-efn'), 'the answer sits near the top of the registration');
});
