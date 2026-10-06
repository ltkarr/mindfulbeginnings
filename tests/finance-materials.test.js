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
  'participantMaterialAllowance',
  'processingFee', 'isLiveReg', 'regEffectivePrice',
  'instrBaseFee', 'instrDisplayFee', 'secondInstrDisplayFee',
  'orgPortionAmount', 'familyPrice', 'orgBillRate', 'orgRevenueHeadcount', 'orgBillAmount',
  'calcFin', 'round2', 'financeYearFigures', 'partnerDirectCosts', 'loadEditCosts'
];

const sandbox = {
  COURSES: {
    'Safe Sitter®': { price: 225, matCost: 20.35, hours: 5, maxStudents: 16 },
    'Intro to Babysitting': { price: 40, matCost: 10, hours: 1, maxStudents: 20 }
  },
  registrations: [],
  instructors: [],
  jobDataCache: {},
  _editCosts: [],
  INSTR_RATE: 50,
  INSTR_EXTRA_HOURS: 0.5,
  PAYPAL_PCT: 0.0299,
  PAYPAL_FIXED: 0.49,
  getCoursePrice: () => 225,
  JSON,
  Date, Number, Math, String
};
vm.createContext(sandbox);
vm.runInContext(names.map((n) => extractFunction(admin, n)).join('\n'), sandbox);

function fee(amount) {
  return amount * 0.0299 + 0.49;
}

test('a Safe Sitter class no longer subtracts the per-student handbook rate from profit', () => {
  const session = {
    id: 'ss-1',
    course: 'Safe Sitter®',
    date: '2026-10-04',
    priceOverride: 225,
    additionalCosts: [
      { label: 'Facility rental', amount: 40 },
      { label: 'Safe Sitter® materials — 8 × $20.35', amount: 162.8 }
    ]
  };
  sandbox.registrations = Array.from({ length: 8 }, (_, i) => ({
    id: 'r' + i, sessionId: 'ss-1', payStatus: 'paid'
  }));
  sandbox.jobDataCache = {};
  const fin = sandbox.calcFin(session);
  const revenue = 8 * (225 - fee(225));
  const instructor = 5 * 50 + 50 + 0.5 * 50; // hours + travel + extra half hour
  const oldHandbook = 8 * 20.35;

  assert.equal(fin.matCost, 0);
  assert.equal(fin.extraCosts, 40);
  assert.equal(fin.instrFee, instructor);
  assert.equal(Math.round(fin.revenue * 100) / 100, Math.round(revenue * 100) / 100);
  assert.equal(Math.round(fin.profit * 100) / 100, Math.round((revenue - instructor - 40) * 100) / 100);
  // Before, the same class also lost the generated materials line and 8 × $20.35.
  const oldProfit = revenue - instructor - 40 - 162.8 - oldHandbook;
  assert.equal(Math.round((fin.profit - oldProfit) * 100) / 100, Math.round((162.8 + oldHandbook) * 100) / 100);

  // Yearly finances add the overhead handbook order on top of session cost.
  // The order is counted once. It is not also inside session profit.
  const overheadOrder = 162.8;
  const yearProfit = fin.revenue - (fin.totalCost + overheadOrder);
  const oldYearProfit = fin.revenue - (instructor + 40 + 162.8 + oldHandbook + overheadOrder);
  assert.equal(Math.round((yearProfit - oldYearProfit) * 100) / 100, Math.round((162.8 + oldHandbook) * 100) / 100);

  // Partner statements still treat the allowance, and any stored job line, as a direct cost.
  assert.equal(sandbox.participantMaterialAllowance(session), oldHandbook);
  assert.equal(sandbox.partnerDirectCosts(session), Math.round((instructor + oldHandbook + 40 + 162.8) * 100) / 100);
});

test('host seats are free of the partner allowance, and org headcount still counts for it', () => {
  const session = {
    id: 'ss-2',
    course: 'Safe Sitter®',
    date: '2026-10-11',
    priceOverride: 225,
    billToOrg: 'Beth El',
    billedHeadcount: 5,
    additionalCosts: []
  };
  sandbox.registrations = [
    { id: 'a', sessionId: 'ss-2', payStatus: 'paid' },
    { id: 'b', sessionId: 'ss-2', payStatus: 'unpaid' },
    { id: 'c', sessionId: 'ss-2', payStatus: 'host' },
    { id: 'd', sessionId: 'ss-2', payStatus: 'waitlist' },
    { id: 'e', sessionId: 'ss-2', payStatus: 'cancelled' }
  ];
  sandbox.jobDataCache = {};
  const fin = sandbox.calcFin(session);
  // Revenue is the one paid registration plus 5 invoiced org seats. No processing fee on the org invoice.
  const revenue = (225 - fee(225)) + 5 * 225;
  assert.equal(fin.matCost, 0);
  assert.equal(Math.round(fin.revenue * 100) / 100, Math.round(revenue * 100) / 100);
  assert.equal(fin.profit, fin.revenue - fin.instrFee);
  // Paid + unpaid, not the host, plus the org roster. Waitlist and cancelled stay out.
  assert.equal(sandbox.participantMaterialAllowance(session), (2 + 5) * 20.35);
});

