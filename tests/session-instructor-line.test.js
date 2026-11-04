'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const admin = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('missing ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

const names = [
  'isPerStudentMaterialLine', 'isLegacyCostResolved', 'sessionExtraCosts',
  'expenseLedger', 'linkedExpenses', 'linkedExpenseTotal',
  'processingFee', 'isLiveReg', 'regEffectivePrice',
  'paidTravelHoursOf', 'sessionTeachingHours', 'instrBaseFee', 'instrDisplayFee', 'secondInstrDisplayFee',
  'wrapupPayAmount', 'wrapupFeeWithoutBonus',
  'payOverrideIsSet', 'sessionJobData', 'sessionPrimaryInstructorId', 'instrEstimateFee', 'instructorCostIsEstimate',
  'orgPortionAmount', 'familyPrice', 'orgBillRate', 'orgRevenueHeadcount', 'orgBillAmount',
  'calcFin', 'sessionInstructorPayNotes'
];

const sandbox = {
  COURSES: {
    'Safe Sitter®': { price: 225, hours: 5, maxStudents: 16 }
  },
  registrations: [],
  instructors: [],
  jobDataCache: {},
  expenses: [],
  INSTR_RATE: 50,
  INSTR_EXTRA_HOURS: 0.5,
  LEAD_TEACHER_RATE: 75,
  PAYPAL_PCT: 0.0299,
  PAYPAL_FIXED: 0.49,
  getCoursePrice: () => 225,
  JSON, Date, Number, Math, String
};
vm.createContext(sandbox);
vm.runInContext(names.map((n) => extractFunction(admin, n)).join('\n'), sandbox);

function money(n) {
  return Math.round(n * 100) / 100;
}

test('the revenue cell shows each instructor between inventory and Net', () => {
  const cell = admin.slice(admin.indexOf('const revenueCell='), admin.indexOf('const locCell='));
  assert.match(cell, /invNote/);
  assert.match(cell, /sessionInstructorPayNoteHtml\(s\)/);
  assert.match(cell, /\$\{invNote\}\$\{instrNote\}\$\{netLine/);
  const htmlFn = extractFunction(admin, 'sessionInstructorPayNoteHtml');
  assert.match(htmlFn, /- \$\{est\}\$\{fmt\(line\.amount\)\} instructor \(\$\{escapeHtml\(line\.name\)\}\)/);
  assert.equal(htmlFn.includes('\u2014'), false);
  const render = admin.slice(admin.indexOf('function renderSessions'), admin.indexOf('function materialsCheckedStamp'));
  assert.match(render, /sessionInstructorPayNoteHtml\(s\)\}\$\{netLine/);
});

test('an assigned instructor line matches the pay Net subtracts', () => {
  const ashira = { id: 'ashira', name: 'Ashira Lavine', hourlyRate: 50, isLeadTeacher: false };
  sandbox.instructors = [ashira];
  sandbox.jobDataCache = { ss: { instructorId: 'ashira' } };
  sandbox.registrations = [];
  const session = { id: 'ss', course: 'Safe Sitter®', instructorId: 'ashira', date: '2026-11-03' };
  const fin = sandbox.calcFin(session);
  const lines = sandbox.sessionInstructorPayNotes(session);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].name, 'Ashira Lavine');
  assert.equal(lines[0].estimated, false);
  assert.equal(lines[0].amount, 5 * 50 + 50 + 0.5 * 50);
  assert.equal(lines[0].amount, fin.instrFee + fin.referralBonus);
});

test('paid travel, a recorded payout, a second instructor, and a flat custom job stay on the line', () => {
  const bronwen = { id: 'bronwen', name: 'Bronwen Kennedy', hourlyRate: 75, isLeadTeacher: true };
  const helper = { id: 'help', name: 'Jordan Lee', hourlyRate: 40, isLeadTeacher: false };
  sandbox.instructors = [bronwen, helper];
  sandbox.registrations = [];

  const scheduled = {
    id: 'ss-1103',
    course: 'Safe Sitter®',
    instructorId: 'bronwen',
    paidTravelHours: 1.5,
    date: '2026-11-03'
  };
  sandbox.jobDataCache = { 'ss-1103': { instructorId: 'bronwen', payStatus: 'paid', paidFee: 487.5, referralBonus: 0 } };
  let lines = sandbox.sessionInstructorPayNotes(scheduled);
  let fin = sandbox.calcFin(scheduled);
  assert.equal(lines[0].name, 'Bronwen Kennedy');
  assert.equal(lines[0].amount, 487.5);
  assert.equal(lines[0].amount, fin.instrFee + fin.referralBonus);

  sandbox.jobDataCache = { both: { instructorId: 'bronwen', referralBonus: 25 } };
  const both = {
    id: 'both',
    course: 'Safe Sitter®',
    instructorId: 'bronwen',
    secondInstructorId: 'help'
  };
  lines = sandbox.sessionInstructorPayNotes(both);
  fin = sandbox.calcFin(both);
  assert.equal(lines.length, 2);
  assert.equal(lines[0].name, 'Bronwen Kennedy');
  assert.equal(lines[1].name, 'Jordan Lee');
  assert.equal(money(lines[0].amount + lines[1].amount), money(fin.instrFee + fin.referralBonus));

  sandbox.jobDataCache = { job: { instructorId: 'ashira-missing' } };
  sandbox.instructors = [{ id: 'ashira', name: 'Ashira Lavine', hourlyRate: 50 }];
  const job = { id: 'job', isCustomJob: true, course: 'Vendor fair', instrPayOverride: 250, instructorId: 'ashira' };
  sandbox.jobDataCache = { job: {} };
  lines = sandbox.sessionInstructorPayNotes(job);
  fin = sandbox.calcFin(job);
  assert.equal(lines.length, 1);
  assert.equal(lines[0].amount, 250);
  assert.equal(lines[0].name, 'Ashira Lavine');
  assert.equal(lines[0].amount, fin.instrFee);
});
