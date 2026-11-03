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
  'calcFin'
];

const sandbox = {
  COURSES: {
    'Safe Sitter®': { price: 185, hours: 5, maxStudents: 16, requiresSafeSitter: true }
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
  getCoursePrice: () => 185,
  JSON, Date, Number, Math, String
};
vm.createContext(sandbox);
vm.runInContext(names.map((n) => extractFunction(admin, n)).join('\n'), sandbox);

function money(n) {
  return Math.round(n * 100) / 100;
}

const bronwen = { id: 'bronwen', name: 'Bronwen Kennedy', hourlyRate: 75, isLeadTeacher: true };

function ss1103(extra) {
  return Object.assign({
    id: 'ss-1103',
    code: 'SS-1103',
    course: 'Safe Sitter®',
    date: '2026-11-03',
    instructorId: 'bronwen',
    paidTravelHours: 1.5,
    teachingHours: null,
    instrPayOverride: null,
    isVirtual: false
  }, extra || {});
}

test('SS-1103 instructor cost is the wrap-up amount: 6.5 hours at $75', () => {
  sandbox.instructors = [bronwen];
  sandbox.jobDataCache = { 'ss-1103': { instructorId: 'bronwen', payStatus: 'paid', paidFee: 487.5, referralBonus: 0 } };
  sandbox.registrations = [];
  const session = ss1103();
  const wrap = sandbox.wrapupPayAmount(session, bronwen, sandbox.jobDataCache['ss-1103'], 'primary');
  const fin = sandbox.calcFin(session);
  // Class default is 5 hours. Paid travel 1.5 replaces the usual travel hour and extra 30 minutes.
  assert.equal(sandbox.sessionTeachingHours(session), 5);
  assert.equal(sandbox.paidTravelHoursOf(session), 1.5);
  assert.equal(wrap, 487.5);
  assert.equal((5 + 1.5) * 75, 487.5);
  assert.equal(fin.instrFee, wrap);
  assert.equal(fin.instrFee + fin.referralBonus, wrap);
});

test('a different paid travel length changes both wrap-up and session profit together', () => {
  sandbox.instructors = [bronwen];
  sandbox.jobDataCache = { 'ss-1103': { instructorId: 'bronwen' } };
  sandbox.registrations = [];
  const session = ss1103({ paidTravelHours: 2 });
  const wrap = sandbox.wrapupPayAmount(session, bronwen, sandbox.jobDataCache['ss-1103'], 'primary');
  const fin = sandbox.calcFin(session);
  assert.equal(wrap, (5 + 2) * 75);
  assert.notEqual(wrap, 5 * 75 + 75 + 0.5 * 75);
  assert.equal(fin.instrFee, wrap);
});

test('a recorded payout replaces the formula on session profit', () => {
  sandbox.instructors = [bronwen];
  sandbox.jobDataCache = { 'ss-1103': { instructorId: 'bronwen', payStatus: 'paid', paidFee: 400, referralBonus: 25 } };
  sandbox.registrations = [];
  const session = ss1103();
  const jdi = sandbox.jobDataCache['ss-1103'];
  const wrap = sandbox.wrapupPayAmount(session, bronwen, jdi, 'primary');
  const fin = sandbox.calcFin(session);
  assert.equal(wrap, 425);
  assert.equal(fin.instrFee, 400);
  assert.equal(fin.referralBonus, 25);
  assert.equal(fin.instrFee + fin.referralBonus, wrap);
  assert.equal(fin.profit, fin.revenue - wrap);
});

test('SS-1103 revenue is the paid roster after card fees, and profit deducts the $487.50 payout', () => {
  sandbox.instructors = [bronwen];
  sandbox.jobDataCache = { 'ss-1103': { instructorId: 'bronwen', payStatus: 'paid', paidFee: 487.5, referralBonus: 0 } };
  const paid = (price) => ({ sessionId: 'ss-1103', payStatus: 'paid', pricePaid: price });
  sandbox.registrations = [
    paid(null), paid(null), paid(null), paid(null), paid(null), paid(null), paid(null), paid(null),
    paid(0),
    paid(185), paid(185),
    { sessionId: 'ss-1103', payStatus: 'cancelled', pricePaid: 185 }
  ];
  const session = ss1103();
  const fin = sandbox.calcFin(session);
  const gross = 10 * 185;
  const fee = 10 * (185 * 0.0299 + 0.49);
  assert.equal(fin.paidCount, 11);
  assert.equal(money(fin.grossRevenue), gross);
  assert.equal(money(fin.revenue), money(gross - fee));
  assert.equal(fin.instrFee, 487.5);
  assert.equal(money(fin.profit), money(fin.revenue - 487.5));
});
