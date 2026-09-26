'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const { findPaymentMatches } = require('../lib/payment-utils');

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

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(extractFunction(admin, 'findPaymentMatches'), sandbox);

const blairId = 'a1b2c3d4-e5f6-4789-a012-3456789abcde';
const jordanId = 'b2c3d4e5-f6a7-4890-b123-456789abcdef';
const paidId = 'c3d4e5f6-a7b8-4901-c234-56789abcdef0';

function regs() {
  return [
    {
      id: blairId,
      payStatus: 'unpaid',
      studentName: 'Blair Washington',
      parentName: 'Brandi Washington',
      contact: 'brandiandstanley@icloud.com / 2027338999',
      notes: '[Registered — awaiting payment]'
    },
    {
      id: jordanId,
      payStatus: 'unpaid',
      studentName: 'Jordan Washington',
      parentName: 'Alex Washington',
      contact: 'alex@example.com / 3015550100'
    },
    {
      id: paidId,
      payStatus: 'paid',
      studentName: 'Blair Washington',
      parentName: 'Brandi Washington',
      contact: 'brandiandstanley@icloud.com / 2027338999'
    },
    {
      id: 'd4e5f6a7-b8c9-4012-d345-6789abcdef01',
      payStatus: 'cancelled',
      studentName: 'Blair Washington',
      parentName: 'Brandi Washington',
      contact: 'brandiandstanley@icloud.com / 2027338999'
    },
    {
      id: 'abc12',
      payStatus: 'unpaid',
      studentName: 'Short Id',
      parentName: 'Short Id',
      contact: 'short@example.com'
    }
  ];
}

function ids(fn, query) {
  return fn(Object.assign({ registrations: regs(), priceOf: function () { return 185; } }, query)).map(function (h) { return h.id; });
}

function both(query) {
  return [findPaymentMatches, sandbox.findPaymentMatches].map(function (fn) { return ids(fn, query).join(','); });
}

test('amount plus parent email and phone matches the unpaid registration only', () => {
  const found = both({
    amount: '$185',
    payer: 'brandiandstanley@icloud.com / 2027338999'
  });
  assert.deepEqual(found, [blairId, blairId]);
  const hit = findPaymentMatches({
    amount: 185,
    payer: 'Brandi Washington',
    registrations: regs(),
    priceOf: function () { return 185; }
  })[0];
  assert.ok(hit.reasons.indexOf('amount') !== -1);
  assert.ok(hit.reasons.indexOf('name') !== -1);
  assert.equal(hit.amountDiffers, false);
});

test('amount alone or email alone does not match', () => {
  assert.deepEqual(both({ amount: 185, payer: '' }), ['', '']);
  assert.deepEqual(both({
    amount: '',
    payer: 'brandiandstanley@icloud.com'
  }), ['', '']);
});

test('a formatted phone plus the class price matches', () => {
  assert.deepEqual(both({ amount: '185.00', payer: '202-733-8999' }), [blairId, blairId]);
});

test('two students who share a last name and amount are both listed', () => {
  const found = both({ amount: 185, payer: 'Washington' });
  assert.deepEqual(found, [blairId + ',' + jordanId, blairId + ',' + jordanId]);
});

test('registration id in the memo matches even when the amount differs and no name is given', () => {
  const hits = [findPaymentMatches, sandbox.findPaymentMatches].map(function (fn) {
    return fn({
      amount: 50,
      payer: '',
      memo: 'Reg ' + blairId,
      registrations: regs(),
      priceOf: function () { return 185; }
    });
  });
  hits.forEach(function (list) {
    assert.equal(list.length, 1);
    assert.equal(list[0].id, blairId);
    assert.equal(list[0].amountDiffers, true);
    assert.ok(list[0].reasons.indexOf('registration id') !== -1);
  });
});

test('a registration id shorter than 6 characters is not treated as an id match', () => {
  assert.deepEqual(both({ amount: '', payer: '', memo: 'abc12' }), ['', '']);
});

test('edit registration shows the class, and match payment stays inside the admin', () => {
  const editAt = admin.indexOf('function openEditReg');
  const edit = admin.slice(editAt, editAt + 1800);
  assert.match(edit, /<label>Class<\/label>/);
  assert.match(edit, /regClassLabel\(r\)/);
  assert.match(edit, /#f7f4ee/);
  assert.match(admin, /Class not on file/);
  assert.match(admin, /onclick="openMatchPayment\(\)"/);
  assert.match(admin, /This tool does not read your PayPal, Venmo, or Zelle inbox/);
  const markAt = admin.indexOf('function markMatchedPaid');
  const mark = admin.slice(markAt, markAt + 1600);
  assert.match(mark, /does not contact PayPal, Venmo, or Zelle/);
  assert.doesNotMatch(mark, /price_paid/);
  assert.match(mark, /\[Paid via /);
});
