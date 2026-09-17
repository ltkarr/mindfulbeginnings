'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isPublicSession,
  filterPublicSessions,
  sessionPlace,
  sessionPrice,
  sessionCap,
  seatsLeft,
  todayLocalISO
} = require('../js/public-sessions');

const TODAY = '2026-09-16';

function row(overrides) {
  return Object.assign({
    id: 's1',
    code: 'SS-261002',
    course: 'Safe Sitter®',
    date: '2026-10-02',
    time: '4 PM - 9 PM',
    city: 'Potomac',
    is_virtual: false,
    is_cancelled: false,
    is_hold: false,
    is_custom_job: false,
    price_override: null,
    max_students_override: null
  }, overrides);
}

test('todayLocalISO uses local calendar date', () => {
  assert.equal(todayLocalISO(new Date('2026-09-16T15:00:00')), '2026-09-16');
});

test('public upcoming course sessions stay on the list', () => {
  assert.equal(isPublicSession(row(), TODAY), true);
  assert.equal(isPublicSession(row({ code: 'GP-0930', course: 'Grandparents: Getting Started', date: TODAY }), TODAY), true);
  assert.equal(isPublicSession(row({ code: 'SAHV-261201', course: 'Safe@Home — Virtual', is_virtual: true, city: '' }), TODAY), true);
});

test('past, cancelled, hold, and custom-job sessions are excluded', () => {
  assert.equal(isPublicSession(row({ date: '2026-09-15' }), TODAY), false);
  assert.equal(isPublicSession(row({ is_cancelled: true }), TODAY), false);
  assert.equal(isPublicSession(row({ is_hold: true }), TODAY), false);
  assert.equal(isPublicSession(row({ is_custom_job: true }), TODAY), false);
});

test('ops code prefixes stay off the public list even if flags are missing', () => {
  ['CJ-0916', 'RUA-261017', 'SUN-260927', 'TWU-260916'].forEach((code) => {
    assert.equal(isPublicSession(row({ code, is_custom_job: false, is_cancelled: false }), TODAY), false, code);
  });
});

test('Represent / Welcome Event / Trinity course names are treated as ops', () => {
  assert.equal(isPublicSession(row({
    code: 'EXP-261001',
    course: 'Represent us at Annual Health & Wellness Expo',
    is_custom_job: false
  }), TODAY), false);
  assert.equal(isPublicSession(row({
    code: 'GSW-261001',
    course: 'Service Unit 60-6 Welcome Event!',
    is_custom_job: false
  }), TODAY), false);
  assert.equal(isPublicSession(row({
    code: 'UNI-261001',
    course: 'Trinity Washington University Washington, DC',
    is_custom_job: false
  }), TODAY), false);
});

test('filterPublicSessions sorts by date then code and drops private rows', () => {
  const list = filterPublicSessions([
    row({ code: 'SS-261010', date: '2026-10-10' }),
    row({ code: 'CJ-0921', course: 'Caregiving for Grandparents Workshop', is_custom_job: true, date: '2026-09-19' }),
    row({ code: 'SAH-1016', course: 'Safe@Home', date: '2026-10-16' }),
    row({ code: 'SS-261003', date: '2026-10-03' }),
    row({ code: 'RUA-261024', course: 'Represent us at Geneva Day School Fall Fest!', date: '2026-10-24' })
  ], TODAY);
  assert.deepEqual(list.map((s) => s.code), ['SS-261003', 'SS-261010', 'SAH-1016']);
});

test('sessionPlace prefers Virtual, then city', () => {
  assert.equal(sessionPlace(row({ is_virtual: true, city: 'Bethesda' })), 'Virtual');
  assert.equal(sessionPlace(row({ city: 'Arlington, ' })), 'Arlington');
  assert.equal(sessionPlace(row({ city: '' })), 'Location TBD');
});

test('sessionPrice uses price_override, then the shared base-price helper', () => {
  assert.equal(sessionPrice(row({ price_override: 94 })), 94);
  assert.equal(sessionPrice(row({ price_override: 0 })), 0);
  assert.equal(sessionPrice(row(), (course, date) => {
    assert.equal(course, 'Safe Sitter®');
    assert.equal(date, '2026-10-02');
    return 225;
  }), 225);
  assert.equal(sessionPrice(row()), null);
});

test('seatsLeft uses override cap, then course cap', () => {
  assert.equal(sessionCap(row({ max_students_override: 8 }), { 'Safe Sitter®': 16 }), 8);
  assert.equal(sessionCap(row(), { 'Safe Sitter®': 16 }), 16);
  assert.equal(seatsLeft(row(), 3, { 'Safe Sitter®': 16 }), 13);
  assert.equal(seatsLeft(row({ max_students_override: 8 }), 8, { 'Safe Sitter®': 16 }), 0);
  assert.equal(seatsLeft(row(), 1, {}), null);
});
