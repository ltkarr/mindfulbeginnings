'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
const seats = fs.readFileSync(path.join(root, 'migrations/20261006_seat_counts.sql'), 'utf8');

const CLASS_PROFIT = 'Class profit is revenue minus instructor pay, class expenses, and liaison commission. Company overhead is on the yearly view.';

test('seat counts ignore cancelled, waitlisted, and refunded rows', () => {
  assert.match(seats, /get_registration_count/);
  assert.match(seats, /get_all_registration_counts/);
  assert.match(seats, /'waitlist', 'cancelled', 'canceled', 'refunded'/);
  assert.match(admin, /function countsTowardSeats/);
  assert.match(admin, /countsTowardSeats\(r\)/);
});

test('session codes use the session price and do not paste locations into JavaScript strings', () => {
  const start = admin.indexOf('function renderCodes()');
  const end = admin.indexOf('function copySessionText');
  const body = admin.slice(start, end);
  assert.match(body, /sessionListPrice\(s\)/);
  assert.match(body, /s\.isCancelled/);
  assert.match(body, /s\.isCustomJob/);
  assert.match(body, /copySessionText\(this\)/);
  assert.doesNotMatch(body, /onclick="copyText\(/);
  assert.doesNotMatch(body, /getCoursePrice\(s\.course/);
});

test('monthly profit uses one labeled definition on the dashboard, chart, and finances', () => {
  assert.equal((admin.match(new RegExp(CLASS_PROFIT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length >= 3, true);
  const dash = admin.slice(admin.indexOf('function renderDashboard'), admin.indexOf('function classesTaughtBy') > 0 ? admin.indexOf('const mileEl') : admin.length);
  assert.match(dash, /monthLiaisonCommission\(/);
  assert.match(dash, /e\.sessionId/);
  assert.doesNotMatch(dash, /mOH\+=e\.amount;mCost\+=e\.amount/);
  const chart = admin.slice(admin.indexOf('function dashboardChartRevenue'), admin.indexOf('function financeRevenueBuckets'));
  assert.match(chart, /partnerCommissionByMonth/);
});

test('calendar dates use the local date helper', () => {
  assert.doesNotMatch(admin, /toISOString\(\)\.slice\(0,\s*10\)/);
  assert.doesNotMatch(instructor, /toISOString\(\)\.slice\(0,\s*10\)/);
  assert.match(admin, /function fmtYMD/);
  assert.match(instructor, /function fmtYMD/);
});

test('a handed-back job does not promise a 24-hour waitlist hold', () => {
  assert.doesNotMatch(instructor, /REPLACE_WITH_WAITLIST/);
  assert.doesNotMatch(instructor, /waitlist priority/);
  assert.doesNotMatch(instructor, /first refusal/);
  assert.match(instructor, /get_waitlist_contacts/);
  assert.match(instructor, /There is no hold on the job/);
  assert.match(seats, /get_waitlist_contacts/);
});
