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
  'paidOutInstructorFee', 'legacyLineHasDatePaid', 'financeLegacyCosts',
  'participantMaterialAllowance',
  'processingFee', 'isLiveReg', 'regEffectivePrice',
  'instrBaseFee', 'instrDisplayFee', 'secondInstrDisplayFee',
  'orgPortionAmount', 'familyPrice', 'orgBillRate', 'orgRevenueHeadcount', 'orgBillAmount',
  'calcFin', 'round2', 'financeSessionFigures', 'financeRevenueSlot',
  'holdPaymentReceived', 'undatedHoldMoneyIn', 'holdTermYear', 'sessionClassDate', 'sessionRevenueSlot',
  'orgOrJobFeeReceived', 'sessionCashSplit',
  'dashboardRevenueTotals',
  'sessionEndDate', 'fmtYMD',
  'isVendorFairSession', 'isNoFeeJob', 'instructorPayStillOwed', 'customJobPayMissing',
  'dashboardMonthPaySplit', 'sessionStillAhead', 'financeSlotIsCurrentMonth',
  'upcomingCommittedExpenses', 'upcomingWhenNote'
];

const sandbox = {
  COURSES: {
    'Safe Sitter®': { price: 225, matCost: 20.35, hours: 5, maxStudents: 16 }
  },
  sessions: [],
  registrations: [],
  instructors: [{ id: 'inst', hourlyRate: 50, name: 'Alex' }],
  expenses: [],
  jobDataCache: {},
  invoices: [],
  INSTR_RATE: 50,
  INSTR_EXTRA_HOURS: 0.5,
  PAYPAL_PCT: 0.0299,
  PAYPAL_FIXED: 0.49,
  getCoursePrice: () => 225,
  expenseOccurrences: (e) => (e ? [e] : []),
  Array, Object, JSON, Date, Number, Math, String, parseInt, isNaN, isFinite
};
vm.createContext(sandbox);
vm.runInContext(names.map((n) => extractFunction(admin, n)).join('\n'), sandbox);

const OCT8 = new Date(2026, 9, 8);

function money(n) {
  return Math.round(n * 100) / 100;
}

test('vendor fairs, tables, booths, and represent-us jobs are recognized', () => {
  assert.equal(sandbox.isVendorFairSession({ code: 'RUA-261017', course: 'Something else' }), true);
  assert.equal(sandbox.isVendorFairSession({ code: 'GSCNC-261010', course: 'GSCNC Annual Kick-Off — Partner Table' }), true);
  assert.equal(sandbox.isVendorFairSession({ code: 'CES-261025', course: 'Chic Events — Silver Spring Fall-o-ween Booth' }), true);
  assert.equal(sandbox.isVendorFairSession({ code: 'GUC-261107', course: 'Glenmont UMC Craft Fair — Mindful Beginnings Info Table' }), true);
  assert.equal(sandbox.isVendorFairSession({ code: 'HWM-261205', course: 'Hallie Wells Middle School Holiday Shopping Event' }), true);
  assert.equal(sandbox.isVendorFairSession({ code: 'SS-261003', course: 'Safe Sitter®' }), false);
  assert.equal(sandbox.isVendorFairSession({ code: 'GS-261012', course: 'Girl Scouts — Intro to Babysitting + First Aid', isCustomJob: true }), false);
});

test('this month includes unpaid vendor-fair pay and does not change class revenue', () => {
  const klass = {
    id: 'class',
    course: 'Safe Sitter®',
    date: '2026-10-09',
    priceOverride: 225,
    additionalCosts: [],
    instructorId: 'inst'
  };
  const fair = {
    id: 'fair',
    code: 'RUA-261010',
    course: 'Represent us at a community fair',
    date: '2026-10-10',
    isCustomJob: true,
    priceOverride: null,
    instrPayOverride: 250,
    additionalCosts: []
  };
  sandbox.sessions = [klass];
  sandbox.registrations = [{ id: 'p', sessionId: 'class', payStatus: 'paid' }];
  sandbox.jobDataCache = {};
  sandbox.expenses = [];
  const before = sandbox.dashboardRevenueTotals(OCT8);
  sandbox.sessions = [klass, fair];
  const after = sandbox.dashboardRevenueTotals(OCT8);
  assert.equal(money(after.mRev), money(before.mRev));
  assert.equal(money(after.yRev), money(before.yRev));
  assert.equal(money(after.mCost - before.mCost), 250);
  assert.equal(sandbox.financeSessionFigures(fair).rev, 0);
  assert.equal(sandbox.financeSessionFigures(fair).instr, 250);
  const split = sandbox.dashboardMonthPaySplit(OCT8);
  assert.equal(split.vendor, 250);
  assert.equal(split.otherJobs, 0);
  const ahead = sandbox.upcomingCommittedExpenses(OCT8);
  assert.equal(ahead.vendor, 250);
  assert.equal(ahead.vendorRows[0].inThisMonth, true);
  assert.equal(ahead.alreadyInMonth, money(before.mCost + 250));
  // The look-ahead is not added on top of class costs.
  assert.equal(money(after.mCost), money(before.mCost + ahead.vendor));
  assert.notEqual(money(after.mCost), money(before.mCost + ahead.total + ahead.vendor));
});

