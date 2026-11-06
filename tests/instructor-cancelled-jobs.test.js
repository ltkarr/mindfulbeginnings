'use strict';

// My jobs shows an assigned class the office cancelled, with the red banner and
// no pay message or action buttons. Open jobs, home/upcoming, the calendar
// download, schedule conflicts, teaching history, and the income summary still
// leave that class out.

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const instructor = fs.readFileSync(path.join(__dirname, '..', 'instructor.html'), 'utf8');

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

function loadPortal() {
  const list = { innerHTML: '' };
  const income = { value: '2026' };
  let written = '';
  const sandbox = {
    allSessions: [],
    jobDataCache: {},
    me: { id: 'me', name: 'Ada Instructor', hourlyRate: 50, pin: '111111' },
    loadErrors: {},
    privCache: {},
    privPending: {},
    RN_RESTRICTION_KNOWN: true,
    CANCEL_STATE_KNOWN: true,
    COURSES: { 'Safe Sitter®': { hours: 5, instrFlatFee: 200 } },
    INSTR_RATE: 50,
    INSTR_EXTRA_HOURS: 0.5,
    document: {
      getElementById(id) {
        if (id === 'myjobs-list') return list;
        if (id === 'income-year') return income;
        return null;
      }
    },
    window: {
      open() {
        return {
          document: {
            write(html) { written += html; },
            close() {}
          }
        };
      }
    },
    console,
    _list: list,
    _income: income,
    _written() { return written; },
    _resetWritten() { written = ''; }
  };
  vm.createContext(sandbox);
  vm.runInContext(
    [
      'function credentialPill(){return ""}',
      'function whenLineHTML(){return ""}',
      'function heroStripHTML(){return ""}',
      'function notesHTML(){return ""}',
      'function scheduleHTML(){return ""}',
      'function locationHTML(){return ""}',
      'function goodToKnowHTML(){return ""}',
      'function safeAtHomeClassChecklistHTML(){return ""}',
      'function portalMaps(){return ""}',
      'function portalPlace(s){return (s&&s.location)||""}',
      'function fmtSessDates(s){return s.date}',
      'function fmtDate(d){return d}',
      'function sessTimeSummary(){return "1:00 PM"}',
      'function filledSeats(){return 0}',
      'function isAdultCourse(){return false}',
      'function flagWarningCard(){return ""}',
      'function loadErrorCard(){return "ERR"}',
      'function ensurePrivate(){}',
      'function canTeachSession(){return true}',
      extractFn(instructor, 'escapeHtml'),
      extractFn(instructor, 'fmt'),
      extractFn(instructor, 'paidTravelHoursOf'),
      extractFn(instructor, 'sessionTeachingHours'),
      extractFn(instructor, 'payHourShort'),
      extractFn(instructor, 'paidHoursBreakdown'),
      extractFn(instructor, 'instrFee'),
      extractFn(instructor, 'instrFeeForJob'),
      extractFn(instructor, 'recurringMeetings'),
      extractFn(instructor, 'sessMeetings'),
      extractFn(instructor, 'sessClosures'),
      extractFn(instructor, 'lastSessDate'),
      extractFn(instructor, 'parseTimeRange'),
      extractFn(instructor, 'myJobsSessions'),
      extractFn(instructor, 'myAssignedSessions'),
      extractFn(instructor, 'myMeetingIndex'),
      extractFn(instructor, 'myHistory'),
      extractFn(instructor, 'sessConflicts'),
      extractFn(instructor, 'hideTakenJobFromOpenBoard'),
      extractFn(instructor, 'openJobs'),
      extractFn(instructor, 'myUpcomingJobs'),
      extractFn(instructor, 'incomeYearOptions'),
      extractFn(instructor, 'renderMyJobs'),
      extractFn(instructor, 'downloadIncomeSummary')
    ].join('\n'),
    sandbox
  );
  return sandbox;
}

function session(over) {
  return Object.assign({
    id: 's',
    course: 'Safe Sitter®',
    date: '2026-11-20',
    time: '1:00-4:00 PM',
    location: 'Library',
    isCancelled: false,
    isHold: false,
    ownerTaught: false,
    isCustomJob: false,
    isVirtual: false,
    extraDates: [],
    extraDays: []
  }, over);
}

