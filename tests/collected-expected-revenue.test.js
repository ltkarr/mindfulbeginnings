'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations/fee_received.sql'), 'utf8');

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
  'paidOutInstructorFee', 'legacyLineHasDatePaid', 'financeLegacyCosts',
  'financeSessionFigures', 'financeRevenueSlot',
  'participantMaterialAllowance',
  'processingFee', 'isLiveReg', 'regEffectivePrice',
  'instrBaseFee', 'instrDisplayFee', 'secondInstrDisplayFee',
  'orgPortionAmount', 'familyPrice', 'orgBillRate', 'orgRevenueHeadcount', 'orgBillAmount',
  'calcFin',
  'holdPaymentReceived', 'undatedHoldMoneyIn', 'orgOrJobFeeReceived', 'sessionCashSplit',
  'holdTermYear', 'sessionClassDate', 'sessionRevenueSlot',
  'dashboardRevenueTotals'
];

const sandbox = {
  COURSES: {
    'Safe Sitter®': { price: 225, matCost: 20.35, hours: 5, maxStudents: 16 }
  },
  sessions: [],
  registrations: [],
  instructors: [],
  invoices: [],
  jobDataCache: {},
  expenses: [],
  INSTR_RATE: 50,
  INSTR_EXTRA_HOURS: 0.5,
  PAYPAL_PCT: 0.0299,
  PAYPAL_FIXED: 0.49,
  getCoursePrice: () => 225,
  Array, Object, JSON, Date, Number, Math, String, parseInt, isNaN
};
vm.createContext(sandbox);
vm.runInContext(names.map((n) => extractFunction(admin, n)).join('\n'), sandbox);

const OCT_2026 = new Date(2026, 9, 6);

function fee(amount) {
  return amount * sandbox.PAYPAL_PCT + sandbox.PAYPAL_FIXED;
}

function useSessions(list, regs) {
  sandbox.sessions = list;
  sandbox.registrations = regs || [];
  sandbox.jobDataCache = {};
  sandbox.invoices = [];
}

test('an unpaid organization bill is Expected and paid family seats are Collected', () => {
  const session = {
    id: 'ss-261009',
    code: 'SS-261009',
    course: 'Safe Sitter®',
    date: '2026-10-09',
    priceOverride: 150,
    orgPortion: 25,
    billToOrg: 'GS Troop 42086',
    billedHeadcount: 6,
    additionalCosts: []
  };
  useSessions([session], [
    { id: 'paid', sessionId: session.id, payStatus: 'paid', pricePaid: 150 },
    { id: 'host', sessionId: session.id, payStatus: 'host' },
    { id: 'comp', sessionId: session.id, payStatus: 'in_kind', pricePaid: 0 },
    { id: 'wait', sessionId: session.id, payStatus: 'waitlist', pricePaid: 150 },
    { id: 'cx', sessionId: session.id, payStatus: 'cancelled', pricePaid: 150 }
  ]);
  const familyNet = 150 - fee(150);
  const split = sandbox.sessionCashSplit(session);
  assert.equal(split.expected, 150);
  assert.equal(Math.round(split.collected * 1000) / 1000, Math.round(familyNet * 1000) / 1000);
  assert.equal(Math.round((split.collected + split.expected) * 1000) / 1000, Math.round(split.booked * 1000) / 1000);

  const totals = sandbox.dashboardRevenueTotals(OCT_2026);
  assert.equal(Math.round(totals.yCollected * 1000) / 1000, Math.round(familyNet * 1000) / 1000);
  assert.equal(totals.yExpected, 150);
  assert.equal(Math.round((totals.yCollected + totals.yExpected) * 1000) / 1000, Math.round(totals.yRev * 1000) / 1000);
  assert.equal(Math.round(totals.mRev * 1000) / 1000, Math.round(totals.yRev * 1000) / 1000);
});

test('marking the organization fee received moves it from Expected to Collected', () => {
  const session = {
    id: 'ss-261030',
    course: 'Safe Sitter®',
    date: '2026-10-30',
    priceOverride: 0,
    orgPortion: 225,
    billToOrg: 'GS Cadette Troop 51093',
    billedHeadcount: 9,
    additionalCosts: []
  };
  useSessions([session]);
  assert.equal(sandbox.orgOrJobFeeReceived(session), false);
  assert.equal(sandbox.sessionCashSplit(session).expected, 2025);
  assert.equal(sandbox.sessionCashSplit(session).collected, 0);

  session.feeReceived = true;
  assert.equal(sandbox.sessionCashSplit(session).collected, 2025);
  assert.equal(sandbox.sessionCashSplit(session).expected, 0);
  const totals = sandbox.dashboardRevenueTotals(OCT_2026);
  assert.equal(totals.yCollected, 2025);
  assert.equal(totals.yExpected, 0);
  assert.equal(totals.yRev, 2025);
});