test('a later vendor fair and a free class are upcoming, and not in this month', () => {
  const laterFair = {
    id: 'later',
    code: 'RUA-261121',
    course: 'Represent us at Darnestown Presbyterian Church',
    date: '2026-11-21',
    isCustomJob: true,
    instrPayOverride: 200,
    priceOverride: null,
    additionalCosts: []
  };
  const freeCpr = {
    id: 'cpr',
    code: 'CSE-261118',
    course: 'Carlin Springs Moms Group — FREE Bilingual Infant & Child Choking Rescue and CPR Intro',
    date: '2026-11-18',
    isCustomJob: true,
    isHold: true,
    priceOverride: 0,
    instrPayOverride: 150,
    additionalCosts: []
  };
  const otherJob = {
    id: 'job',
    code: 'GS-261012',
    course: 'Girl Scouts — Intro to Babysitting + First Aid',
    date: '2026-10-12',
    isCustomJob: true,
    priceOverride: 65,
    instrPayOverride: 225,
    additionalCosts: []
  };
  sandbox.sessions = [laterFair, freeCpr, otherJob];
  sandbox.registrations = [];
  sandbox.jobDataCache = {};
  sandbox.expenses = [{ id: 'rent', sessionId: 'later', amount: 70, date: '2026-11-01', category: 'Marketing' }];
  const totals = sandbox.dashboardRevenueTotals(OCT8);
  assert.equal(totals.mRev, 65);
  assert.equal(totals.mCost, 225);
  assert.equal(sandbox.dashboardMonthPaySplit(OCT8).vendor, 0);
  assert.equal(sandbox.dashboardMonthPaySplit(OCT8).otherJobs, 225);
  const ahead = sandbox.upcomingCommittedExpenses(OCT8);
  assert.equal(ahead.vendor, 200);
  assert.equal(ahead.noFee, 150);
  assert.equal(ahead.noFeeRows[0].code, 'CSE-261118');
  assert.equal(ahead.classes, 225);
  assert.equal(ahead.bills, 70);
  assert.equal(ahead.alreadyInMonth, 225);
  assert.equal(ahead.later, 200 + 150 + 70);
  assert.equal(ahead.total, 225 + 200 + 150 + 70);
  assert.equal(sandbox.upcomingWhenNote(true), 'Included in class costs above');
  assert.equal(sandbox.upcomingWhenNote(false), 'Not in this month\'s profit');
  const november = sandbox.dashboardRevenueTotals(new Date(2026, 10, 1));
  assert.equal(november.mCost, 350);
  assert.equal(november.mRev, 0);
});

test('a paid vendor fair stays in class costs and drops off what is still to pay', () => {
  const paid = {
    id: 'paid-fair',
    code: 'RUA-261003',
    course: 'Represent us at Arlington Community Health Fair',
    date: '2026-10-03',
    isCustomJob: true,
    instrPayOverride: 250,
    priceOverride: null,
    additionalCosts: []
  };
  const cancelled = {
    id: 'cx',
    code: 'RUA-260923',
    course: 'Represent us at Annual Health & Wellness Expo',
    date: '2026-10-20',
    isCustomJob: true,
    isCancelled: true,
    instrPayOverride: 125,
    priceOverride: null,
    additionalCosts: []
  };
  sandbox.sessions = [paid, cancelled];
  sandbox.registrations = [];
  sandbox.expenses = [];
  sandbox.jobDataCache = { 'paid-fair': { payStatus: 'paid', paidFee: 250 } };
  assert.equal(sandbox.dashboardRevenueTotals(OCT8).mCost, 250);
  assert.equal(sandbox.dashboardMonthPaySplit(OCT8).vendor, 250);
  const ahead = sandbox.upcomingCommittedExpenses(OCT8);
  assert.equal(ahead.vendor, 0);
  assert.equal(ahead.total, 0);
  assert.equal(sandbox.financeSessionFigures(cancelled).instr, 0);
  assert.equal(sandbox.financeSessionFigures(cancelled).rev, 0);
});

test('a series that already started stays on the still-to-pay list without moving into this month', () => {
  const series = {
    id: 'series',
    code: 'CJ-0916',
    course: 'My First Babysitter\'s Club — Greenwood Elementary — 10 week series',
    date: '2026-09-16',
    isCustomJob: true,
    isRecurring: true,
    recurEndDate: '2026-11-18',
    priceOverride: 1250,
    instrPayOverride: 1000,
    additionalCosts: []
  };
  sandbox.sessions = [series];
  sandbox.registrations = [];
  sandbox.jobDataCache = {};
  sandbox.expenses = [];
  assert.equal(sandbox.dashboardRevenueTotals(OCT8).mCost, 0);
  assert.equal(sandbox.dashboardRevenueTotals(new Date(2026, 8, 20)).mCost, 1000);
  const ahead = sandbox.upcomingCommittedExpenses(OCT8);
  assert.equal(ahead.classes, 1000);
  assert.equal(ahead.classRows[0].inThisMonth, false);
  assert.equal(ahead.alreadyInMonth, 0);
  assert.equal(ahead.later, 1000);
});

test('the dashboard names vendor fairs inside class costs and does not add upcoming on top of profit', () => {
  const dash = admin.slice(admin.indexOf('function renderDashboard'), admin.indexOf('const mileEl'));
  assert.match(dash, /dashboardMonthPaySplit\(now\)/);
  assert.match(dash, /Includes \$\{includedBits\.join\(' and '\)\} this month/);
  assert.match(dash, /for vendor fairs/);
  assert.match(dash, /Upcoming expenses/);
  assert.match(dash, /Vendor fairs \$\{fmt\(ahead\.vendor\)\}/);
  assert.match(dash, /already inside class costs/);
  assert.match(dash, /mProfit=mRev-mCost/);
  assert.doesNotMatch(dash, /mCost\s*\+=\s*ahead/);
  assert.doesNotMatch(dash, /mRev\s*\+=/);
  assert.match(admin, /function renderUpcomingExpenses/);
  assert.match(admin, /Jobs with no class fee/);
  assert.match(admin, /not in this month's profit/);
});
