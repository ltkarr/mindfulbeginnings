'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

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

const rateStart = admin.indexOf('const PARTNER_FLAT_RATE=');
const rateEnd = admin.indexOf('const PARTNER_TIERS=');

const sandbox = {
  registrations: [],
  sessions: [],
  COURSES: { 'Safe Sitter®': { matCost: 20.35, hours: 5, price: 185 } },
  calcFin: (s) => ({ instrFee: s && s.instrPayOverride != null ? Number(s.instrPayOverride) : 0 }),
  sessionOrgCollectedDate: () => '2026-11-10',
  orgBillAmount: (s) => Number(s && s.orgBill) || 0,
  sessionEndDate: (s) => (s && s.date) || '',
  matToday: () => '2026-11-04',
  regCollectedDate: () => '2026-10-20',
  referralPartner: (r) => (r && r.liaisonId ? { id: r.liaisonId, name: 'Katy Greenberg' } : null),
  Math, Number, String, isFinite, Date
};
vm.createContext(sandbox);
vm.runInContext(
  [
    'const PAYPAL_PCT=0.0299, PAYPAL_FIXED=0.49;',
    'let partners=[], classRequests=[];',
    'function registrationReferralCredit(r){const q=referralPartner(r);return q?{partner:q,source:"",via:"name"}:null;}',
    'function sessionSourceCredit(){return null;}',
    'function referralUnitMeta(ids){const names=(ids||[]).map(id=>{const r=(registrations||[]).find(x=>x.id===id);return r?(r.studentName||r.parentName||""):"";}).filter(Boolean);return {names,source:""};}',
    admin.slice(rateStart, rateEnd),
    [
      'round2', 'processingFee', 'isLiveReg', 'regEffectivePrice',
      'partnerLiveKids', 'partnerInstructorPay', 'partnerCourseHandbook',
      'partnerPerStudentFigures', 'partnerStudentMoney',
      'partnerSessionEndDate', 'partnerSessionHasEnded', 'partnerEventDates',
      'partnerAttachCosts', 'partnerRevenueEvents', 'partnerBookingUnits',
      'fmtPlain', 'applyPartnerRowRates'
    ].map((n) => extractFunction(admin, n)).join('\n')
  ].join('\n'),
  sandbox
);

function kid(id, status, price, extra) {
  return Object.assign({
    id, sessionId: 'ss-1103', payStatus: status, pricePaid: price, studentName: id
  }, extra);
}

function willowClass(extraKids) {
  const kids = [
    kid('willow', 'paid', 185, { studentName: 'Willow Archuletta', liaisonId: 'katy' })
  ];
  for (let i = 0; i < 11; i++) kids.push(kid('p' + i, 'paid', 185));
  kids.push(kid('free', 'paid', 0, { studentName: 'Free Seat' }));
  (extraKids || []).forEach((row) => kids.push(row));
  return {
    session: {
      id: 'ss-1103',
      code: 'SS-1103',
      course: 'Safe Sitter®',
      date: '2026-11-03',
      instrPayOverride: 357.5,
      additionalCosts: [{ label: 'Facility rental', amount: 400 }]
    },
    kids
  };
}

test('SS-1103 Willow Archuletta commission is $52.45', () => {
  const { session, kids } = willowClass([
    kid('host', 'host', 0, { studentName: 'Host Kid' })
  ]);
  sandbox.registrations = kids;
  sandbox.sessions = [session];

  const fig = sandbox.partnerPerStudentFigures(session);
  assert.equal(fig.n, 13);
  assert.equal(fig.instructorPay, 357.5);
  assert.equal(fig.share, 27.5);
  assert.equal(fig.handbook, 20.35);
  assert.equal(fig.cost, 47.85);

  const money = sandbox.partnerStudentMoney(session, kids[0]);
  assert.equal(money.gross, 185);
  assert.equal(money.fee, 6.02);
  assert.equal(money.amount, 178.98);

  const events = sandbox.partnerRevenueEvents(session);
  const willow = events.find((e) => e.regId === 'willow');
  assert.equal(willow.gross, 185);
  assert.equal(willow.fee, 6.02);
  assert.equal(willow.amount, 178.98);
  assert.equal(willow.cost, 47.85);
  assert.equal(willow.net, 131.13);
  assert.equal(willow.collected, true);

  const units = sandbox.partnerBookingUnits('katy');
  assert.equal(units.length, 1);
  assert.equal(units[0].isReferral, true);
  assert.equal(units[0].events.length, 1);
  assert.equal(units[0].events[0].regId, 'willow');
  assert.equal(units[0].events[0].net, 131.13);

  const row = {
    net: units[0].events[0].net,
    collected: units[0].events[0].amount,
    costs: units[0].events[0].cost,
    isReferral: true
  };
  sandbox.applyPartnerRowRates([row], row.collected, {});
  assert.equal(row.commission, 52.45);
  assert.equal(row.rate, 0.4);
});