function assign(api, sessions, jobs) {
  api.allSessions = sessions;
  api.jobDataCache = jobs;
  api._list.innerHTML = '';
  api._resetWritten();
}

function jobCard(html, course) {
  const cards = html.split('<div class="job-card">').slice(1);
  const card = cards.find(c => c.includes(course));
  assert.ok(card, 'missing job card for ' + course);
  return card;
}

test('My jobs keeps the cancellation banner and strips pay and actions', () => {
  assert.match(instructor, /This class was cancelled/);
  assert.match(instructor, /You do not need to attend/);
  const jobs = extractFn(instructor, 'renderMyJobs');
  assert.match(jobs, /myJobsSessions\(\)/);
  assert.match(jobs, /if\(cx\)\{payHtml='';\}/);
  assert.match(jobs, /s\.isCustomJob\|\|cx/);
  assert.match(jobs, /upcoming&&!cx/);
  assert.match(extractFn(instructor, 'myJobsSessions'), /jdi\.instructorId===me\.id/);
  assert.doesNotMatch(extractFn(instructor, 'myJobsSessions'), /isCancelled/);
  assert.match(extractFn(instructor, 'myAssignedSessions'), /!s\.isCancelled/);
  assert.match(extractFn(instructor, 'openJobs'), /s\.isCancelled/);
  assert.match(extractFn(instructor, 'myUpcomingJobs'), /myAssignedSessions\(\)/);
  assert.match(extractFn(instructor, 'downloadIncomeSummary'), /myAssignedSessions\(\)/);
  assert.match(extractFn(instructor, 'incomeYearOptions'), /myAssignedSessions\(\)/);
  assert.match(extractFn(instructor, 'printJobsCalendar'), /myUpcomingJobs\(\)/);
  assert.match(extractFn(instructor, 'downloadJobsICS'), /myUpcomingJobs\(\)/);
});

test('My jobs lists cancelled classes; Upcoming, Open jobs, conflicts, and history do not', () => {
  const api = loadPortal();
  assign(api, [
    session({ id: 'live', course: 'Safe Sitter®', date: '2026-11-20' }),
    session({ id: 'past', course: 'Intro to Babysitting', date: '2026-06-01', location: 'School' }),
    session({ id: 'cx-soon', course: 'Cancelled Workshop', date: '2026-11-15', isCancelled: true, cancelReason: 'low enrollment', location: 'School' }),
    session({ id: 'cx-old', course: 'Old Cancelled', date: '2025-04-01', isCancelled: true }),
    session({ id: 'open-live', course: 'Open Class', date: '2026-12-01' }),
    session({ id: 'open-cx', course: 'Open Cancelled', date: '2026-12-02', isCancelled: true }),
    session({ id: 'theirs', course: 'Someone Else', date: '2026-11-22' })
  ], {
    live: { instructorId: 'me', payStatus: null },
    past: { instructorId: 'me', payStatus: 'paid', paidFee: 200, payDate: '2026-06-08' },
    'cx-soon': { instructorId: 'me', payStatus: 'paid', paidFee: 250, referralBonus: 50, payDate: '2026-11-01' },
    'cx-old': { instructorId: 'me', payStatus: 'paid', paidFee: 80 },
    theirs: { instructorId: 'other' }
  });

  const held = api.myAssignedSessions().map(s => s.id).sort();
  assert.deepEqual(held, ['live', 'past']);

  api.renderMyJobs();
  const html = api._list.innerHTML;
  assert.match(html, /Safe Sitter®/);
  assert.match(html, /Intro to Babysitting/);
  assert.match(html, /Cancelled Workshop/);
  assert.match(html, /Old Cancelled/);
  assert.doesNotMatch(html, /Open Cancelled/);
  assert.doesNotMatch(html, /Someone Else/);

  const soon = jobCard(html, 'Cancelled Workshop');
  assert.match(soon, /This class was cancelled due to low enrollment/);
  assert.match(soon, /You do not need to attend/);
  assert.match(soon, />Cancelled</);
  assert.doesNotMatch(soon, /Payment sent/);
  assert.doesNotMatch(soon, /will be sent/);
  assert.doesNotMatch(soon, /Waiting for host evaluation/);
  assert.doesNotMatch(soon, /printRoster\('cx-soon'\)/);
  assert.doesNotMatch(soon, /Cancel my acceptance/);

  const old = jobCard(html, 'Old Cancelled');
  assert.match(old, /This class was cancelled\./);
  assert.match(old, />Cancelled</);
  assert.doesNotMatch(old, /Payment sent/);
  assert.doesNotMatch(old, /printRoster\('cx-old'\)/);
  assert.doesNotMatch(old, /Cancel my acceptance/);

  const live = jobCard(html, 'Safe Sitter®');
  assert.doesNotMatch(live, /This class was cancelled/);
  assert.match(live, /Cancel my acceptance/);

  assert.deepEqual(api.myUpcomingJobs().map(s => s.id), ['live']);
  assert.deepEqual(api.openJobs().map(s => s.id), ['open-live']);

  const idx = api.myMeetingIndex();
  assert.ok(idx['2026-11-20'], 'the live class is still a conflict candidate');
  assert.equal(idx['2026-11-15'], undefined, 'a cancelled class is not a double-booking');
  const clashes = api.sessConflicts(session({ id: 'candidate', course: 'New Class', date: '2026-11-15', time: '1:00-4:00 PM' }));
  assert.equal(clashes.length, 0);

  const history = api.myHistory(session({ id: 'fresh', course: 'Cancelled Workshop', date: '2026-12-10', location: 'School' }));
  assert.equal(history.course, 0);
  assert.equal(history.venue, 1, 'the taught class at School still counts');
});

