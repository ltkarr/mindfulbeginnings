'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
const clubs = fs.readFileSync(path.join(root, 'after-school-clubs.html'), 'utf8');

const SITTER = 'Safe Sitter®';
const RED_CROSS = "Red Cross Babysitter's Training + Pediatric First Aid/CPR/AED";
const BLS = 'Basic Life Support (BLS) Online + Classroom';
const NEW_JOB = '2026-10-22T12:00:00Z';
const OLD_JOB = '2026-10-21T12:00:00Z';

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

function courses() {
  return {
    [SITTER]: { hours: 5, instrFlatFee: 200 },
    [RED_CROSS]: { hours: 7 },
    'Intro to Babysitting': { hours: 1 },
    [BLS]: { hours: null }
  };
}

function loadAdmin() {
  const sandbox = {
    COURSES: courses(),
    INSTR_RATE: 50,
    INSTR_EXTRA_HOURS: 0.5,
    LEAD_TEACHER_RATE: 75,
    PER_PERSON_BOOKING_FROM: '2026-10-22T00:00:00Z',
    fmt: function (n) { return '$' + n; }
  };
  vm.runInNewContext(
    [
      extractFn(admin, 'perPersonBooking'),
      extractFn(admin, 'usesGuidePay'),
      extractFn(admin, 'paidTravelHoursOf'),
      extractFn(admin, 'sessionTeachingHours'),
      extractFn(admin, 'guidePayHours'),
      extractFn(admin, 'instrBaseFee'),
      extractFn(admin, 'formatPayHours'),
      extractFn(admin, 'hourLabel'),
      extractFn(admin, 'openJobHourlyHours'),
      extractFn(admin, 'openJobPayIsFlat'),
      extractFn(admin, 'openJobPayText'),
      extractFn(admin, 'stayReadyBlocksVirtual')
    ].join('\n'),
    sandbox
  );
  return sandbox;
}

function loadInstructor() {
  const sandbox = {
    COURSES: courses(),
    INSTR_RATE: 50,
    INSTR_EXTRA_HOURS: 0.5,
    LEAD_TEACHER_RATE: 75,
    GUIDE_PAY_FROM: '2026-10-22T00:00:00Z',
    me: { isLeadTeacher: false, hourlyRate: 50 },
    fmt: function (n) { return '$' + n; }
  };
  vm.runInNewContext(
    [
      extractFn(instructor, 'usesGuidePay'),
      extractFn(instructor, 'paidTravelHoursOf'),
      extractFn(instructor, 'sessionTeachingHours'),
      extractFn(instructor, 'guidePayHours'),
      extractFn(instructor, 'formatPayHours'),
      extractFn(instructor, 'jobPaidHours'),
      extractFn(instructor, 'jobPaySentence'),
      extractFn(instructor, 'instrFee')
    ].join('\n'),
    sandbox
  );
  return sandbox;
}

const standard = { isLeadTeacher: false, hourlyRate: 50 };
const lead = { isLeadTeacher: true, hourlyRate: 50 };

test('a split class pays each session length plus 1.5 hours', () => {
  const api = loadAdmin();
  const portal = loadInstructor();
  const timed = {
    course: SITTER,
    createdAt: NEW_JOB,
    date: '2026-11-02',
    time: '9:00 AM - 11:30 AM',
    extraDays: [{ date: '2026-11-03', time: '1:00 PM - 3:30 PM' }]
  };
  assert.equal(api.guidePayHours(timed), 8);
  assert.equal(api.instrBaseFee(timed, standard), 400);
  assert.equal(api.instrBaseFee(timed, lead), 600);
  assert.equal(portal.jobPaidHours(timed), 8);
  assert.equal(portal.instrFee(timed), 400);
  assert.equal(portal.jobPaySentence(timed), 'Pay: your hourly pay × 8 hours');
  assert.equal(api.openJobPayText(timed), 'Pay: your hourly pay × 8 hours');
  assert.doesNotMatch(api.openJobPayText(timed), /travel|\u2014/);

  const untamed = {
    course: SITTER,
    createdAt: NEW_JOB,
    date: '2026-11-02',
    time: '9:00 AM - 2:00 PM',
    extraDays: [{ date: '2026-11-03', time: '' }]
  };
  assert.equal(api.guidePayHours(untamed), 8);
  assert.equal(portal.guidePayHours(untamed), 8);

  const seven = {
    course: RED_CROSS,
    createdAt: NEW_JOB,
    date: '2026-11-02',
    extraDates: ['2026-11-03']
  };
  assert.equal(api.guidePayHours(seven), 10);
  assert.equal(portal.jobPaySentence(seven), 'Pay: your hourly pay × 10 hours');
});

