'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const register = fs.readFileSync(path.join(__dirname, '../register.html'), 'utf8');
const pay = fs.readFileSync(path.join(__dirname, '../pay.html'), 'utf8');
const config = fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8');

function indexOf(haystack, needle) {
  const i = haystack.indexOf(needle);
  assert.ok(i >= 0, 'expected to find: ' + needle);
  return i;
}

test('step 1 is sessions-first: public list before the host-code details', () => {
  const sessions = indexOf(register, 'id="public-sessions"');
  const hostCode = indexOf(register, 'id="host-code-details"');
  assert.ok(sessions < hostCode, 'public sessions should appear above the host/private code details');
  assert.match(register, /Have a host or private code\?/);
  assert.match(register, /id="pf-course"/);
  assert.match(register, /id="pf-when"/);
  assert.match(register, /id="pf-city"/);
  assert.match(register, /id="public-show-more"/);
  assert.match(register, /Find a class/);
});

test('public cards show price; Free/Paid filter is optional', () => {
  assert.match(register, /class="pprice"/);
  assert.match(register, /sessionPriceLabel/);
  assert.match(register, /id="pf-price"/);
  assert.match(register, /Any price/);
  assert.match(config, /audience:'Grades 3–9'/);
});

test('trust cues sit on the info screen before the waiver', () => {
  const trust = indexOf(register, 'id="trust-box"');
  const waiver = indexOf(register, 'id="waiver-section"');
  assert.ok(trust < waiver, 'trust box should appear before the full waiver');
  assert.match(register, /We do not sell your data/);
  assert.match(register, /card or PayPal, Venmo, or Zelle/);
  assert.match(register, /Sales are final, but you may transfer/);
});

test('register checkout uses dynamic PayPal Orders, not the hosted NCP button', () => {
  assert.match(register, /src="\/js\/payments\.js"/);
  assert.match(register, /function mountRegisterPayPal/);
  assert.match(register, /\.mountCardButtons\(/);
  assert.match(register, /id="pay-amount-exact"/);
  assert.match(register, /You will be charged/);
  assert.doesNotMatch(register, /V9QPR5SLN9DD4/);
  assert.doesNotMatch(register, /ncp\/payment/);
  assert.match(register, /buildPayHtmlLink/);
});

test('header branding is multi-course, not Safe Sitter-only', () => {
  assert.match(register, /Safe Sitter® and family safety courses/);
  assert.match(pay, /Safe Sitter® and family safety courses/);
  assert.doesNotMatch(register, /<div class="tag">Safe Sitter® Courses<\/div>/);
  assert.doesNotMatch(pay, /<div class="tag">Safe Sitter® Courses<\/div>/);
});

test('deep links and waitlist stay on this page', () => {
  assert.match(register, /p\.get\('paycode'\)/);
  assert.match(register, /p\.get\('code'\)/);
  assert.match(register, /function startPayNow/);
  assert.match(register, /function goToWaitlist/);
  assert.match(register, /id="screen-waitlist"/);
});
