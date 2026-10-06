'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
const staleCfg = fs.readFileSync(path.join(root, 'configinstructor.js'), 'utf8');

test('reports count liaison referrals and do not repeat commission math', () => {
  assert.equal(admin.includes('partner-ref-detail'), false);
  assert.match(admin, /Named a liaison/);
  assert.match(admin, /function exportPartnerReferralCSV\(\)/);
  const csv = admin.slice(admin.indexOf('function exportPartnerReferralCSV'), admin.indexOf('function exportInKindCSV'));
  assert.match(csv, /Liaison\?/);
  assert.doesNotMatch(csv, /Commission/);
  assert.doesNotMatch(csv, /Net after costs/);
});

test('this-year registration tile leaves out host and waitlist seats', () => {
  const at = admin.indexOf('const totRegs=registrations.filter');
  assert.ok(at > 0);
  const dash = admin.slice(at, at + 700);
  assert.match(dash, /st==='host'/);
  assert.match(dash, /st==='waitlist'/);
  assert.match(dash, /slice\(0,4\)===String\(y\)/);
  assert.match(admin, /Registrations this year/);
  assert.match(admin, /Upcoming sessions/);
});

test('instructor PINs in the roster stay hidden until Show', () => {
  assert.match(admin, /function toggleInstructorPin\(btn\)/);
  assert.match(admin, /data-pin="\$\{escapeHtml\(i\.pin\|\|''\)\}">••••<\/span>/);
  assert.match(admin, /toggleInstructorPin\(this\)/);
});

test('monthly finances name processing fees and drop all-zero columns', () => {
  const fin = admin.slice(admin.indexOf('function renderFinances'), admin.indexOf('function renderCodes'));
  assert.match(fin, /Processing fees/);
  assert.doesNotMatch(fin, /Proc\. fees/);
  assert.match(fin, /Costs entered on the session/);
  assert.doesNotMatch(fin, /Older session costs \(review\)/);
  assert.match(fin, /optCols=\[/);
  assert.match(fin, /\.filter\(c=>c\.show\)/);
});

test('liaison cards no longer show a rate column or a new-organization bonus', () => {
  assert.doesNotMatch(admin, /Why this rate/);
  assert.doesNotMatch(admin, /No bonuses this month/);
  assert.doesNotMatch(admin, /Est\. rate/);
  assert.doesNotMatch(admin, /new-org bonus/);
  assert.match(admin, /function revealOrgPartners\(\)/);
  assert.match(admin, /id="nav-orgpartners"/);
});

test('the removed jobs screen is a no-op and the stale instructor config lists new courses', () => {
  const jobs = admin.slice(admin.indexOf('function renderJobs()'), admin.indexOf('function assignInstructor'));
  assert.match(jobs, /Jobs & materials screen was removed/);
  assert.doesNotMatch(jobs, /jobs-list/);
  assert.match(staleCfg, /"Care Ready":\{hours:2\.5,maxStudents:16,adult:true\}/);
  assert.match(staleCfg, /"Baby Ready":\{hours:2\.5,maxStudents:12,seatsPerRegistration:2,adult:true\}/);
});

test('instructor portal login, type size, and merged tabs', () => {
  const login = instructor.slice(instructor.indexOf('id="login-screen"'), instructor.indexOf('id="inactive-screen"'));
  assert.match(login, /<label for="pin-input"/);
  assert.doesNotMatch(login, /class="login-logo">Mindful Beginnings/);
  assert.match(instructor, /FAQs &amp; resources/);
  assert.equal((instructor.match(/id="tab-materials"/g) || []).length, 0);
  assert.match(instructor, /id="materials-content"/);
  assert.equal((instructor.match(/acct-myinfo/g) || []).length, 0);
  assert.match(instructor, /id="myinfo-content"/);
  assert.match(instructor, /id="h-level"/);
  assert.match(instructor, /instructorLevelBadge\(me\.level\)/);
  assert.match(instructor, /9\.\.40,600;9\.\.40,700/);
  assert.match(admin, /9\.\.40,600;9\.\.40,700/);
  assert.equal(instructor.includes('font-size:11px'), false);
  assert.equal(instructor.includes('font-size:12px'), false);
});
