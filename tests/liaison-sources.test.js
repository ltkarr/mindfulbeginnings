'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'migrations/20261028_merge_referral_partners.sql'), 'utf8');
const rollback = fs.readFileSync(path.join(root, 'migrations/20261028_merge_referral_partners_rollback.sql'), 'utf8');
const matcher = require('../js/referral-commissions');

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

const rateStart = admin.indexOf('const PARTNER_FLAT_RATE=');
const rateEnd = admin.indexOf('const PARTNER_TIERS=');
const MARY = '84ed4c3c-2a32-4675-9b78-a18578999e68';

const sandbox = {
  registrations: [],
  sessions: [],
  partners: [],
  classRequests: [],
  MBReferralCommissions: matcher,
  COURSES: { 'Safe Sitter®': { matCost: 20.35, hours: 5, price: 185 } },
  calcFin: (s) => ({ instrFee: s && s.instrPayOverride != null ? Number(s.instrPayOverride) : 0 }),
  sessionOrgCollectedDate: () => '2026-11-10',
  orgBillAmount: (s) => Number(s && s.orgBill) || 0,
  sessionEndDate: (s) => (s && s.date) || '',
  matToday: () => '2026-11-04',
  regCollectedDate: () => '2026-10-20',
  Math, Number, String, isFinite, Date
};
vm.createContext(sandbox);
vm.runInContext(
  [
    'const PAYPAL_PCT=0.0299, PAYPAL_FIXED=0.49;',
    'const HEARD_NOTE_RE=/\\[How they heard about us:\\s*([^\\]]+)\\]/i;',
    admin.slice(rateStart, rateEnd),
    [
      'round2', 'processingFee', 'isLiveReg', 'regEffectivePrice',
      'partnerLiveKids', 'partnerInstructorPay', 'partnerCourseHandbook',
      'partnerPerStudentFigures', 'partnerStudentMoney',
      'partnerSessionEndDate', 'partnerSessionHasEnded', 'partnerEventDates',
      'partnerAttachCosts', 'partnerRevenueEvents', 'partnerBookingUnits',
      'fmtPlain', 'applyPartnerRowRates', 'partnerById',
      'referralSourceLabel', 'referrerName', 'normRefName', 'sameishName',
      'partnerByReferralName', 'referralPartner',
      'partnerSourceList', 'matchedPartnerSource', 'bestSourcePartner',
      'registrationHeardText', 'registrationReferralCredit', 'sessionSourceTexts',
      'sessionSourceCredit', 'referralUnitMeta', 'liaisonReferralText'
    ].map((name) => extractFunction(admin, name)).join('\n')
  ].join('\n'),
  sandbox
);

function kid(id, status, price, extra) {
  return Object.assign({
    id, sessionId: 'ss-1103', payStatus: status, pricePaid: price, studentName: id, referralSource: ''
  }, extra);
}

function roster() {
  const kids = [kid('willow', 'paid', 185, { studentName: 'Willow Archuletta' })];
  for (let i = 0; i < 11; i++) kids.push(kid('p' + i, 'paid', 185, { studentName: 'Student ' + i }));
  kids.push(kid('free', 'paid', 0, { studentName: 'Free Seat' }));
  kids.push(kid('host', 'host', 0, { studentName: 'Host Kid' }));
  return kids;
}

function session(extra) {
  return Object.assign({
    id: 'ss-1103',
    code: 'SS-1103',
    course: 'Safe Sitter®',
    date: '2026-11-03',
    instrPayOverride: 357.5,
    adminPrivateNotes: '',
    additionalCosts: [{ label: 'Facility rental', amount: 400 }]
  }, extra || {});
}

function use(kids, sx) {
  sandbox.registrations = kids;
  sandbox.sessions = [sx || session()];
  sandbox.classRequests = [];
  sandbox.partners = [
    { id: 'mary', name: 'Mary Parks', sources: ['Vanessa in Vienna', 'Yard sign'] },
    { id: 'katy', name: 'Katy Greenberg', sources: [] }
  ];
}

function commission(partnerId) {
  const units = sandbox.partnerBookingUnits(partnerId);
  const rows = units.map((unit) => ({
    collected: unit.events.reduce((sum, event) => sum + event.amount, 0),
    costs: unit.events.reduce((sum, event) => sum + (event.cost || 0), 0),
    net: unit.events.reduce((sum, event) => sum + (event.net || 0), 0),
    isReferral: unit.isReferral,
    source: unit.source
  }));
  sandbox.applyPartnerRowRates(rows, 0, {});
  return { units, rows, total: Math.round(rows.reduce((sum, row) => sum + row.commission, 0) * 100) / 100 };
}

