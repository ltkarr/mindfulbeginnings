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
  'round2', 'fmt', 'escapeHtml',
  'isPerStudentMaterialLine', 'isLegacyCostResolved', 'legacyLineHasDatePaid',
  'legacyPayToExpense',
  'normalizeExpensePay', 'expensePayLabel', 'expensePayOptions',
  'paidWithKey', 'emptyPaidWith', 'addPaidWith', 'paidWithDateInPeriod',
  'legacyLineInPaidWith', 'legacyPaidWithYmd', 'legacyLineInPaidWithPeriod',
  'paidWithTotals', 'paidWithEntries', 'paidWithTotal', 'paidWithNote',
  'paidWithPeriodLabel', 'expenseMatchesPayFilter', 'expensePayFilterOptions',
  'paidWithReportHtml', 'renderPaidWith',
  'normalizeExpenseRecurrence', 'expenseRecurDate', 'expenseRecurHorizon', 'expenseOccurrences',
  'sessionClassDate', 'holdPaymentReceived', 'undatedHoldMoneyIn', 'holdTermYear',
  'sessionRevenueSlot', 'financeRevenueSlot'
];

const sandbox = {
  EXP_PAY_METHODS: [['amex', 'Amex'], ['visa', 'Visa'], ['paypal', 'PayPal'], ['check', 'Check'], ['zelle', 'Zelle'], ['venmo', 'Venmo']],
  expenses: [],
  sessions: [],
  registrations: [],
  finView: 'monthly',
  Array, Object, JSON, Date, Number, Math, String, parseInt, isNaN, isFinite
};
vm.createContext(sandbox);
vm.runInContext(names.map((n) => extractFunction(admin, n)).join('\n'), sandbox);

const MOVED_ID = 'cc536cda-37f8-45b0-9828-3c274568ca2c';

function books() {
  sandbox.expenses = [
    {
      id: MOVED_ID,
      sessionId: 'ss-261219',
      amount: 235,
      date: '2026-12-19',
      paymentMethod: 'amex',
      category: 'Rentals',
      description: 'Facility rental'
    },
    {
      id: 'overhead-blank',
      amount: 40,
      date: '2026-12-02',
      paymentMethod: '',
      category: 'Software',
      description: 'Software'
    },
    {
      id: 'cash-unknown',
      amount: 3,
      date: '2026-12-01',
      paymentMethod: 'cash',
      category: 'Other',
      description: 'Petty cash'
    },
    {
      id: 'linked-visa',
      sessionId: 'ss-june',
      amount: 15,
      date: '2026-12-03',
      payment_method: 'VISA',
      category: 'Supplies',
      description: 'Supplies'
    },
    {
      id: 'zelle-row',
      sessionId: 'ss-june',
      amount: 5,
      date: '2026-06-15',
      paymentMethod: 'zelle',
      category: 'Other',
      description: 'Already entered'
    },
    {
      id: 'recur-ins',
      amount: 10,
      date: '2026-01-15',
      paymentMethod: 'amex',
      category: 'Insurance',
      description: 'Insurance',
      recurrence: 'monthly',
      recurUntil: '2026-03-15',
      recurActive: true
    },
    {
      id: 'last-year',
      amount: 100,
      date: '2025-12-31',
      paymentMethod: 'visa',
      category: 'Other',
      description: 'Last year'
    }
  ];
  sandbox.sessions = [
    {
      id: 'ss-261219',
      code: 'SS-261219',
      date: '2026-12-19',
      additionalCosts: [{
        label: 'Facility rental',
        amount: 235,
        paymentMethod: 'AMEX',
        datePaid: '2026-12-19',
        resolved: 'moved',
        expenseId: MOVED_ID
      }]
    },
    {
      id: 'ss-june',
      code: 'SS-260615',
      date: '2026-06-15',
      additionalCosts: [
        { label: 'Parking', amount: 12, paymentMethod: 'VISA', datePaid: '2026-03-02' },
        { label: 'Printing', amount: 8, paymentMethod: 'PayPal' },
        { label: 'Safe Sitter® materials — 8 × $20.35', amount: 162.8, paymentMethod: 'amex' },
        { label: 'Copy already in Finances', amount: 5, paymentMethod: 'Zelle', resolved: 'duplicate', expenseId: 'zelle-row' },
        { label: 'Snack', amount: 4, paymentMethod: 'ZeLLe', datePaid: '2026-02-01' }
      ]
    },
    {
      id: 'cancelled',
      code: 'SS-260620',
      date: '2026-06-20',
      isCancelled: true,
      additionalCosts: [
        { label: 'Maybe', amount: 7, paymentMethod: 'venmo' },
        { label: 'Deposit', amount: 9, paymentMethod: 'Check', datePaid: '2026-01-04' }
      ]
    },
    {
      id: 'nodate',
      additionalCosts: [{ label: 'Mystery', amount: 9, paymentMethod: 'visa' }]
    }
  ];
}