test('one meeting stays length plus 1.5, and a paid-hours override is once for the job', () => {
  const api = loadAdmin();
  const single = { course: SITTER, createdAt: NEW_JOB, date: '2026-11-02', time: '9:00 AM - 2:00 PM' };
  assert.equal(api.guidePayHours(single), 6.5);
  const override = {
    course: SITTER,
    createdAt: NEW_JOB,
    teachingHours: 5,
    paidTravelHours: 3,
    date: '2026-11-02',
    time: '9:00 AM - 11:30 AM',
    extraDays: [{ date: '2026-11-03', time: '1:00 PM - 3:30 PM' }]
  };
  assert.equal(api.guidePayHours(override), 8);
  assert.equal(api.instrBaseFee(override, standard), 400);
});

test('older jobs and weekly patterns are not split into extra 1.5 hours', () => {
  const api = loadAdmin();
  const portal = loadInstructor();
  const oldSplit = {
    course: SITTER,
    createdAt: OLD_JOB,
    date: '2026-11-02',
    time: '9:00 AM - 11:30 AM',
    extraDays: [{ date: '2026-11-03', time: '1:00 PM - 3:30 PM' }]
  };
  assert.equal(api.instrBaseFee(oldSplit, standard), 225);
  assert.equal(portal.instrFee(oldSplit), 225);
  assert.match(portal.jobPaySentence(oldSplit), /\$200 plus 30 minutes/);
  const weekly = {
    course: 'Intro to Babysitting',
    createdAt: NEW_JOB,
    date: '2026-11-02',
    time: '4:00 PM - 5:00 PM',
    isRecurring: true,
    recurPattern: 'weekly',
    recurEndDate: '2026-12-28'
  };
  assert.equal(api.guidePayHours(weekly), 2.5);
  assert.equal(portal.jobPaidHours(weekly), 2.5);
});

test('a class with no length still asks for one unless every meeting has a clock time', () => {
  const api = loadAdmin();
  const blank = { course: BLS, createdAt: NEW_JOB, date: '2026-11-02' };
  assert.equal(api.guidePayHours(blank), null);
  assert.equal(api.instrBaseFee(blank, standard), 75);
  assert.match(api.openJobPayText(blank), /set the class length/);
  const timed = {
    course: BLS,
    createdAt: NEW_JOB,
    date: '2026-11-02',
    time: '9:00 AM - 11:00 AM',
    extraDays: [{ date: '2026-11-03', time: '1:00 PM - 3:00 PM' }]
  };
  assert.equal(api.guidePayHours(timed), 7);
  assert.equal(api.openJobPayText(timed), 'Pay: your hourly pay × 7 hours');
});

test('new Stay Ready sessions cannot be marked virtual, and the Dec 13 class is left alone', () => {
  const api = loadAdmin();
  assert.equal(api.stayReadyBlocksVirtual('Stay Ready: Choking Rescue and CPR', false), true);
  assert.equal(api.stayReadyBlocksVirtual('Stay Ready: Choking Rescue and CPR', true), false);
  assert.equal(api.stayReadyBlocksVirtual('Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes', false), false);
  assert.match(admin, /if\(stayReadyBlocksVirtual\(course, !!editId\)\)isVirtual=false/);
  assert.match(instructor, /https:\/\/us06web\.zoom\.us\/j\/87686030361/);
  assert.match(instructor, /https:\/\/us06web\.zoom\.us\/j\/85697075035/);
  assert.match(instructor, /Pay for a split class is your hourly pay times each session\\'s length plus 1\.5 hours/);
  assert.match(instructor, /Season Ready\\u2122\. 60 minutes\. In person or virtual\./);
  assert.match(instructor, /Ready\. Period\.\\u2122\. Girls ages 10 to 12\. 90 minutes\. In person or virtual\./);
  assert.match(instructor, /Stay Ready\\u2122: Choking Rescue, CPR, and Seizure Response[\s\S]{0,180}In person\./);
  assert.match(clubs, /A minimum of 6 is needed to run/);
  assert.match(fs.readFileSync(path.join(root, 'host.html'), 'utf8'), /minimum 6/);
  assert.match(fs.readFileSync(path.join(root, 'organization.html'), 'utf8'), /minimum 6/);
});
