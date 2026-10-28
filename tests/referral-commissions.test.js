'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const api = require('../js/referral-commissions');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
const host = fs.readFileSync(path.join(root, 'host.html'), 'utf8');
const organization = fs.readFileSync(path.join(root, 'organization.html'), 'utf8');
const form = fs.readFileSync(path.join(root, 'js/class-request-form.js'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'migrations/20261022_referral_partners.sql'), 'utf8');

const MARY = {
  id: 'b7c1e4a2-6f08-4d3a-9e55-1a2b3c4d5e6f',
  name: 'Mary Parks',
  splitPct: 0.4,
  active: true,
  sources: ['Vanessa in Vienna']
};

function session(over) {
  return Object.assign({
    id: 'sess-1',
    date: '2026-11-02',
    course: 'Safe Sitter®',
    code: 'SS-261102',
    referralPartnerId: null,
    adminPrivateNotes: '',
    finance: { grossCollected: 0, grossExpected: 0, collected: 0, expected: 0, overhead: 0 }
  }, over || {});
}

function reg(over) {
  return Object.assign({
    id: 'reg-1',
    sessionId: 'sess-1',
    payStatus: 'paid',
    referralPartnerId: null,
    referralText: '',
    studentName: 'Ada Learner',
    createdAt: '2026-10-01',
    money: { grossCollected: 225, grossExpected: 0, collected: 217.78, expected: 0 }
  }, over || {});
}

test('Vanessa in Vienna matches the saved source, including a slight rewording', () => {
  assert.equal(api.referralSourceMatches('Vanessa in Vienna', 'Vanessa in Vienna'), true);
  assert.equal(api.referralSourceMatches('  vanessa in vienna ', 'Vanessa in Vienna'), true);
  assert.equal(api.referralSourceMatches('Other: Vanessa in Vienna', 'Vanessa in Vienna'), true);
  assert.equal(api.referralSourceMatches('Other/Referral: Vanessa in Vienna', 'Vanessa in Vienna'), true);
  assert.equal(api.referralSourceMatches('Allergy [How they heard about us: Vanessa in Vienna]', 'Vanessa in Vienna'), true);
  assert.equal(api.referralSourceMatches('Vanessa in Vienna — jane@example.com', 'Vanessa in Vienna'), true);
  assert.equal(api.referralSourceMatches('Vanessa from Vienna', 'Vanessa in Vienna'), true);
  assert.equal(api.referralSourceMatches('Mary Parks', 'Vanessa in Vienna'), false);
  assert.equal(api.referralSourceMatches('Vienna', 'Vanessa in Vienna'), false);
  assert.equal(api.referralSourceMatches('Facebook/Instagram', 'Vanessa in Vienna'), false);
  assert.equal(api.referralSourceMatches('', 'Vanessa in Vienna'), false);
});

test('a comped host registration is zero even if a price was stored', () => {
  ['host', 'comp', 'free', 'in_kind', 'cancelled', 'unpaid', 'waitlist'].forEach(function (status) {
    const money = api.registrationMoney({ payStatus: status }, 225, 7.22, api.DEFAULT_OVERHEAD_RULES);
    assert.deepEqual(money, { grossCollected: 0, grossExpected: 0, collected: 0, expected: 0 }, status);
  });
  const paid = api.registrationMoney({ payStatus: 'paid' }, 225, 7.22, api.DEFAULT_OVERHEAD_RULES);
  assert.equal(paid.grossCollected, 225);
  assert.equal(paid.collected, 217.78);
  assert.equal(paid.expected, 0);
  const gross = api.registrationMoney({ payStatus: 'paid' }, 225, 7.22, { netOfProcessingFees: false });
  assert.equal(gross.collected, 225);
});