test('a custom job keeps facility costs and drops a per-student materials line from profit', () => {
  const job = {
    id: 'job-1',
    isCustomJob: true,
    course: 'Community fair',
    instrPayOverride: 150,
    priceOverride: 500,
    additionalCosts: [
      { label: 'Parking', amount: 25 },
      { label: 'Intro to Babysitting materials — 6 × $10.00', amount: 60 }
    ]
  };
  sandbox.registrations = [];
  const fin = sandbox.calcFin(job);
  assert.equal(fin.matCost, 0);
  assert.equal(fin.extraCosts, 25);
  assert.equal(fin.instrFee, 150);
  assert.equal(fin.profit, 500 - 150 - 25);
  assert.equal(sandbox.participantMaterialAllowance(job), 0);
  assert.equal(sandbox.partnerDirectCosts(job), 150 + 25 + 60);

  sandbox.loadEditCosts(job.additionalCosts);
  assert.deepEqual(sandbox._editCosts.map((c) => c.label), ['Parking']);
});

test('a hold keeps the same paid revenue as the open class', () => {
  const open = {
    id: 'ss-hold',
    course: 'Safe Sitter®',
    date: '2026-10-18',
    priceOverride: 225,
    isHold: false,
    additionalCosts: [{ label: 'Facility rental', amount: 40 }]
  };
  const held = Object.assign({}, open, { isHold: true });
  sandbox.registrations = [
    { id: 'paid', sessionId: 'ss-hold', payStatus: 'paid' },
    { id: 'wait', sessionId: 'ss-hold', payStatus: 'unpaid' }
  ];
  sandbox.jobDataCache = {};
  const openFin = sandbox.calcFin(open);
  const heldFin = sandbox.calcFin(held);
  assert.ok(heldFin.revenue > 0);
  assert.equal(heldFin.revenue, openFin.revenue);
  assert.equal(heldFin.paidCount, 1);
  assert.equal(heldFin.profit, openFin.profit);
  assert.equal(sandbox.participantMaterialAllowance(held), sandbox.participantMaterialAllowance(open));
});

test('a hand-typed job cost that is not a generated materials line still reduces profit', () => {
  assert.equal(sandbox.isPerStudentMaterialLine({ label: 'Facility rental' }), false);
  assert.equal(sandbox.isPerStudentMaterialLine({ label: 'Safe Sitter handbooks' }), false);
  assert.equal(sandbox.sessionExtraCosts([
    { label: 'Safe Sitter handbooks', amount: 80 },
    { label: 'Safe Sitter® materials — 4 × $20.35', amount: 81.4 }
  ]), 80);
});

test('yearly finances count processing fees once as their own cost', () => {
  const fig = sandbox.financeYearFigures(1000, 40.5, 300);
  assert.equal(fig.gross, 1040.5);
  assert.equal(fig.fees, 40.5);
  assert.equal(fig.expenses, 340.5);
  assert.equal(fig.profit, 700);
  // Net revenue minus other costs is the same profit. Subtracting the fee again would be 659.5.
  assert.equal(fig.profit, 1000 - 300);
  assert.notEqual(fig.profit, 1000 - 300 - 40.5);

  const session = {
    id: 'fee-year',
    course: 'Safe Sitter®',
    date: '2026-10-04',
    priceOverride: 225,
    additionalCosts: []
  };
  sandbox.registrations = [{ id: 'paid', sessionId: 'fee-year', payStatus: 'paid' }];
  sandbox.jobDataCache = {};
  const fin = sandbox.calcFin(session);
  const year = sandbox.financeYearFigures(fin.revenue, fin.procFee, fin.totalCost);
  assert.equal(Math.round(year.gross * 100) / 100, 225);
  assert.equal(Math.round(year.fees * 100) / 100, Math.round(fee(225) * 100) / 100);
  assert.equal(Math.round(year.profit * 100) / 100, Math.round(fin.profit * 100) / 100);
  assert.equal(Math.round((year.gross - year.fees - (year.expenses - year.fees)) * 100) / 100, Math.round(year.profit * 100) / 100);

  const finStart = admin.indexOf('function renderFinances(');
  const finEnd = admin.indexOf('// ─── CODES', finStart);
  const screen = admin.slice(finStart, finEnd);
  assert.match(screen, /financeYearFigures/);
  assert.match(screen, /Payment processing fees/);
  assert.match(screen, /id="fin-fee-section"|fin-fee-section/);
  assert.match(screen, /Gross payments are shown before the fee/);
  const yearlyTitle = screen.slice(screen.indexOf('const feeTitle'));
  assert.match(yearlyTitle, /included once in Total expenses/);
  assert.match(admin, /<h2>Payment processing fees<\/h2>/);
  assert.match(admin, /Processing fees for \$\{year\}/);
  assert.match(admin, /does not subtract it a second time/);
  assert.match(admin, /includes \$\{fmtN\(tot\.fee\)\} card fees/);
});

test('finances screens no longer show a per-student material cost column', () => {
  assert.doesNotMatch(admin, />Material cost</);
  assert.doesNotMatch(admin, /Student materials/);
  assert.doesNotMatch(admin, /function materialRateCourses/);
  assert.doesNotMatch(admin, /function addMaterialsCost/);
  assert.doesNotMatch(admin, /function materialsPickerHtml/);
  assert.match(admin, /handbook or supply orders/);
  assert.match(admin, /they are not also taken off each class/);
  assert.doesNotMatch(admin, /student handbooks, facility rental/);
  const finStart = admin.indexOf('function renderFinances(');
  const finEnd = admin.indexOf('// ─── CODES', finStart);
  const fin = admin.slice(finStart, finEnd);
  assert.match(fin, /applyFinanceExpenses\(buckets, finView\)/);
  assert.match(admin, /buckets\[k\]\.overhead\+=e\.amount;buckets\[k\]\.cost\+=e\.amount/);
  assert.doesNotMatch(fin, /b\.mat/);
});
