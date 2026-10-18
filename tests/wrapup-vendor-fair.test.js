'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

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

const sandbox = { Date, Math, Number, isNaN, isFinite, String, RegExp };
vm.createContext(sandbox);
vm.runInContext(
  [
    extractFn(admin, 'isVendorFairSession'),
    extractFn(admin, 'wrapReportTasks'),
    extractFn(admin, 'isInstructorPaymentDone'),
    extractFn(admin, 'wrapProgress'),
  ].join('\n'),
  sandbox
);

const FAIR = { course: 'Girl Scouts Service Unit 60-6 welcome event', code: 'CJ-0901-1' };
const BADGE_CLASS = { course: 'Girl Scout Badge Workshop', code: 'GS-101' };

test('a real Girl Scout badge class still asks for the badge summary', () => {
  const tasks = sandbox.wrapReportTasks(BADGE_CLASS);
  assert.ok(tasks.some((t) => t.field === 'badgeSummarySent'));
});

test('a vendor fair never asks for a badge summary, even with Girl Scouts in the name', () => {
  assert.equal(sandbox.isVendorFairSession(FAIR), true);
  assert.equal(sandbox.wrapReportTasks(FAIR).length, 0);
});

test('vendor-fair wrap-up counts instructor pay only', () => {
  const fair = sandbox.wrapProgress(FAIR, {});
  assert.equal(fair.wrapTotal, 1);
  assert.equal(fair.wrapAllDone, false);
  const done = sandbox.wrapProgress(
    FAIR,
    { instructorId: 'k1', payStatus: 'paid' }
  );
  assert.equal(done.wrapAllDone, true);
  const followupOnly = sandbox.wrapProgress(FAIR, {
    instrFollowupSent: true,
    evalSentToHost: true
  });
  assert.equal(followupOnly.wrapAllDone, false);
});

test('custom-job Paid/Unpaid reads the real payment state, not the dead instrPaid field', () => {
  // The old row read jdi.instrPaid, which no code ever writes. The row now
  // derives its label from isInstructorPaymentDone.
  assert.match(admin, /\$\{instrPaidNow\?'Paid':'Unpaid'\}/);
  assert.match(admin, /const instrPaidNow=typeof isInstructorPaymentDone/);
  // Kim paid via wrap-up: assigned + payStatus paid reads as done.
  assert.equal(
    sandbox.isInstructorPaymentDone({ ownerTaught: false }, { instructorId: 'kim', payStatus: 'paid' }),
    true
  );
  assert.equal(sandbox.isInstructorPaymentDone({ ownerTaught: false }, {}), false);
});
