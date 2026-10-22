'use strict';

// Cross-check: lib/job-eligibility.js (server-side, used by the job-alert job)
// must agree with the instructor portal's own canTeachSession() for every
// instructor/session combination. If someone changes credential rules in
// instructor.html without updating lib/job-eligibility.js, this test fails.

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const portal = fs.readFileSync(path.join(__dirname, '..', 'instructor.html'), 'utf8');
const elig = require('../lib/job-eligibility');

function extractBraced(src, startMarker) {
  const start = src.indexOf(startMarker);
  assert.ok(start >= 0, 'missing ' + startMarker);
  let i = src.indexOf('{', start);
  assert.ok(i >= 0, 'no brace after ' + startMarker);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed block: ' + startMarker);
}

function extractFn(src, name) {
  return extractBraced(src, 'function ' + name + '(');
}

// Portal's canTeachSession, evaluated in a sandbox with a controllable `me`.
// Uses config-instructor.js (the live portal config) — the same source the
// portal itself loads. The safety patch is extracted from instructor.html.
function portalCanTeach(sessionCamel, me) {
  const liveConfig = fs.readFileSync(path.join(__dirname, '..', 'config-instructor.js'), 'utf8');
  const coursesSrc = extractBraced(liveConfig, 'const COURSES={').replace('const COURSES={', 'var COURSES={');
  // Safety-patch block: slice from its start through its closing "});"
  // (brace-matching would drop the forEach's closing paren).
  const patchStart = portal.indexOf('Object.keys(COURSES).forEach(c=>');
  assert.ok(patchStart >= 0, 'missing COURSES safety patch');
  const patchEnd = portal.indexOf('});', patchStart);
  assert.ok(patchEnd > patchStart, 'unterminated COURSES safety patch');
  const patchSrc = portal.slice(patchStart, patchEnd + 3);
  const sandbox = {
    me: Object.assign({}, me),
    RN_RESTRICTION_KNOWN: true,
    console: { warn() {} },
  };
  vm.createContext(sandbox);
  vm.runInContext(coursesSrc + ';', sandbox);
  vm.runInContext(patchSrc + ';', sandbox);
  vm.runInContext(
    [
      extractFn(portal, 'isSafeSitterCertified'),
      extractFn(portal, 'canTeach'),
      extractFn(portal, 'sessionRequiresRN'),
      extractFn(portal, 'sessionRequiresSafeSitter'),
      extractFn(portal, 'sessionRequiresSpanish'),
      extractFn(portal, 'canTeachSession'),
      'var __result = canTeachSession(__session);',
    ].join('\n'),
    Object.assign(sandbox, { __session: sessionCamel })
  );
  return sandbox.__result;
}

// Test sessions in DB (snake_case) form.
const SESSIONS = [
  { name: 'safe sitter course', course: 'Safe Sitter®', requires_rn: false, requires_safe_sitter: false, requires_spanish: false, is_custom_job: false },
  { name: 'stay ready (RN pattern)', course: 'Stay Ready: Choking Rescue and CPR', requires_rn: false, requires_safe_sitter: false, requires_spanish: false, is_custom_job: false },
  { name: 'babysitters training', course: "Babysitter's Training", requires_rn: false, requires_safe_sitter: false, requires_spanish: false, is_custom_job: false },
  { name: 'rc adult', course: 'Adult First Aid/CPR/AED Certification', requires_rn: false, requires_safe_sitter: false, requires_spanish: false, is_custom_job: false },
  { name: 'rc bls', course: 'Basic Life Support (BLS) Certification', requires_rn: false, requires_safe_sitter: false, requires_spanish: false, is_custom_job: false },
  { name: 'rc adult hybrid', course: 'Adult & Pediatric First Aid/CPR/AED Certification (Hybrid)', requires_rn: false, requires_safe_sitter: false, requires_spanish: false, is_custom_job: false },
  { name: 'rc bls hybrid', course: 'Basic Life Support (BLS) Certification (Hybrid)', requires_rn: false, requires_safe_sitter: false, requires_spanish: false, is_custom_job: false },
  { name: 'red cross course', course: 'Adult & Pediatric First Aid/CPR/AED Certification', requires_rn: false, requires_safe_sitter: false, requires_spanish: false, is_custom_job: false },
  { name: 'plain course', course: 'All Kids Welcome', requires_rn: false, requires_safe_sitter: false, requires_spanish: false, is_custom_job: false },
  { name: 'custom spanish job', course: 'Custom Workshop', requires_rn: false, requires_safe_sitter: false, requires_spanish: true, is_custom_job: true },
  { name: 'custom RN job', course: 'Custom Workshop', requires_rn: true, requires_safe_sitter: false, requires_spanish: false, is_custom_job: true },
  { name: 'custom safe sitter job', course: 'Custom Workshop', requires_rn: false, requires_safe_sitter: true, requires_spanish: false, is_custom_job: true },
  { name: 'girl scout first aid badge', course: 'Girl Scouts — First Aid Badge Workshop', requires_rn: false, requires_safe_sitter: false, requires_spanish: false, is_custom_job: false },
  { name: 'baby ready + CPR', course: 'Baby Ready + CPR Certification', requires_rn: false, requires_safe_sitter: false, requires_spanish: false, is_custom_job: false },
  { name: 'grandparents', course: 'Grandparents: Getting Started', requires_rn: false, requires_safe_sitter: false, requires_spanish: false, is_custom_job: false },
];

