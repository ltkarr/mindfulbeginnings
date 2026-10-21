'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
const config = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'migrations/20261020_paid_travel_hours.sql'), 'utf8');

const GSFA = 'Girl Scouts — First Aid Badge Workshop';
const INTRO = 'Intro to Babysitting';
const PHRASE_IB = '4 paid hours at your rate';
const PHRASE_GSFA = '4 paid hours at your rate';

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

function loadAdminPay() {
  const sandbox = {
    COURSES: {
      [INTRO]: { hours: 1 },
      [GSFA]: { hours: 1 },
      'Safe Sitter®': { hours: 5, instrFlatFee: 200 },
      'All Kids Welcome': { hours: 1, instrFlatFee: 75, virtual: true }
    },
    INSTR_RATE: 50,
    INSTR_EXTRA_HOURS: 0.5,
    LEAD_TEACHER_RATE: 75,
    fmt: function (n) { return '$' + n; }
  };
  vm.runInNewContext(
    [
      extractFn(admin, 'paidTravelHoursOf'),
      extractFn(admin, 'sessionTeachingHours'),
      extractFn(admin, 'payHourShort'),
      extractFn(admin, 'paidHoursBreakdown'),
      extractFn(admin, 'instrBaseFee'),
      extractFn(admin, 'formatPayHours'),
      extractFn(admin, 'hourLabel'),
      extractFn(admin, 'openJobHourlyHours'),
      extractFn(admin, 'openJobPayIsFlat'),
      extractFn(admin, 'openJobPayText')
    ].join('\n'),
    sandbox
  );
  return sandbox;
}

function loadInstructorPay(me) {
  const sandbox = {
    COURSES: {
      [INTRO]: { hours: 1 },
      [GSFA]: { hours: 1 },
      'Safe Sitter®': { hours: 5, instrFlatFee: 200 },
      'Stay Ready: Choking Rescue and CPR': { hours: 1.5 }
    },
    INSTR_RATE: 50,
    INSTR_EXTRA_HOURS: 0.5,
    LEAD_TEACHER_RATE: 75,
    me: me
  };
  vm.runInNewContext(
    [
      extractFn(instructor, 'paidTravelHoursOf'),
      extractFn(instructor, 'sessionTeachingHours'),
      extractFn(instructor, 'payHourShort'),
      extractFn(instructor, 'paidHoursBreakdown'),
      extractFn(instructor, 'instrFee')
    ].join('\n'),
    sandbox
  );
  return sandbox;
}

const standard = { isLeadTeacher: false, hourlyRate: 50 };
const lead = { isLeadTeacher: true, hourlyRate: 50 };

test('Intro to Babysitting with 3 paid travel hours is 4 hours at each rate', () => {
  const api = loadAdminPay();
  const s = { course: INTRO, code: 'IB-261105', paidTravelHours: 3 };
  assert.equal(api.sessionTeachingHours(s), 1);
  assert.equal(api.instrBaseFee(s, standard), 200);
  assert.equal(api.instrBaseFee(s, lead), 300);
  assert.equal(api.paidHoursBreakdown(s), PHRASE_IB);
  assert.equal(api.openJobPayText(s), 'Instructor pay: ' + PHRASE_IB);
  assert.equal(api.openJobPayText(s, standard), 'Instructor pay: $200. ' + PHRASE_IB);
  assert.doesNotMatch(api.openJobPayText(s), /\u2014/);
});

test('a Girl Scout workshop stays on the 2.5-hour job post until this session sets hours', () => {
  const api = loadAdminPay();
  const s = { course: GSFA, code: 'GSFA-261112' };
  assert.equal(api.sessionTeachingHours(s), 1);
  assert.equal(api.instrBaseFee(s, standard), 125);
  assert.equal(api.paidHoursBreakdown(s), '');
  assert.match(api.openJobPayText(s), /your hourly pay \u00d7 2\.5 hours/);
  assert.match(config, /'Girl Scouts — First Aid Badge Workshop':\{[^}]*hours:1/);
  assert.match(config, /'Intro to Babysitting':\{[^}]*hours:1/);
});

test('GSFA-261112 is 1.5 teaching hours plus 2.5 travel hours, which is 4 paid hours', () => {
  const api = loadAdminPay();
  const s = { course: GSFA, code: 'GSFA-261112', teachingHours: 1.5, paidTravelHours: 2.5 };
  assert.equal(api.sessionTeachingHours(s), 1.5);
  assert.equal(api.paidTravelHoursOf(s), 2.5);
  assert.equal(api.instrBaseFee(s, standard), 200);
  assert.equal(api.instrBaseFee(s, lead), 300);
  assert.equal(api.paidHoursBreakdown(s), PHRASE_GSFA);
  assert.equal(api.openJobPayText(s, lead), 'Instructor pay: $300. ' + PHRASE_GSFA);
  assert.equal(api.openJobPayText(s), 'Instructor pay: ' + PHRASE_GSFA);
  // Another Girl Scout session with the fields blank still uses the course default.
  assert.equal(api.instrBaseFee({ course: GSFA }, standard), 125);
});

test('a flat pay override wins, and blank travel hours leave other courses alone', () => {
  const api = loadAdminPay();
  const overridden = { course: GSFA, teachingHours: 1.5, paidTravelHours: 2.5, instrPayOverride: 10 };
  assert.equal(api.instrBaseFee(overridden, lead), 10);
  assert.equal(api.paidHoursBreakdown(overridden), '');
  assert.equal(api.instrBaseFee({ course: 'Safe Sitter®' }, standard), 200 + 25);
  assert.equal(api.instrBaseFee({ course: 'Safe Sitter®' }, lead), 5 * 75 + 75 + 37.5);
  assert.equal(api.instrBaseFee({ course: INTRO }, { hourlyRate: 60 }), 60 + 60 + 30);
  assert.equal(api.instrBaseFee({ course: INTRO, paidTravelHours: 0 }, standard), 50);
  assert.equal(api.paidTravelHoursOf({ paidTravelHours: -1 }), null);
});

