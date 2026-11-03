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
  'paidTravelHoursOf', 'sessionTeachingHours', 'instrBaseFee', 'instrDisplayFee', 'secondInstrDisplayFee',
  'payOverrideIsSet', 'sessionJobData', 'sessionPrimaryInstructorId', 'instrEstimateFee', 'instructorCostIsEstimate',
  'orgPortionAmount', 'familyPrice', 'orgBillRate', 'orgRevenueHeadcount', 'orgBillAmount',
  'calcFin', 'round2', 'financeYearFigures', 'partnerDirectCosts',
  'financeSessionFigures', 'financeRevenueSlot',
  'holdPaymentReceived', 'undatedHoldMoneyIn', 'holdTermYear', 'sessionClassDate', 'sessionRevenueSlot',
  'orgOrJobFeeReceived', 'sessionCashSplit',
  'dashboardRevenueTotals', 'dashboardChartRevenue',
  'financeRevenueBuckets', 'emptyRevBucket', 'applyFinanceExpenses',
  'annualSessionBuckets', 'courseRevenueForYear', 'profitBySessionRows',
  'expenseIsInventoryPurchase', 'inventoryPurchaseForExpense', 'inventoryUnitCost',
  'inventoryRegCounts', 'inventoryStudentCount', 'courseMaterialUsesFor',
  'inventoryItemById', 'inventoryCostForSession', 'inventoryItemRollup',
  'expenseNeedsInventoryQuantity', 'fmtQty',
  'normalizeExpenseRecurrence', 'expenseRecurDate', 'expenseRecurHorizon', 'expenseOccurrences',
  'normalizeExpensePay', 'paidWithKey', 'emptyPaidWith', 'addPaidWith', 'paidWithDateInPeriod',
  'legacyLineInPaidWith', 'legacyPaidWithYmd', 'legacyLineInPaidWithPeriod',
  'paidWithTotals', 'paidWithTotal'
];

const sandbox = {
  COURSES: {
    'Safe Sitter®': { price: 225, matCost: 20.35, hours: 5, maxStudents: 16 },
    'Red Cross Babysitter\'s Training + Pediatric First Aid/CPR/AED': { price: 295, matCost: 0, hours: 7.3333, maxStudents: 12 }
  },
  EXP_PAY_METHODS: [['amex', 'Amex'], ['visa', 'Visa']],
  sessions: [],
  registrations: [],
  instructors: [],
  expenses: [],
  inventoryItems: [],
  inventoryPurchases: [],
  courseMaterialUses: [],
  jobDataCache: {},
  invoices: [],
  profitShowCancelled: false,
  INSTR_RATE: 50,
  INSTR_EXTRA_HOURS: 0.5,
  PAYPAL_PCT: 0.0299,
  PAYPAL_FIXED: 0.49,
  getCoursePrice: () => 225,
  Array, Object, JSON, Date, Number, Math, String, parseInt, isNaN, isFinite
};
vm.createContext(sandbox);
vm.runInContext(names.map((n) => extractFunction(admin, n)).join('\n'), sandbox);

function money(n) {
  return Math.round(n * 100) / 100;
}

const HANDBOOK = 'item-ss';
const CPR = 'item-cpr';

function stocked() {
  sandbox.inventoryItems = [
    { id: HANDBOOK, name: 'Safe Sitter handbook', unitLabel: 'handbook', active: true },
    { id: CPR, name: 'Red Cross CPR certification', unitLabel: 'certification', active: true }
  ];
  sandbox.courseMaterialUses = [
    { id: 'u1', courseName: 'Safe Sitter®', itemId: HANDBOOK, qtyPerStudent: 1 },
    { id: 'u2', courseName: 'Red Cross Babysitter\'s Training + Pediatric First Aid/CPR/AED', itemId: CPR, qtyPerStudent: 1 }
  ];
  sandbox.inventoryPurchases = [
    { id: 'p1', itemId: HANDBOOK, expenseId: 'bulk-1203', quantity: 100, amount: 1203, purchasedOn: '2026-11-03' },
    { id: 'p2', itemId: HANDBOOK, expenseId: 'bulk-201', quantity: 10, amount: 201, purchasedOn: '2026-10-01' }
  ];
  sandbox.expenses = [
    { id: 'bulk-1203', description: 'Supplies', amount: 1203, date: '2026-11-03', category: 'Supplies', paymentMethod: 'amex', sessionId: null },
    { id: 'bulk-201', description: 'Safe Sitter handbooks', amount: 201, date: '2026-10-01', category: 'Supplies', paymentMethod: 'amex', sessionId: 'ss-1' },
    { id: 'rent', description: 'Room rental', amount: 120, date: '2026-11-02', category: 'Rentals', paymentMethod: 'amex', sessionId: 'ss-1' },
    { id: 'ins', description: 'Insurance', amount: 80, date: '2026-11-01', category: 'Insurance', paymentMethod: 'visa', sessionId: null }
  ];
}

