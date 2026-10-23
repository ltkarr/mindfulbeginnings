'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const codes = require('../js/discount-codes');
const payments = require('../lib/payment-utils');
const referrals = require('../js/referral-commissions');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'migrations/20261023_single_use_discount_codes.sql'), 'utf8');
const createOrder = fs.readFileSync(path.join(root, 'api/paypal/create-order.js'), 'utf8');

const ALPHABET = codes.ALPHABET;

function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  assert.fail('unclosed function ' + name);
}

function screenSlice(html, id) {
  const start = html.indexOf('id="' + id + '"');
  assert.ok(start >= 0, id);
  const next = html.indexOf('<div class="screen"', start + 10);
  return html.slice(start, next > start ? next : start + 4000);
}

test('a discount never prices a class below zero and defaults to $25 off', () => {
  assert.equal(codes.DEFAULT_AMOUNT, 25);
  assert.equal(codes.payablePrice(185, 25), 160);
  assert.equal(codes.payablePrice(25, 25), 0);
  assert.equal(codes.payablePrice(10, 25), 0);
  assert.equal(codes.payablePrice(185.5, 0.2), 185.3);
  assert.equal(codes.payablePrice('not-a-price', 25), null);
});

test('generated codes are unique-looking and avoid ambiguous characters', () => {
  let n = 0;
  function nextByte() { n += 1; return n; }
  const first = codes.generateDiscountCode(nextByte);
  const second = codes.generateDiscountCode(nextByte);
  assert.match(first, /^GIFT-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{8}$/);
  assert.notEqual(first, second);
  assert.equal(/[IO01]/.test(first.slice(codes.CODE_PREFIX.length)), false);
  const seen = new Set();
  for (let i = 0; i < 20; i++) seen.add(codes.generateDiscountCode());
  assert.equal(seen.size, 20);
  assert.equal(ALPHABET.length, 32);
  assert.equal(codes.normalizeCode(' gift-ab12 '), 'GIFT-AB12');
});

test('claim decisions match the server: one registration, no host or waitlist', () => {
  const row = { code: 'GIFT-ABCD2345', amount: 25, status: 'unused' };
  const reg = { id: 'reg-1', payStatus: 'pending', listPrice: 185 };
  const ok = codes.claimOutcome(row, reg, 'gift-abcd2345');
  assert.equal(ok.ok, true);
  assert.equal(ok.payable, 160);
  assert.equal(codes.claimOutcome({ ...row, status: 'used' }, reg, row.code).reason, 'used');
  assert.equal(codes.claimOutcome({ ...row, status: 'deactivated' }, reg, row.code).reason, 'deactivated');
  assert.equal(codes.claimOutcome({ ...row, status: 'reserved', registrationId: 'other' }, reg, row.code).reason, 'used');
  assert.equal(codes.claimOutcome(row, { id: 'reg-1', payStatus: 'host', listPrice: 185 }, row.code).reason, 'host');
  assert.equal(codes.claimOutcome(row, { id: 'reg-1', payStatus: 'waitlist', listPrice: 185 }, row.code).reason, 'waitlist');
  assert.equal(codes.claimOutcome(row, { id: 'reg-1', payStatus: 'paid', listPrice: 185 }, row.code).reason, 'paid');
  assert.equal(codes.claimOutcome(row, { id: 'reg-1', payStatus: 'pending', listPrice: 0 }, row.code).reason, 'free');
  assert.equal(codes.claimOutcome(row, { id: 'reg-1', payStatus: 'pending', priceOverride: 40, listPrice: 9999 }, row.code).payable, 15);
  assert.match(codes.messageForReason('used'), /already been used/i);
  assert.match(codes.messageForReason('not_found'), /isn.t valid/i);
});

test('only an unused code can be reserved, and a second claim loses', () => {
  const row = { status: 'unused', registrationId: null };
  assert.equal(codes.reserveIfUnused(row, 'reg-1'), true);
  assert.equal(row.status, 'reserved');
  assert.equal(row.registrationId, 'reg-1');
  assert.equal(codes.reserveIfUnused(row, 'reg-2'), false);
  assert.equal(row.registrationId, 'reg-1');
});