test('the migration keeps the old tables, maps Mary, and does not copy her referral PIN', () => {
  assert.match(sql, /create table if not exists public\.partner_sources/);
  assert.match(sql, /referral_program_backup_partners/);
  assert.match(sql, /referral_program_backup_links/);
  assert.match(sql, new RegExp(MARY));
  assert.match(sql, /b7c1e4a2-6f08-4d3a-9e55-1a2b3c4d5e6f/);
  assert.match(sql, /references public\.partners\(id\)/);
  assert.match(sql, /update public\.referral_partners set pin = null/);
  assert.doesNotMatch(sql, /drop table/i);
  assert.doesNotMatch(sql, /update public\.partners[\s\S]{0,80}set pin/i);
  assert.match(sql, /from public\.partners p\s+join public\.partner_sources/);
  assert.match(rollback, /mb\.rollback_referral_merge/);
  assert.match(rollback, /referral_program_backup_links/);
  assert.match(rollback, /references public\.referral_partners\(id\)/);
});

test('a Vanessa in Vienna registration pays Mary the per-student 40 percent', () => {
  const kids = roster();
  kids[0].referralSource = 'Vanessa in Vienna';
  use(kids);
  const mary = commission('mary');
  assert.equal(mary.units.length, 1);
  assert.equal(mary.units[0].isReferral, true);
  assert.equal(mary.units[0].source, 'Vanessa in Vienna');
  assert.equal(mary.units[0].events.length, 1);
  assert.equal(mary.units[0].events[0].net, 131.13);
  assert.equal(mary.total, 52.45);
  assert.equal(commission('katy').units.length, 0);
  const label = sandbox.liaisonReferralText({
    isReferral: true,
    source: mary.units[0].source,
    refLabel: mary.units[0].refNames.join(', ')
  });
  assert.match(label, /Vanessa in Vienna — Willow Archuletta/);
});

test('naming Mary and matching her source are not two credits', () => {
  const kids = roster();
  kids[0].referralSource = 'Mary Parks';
  kids[0].referralPartnerId = 'b7c1e4a2-6f08-4d3a-9e55-1a2b3c4d5e6f';
  use(kids);
  const credit = sandbox.registrationReferralCredit(kids[0]);
  assert.equal(credit.partner.id, 'mary');
  assert.equal(credit.via, 'name');
  const mary = commission('mary');
  assert.equal(mary.units.length, 1);
  assert.equal(mary.units[0].events.length, 1);
  assert.equal(mary.total, 52.45);
});

test('an originated class is not also paid as a source', () => {
  const kids = roster();
  kids[0].referralSource = 'Vanessa in Vienna';
  kids[1].referralSource = 'Yard sign';
  use(kids, session({ originatedBy: 'mary' }));
  const mary = commission('mary');
  assert.equal(mary.units.length, 1);
  assert.equal(mary.units[0].isReferral, false);
  assert.equal(mary.total, 610.28);
});

test('a source on the class sums every unclaimed student once', () => {
  const kids = roster();
  kids[3].referralSource = 'Katy Greenberg';
  use(kids, session({ adminPrivateNotes: 'Referral: Vanessa in Vienna' }));
  const mary = commission('mary');
  const katy = commission('katy');
  assert.equal(mary.units.length, 1);
  assert.equal(mary.units[0].source, 'Vanessa in Vienna');
  assert.equal(mary.units[0].events.some((event) => event.regId === 'p2'), false);
  assert.equal(mary.total, 557.83);
  assert.equal(katy.units.length, 1);
  assert.equal(katy.units[0].events.length, 1);
  assert.equal(katy.total, 52.45);
});

test('an originated class blocks a second whole-class source credit', () => {
  const kids = roster();
  use(kids, session({ originatedBy: 'katy', adminPrivateNotes: 'Referral: Yard sign' }));
  assert.equal(commission('mary').units.length, 0);
  const katy = commission('katy');
  assert.equal(katy.units.length, 1);
  assert.equal(katy.units[0].isReferral, false);
  assert.equal(katy.total, 610.28);
});

test('the statement names both of Mary sources for the families they brought', () => {
  const kids = roster();
  kids[0].referralSource = 'Vanessa from Vienna';
  kids[1].referralSource = 'Yard sign';
  use(kids);
  const mary = commission('mary');
  assert.equal(mary.units.length, 1);
  assert.equal(mary.units[0].events.length, 2);
  assert.match(mary.units[0].source, /Vanessa in Vienna/);
  assert.match(mary.units[0].source, /Yard sign/);
  assert.equal(mary.total, 104.9);
});