test('a portal whose only assigned class was cancelled still shows that class on My jobs', () => {
  const api = loadPortal();
  assign(api, [
    session({ id: 'cx', course: 'Cancelled Workshop', date: '2026-11-15', isCancelled: true, cancelReason: 'weather' })
  ], {
    cx: { instructorId: 'me', payStatus: 'paid', paidFee: 250, payDate: '2026-11-01' }
  });
  api.renderMyJobs();
  const html = api._list.innerHTML;
  assert.doesNotMatch(html, /No accepted jobs yet/);
  const card = jobCard(html, 'Cancelled Workshop');
  assert.match(card, /This class was cancelled due to weather/);
  assert.match(card, /You do not need to attend/);
  assert.doesNotMatch(card, /Payment sent/);
  assert.doesNotMatch(card, /will be sent/);
  assert.doesNotMatch(card, /Cancel my acceptance/);
  assert.deepEqual(api.myUpcomingJobs(), []);
});

test('the income summary drops cancelled classes from the year list, rows, and paid totals', () => {
  const api = loadPortal();
  assign(api, [
    session({ id: 'live', course: 'Safe Sitter®', date: '2026-11-20' }),
    session({ id: 'past', course: 'Intro to Babysitting', date: '2026-06-01', location: 'School' }),
    session({ id: 'cx-soon', course: 'Cancelled Workshop', date: '2026-11-15', isCancelled: true }),
    session({ id: 'cx-old', course: 'Old Cancelled', date: '2025-04-01', isCancelled: true })
  ], {
    live: { instructorId: 'me', payStatus: null, referralBonus: 0 },
    past: { instructorId: 'me', payStatus: 'paid', paidFee: 200, referralBonus: 0, payDate: '2026-06-08' },
    'cx-soon': { instructorId: 'me', payStatus: 'paid', paidFee: 250, referralBonus: 50, payDate: '2026-11-01' },
    'cx-old': { instructorId: 'me', payStatus: 'paid', paidFee: 80, referralBonus: 0 }
  });

  const years = api.incomeYearOptions();
  assert.match(years, /value="2026"/);
  assert.doesNotMatch(years, /2025/);

  api.downloadIncomeSummary();
  const sheet = api._written();
  assert.match(sheet, /Safe Sitter®/);
  assert.match(sheet, /Intro to Babysitting/);
  assert.doesNotMatch(sheet, /Cancelled Workshop/);
  assert.doesNotMatch(sheet, /Old Cancelled/);
  assert.match(sheet, /Total sessions<\/div><div class="kpi-val">2<\/div>/);
  assert.match(sheet, /Total paid income<\/div><div class="kpi-val" style="color:#2d7a5e">\$200<\/div>/);
  assert.doesNotMatch(sheet, /\$300/);
  assert.doesNotMatch(sheet, /\$250/);
  assert.doesNotMatch(sheet, /\$80/);
});
