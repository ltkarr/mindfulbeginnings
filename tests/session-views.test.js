'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const views = require(path.join(root, 'js', 'session-views.js'));
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations', '20261026_instructor_session_roster.sql'), 'utf8');

const reston = {
  id: 'add8b08a-440c-405f-a06a-7cc7a53c8595',
  code: 'SS-261030',
  course: 'Safe Sitter®',
  date: '2026-10-30',
  time: '1:00-4:00 PM',
  isPrivate: true,
  isCancelled: false,
  isHold: false,
  isCustomJob: false,
  orgHandlesRegistration: false,
  billedHeadcount: 9,
  priceOverride: 0,
  billToOrg: 'GS Cadette Troop 51093 (Meredith Sarver)',
  extraDates: ['2026-11-13'],
  extraDays: [{ date: '2026-11-13', time: '3:00-5:00 PM' }]
};

test('two meeting days are not a multi-week series, even across more than a week', () => {
  assert.equal(views.isLongSeries({ date: '2026-11-01' }), false);
  assert.equal(views.isLongSeries({ date: '2026-11-01', extraDates: ['2026-11-03'] }), false);
  assert.equal(views.isLongSeries({ date: '2026-11-01', extraDates: ['2026-11-08'] }), false);
  assert.equal(views.isLongSeries({ date: '2026-10-01', extraDates: ['2026-10-09'] }), false);
  assert.equal(views.isLongSeries(reston), false);
  assert.equal(views.isLongSeries({}), false);
});

test('three meetings or a long recurring job stay on the series tab', () => {
  assert.equal(views.isLongSeries({ date: '2026-10-01', extraDates: ['2026-10-08', '2026-10-15'] }), true);
  assert.equal(
    views.isLongSeries({ date: '2026-10-01', isRecurring: true, recurEndDate: '2026-12-01' }),
    true
  );
  assert.equal(views.isLongSeries({ date: '2026-10-01', extraDates: ['2026-10-03', '2026-10-05'] }), false);
});

test('SS-261030 is on Upcoming and on the packing list, with both days', () => {
  assert.equal(views.includedInUpcoming(reston, '2026-10-26'), true);
  assert.equal(views.includedInPacking(reston, '2026-10-26', 60), true);
  const summary = views.meetingSummary(reston);
  assert.match(summary, /Oct 30, 2026, 1:00-4:00 PM/);
  assert.match(summary, /Nov 13, 2026, 3:00-5:00 PM/);
  assert.equal(summary.indexOf('\u2014'), -1);
  assert.equal(summary.indexOf('\u2013'), -1);
});

test('a private $0 org class uses the host count instead of 0 registered', () => {
  const fact = views.rosterFact(reston, 0);
  assert.equal(fact.mode, 'host');
  assert.equal(fact.people, 9);
  assert.equal(fact.phrase, 'Headcount from host: 9');
  const pending = views.rosterFact(Object.assign({}, reston, { billedHeadcount: null }), 0);
  assert.equal(pending.phrase, 'Headcount pending from host');
  assert.equal(pending.people, 0);
});

test('organization registration uses the host count, and a split invoice does not', () => {
  const beth = {
    orgHandlesRegistration: true,
    billToOrg: 'Congregation Beth El',
    billedHeadcount: 6,
    priceOverride: 94,
    isPrivate: true
  };
  assert.equal(views.rosterFact(beth, 0).phrase, 'Headcount from host: 6');
  const split = {
    isPrivate: true,
    orgHandlesRegistration: false,
    billToOrg: 'Girl Scout Troop 34182',
    billedHeadcount: 15,
    priceOverride: 15
  };
  assert.equal(views.rosterFact(split, 3).phrase, '3 participants registered');
  assert.equal(views.rosterFact(split, 0).phrase, '0 participants registered');
});

test('names plus a different host count stay visible together', () => {
  const troop = Object.assign({}, reston, { code: 'SAH-1122', billedHeadcount: 16 });
  const fact = views.rosterFact(troop, 9);
  assert.equal(fact.mode, 'both');
  assert.equal(fact.people, 16);
  assert.equal(fact.phrase, '9 registered, headcount from host: 16');
});

