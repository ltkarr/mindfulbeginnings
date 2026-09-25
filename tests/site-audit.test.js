'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
const pay = fs.readFileSync(path.join(root, 'pay.html'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const instructorCfg = fs.readFileSync(path.join(root, 'config-instructor.js'), 'utf8');
const cfg = require('../vercel.json');

test('admin can set or clear an https external registration link', () => {
  assert.match(admin, /id="m-external-url"/);
  assert.match(admin, /function readExternalRegistrationUrl/);
  assert.match(admin, /parsed\.protocol!=='https:'/);
  assert.match(admin, /external_registration_url/);
  assert.match(admin, /migrations\/external_registration_url\.sql/);
});

test('register.html no longer uses the fixed-amount PayPal hosted button', () => {
  assert.doesNotMatch(register, /V9QPR5SLN9DD4/);
  assert.doesNotMatch(register, /ncp\/payment/);
  assert.match(register, /\/js\/payments\.js/);
  assert.match(register, /id="paypal-button-container"/);
  assert.match(register, /remountRegisterPayPal/);
  assert.match(register, /MBPayments/);
});

test('register.html wires confirmation-email helpers including registration id', () => {
  assert.match(register, /\/js\/confirmation-email\.js/);
  assert.match(register, /MBConfirmationEmail/);
  assert.match(register, /buildPayCta/);
  assert.match(register, /params\.set\('reg'/);
});

test('register.html fallback class caps match config.js (16 for Safe Sitter / Grandparents)', () => {
  assert.match(register, /window\.MAX_STUDENTS=\{'Safe Sitter®':16/);
  assert.match(register, /'Grandparents: Getting Started':16/);
  assert.doesNotMatch(register, /window\.MAX_STUDENTS=\{'Safe Sitter®':8/);
});

test('instructor portal loads hyphenated config-instructor.js and includes newer courses', () => {
  assert.match(instructor, /src="\/config-instructor\.js"/);
  assert.match(instructorCfg, /Ready\. Period\./);
  assert.match(instructorCfg, /maxStudents:18/);
  assert.match(instructorCfg, /Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes/);
  assert.match(instructorCfg, /My First Babysitters Club — Single Session/);
  assert.match(instructor, /Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes/);
  assert.match(instructor, /season ready/i);
});

test('pages request a real favicon and the file exists', () => {
  assert.equal(fs.existsSync(path.join(root, 'favicon.ico')), true);
  assert.equal(fs.existsSync(path.join(root, 'email-logo.png')), true);
  for (const html of [register, pay, admin, instructor]) {
    assert.match(html, /href="\/favicon\.ico"/);
  }
});

test('Mary Parks team headshot is published as a static JPEG', () => {
  const headshot = path.join(root, 'team', 'mary-parks.jpg');
  assert.equal(fs.existsSync(headshot), true);
  const buf = fs.readFileSync(headshot);
  assert.ok(buf.length > 1000);
  assert.equal(buf[0], 0xff);
  assert.equal(buf[1], 0xd8);
});

test('vercel.json caches payment/confirmation scripts as no-store and rewrites the old instructor config path', () => {
  const sources = (cfg.headers || []).map((h) => h.source);
  assert.ok(sources.includes('/js/payments.js'));
  assert.ok(sources.includes('/js/confirmation-email.js'));
  assert.ok(sources.includes('/config-instructor.js'));
  const rewrite = (cfg.rewrites || []).find((r) => r.source === '/configinstructor.js');
  assert.ok(rewrite);
  assert.equal(rewrite.destination, '/config-instructor.js');
});

test('Venmo/Zelle memos on register include the registration id helper', () => {
  assert.match(register, /currentPayMemo/);
  assert.match(register, /currentPayRegistrationId/);
  assert.match(register, /buildPaymentMemo/);
});

test('admin expense categories include Curriculum Development', () => {
  assert.match(admin, /<option>Curriculum Development<\/option>/);
  assert.match(admin, /const EXP_CATS=\[[^\]]*Curriculum Development[^\]]*\]/);
  const cats = admin.match(/const EXP_CATS=\[(.*)\];/);
  assert.ok(cats);
  const list = cats[1].split(',').map((c) => c.trim().replace(/^'|'$/g, ''));
  assert.equal(list.at(-1), 'Other');
  assert.ok(list.includes('Curriculum Development'));
  assert.ok(list.includes('Business Development'));
  assert.ok(list.includes('Charitable Donation'));
});

test('dashboard materials show on hand vs checked out and check in against a session', () => {
  assert.match(admin, /id="dash-materials"/);
  assert.match(admin, /function renderDashMaterials/);
  assert.match(admin, /function openCheckIn/);
  assert.match(admin, /function saveCheckIn/);
  assert.match(admin, /function matInstructorXrefHtml/);
  assert.match(admin, />On hand</);
  assert.match(admin, />Checked out</);
  assert.match(admin, /Check out for this class/);
  const sql = fs.readFileSync(path.join(root, 'migrations/infant_cpr_manikins_plus3.sql'), 'utf8');
  assert.match(sql, /Infant CPR Manikins/);
  assert.match(sql, /qty = qty \+ 3/);
  assert.match(sql, /purchased Sep 2026/);
  assert.match(sql, /mb-infant-manikins-plus-3-2026-09/);
});

test('dashboard outreach opens the Google Doc and keeps recipient lists', () => {
  const doc = 'https://docs.google.com/document/d/1JnuoHRPu-T0A3PvKmCr1Z1SMT1mME8o7K0BSHCWioRI/edit?tab=t.0';
  assert.match(admin, new RegExp(doc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(admin, /Open this Google Doc/);
  assert.match(admin, /function openOutreachWindow/);
  assert.match(admin, /This screen does not send mail and does not load the Doc/);
  const slice = (a, b) => admin.slice(admin.indexOf(a), admin.indexOf(b));
  const classMail = slice('function openClassReminder', 'function openHostReminder');
  const hostMail = slice('function openHostReminder', 'function openInstructorReminder');
  const instrMail = slice('function openInstructorReminder', 'function openInstructorFollowup');
  for (const fn of [classMail, hostMail, instrMail]) {
    assert.doesNotMatch(fn, /EMAIL_BODY/);
    assert.doesNotMatch(fn, /outlook\.office\.com/);
    assert.doesNotMatch(fn, /mail\.google\.com/);
    assert.match(fn, /openOutreachWindow/);
  }
  assert.match(classMail, /Send reminder to the class/);
  assert.match(classMail, /listLabel:'BCC'/);
  assert.match(hostMail, /Send reminder to host/);
  assert.match(instrMail, /Send reminder \+ roster to instructor/);
  assert.match(instrMail, /listLabel:'To'/);
  assert.doesNotMatch(admin, /Please review the important details below as you prepare for the class/);
  assert.doesNotMatch(admin, /coming up in one week! We are so excited/);
  assert.doesNotMatch(admin, /Just a reminder that you are scheduled to teach/);
});

test('Care Ready is wired into the instructor config and the admin course list', () => {
  assert.match(instructorCfg, /"Care Ready":\{hours:2\.5,maxStudents:16\}/);
  assert.match(admin, /'Care Ready':\{price:185/);
  assert.match(admin, /'Care Ready':185,/);
});