test('promo notes with a hyphenated code still feed the reports', () => {
  const note = codes.promoNote('GIFT-ABCD2345', 25, 185, 160);
  assert.match(note, /\[Promo GIFT-ABCD2345 applied:/);
  const parsed = codes.parsePromoNote('Allergy. ' + note + ' more');
  assert.deepEqual(parsed, { code: 'GIFT-ABCD2345', amount: 25 });
  const roster = codes.rosterDiscountNote(note, 160, 185);
  assert.equal(roster.matches, true);
  assert.equal(codes.rosterDiscountNote(note, 185, 185).matches, false);
  assert.match(admin, /MBDiscountCodes\.PROMO_NOTE_RE/);
});

test('PayPal charges the stored discounted price and leaves static promos on the page amount', () => {
  assert.equal(payments.chargedCheckoutAmount({ clientAmount: 185, storedPricePaid: 160, discountCode: 'GIFT-ABCD2345' }), 160);
  assert.equal(payments.chargedCheckoutAmount({ clientAmount: '0', storedPricePaid: 160, discountCode: 'GIFT-ABCD2345' }), 160);
  assert.equal(payments.chargedCheckoutAmount({ clientAmount: 175, storedPricePaid: 185, discountCode: '' }), 175);
  assert.equal(payments.chargedCheckoutAmount({ clientAmount: 175, storedPricePaid: null, discountCode: '' }), 175);
  assert.match(createOrder, /chargedCheckoutAmount/);
  assert.match(createOrder, /covered:\s*true/);
});

test('referral revenue uses the charged price, and a host seat stays zero', () => {
  const paid = referrals.registrationMoney({ payStatus: 'paid' }, 160, 5.27, referrals.DEFAULT_OVERHEAD_RULES);
  assert.equal(paid.grossCollected, 160);
  assert.equal(paid.collected, 154.73);
  const host = referrals.registrationMoney({ payStatus: 'host' }, 160, 5.27, referrals.DEFAULT_OVERHEAD_RULES);
  assert.equal(host.grossCollected, 0);
  assert.equal(host.collected, 0);
  assert.match(admin, /regEffectivePrice\(r,s\)/);
  assert.match(admin, /MBReferralCommissions\.registrationMoney\(r,price/);
});

test('the database reserves a code once, with a row lock, and does not email', () => {
  assert.match(sql, /for update/i);
  assert.match(sql, /status = 'unused'/);
  assert.match(sql, /greatest\(0,/);
  assert.match(sql, /revoke all on table public\.discount_codes from anon/);
  assert.match(sql, /revoke all on function public\.deactivate_discount_code\(uuid\) from public, anon/);
  assert.match(sql, /auth\.uid\(\) is null/);
  assert.match(sql, /deactivate_discount_code/);
  assert.match(sql, /p_row - 'pay_status' - 'paypal_tx_id' - 'price_paid' - 'registration_token' - 'discount_code'/);
  assert.doesNotMatch(sql, /emailjs|net\.http|pg_net|send mail/i);
  assert.match(sql, /Nothing here sends email/);
});

test('registration has a Discount code field and does not email from the apply itself', () => {
  assert.match(register, /<label for="info-discount-code">Discount code<\/label>/);
  assert.match(register, /apply_single_use_discount/);
  assert.match(register, /release_single_use_discount/);
  assert.match(register, /discount_on_registration/);
  assert.match(register, /settle_covered_discount/);
  const apply = extractFn(register, 'applySingleUseCode');
  assert.doesNotMatch(apply, /emailjs|sendConfirmationEmail/);
  const settle = extractFn(register, 'settleCoveredDiscount');
  assert.doesNotMatch(settle, /emailjs|sendConfirmationEmail/);
  assert.match(settle, /'discount', true/);
  const waitlist = screenSlice(register, 'screen-waitlist');
  assert.doesNotMatch(waitlist, /discount/i);
});

test('Lindsay creates a code from More → Discount codes and can deactivate it', () => {
  assert.match(admin, /showScreen\('discounts'/);
  assert.match(admin, /Discount codes/);
  assert.match(admin, /id="screen-discounts"/);
  assert.match(admin, /onclick="createDiscountCode\(\)"/);
  assert.match(admin, /deactivate_discount_code/);
  const create = extractFn(admin, 'createDiscountCode');
  const deactivate = extractFn(admin, 'deactivateDiscountCode');
  assert.doesNotMatch(create, /emailjs|sendConfirmationEmail/);
  assert.doesNotMatch(deactivate, /emailjs|sendConfirmationEmail/);
  assert.match(create, /Nothing was emailed/);
  assert.match(admin, /function renderDiscountCodes\(/);
  assert.match(admin, /discountCodes=\(dc\.data\|\|\[\]\)\.map\(discountCodeFromDB\)/);
});