test('unit cost is the weighted average, and on hand is bought minus classes already held', () => {
  stocked();
  assert.equal(money(sandbox.inventoryUnitCost(HANDBOOK)), money((1203 + 201) / 110));
  sandbox.sessions = [{
    id: 'ss-past', course: 'Safe Sitter®', date: '2026-10-20', isCancelled: false
  }];
  sandbox.registrations = [
    { id: 'a', sessionId: 'ss-past', payStatus: 'paid' },
    { id: 'b', sessionId: 'ss-past', payStatus: 'unpaid' },
    { id: 'c', sessionId: 'ss-past', payStatus: 'host' },
    { id: 'd', sessionId: 'ss-past', payStatus: 'waitlist' },
    { id: 'e', sessionId: 'ss-past', payStatus: 'cancelled' }
  ];
  assert.equal(sandbox.inventoryStudentCount(sandbox.sessions[0]), 3);
  const roll = sandbox.inventoryItemRollup(HANDBOOK, '2026-11-03');
  assert.equal(roll.purchased, 110);
  assert.equal(roll.used, 3);
  assert.equal(roll.onHand, 107);
  assert.equal(money(roll.valueOnHand), money(107 * roll.unit));
});

test('session profit subtracts inventory once and leaves the bulk charge out of overhead and direct costs', () => {
  stocked();
  const session = {
    id: 'ss-1',
    course: 'Safe Sitter®',
    date: '2026-11-08',
    priceOverride: 225,
    additionalCosts: [{ label: 'Parking', amount: 15 }]
  };
  sandbox.sessions = [session];
  sandbox.registrations = [
    { id: 'p', sessionId: 'ss-1', payStatus: 'paid' },
    { id: 'q', sessionId: 'ss-1', payStatus: 'paid' },
    { id: 'w', sessionId: 'ss-1', payStatus: 'waitlist' }
  ];
  sandbox.jobDataCache = {};
  const unit = sandbox.inventoryUnitCost(HANDBOOK);
  const fin = sandbox.calcFin(session);
  assert.equal(fin.paidCount, 2);
  assert.equal(money(fin.inventoryCost), money(2 * unit));
  assert.equal(fin.linkedCosts, 120);
  assert.equal(fin.legacyCosts, 15);
  assert.equal(money(fin.profit), money(fin.revenue - fin.instrFee - 120 - 15 - fin.inventoryCost));
  assert.ok(fin.profit < fin.revenue - fin.instrFee - 120 - 15);
  assert.notEqual(money(fin.linkedCosts), money(120 + 201));

  const rows = sandbox.profitBySessionRows(2026);
  const row = rows.find((r) => r.s.id === 'ss-1');
  assert.equal(money(row.inventory), money(fin.inventoryCost));
  assert.equal(money(row.linked), 120);
  assert.equal(money(row.profit), money(row.rev - row.instr - row.linked - row.legacy - row.inventory));
  assert.equal(money(row.margin), money(row.profit / row.rev));

  const buckets = sandbox.financeRevenueBuckets(new Date(2026, 10, 8), 'yearly');
  sandbox.applyFinanceExpenses(buckets, 'yearly');
  const year = buckets['2026'];
  assert.equal(money(year.inventory), money(fin.inventoryCost));
  assert.equal(year.linked, 120);
  assert.equal(year.overhead, 80);
  assert.equal(money(year.cost), money(fin.instrFee + 15 + fin.inventoryCost + 120 + 80));
  assert.notEqual(money(year.cost), money(fin.instrFee + 15 + fin.inventoryCost + 120 + 80 + 1203 + 201));

  const cash = sandbox.paidWithTotals(2026, null, new Date(2026, 10, 8));
  // Cash spent keeps the inventory purchases, the rental, insurance, and the
  // unresolved $15 still typed on the session. Profit above does not add the
  // $1,203 or the $201 a second time.
  assert.equal(sandbox.paidWithTotal(cash), 1203 + 201 + 120 + 80 + 15);
});

test('a future class is scheduled, not removed from units on hand, and still shows its cost', () => {
  stocked();
  sandbox.sessions = [{ id: 'ss-next', course: 'Safe Sitter®', date: '2026-12-01' }];
  sandbox.registrations = [{ id: 'p', sessionId: 'ss-next', payStatus: 'paid' }];
  const roll = sandbox.inventoryItemRollup(HANDBOOK, '2026-11-03');
  assert.equal(roll.used, 0);
  assert.equal(roll.scheduled, 1);
  assert.equal(roll.onHand, 110);
  const cost = sandbox.inventoryCostForSession(sandbox.sessions[0]);
  assert.equal(cost.students, 1);
  assert.equal(money(cost.cost), money(sandbox.inventoryUnitCost(HANDBOOK)));
});

