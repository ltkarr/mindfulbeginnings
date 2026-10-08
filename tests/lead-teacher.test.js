'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const configSrc = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'migrations/20261008_lead_teacher.sql'), 'utf8');

const BABYSITTER = "Red Cross Babysitter's Training + Pediatric First Aid/CPR/AED";
const ADULT = 'Adult & Pediatric First Aid/CPR/AED Certification';
const CUTOVER = Date.parse('2026-10-09T04:00:00Z');
const BEFORE = CUTOVER - 1;
const EXISTING = 1791470081950; // newest sessions.created_at on Oct 8 2026

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

function loadConfig() {
  const ctx = vm.createContext({});
  vm.runInContext(configSrc + '\nthis.getSessionBasePrice=getSessionBasePrice;this.COURSES=COURSES;this.LATER_PRICE_CHANGES=LATER_PRICE_CHANGES;', ctx);
  return ctx;
}

test('Red Cross courses are new-session prices on the Oct 9 list, and existing course prices stay put', () => {
  const cfg = loadConfig();
  const oct9 = cfg.LATER_PRICE_CHANGES.find(c => c.from === '2026-10-09T04:00:00Z');
  assert.equal(oct9.prices[BABYSITTER], 295);
  assert.equal(oct9.prices[ADULT], 125);
  assert.equal(oct9.prices['Social Ready'], 45);
  assert.equal(oct9.prices['Stay Ready: Choking Rescue and CPR'], 85);
  assert.equal(oct9.prices['Grandparents: Getting Started'], 195);
  assert.equal(oct9.prices['Care Ready'], 195);
  assert.equal(oct9.prices['Baby Ready'], 195);

  for (const createdAt of [BEFORE, EXISTING, CUTOVER]) {
    assert.equal(cfg.getSessionBasePrice(BABYSITTER, '2026-11-01', createdAt), 295);
    assert.equal(cfg.getSessionBasePrice(ADULT, '2026-11-01', createdAt), 125);
    assert.equal(cfg.getSessionBasePrice(ADULT, '2027-03-01', createdAt), 125);
  }
  // A session already in the database keeps the price it has today.
  assert.equal(cfg.getSessionBasePrice('Social Ready', '2026-11-01', EXISTING), 35);
  assert.equal(cfg.getSessionBasePrice('Social Ready', '2026-11-01', CUTOVER), 45);
  assert.equal(cfg.getSessionBasePrice('Baby Ready', '2026-11-01', EXISTING), 225);
  assert.equal(cfg.getSessionBasePrice('Baby Ready', '2026-11-01', CUTOVER), 195);
  assert.equal(cfg.getSessionBasePrice('Safe Sitter®', '2026-12-01', EXISTING), 225);
  assert.equal(cfg.getSessionBasePrice('Safe Sitter®', '2026-12-01', CUTOVER), 225);

  const baby = cfg.COURSES[BABYSITTER];
  const adult = cfg.COURSES[ADULT];
  assert.equal(baby.hours, 7);
  assert.equal(adult.hours, 5.5);
  assert.equal(baby.redCross, true);
  assert.equal(adult.redCross, true);
  assert.equal(baby.requiresLeadTeacher, true);
  assert.equal(adult.requiresLeadTeacher, true);
  assert.equal(baby.price, 295);
  assert.equal(adult.price, 125);
  assert.equal(adult.priceNew, 125);
  assert.equal(cfg.COURSES['Stay Ready: Choking Rescue and CPR'].hours, 1.5);
  assert.equal(cfg.COURSES['Steady and Ready'].hours, 1.5);
  assert.equal(cfg.COURSES['Baby Ready'].hours, 2.5);
  assert.equal(cfg.COURSES['Baby Ready'].seatsPerRegistration, 2);
  assert.equal(cfg.COURSES['Safe Sitter Essentials'], undefined);
  assert.equal(cfg.COURSES['Safe Sitter® Babysitting Essentials'], undefined);
  assert.doesNotMatch(configSrc, /Babysitting Essentials/);
  assert.doesNotMatch(admin, /Babysitting Essentials/);
});

