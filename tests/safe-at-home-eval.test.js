'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const instructor = fs.readFileSync(path.join(__dirname, '..', 'instructor.html'), 'utf8');
const admin = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

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
    escapeHtml(t) { return String(t == null ? '' : t); },
    filledSeats() { return 2; }
  };
  vm.createContext(sandbox);
  const decls = instructor.match(/const SAFE_AT_HOME_[A-Z_]+='[^']*';/g);
  assert.ok(decls && decls.length >= 3, 'missing Safe@Home checklist labels');
  vm.runInContext(
    [
      decls.join('\n'),
      extractFn(instructor, 'sessionIsSafeAtHome'),
      extractFn(instructor, 'safeAtHomeStudentCount'),
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
    assert.match(html, /Safe@Home student handbooks \(1 per student\)/);
    assert.match(html, /Safe@Home completion certificates \(1 per student\)/);
    assert.match(html, new RegExp(STEP));
    assert.equal((html.match(/☐/g) || []).length, 3);
    assert.doesNotMatch(html, /booklet and Completion/);
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

test('the class card uses the larger of registered and expected for both Safe@Home counts', () => {
  const sandbox = {
    escapeHtml(t) { return String(t == null ? '' : t); },
    filledSeats() { return 2; }
  };
  vm.createContext(sandbox);
  const decls = instructor.match(/const SAFE_AT_HOME_[A-Z_]+='[^']*';/g);
  vm.runInContext(
    [
      decls.join('\n'),
      extractFn(instructor, 'sessionIsSafeAtHome'),
      extractFn(instructor, 'safeAtHomeStudentCount'),
      extractFn(instructor, 'safeAtHomeClassChecklistHTML')
    ].join('\n'),
    sandbox
  );
  const html = sandbox.safeAtHomeClassChecklistHTML({
    course: 'Safe@Home',
    code: 'SAH-261102',
    participantsExpected: 6
  });
  assert.equal(sandbox.safeAtHomeStudentCount({ course: 'Safe@Home', participantsExpected: 6 }), 6);
  assert.equal((html.match(/· 6/g) || []).length, 2);
  const registeredWins = sandbox.safeAtHomeClassChecklistHTML({
    course: 'Safe@Home — Virtual',
    code: 'SAHV-1',
    participantsExpected: 1
  });
  assert.equal((registeredWins.match(/· 2/g) || []).length, 2);
});

test('the packing list counts Safe@Home handbooks and completion certificates separately', () => {
  const start = admin.indexOf('const PACK_BRING_ORDER');
  const end = admin.indexOf('function packingBringCounts');
  const sandbox = { Number, String, Math };
  vm.createContext(sandbox);
  vm.runInContext(admin.slice(start, end), sandbox);
  assert.equal(
    sandbox.packingBringPhrase({ sahHandbook: 6, sahCertificate: 6, av: 1 }),
    'Bring: 6 Safe@Home student handbooks (1 per student), 6 Safe@Home completion certificates (1 per student), 1 AV kit'
  );
  assert.match(admin, /'Safe@Home':\['sahHandbook','sahCertificate'\]/);
  assert.match(admin, /'Safe@Home — Series':\['sahHandbook','sahCertificate'\]/);
  assert.doesNotMatch(admin, /booklet and Completion Certificate/);
});

test('a claimed Safe@Home class shows the checklist, and a cancelled one does not', () => {
  const jobs = extractFn(instructor, 'renderMyJobs');
  assert.match(jobs, /safeAtHomeClassChecklistHTML\(s\)/);
  assert.match(jobs, /cx\?'':safeAtHomeClassChecklistHTML\(s\)/);
});