test('commission is 40 percent of collected net after overhead, and a loss pays nothing', () => {
  const lines = api.buildReferralLines({
    partners: [MARY],
    audience: 'admin',
    sessions: [session({
      referralPartnerId: MARY.id,
      finance: { grossCollected: 200, grossExpected: 0, collected: 190, expected: 0, overhead: 70 }
    })]
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].overhead, 70);
  assert.equal(lines[0].netCollected, 120);
  assert.equal(lines[0].partnerCollected, 48);
  assert.equal(lines[0].ownerCollected, 72);
  assert.equal(lines[0].payoutStatus, 'owed');

  const loss = api.buildReferralLines({
    partners: [MARY],
    sessions: [session({
      referralPartnerId: MARY.id,
      finance: { grossCollected: 40, grossExpected: 0, collected: 30, expected: 0, overhead: 90 }
    })]
  });
  assert.equal(loss[0].netCollected, -60);
  assert.equal(loss[0].partnerCollected, 0);
  assert.equal(loss[0].ownerCollected, -60);
  assert.equal(loss[0].payoutStatus, 'none');
});

test('collected and expected each carry their share of overhead', () => {
  const lines = api.buildReferralLines({
    partners: [MARY],
    sessions: [session({
      adminPrivateNotes: 'Referral: Vanessa in Vienna',
      finance: { grossCollected: 300, grossExpected: 100, collected: 280, expected: 100, overhead: 76 }
    })]
  });
  const line = lines[0];
  assert.equal(line.source, 'Vanessa in Vienna');
  assert.equal(line.grossCollected, 300);
  assert.equal(line.grossExpected, 100);
  assert.equal(line.overheadCollected, 56);
  assert.equal(line.overheadExpected, 20);
  assert.equal(line.netCollected, 224);
  assert.equal(line.netExpected, 80);
  assert.equal(line.partnerCollected, 89.6);
  assert.equal(line.ownerCollected, 134.4);
  assert.equal(line.partnerExpected, 32);
  assert.equal(line.partnerCollected + line.ownerCollected, line.netCollected);
});

test('a host site attributes the whole session, and the same registration is not paid twice', () => {
  const lines = api.buildReferralLines({
    partners: [MARY],
    audience: 'admin',
    sessions: [session({
      finance: { grossCollected: 400, grossExpected: 0, collected: 380, expected: 0, overhead: 100 }
    })],
    registrations: [reg({ referralText: 'Vanessa in Vienna', studentName: 'Ada Learner' })],
    requests: [{
      id: 'req-1',
      kind: 'host',
      sessionId: 'sess-1',
      referralText: 'Vanessa in Vienna',
      who: 'Jane Host',
      createdAt: '2026-09-01'
    }]
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].grain, 'session');
  assert.equal(lines[0].partnerCollected, 112);
  assert.equal(lines[0].label.includes('Ada'), false);
});

test('one registration does not take the rest of the room', () => {
  const lines = api.buildReferralLines({
    partners: [MARY],
    audience: 'admin',
    sessions: [session({
      finance: { grossCollected: 400, grossExpected: 0, collected: 380, expected: 0, overhead: 100 }
    })],
    registrations: [reg({
      referralText: 'Other: Vanessa in Vienna',
      money: { grossCollected: 100, grossExpected: 0, collected: 95, expected: 0 }
    })]
  });
  assert.equal(lines.length, 1);
  assert.equal(lines[0].grain, 'registration');
  assert.equal(lines[0].collected, 95);
  assert.equal(lines[0].overhead, 25);
  assert.equal(lines[0].netCollected, 70);
  assert.equal(lines[0].partnerCollected, 28);
  assert.equal(lines[0].ownerCollected, 42);
  assert.match(lines[0].label, /Ada Learner/);
});