test('a moved legacy rental is counted once, on the expense, as Amex', () => {
  books();
  const dec = sandbox.paidWithTotals(2026, 11);
  assert.equal(dec.amex, 235);
  assert.equal(dec.visa, 15);
  assert.equal(dec.paypal, 0);
  assert.equal(dec.check, 0);
  assert.equal(dec.zelle, 0);
  assert.equal(dec.venmo, 0);
  assert.equal(dec[''], 43);
  assert.equal(sandbox.paidWithTotal(dec), 293);

  sandbox.sessions[0].additionalCosts[0].resolved = '';
  const doubled = sandbox.paidWithTotals(2026, 11);
  assert.equal(doubled.amex, 470);
  sandbox.sessions[0].additionalCosts[0].resolved = 'moved';
});

test('unresolved lines use date paid, then the session date, and skip resolved, handbook, and cancelled unpaid lines', () => {
  books();
  const march = sandbox.paidWithTotals(2026, 2);
  assert.equal(march.visa, 12);
  assert.equal(march.amex, 10);

  const feb = sandbox.paidWithTotals(2026, 1);
  assert.equal(feb.zelle, 4);
  assert.equal(feb.amex, 10);

  const june = sandbox.paidWithTotals(2026, 5);
  assert.equal(june.paypal, 8);
  assert.equal(june.zelle, 5);
  assert.equal(june.visa, 0);
  assert.equal(june.venmo, 0);
  assert.equal(june.amex, 0);

  const jan = sandbox.paidWithTotals(2026, 0);
  assert.equal(jan.check, 9);
  assert.equal(jan.amex, 10);
  assert.equal(jan.venmo, 0);

  const year = sandbox.paidWithTotals(2026, null);
  assert.equal(year.amex, 265);
  assert.equal(year.visa, 27);
  assert.equal(year.paypal, 8);
  assert.equal(year.check, 9);
  assert.equal(year.zelle, 9);
  assert.equal(year.venmo, 0);
  assert.equal(year[''], 43);
  assert.equal(sandbox.paidWithTotal(year), 361);
  assert.equal(sandbox.paidWithTotals(2025, null).visa, 100);
});

test('mixed casing and blank methods normalize to the expense keys', () => {
  assert.equal(sandbox.paidWithKey('VISA'), 'visa');
  assert.equal(sandbox.paidWithKey('PayPal'), 'paypal');
  assert.equal(sandbox.paidWithKey('ZeLLe'), 'zelle');
  assert.equal(sandbox.paidWithKey('AMEX'), 'amex');
  assert.equal(sandbox.paidWithKey('Check'), 'check');
  assert.equal(sandbox.paidWithKey(null), '');
  assert.equal(sandbox.paidWithKey('cash'), '');
  assert.equal(sandbox.legacyPayToExpense('VENMO'), 'venmo');
});

