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
  'calcFin', 'round2', 'financeYearFigures', 'partnerDirectCosts',
  'financeSessionFigures', 'financeRevenueSlot',
  'holdPaymentReceived', 'undatedHoldMoneyIn', 'holdTermYear', 'sessionClassDate', 'sessionRevenueSlot',
  'orgOrJobFeeReceived', 'sessionCashSplit',
  'dashboardRevenueTotals', 'dashboardChartRevenue',
  'financeRevenueBuckets', 'emptyRevBucket', 'applyFinanceExpenses',
  'annualSessionBuckets', 'courseRevenueForYear', 'profitBySessionRows'
];

const sandbox = {
  COURSES: {
    'Safe Sitter®': { price: 225, matCost: 20.35, hours: 5, maxStudents: 16 }
  },
  sessions: [],
  registrations: [],
  instructors: [],
  expenses: [],
  jobDataCache: {},
  profitShowCancelled: false,
  INSTR_RATE: 50,
  INSTR_EXTRA_HOURS: 0.5,
  PAYPAL_PCT: 0.0299,
  PAYPAL_FIXED: 0.49,
  getCoursePrice: () => 225,
  Array, Object, JSON, Date, Number, Math, String, parseInt, isNaN
};
vm.createContext(sandbox);
vm.runInContext(names.map((n) => extractFunction(admin, n)).join('\n'), sandbox);

const OCT = new Date(2026, 9, 15);

function money(n) {
  return Math.round(n * 100) / 100;
}

test('a linked expense is counted once in the year and once in that session profit', () => {
  const session = {
    id: 'ss-link',
    course: 'Safe Sitter®',
    date: '2026-10-04',
    priceOverride: 225,
    additionalCosts: [{ label: 'Facility rental', amount: 40 }]
  };
  sandbox.sessions = [session];
  sandbox.registrations = [{ id: 'paid', sessionId: 'ss-link', payStatus: 'paid' }];
  sandbox.jobDataCache = {};
  sandbox.expenses = [{ id: 'e1', sessionId: 'ss-link', amount: 50, date: '2026-10-04', category: 'Facility' }];

  const fin = sandbox.calcFin(session);
  assert.equal(fin.linkedCosts, 50);
  assert.equal(fin.legacyCosts, 40);
  assert.equal(fin.extraCosts, 90);
  assert.equal(money(fin.profit), money(fin.revenue - fin.instrFee - 90));

  const buckets = sandbox.financeRevenueBuckets(OCT, 'yearly');
  sandbox.applyFinanceExpenses(buckets, 'yearly');
  const year = buckets['2026'];
  assert.equal(year.rev, fin.revenue);
  assert.equal(year.linked, 50);
  assert.equal(year.legacy, 40);
  assert.equal(year.overhead, 0);
  assert.equal(money(year.cost), money(fin.instrFee + 40 + 50));
  assert.notEqual(money(year.cost), money(fin.instrFee + 40 + 50 + 50));

  const fig = sandbox.financeYearFigures(year.rev, year.fee, year.cost);
  assert.equal(money(fig.profit), money(fin.revenue - (fin.instrFee + 40 + 50)));
});

test('a resolved legacy line stops counting and an unresolved line still counts', () => {
  const session = {
    id: 'leg',
    course: 'Safe Sitter®',
    date: '2026-06-01',
    priceOverride: 225,
    additionalCosts: [
      { label: 'Parking', amount: 25 },
      { label: 'Printing', amount: 15, resolved: 'moved', expenseId: 'e9' },
      { label: 'Copy already in Finances', amount: 8, resolved: 'duplicate', expenseId: 'e8' },
      { label: 'Safe Sitter® materials — 2 × $20.35', amount: 40.7 }
    ]
  };
  sandbox.sessions = [session];
  sandbox.registrations = [];
  sandbox.expenses = [];
  sandbox.jobDataCache = {};
  const fin = sandbox.calcFin(session);
  assert.equal(fin.legacyCosts, 25);
  assert.equal(fin.linkedCosts, 0);
  assert.equal(fin.extraCosts, 25);
  const buckets = sandbox.financeRevenueBuckets(new Date(2026, 5, 1), 'yearly');
  assert.equal(buckets['2026'].legacy, 25);
  assert.equal(money(buckets['2026'].cost), money(fin.instrFee + 25));
});

test('partner direct costs match the old sum when nothing is resolved or linked', () => {
  const session = {
    id: 'ss-partner',
    course: 'Safe Sitter®',
    date: '2026-10-04',
    priceOverride: 225,
    additionalCosts: [
      { label: 'Facility rental', amount: 40 },
      { label: 'Safe Sitter® materials — 8 × $20.35', amount: 162.8 }
    ]
  };
  sandbox.sessions = [session];
  sandbox.expenses = [];
  sandbox.jobDataCache = {};
  sandbox.registrations = Array.from({ length: 8 }, (_, i) => ({
    id: 'r' + i, sessionId: 'ss-partner', payStatus: 'paid'
  }));
  const fin = sandbox.calcFin(session);
  const allowance = 8 * 20.35;
  assert.equal(sandbox.participantMaterialAllowance(session), allowance);
  assert.equal(sandbox.partnerDirectCosts(session), money(fin.instrFee + allowance + 40 + 162.8));
});