const INSTRUCTORS = [
  { name: 'general', is_rn: false, speaks_spanish: false, safe_sitter_certified: null, safe_sitter_training_date: '', is_lead_teacher: false },
  { name: 'rn', is_rn: true, speaks_spanish: false, safe_sitter_certified: null, safe_sitter_training_date: '', is_lead_teacher: false },
  { name: 'safe sitter certified', is_rn: false, speaks_spanish: false, safe_sitter_certified: true, safe_sitter_training_date: '2024-01-01', is_lead_teacher: false },
  { name: 'training date only', is_rn: false, speaks_spanish: false, safe_sitter_certified: null, safe_sitter_training_date: '2024-01-01', is_lead_teacher: false },
  { name: 'explicitly not certified', is_rn: false, speaks_spanish: false, safe_sitter_certified: false, safe_sitter_training_date: '', is_lead_teacher: false },
  { name: 'spanish speaker', is_rn: false, speaks_spanish: true, safe_sitter_certified: null, safe_sitter_training_date: '', is_lead_teacher: false },
  { name: 'lead teacher', is_rn: false, speaks_spanish: false, safe_sitter_certified: null, safe_sitter_training_date: '', is_lead_teacher: true },
  { name: 'rn + spanish + sitter', is_rn: true, speaks_spanish: true, safe_sitter_certified: true, safe_sitter_training_date: '2024-01-01', is_lead_teacher: false },
];

function toPortalSession(s) {
  return {
    course: s.course,
    requiresRN: !!s.requires_rn,
    requiresSS: !!s.requires_safe_sitter,
    requiresSpanish: !!s.requires_spanish,
    isCustomJob: !!s.is_custom_job,
  };
}

function toPortalMe(instr) {
  return {
    isRN: !!instr.is_rn,
    speaksSpanish: !!instr.speaks_spanish,
    safeSitterCertified: instr.safe_sitter_certified,
    safeSitterTrainingDate: instr.safe_sitter_training_date || '',
    isLeadTeacher: !!instr.is_lead_teacher,
  };
}

test('server eligibility matches portal canTeachSession for every combination', () => {
  let checked = 0;
  for (const instr of INSTRUCTORS) {
    for (const s of SESSIONS) {
      const expected = portalCanTeach(toPortalSession(s), toPortalMe(instr));
      const actual = elig.canTeachSession(s, instr);
      assert.strictEqual(
        actual, expected,
        `mismatch: instructor=${instr.name} session=${s.name} (portal=${expected}, lib=${actual})`
      );
      checked++;
    }
  }
  assert.ok(checked === INSTRUCTORS.length * SESSIONS.length, 'matrix did not run fully');
});

test('spot checks: restricted jobs hidden from uncredentialed instructors', () => {
  const general = INSTRUCTORS[0];
  const rn = INSTRUCTORS[1];
  const sitter = INSTRUCTORS[2];
  const lead = INSTRUCTORS[6];
  const byName = n => SESSIONS.find(s => s.name === n);
  assert.strictEqual(elig.canTeachSession(byName('stay ready (RN pattern)'), general), false);
  assert.strictEqual(elig.canTeachSession(byName('stay ready (RN pattern)'), rn), true);
  assert.strictEqual(elig.canTeachSession(byName('safe sitter course'), general), false);
  assert.strictEqual(elig.canTeachSession(byName('safe sitter course'), sitter), true);
  assert.strictEqual(elig.canTeachSession(byName('red cross course'), rn), false, 'RN without Lead Teacher cannot teach Red Cross');
  assert.strictEqual(elig.canTeachSession(byName('red cross course'), lead), true);
  assert.strictEqual(elig.canTeachSession(byName('babysitters training'), general), false, 'Babysitter Training is Lead Teacher-only');
  assert.strictEqual(elig.canTeachSession(byName('babysitters training'), lead), true);
  ['rc adult', 'rc bls', 'rc adult hybrid', 'rc bls hybrid'].forEach(function (n) {
    assert.strictEqual(elig.canTeachSession(byName(n), general), false, n + ' is Lead Teacher-only');
    assert.strictEqual(elig.canTeachSession(byName(n), lead), true);
  });
  assert.strictEqual(elig.canTeachSession(byName('custom spanish job'), general), false);
  assert.strictEqual(elig.canTeachSession(byName('girl scout first aid badge'), general), true, 'badge workshops stay open (no RN rule)');
  assert.strictEqual(elig.canTeachSession(byName('baby ready + CPR'), general), true, 'Baby Ready + CPR is not Lead-only');
});