test('the instructor portal uses the same hours and the same dollar amounts', () => {
  const at50 = loadInstructorPay({ isLeadTeacher: false, hourlyRate: 50 });
  const at75 = loadInstructorPay({ isLeadTeacher: true, hourlyRate: 50 });
  const ib = { course: INTRO, paidTravelHours: 3 };
  const gsfa = { course: GSFA, teachingHours: 1.5, paidTravelHours: 2.5 };
  assert.equal(at50.instrFee(ib), 200);
  assert.equal(at75.instrFee(ib), 300);
  assert.equal(at50.paidHoursBreakdown(ib), PHRASE_IB);
  assert.equal(at50.instrFee(gsfa), 200);
  assert.equal(at75.instrFee(gsfa), 300);
  assert.equal(at75.paidHoursBreakdown(gsfa), PHRASE_GSFA);
  assert.equal(at50.instrFee({ course: GSFA }), 125);
  assert.equal(at75.instrFee({ course: 'Stay Ready: Choking Rescue and CPR' }), 1.5 * 75 + 75 + 37.5);
  assert.match(instructor, /paidHoursBreakdown\(s\)/);
  assert.match(instructor, /Total pay/);
});

test('saving a session writes class length and paid travel hours, and a blank stays off the row', () => {
  const sandbox = {
    LEGACY_CREATED_AT: 0,
    ORG_PORTION_COL: false,
    FEE_RECEIVED_COL: false,
    ORIGINATED_COL: false,
    HOSTED_FOR_COL: false,
    EXTRA_DATES_COL: false,
    EXTRA_DAYS_COL: false,
    CLOSURES_COL: false,
    INSTR_INFO_COL: false,
    REQUIRES_RN_COL: false,
    REQUIRES_SS_COL: false,
    REQUIRES_SPANISH_COL: false,
    CANCEL_COLS: false,
    EXTERNAL_URL_COL: false,
    ADMIN_PRIVATE_NOTES_COL: false,
    TEACHING_HOURS_COL: true,
    PAID_TRAVEL_HOURS_COL: true
  };
  vm.runInNewContext(
    [
      extractFn(admin, 'extraDaysFromDB'),
      extractFn(admin, 'closuresFromDB'),
      extractFn(admin, 'sessionFromDB'),
      extractFn(admin, 'sessionToDB')
    ].join('\n'),
    sandbox
  );
  const row = sandbox.sessionToDB({
    id: 's1',
    code: 'GSFA-261112',
    course: GSFA,
    teachingHours: 1.5,
    paidTravelHours: 2.5,
    createdAt: 1
  });
  assert.equal(row.teaching_hours, 1.5);
  assert.equal(row.paid_travel_hours, 2.5);
  const untouched = sandbox.sessionToDB({ id: 's2', code: 'IB-261105', course: INTRO, createdAt: 1 });
  assert.equal(Object.prototype.hasOwnProperty.call(untouched, 'teaching_hours'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(untouched, 'paid_travel_hours'), false);
  const loaded = sandbox.sessionFromDB({
    id: 's1',
    code: 'GSFA-261112',
    course: GSFA,
    teaching_hours: '1.5',
    paid_travel_hours: '2.5'
  });
  assert.equal(loaded.teachingHours, 1.5);
  assert.equal(loaded.paidTravelHours, 2.5);
});

test('the migration adds the columns and does not write either session', () => {
  assert.match(sql, /add column if not exists teaching_hours numeric/);
  assert.match(sql, /add column if not exists paid_travel_hours numeric/);
  assert.match(sql, /sessions_teaching_hours_nonnegative/);
  assert.match(sql, /sessions_paid_travel_hours_nonnegative/);
  assert.match(sql, /teaching_hours, paid_travel_hours/);
  assert.match(sql, /instructor_list_sessions/);
  assert.doesNotMatch(sql, /\bupdate\b/i);
  assert.match(admin, /id="m-teaching-hours"/);
  assert.match(admin, /id="m-paid-travel-hours"/);
  assert.match(admin, /paidHoursFieldsHtml\(null\)/);
  assert.match(admin, /paidHoursFieldsHtml\(s\)/);
  assert.match(admin, /classTravel/);
});

test('instructors see total pay hours only, plus the pay policy on open jobs', () => {
  assert.match(instructor, /id="pay-policy"/);
  assert.match(instructor, /<div style="font-weight:700;font-size:18px;margin-bottom:6px">Pay policy<\/div>/);
  assert.match(instructor, /Pay for each job is listed as your hourly rate times a set number of hours\. That total usually includes at least 1\.5 hours beyond the class time, and we may add more depending on the job's location\. Pay hours are set at Mindful Beginnings' discretion\. Please do not ask for additional pay for any course\. If the listed pay doesn't work for you, simply don't claim the job\./);
  const policy = instructor.slice(instructor.indexOf('id="pay-policy"'), instructor.indexOf('id="open-list"'));
  assert.doesNotMatch(policy, /\u2014/);
  const emailFn = admin.slice(admin.indexOf('function openJobPayText'), admin.indexOf('function openJobMeetings'));
  assert.doesNotMatch(emailFn, /of class|hours travel|no travel hour/);
  const portalPay = instructor.slice(instructor.indexOf('function paidHoursBreakdown'), instructor.indexOf('function instrFee'));
  assert.doesNotMatch(portalPay, /of class|hours travel/);
});
