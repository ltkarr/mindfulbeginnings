'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'migrations', 'instructor_level.sql'), 'utf8');

const LEVELS = ['Started', 'Established', 'Senior', 'Lead'];

// Columns anon could already write before this migration. The new grant must
// keep every one of them and must not add instructor_level.
const PREEXISTING_WRITE_COLUMNS = [
  'id', 'name', 'email', 'phone', 'zelle', 'pin', 'created_at', 'bio',
  'safe_sitter_training_date', 'resume_path', 'cpr_cert_path', 'license_path',
  'contract_signed', 'contract_signed_date', 'contract_signature',
  'w9_submitted', 'hourly_rate', 'sweatshirt_size', 'headshot_completed',
  'is_rn', 'contract_type', 'safe_sitter_certified', 'pin_change_required',
  'is_active', 'archived_at'
];

function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed function ' + name);
}

const adminStart = admin.indexOf('const INSTRUCTOR_LEVELS=');
const adminEnd = admin.indexOf('function jobFromDB');
assert.ok(adminStart >= 0 && adminEnd > adminStart);
const adminSandbox = {};
vm.runInNewContext(admin.slice(adminStart, adminEnd) + `
  globalThis.normalizeInstructorLevel = normalizeInstructorLevel;
  globalThis.instructorFromDB = instructorFromDB;
  globalThis.instructorToDB = instructorToDB;
  globalThis.instructorLevelOptions = instructorLevelOptions;
  globalThis.INSTRUCTOR_LEVELS = INSTRUCTOR_LEVELS;
  globalThis.setLevelCol = (v) => { INSTRUCTOR_LEVEL_COL = v; };
`, adminSandbox);

const portalStart = instructor.indexOf('const INSTRUCTOR_LEVELS=');
const portalEnd = instructor.indexOf('// ─── SUPABASE');
assert.ok(portalStart >= 0 && portalEnd > portalStart);
const portalSandbox = {};
vm.runInNewContext(
  'function escapeHtml(t){return String(t==null?"":t);}\n' + instructor.slice(portalStart, portalEnd) + `
  globalThis.normalizeInstructorLevel = normalizeInstructorLevel;
  globalThis.instructorLevelBadge = instructorLevelBadge;
  globalThis.INSTRUCTOR_LEVELS = INSTRUCTOR_LEVELS;
`,
  portalSandbox
);

test('unknown or missing levels default to Started, in the same order everywhere', () => {
  for (const normalize of [adminSandbox.normalizeInstructorLevel, portalSandbox.normalizeInstructorLevel]) {
    assert.equal(normalize(undefined), 'Started');
    assert.equal(normalize(null), 'Started');
    assert.equal(normalize(''), 'Started');
    assert.equal(normalize('junior'), 'Started');
    assert.equal(normalize('Lead'), 'Lead');
    assert.equal(normalize('Senior'), 'Senior');
  }
  // Copy out of the vm realm so the comparison is about the values.
  assert.deepEqual([...adminSandbox.INSTRUCTOR_LEVELS], LEVELS);
  assert.deepEqual([...portalSandbox.INSTRUCTOR_LEVELS], LEVELS);
});

test('admin reads instructor_level and only writes it while the column exists', () => {
  const row = adminSandbox.instructorFromDB({ id: 'i1', name: 'Ada', pin: '111111', instructor_level: 'Senior' });
  assert.equal(row.level, 'Senior');
  const missing = adminSandbox.instructorFromDB({ id: 'i2', name: 'Bea', pin: '222222' });
  assert.equal(missing.level, 'Started');
  const saved = adminSandbox.instructorToDB({ id: 'i1', name: 'Ada', pin: '111111', level: 'Lead' });
  assert.equal(saved.instructor_level, 'Lead');
  adminSandbox.setLevelCol(false);
  const deferred = adminSandbox.instructorToDB({ id: 'i1', name: 'Ada', pin: '111111', level: 'Lead' });
  assert.equal(Object.prototype.hasOwnProperty.call(deferred, 'instructor_level'), false);
  adminSandbox.setLevelCol(true);
});

test('admin edit screen offers the four levels and the roster shows them', () => {
  assert.equal(adminSandbox.instructorLevelOptions('Established').match(/<option /g).length, 4);
  const options = adminSandbox.instructorLevelOptions('Senior');
  let last = -1;
  for (const level of LEVELS) {
    const at = options.indexOf('value="' + level + '"');
    assert.ok(at > last, level + ' is missing or out of order');
    last = at;
  }
  assert.match(options, /value="Senior" selected/);
  assert.equal((admin.match(/id="m-ilevel"/g) || []).length, 2);
  assert.match(admin, /<th>Level<\/th>/);
  assert.match(admin, /instructorLevelTag\(i\.level\)/);
  assert.match(admin, /migrations\/instructor_level\.sql/);
});

test('instructor portal shows the level and never sends it to a profile update', () => {
  assert.match(portalSandbox.instructorLevelBadge('Lead'), />Lead</);
  assert.match(instructor, /id="h-level"/);
  assert.match(instructor, /instructorLevelBadge\(me\.level\)/);
  assert.match(instructor, /instructor_get_level/);
  assert.doesNotMatch(instructor, /id="m-ilevel"/);
  assert.doesNotMatch(instructor, /<select[^>]*level/i);
  const calls = instructor.match(/instructor_update_self[\s\S]{0,280}/g) || [];
  assert.ok(calls.length >= 4);
  for (const call of calls) {
    assert.doesNotMatch(call, /instructor_level/);
  }
});

test('migration defaults existing instructors to Started and locks the column', () => {
  assert.match(sql, /add column if not exists instructor_level text not null default 'Started'/);
  assert.match(sql, /check \(instructor_level in \('Started', 'Established', 'Senior', 'Lead'\)\)/);
  assert.match(sql, /revoke insert, update on table public\.instructors from anon/);

  const grant = sql.match(/grant insert, update \(\s*([^)]+)\) on table public\.instructors to anon/i);
  assert.ok(grant, 'expected a column-level insert/update grant for anon');
  const granted = grant[1].split(',').map((c) => c.trim()).filter(Boolean);
  assert.deepEqual(granted, PREEXISTING_WRITE_COLUMNS);
  assert.equal(granted.includes('instructor_level'), false);

  assert.match(sql, /revoke insert, update \(instructor_level\) on table public\.instructors from anon/);
  assert.match(sql, /create trigger instructors_guard_level/);
  assert.match(sql, /before insert or update of instructor_level/);
  assert.match(sql, /v_role in \('authenticated', 'service_role'\)/);
  assert.match(sql, /instructor_level can only be changed by an admin/);
  assert.match(sql, /if p_changes \? 'instructor_level' then/);
  assert.match(sql, /function public\.instructor_get_level/);
  assert.match(sql, /instructor_level\s+from instructors/);
});
