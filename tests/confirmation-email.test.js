'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  PUBLIC_ORIGIN,
  PAID_NOTE,
  ZERO_NOTE,
  shouldShowPayNow,
  buildPayNowUrl,
  buildPayNowButtonHtml,
  buildPayCta,
  withPayUrlInAmount
} = require('../js/confirmation-email');

const dueOpts = {
  payStatus: 'pending',
  paymentMethod: 'awaiting',
  amount: 225,
  registrationId: 'id_abc1234',
  studentName: 'Estelle Fox',
  course: 'Safe Sitter®',
  sessionCode: 'SS-1016'
};

test('Pay now URL is an absolute HTTPS checkout link for the registration', () => {
  const url = buildPayNowUrl(dueOpts);
  assert.match(url, /^https:\/\//);
  assert.equal(url.startsWith(PUBLIC_ORIGIN + '/'), true);
  assert.match(url, /register\.html\?/);
  assert.match(url, /paycode=SS-1016/);
  assert.match(url, /reg=id_abc1234/);
  assert.match(url, /amt=225/);
  assert.match(url, /name=Estelle%20Fox/);
});

test('Pay now falls back to pay.html when there is no session code', () => {
  const url = buildPayNowUrl({
    amount: 175,
    registrationId: 'id_xyz',
    studentName: 'Emma Smith',
    course: 'Safe Sitter'
  });
  assert.equal(url.startsWith(PUBLIC_ORIGIN + '/pay.html?'), true);
  assert.match(url, /reg=id_xyz/);
  assert.match(url, /amt=175/);
  assert.match(url, /name=Emma%20Smith/);
  assert.match(url, /for=Safe%20Sitter/);
});

test('shouldShowPayNow is true for unpaid/pending/reserved with an amount due', () => {
  assert.equal(shouldShowPayNow(dueOpts), true);
  assert.equal(shouldShowPayNow({ ...dueOpts, payStatus: 'unpaid', paymentMethod: 'zelle' }), true);
  assert.equal(shouldShowPayNow({ ...dueOpts, payStatus: 'reserved', paymentMethod: 'awaiting' }), true);
  assert.equal(shouldShowPayNow({ ...dueOpts, payStatus: '', paymentMethod: 'venmo' }), true);
});

test('shouldShowPayNow is false when already paid or amount is $0', () => {
  assert.equal(shouldShowPayNow({ ...dueOpts, payStatus: 'paid', paymentMethod: 'paid' }), false);
  assert.equal(shouldShowPayNow({ ...dueOpts, payStatus: 'host', paymentMethod: 'host' }), false);
  assert.equal(shouldShowPayNow({ ...dueOpts, payStatus: 'in_kind', paymentMethod: 'paid' }), false);
  assert.equal(shouldShowPayNow({ ...dueOpts, paymentMethod: 'paid' }), false);
  assert.equal(shouldShowPayNow({ ...dueOpts, amount: 0 }), false);
  assert.equal(shouldShowPayNow({ ...dueOpts, amount: '0' }), false);
  assert.equal(shouldShowPayNow({ payStatus: 'pending', amount: 0 }), false);
});

test('unpaid CTA exposes a non-empty absolute pay_url and Outlook-safe <a href>', () => {
  const cta = buildPayCta(dueOpts);
  assert.equal(cta.show_pay_now, true);
  assert.match(cta.pay_url, /^https:\/\/mindfulbeginnings\.vercel\.app\/register\.html\?/);
  assert.equal(cta.pay_link, cta.pay_url);
  assert.equal(cta.payment_url, cta.pay_url);
  assert.equal(cta.pay_now_url, cta.pay_url);
  assert.equal(cta.pay_note, '');
  assert.doesNotMatch(cta.pay_button, /href=""/);
  assert.doesNotMatch(cta.pay_button, /href=''/);
  assert.match(cta.pay_button, new RegExp('<a href="' + cta.pay_url.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/&/g, '&amp;') + '"'));
  assert.match(cta.pay_button, /Pay now →/);
  assert.doesNotMatch(cta.pay_button, /onclick=/i);
});

test('paid CTA omits Pay now instead of emitting an empty href', () => {
  const cta = buildPayCta({ ...dueOpts, payStatus: 'paid', paymentMethod: 'paid' });
  assert.equal(cta.show_pay_now, false);
  assert.equal(cta.pay_url, '');
  assert.equal(cta.pay_link, '');
  assert.equal(cta.pay_button, '');
  assert.equal(cta.pay_note, PAID_NOTE);
  assert.equal(cta.pay_cta, PAID_NOTE);
  assert.doesNotMatch(cta.pay_cta, /<a /);
});

test('$0 / complimentary CTA omits Pay now and uses no-payment-needed copy', () => {
  const cta = buildPayCta({ payStatus: 'pending', paymentMethod: 'free', amount: 0, sessionCode: 'CR-1' });
  assert.equal(cta.show_pay_now, false);
  assert.equal(cta.pay_url, '');
  assert.equal(cta.pay_button, '');
  assert.equal(cta.pay_note, ZERO_NOTE);
});

test('buildPayNowButtonHtml refuses empty or non-https hrefs', () => {
  assert.equal(buildPayNowButtonHtml(''), '');
  assert.equal(buildPayNowButtonHtml('javascript:alert(1)'), '');
  assert.equal(buildPayNowButtonHtml('/pay.html'), '');
  const html = buildPayNowButtonHtml('https://mindfulbeginnings.vercel.app/pay.html?amt=40');
  assert.match(html, /^<a href="https:\/\/mindfulbeginnings\.vercel\.app\/pay\.html\?amt=40"/);
});

test('amount line can carry the pay URL as a text fallback', () => {
  const url = buildPayNowUrl(dueOpts);
  const line = withPayUrlInAmount('$225 — your spot is RESERVED.', url);
  assert.match(line, /Pay now: https:\/\//);
  assert.equal(withPayUrlInAmount('$225 — payment received.', ''), '$225 — payment received.');
});
