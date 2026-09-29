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
  notesForPaymentStatus,
  paypalCapturePatch,
  paymentMethodPatch,
  rosterMarkPaidPatch,
  formatPaymentMethodDisplay,
  paymentHowText,
  suggestPaymentMethod,
  adminTogglePaidPatch
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

test('admin Mark paid records $0 revenue and still sets paid status', () => {
  const paid = adminTogglePaidPatch({ currentlyPaid: false, existingPricePaid: null, method: 'venmo', ref: 'note-9' });
  assert.equal(paid.pay_status, 'paid');
  assert.equal(paid.price_paid, 0);
  assert.equal(paid.payment_method, 'venmo');
  assert.equal(paid.payment_ref, 'note-9');
  const missing = adminTogglePaidPatch({ currentlyPaid: false, existingPricePaid: null });
  assert.equal(missing.pay_status, undefined);
  assert.match(missing.error, /Choose how they paid/);
  const unpaidZero = adminTogglePaidPatch({ currentlyPaid: true, existingPricePaid: 0 });
  assert.equal(unpaidZero.pay_status, 'unpaid');
  assert.equal(unpaidZero.price_paid, null);
  const unpaidCharged = adminTogglePaidPatch({ currentlyPaid: true, existingPricePaid: 175 });
  assert.equal(unpaidCharged.pay_status, 'unpaid');
  assert.equal(unpaidCharged.price_paid, undefined);
});

test('PayPal capture stores method paypal and the transaction id', () => {
  const patch = paypalCapturePatch({
    captureId: 'CAP99',
    amount: 175,
    existingNotes: '[Registered — awaiting payment] Nut allergy',
    existingPaypalTxId: null
  });
  assert.equal(patch.pay_status, 'paid');
  assert.equal(patch.payment_method, 'paypal');
  assert.equal(patch.paypal_tx_id, 'CAP99');
  assert.equal(patch.payment_ref, 'CAP99');
  assert.match(patch.notes, /\[Paid via PayPal TX CAP99 — \$175\.00\]/);
  assert.match(patch.notes, /Nut allergy/);
  assert.doesNotMatch(patch.notes, /awaiting payment/);
  assert.equal(patch.price_paid, undefined);
});

test('admin mark-paid requires Venmo or Zelle and does not change price_paid on the roster patch', () => {
  assert.match(paymentMethodPatch({ method: '' }).error, /Choose how they paid/);
  assert.match(paymentMethodPatch({ method: 'other' }).error, /Describe the other/);
  const venmo = rosterMarkPaidPatch({
    method: 'venmo',
    ref: 'Reg abc | Lisa White',
    amount: 65,
    existingNotes: '[Registered — awaiting payment] Nut allergy'
  });
  assert.equal(venmo.pay_status, 'paid');
  assert.equal(venmo.payment_method, 'venmo');
  assert.equal(venmo.payment_ref, 'Reg abc | Lisa White');
  assert.equal(venmo.price_paid, undefined);
  assert.equal(venmo.paypal_tx_id, undefined);
  assert.match(venmo.notes, /\[Paid via Venmo ref Reg abc \| Lisa White — \$65\.00\]/);
  assert.match(venmo.notes, /Nut allergy/);
  const zelle = rosterMarkPaidPatch({ method: 'zelle', ref: 'zelle-memo', amount: '40' });
  assert.equal(zelle.payment_method, 'zelle');
  assert.match(zelle.notes, /\[Paid via Zelle ref zelle-memo — \$40\.00\]/);
  const other = paymentMethodPatch({ method: 'other', detail: 'Cash at the door', ref: 'envelope 3' });
  assert.equal(other.ok, true);
  assert.equal(other.fields.payment_method, 'other');
  assert.equal(other.fields.payment_detail, 'Cash at the door');
  assert.equal(other.fields.payment_ref, 'envelope 3');
});

test('display helpers show method and ref, and leave old rows unknown', () => {
  assert.equal(formatPaymentMethodDisplay({}), '');
  assert.equal(paymentHowText({ payStatus: 'paid' }), 'How paid unknown');
  assert.equal(paymentHowText({ payStatus: 'pending', notes: '[Family marked VENMO sent]' }), '');
  assert.equal(formatPaymentMethodDisplay({
    paymentMethod: 'zelle',
    paymentRef: 'Lisa White Safe Sitter'
  }), 'Zelle · Lisa White Safe Sitter');
  assert.equal(formatPaymentMethodDisplay({
    payment_method: 'other',
    payment_detail: 'Cash',
    payment_ref: '12'
  }), 'Other (Cash) · 12');
  assert.equal(formatPaymentMethodDisplay({ paypalTxId: 'CAP99' }), 'PayPal · CAP99');
  assert.equal(formatPaymentMethodDisplay({
    paymentMethod: 'venmo',
    paymentRef: 'memo',
    paypalTxId: 'CAP99'
  }), 'Venmo · memo');
  assert.equal(suggestPaymentMethod({ notes: '[Family marked VENMO sent]' }), 'venmo');
  assert.equal(suggestPaymentMethod({ paypalTxId: 'CAP99', notes: 'venmo' }), 'paypal');
  assert.equal(suggestPaymentMethod({ payStatus: 'paid', notes: '[Registered — paid]' }), '');
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
