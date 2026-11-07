'use strict';

// Grant applications live on Finances and are owner/admin only.
// Fees are Grants expenses. Awards are yearly income. The instructor
// portal does not receive the table.

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'migrations/20261107_grant_applications.sql'), 'utf8');

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
  'grantStatus', 'grantApplicationSummary', 'grantIncomeDate', 'grantIncomePosts',
  'applyGrantIncome', 'grantFeeDescription', 'grantApplicationToDB', 'emptyRevBucket',
  'financeYearFigures', 'round2'
];

function makeSandbox(grants) {
  const sandbox = { grantApplications: grants, GRANT_APP_STATUSES: [
    ['researching', 'Researching'], ['applied', 'Applied'], ['awarded', 'Awarded'], ['declined', 'Declined']
  ] };
  vm.createContext(sandbox);
  vm.runInContext(names.map((n) => extractFunction(admin, n)).join('\n'), sandbox);
  return sandbox;
}

const SEEDED = [
  { id: 'herrise-microgrant', name: 'HerRise MicroGrant', funder: 'Her Suite Spot', status: 'applied', applicationFeePaid: 15, amountRequested: 1000, dateApplied: '2026-11-07', dueDate: '2026-11-30' },
  { id: 'montgomery-dhhs-1160876', name: 'Montgomery County DHHS Open Solicitation #1160876', status: 'researching' },
  { id: 'amber-grant', name: 'Amber Grant', status: 'applied', applicationFeePaid: 15 },
  { id: 'ifundwomen', name: 'IFundWomen', status: 'applied' },
  { id: 'galaxy-grant', name: 'Galaxy Grant', status: 'researching', amountRequested: 3500, applicationFeePaid: 0, dueDate: '2027-01-31' }
];

test('the seeded pipeline totals fees, awards, and pending grants', () => {
  const sb = makeSandbox(SEEDED);
  const sum = sb.grantApplicationSummary(SEEDED);
  assert.equal(sum.fees, 30);
  assert.equal(sum.awarded, 0);
  assert.equal(sum.pending, 5);
  const awarded = SEEDED.concat([{ name: 'Example', status: 'awarded', amountAwarded: 1000, applicationFeePaid: 0 }]);
  const next = sb.grantApplicationSummary(awarded);
  assert.equal(next.awarded, 1000);
  assert.equal(next.pending, 5);
  assert.equal(sb.grantApplicationSummary([{ status: 'declined', amountAwarded: 500, applicationFeePaid: 15 }]).awarded, 0);
});

test('awarded money is yearly income on the decision date and is not added to a month of class profit', () => {
  const grants = [{ name: 'City grant', status: 'awarded', amountAwarded: 2500, decisionDate: '2026-11-20', dateApplied: '2026-10-01' }];
  const sb = makeSandbox(grants);
  assert.equal(sb.grantIncomeDate(grants[0]), '2026-11-20');
  assert.equal(sb.grantIncomeDate({ status: 'applied', amountAwarded: 2500, decisionDate: '2026-11-20' }), '');
  assert.equal(sb.grantIncomeDate({ status: 'awarded', amountAwarded: 2500, dateApplied: '2026-10-02' }), '2026-10-02');

  const yearly = {};
  sb.applyGrantIncome(yearly, 'yearly');
  assert.equal(yearly['2026'].grantIncome, 2500);
  const fig = sb.financeYearFigures(100, 3, 40);
  const profit = sb.round2(fig.profit + yearly['2026'].grantIncome);
  assert.equal(profit, sb.round2(fig.profit + 2500));
  assert.equal(fig.gross, 103);

  const monthly = { '2026-11': { rev: 100, cost: 40, grantIncome: 0 } };
  sb.applyGrantIncome(monthly, 'monthly');
  assert.equal(monthly['2026-11'].grantIncome, 0);
  assert.equal(Object.keys(monthly).length, 1);
});

test('a grant fee is named as an application fee for the Grants expense category', () => {
  const sb = makeSandbox([]);
  assert.equal(sb.grantFeeDescription({ name: 'HerRise MicroGrant' }), 'HerRise MicroGrant application fee');
  const row = sb.grantApplicationToDB({
    name: 'HerRise MicroGrant',
    funder: 'Her Suite Spot',
    link: 'https://hersuitespot.com/herrise-microgrant/',
    amountRequested: 1000,
    applicationFeePaid: 15,
    dateApplied: '2026-11-07',
    dueDate: '2026-11-30',
    decisionDate: '',
    status: 'applied',
    amountAwarded: null,
    notes: '',
    expenseId: 'grant-fee-herrise-microgrant'
  });
  assert.equal(row.application_fee_paid, 15);
  assert.equal(row.expense_id, 'grant-fee-herrise-microgrant');
  assert.equal(row.status, 'applied');
  assert.equal(row.date_applied, '2026-11-07');
  assert.equal(sb.grantStatus('Awarded'), 'awarded');
  assert.equal(sb.grantStatus('nope'), 'researching');
});

test('Grants is an expense category and the finance screen mounts the owner-only list', () => {
  assert.match(admin, /const EXP_CATS=\[[^\]]*'Grants'[^\]]*\]/);
  const cats = admin.match(/const EXP_CATS=\[(.*)\];/);
  const list = cats[1].split(',').map((c) => c.trim().replace(/^'|'$/g, ''));
  assert.equal(list.at(-1), 'Other');
  assert.ok(list.indexOf('Grants') < list.indexOf('Other'));
  assert.match(admin, /<option>Grants<\/option>/);
  assert.match(admin, /<div id="fin-grant-apps"><\/div>/);
  assert.match(admin, /renderGrantApplications\(\)/);
  assert.match(admin, /Owner only\. Instructors do not see this list/);
  assert.match(admin, /category:'Grants'/);
  assert.match(admin, /from\('grant_applications'\)/);
  assert.doesNotMatch(instructor, /grant_applications/);
  assert.doesNotMatch(instructor, /renderGrantApplications/);
  assert.doesNotMatch(instructor, /Grant applications/);
});

test('the migration locks grant applications to the owner/admin gate and seeds the known grants', () => {
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on table public\.grant_applications from public, anon, authenticated/);
  assert.match(sql, /private\.is_portal_admin\(\)/);
  const policy = sql.slice(sql.indexOf('create policy'));
  assert.doesNotMatch(policy, /user_metadata/);
  assert.match(sql, /to authenticated/);
  assert.doesNotMatch(sql, /to anon/);
  assert.match(sql, /status in \('researching', 'applied', 'awarded', 'declined'\)/);
  assert.match(sql, /HerRise MicroGrant/);
  assert.match(sql, /https:\/\/hersuitespot\.com\/herrise-microgrant\//);
  assert.match(sql, /Montgomery County DHHS Open Solicitation #1160876/);
  assert.match(sql, /Packet requested November 7, 2026/);
  assert.match(sql, /Amber Grant for Women Application Fee/);
  assert.match(sql, /IFundWomen/);
  assert.match(sql, /Galaxy Grant/);
  assert.match(sql, /'2027-01-31'/);
  assert.match(sql, /category = 'Grants'/);
});
