'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const dupes = require('../js/duplicate-sessions');

const A = {
  id: 'da1a2563-6dc1-4051-97be-509e69322f1c',
  code: 'RCAH-261212',
  course: 'Adult & Pediatric First Aid/CPR/AED Certification (Online + Classroom)',
  date: '2026-12-12',
  time: '11:00 AM to 1:00 PM',
  location: 'Winston Churchill High School, Room 118',
  isCancelled: false,
  isHold: false,
  createdAt: 1
};
const B = {
  id: 'a08801c6-ca65-4985-a39d-430ed56bb81d',
  code: 'RCAH-261212B',
  course: A.course,
  date: '2026-12-12',
  time: '1:30 PM to 3:30 PM',
  location: A.location,
  isCancelled: false,
  isHold: false,
  createdAt: 2
};

test('Churchill morning and afternoon are not duplicates', () => {
  assert.equal(dupes.timesCouldBeSameClass(A.time, B.time), false);
  assert.deepEqual(dupes.findDuplicateGroups([A, B], []), []);
});

test('the same time on the same day is a duplicate until that pair is dismissed', () => {
  const copy = Object.assign({}, B, { time: A.time });
  const groups = dupes.findDuplicateGroups([A, copy], []);
  assert.equal(groups.length, 1);
  assert.deepEqual(groups[0].rows.map(r => r.code), ['RCAH-261212', 'RCAH-261212B']);
  const key = dupes.pairKey(A.id, B.id);
  assert.equal(dupes.pairKey(B.id, A.id), key);
  assert.deepEqual(dupes.findDuplicateGroups([A, copy], [key]), []);
});

test('overlapping ranges stay flagged and a shared endpoint does not', () => {
  assert.equal(dupes.timesCouldBeSameClass('11:00 AM to 1:30 PM', '1:00 PM to 3:00 PM'), true);
  assert.equal(dupes.timesCouldBeSameClass('11:00 AM to 1:00 PM', '1:00 PM to 3:00 PM'), false);
  assert.equal(dupes.timesCouldBeSameClass('1:30 to 3:30 PM', '11:00 AM to 1:00 PM'), false);
  assert.equal(dupes.timesCouldBeSameClass('', '11:00 AM to 1:00 PM'), true);
});

test('admin stores dismissals by session-id pair and skips non-overlapping times', () => {
  const admin = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  assert.match(admin, /\/js\/duplicate-sessions\.js/);
  assert.match(admin, /duplicate_dismissals/);
  assert.match(admin, /pair_key/);
  assert.match(admin, /timesCouldBeSameClass/);
  assert.doesNotMatch(admin, /localStorage\.setItem\('mb_dupes_ignored'/);
});