test('an explicit not-received mark overrides a paid hold note, and a paid invoice counts', () => {
  const wyngate = {
    id: 'wyngate',
    course: 'Safe@Home',
    date: '',
    isHold: true,
    holdTerm: 'Fall 2026',
    billToOrg: 'Girl Scouts – Wyngate',
    billedHeadcount: 12,
    holdPayment: 'Paid by check, $780 ',
    additionalCosts: []
  };
  useSessions([wyngate]);
  sandbox.getCoursePrice = () => 65;
  assert.equal(sandbox.orgOrJobFeeReceived(wyngate), true);
  assert.equal(sandbox.dashboardRevenueTotals(OCT_2026).yCollected, 780);
  assert.equal(sandbox.dashboardRevenueTotals(OCT_2026).yExpected, 0);

  wyngate.feeReceived = false;
  assert.equal(sandbox.orgOrJobFeeReceived(wyngate), false);
  assert.equal(sandbox.dashboardRevenueTotals(OCT_2026).yCollected, 0);
  assert.equal(sandbox.dashboardRevenueTotals(OCT_2026).yExpected, 780);
  assert.equal(sandbox.dashboardRevenueTotals(OCT_2026).yRev, 780);

  const job = {
    id: 'job',
    course: 'Workshop',
    date: '2026-09-16',
    isCustomJob: true,
    priceOverride: 1250,
    holdPayment: '',
    additionalCosts: []
  };
  useSessions([job]);
  assert.equal(sandbox.sessionCashSplit(job).expected, 1250);
  assert.equal(sandbox.sessionCashSplit(job).collected, 0);
  sandbox.invoices = [{ status: 'paid', lineItems: [{ sessionId: 'job' }] }];
  assert.equal(sandbox.orgOrJobFeeReceived(job), true);
  assert.equal(sandbox.sessionCashSplit(job).collected, 1250);
  assert.equal(sandbox.sessionCashSplit(job).expected, 0);
  sandbox.getCoursePrice = () => 225;
});

test('a cancelled custom-job fee and a zero organization bill add nothing', () => {
  const cancelled = {
    id: 'cx-job',
    course: 'Cancelled workshop',
    date: '2026-09-10',
    isCustomJob: true,
    isCancelled: true,
    priceOverride: 900,
    additionalCosts: []
  };
  const blank = {
    id: 'beth',
    course: 'Safe Sitter®',
    date: '2026-10-16',
    billToOrg: 'Congregation Beth El',
    billedHeadcount: null,
    additionalCosts: []
  };
  useSessions([cancelled, blank]);
  assert.equal(sandbox.sessionCashSplit(cancelled).booked, 0);
  assert.equal(sandbox.sessionCashSplit(blank).booked, 0);
  const totals = sandbox.dashboardRevenueTotals(OCT_2026);
  assert.equal(totals.yRev, 0);
  assert.equal(totals.yCollected, 0);
  assert.equal(totals.yExpected, 0);
});

test('the dashboard labels Collected, Expected, and Booked, and the month figure stays booked', () => {
  assert.match(admin, /Collected in \$\{y\} \$\{fmt\(yCollected\)\}/);
  assert.match(admin, /Expected in \$\{y\} \$\{fmt\(yExpected\)\}/);
  assert.match(admin, /Booked in \$\{y\} \$\{fmt\(yRev\)\}/);
  assert.match(admin, /Booked for classes dated in \$\{monthName\} \$\{y\}/);
  assert.match(admin, />Mark received</);
  assert.match(admin, /function setFeeReceived\(/);
  assert.match(admin, /function readFeeReceived\(/);
  assert.equal((admin.match(/feeReceivedBoxHtml\(/g) || []).length, 4);
});

test('the fee_received migration adds a nullable column, withholds it from anon, and does not guess existing rows', () => {
  const sql = migration.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
  assert.match(sql, /add column if not exists fee_received boolean/i);
  assert.doesNotMatch(sql, /default\s+true/i);
  assert.doesNotMatch(sql, /\bupdate\s+[a-z_.]/i);
  assert.match(sql, /revoke select \(fee_received\), insert \(fee_received\), update \(fee_received\), references \(fee_received\)[\s\S]*from anon, public/i);
  assert.doesNotMatch(sql, /revoke select, insert/i);
  const grants = sql.split(';').map((s) => s.trim()).filter((s) => /^grant\b/i.test(s));
  assert.equal(grants.length, 1);
  assert.match(grants[0], /to authenticated/i);
  assert.doesNotMatch(grants[0], /\banon\b/i);
  for (const page of [register, instructor]) {
    assert.equal(page.includes('fee_received'), false);
  }
});
