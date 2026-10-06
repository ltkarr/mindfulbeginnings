'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const lib = require('../lib/payment-utils');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
const markPaid = fs.readFileSync(path.join(root, 'lib/mark-paid.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations/payment_method.sql'), 'utf8');

function extractBetween(src, startMark, endMark) {
  const start = src.indexOf(startMark);
  const end = src.indexOf(endMark, start + startMark.length);
  assert.ok(start >= 0 && end > start, startMark);
  return src.slice(start + startMark.length, end);
}

test('admin payment helpers match the shared library', () => {
  const helpers = extractBetween(admin, '// PAYMENT_METHOD_HELPERS_START', '// PAYMENT_METHOD_HELPERS_END');
  const clear = admin.slice(admin.indexOf('function clearPendingPaymentNotes'), admin.indexOf('function hasPaidIndicatorNote'));
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(clear + '\n' + helpers, sandbox);

  const cases = [
    { method: 'venmo', ref: 'memo 1', amount: 65, existingNotes: '[Registered — awaiting payment] Nut allergy' },
    { method: 'zelle', ref: 'ZELLE-9', detail: '', amount: 185.5, existingNotes: 'Bring an epi pen' },
    { method: 'check', ref: '1042', amount: 40, existingNotes: '' },
    { method: 'other', ref: 'env', detail: 'Cash', amount: 10, existingNotes: '[Registered — awaiting payment]' },
    { method: 'paypal', ref: 'CAP99', amount: 175, existingNotes: '[Registered — awaiting payment]', paypalTxId: '' }
  ];
  cases.forEach(function (input) {
    assert.equal(JSON.stringify(sandbox.rosterMarkPaidPatch(input)), JSON.stringify(lib.rosterMarkPaidPatch(input)));
    assert.equal(JSON.stringify(sandbox.paymentMethodPatch(input)), JSON.stringify(lib.paymentMethodPatch(input)));
  });
  assert.equal(sandbox.paymentMethodPatch({ method: '' }).error, lib.paymentMethodPatch({ method: '' }).error);
  assert.equal(sandbox.paymentMethodPatch({ method: 'other' }).error, lib.paymentMethodPatch({ method: 'other' }).error);

  const rows = [
    {},
    { payStatus: 'paid' },
    { paymentMethod: 'zelle', paymentRef: 'Lisa White' },
    { paypalTxId: 'CAP99' },
    { paymentMethod: 'venmo', paymentRef: 'memo', paypalTxId: 'CAP99' },
    { notes: '[Family marked VENMO sent — confirm in Venmo app]' },
    { paypal_tx_id: 'CAP1', notes: 'venmo somewhere' }
  ];
  rows.forEach(function (row) {
    assert.equal(sandbox.formatPaymentMethodDisplay(row), lib.formatPaymentMethodDisplay(row));
    assert.equal(sandbox.paymentHowText(row), lib.paymentHowText(row));
    assert.equal(sandbox.suggestPaymentMethod(row), lib.suggestPaymentMethod(row));
  });
});

test('public Venmo and Zelle record the method without marking the seat paid', () => {
  const saveAt = register.indexOf('async function saveChosenPaymentMethod');
  const save = register.slice(saveAt, register.indexOf('function isDuplicateError', saveAt));
  assert.match(save, /payment_method:key/);
  assert.match(save, /payment_ref:memo/);
  assert.doesNotMatch(save, /pay_status/);
  assert.match(register, /await saveChosenPaymentMethod\('venmo'\)/);
  assert.match(register, /await saveChosenPaymentMethod\('zelle'\)/);
  const buildAt = register.indexOf('function buildRegistration');
  const build = register.slice(buildAt, register.indexOf('async function completeReg', buildAt));
  assert.match(build, /payment_method:payMethod/);
  assert.match(build, /method==='venmo'\|\|method==='zelle'\|\|method==='paypal'/);
  assert.match(build, /method==='zelle'\|\|method==='venmo'\|\|method==='already-paid'/);
});

test('PayPal capture path writes paypal method through paypalCapturePatch', () => {
  assert.match(markPaid, /paypalCapturePatch/);
  assert.match(markPaid, /payment_method/);
  assert.match(markPaid, /patch\.price_paid = amt/);
});

test('admin settlement helpers match the library, and the roster does not treat a host as unpaid', () => {
  const helpers = extractBetween(admin, '// SETTLEMENT_HELPERS_START', '// SETTLEMENT_HELPERS_END');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(helpers, sandbox);

  const rows = [
    [{ payStatus: 'host', pricePaid: null }, 150],
    [{ payStatus: 'unpaid', pricePaid: 0 }, 185],
    [{ payStatus: 'unpaid', pricePaid: null }, 150],
    [{ payStatus: 'pending' }, 25],
    [{ payStatus: 'paid', pricePaid: 0 }, 185],
    [{ payStatus: 'paid', pricePaid: 150 }, 150],
    [{ payStatus: 'in_kind' }, 185],
    [{ payStatus: 'waitlist' }, 40],
    [{ payStatus: 'cancelled' }, 40],
    [{ pay_status: 'free', price_paid: null }, 40],
    [{ payStatus: 'unpaid' }, null]
  ];
  rows.forEach(function (pair) {
    const row = pair[0];
    const price = pair[1];
    assert.equal(sandbox.registrationOwesMoney(row, price), lib.registrationOwesMoney(row, price));
    assert.equal(sandbox.registrationIsSettled(row, price), lib.registrationIsSettled(row, price));
    assert.equal(sandbox.rosterSettlementLabel(row, price), lib.rosterSettlementLabel(row, price));
    assert.equal(sandbox.rosterSettlementTagClass(row, price), lib.rosterSettlementTagClass(row, price));
  });

  assert.equal(sandbox.rosterSettlementLabel({ payStatus: 'host' }, 150), 'Comped/Host');
  const regs = admin.slice(admin.indexOf('function renderRegs'), admin.indexOf('function renderRegAlerts'));
  assert.match(regs, /regRosterStatusHtml\(r\)/);
  assert.match(regs, /regOwesMoney\(r\)/);
  assert.match(regs, /Mark unpaid/);
  assert.ok(regs.includes("regOwesMoney(r)?`<button class=\"btn sm success\" onclick=\"togglePaid('${r.id}')\">Mark paid</button>`"));
  assert.match(helpers, /Comped\/Host/);
  const dashStart = admin.indexOf('const totRegs=registrations.filter');
  const dash = admin.slice(dashStart, dashStart + 900);
  assert.match(dash, /payStatus==='unpaid'&&regOwesMoney\(r\)/);
  assert.match(dash, /regOwesMoney\(r\)/);
  const fin = admin.slice(admin.indexOf('function calcFin'), admin.indexOf('function financeSessionFigures'));
  assert.match(fin, /regs\.filter\(r=>r\.payStatus==='paid'\)/);
  const alerts = admin.slice(admin.indexOf('function renderRegAlerts'), admin.indexOf('function regModalCourse'));
  assert.match(alerts, /payStatus==='pending'&&regOwesMoney\(r\)/);
  assert.match(admin, /rosterSettlementLabel\(r,list\)/);
});

test('payment method migration adds columns and does not backfill old rows', () => {
  assert.match(migration, /add column if not exists payment_method text/);
  assert.match(migration, /add column if not exists payment_ref text/);
  assert.match(migration, /add column if not exists payment_detail text/);
  assert.match(migration, /'paypal', 'venmo', 'zelle', 'check', 'other'/);
  assert.doesNotMatch(migration, /update\s+public\.registrations/i);
  assert.doesNotMatch(migration, /update\s+registrations/i);
});
