'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

test('a hold opens the same edit form and still stays off public registration', () => {
  const menu = admin.slice(admin.indexOf('function openSessionMenu'), admin.indexOf('// ─── ADDITIONAL COSTS HELPERS'));
  assert.match(menu, /Publish to instructors/);
  assert.match(menu, /label:'✏️ Edit session',act:`openEditSession\('\$\{sessId\}'\)`/);
  assert.doesNotMatch(menu, /Edit hold/);
  // Edit session is shared with holds: it is pushed after the non-hold branch closes.
  const holdBranch = menu.indexOf('if(s.isHold){');
  const editItem = menu.indexOf("label:'✏️ Edit session'");
  const addStudent = menu.indexOf('Add student');
  assert.ok(holdBranch > 0 && editItem > holdBranch);
  assert.ok(addStudent > holdBranch && addStudent < editItem);

  const rowAt = admin.indexOf('if(s.isHold){\n        const enrolled');
  const row = admin.slice(rowAt, admin.indexOf('if(s.isCustomJob){', rowAt));
  assert.match(row, /\$\{instr\}/);
  assert.match(row, /ON HOLD/);
  assert.match(row, /isLiveReg\(r\)/);
  assert.match(row, /sessionMaxStudents\(s\)/);
  assert.match(row, /revenueCell\(s,f,holdNote\)/);
  const revenueFn = admin.slice(admin.indexOf('const revenueCell='), admin.indexOf('const locCell='));
  assert.match(revenueFn, /fmt\(f\.revenue\)/);
  assert.match(revenueFn, /splitBillCaption/);
  assert.doesNotMatch(row, /<td style="color:var\(--muted\)">—<\/td>/);

  function between(startMark, endMark) {
    const start = admin.indexOf(startMark);
    const end = admin.indexOf(endMark, start + startMark.length);
    assert.ok(start > 0 && end > start, startMark);
    return admin.slice(start, end);
  }
  const dashRev = between('function renderDashboard', 'dash-metrics');
  assert.doesNotMatch(dashRev, /if\(s\.isHold\)return/);
  assert.match(dashRev, /dashboardRevenueTotals\(now\)/);
  const chart = between('Build a continuous 6-month window', 'const maxV');
  assert.doesNotMatch(chart, /isHold/);
  assert.match(chart, /dashboardChartRevenue\(now\)/);
  const fin = between('function renderFinances', '// ─── CODES');
  assert.doesNotMatch(fin, /if\(s\.isHold\)return/);
  assert.doesNotMatch(fin, /filter\(s=>!s\.isHold\)/);
  assert.match(fin, /financeRevenueBuckets\(/);
  const yearLoop = between('function printYearReport', 'expenses.forEach');
  assert.doesNotMatch(yearLoop, /isHold/);
  assert.match(yearLoop, /annualSessionBuckets\(/);
  const monthList = between('function printMonthReport', 'const monthExpenses');
  assert.doesNotMatch(monthList, /isHold\)return false/);
  assert.match(monthList, /sessionsForRevenueMonth\(/);
  const partnerRev = between('function partnerRevenueEvents', 'function partnerBookingUnits');
  assert.doesNotMatch(partnerRev, /isHold/);
  assert.match(partnerRev, /isCancelled/);
  const partnerUnits = between('function partnerBookingUnits', 'function partyFirstPaidIndex');
  assert.doesNotMatch(partnerUnits, /isHold/);
  const orgRows = between('function orgPartnerRows', 'function orgPartnerStatement');
  assert.doesNotMatch(orgRows, /isHold/);

  const holdStart = menu.indexOf('if(s.isHold){');
  const holdElse = menu.indexOf('}else{', holdStart);
  const holdMenu = menu.slice(holdStart, holdElse);
  assert.match(holdMenu, /openRoster/);
  assert.match(holdMenu, /openSessionRegistrations/);
  assert.match(holdMenu, /emailClass/);
  assert.doesNotMatch(holdMenu, /openAddReg/);

  const regs = admin.slice(admin.indexOf('function renderRegs'), admin.indexOf('function renderRegAlerts'));
  assert.doesNotMatch(regs, /sessions\.filter\(s=>!s\.isHold\)/);
  assert.match(regs, /on hold/);
  assert.match(regs, /fmtSessDate/);

  const codes = admin.slice(admin.indexOf('function renderCodes'), admin.indexOf('function copyCode'));
  assert.match(codes, /s\.isHold/);
  assert.match(codes, /s\.isCancelled/);
  assert.match(codes, /s\.isCustomJob/);

  const edit = admin.slice(admin.indexOf('function openEditSession'), admin.indexOf('async function saveSession'));
  assert.match(edit, /assignedInstrId=\(jobDataCache\[s\.id\]\|\|\{\}\)\.instructorId\|\|s\.instructorId/);
  assert.match(edit, /id="m-hold"/);
  assert.match(edit, /id="m-date"/);
  assert.match(edit, /id="m-time"/);
  assert.match(edit, /id="m-loc"/);
  assert.match(edit, /id="m-notes"/);
  assert.match(edit, /id="m-hold-term"/);
  assert.match(edit, /id="m-hold-payment"/);
  assert.match(edit, /id="m-instr"/);
  assert.match(edit, /Save changes/);

  const save = admin.slice(admin.indexOf('async function saveSession'), admin.indexOf('async function deleteSession'));
  assert.match(save, /if\(!date&&!isHold\)/);
  assert.match(save, /holdTerm/);
  assert.match(save, /holdPayment/);
  assert.match(save, /instructorId:preInstrId/);
  assert.match(save, /notes:document\.getElementById\('m-notes'\)\.value/);
  assert.match(save, /location:document\.getElementById\('m-loc'\)\.value/);
  assert.match(save, /isHold,reservedSeats,holdTerm,holdPayment/);
  assert.doesNotMatch(save, /from\('registrations'\)/);

  const cjForm = admin.slice(admin.indexOf('function openEditCustomJob'), admin.indexOf('function toggleCustomHoldMode'));
  assert.match(cjForm, /id="cj-hold"/);
  assert.match(cjForm, /id="cj-hold-term"/);
  assert.match(cjForm, /id="cj-hold-payment"/);
  assert.match(cjForm, /id="cj-date"/);
  assert.match(cjForm, /id="cj-notes"/);
  const cj = admin.slice(admin.indexOf('function toggleCustomHoldMode'), admin.indexOf('function toggleVirtualFields'));
  assert.match(cj, /if\(!date&&!isHold\)/);
  assert.match(cj, /getElementById\('cj-hold'\)/);
  assert.match(cj, /isHold,reservedSeats,holdTerm,holdPayment/);
  assert.doesNotMatch(cj, /from\('registrations'\)/);

  const addReg = admin.slice(admin.indexOf('function openAddReg'), admin.indexOf('async function saveReg'));
  assert.match(addReg, /!s\.isHold/);

  const pub = fs.readFileSync(path.join(root, 'js/public-sessions.js'), 'utf8');
  assert.match(pub, /flagOn\(row, 'is_hold'\) \|\| flagOn\(row, 'isHold'\)\) return false/);
});
