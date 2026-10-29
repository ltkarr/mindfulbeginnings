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
  'paidOutInstructorFee',
  'processingFee', 'isLiveReg', 'regEffectivePrice',
  'paidTravelHoursOf', 'sessionTeachingHours', 'instrBaseFee', 'instrDisplayFee', 'secondInstrDisplayFee',
  'payOverrideIsSet', 'sessionJobData', 'sessionPrimaryInstructorId', 'instrEstimateFee', 'instructorCostIsEstimate',
  'orgPortionAmount', 'familyPrice', 'orgBillRate', 'orgRevenueHeadcount',
  'calcFin'
];

const sandbox = {
  COURSES: {
    'Safe Sitter®': { price: 225, matCost: 20.35, hours: 5, maxStudents: 16 },
    'All Kids Welcome': { price: 25, hours: 1.5, virtual: true, instrFlatFee: 75 },
    "Babysitter's Training": { price: 185, hours: 4.25, redCross: true, requiresLeadTeacher: true }
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

function sitter(extra) {
  return Object.assign({
    id: 'ss',
    course: 'Safe Sitter®',
    date: '2026-11-02',
    isVirtual: false
  }, extra || {});
}

test('an unassigned 5-hour Safe Sitter is estimated at the Lead Teacher rate', () => {
  sandbox.instructors = [];
  sandbox.jobDataCache = {};
  sandbox.registrations = [];
  const session = sitter();
  const fin = sandbox.calcFin(session);
  // 5 class hours + 1 travel hour + 30 minutes, all at $75.
  const estimate = 5 * 75 + 75 + 0.5 * 75;
  assert.equal(estimate, 487.5);
  assert.equal(fin.instrFee, estimate);
  assert.equal(fin.instrEstimated, true);
  assert.equal(sandbox.instructorCostIsEstimate(session), true);
  // The pay formula instructors see when nobody is named stays on the $50 default.
  assert.equal(sandbox.instrBaseFee(session, null), 5 * 50 + 50 + 0.5 * 50);
});

test('an assigned non-lead instructor at $50 is a real cost, with no estimate', () => {
  const dana = { id: 'dana', name: 'Dana', isLeadTeacher: false, hourlyRate: 50 };
  sandbox.instructors = [dana];
  sandbox.jobDataCache = { ss: { instructorId: 'dana' } };
  const session = sitter({ instructorId: 'dana' });
  const fin = sandbox.calcFin(session);
  const actual = 5 * 50 + 50 + 0.5 * 50;
  assert.equal(actual, 325);
  assert.equal(fin.instrFee, actual);
  assert.equal(fin.instrEstimated, false);
  assert.equal(sandbox.instructorCostIsEstimate(session), false);
});

test('a Lead Teacher, a missing rate, a flat override, and a frozen paid fee', () => {
  const lead = { id: 'lead', name: 'Lead', isLeadTeacher: true, hourlyRate: 60 };
  const plain = { id: 'plain', name: 'Plain', isLeadTeacher: false, hourlyRate: 60 };
  const unset = { id: 'unset', name: 'Unset', isLeadTeacher: false };
  sandbox.instructors = [lead, plain, unset];

  sandbox.jobDataCache = { ss: { instructorId: 'lead' } };
  const leadFin = sandbox.calcFin(sitter({ instructorId: 'lead' }));
  assert.equal(leadFin.instrFee, 5 * 75 + 75 + 37.5);
  assert.equal(leadFin.instrEstimated, false);

  sandbox.jobDataCache = { ss: { instructorId: 'plain' } };
  const hourly = sandbox.calcFin(sitter({ instructorId: 'plain' }));
  assert.equal(hourly.instrFee, 5 * 60 + 60 + 30);
  assert.equal(hourly.instrEstimated, false);

  sandbox.jobDataCache = { ss: { instructorId: 'unset' } };
  const fallback = sandbox.calcFin(sitter({ instructorId: 'unset' }));
  assert.equal(fallback.instrFee, 325);
  assert.equal(fallback.instrEstimated, false);

  sandbox.jobDataCache = {};
  sandbox.instructors = [];
  const overridden = sandbox.calcFin(sitter({ instrPayOverride: 100 }));
  assert.equal(overridden.instrFee, 100);
  assert.equal(overridden.instrEstimated, false);

  sandbox.jobDataCache = { ss: { payStatus: 'paid', paidFee: 280 } };
  const paid = sandbox.calcFin(sitter());
  assert.equal(paid.instrFee, 280);
  assert.equal(paid.instrEstimated, false);
});

test('a second instructor uses their own rate, and an empty primary slot stays estimated', () => {
  const helper = { id: 'help', name: 'Helper', isLeadTeacher: false, hourlyRate: 40 };
  const lead = { id: 'lead', name: 'Lead', isLeadTeacher: true, hourlyRate: 75 };
  sandbox.instructors = [helper, lead];

  sandbox.jobDataCache = {};
  const openPrimary = sandbox.calcFin(sitter({ secondInstructorId: 'help' }));
  const helperPay = 5 * 40 + 40 + 20;
  assert.equal(openPrimary.instrFee, 487.5 + helperPay);
  assert.equal(openPrimary.instrEstimated, true);

  sandbox.jobDataCache = { ss: { instructorId: 'lead' } };
  const both = sandbox.calcFin(sitter({ instructorId: 'lead', secondInstructorId: 'help' }));
  assert.equal(both.instrFee, 487.5 + helperPay);
  assert.equal(both.instrEstimated, false);

  sandbox.jobDataCache = { ss: { instructorId: 'help', secondInstrPaid: true, secondInstrPaidFee: 90 } };
  const frozenSecond = sandbox.calcFin(sitter({ instructorId: 'help', secondInstructorId: 'lead' }));
  const helperAsPrimary = 5 * 40 + 40 + 20;
  assert.equal(frozenSecond.instrFee, helperAsPrimary + 90);
  assert.equal(frozenSecond.instrEstimated, false);
});

test('a virtual class estimate has no travel hour, and a claimed job uses job_data', () => {
  sandbox.instructors = [];
  sandbox.jobDataCache = {};
  const virtual = sandbox.calcFin({
    id: 'akw',
    course: 'All Kids Welcome',
    isVirtual: true
  });
  // Flat fee is ignored. 1.5 hours + 30 minutes at $75, no travel.
  assert.equal(virtual.instrFee, 1.5 * 75 + 0.5 * 75);
  assert.equal(virtual.instrEstimated, true);

  sandbox.instructors = [{ id: 'dana', hourlyRate: 50, isLeadTeacher: false }];
  sandbox.jobDataCache = { akw: { instructorId: 'dana' } };
  const claimed = sandbox.calcFin({ id: 'akw', course: 'All Kids Welcome', isVirtual: true });
  assert.equal(claimed.instrFee, 1.5 * 50 + 0.5 * 50);
  assert.equal(claimed.instrEstimated, false);
});

test('admin screens label an estimated net and instructor cost, and not a real one', () => {
  assert.match(admin, /Net \$\{estPrefix\(fmtSigned\(v\), estimated\)\}/);
  assert.match(admin, /Session profit \$\{estPrefix\(fmtSigned\(f\.profit\), est\)\}/);
  assert.match(admin, /minus instructor pay \$\{estPrefix\(fmt\(f\.instrFee\|\|0\), est\)\}/);
  assert.match(admin, /Instructor fees<\/th>/);
  assert.match(admin, /estPrefix\(fmt\(b\.instr\|\|0\), !!b\.instrEstimated\)/);
  assert.match(admin, /estPrefix\(fmtSigned\(b\.profit\), !!b\.instrEstimated\)/);
  assert.match(admin, /Pay out, 30 days/);
  assert.match(admin, /estPrefix\(fmt\(fc\.total\), fc\.totalEstimated\)/);
  assert.match(admin, /instructor cost est\./);
  assert.match(admin, /Instructor pay is est\. until someone accepts/);
});
