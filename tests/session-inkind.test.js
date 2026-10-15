'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const admin = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

test('session edit form offers an in-kind donation option', () => {
  // Checkbox lives in the Host & families fold of the edit-session modal.
  assert.match(admin, /id="m-inkind"/);
  assert.match(admin, /In-kind donation \(auction prize\)/);
  assert.match(admin, /function inKindBoxHtml\(s\)/);
  // The box reports how many of the session's registrations are already in-kind.
  assert.match(admin, /currently marked as in-kind/);
  // Placed in the Host & families fold, before the organization billing fields.
  const foldIdx = admin.indexOf('Host &amp; families');
  const boxIdx = admin.indexOf('${inKindBoxHtml(s)}');
  const orgIdx = admin.indexOf('${orgBillingFieldsHtml(s)}');
  assert.ok(foldIdx > -1 && boxIdx > foldIdx && orgIdx > boxIdx, 'in-kind box sits in Host & families before org billing');
});

test('saving a session with the in-kind box checked marks its registrations', () => {
  // The checkbox is read before the modal closes, alongside the other fields.
  assert.match(admin, /const markInKind=document\.getElementById\('m-inkind'\)\?\.checked\|\|false;/);
  // ...and applied after the session saves.
  assert.match(admin, /if\(markInKind\)await markSessionRegistrationsInKind\(s\.id\);/);
});

test('bulk in-kind marking flips live registrations and skips the rest', () => {
  assert.match(admin, /function markSessionRegistrationsInKind\(sessionId\)/);
  // Cancelled, waitlist, and already-in-kind rows are left alone.
  assert.match(admin, /r\.payStatus!=='in_kind'&&r\.payStatus!=='cancelled'&&r\.payStatus!=='waitlist'/);
  // Flipped rows get the auction value stamped into notes, like the single-edit flow.
  assert.match(admin, /r\.payStatus='in_kind';\s*\n\s*ensureInKindTag\(r\);/);
  // Paid registrations get a confirm first.
  assert.match(admin, /are marked paid\. Mark them as in-kind donations anyway/);
  // Each flipped registration is persisted.
  assert.match(admin, /sb\.from\('registrations'\)\.update\(regToDB\(r\)\)\.eq\('id',r\.id\)/);
});

test('in-kind registrations land in the donations report', () => {
  // The report counts exactly the in_kind payment status.
  assert.match(admin, /const inkind=regs\.filter\(r=>r\.payStatus==='in_kind'\)/);
  // The payment-status dropdown offers it for single registrations too.
  assert.match(admin, /<option value="in_kind">In-kind \(auction\)<\/option>/);
});

test('in-kind donations are valued at the base retail price, not a $0 override', () => {
  // A $0 session price override (so auction winners register free) must not
  // zero out the donation value.
  assert.match(admin, /function sessionBasePrice\(s\)/);
  assert.match(admin, /In-kind donations are recorded at retail value/);
  // The stamp uses the base price...
  assert.match(admin, /const val=s\?sessionBasePrice\(s\):0;/);
  // ...and a $0 stamp gets re-stamped instead of sticking.
  assert.match(admin, /if\(m&&parseFloat\(m\[1\]\)>0\)return;/);
  // The report prefers a real stamped value but falls back to base on $0.
  assert.match(admin, /return stamped>0\?stamped:base;/);
});
