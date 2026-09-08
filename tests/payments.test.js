'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parseMoney,
  formatMoney,
  isChargeableAmount,
  canMarkPaid,
  isTerminalPaidStatus,
  buildPaymentMemo,
  paypalDescription,
  extractCaptureFromOrder,
  paidNotesLine,
  clearPendingPaymentNotes,
  notesForPaymentStatus
} = require('../lib/payment-utils');

test('parseMoney and formatMoney round to cents', () => {
  assert.equal(parseMoney('175'), 175);
  assert.equal(parseMoney('$175.00'), 175);
  assert.equal(parseMoney(40.1), 40.1);
  assert.equal(formatMoney(175), '175.00');
  assert.equal(formatMoney('10.5'), '10.50');
  assert.equal(parseMoney('nope'), null);
});

test('isChargeableAmount rejects zero, negative, and huge totals', () => {
  assert.equal(isChargeableAmount(175), true);
  assert.equal(isChargeableAmount(0), false);
  assert.equal(isChargeableAmount(-5), false);
  assert.equal(isChargeableAmount(5000), false);
  assert.equal(isChargeableAmount('215.00'), true);
});

test('paid-status guards never overwrite host / in_kind / paid', () => {
  assert.equal(canMarkPaid('pending'), true);
  assert.equal(canMarkPaid('unpaid'), true);
  assert.equal(canMarkPaid(''), true);
  assert.equal(canMarkPaid('paid'), false);
  assert.equal(isTerminalPaidStatus('host'), true);
  assert.equal(isTerminalPaidStatus('in_kind'), true);
  assert.equal(isTerminalPaidStatus('paid'), true);
  assert.equal(isTerminalPaidStatus('pending'), false);
});

test('buildPaymentMemo includes registration id, student, and course', () => {
  assert.equal(
    buildPaymentMemo({ registrationId: 'id_abc1234', studentName: 'Emma Smith', course: 'Safe Sitter®' }),
    'Reg id_abc1234 | Emma Smith — Safe Sitter®'
  );
  assert.equal(
    buildPaymentMemo({ studentName: 'Emma', course: 'Safe@Home' }),
    'Emma — Safe@Home'
  );
  assert.equal(buildPaymentMemo({}), 'Mindful Beginnings payment');
});

test('paypalDescription stays within PayPal custom_id/description length', () => {
  const desc = paypalDescription({
    registrationId: 'id_abc1234',
    studentName: 'A very long student name that should still fit',
    course: 'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes'
  });
  assert.ok(desc.length <= 127);
  assert.match(desc, /Reg id_abc1234/);
});

test('extractCaptureFromOrder reads custom_id, amount, and capture id', () => {
  const info = extractCaptureFromOrder({
    id: 'ORDER1',
    purchase_units: [{
      custom_id: 'id_abc1234',
      amount: { currency_code: 'USD', value: '215.00' },
      payments: { captures: [{ id: 'CAP99', status: 'COMPLETED', amount: { value: '215.00', currency_code: 'USD' } }] }
    }]
  });
  assert.equal(info.orderId, 'ORDER1');
  assert.equal(info.captureId, 'CAP99');
  assert.equal(info.status, 'COMPLETED');
  assert.equal(info.amount, 215);
  assert.equal(info.customId, 'id_abc1234');
});

test('paidNotesLine is idempotent for the same capture id', () => {
  const first = paidNotesLine({ captureId: 'CAP99', amount: 175, existingNotes: '[Registered — awaiting payment]' });
  assert.match(first, /Paid via PayPal TX CAP99 — \$175\.00/);
  assert.doesNotMatch(first, /awaiting payment/);
  const second = paidNotesLine({ captureId: 'CAP99', amount: 175, existingNotes: first });
  assert.equal(second, first);
});

test('clearPendingPaymentNotes strips reservation tags only', () => {
  assert.equal(
    clearPendingPaymentNotes('[Registered — awaiting payment] Nut allergy'),
    'Nut allergy'
  );
  assert.equal(
    clearPendingPaymentNotes('[Family marked VENMO sent — confirm in Venmo app] [Promo SAVE10 applied: −$10 off 185 → 175]'),
    '[Promo SAVE10 applied: −$10 off 185 → 175]'
  );
});

test('notesForPaymentStatus matches pay_status so paid rows never say awaiting payment', () => {
  assert.equal(
    notesForPaymentStatus('pending', '[Registered — awaiting payment]'),
    '[Registered — awaiting payment]'
  );
  assert.equal(
    notesForPaymentStatus('unpaid', '[Registered — awaiting payment]'),
    '[Registered — awaiting payment]'
  );
  assert.equal(
    notesForPaymentStatus('paid', '[Registered — awaiting payment]'),
    '[Registered — paid]'
  );
  assert.equal(
    notesForPaymentStatus('paid', '[Registered — awaiting payment] Nut allergy'),
    '[Registered — paid] Nut allergy'
  );
  assert.equal(
    notesForPaymentStatus('paid', '[Paid via PayPal TX CAP99 — $65.00] [Registered — awaiting payment]'),
    '[Paid via PayPal TX CAP99 — $65.00]'
  );
  assert.equal(
    notesForPaymentStatus('host', '[Registered — awaiting payment]'),
    ''
  );
  assert.equal(
    notesForPaymentStatus('in_kind', '[AUCTION — IN-KIND DONATION: $185] [Registered — awaiting payment]'),
    '[AUCTION — IN-KIND DONATION: $185]'
  );
});