test('a host seat is outside the split, and a $0 seat is inside it', () => {
  const { session, kids } = willowClass();
  sandbox.registrations = kids;
  assert.equal(sandbox.partnerPerStudentFigures(session).n, 13);
  sandbox.registrations = kids.concat([kid('host', 'host', 0)]);
  assert.equal(sandbox.partnerPerStudentFigures(session).share, 27.5);
  sandbox.registrations = kids.filter((r) => r.id !== 'free');
  assert.equal(sandbox.partnerPerStudentFigures(session).n, 12);
  assert.notEqual(sandbox.partnerPerStudentFigures(session).share, 27.5);
});

test('an originated class sums the same per-student profit, including a $0 seat', () => {
  const { session, kids } = willowClass();
  session.originatedBy = 'katy';
  sandbox.registrations = kids;
  sandbox.sessions = [session];

  const units = sandbox.partnerBookingUnits('katy');
  assert.equal(units.length, 1);
  assert.equal(units[0].isReferral, false);
  assert.equal(units[0].events.length, 13);

  const nets = units[0].events.map((e) => e.net);
  const sum = sandbox.round2(nets.reduce((a, n) => a + n, 0));
  // 12 paying students at $131.13, and the $0 seat at -$47.85.
  assert.equal(sum, sandbox.round2(12 * 131.13 + (0 - 47.85)));
  const row = { net: sum, collected: 0, costs: 0, isReferral: false };
  sandbox.applyPartnerRowRates([row], 0, {});
  assert.equal(row.commission, sandbox.round2(sum * 0.4));
  assert.equal(row.commission, 610.28);
});

test('a facility rental is not charged to the referred student', () => {
  const { session, kids } = willowClass();
  session.additionalCosts.push({ label: 'Parking', amount: 80 });
  sandbox.registrations = kids;
  const willow = sandbox.partnerRevenueEvents(session).find((e) => e.regId === 'willow');
  assert.equal(willow.net, 131.13);
  assert.equal(willow.cost, 47.85);
});

test('an organization fee with no roster subtracts instructor pay once, not job extras', () => {
  const session = {
    id: 'org-1',
    course: 'Safe Sitter®',
    date: '2026-11-03',
    isCustomJob: true,
    priceOverride: 500,
    instrPayOverride: 150,
    orgBill: 0,
    additionalCosts: [{ label: 'Facility rental', amount: 75 }]
  };
  sandbox.registrations = [];
  sandbox.sessions = [session];
  const events = sandbox.partnerRevenueEvents(session);
  assert.equal(events.length, 1);
  assert.equal(events[0].amount, 500);
  assert.equal(events[0].fee, 0);
  assert.equal(events[0].cost, 150);
  assert.equal(events[0].net, 350);
});

test('an organization roster keeps one instructor share and one handbook per live student', () => {
  const session = {
    id: 'beth',
    course: 'Safe Sitter®',
    date: '2026-11-03',
    billToOrg: 'Temple Beth El',
    orgBill: 400,
    instrPayOverride: 100,
    originatedBy: 'katy'
  };
  sandbox.registrations = [
    kid('a', 'unpaid', null),
    kid('b', 'unpaid', null),
    kid('host', 'host', 0)
  ].map((r) => Object.assign(r, { sessionId: 'beth' }));
  sandbox.sessions = [session];
  const events = sandbox.partnerRevenueEvents(session);
  const org = events.find((e) => e.kind === 'org');
  const students = events.filter((e) => e.kind === 'family');
  assert.equal(org.amount, 400);
  assert.equal(org.cost, 0);
  assert.equal(students.length, 2);
  students.forEach((e) => {
    assert.equal(e.amount, 0);
    assert.equal(e.instrShare, 50);
    assert.equal(e.handbook, 20.35);
    assert.equal(e.cost, 70.35);
    assert.equal(e.net, -70.35);
  });
  const net = sandbox.round2(events.reduce((a, e) => a + e.net, 0));
  assert.equal(net, sandbox.round2(400 - 100 - 2 * 20.35));
});