test('the view check flags the org flag and a packing/upcoming split, and leaves a matched class alone', () => {
  const flags = views.disagreements({
    today: '2026-10-26',
    sessions: [reston, { id: 'ok', code: 'SS-1', date: '2026-11-01', course: 'Safe Sitter®' }],
    registrations: [],
    jobData: { [reston.id]: { instructorId: 'katy' } },
    checkouts: [],
    classRequests: []
  });
  assert.ok(flags.some((row) => row.code === 'SS-261030' && row.kind === 'org-flag-off'));
  assert.ok(!flags.some((row) => row.code === 'SS-1'));
  const split = views.disagreements({
    today: '2026-10-26',
    sessions: [{
      id: 'hidden',
      code: 'SS-X',
      date: '2026-11-02',
      isCancelled: false,
      isHold: false,
      isVirtual: false
    }],
    registrations: [],
    jobData: {},
    checkouts: [{ sessionId: 'missing-kit' }],
    classRequests: [{ status: 'pending', session_id: 'req-sess', session_code: 'SS-REQ' }]
  });
  assert.equal(views.includedInUpcoming(split && { date: '2026-11-02' }, '2026-10-26'), true);
  const hidden = {
    id: 'gone',
    code: 'SS-GONE',
    date: '2026-11-02',
    isCancelled: true,
    isHold: false,
    isVirtual: false
  };
  assert.equal(views.includedInPacking(hidden, '2026-10-26', 60), false);
  const report = views.disagreements({
    today: '2026-10-26',
    sessions: [],
    registrations: [{ sessionId: 'missing-reg' }],
    jobData: { 'missing-job': { instructorId: 'x' } },
    checkouts: [{ sessionId: 'missing-kit' }],
    classRequests: [{ status: 'pending', session_id: 'req-sess', session_code: 'SS-REQ' }]
  });
  assert.deepEqual(report.map((row) => row.kind).sort(), [
    'orphan-equipment',
    'orphan-job',
    'orphan-registration',
    'unapproved-request'
  ]);
});

test('an empty object in extra_dates is flagged and does not invent a meeting day', () => {
  const s = { id: 'obj', code: 'RP-261110', date: '2026-11-10', extraDates: {}, extraDays: [] };
  assert.deepEqual(views.meetingDays(s).map((d) => d.date), ['2026-11-10']);
  const flags = views.disagreements({ today: '2026-10-26', sessions: [s], registrations: [], jobData: {}, checkouts: [], classRequests: [] });
  assert.equal(flags[0].kind, 'extra-days-shape');
});

test('admin keeps private sessions on the list and asks the shared rules for the series cut', () => {
  assert.match(admin, /src="\/js\/session-views\.js"/);
  assert.match(admin, /function isLongSeries\(s\)/);
  assert.match(admin, /MBSessionViews\.isLongSeries\(s\)/);
  assert.match(admin, /function sessionRosterFact\(s\)/);
  assert.match(admin, /id="view-check"/);
  const render = admin.slice(admin.indexOf('function renderSessions('), admin.indexOf('function materialsCheckedStamp('));
  assert.doesNotMatch(render, /if\s*\(\s*s\.isPrivate\s*\)\s*return false/);
  assert.doesNotMatch(render, /is_private\)\s*return false/);
  assert.match(render, /Private/);
  assert.match(render, /sessionStudentsLabel\(s\)/);
  assert.equal(fs.readFileSync(path.join(root, 'js', 'session-views.js'), 'utf8').indexOf('\u2014'), -1);
});

test('instructor schedule, roster, and calendar use the same roster phrase and meeting days', () => {
  assert.match(instructor, /src="\/js\/session-views\.js"/);
  assert.match(instructor, /function rosterPhrase\(s\)/);
  assert.match(instructor, /MBSessionViews\.rosterFact/);
  assert.match(instructor, /escapeHtml\(rosterPhrase\(s\)\)/);
  assert.match(instructor, /rosterTimeLine\(session\)/);
  assert.match(instructor, /sessionWhenText\(session\)/);
  assert.match(admin, /function sessionTimeLine\(s\)/);
  assert.match(instructor, /isPrivate:r\.is_private===true/);
  assert.match(instructor, /billedHeadcount:r\.billed_headcount/);
  assert.match(migration, /billed_headcount, bill_to_org, price_override/);
  assert.match(migration, /is_private, org_handles_registration/);
  assert.doesNotMatch(migration, /admin_private_notes/);
});
