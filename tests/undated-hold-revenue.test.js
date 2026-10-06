'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

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
  'holdPaymentReceived', 'undatedHoldMoneyIn',
  'holdTermYear', 'sessionClassDate', 'sessionRevenueSlot', 'sessionReportDateLabel',
  'sessionsForRevenueMonth', 'dashboardRevenueTotals', 'dashboardChartRevenue',
  'financeRevenueBuckets', 'emptyRevBucket', 'annualSessionBuckets', 'courseRevenueForYear'
];

const sandbox = {
  COURSES: {
    'Safe@Home': { price: 65, matCost: 10, hours: 1.5, maxStudents: 16 },
    'Intro to Babysitting': { price: 40, matCost: 10, hours: 1, maxStudents: 20 }
  },
  sessions: [],
  registrations: [],
  instructors: [],
  jobDataCache: {},
  INSTR_RATE: 50,
  INSTR_EXTRA_HOURS: 0.5,
  PAYPAL_PCT: 0.0299,
  PAYPAL_FIXED: 0.49,
  getCoursePrice: () => 65,
  Array, Object, JSON, Date, Number, Math, String, parseInt, isNaN
};
vm.createContext(sandbox);
vm.runInContext(names.map((n) => extractFunction(admin, n)).join('\n'), sandbox);

const SEP_2026 = new Date(2026, 8, 28);
const SEP_2025 = new Date(2025, 8, 28);
const OCT_2026 = new Date(2026, 9, 15);

function useSessions(list, regs) {
  sandbox.sessions = list;
  sandbox.registrations = regs || [];
  sandbox.jobDataCache = {};
}

function sahHold(overrides) {
  return Object.assign({
    id: 'sah-h1862',
    code: 'SAH-H1862',
    course: 'Safe@Home',
    date: '',
    isHold: true,
    holdTerm: 'Fall 2026',
    billToOrg: 'Girl Scouts – Wyngate',
    billedHeadcount: 12,
    holdPayment: 'Paid by check, $780 ',
    isCustomJob: false,
    additionalCosts: []
  }, overrides || {});
}

test('Wyngate’s deposited check counts in 2026 year-to-date and in the current month', () => {
  const hold = sahHold();
  useSessions([hold]);
  const fin = sandbox.calcFin(hold);
  assert.equal(fin.revenue, 780);

  const totals = sandbox.dashboardRevenueTotals(SEP_2026);
  assert.equal(totals.yRev, 780);
  assert.equal(totals.mRev, 780);
  assert.equal(hold.date, '');

  const chart = sandbox.dashboardChartRevenue(SEP_2026);
  assert.equal(chart.buckets['2026-09'].rev, 780);
  assert.equal(chart.buckets['2026-08'].rev, 0);
  assert.equal(chart.keys.length, 6);

  const yearly = sandbox.financeRevenueBuckets(SEP_2026, 'yearly');
  assert.equal(yearly['2026'].rev, 780);
  assert.equal(yearly['2026'].sess, 1);
  const monthly = sandbox.financeRevenueBuckets(SEP_2026, 'monthly');
  assert.equal(monthly['2026-09'].rev, 780);
  assert.equal(monthly['2026-08'], undefined);

  const annual = sandbox.annualSessionBuckets(2026, SEP_2026);
  assert.equal(annual.months[8].rev, 780);
  assert.equal(annual.months[8].sess, 1);
  assert.equal(annual.undated.rev, 0);
  assert.equal(annual.undated.sess, 0);
  assert.equal(sandbox.courseRevenueForYear(2026, SEP_2026)['Safe@Home'].rev, 780);

  const listed = sandbox.sessionsForRevenueMonth(2026, 8, SEP_2026);
  assert.deepEqual(listed.map((s) => s.id), ['sah-h1862']);
  assert.equal(sandbox.sessionReportDateLabel(hold), '(on hold) Fall 2026');
});

