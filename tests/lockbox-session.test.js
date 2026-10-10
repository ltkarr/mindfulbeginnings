'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

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

function between(startNeedle, endNeedle) {
  const start = admin.indexOf(startNeedle);
  const end = admin.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0 && end > start, startNeedle);
  return admin.slice(start, end);
}

test('materials check-off time round-trips on job_data and is omitted before the column exists', () => {
  const sandbox = { MATERIALS_SENT_AT_COL: true };
  vm.createContext(sandbox);
  vm.runInContext(
    [extractFunction(admin, 'jobFromDB'), extractFunction(admin, 'jobToDB')].join('\n'),
    sandbox
  );
  const sent = sandbox.jobToDB('s1', {
    materialsSent: true,
    materialsSentAt: '2026-10-10T14:30:00.000Z',
    waitlist: []
  });
  assert.equal(sent.materials_sent, true);
  assert.equal(sent.materials_sent_at, '2026-10-10T14:30:00.000Z');
  const back = sandbox.jobFromDB(sent);
  assert.equal(back.materialsSent, true);
  assert.equal(back.materialsSentAt, '2026-10-10T14:30:00.000Z');

  const cleared = sandbox.jobToDB('s1', {
    materialsSent: false,
    materialsSentAt: '2026-10-10T14:30:00.000Z',
    waitlist: []
  });
  assert.equal(cleared.materials_sent, false);
  assert.equal(cleared.materials_sent_at, null);

  sandbox.MATERIALS_SENT_AT_COL = false;
  const pending = sandbox.jobToDB('s1', {
    materialsSent: true,
    materialsSentAt: '2026-10-10T14:30:00.000Z',
    waitlist: []
  });
  assert.equal(pending.materials_sent, true);
  assert.equal(Object.prototype.hasOwnProperty.call(pending, 'materials_sent_at'), false);
});

test('checking the lock box sets the shared flag and a timestamp, and unchecking clears both', () => {
  const sandbox = {
    jobDataCache: {},
    painted: [],
    upserts: [],
    paintLockboxRow(id) { sandbox.painted.push(id); },
    upsertJobData(id) { sandbox.upserts.push(id); return 'saved'; }
  };
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(admin, 'setMaterialsSent'), sandbox);
  const before = Date.now();
  assert.equal(sandbox.setMaterialsSent('abc', true), 'saved');
  assert.equal(sandbox.jobDataCache.abc.materialsSent, true);
  const stamp = Date.parse(sandbox.jobDataCache.abc.materialsSentAt);
  assert.ok(stamp >= before && stamp <= Date.now() + 1000);
  sandbox.setMaterialsSent('abc', false);
  assert.equal(sandbox.jobDataCache.abc.materialsSent, false);
  assert.equal(sandbox.jobDataCache.abc.materialsSentAt, null);
  assert.deepEqual(sandbox.painted, ['abc', 'abc']);
  assert.deepEqual(sandbox.upserts, ['abc', 'abc']);
});

