'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations/org_portion.sql'), 'utf8');

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
  'isLiveReg', 'regEffectivePrice', 'processingFee',
  'instrBaseFee', 'instrDisplayFee', 'secondInstrDisplayFee',
  'orgPortionAmount', 'familyPrice', 'orgBillRate', 'orgRevenueHeadcount', 'orgBillAmount',
  'holdPaymentReceived', 'orgOrJobFeeReceived',
  'splitBillCaption', 'sessionRevenueNotes',
  'calcFin', 'invoiceLineFor',
  'escapeHtml', 'fmt'
];

const sandbox = {
  COURSES: {
    'Safe Sitter®': { price: 225, matCost: 20.35, hours: 5, maxStudents: 16 }
  },
  sessions: [],
  registrations: [],
  instructors: [{ id: 'bronwen', name: 'Bronwen Kennedy', hourlyRate: 50 }],
  jobDataCache: {},
  INSTR_RATE: 50,
  INSTR_EXTRA_HOURS: 0.5,
  PAYPAL_PCT: 0.0299,
  PAYPAL_FIXED: 0.49,
  getCoursePrice: () => 225,
  Array, Object, JSON, Date, Number, Math, String, isNaN
};
vm.createContext(sandbox);
vm.runInContext(names.map((n) => extractFunction(admin, n)).join('\n'), sandbox);

function fee(amount) {
  return amount * sandbox.PAYPAL_PCT + sandbox.PAYPAL_FIXED;
}

function troopSession(overrides) {
  return Object.assign({
    id: 'ss-261009',
    code: 'SS-261009',
    course: 'Safe Sitter®',
    date: '2026-10-09',
    priceOverride: 150,
    orgPortion: 25,
    billToOrg: 'GS Troop 42086 (Lynne Chandler)',
    billedHeadcount: 6,
    maxStudentsOverride: 10,
    instructorId: 'bronwen',
    isCustomJob: false,
    additionalCosts: []
  }, overrides || {});
}

test('SS-261009 bills the troop $25 times the roster, and the family price stays $150', () => {
  const session = troopSession();
  sandbox.registrations = [
    { id: 'paid', sessionId: session.id, payStatus: 'paid', pricePaid: 150 }
  ];
  sandbox.jobDataCache = { [session.id]: { instructorId: 'bronwen' } };
  const fin = sandbox.calcFin(session);
  const familyNet = 150 - fee(150);
  const orgBill = 25 * 6;

  assert.equal(sandbox.familyPrice(session), 150);
  assert.equal(sandbox.orgBillRate(session), 25);
  assert.equal(sandbox.orgRevenueHeadcount(session), 6);
  assert.equal(sandbox.orgBillAmount(session), orgBill);
  assert.equal(fin.orgRevenue, orgBill);
  assert.equal(fin.familyGross, 150);
  assert.equal(Math.round(fin.revenue * 100) / 100, Math.round((familyNet + orgBill) * 100) / 100);
  assert.equal(fin.instrFee, 325);
  assert.equal(Math.round(fin.profit * 100) / 100, Math.round((familyNet + orgBill - 325) * 100) / 100);
  // The old bug billed the troop at the family price: 6 × $150 on top of the paid seat.
  assert.notEqual(Math.round(fin.revenue * 100) / 100, Math.round((familyNet + 6 * 150) * 100) / 100);

  const line = sandbox.invoiceLineFor(session);
  assert.equal(line.qty, 6);
  assert.equal(line.rate, 25);
  assert.equal(line.amount, 150);
  assert.match(line.desc, /organization flat fee/);

  const notes = sandbox.sessionRevenueNotes(session, fin);
  assert.match(notes, /Families collected/);
  assert.match(notes, /after fees/);
  assert.match(notes, /Org invoice \$150 — not cash yet/);
  assert.match(notes, /\$25 flat fee × 6 girls/);
  assert.match(notes, /Family \$150\/girl at checkout/);
  assert.match(sandbox.splitBillCaption(session, fin), /not the family price times the roster/);
  assert.match(sandbox.splitBillCaption(session, fin), /not cash received yet/);
  // The row total is family net + $25×6, about $295, never the old $150×6 bill.
  assert.ok(fin.revenue < 400);
  assert.ok(fin.revenue > 250);
});