test('an organization roster is not added on top of family registrations', () => {
  stocked();
  const orgClass = {
    id: 'org',
    course: 'Safe Sitter®',
    date: '2026-11-10',
    orgHandlesRegistration: true,
    billToOrg: 'Beth El',
    billedHeadcount: 12
  };
  sandbox.sessions = [orgClass];
  sandbox.registrations = [
    { id: 'a', sessionId: 'org', payStatus: 'paid' },
    { id: 'b', sessionId: 'org', payStatus: 'unpaid' }
  ];
  assert.equal(sandbox.inventoryStudentCount(orgClass), 12);
  const families = {
    id: 'split',
    course: 'Safe Sitter®',
    date: '2026-11-11',
    orgHandlesRegistration: false,
    billToOrg: 'Troop 1',
    billedHeadcount: 15
  };
  assert.equal(sandbox.inventoryStudentCount(families), 0);
  sandbox.registrations.push({ id: 'g', sessionId: 'split', payStatus: 'paid' });
  assert.equal(sandbox.inventoryStudentCount(families), 1);
});

test('a cancelled class does not consume stock, and a mapped item with no quantity is not given a made-up cost', () => {
  stocked();
  const cancelled = { id: 'cx', course: 'Safe Sitter®', date: '2026-11-01', isCancelled: true };
  sandbox.sessions = [cancelled];
  sandbox.registrations = [{ id: 'p', sessionId: 'cx', payStatus: 'paid' }];
  assert.equal(sandbox.inventoryCostForSession(cancelled).cost, 0);
  assert.equal(sandbox.inventoryItemRollup(HANDBOOK, '2026-11-03').used, 0);

  sandbox.inventoryPurchases = [];
  sandbox.sessions = [{ id: 'rc', course: 'Red Cross Babysitter\'s Training + Pediatric First Aid/CPR/AED', date: '2026-11-09' }];
  sandbox.registrations = [{ id: 'p', sessionId: 'rc', payStatus: 'paid' }];
  const cost = sandbox.inventoryCostForSession(sandbox.sessions[0]);
  assert.equal(cost.cost, 0);
  assert.equal(cost.unpriced, true);
  assert.equal(cost.units, 1);
});

test('obvious bulk orders are flagged for a quantity and nothing is invented', () => {
  sandbox.inventoryPurchases = [];
  const rows = [
    { id: 'a', description: 'Supplies', amount: 1203, date: '2026-11-03', category: 'Supplies' },
    { id: 'b', description: 'Supplies', amount: 434, date: '2026-11-03', category: 'Supplies' },
    { id: 'c', description: "Red Cross Babysitter's Training participant handbooks", amount: 224.78, date: '2026-11-02', category: 'American Red Cross' },
    { id: 'd', description: 'CPR participant handbooks', amount: 353.49, date: '2026-11-01', category: 'American Red Cross' },
    { id: 'e', description: 'New Safe@Home books', amount: 201, date: '2026-10-26', category: 'Business Development' },
    { id: 'f', description: 'Safe Sitter handbooks', amount: 982, date: '2026-10-01', category: 'Supplies' },
    { id: 'g', description: 'Amazon bandaids and frames', amount: 20, date: '2026-10-20', category: 'Supplies' },
    { id: 'h', description: 'Postage', amount: 18.42, date: '2026-11-01', category: 'Supplies' }
  ];
  assert.deepEqual(rows.filter(sandbox.expenseNeedsInventoryQuantity).map((r) => r.id), ['a', 'b', 'c', 'd', 'e', 'f']);
  rows.forEach((r) => assert.equal(r.quantity, undefined));
  sandbox.inventoryPurchases = [{ id: 'p', itemId: HANDBOOK, expenseId: 'a', quantity: 100, amount: 1203 }];
  assert.equal(sandbox.expenseNeedsInventoryQuantity(rows[0]), false);
  assert.equal(sandbox.expenseIsInventoryPurchase(rows[0]), true);
});

test('new finance copy explains the split and does not use an em dash', () => {
  const start = admin.indexOf('id="fin-inventory"');
  const end = admin.indexOf('Overhead expenses', start);
  const block = admin.slice(start, end);
  assert.equal(block.includes('\u2014'), false);
  const uiStart = admin.indexOf('INVENTORY COST');
  const uiEnd = admin.indexOf('MATERIALS (equipment inventory');
  const ui = admin.slice(uiStart, uiEnd);
  assert.equal(ui.includes('\u2014'), false);
  assert.match(ui, /not in overhead and not inside the session a second time/);
  assert.match(admin, /they are not also taken off each class/);
  assert.match(admin, /handbook or supply orders/);
});
