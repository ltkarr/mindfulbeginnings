'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const admin = fs.readFileSync(path.join(__dirname, '../admin.html'), 'utf8');
const instructor = fs.readFileSync(path.join(__dirname, '../instructor.html'), 'utf8');
const sql = fs.readFileSync(path.join(__dirname, '../partners_commission_rate.sql'), 'utf8');

function extractFunction(src, name) {
  const needle = 'function ' + name + '(';
  const start = src.indexOf(needle);
  assert.ok(start >= 0, 'expected function ' + name);
  const brace = src.indexOf('{', start);
  let depth = 0;
  for (let i = brace; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed function ' + name);
}

function loadHelpers() {
  const PARTNER_FLAT_RATE = 0.20;
  let PARTNER_INSTRUCTOR_COL = true;
  let PARTNER_COMMISSION_RATE_COL = true;
  const PARTNER_ACCEL_MIN = Infinity;
  const partners = [
    {id: 'katy', name: 'Katy Greenberg', commissionRate: 0.40},
    {id: 'travis', name: 'Travis Edwards', commissionRate: null},
    {id: 'mary', name: 'Mary Parks', commissionRate: 0.20}
  ];
  function partnerById(id) { return partners.find(p => p.id === id) || null; }
  function round2(n) { return Math.round((Number(n) || 0) * 100) / 100; }
  function fmtPlain(n) {
    const v = Number(n) || 0;
    return '$' + v.toLocaleString('en-US', {minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2});
  }
  function partnerSettings() { return {accelGrouping: 'booking', repeatPolicy: 'tier'}; }
  const partnerFromDB = eval('(' + extractFunction(admin, 'partnerFromDB') + ')');
  const partnerToDB = eval('(' + extractFunction(admin, 'partnerToDB') + ')');
  const partnerFlatRate = eval('(' + extractFunction(admin, 'partnerFlatRate') + ')');
  const partnerTiersFor = eval('(' + extractFunction(admin, 'partnerTiersFor') + ')');
  const parsePartnerCommissionInput = eval('(' + extractFunction(admin, 'parsePartnerCommissionInput') + ')');
  const tierFor = eval('(' + extractFunction(admin, 'tierFor') + ')');
  const nextTierFor = eval('(' + extractFunction(admin, 'nextTierFor') + ')');
  const applyPartnerRowRates = eval('(' + extractFunction(admin, 'applyPartnerRowRates') + ')');
  return {
    PARTNER_FLAT_RATE, partners, partnerById, partnerFromDB, partnerToDB,
    partnerFlatRate, partnerTiersFor, parsePartnerCommissionInput,
    tierFor, nextTierFor, applyPartnerRowRates, round2
  };
}

test('admin still defaults the engine to 20% of net', () => {
  assert.match(admin, /const PARTNER_FLAT_RATE=0\.20/);
  assert.match(admin, /label:'20% of net'/);
});

test('admin maps commission_rate and uses per-partner helpers in the engine', () => {
  assert.match(admin, /commissionRate:\(cr==null\|\|cr===''\)\?null/);
  assert.match(admin, /if\(PARTNER_COMMISSION_RATE_COL\)row\.commission_rate/);
  assert.match(admin, /function partnerFlatRate\(partnerOrId\)/);
  assert.match(admin, /function partnerTiersFor\(partnerOrId\)/);
  assert.match(admin, /id="m-pcomm"/);
  assert.match(admin, /Commission % of net after costs/);
  assert.match(admin, /flatRate:partnerFlatRate\(p\)/);
  assert.match(admin, /tiers:partnerTiersFor\(p\)\.map/);
  assert.match(admin, /net\*partnerFlatRate\(q\)/);
  assert.match(admin, /tierFor\(monthTotal,partnerId\)/);
  assert.match(admin, /applyPartnerRowRates\(rows,monthTotal,cfg,partnerId\)/);
  assert.doesNotMatch(
    admin.slice(admin.indexOf('function referralRegCommission')),
    /net\*PARTNER_FLAT_RATE/
  );
});

test('partner portal falls back to published flatRate rather than a hardcoded 20%', () => {
  assert.match(instructor, /d\.flatRate\|\|0\.20/);
  assert.match(instructor, /engine default 20% of net/);
});

test('repo documents partners.commission_rate', () => {
  assert.match(sql, /add column if not exists commission_rate numeric/);
  assert.match(sql, /Null = use the admin engine default PARTNER_FLAT_RATE/);
});

test('partnerFlatRate uses override or default; partnerTiersFor labels it', () => {
  const h = loadHelpers();
  assert.equal(h.partnerFlatRate({commissionRate: 0.40}), 0.40);
  assert.equal(h.partnerFlatRate('katy'), 0.40);
  assert.equal(h.partnerFlatRate('travis'), 0.20);
  assert.equal(h.partnerFlatRate({commissionRate: null}), 0.20);
  assert.equal(h.partnerFlatRate('missing'), 0.20);
  assert.equal(h.partnerFlatRate({commissionRate: 0}), 0);
  assert.equal(h.partnerFlatRate({commissionRate: 1.5}), 0.20);
  assert.equal(h.partnerFlatRate('mary'), 0.20);
  const katyTiers = h.partnerTiersFor('katy');
  assert.equal(katyTiers.length, 1);
  assert.equal(katyTiers[0].rate, 0.40);
  assert.equal(katyTiers[0].label, '40% of net');
  const travisTiers = h.partnerTiersFor('travis');
  assert.equal(travisTiers[0].rate, 0.20);
  assert.equal(travisTiers[0].label, '20% of net');
  assert.equal(h.tierFor(100, 'katy').label, '40% of net');
  assert.equal(h.nextTierFor(100, 'katy'), null);
});

test('applyPartnerRowRates commissions 40% vs 20% of the same net', () => {
  const h = loadHelpers();
  const row = {sessionId: 's1', collected: 200, costs: 50, net: 150, isOrg: false, isRepeat: false};
  h.applyPartnerRowRates([row], 200, null, 'katy');
  assert.equal(row.rate, 0.40);
  assert.equal(row.commission, 60);
  const row2 = {sessionId: 's1', collected: 200, costs: 50, net: 150, isOrg: false, isRepeat: false};
  h.applyPartnerRowRates([row2], 200, null, 'travis');
  assert.equal(row2.rate, 0.20);
  assert.equal(row2.commission, 30);
});

test('saving 20% leaves a null override null; 40% stores 0.40', () => {
  const h = loadHelpers();
  assert.deepEqual(h.parsePartnerCommissionInput('20', null), {rate: null});
  assert.deepEqual(h.parsePartnerCommissionInput('', null), {rate: null});
  assert.deepEqual(h.parsePartnerCommissionInput('20', 0.20), {rate: 0.20});
  assert.deepEqual(h.parsePartnerCommissionInput('40', 0.40), {rate: 0.40});
  assert.deepEqual(h.parsePartnerCommissionInput('40', null), {rate: 0.40});
  assert.deepEqual(h.parsePartnerCommissionInput('20', 0.40), {rate: 0.20});
  assert.ok(h.parsePartnerCommissionInput('101', null).error);
});

test('partnerFromDB / partnerToDB round-trip commission_rate', () => {
  const h = loadHelpers();
  const katy = h.partnerFromDB({id: 'k', name: 'Katy Greenberg', commission_rate: '0.4000'});
  assert.equal(katy.commissionRate, 0.4);
  const travis = h.partnerFromDB({id: 't', name: 'Travis Edwards', commission_rate: null});
  assert.equal(travis.commissionRate, null);
  assert.equal(h.partnerToDB(katy).commission_rate, 0.4);
  assert.equal(h.partnerToDB(travis).commission_rate, null);
});
