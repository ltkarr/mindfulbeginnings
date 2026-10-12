'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const paymentsJs = fs.readFileSync(path.join(root, 'js', 'payments.js'), 'utf8');
const payHtml = fs.readFileSync(path.join(root, 'pay.html'), 'utf8');
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
const pay = require('../js/invoice-payments.js');

function quotedConst(src, name) {
  const m = src.match(new RegExp(name + "\\s*[:=]\\s*'([^']*)'"));
  assert.ok(m, 'missing ' + name);
  return m[1];
}

const EXPECTED = [
  'PayPal: TODO: no PayPal username, email, or paypal.me link is on file.',
  'Venmo: @mindfulbeginnings',
  'Zelle: lindsay@mindfulbeginnings.org',
  'Check: Please make checks payable to Mindful Beginnings LLC.'
];

test('invoice payment lines reuse the Venmo and Zelle handles already in the repo', () => {
  assert.equal(pay.VENMO_USER, quotedConst(paymentsJs, 'VENMO_USER'));
  assert.equal(pay.ZELLE_EMAIL, quotedConst(paymentsJs, 'ZELLE_EMAIL'));
  assert.equal(quotedConst(payHtml, 'venmoUser'), 'mindfulbeginnings');
  assert.equal(quotedConst(payHtml, 'zelleEmail'), 'lindsay@mindfulbeginnings.org');
  assert.match(register, /@mindfulbeginnings/);
  assert.match(register, /lindsay@mindfulbeginnings\.org/);
  assert.equal(pay.CHECK_PAYABLE, 'Please make checks payable to Mindful Beginnings LLC.');
  assert.deepEqual(pay.paymentMethods().map(function (m) { return m.label + ': ' + m.detail; }), EXPECTED);
});

test('PayPal has no stored handle, so the invoice marks that line TODO', () => {
  const paypal = pay.paymentMethods().find(function (m) { return m.id === 'paypal'; });
  assert.match(paypal.detail, /^TODO:/);
  assert.doesNotMatch(paypal.detail, /@/);
  assert.doesNotMatch(paypal.detail, /paypal\.me\//i);
  assert.equal((pay.paymentPlainText().match(/TODO/g) || []).length, 1);
});

test('the on-screen invoice, the printable page, and the email body list every method', () => {
  const html = pay.html();
  const plain = pay.paymentPlainText();
  EXPECTED.forEach(function (line) {
    const label = line.split(': ')[0];
    const detail = line.slice(label.length + 2);
    assert.match(html, new RegExp('<strong>' + label + ':</strong> ' + detail.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.ok(plain.indexOf(line) !== -1, line);
  });
  assert.match(html, /How to pay/);
  assert.match(html, /background:#f8f9fc/);
  assert.match(html, /border:1px solid #dde4ee/);

  const email = pay.emailBody({
    invoiceNumber: 'MB-202610-01',
    orgName: 'GS Troop 42086',
    issueDate: '2026-10-31',
    dueDate: '2026-11-30',
    invoiceMonth: '2026-10',
    total: 450,
    notes: 'Payment due within 30 days of invoice date.',
    billTo: {
      name: 'GS Troop 42086',
      attn: 'Lynne Chandler',
      address: '1 Scout Way\nBethesda, MD 20814',
      email: 'troop@example.com'
    },
    lineItems: [{ date: '2026-10-09', desc: 'Safe Sitter®', qty: 15, rate: 30, amount: 450, flat: false }]
  });
  assert.match(email, /Invoice MB-202610-01/);
  assert.match(email, /Attn: Lynne Chandler/);
  assert.match(email, /troop@example\.com/);
  assert.match(email, /Oct 9, 2026 — Safe Sitter® — 15 × \$30 — \$450/);
  assert.match(email, /TOTAL DUE \$450/);
  assert.match(email, /Payment due within 30 days of invoice date\./);
  EXPECTED.forEach(function (line) { assert.ok(email.indexOf(line) !== -1, line); });
  assert.match(email, /Thank you for partnering with Mindful Beginnings\./);
  assert.doesNotMatch(email, /paypal\.me\//i);
});

test('admin prints the payment block on every invoice and copies it into the email', () => {
  assert.match(admin, /<script src="\/js\/invoice-payments\.js"><\/script>/);
  assert.match(admin, /const payBlock=payApi&&typeof payApi\.html==='function'\?payApi\.html\(\):''/);
  assert.match(admin, /const payEmail=payApi&&typeof payApi\.emailBody==='function'\?payApi\.emailBody\(v\):''/);
  const viewStart = admin.indexOf('function openInvoiceDoc(');
  const viewEnd = admin.indexOf('function openRoster(', viewStart);
  const view = admin.slice(viewStart, viewEnd);
  const notesAt = view.indexOf('v.notes?');
  const payAt = view.indexOf('${payBlock}');
  const thanksAt = view.indexOf('Thank you for partnering with Mindful Beginnings.');
  assert.ok(notesAt > 0 && payAt > notesAt && thanksAt > payAt);
  assert.match(view, /id="invoice-email-source"/);
  assert.match(view, /\$\{escapeHtml\(payEmail\)\}/);
  assert.match(view, /Copy email/);
  assert.match(view, /Invoice email copied\. Paste it into your own message\./);
  assert.doesNotMatch(view, /<\/script>/);
});

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

test('a new invoice does not copy forward a check-only note', () => {
  assert.equal(
    quotedConst(admin, 'INVOICE_CHECK_ONLY_TERMS'),
    'Payment due within 30 days of invoice date. Please make checks payable to Mindful Beginnings LLC.'
  );
  assert.equal(quotedConst(admin, 'INVOICE_DEFAULT_TERMS'), 'Payment due within 30 days of invoice date.');
  const els = {};
  function field(id) {
    if (!els[id]) els[id] = { value: '' };
    return els[id];
  }
  const sandbox = {
    invoices: [{
      orgName: 'GS Troop 42086',
      createdAt: 1,
      billTo: { name: 'Troop', attn: '', address: '', email: '' },
      notes: 'Payment due within 30 days of invoice date. Please make checks payable to Mindful Beginnings LLC.'
    }],
    ORG_BILLING_DEFAULTS: {},
    INVOICE_CHECK_ONLY_TERMS: quotedConst(admin, 'INVOICE_CHECK_ONLY_TERMS'),
    document: { getElementById: field }
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(admin, 'prefillInvoiceOrg'), sandbox);
  field('inv-org').value = 'GS Troop 42086';
  field('inv-notes').value = 'Payment due within 30 days of invoice date.';
  sandbox.prefillInvoiceOrg();
  assert.equal(field('inv-billname').value, 'Troop');
  assert.equal(field('inv-notes').value, 'Payment due within 30 days of invoice date.');

  sandbox.invoices[0].notes = 'Net 15. Purchase order required.';
  sandbox.prefillInvoiceOrg();
  assert.equal(field('inv-notes').value, 'Net 15. Purchase order required.');
});
