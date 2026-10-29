'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const instructor = fs.readFileSync(path.join(__dirname, '..', 'instructor.html'), 'utf8');

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

const STEP = 'Have students complete the Safe@Home student evaluation';

test('the instructor guide tells Safe@Home teachers to have students complete the evaluation', () => {
  assert.match(instructor, /4\. Teaching Safe@Home/);
  assert.match(instructor, new RegExp(STEP.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(instructor, /SAH- or SAHV-/);
});

test('Safe@Home sessions, including code and name variants, get the class checklist step', () => {
  const sandbox = {
    escapeHtml(t) { return String(t == null ? '' : t); }
  };
  vm.createContext(sandbox);
  const decl = instructor.match(/const SAFE_AT_HOME_EVAL_STEP='[^']*';/);
  assert.ok(decl, 'missing SAFE_AT_HOME_EVAL_STEP');
  vm.runInContext(
    [
      decl[0],
      extractFn(instructor, 'sessionIsSafeAtHome'),
      extractFn(instructor, 'safeAtHomeClassChecklistHTML')
    ].join('\n'),
    sandbox
  );
  const yes = [
    { course: 'Safe@Home', code: 'SAH-261102' },
    { course: 'Safe@Home — Virtual', code: 'SAHV-261108' },
    { course: 'Safe@Home — Series', code: 'SAHS-261201' },
    { course: 'Safe at Home workshop', code: '' },
    { course: 'Girl Scout Badge Class', code: 'SAH-1122' },
    { course: 'Something else', code: 'sahv-261108' }
  ];
  yes.forEach(function (s) {
    assert.equal(sandbox.sessionIsSafeAtHome(s), true, JSON.stringify(s));
    const html = sandbox.safeAtHomeClassChecklistHTML(s);
    assert.match(html, /Class checklist/);
    assert.match(html, new RegExp(STEP));
    assert.doesNotMatch(html, /https?:\/\//);
  });
  const no = [
    { course: 'Safe Sitter®', code: 'SS-270125' },
    { course: 'Intro to Babysitting', code: 'IB-261105' },
    { course: 'Stay Ready', code: 'SRV-261116' },
    { course: '', code: '' },
    null
  ];
  no.forEach(function (s) {
    assert.equal(sandbox.sessionIsSafeAtHome(s), false, JSON.stringify(s));
    assert.equal(sandbox.safeAtHomeClassChecklistHTML(s), '');
  });
});

test('a claimed Safe@Home class shows the checklist, and a cancelled one does not', () => {
  const jobs = extractFn(instructor, 'renderMyJobs');
  assert.match(jobs, /safeAtHomeClassChecklistHTML\(s\)/);
  assert.match(jobs, /cx\?'':safeAtHomeClassChecklistHTML\(s\)/);
});