test('a different partner registration is carved out of a session referral', () => {
  const other = { id: 'partner-2', name: 'Other Partner', splitPct: 0.4, active: true, sources: ['Nextdoor'] };
  const lines = api.buildReferralLines({
    partners: [MARY, other],
    sessions: [session({
      referralPartnerId: MARY.id,
      finance: { grossCollected: 300, grossExpected: 0, collected: 300, expected: 0, overhead: 90 }
    })],
    registrations: [reg({
      referralText: 'Nextdoor',
      referralPartnerId: other.id,
      money: { grossCollected: 100, grossExpected: 0, collected: 100, expected: 0 }
    })]
  });
  const sessionLine = lines.find(function (l) { return l.partnerId === MARY.id; });
  const regLine = lines.find(function (l) { return l.partnerId === other.id; });
  assert.equal(sessionLine.collected, 200);
  assert.equal(sessionLine.overhead, 60);
  assert.equal(regLine.collected, 100);
  assert.equal(regLine.overhead, 30);
  assert.equal(api.round2(sessionLine.overhead + regLine.overhead), 90);
});

test('an organization request with no session yet is a zero row, and a host comp is zero', () => {
  const lines = api.buildReferralLines({
    partners: [MARY],
    audience: 'partner',
    sessions: [session()],
    registrations: [reg({
      id: 'host-reg',
      payStatus: 'host',
      referralText: 'Vanessa in Vienna',
      studentName: 'Host Child',
      money: api.registrationMoney({ payStatus: 'host' }, 225, 7, api.DEFAULT_OVERHEAD_RULES)
    })],
    requests: [{
      id: 'org-1',
      kind: 'organization',
      sessionId: null,
      referralText: 'Referred by Vanessa in Vienna',
      who: 'Troop 123',
      createdAt: '2026-10-20'
    }]
  });
  assert.equal(lines.length, 2);
  const org = lines.find(function (l) { return l.grain === 'organization'; });
  const hostReg = lines.find(function (l) { return l.grain === 'registration'; });
  assert.equal(org.collected, 0);
  assert.equal(org.partnerCollected, 0);
  assert.equal(org.label, 'Organization');
  assert.equal(hostReg.collected, 0);
  assert.equal(hostReg.partnerCollected, 0);
  assert.equal(hostReg.label.includes('Host Child'), false);
  assert.match(hostReg.label, /^Registration · /);
});

test('date range, payout status, and the partner snapshot omit names and contact fields', () => {
  const open = api.buildReferralLines({
    partners: [MARY],
    from: '2026-11-01',
    to: '2026-11-30',
    sessions: [
      session({ id: 'in', date: '2026-11-02', referralPartnerId: MARY.id, finance: { grossCollected: 100, grossExpected: 0, collected: 100, expected: 0, overhead: 0 } }),
      session({ id: 'out', date: '2026-12-02', referralPartnerId: MARY.id, finance: { grossCollected: 100, grossExpected: 0, collected: 100, expected: 0, overhead: 0 } })
    ]
  });
  assert.equal(open.length, 1);
  assert.equal(open[0].recordId, 'in');

  const paid = api.buildReferralLines({
    partners: [MARY],
    payouts: [{ partnerId: MARY.id, lineKey: 'session:sess-1', paidAt: '2026-11-15' }],
    sessions: [session({ referralPartnerId: MARY.id, finance: { grossCollected: 100, grossExpected: 50, collected: 100, expected: 50, overhead: 0 } })]
  });
  assert.equal(paid[0].payoutStatus, 'paid');
  const totals = api.summarizeReferralLines(paid);
  assert.equal(totals.partnerCollected, 40);
  assert.equal(totals.paid, 40);
  assert.equal(totals.owed, 0);
  assert.equal(totals.grossExpected, 50);
  assert.equal(totals.partnerExpected, 20);

  const snap = api.partnerSnapshot(api.buildReferralLines({
    partners: [MARY],
    audience: 'partner',
    registrations: [reg({ referralText: 'Vanessa in Vienna', studentName: 'Ada Learner', contact: 'ada-parent@example.com' })]
  }));
  const blob = JSON.stringify(snap);
  assert.equal(blob.includes('Ada'), false);
  assert.equal(blob.includes('parent@'), false);
  assert.equal(blob.includes('contact'), false);
  assert.equal(snap[0].partnerCollected, 87.11);
});