test('admin and the register fallback carry the same Oct 9 Red Cross prices', () => {
  const block = /\{from:'2026-10-09T04:00:00Z'[\s\S]*?\}\},/;
  const norm = (s) => s.match(block)[0].replace(/\s+/g, '');
  const want = norm(configSrc);
  assert.equal(norm(admin), want);
  assert.equal(norm(register), want);
  assert.match(want, /295/);
  assert.match(want, /125/);
  assert.match(admin, /redCross:true,requiresLeadTeacher:true/);
});

test('a Lead Teacher is paid $75/hour, and a frozen paid fee stays frozen', () => {
  const sandbox = {
    COURSES: {
      'Safe Sitter®': { hours: 5, instrFlatFee: 200, requiresSafeSitter: true },
      [BABYSITTER]: { hours: 7, redCross: true, requiresLeadTeacher: true },
      [ADULT]: { hours: 5.5, redCross: true, requiresLeadTeacher: true },
      'Intro to Babysitting': { hours: 1 }
    },
    INSTR_RATE: 50,
    INSTR_EXTRA_HOURS: 0.5,
    LEAD_TEACHER_RATE: 75,
    instructors: [
      { id: 'lead', name: 'Ada', isLeadTeacher: true, hourlyRate: 40 },
      { id: 'rn', name: 'Bea', isLeadTeacher: false, isRN: true, hourlyRate: 60 }
    ]
  };
  vm.runInNewContext(
    [
      extractFn(admin, 'instrBaseFee'),
      extractFn(admin, 'usualInstrPayAmount'),
      extractFn(admin, 'instrDisplayFee'),
      extractFn(admin, 'courseRequiresLeadTeacher'),
      extractFn(admin, 'sessionRequiresLeadTeacher'),
      extractFn(admin, 'leadTeacherAssignmentBlock'),
      extractFn(admin, 'sessionRequiresRN'),
      extractFn(admin, 'sessionRequiresSafeSitter'),
      extractFn(admin, 'sessionWhoCanTeach'),
      extractFn(admin, 'instrEligible')
    ].join('\n'),
    sandbox
  );
  const lead = sandbox.instructors[0];
  const other = sandbox.instructors[1];
  // 7 hours + 1 travel hour + 30 minutes, all at $75.
  assert.equal(sandbox.instrBaseFee({ course: BABYSITTER, isVirtual: false }, lead), 637.5);
  assert.equal(sandbox.instrBaseFee({ course: ADULT, isVirtual: false }, null), 525);
  assert.equal(sandbox.instrBaseFee({ course: BABYSITTER, isVirtual: true }, null), 562.5);
  // Profile rate and the course flat fee do not apply to a Lead Teacher.
  assert.equal(sandbox.instrBaseFee({ course: 'Safe Sitter®' }, lead), 5 * 75 + 75 + 37.5);
  assert.equal(sandbox.instrBaseFee({ course: 'Safe Sitter®' }, other), 200 + 30);
  assert.equal(sandbox.instrBaseFee({ course: 'Intro to Babysitting' }, other), 60 + 60 + 30);
  assert.equal(sandbox.instrBaseFee({ course: BABYSITTER, instrPayOverride: 10 }, lead), 10);
  assert.equal(sandbox.instrDisplayFee({ course: BABYSITTER }, lead, { payStatus: 'paid', paidFee: 80 }), 80);
  assert.equal(sandbox.sessionWhoCanTeach({ course: BABYSITTER }), 'Lead Teachers only');
  assert.equal(sandbox.sessionWhoCanTeach({ course: 'Safe Sitter®' }), 'Safe Sitter® instructors only');
  assert.equal(sandbox.instrEligible(other, BABYSITTER), false);
  assert.equal(sandbox.instrEligible(lead, BABYSITTER), true);
  assert.match(sandbox.leadTeacherAssignmentBlock(ADULT, 'rn'), /not a Lead Teacher/);
  assert.equal(sandbox.leadTeacherAssignmentBlock(ADULT, 'lead'), '');
  assert.equal(sandbox.leadTeacherAssignmentBlock(ADULT, null), '');
  const who = extractFn(admin, 'sessionWhoCanTeach');
  assert.doesNotMatch(who, /Red Cross Babysitter|Adult & Pediatric/);
});