test('the session editor, the custom job editor, and About share the lock box label', () => {
  const edit = between('function openEditSession(', 'async function saveSession');
  const job = between('function openEditCustomJob(', 'function toggleCustomHoldMode');
  const about = extractFunction(admin, 'openSessionAbout');
  for (const src of [edit, job, about]) {
    assert.match(src, /lockboxFieldHtml\(s\)/);
  }
  const htmlFn = extractFunction(admin, 'lockboxFieldHtml');
  assert.match(htmlFn, /Materials in lock box/);
  assert.match(htmlFn, /id="sess-lockbox"/);
  assert.match(htmlFn, /toggleMaterialsLockbox/);
  assert.match(htmlFn, /Same check-off as the dashboard/);
  assert.match(admin, /function toggleMaterialsLockbox\(sessId,checked\)\{\s*toggleMaterialsFromDash\(sessId,checked\);/);
  assert.match(admin, /return \(s&&s\.isCustomJob\)\?'Put out materials for the instructor':'Put out handbooks &amp; supplies';/);
});

test('edit session groups the same fields into Basics, Instructor and pay, Host and families, and More options', () => {
  const edit = between('function openEditSession(', 'async function saveSession');
  assert.match(edit, /<details class="sess-fold" open><summary>Basics<\/summary>/);
  assert.match(edit, /<details class="sess-fold" id="sess-instr-fold" open><summary>Instructor &amp; pay<\/summary>/);
  assert.match(edit, /<details class="sess-fold" open><summary>Host &amp; families<\/summary>/);
  assert.match(edit, /<details class="sess-fold"><summary>More options<\/summary>/);
  assert.match(edit, /id="m-course"/);
  assert.match(edit, /id="m-loc"/);
  assert.match(edit, /id="m-virtual"/);
  assert.match(edit, /id="m-instr"/);
  assert.match(edit, /id="m-instr-pay-override"/);
  assert.match(edit, /id="m-haddr"/);
  assert.match(edit, /id="m-hashost"/);
  assert.match(edit, /id="m-price-override"/);
  assert.match(edit, /orgBillingFieldsHtml\(s\)/);
  assert.match(edit, /id="m-hold"/);
  assert.match(edit, /sessionMaterialsPanelHtml\(\)/);
  assert.match(edit, /id="m-rn-row"/);
  assert.match(edit, /id="m-rn-reveal"/);
  assert.match(edit, /revealTeachLimit\('m-rn-row','m-rn-reveal','sess-instr-fold'\)/);
  assert.doesNotMatch(extractFunction(admin, 'openAddSession'), /sess-fold/);
});

test('custom job edit hides host and family fields and tucks RN and Safe Sitter limits away', () => {
  const job = between('function openEditCustomJob(', 'function toggleCustomHoldMode');
  assert.match(job, /<details class="sess-fold" open><summary>Basics<\/summary>/);
  assert.match(job, /<details class="sess-fold" id="sess-job-instr" open><summary>Instructor &amp; pay<\/summary>/);
  assert.match(job, /<details class="sess-fold"><summary>More options<\/summary>/);
  assert.doesNotMatch(job, /Host &amp; families/);
  assert.doesNotMatch(job, /Host & families/);
  assert.match(job, /id="cj-cred-row"/);
  assert.match(job, /id="cj-cred-reveal"/);
  assert.match(job, /id="cj-rnonly"/);
  assert.match(job, /id="cj-ssonly"/);
  assert.match(job, /revealTeachLimit\('cj-cred-row','cj-cred-reveal','sess-job-instr'\)/);
  assert.doesNotMatch(extractFunction(admin, 'openAddCustomJob'), /sess-fold/);
  const menu = extractFunction(admin, 'openSessionMenu');
  assert.match(menu, /isSessionFamilyAction/);
  assert.match(menu, /More actions/);
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(extractFunction(admin, 'isSessionFamilyAction'), sandbox);
  assert.equal(sandbox.isSessionFamilyAction('📋 Roster'), true);
  assert.equal(sandbox.isSessionFamilyAction('📩 Email Jane (info + roster)'), false);
  assert.equal(sandbox.isSessionFamilyAction('✏️ Edit session'), false);
});

test('phone layout stacks form fields in one column', () => {
  const css = admin.slice(admin.indexOf('@media(max-width:768px)'), admin.indexOf('</style>'));
  assert.match(css, /\.form-grid\{grid-template-columns:minmax\(0,1fr\)\}/);
  assert.match(css, /\.fg\{min-width:0\}/);
  assert.match(css, /\.sess-fold-body div\[style\*="justify-content:space-between"\]\{flex-wrap:wrap;gap:8px\}/);
});

test('lock box timestamp migration is in the repo and is not applied by the app', () => {
  const sql = fs.readFileSync(path.join(root, 'migrations', 'materials_lockbox.sql'), 'utf8');
  assert.match(sql, /alter table public\.job_data\s+add column if not exists materials_sent_at timestamptz;/);
  assert.match(sql, /revoke select \(materials_sent_at\), insert \(materials_sent_at\), update \(materials_sent_at\), references \(materials_sent_at\)/);
  assert.match(sql, /grant select \(materials_sent_at\), insert \(materials_sent_at\), update \(materials_sent_at\)\s+on table public\.job_data to authenticated;/);
  assert.match(admin, /migrations\/materials_lockbox\.sql/);
  assert.doesNotMatch(admin, /supabase\.rpc|apply_migration/);
});