test('the printable report names both collected and expected and escapes labels', () => {
  const lines = api.buildReferralLines({
    partners: [MARY],
    sessions: [session({
      course: '<script>',
      referralPartnerId: MARY.id,
      finance: { grossCollected: 10, grossExpected: 5, collected: 10, expected: 5, overhead: 0 }
    })]
  });
  const html = api.reportHtml(lines, { readOnly: false });
  assert.match(html, /class="referral-print-sheet"/);
  assert.match(html, /class="referral-report"/);
  assert.match(html, /Gross collected/);
  assert.match(html, /Gross expected/);
  assert.match(html, /Partner 40%/);
  assert.match(html, /Owner 60%/);
  assert.match(html, /Mark paid/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
  const partnerHtml = api.reportHtml(lines, { readOnly: true });
  assert.doesNotMatch(partnerHtml, /Mark paid/);
});

test('the public forms offer Vanessa in Vienna and still store a referral answer', () => {
  assert.match(register, /<option>Vanessa in Vienna<\/option>/);
  assert.match(host, /<option>Vanessa in Vienna<\/option>/);
  assert.match(organization, /<option>Vanessa in Vienna<\/option>/);
  assert.match(host, /name="referral"/);
  assert.match(organization, /name="referral"/);
  assert.match(form, /function referralAnswer/);
  assert.match(form, /Vanessa in Vienna/);
  assert.match(register, /referral_source:referralSource\|\|''/);
});

test('admin commissions view is the liaison statement and does not replace login', () => {
  assert.match(admin, /function doLogin/);
  assert.doesNotMatch(admin, /id="screen-referrals"/);
  assert.doesNotMatch(admin, /more-link-title">Referral partners/);
  assert.match(admin, /partner_sources/);
  assert.match(admin, /Marketing sources/);
  assert.match(admin, /function registrationReferralCredit/);
  assert.doesNotMatch(admin, /sendEmail\(/);
  assert.match(admin, /window\.MB_ADMIN_BUILD='20261023-host-address'/);
});

test('the instructor portal uses the liaison statement and does not open a second referral login', () => {
  const login = instructor.slice(instructor.indexOf('async function doLogin'), instructor.indexOf('function showPinChangeScreen'));
  const failure = login.slice(login.indexOf('if(error||!profile)'), login.indexOf('me={id:profile.id'));
  assert.match(failure, /loadPartnerData\(pin\)/);
  assert.doesNotMatch(failure, /loadReferralPartner/);
  assert.doesNotMatch(failure, /referral_partner_report/);
  assert.doesNotMatch(failure, /loadData\(/);
  assert.doesNotMatch(instructor, /id="tab-referral"/);
  assert.match(instructor, /id="tab-partner"/);
  assert.match(instructor, /Your sources/);
});

test('the database enforces the partner role and backfills the Vanessa source', () => {
  assert.match(sql, /Mary Parks/);
  assert.match(sql, /Vanessa in Vienna/);
  assert.match(sql, /split_pct numeric not null default 0\.40/);
  assert.match(sql, /referral_partner_id uuid/);
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.referral_partners from anon, public/);
  assert.match(sql, /revoke all on table public\.referral_commission_snapshots from anon, public/);
  assert.match(sql, /grant execute on function public\.referral_partner_report\(text\) to anon/);
  assert.match(sql, /revoke all on function public\.referral_partner_set_pin\(uuid, text\) from public, anon/);
  assert.match(sql, /auth\.role\(\) is distinct from 'authenticated'/);
  assert.match(sql, /where partner_id = pid/);
  assert.match(sql, /pin = btrim\(p_pin\)/);
  assert.doesNotMatch(sql, /grant select on table public\.referral_partners to anon/i);
  assert.match(sql, /update public\.registrations/);
  assert.match(sql, /update public\.sessions/);
  assert.match(sql, /update public\.class_requests/);
});
