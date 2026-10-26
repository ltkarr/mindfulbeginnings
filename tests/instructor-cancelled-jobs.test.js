'use strict';

// Cancelled classes stay off the instructor portal. Open jobs already skipped
// isCancelled. My jobs used to keep the card and show a red cancellation
// banner, and the 1099 helper counted the fee. Both now use myAssignedSessions.

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

test('the portal no longer renders a cancelled-class banner on My jobs', () => {
  assert.doesNotMatch(instructor, /This class was cancelled/);
  assert.match(extractFn(instructor, 'renderMyJobs'), /myAssignedSessions\(\)/);
  assert.match(extractFn(instructor, 'myAssignedSessions'), /s\.isCancelled/);
  assert.match(extractFn(instructor, 'openJobs'), /s\.isCancelled/);
  assert.match(extractFn(instructor, 'downloadIncomeSummary'), /myAssignedSessions\(\)/);
  assert.match(extractFn(instructor, 'incomeYearOptions'), /myAssignedSessions\(\)/);
});

test('My jobs, Upcoming, Open jobs, conflicts, and history omit cancelled classes', () => {
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
  assert.doesNotMatch(html, /Cancelled Workshop/);
  assert.doesNotMatch(html, /Old Cancelled/);
  assert.doesNotMatch(html, /Open Cancelled/);
  assert.doesNotMatch(html, /Someone Else/);
  assert.doesNotMatch(html, /This class was cancelled/);
  assert.doesNotMatch(html, />Cancelled</);

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

test('a portal whose only assigned class was cancelled shows an empty My jobs list', () => {
  const api = loadPortal();
  assign(api, [
    session({ id: 'cx', course: 'Cancelled Workshop', date: '2026-11-15', isCancelled: true })
  ], {
    cx: { instructorId: 'me', payStatus: 'paid', paidFee: 250 }
  });
  api.renderMyJobs();
  assert.match(api._list.innerHTML, /No accepted jobs yet/);
  assert.doesNotMatch(api._list.innerHTML, /Cancelled Workshop/);
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