test('a blank roster on a split follows registered girls and ignores capacity and host seats', () => {
  const session = troopSession({ billedHeadcount: null, maxStudentsOverride: 10 });
  sandbox.registrations = [
    { id: 'paid', sessionId: session.id, payStatus: 'paid' },
    { id: 'open', sessionId: session.id, payStatus: 'unpaid' },
    { id: 'host', sessionId: session.id, payStatus: 'host' },
    { id: 'wait', sessionId: session.id, payStatus: 'waitlist' },
    { id: 'cx', sessionId: session.id, payStatus: 'cancelled' }
  ];
  sandbox.jobDataCache = {};
  assert.equal(sandbox.orgRevenueHeadcount(session), 2);
  assert.equal(sandbox.orgBillAmount(session), 50);
  const line = sandbox.invoiceLineFor(session);
  assert.equal(line.qty, 2);
  assert.equal(line.amount, 50);
  assert.equal(session.maxStudentsOverride, 10);
});

test('a full organization bill still uses the registration price when no per-girl share is set', () => {
  const beth = {
    id: 'beth',
    course: 'Safe Sitter®',
    date: '2026-10-16',
    priceOverride: 94,
    orgPortion: null,
    billToOrg: 'Congregation Beth El',
    billedHeadcount: 8,
    additionalCosts: []
  };
  sandbox.registrations = [];
  sandbox.jobDataCache = {};
  const fin = sandbox.calcFin(beth);
  assert.equal(sandbox.orgBillRate(beth), 94);
  assert.equal(fin.orgRevenue, 8 * 94);
  assert.equal(fin.familyGross, 0);
  const line = sandbox.invoiceLineFor(beth);
  assert.equal(line.rate, 94);
  assert.equal(line.amount, 752);
  assert.doesNotMatch(line.desc, /organization flat fee/);
});

test('the sessions table and the edit form show the family checkout and the org invoice separately', () => {
  assert.match(admin, /Org invoice \$\{fmt\(orgAmt\)\} — not cash yet/);
  assert.match(admin, /Families collected \$\{fmt\(familyNet\)\} after fees/);
  assert.match(admin, /Family \$\{fmt\(family\)\}\/girl at checkout/);
  assert.match(admin, /\$\{fmt\(portion\)\} flat fee × \$\{girls\}/);
  assert.match(admin, /function splitBillCaption/);
  assert.match(admin, /not the family price times the roster/);
  assert.match(admin, /\$\{fmt\(f\.revenue\)\}/);
  assert.match(admin, /const revenueCell=\(s,f,extra=''\)/);
  assert.match(admin, /id="m-org-portion"/);
  assert.match(admin, /Organization flat fee per girl/);
  assert.match(admin, /Girls on the org invoice/);
  assert.match(admin, /Org invoice total/);
  assert.match(admin, /Family price at registration/);
  assert.match(admin, /Family checkout: /);
  assert.match(admin, /Not mixed into family checkout/);
  assert.match(admin, /Not cash received yet/);
  assert.doesNotMatch(admin, /Organization pays per girl/);
  assert.doesNotMatch(admin, /Registration price per participant/);
  assert.doesNotMatch(admin, /splitRevenueHeadline/);
  assert.equal((admin.match(/\$\{orgBillingFieldsHtml\(/g) || []).length, 2);
});

test('public registration still charges the family price and does not read the organization share', () => {
  assert.match(register, /price_override/);
  assert.doesNotMatch(register, /org_portion|orgPortion/);
  const lists = [...register.matchAll(/SESSION_COLS\w*='([^']+)'/g)].map((m) => m[1]);
  assert.ok(lists.length >= 1);
  lists.forEach((list) => assert.equal(list.split(',').includes('org_portion'), false));
});

test('migration adds the column for admin, withholds it from anon, and sets this troop to $25', () => {
  const sql = migration.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
  assert.match(sql, /add column if not exists org_portion numeric/i);
  assert.match(sql, /revoke select \(org_portion\), insert \(org_portion\), update \(org_portion\), references \(org_portion\)[\s\S]*from anon, public/i);
  assert.doesNotMatch(sql, /revoke select, insert/i);
  const grants = sql.split(';').map((s) => s.trim()).filter((s) => /^grant\b/i.test(s));
  assert.equal(grants.length, 1);
  assert.match(grants[0], /to authenticated/i);
  assert.doesNotMatch(grants[0], /\banon\b/i);
  assert.match(sql, /code = 'SS-261009'/);
  assert.match(sql, /org_portion = 25/);
  assert.match(sql, /org_portion is null/);
});