test('cancelled sessions leave revenue and unpaid estimates out of every finance total', () => {
  const cancelled = {
    id: 'cx',
    course: 'Safe Sitter®',
    date: '2026-10-04',
    isCancelled: true,
    priceOverride: 225,
    additionalCosts: [
      { label: 'Parking estimate', amount: 30 },
      { label: 'Facility already paid', amount: 40, datePaid: '2026-09-01' },
      { label: 'Moved', amount: 12, resolved: 'moved', expenseId: 'e2', datePaid: '2026-09-01' }
    ]
  };
  const job = {
    id: 'cj',
    isCustomJob: true,
    isCancelled: true,
    course: 'Community fair',
    date: '2026-11-02',
    priceOverride: 500,
    instrPayOverride: 150,
    additionalCosts: [{ label: 'Guess', amount: 20 }]
  };
  sandbox.sessions = [cancelled, job];
  sandbox.registrations = [{ id: 'paid', sessionId: 'cx', payStatus: 'paid' }];
  sandbox.expenses = [{ id: 'e3', sessionId: 'cx', amount: 25, date: '2026-10-20', category: 'Other' }];
  sandbox.jobDataCache = {
    cx: { payStatus: 'paid', paidFee: 100, referralBonus: 25 }
  };

  const live = sandbox.calcFin(cancelled);
  assert.ok(live.revenue > 0);
  assert.ok(live.instrFee > 0);

  const figs = sandbox.financeSessionFigures(cancelled);
  assert.equal(figs.rev, 0);
  assert.equal(figs.fee, 0);
  assert.equal(figs.instr, 100);
  assert.equal(figs.legacy, 40);
  assert.equal(figs.sess, 0);
  assert.equal(figs.students, 0);

  sandbox.jobDataCache = { cx: { payStatus: 'paid', paidFee: null, secondInstrPaid: true } };
  assert.equal(sandbox.paidOutInstructorFee(cancelled), 0);
  sandbox.jobDataCache = { cx: { payStatus: 'paid', paidFee: 100, secondInstrPaid: true, secondInstrPaidFee: 40 } };
  assert.equal(sandbox.paidOutInstructorFee(cancelled), 140);
  sandbox.jobDataCache = { cx: { payStatus: 'paid', paidFee: 100, referralBonus: 25 } };

  const jobFigs = sandbox.financeSessionFigures(job);
  assert.equal(jobFigs.rev, 0);
  assert.equal(jobFigs.instr, 0);
  assert.equal(jobFigs.legacy, 0);
  assert.equal(jobFigs.sess, 0);

  const yearly = sandbox.financeRevenueBuckets(OCT, 'yearly');
  sandbox.applyFinanceExpenses(yearly, 'yearly');
  assert.equal(yearly['2026'].rev, 0);
  assert.equal(yearly['2026'].fee, 0);
  assert.equal(yearly['2026'].sess, 0);
  assert.equal(yearly['2026'].instr, 100);
  assert.equal(yearly['2026'].legacy, 40);
  assert.equal(yearly['2026'].linked, 25);
  assert.equal(yearly['2026'].cost, 165);

  const monthly = sandbox.financeRevenueBuckets(OCT, 'monthly');
  sandbox.applyFinanceExpenses(monthly, 'monthly');
  assert.equal(monthly['2026-10'].rev, 0);
  assert.equal(monthly['2026-10'].instr, 100);
  assert.equal(monthly['2026-10'].legacy, 40);
  assert.equal(monthly['2026-10'].linked, 25);
  assert.equal(monthly['2026-10'].cost, 165);
  assert.equal(monthly['2026-11'], undefined);

  sandbox.expenses.push({ id: 'oh', amount: 80, date: '2026-10-01', category: 'Insurance' });
  const monthlyOverhead = sandbox.financeRevenueBuckets(OCT, 'monthly');
  sandbox.applyFinanceExpenses(monthlyOverhead, 'monthly');
  assert.equal(monthlyOverhead['2026-10'].overhead || 0, 0);
  assert.equal(monthlyOverhead['2026-10'].cost, 165);
  const yearlyOverhead = sandbox.financeRevenueBuckets(OCT, 'yearly');
  sandbox.applyFinanceExpenses(yearlyOverhead, 'yearly');
  assert.equal(yearlyOverhead['2026'].overhead, 80);
  assert.equal(yearlyOverhead['2026'].linked, 25);
  assert.equal(yearlyOverhead['2026'].cost, 245);

  const dash = sandbox.dashboardRevenueTotals(OCT);
  assert.equal(dash.mRev, 0);
  assert.equal(dash.yRev, 0);
  assert.equal(dash.mCost, 140);

  const chart = sandbox.dashboardChartRevenue(OCT);
  assert.equal(chart.buckets['2026-10'].rev, 0);
  assert.equal(chart.buckets['2026-10'].cost, 165);

  const annual = sandbox.annualSessionBuckets(2026, OCT);
  assert.equal(annual.months[9].rev, 0);
  assert.equal(annual.months[9].instr, 100);
  assert.equal(annual.months[9].legacy, 40);
  assert.equal(annual.months[9].sess, 0);
  assert.equal(annual.months[10].sess, 0);
  assert.equal(annual.months[10].rev, 0);
  assert.equal(sandbox.courseRevenueForYear(2026, OCT)['Safe Sitter®'].rev, 0);
  assert.equal(sandbox.courseRevenueForYear(2026, OCT)['Safe Sitter®'].sess, 0);

  sandbox.profitShowCancelled = false;
  assert.equal(sandbox.profitBySessionRows(2026).length, 0);
  sandbox.profitShowCancelled = true;
  const rows = sandbox.profitBySessionRows(2026);
  const row = rows.find((r) => r.s.id === 'cx');
  assert.equal(row.rev, 0);
  assert.equal(row.instr, 100);
  assert.equal(row.linked, 25);
  assert.equal(row.legacy, 40);
  assert.equal(row.profit, -165);
  const jobRow = rows.find((r) => r.s.id === 'cj');
  assert.equal(jobRow.rev, 0);
  assert.equal(jobRow.instr, 0);
  assert.equal(jobRow.legacy, 0);
  assert.equal(jobRow.profit, 0);
  sandbox.profitShowCancelled = false;
});