test('a dated class stays in its own month while the undated hold still fills year-to-date', () => {
  const hold = sahHold();
  const january = sahHold({
    id: 'sah-jan',
    date: '2026-01-10',
    isHold: false,
    holdTerm: '',
    billedHeadcount: 1,
    billToOrg: 'Library'
  });
  useSessions([january, hold]);
  const totals = sandbox.dashboardRevenueTotals(SEP_2026);
  assert.equal(totals.yRev, 65 + 780);
  assert.equal(totals.mRev, 780);
  const chart = sandbox.dashboardChartRevenue(SEP_2026);
  assert.equal(chart.buckets['2026-09'].rev, 780);
  assert.equal(chart.buckets['2026-01'], undefined);
  assert.deepEqual(
    sandbox.sessionsForRevenueMonth(2026, 0, SEP_2026).map((s) => s.id),
    ['sah-jan']
  );
  assert.equal(
    sandbox.sessionReportDateLabel(january),
    new Date('2026-01-10T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
  );
});

test('a hold that already has a date keeps that month instead of the hold term', () => {
  const held = sahHold({
    date: '2026-09-02',
    billedHeadcount: 1,
    billToOrg: 'Library'
  });
  useSessions([held]);
  const slot = sandbox.sessionRevenueSlot(held, OCT_2026);
  assert.equal(slot.undatedHold, false);
  assert.equal(slot.year, 2026);
  assert.equal(slot.month, 8);
  const totals = sandbox.dashboardRevenueTotals(OCT_2026);
  assert.equal(totals.yRev, 65);
  assert.equal(totals.mRev, 0);
  assert.equal(sandbox.dashboardChartRevenue(OCT_2026).buckets['2026-10'].rev, 0);
  assert.equal(sandbox.dashboardChartRevenue(OCT_2026).buckets['2026-09'].rev, 65);
  assert.equal(held.date, '2026-09-02');
});

test('an undated hold for another year is in that yearly total and not in any month', () => {
  const hold = sahHold({ holdTerm: 'Spring 2027' });
  useSessions([hold]);
  const totals = sandbox.dashboardRevenueTotals(SEP_2026);
  assert.equal(totals.yRev, 0);
  assert.equal(totals.mRev, 0);
  assert.equal(sandbox.dashboardChartRevenue(SEP_2026).buckets['2026-09'].rev, 0);
  assert.equal(sandbox.financeRevenueBuckets(SEP_2026, 'monthly')['2026-09'], undefined);
  assert.equal(sandbox.financeRevenueBuckets(SEP_2026, 'yearly')['2027'].rev, 780);
  const annual = sandbox.annualSessionBuckets(2027, SEP_2026);
  assert.equal(annual.undated.rev, 780);
  assert.equal(annual.undated.sess, 1);
  assert.ok(annual.months.every((m) => m.rev === 0 && m.sess === 0));
  assert.equal(sandbox.sessionsForRevenueMonth(2027, 8, SEP_2026).length, 0);
  assert.equal(sandbox.sessionsForRevenueMonth(2026, 8, SEP_2026).length, 0);
  assert.equal(sandbox.courseRevenueForYear(2027, SEP_2026)['Safe@Home'].rev, 780);
});

test('a hold term with no year uses the current calendar year', () => {
  const hold = sahHold({ holdTerm: 'Fall' });
  useSessions([hold]);
  assert.equal(sandbox.holdTermYear('Fall', SEP_2025), 2025);
  assert.equal(sandbox.holdTermYear('Fall 2026', SEP_2025), 2026);
  assert.equal(sandbox.holdTermYear('2025-2026 school year', SEP_2026), 2025);
  const totals = sandbox.dashboardRevenueTotals(SEP_2025);
  assert.equal(totals.yRev, 780);
  assert.equal(totals.mRev, 780);
  const slot = sandbox.sessionRevenueSlot(hold, SEP_2025);
  assert.equal(slot.year, 2025);
  assert.equal(slot.month, 8);
  assert.equal(slot.undatedHold, true);
});

test('a blank, invalid, or missing date is treated as undated, and unpaid holds stay out', () => {
  const invalid = sahHold({ date: 'not-a-date' });
  const missing = sahHold({ id: 'missing', date: null });
  const blank = sahHold({ id: 'blank', date: '   ' });
  const openUndated = sahHold({ id: 'open', isHold: false, date: '' });
  const unpaid = sahHold({ id: 'unpaid', billedHeadcount: 0, billToOrg: '' });
  useSessions([invalid, missing, blank, openUndated, unpaid]);
  const totals = sandbox.dashboardRevenueTotals(SEP_2026);
  assert.equal(totals.yRev, 780 * 3);
  assert.equal(totals.mRev, 780 * 3);
  assert.equal(invalid.date, 'not-a-date');
  assert.equal(missing.date, null);
  assert.equal(sandbox.sessionsForRevenueMonth(2026, 8, SEP_2026).length, 3);
});

test('an unpaid org roster is not revenue, and a future-invoice note is not a deposit', () => {
  const beth = sahHold({
    id: 'beth',
    code: 'SAH-BETH',
    billToOrg: 'Congregation Beth El',
    billedHeadcount: 10,
    holdPayment: '',
    holdTerm: 'Fall 2026'
  });
  const troop = {
    id: 'troop',
    course: 'Girl Scouts — First Aid Badge Workshop',
    date: '',
    isHold: true,
    isCustomJob: true,
    holdTerm: 'Fall 2026',
    billToOrg: 'Girl Scout Troop 34182',
    billedHeadcount: 15,
    priceOverride: 675,
    holdPayment: 'Split: families pay reduced rate at registration; troop invoiced for remainder (portion TBD).',
    additionalCosts: []
  };
  const quoted = {
    id: 'quoted',
    course: 'Workshop',
    date: '',
    isHold: true,
    isCustomJob: true,
    holdTerm: 'Fall 2026',
    priceOverride: 500,
    holdPayment: '',
    additionalCosts: []
  };
  useSessions([beth, troop, quoted]);
  assert.equal(sandbox.calcFin(beth).revenue, 650);
  assert.equal(sandbox.calcFin(troop).revenue, 675);
  assert.equal(sandbox.calcFin(quoted).revenue, 500);
  assert.equal(sandbox.holdPaymentReceived(beth), false);
  assert.equal(sandbox.holdPaymentReceived(troop), false);
  assert.equal(sandbox.holdPaymentReceived(sahHold()), true);
  assert.equal(sandbox.holdPaymentReceived({ holdPayment: 'Check deposited' }), true);
  assert.equal(sandbox.undatedHoldMoneyIn(beth), false);
  const totals = sandbox.dashboardRevenueTotals(SEP_2026);
  assert.equal(totals.yRev, 0);
  assert.equal(totals.mRev, 0);
  assert.equal(sandbox.financeRevenueBuckets(SEP_2026, 'yearly')['2026'], undefined);
  assert.equal(sandbox.sessionRevenueSlot(beth, SEP_2026), null);
  assert.equal(sandbox.sessionRevenueSlot(troop, SEP_2026), null);
  assert.equal(sandbox.sessionRevenueSlot(quoted, SEP_2026), null);
});

test('Nesbitt paid registrations count on an undated hold with no org bill', () => {
  const nesbitt = {
    id: 'nesbitt',
    course: 'Safe Sitter®',
    date: '',
    isHold: true,
    holdTerm: '',
    holdPayment: '',
    billToOrg: '',
    billedHeadcount: null,
    location: "The Nesbitt's",
    additionalCosts: []
  };
  useSessions([nesbitt], [
    { id: 'n1', sessionId: 'nesbitt', payStatus: 'paid' },
    { id: 'n2', sessionId: 'nesbitt', payStatus: 'paid' },
    { id: 'n3', sessionId: 'nesbitt', payStatus: 'unpaid' }
  ]);
  const fin = sandbox.calcFin(nesbitt);
  assert.equal(fin.paidCount, 2);
  assert.ok(fin.revenue > 0);
  assert.equal(sandbox.undatedHoldMoneyIn(nesbitt), true);
  const totals = sandbox.dashboardRevenueTotals(SEP_2026);
  assert.equal(totals.yRev, fin.revenue);
  assert.equal(totals.mRev, fin.revenue);
  const slot = sandbox.sessionRevenueSlot(nesbitt, SEP_2026);
  assert.equal(slot.year, 2026);
  assert.equal(slot.month, 8);
  assert.equal(slot.undatedHold, true);
});

test('paid registrations and a collected custom-job fee on an undated hold count', () => {
  const paid = sahHold({
    id: 'paid-hold',
    billToOrg: '',
    billedHeadcount: 0,
    holdPayment: ''
  });
  const job = {
    id: 'job-hold',
    course: 'Community fair',
    date: '',
    isHold: true,
    isCustomJob: true,
    holdTerm: 'Fall 2026',
    holdPayment: 'Paid by check, $400',
    priceOverride: 400,
    instrPayOverride: 100,
    additionalCosts: []
  };
  const emptyJob = Object.assign({}, job, { id: 'empty-job', priceOverride: 0 });
  useSessions([paid, job, emptyJob], [
    { id: 'r1', sessionId: 'paid-hold', payStatus: 'paid' }
  ]);
  const paidFin = sandbox.calcFin(paid);
  assert.ok(paidFin.revenue > 0);
  assert.ok(paidFin.revenue < 65);
  const totals = sandbox.dashboardRevenueTotals(SEP_2026);
  assert.equal(totals.yRev, paidFin.revenue + 400);
  assert.equal(totals.mRev, paidFin.revenue + 400);
  assert.equal(sandbox.financeRevenueBuckets(SEP_2026, 'yearly')['2026'].sess, 2);
  assert.equal(job.date, '');
  assert.equal(sandbox.sessionReportDateLabel(job), '(on hold) Fall 2026');
  assert.equal(sandbox.sessionReportDateLabel(sahHold({ holdTerm: '' })), '(on hold)');
});

test('revenue placement does not invent a class date, and holds stay off public signup and invoices', () => {
  assert.doesNotMatch(extractFunction(admin, 'sessionRevenueSlot'), /\.date\s*=/);
  assert.doesNotMatch(extractFunction(admin, 'holdTermYear'), /\.date\s*=/);
  assert.match(admin, /date:s\.date\|\|null/);
  assert.match(admin, /if\(s\.isHold\|\|s\.isCancelled\|\|!s\.billToOrg\|\|!s\.date\)return/);
  const pub = fs.readFileSync(path.join(root, 'js/public-sessions.js'), 'utf8');
  assert.match(pub, /flagOn\(row, 'is_hold'\) \|\| flagOn\(row, 'isHold'\)\) return false/);
});
