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
const gsMigration = fs.readFileSync(path.join(root, 'migrations/gs_h4782_split_billing.sql'), 'utf8');
const configJs = fs.readFileSync(path.join(root, 'config.js'), 'utf8');

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
  'calcFin', 'invoiceLineFor', 'familyForwardMoney',
  'escapeHtml', 'fmt'
];

const sandbox = {
  COURSES: {
    'Safe Sitter®': { price: 225, matCost: 20.35, hours: 5, maxStudents: 16 },
    'Girl Scouts — First Aid Badge Workshop': { price: 45, matCost: 0, hours: 1, maxStudents: 15 }
  },
  sessions: [],
  registrations: [],
  instructors: [{ id: 'bronwen', name: 'Bronwen Kennedy', hourlyRate: 50 }],
  jobDataCache: {},
  INSTR_RATE: 50,
  INSTR_EXTRA_HOURS: 0.5,
  PAYPAL_PCT: 0.0299,
  PAYPAL_FIXED: 0.49,
  getCoursePrice: (course) => (course === 'Girl Scouts — First Aid Badge Workshop' ? 45 : 225),
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

function firstAidSession(overrides) {
  return Object.assign({
    id: 'e76026bf-0c88-478b-b438-5f4bb46e2f57',
    code: 'GS-H4782',
    course: 'Girl Scouts — First Aid Badge Workshop',
    date: '2026-12-08',
    time: '6:30–7:30pm',
    isHold: false,
    isCustomJob: false,
    isPrivate: true,
    priceOverride: 15,
    orgPortion: 30,
    billToOrg: 'Girl Scout Troop 34182 (Mary Polacek)',
    billedHeadcount: 15,
    maxStudentsOverride: 15,
    location: 'Takoma Presbyterian Church',
    additionalCosts: []
  }, overrides || {});
}

test('GS-H4782 bills the troop $30 times 15 scouts and keeps the family price at $15', () => {
  const session = firstAidSession();
  sandbox.registrations = [];
  sandbox.jobDataCache = {};
  assert.equal(sandbox.familyPrice(session), 15);
  assert.equal(sandbox.orgBillRate(session), 30);
  assert.equal(sandbox.orgRevenueHeadcount(session), 15);
  assert.equal(sandbox.orgBillAmount(session), 450);
  const fin = sandbox.calcFin(session);
  assert.equal(fin.orgRevenue, 450);
  assert.equal(fin.familyGross, 0);
  assert.equal(fin.revenue, 450);
  const line = sandbox.invoiceLineFor(session);
  assert.equal(line.qty, 15);
  assert.equal(line.rate, 30);
  assert.equal(line.amount, 450);
  assert.match(line.desc, /organization flat fee/);
  const notes = sandbox.sessionRevenueNotes(session, fin);
  assert.match(notes, /Org invoice \$450 — not cash yet/);
  assert.match(notes, /\$30 flat fee × 15/);
  assert.match(notes, /Family \$15\/girl at checkout/);

  sandbox.registrations = [
    { id: 'paid', sessionId: session.id, payStatus: 'paid', pricePaid: 15 }
  ];
  const withFamily = sandbox.calcFin(session);
  const familyNet = 15 - fee(15);
  assert.equal(withFamily.familyGross, 15);
  assert.equal(withFamily.orgRevenue, 450);
  assert.equal(Math.round(withFamily.revenue * 100) / 100, Math.round((familyNet + 450) * 100) / 100);
  assert.notEqual(Math.round(withFamily.revenue * 100) / 100, Math.round((familyNet + 15 * 15) * 100) / 100);
  const money = sandbox.familyForwardMoney(session);
  assert.match(money.familyPayLine, /\$15 per registration/);
  assert.match(money.orgCoverLine, /\$30 per scout/);
  assert.match(money.orgCoverLine, /\$450/);
  assert.match(money.orgCoverLine, /Girl Scout Troop 34182 \(Mary Polacek\)/);
});

test('a custom job still ignores a per-scout split until it is a course session', () => {
  const job = firstAidSession({
    isCustomJob: true,
    course: 'Girl Scouts — First Aid Badge Workshop (Troop 34182)',
    orgPortion: 30,
    priceOverride: 15
  });
  sandbox.registrations = [];
  sandbox.jobDataCache = {};
  const fin = sandbox.calcFin(job);
  assert.equal(fin.revenue, 15);
  assert.equal(sandbox.orgBillAmount(job), 0);
  const blocked = sandbox.familyForwardMoney(firstAidSession({ isCustomJob: true, orgPortion: null, priceOverride: 15 }));
  assert.match(blocked.familyPayLine, /not set on a custom job/);
});

test('the First Aid Badge course is on the session form, at $45 for 60 minutes', () => {
  assert.match(admin, /'Girl Scouts — First Aid Badge Workshop':\{price:45,price2027:45,priceNew:45,priceNew2027:45,matCost:0,hours:1,maxStudents:15\}/);
  assert.doesNotMatch(admin, /'Girl Scouts — First Aid Badge Workshop':\{[^}\n]*requiresRN/);
  assert.equal((admin.match(/Girl Scouts — First Aid Badge Workshop/g) || []).length > 3, true);
  assert.match(admin, /<option>Girl Scouts — First Aid Badge Workshop<\/option>/);
  assert.match(admin, /s\.course==='Girl Scouts — First Aid Badge Workshop'/);
  assert.match(admin, /Family price at registration 15/);
  assert.match(admin, /Organization flat fee per girl 30/);
  assert.match(admin, /do not use a custom job/);
  assert.match(configJs, /'Girl Scouts — First Aid Badge Workshop':\{price:45/);
  assert.match(configJs, /requiresRN:true/);
  assert.match(configJs, /'Girl Scouts — First Aid Badge Workshop':15/);
  assert.match(register, /'Girl Scouts — First Aid Badge Workshop':45/);
  assert.match(register, /'Girl Scouts — First Aid Badge Workshop':15/);
});

test('GS-H4782 migration sets the split and does not rewrite the confirmed date or hold', () => {
  const sql = gsMigration.split('\n').filter((line) => !line.trim().startsWith('--')).join('\n');
  assert.match(sql, /code = 'GS-H4782'/);
  assert.match(sql, /id = 'e76026bf-0c88-478b-b438-5f4bb46e2f57'/);
  assert.match(sql, /price_override = 15/);
  assert.match(sql, /org_portion = 30/);
  assert.match(sql, /billed_headcount = 15/);
  assert.match(sql, /is_custom_job = false/);
  assert.match(sql, /course = 'Girl Scouts — First Aid Badge Workshop'/);
  assert.match(sql, /org_portion is null/);
  assert.match(sql, /price_override is null/);
  assert.doesNotMatch(sql, /\bdate\s*=/);
  assert.doesNotMatch(sql, /\btime\s*=/);
  assert.doesNotMatch(sql, /\bis_hold\s*=/);
  assert.doesNotMatch(sql, /\bhold_term\s*=/);
  assert.doesNotMatch(sql, /\bis_private\s*=/);
});