test('a cancelled session with only an estimate adds nothing, and its linked expense still counts once', () => {
  const session = {
    id: 'est',
    course: 'Safe Sitter®',
    date: '2026-03-01',
    isCancelled: true,
    priceOverride: 225,
    additionalCosts: [{ label: 'Maybe', amount: 10 }]
  };
  sandbox.sessions = [session];
  sandbox.registrations = [{ id: 'paid', sessionId: 'est', payStatus: 'paid' }];
  sandbox.jobDataCache = {};
  sandbox.expenses = [{ id: 'le', sessionId: 'est', amount: 18, date: '2026-03-15', category: 'Other' }];
  const now = new Date(2026, 2, 20);
  const before = sandbox.financeRevenueBuckets(now, 'yearly');
  assert.equal(before['2026'], undefined);
  sandbox.applyFinanceExpenses(before, 'yearly');
  assert.equal(before['2026'].rev, 0);
  assert.equal(before['2026'].instr, 0);
  assert.equal(before['2026'].legacy, 0);
  assert.equal(before['2026'].linked, 18);
  assert.equal(before['2026'].cost, 18);
  assert.equal(sandbox.dashboardRevenueTotals(now).yRev, 0);
  assert.equal(sandbox.dashboardRevenueTotals(now).mCost, 0);
  assert.equal(sandbox.dashboardChartRevenue(now).buckets['2026-03'].cost, 18);
  assert.equal(sandbox.dashboardChartRevenue(now).buckets['2026-03'].rev, 0);
  assert.equal(sandbox.courseRevenueForYear(2026, now)['Safe Sitter®'], undefined);
});

test('printed reports use the same cancelled and once-count rules', () => {
  const yearFn = extractFunction(admin, 'printYearReport');
  assert.match(yearFn, /annualSessionBuckets\(/);
  assert.match(yearFn, /if\(e\.sessionId\)\{months\[mi\]\.linked\+=amt;months\[mi\]\.cost\+=amt;\}/);
  assert.match(yearFn, /months\[mi\]\.overhead\+=amt;months\[mi\]\.cost\+=amt/);
  assert.match(yearFn, /Older session costs/);
  assert.match(yearFn, /A cancelled session adds no revenue and no estimated instructor pay/);
  assert.doesNotMatch(yearFn, /Extra session costs/);

  const monthFn = extractFunction(admin, 'printMonthReport');
  assert.match(monthFn, /sessionsForRevenueMonth\(/);
  assert.match(monthFn, /financeSessionFigures\(s\)/);
  assert.match(monthFn, /tot\.cost=round2\(tot\.instr\+tot\.legacy\+tot\.linked\+tot\.comm\)/);
  assert.match(monthFn, /instructor pay that was marked paid/);
  assert.doesNotMatch(monthFn, /tot\.cost\+=f\.totalCost/);
  assert.doesNotMatch(monthFn, /Extra costs/);
});