test('the expense list filter reuses the payment methods and Not recorded', () => {
  assert.equal(sandbox.expenseMatchesPayFilter({ paymentMethod: 'VISA' }, 'visa'), true);
  assert.equal(sandbox.expenseMatchesPayFilter({ paymentMethod: 'VISA' }, 'amex'), false);
  assert.equal(sandbox.expenseMatchesPayFilter({ paymentMethod: '' }, 'none'), true);
  assert.equal(sandbox.expenseMatchesPayFilter({ paymentMethod: 'cash' }, 'none'), true);
  assert.equal(sandbox.expenseMatchesPayFilter({ paymentMethod: 'amex' }, 'none'), false);
  assert.equal(sandbox.expenseMatchesPayFilter({ paymentMethod: 'PayPal' }, ''), true);
  assert.equal(sandbox.expenseMatchesPayFilter({ payment_method: 'zelle' }, 'zelle'), true);

  const all = sandbox.expensePayFilterOptions('');
  assert.match(all, /<option value="" selected>All payment methods<\/option>/);
  assert.match(all, /<option value="none">Not recorded<\/option>/);
  for (const label of ['Amex', 'Visa', 'PayPal', 'Check', 'Zelle', 'Venmo']) {
    assert.match(all, new RegExp('>' + label + '<'));
  }
  assert.equal((all.match(/ selected/g) || []).length, 1);
  assert.equal(all.includes('\u2014'), false);

  const visa = sandbox.expensePayFilterOptions('visa');
  assert.match(visa, /value="visa" selected/);
  assert.equal((visa.match(/ selected/g) || []).length, 1);

  const none = sandbox.expensePayFilterOptions('none');
  assert.match(none, /value="none" selected/);
  assert.equal((none.match(/ selected/g) || []).length, 1);
  assert.doesNotMatch(none, /value="" selected/);
});

test('the finances card and printed reports list Paid with without an em dash', () => {
  books();
  const host = { innerHTML: '' };
  sandbox.finView = 'monthly';
  sandbox.document = {
    getElementById(id) {
      if (id === 'fin-paid-with') return host;
      if (id === 'report-year') return { value: '2026' };
      if (id === 'report-month') return { value: '11' };
      return null;
    }
  };
  sandbox.renderPaidWith();
  assert.match(host.innerHTML, /Paid with/);
  assert.match(host.innerHTML, /December 2026/);
  assert.match(host.innerHTML, />Amex</);
  assert.match(host.innerHTML, />Not recorded</);
  assert.match(host.innerHTML, /\$235/);
  assert.match(host.innerHTML, /\$293/);
  assert.doesNotMatch(host.innerHTML, /\$470/);
  assert.equal(host.innerHTML.includes('\u2014'), false);
  assert.equal(sandbox.paidWithNote().includes('\u2014'), false);

  const printed = sandbox.paidWithReportHtml(sandbox.paidWithTotals(2026, 11), sandbox.fmt);
  assert.match(printed, /<h2>Paid with<\/h2>/);
  assert.match(printed, />Amex</);
  assert.match(printed, /\$235/);
  assert.match(printed, /\$293/);
  assert.doesNotMatch(printed, />Venmo</);
  assert.equal(printed.includes('\u2014'), false);

  sandbox.finView = 'yearly';
  sandbox.renderPaidWith();
  assert.match(host.innerHTML, /2026\. Session-linked/);
  assert.match(host.innerHTML, /\$361/);
  assert.doesNotMatch(host.innerHTML, /\$470/);

  const yearFn = extractFunction(admin, 'printYearReport');
  const monthFn = extractFunction(admin, 'printMonthReport');
  assert.match(yearFn, /paidWithReportHtml\(paidWithTotals\(year, null\), fmtN\)/);
  assert.match(monthFn, /paidWithReportHtml\(paidWithTotals\(year, mi\), fmtN\)/);
  assert.match(admin, /id="fin-paid-with"/);
  assert.match(admin, /id="ef-pay"/);
  assert.match(admin, /id="report-month" onchange="renderFinances\(\)"/);
  const paySelect = admin.slice(admin.indexOf('id="ef-pay"'), admin.indexOf('id="ef-year"'));
  assert.match(paySelect, /All payment methods/);
  assert.match(paySelect, /Not recorded/);
  assert.equal(paySelect.includes('\u2014'), false);
  const list = admin.slice(admin.indexOf('function renderExpenses'), admin.indexOf('function expenseFormHtml'));
  assert.match(list, /expenseMatchesPayFilter\(e, payF\)/);
  assert.match(list, /Not recorded/);
  assert.equal(list.includes('\u2014'), false);
});
