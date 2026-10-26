'use strict';
const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const { parsePaymentEmail } = require('../lib/payment-email-parse');

function between(src, start, end) {
  const a = src.indexOf(start);
  const b = src.indexOf(end, a + start.length);
  assert.ok(a >= 0 && b > a);
  return src.slice(a, b + end.length);
}

test('venmo incoming with memo', () => {
  const p = parsePaymentEmail({
    from: 'Venmo <venmo@venmo.com>',
    subject: 'Kristen Myers paid you $225.00',
    body: 'Kristen Myers paid you $ 225 . 00 Reg+id_2a861rv+|+Kira+Myers+\u2014+Safe+Sitter\u00ae See transaction',
    date: '2026-10-21T21:48:27Z'
  });
  assert.equal(p.source, 'venmo');
  assert.equal(p.amount, 225);
  assert.equal(p.payerName, 'Kristen Myers');
  assert.match(p.memo, /Reg id_2a861rv/);
  assert.equal(p.receivedAt, '2026-10-21T21:48:27.000Z');
});

test('venmo "paid $X to your Venmo account" form', () => {
  const p = parsePaymentEmail({
    from: 'venmo@venmo.com',
    subject: 'Phillip Kurs paid $15.00 to your Venmo account. Leave it in Venmo.',
    body: 'Reg id_duw0eoa | Amelia Kurs See transaction'
  });
  assert.equal(p.amount, 15);
  assert.equal(p.payerName, 'Phillip Kurs');
  assert.match(p.memo, /id_duw0eoa/);
});

test('venmo amounts with commas are dollars, and a zero payment is ignored', () => {
  const p = parsePaymentEmail({
    from: 'venmo@venmo.com',
    subject: 'Ada Lovelace paid you $1,225.50',
    body: 'Phone (919) 555-0101 See transaction'
  });
  assert.equal(p.amount, 1225.5);
  assert.equal(p.payerPhone, '9195550101');
  assert.equal(parsePaymentEmail({
    from: 'venmo@venmo.com',
    subject: 'Ada Lovelace paid you $0.00',
    body: ''
  }), null);
});

test('outgoing venmo and zelle are ignored', () => {
  assert.equal(parsePaymentEmail({ from: 'venmo@venmo.com', subject: 'You paid Linh Vo $7.00', body: '' }), null);
  assert.equal(parsePaymentEmail({
    from: 'alertnotifications@message.truist.com',
    subject: 'You sent money with Zelle',
    body: 'Money sent to X Amount $5'
  }), null);
});

test('zelle payment from a bank alert', () => {
  const sent = parsePaymentEmail({
    from: 'alerts@bank.example',
    subject: 'You received money with Zelle',
    body: 'Jane Doe sent you $65.00 Message: Reg id_abc1234'
  });
  assert.equal(sent.source, 'zelle');
  assert.equal(sent.payerName, 'Jane Doe');
  assert.equal(sent.amount, 65);
  assert.match(sent.memo, /id_abc1234/);

  const fromLine = parsePaymentEmail({
    from: 'alerts@bank.example',
    subject: 'You received $40.00 with Zelle',
    body: 'You received $40.00 from John Smith. Memo: class fee'
  });
  assert.equal(fromLine.payerName, 'John Smith');
  assert.equal(fromLine.amount, 40);
  assert.equal(fromLine.memo, 'class fee');

  const caps = parsePaymentEmail({
    from: 'alerts@bank.example',
    subject: 'Zelle payment',
    body: 'JANE DOE sent you $25.00'
  });
  assert.equal(caps.payerName, 'JANE DOE');
  assert.equal(caps.amount, 25);
});

test('paypal received money, skipping PayPal\'s own address', () => {
  const p = parsePaymentEmail({
    from: 'service@paypal.com',
    subject: "You've got money",
    body: 'service@paypal.com Jane Doe sent you $40.00 USD jane@x.com Note from Jane Doe: Reg id_abc123 Transaction'
  });
  assert.equal(p.source, 'paypal');
  assert.equal(p.amount, 40);
  assert.equal(p.payerName, 'Jane Doe');
  assert.equal(p.payerEmail, 'jane@x.com');
  assert.match(p.memo, /Reg id_abc123/);
});

test('paypal subject already names the sender', () => {
  const p = parsePaymentEmail({
    from: 'service@paypal.com',
    subject: 'Jane Doe sent you $40.00 USD',
    body: 'jane@x.com Note from Jane Doe: hello Transaction'
  });
  assert.equal(p.payerName, 'Jane Doe');
  assert.equal(p.amount, 40);
  assert.equal(p.memo, 'hello');
});

test('paypal purchases are ignored', () => {
  assert.equal(parsePaymentEmail({
    from: 'service@paypal.com',
    subject: 'Uber Eats: $5.00 USD',
    body: 'You paid $5.00 USD to Uber Eats'
  }), null);
  assert.equal(parsePaymentEmail({
    from: 'service@paypal.com',
    subject: 'Receipt for your payment to Uber',
    body: 'You sent $5.00 USD'
  }), null);
});

test('apps script parser matches the tested library', () => {
  const lib = fs.readFileSync(path.join(__dirname, '../lib/payment-email-parse.js'), 'utf8');
  const gs = fs.readFileSync(path.join(__dirname, '../scripts/payment-inbox-sync.gs'), 'utf8');
  assert.equal(between(gs, '// PARSER_START', '// PARSER_END'), between(lib, '// PARSER_START', '// PARSER_END'));
  assert.match(gs, /in:anywhere/);
  assert.match(gs, /newer_than:21d/);
  assert.match(gs, /everyMinutes\(10\)/);
  assert.match(gs, /if \(ok\) thread\.addLabel\(label\)/);
  assert.doesNotMatch(gs, /—/);
});