test('the instructor portal hides Red Cross jobs from anyone who is not a Lead Teacher', () => {
  const patchStart = instructor.indexOf('Object.keys(COURSES).forEach(c=>{');
  const patchEnd = instructor.indexOf('});', patchStart) + 3;
  const sandbox = {
    COURSES: {
      [BABYSITTER]: { hours: 7 },
      [ADULT]: { hours: 5.5 },
      'Community First Aid': { hours: 1 },
      'Girl Scout Badge Class': { hours: 1, requiresRN: true },
      'Stay Ready: Choking Rescue and CPR': { hours: 1.5 }
    },
    me: { isRN: true, isLeadTeacher: false, safeSitterCertified: true, safeSitterTrainingDate: '2024-01-01' },
    RN_RESTRICTION_KNOWN: true,
    INSTR_RATE: 50,
    INSTR_EXTRA_HOURS: 0.5
  };
  vm.runInNewContext(
    [
      instructor.slice(patchStart, patchEnd),
      extractFn(instructor, 'isSafeSitterCertified'),
      extractFn(instructor, 'canTeach'),
      extractFn(instructor, 'sessionRequiresRN'),
      extractFn(instructor, 'sessionRequiresSafeSitter'),
      extractFn(instructor, 'canTeachSession'),
      extractFn(instructor, 'instrFee')
    ].join('\n'),
    sandbox
  );
  assert.equal(sandbox.COURSES[BABYSITTER].requiresRN, false);
  assert.equal(sandbox.COURSES[BABYSITTER].requiresLeadTeacher, true);
  assert.equal(sandbox.COURSES[BABYSITTER].redCross, true);
  assert.equal(sandbox.COURSES['Community First Aid'].requiresRN, true);
  assert.equal(sandbox.COURSES['Community First Aid'].requiresLeadTeacher, undefined);
  assert.equal(sandbox.canTeach(BABYSITTER), false);
  assert.equal(sandbox.canTeachSession({ course: ADULT, isCustomJob: false }), false);
  sandbox.me.isLeadTeacher = true;
  assert.equal(sandbox.canTeach(BABYSITTER), true);
  assert.equal(sandbox.canTeachSession({ course: ADULT, requiresRN: true, isCustomJob: false }), true);
  assert.equal(sandbox.instrFee({ course: 'Stay Ready: Choking Rescue and CPR' }), 1.5 * 75 + 75 + 37.5);
  sandbox.me.isLeadTeacher = false;
  sandbox.me.hourlyRate = 50;
  assert.equal(sandbox.instrFee({ course: 'Stay Ready: Choking Rescue and CPR' }), 1.5 * 50 + 50 + 25);
});

test('the database blocks a non-Lead Teacher from a Red Cross session, claim, or waitlist', () => {
  assert.match(sql, /is_lead_teacher boolean not null default false/);
  assert.match(sql, /red_cross_instructor_id/);
  assert.match(sql, /red_cross_cert_expires/);
  assert.match(sql, /Babysitter''s Training \+ Pediatric First Aid\/CPR\/AED/);
  assert.match(sql, /Adult & Pediatric First Aid\/CPR\/AED Certification/);
  assert.match(sql, /guard_red_cross_session_assignment/);
  assert.match(sql, /guard_red_cross_job_assignment/);
  assert.match(sql, /if public\.course_requires_lead_teacher\(v_course\) and not v_lead then/);
  assert.match(sql, /instructor_level can only be changed by an admin/);
  assert.match(sql, /Lead Teacher status can only be changed by an admin/);
  assert.match(sql, /v_girl_scout/);
  assert.match(sql, /Stay Ready: Choking Rescue and CPR/);
  assert.doesNotMatch(sql, /price_paid/);
  assert.doesNotMatch(sql, /price_override/);
  assert.match(instructor, /instructor_lead_teacher/);
  assert.match(admin, /id="m-ilead"/);
  assert.match(admin, /LEAD_TEACHER_RATE=75/);
});
