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

test('dashboard materials entry points at the existing Equipment flow', () => {
  assert.match(admin, /id="dash-materials"/);
  assert.match(admin, /function renderDashMaterials/);
  assert.match(admin, /function openCheckIn/);
  assert.match(admin, /function saveCheckIn/);
  assert.match(admin, /function matInstructorXrefHtml/);
  assert.match(admin, />On hand</);
  assert.match(admin, />Checked out</);
  assert.match(admin, /Check out for this class/);
  assert.match(admin, /reuse a kit instead of checking out a second one/);
  assert.match(admin, /onclick="openCheckout\(\)"/);
  const sql = fs.readFileSync(path.join(root, 'migrations/infant_cpr_manikins_plus3.sql'), 'utf8');
  assert.match(sql, /419e04a9-5916-450c-b2a3-65c292a235ec/);
  assert.match(sql, /Infant CPR Manikins/);
  assert.match(sql, /qty = 7/);
  assert.match(sql, /qty < 7/);
  assert.match(sql, /was 4, plus 3 purchased Sep 2026/);
});

test('family BCC composers open the Google Doc and leave the message empty', () => {
  const doc = 'https://docs.google.com/document/d/1JnuoHRPu-T0A3PvKmCr1Z1SMT1mME8o7K0BSHCWioRI/edit?tab=t.0';
  assert.match(admin, new RegExp(doc.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(admin, /Open this Google Doc/);
  assert.match(admin, /function openFamilyDocEmail/);
  assert.match(admin, /Copy BCC/);
  assert.match(admin, /Nothing is sent from this screen/);
  const slice = (a, b) => {
    const start = admin.indexOf(a);
    const end = admin.indexOf(b);
    assert.ok(start >= 0 && end > start, a + ' .. ' + b);
    return admin.slice(start, end);
  };
  const post = slice('function openPostCourseEmail', 'const MB_OUTREACH_DOC_URL');
  const family = slice('function openFamilyDocEmail', 'function openClassReminder');
  const classMail = slice('function openClassReminder', '// ─── INSTRUCTOR FOLLOW-UP');
  const emailClassFn = slice('function emailClass', 'function openPostCourseEmail');
  const hostMail = slice('function openHostReminder', 'function openInstructorReminder');
  const instrMail = slice('function openInstructorReminder', '// ─── ERROR TRACKING');

  assert.match(post, /openFamilyDocEmail/);
  assert.match(post, /Post-course family email/);
  assert.doesNotMatch(post, /EMAIL_BODY/);
  assert.match(classMail, /openFamilyDocEmail/);
  assert.match(classMail, /Send reminder to the class/);
  assert.doesNotMatch(classMail, /EMAIL_BODY/);
  assert.match(family, /outlook\.office\.com\/mail\/deeplink\/compose\?bcc=/);
  assert.match(family, /mail\.google\.com\/mail\/\?view=cm&fs=1&bcc=/);
  assert.match(family, /&subject=/);
  assert.match(family, /&su=/);
  assert.doesNotMatch(family, /&body=/);
  assert.doesNotMatch(family, /EMAIL_BODY/);

  assert.match(hostMail, /coming up in one week! We are so excited/);
  assert.match(hostMail, /const emailText=/);
  assert.match(instrMail, /Just a reminder that you are scheduled to teach/);
  assert.match(instrMail, /const emailText=/);

  assert.match(emailClassFn, /bcc=/);
  assert.doesNotMatch(emailClassFn, /openFamilyDocEmail/);
  assert.doesNotMatch(emailClassFn, /MB_OUTREACH_DOC_URL/);
  assert.doesNotMatch(emailClassFn, /EMAIL_BODY/);
  assert.doesNotMatch(admin, /Please review the important details below as you prepare for the class/);
  assert.doesNotMatch(admin, /Thank you for trusting Mindful Beginnings/);
});

test('Care Ready is wired into the instructor config and the admin course list', () => {
  assert.match(instructorCfg, /"Care Ready":\{hours:2\.5,maxStudents:16\}/);
  assert.match(admin, /'Care Ready':\{price:185/);
  assert.match(admin, /'Care Ready':185,/);
});
