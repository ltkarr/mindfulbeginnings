'use strict';

// The instructor job waitlist was removed (2026-10-14, Lindsay's call: it was
// confusing and made taken jobs look claimable). These tests lock in the new
// rule: a job another instructor holds never appears on anyone else's Open
// jobs board, and no waitlist UI, copy, or RPC remains.

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
vm.runInNewContext(extractFn(instructor, 'hideTakenJobFromOpenBoard'), sandbox);
const hide = sandbox.hideTakenJobFromOpenBoard;

const me = 'me';
const holder = 'holder';

test('unclaimed job is not hidden', () => {
  assert.equal(hide({}, { instructorId: null }, me), false);
  assert.equal(hide({}, {}, me), false);
});

test('job held by me is not hidden by this rule', () => {
  assert.equal(hide({}, { instructorId: me }, me), false);
});

test('job held by another instructor is always hidden', () => {
  assert.equal(hide({}, { instructorId: holder }, me), true);
  assert.equal(hide({ allowWaitlist: true }, { instructorId: holder, waitlist: [] }, me), true);
  assert.equal(hide({ allowWaitlist: true }, { instructorId: holder, waitlist: [me] }, me), true);
});

test('no waitlist UI, copy, or RPC remains in the portal', () => {
  assert.doesNotMatch(instructor, /joinWaitlist/);
  assert.doesNotMatch(instructor, /leaveWaitlist/);
  assert.doesNotMatch(instructor, /waitlistAllowed/);
  assert.doesNotMatch(instructor, /pill-waitlist/);
  assert.doesNotMatch(instructor, /instructor_join_waitlist/);
  assert.doesNotMatch(instructor, /instructor_leave_waitlist/);
  assert.doesNotMatch(instructor, /get_waitlist_contacts/);
  assert.doesNotMatch(instructor, /You are on waitlist/);
  assert.doesNotMatch(instructor, /on the waitlist/);
});

test('open-jobs copy no longer mentions the waitlist', () => {
  assert.doesNotMatch(instructor, /join the waitlist/i);
  assert.match(instructor, /Taken jobs never appear on this board/);
});

test('admin no longer offers the instructor waitlist toggle', () => {
  assert.doesNotMatch(admin, /Allow instructor waitlist/);
  assert.doesNotMatch(admin, /id="m-waitlist"/);
  assert.doesNotMatch(admin, /id="cj-waitlist"/);
});
