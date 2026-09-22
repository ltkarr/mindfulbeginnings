'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
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

const sandbox = {};
vm.runInNewContext(
  extractFn(instructor, 'waitlistAllowed') + '\n' + extractFn(instructor, 'hideTakenJobFromOpenBoard'),
  sandbox
);
const hide = sandbox.hideTakenJobFromOpenBoard;

const me = 'me';
const holder = 'holder';
const other = 'other';

test('open job stays visible to everyone', () => {
  assert.equal(hide({ allowWaitlist: true }, { instructorId: null, waitlist: [] }, me), false);
  assert.equal(hide({}, { waitlist: [] }, me), false);
});

test('taken job with an empty waitlist stays visible so the first backup can join', () => {
  assert.equal(hide({ allowWaitlist: true }, { instructorId: holder, waitlist: [] }, me), false);
  assert.equal(hide({}, { instructorId: holder }, me), false);
});

test('taken job with someone waiting is hidden from instructors who are not on it', () => {
  const jdi = { instructorId: holder, waitlist: [other] };
  assert.equal(hide({ allowWaitlist: true }, jdi, me), true);
});

test('instructors already on the waitlist still see the taken job', () => {
  const jdi = { instructorId: holder, waitlist: [me, other] };
  assert.equal(hide({ allowWaitlist: true }, jdi, me), false);
});

test('the instructor who holds the job is not hidden by the waitlist rule', () => {
  const jdi = { instructorId: me, waitlist: [other] };
  assert.equal(hide({ allowWaitlist: true }, jdi, me), false);
});

test('an emptied waitlist shows the taken job again', () => {
  const jdi = { instructorId: holder, waitlist: [] };
  assert.equal(hide({ allowWaitlist: true }, jdi, me), false);
});

test('waitlist off hides a taken job from everyone else immediately', () => {
  assert.equal(hide({ allowWaitlist: false }, { instructorId: holder, waitlist: [] }, me), true);
  assert.equal(hide({ allowWaitlist: false }, { instructorId: holder, waitlist: [me] }, me), true);
});

test('an unclaimed reopened job is not hidden, even with people still on the waitlist', () => {
  assert.equal(hide({ allowWaitlist: true }, { instructorId: null, waitlist: [me], reopenedAt: '2026-09-22T12:00:00Z' }, other), false);
});

test('instructor open-jobs copy explains the one-person waitlist hide', () => {
  assert.match(instructor, /Once someone is on the waitlist, the job leaves this board/);
  assert.match(instructor, /if you are the one waiting, you'll still see it here/);
});

test('admin waitlist help text matches the new visibility rule on every form', () => {
  const help = 'then that Taken card disappears for everyone else (instructors already on the waitlist still see it)';
  const hits = admin.split(help).length - 1;
  assert.equal(hits, 4);
  assert.match(admin, /Uncheck this to hide the job from everyone else as soon as it is claimed/);
});
