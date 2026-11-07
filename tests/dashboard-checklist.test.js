'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const admin = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

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

const sandbox = {
  jobDataCache: {},
  instructors: [],
  registrations: [],
  orgPartners: [],
  Date,
  String,
  Number,
  Math
};
vm.createContext(sandbox);
vm.runInContext(
  [
    'sessionInstructorList',
    'sessionInstructorNames',
    'sessionIsOrganization',
    'sessionHostDisplayName',
    'checklistInstructorLabel',
    'checklistHostLabel',
    'preClassMaterialsLabel',
    'preClassInstrReminderLabel',
    'preClassStudentReminderLabel',
    'preClassFinalRosterLabel',
    'preClassLiveStudentCount',
    'preClassNeedsStudentReminder',
    'preClassShowsStudentCount',
    'preClassTaskList',
    'preClassChecklistDone',
    'dashYMD',
    'dashSessionDates',
    'dashSessionDayDiff',
    'dashPrepCity',
    'dashPrepDateLabel',
    'dashPrepStepShort',
    'dashPrepMissingNames',
    'dashPrepMissingLine',
    'dashPrepPartition',
    'dashUpcomingSessions',
    'dashChecklistSessions',
    'dashTeachingSlots',
    'dashVisibleUpcoming',
    'dashFortnightLoad',
    'dashInstructorChoices'
  ].map((n) => extractFunction(admin, n)).join('\n'),
  sandbox
);

function sess(id, date, flags) {
  return Object.assign({ id, course: 'Safe Sitter®', date, isHold: false, isCancelled: false, hasHost: true, instructorId: 'i1' }, flags);
}

test('finished prep stays on the dashboard, and past or hold sessions do not', () => {
  const today = new Date(2026, 8, 26);
  sandbox.jobDataCache = {
    done: { materialsSent: true, instrReminderSent: true, hostReminderSent: true, classReminderSent: true },
    soon: { materialsSent: true, instrReminderSent: false, hostReminderSent: true, classReminderSent: true },
    later: { materialsSent: true, instrReminderSent: true, hostReminderSent: true, classReminderSent: true }
  };
  const rows = [
    sess('done', '2026-09-27'),
    sess('soon', '2026-09-30'),
    sess('later', '2026-10-20'),
    sess('old', '2026-09-01'),
    sess('hold', '2026-09-28', { isHold: true })
  ];
  assert.equal(sandbox.preClassChecklistDone(rows[0]), true);
  assert.equal(sandbox.preClassChecklistDone(rows[2]), true);
  assert.deepEqual(sandbox.dashUpcomingSessions(rows, today).map((s) => s.id), ['done', 'soon', 'later']);
  assert.deepEqual(sandbox.dashChecklistSessions(rows, today).map((s) => s.id), ['done', 'soon', 'later']);
});

test('dashboard no longer renders the removed widgets', () => {
  assert.doesNotMatch(admin, /id="needs-regs"/);
  assert.doesNotMatch(admin, /id="upcoming-list"/);
  assert.doesNotMatch(admin, /id="recent-list"/);
  assert.doesNotMatch(admin, /Sessions needing registrations/);
  assert.doesNotMatch(admin, /Recent registrations/);
  assert.match(admin, /id="reminder-alerts"/);
  assert.doesNotMatch(admin, /id="dash-materials"/);
  assert.doesNotMatch(admin, /id="org-billing"/);
assert.match(admin, /No upcoming sessions/);
  assert.match(admin, /renderDashUpcoming\(now\)/);
  assert.doesNotMatch(admin, /dashChecklistSessions\(sessions, now\)\.filter\(function\(s\)\{return !preClassChecklistDone\(s\);\}/);
});

test('all upcoming stays the default, and next 2 weeks is a filter that still keeps finished prep', () => {
  const today = new Date(2026, 10, 5);
  const done = { materialsSent: true, instrReminderSent: true, hostReminderSent: true, classReminderSent: true };
  sandbox.jobDataCache = { d1: done, d14: done, d15: {} };
  sandbox.instructors = [{ id: 'i1', name: 'Jane Doe' }];
  const rows = [
    sess('d1', '2026-11-06'),
    sess('d14', '2026-11-19'),
    sess('d15', '2026-11-20'),
    sess('past', '2026-11-04'),
    sess('hold', '2026-11-10', { isHold: true })
  ];
  assert.deepEqual(sandbox.dashVisibleUpcoming(rows, today, 'all', 'all').map((s) => s.id), ['d1', 'd14', 'd15']);
  assert.deepEqual(sandbox.dashVisibleUpcoming(rows, today, '14', 'all').map((s) => s.id), ['d1', 'd14']);
  assert.equal(sandbox.preClassChecklistDone(rows[0]), true);
  const block = admin.slice(admin.indexOf('// ── Pre-class action reminders'), admin.indexOf('// ─── SESSIONS'));
  assert.match(block, /All upcoming/);
  assert.match(block, /Next 2 weeks/);
  assert.match(block, /setDashUpcomingScope\(\\'all\\'\)/);
  assert.match(block, /setDashUpcomingScope\(\\'14\\'\)/);
  assert.match(block, /setDashUpcomingInstructor/);
  assert.doesNotMatch(block, /openInstructorFortnight/);
  assert.doesNotMatch(block, /Show these/);
  assert.doesNotMatch(block, /in-person sessions in the next 2 weeks/);
  assert.match(block, /On Zoom\. No kit to pack\./);
  assert.match(block, /printTeachingChecklist/);
  assert.match(block, /dayDiff>=9&&dayDiff<=14/);
  assert.match(block, />2 weeks out</);
  assert.doesNotMatch(block, /Host reminder/);
});

test('a finished checklist stays visible when the session is still upcoming', () => {
  const today = new Date(2026, 8, 26);
  const done = { materialsSent: true, instrReminderSent: true, hostReminderSent: true, classReminderSent: true };
  sandbox.jobDataCache = {
    welcome: done,
    gp: done,
    fri: done,
    sat: done,
    open: { materialsSent: true, instrReminderSent: true, hostReminderSent: true, classReminderSent: false }
  };
  const rows = [
    sess('welcome', '2026-09-27', { course: "Service Unit 60-6 (Nation's Capital Girl Scouts) Welcome Event!", hasHost: false }),
    sess('gp', '2026-09-30', { course: 'Grandparents: Getting Started' }),
    sess('fri', '2026-10-02', { course: 'Safe Sitter®' }),
    sess('sat', '2026-10-03', { course: 'Safe Sitter®' }),
    sess('open', '2026-10-08', { course: 'Campus Ready: Safety Skills for College Life' })
  ];
  const shown = sandbox.dashUpcomingSessions(rows, today).map((s) => s.id);
  assert.deepEqual(shown, ['welcome', 'gp', 'fri', 'sat', 'open']);
  rows.filter((s) => s.id !== 'open').forEach((s) => assert.equal(sandbox.preClassChecklistDone(s), true));
  assert.equal(sandbox.preClassChecklistDone(rows[4]), false);
});

test('one instructor with two sessions in 14 days is flagged once per session, and a later class stays in All upcoming', () => {
  const today = new Date(2026, 10, 5);
  sandbox.instructors = [
    { id: 'jane', name: 'Jane Doe' },
    { id: 'bob', name: 'Bob Smith' }
  ];
  sandbox.jobDataCache = {};
  const rows = [
    sess('near', '2026-11-08', { instructorId: 'jane', course: 'Safe Sitter®', location: 'Beth El' }),
    sess('week2', '2026-11-16', { instructorId: 'jane', secondInstructorId: 'bob', course: 'Baby Ready', location: 'Library' }),
    sess('later', '2026-12-02', { instructorId: 'jane', course: 'Care Ready', location: 'School' }),
    sess('zoom', '2026-11-10', { instructorId: 'jane', isVirtual: true, course: 'Safe@Home' }),
    sess('bob-only', '2026-11-12', { instructorId: 'bob', course: 'Stay Ready' })
  ];
  const all = sandbox.dashVisibleUpcoming(rows, today, 'all', 'all', sandbox.instructors, {}).map((s) => s.id);
  assert.deepEqual(all, ['near', 'zoom', 'bob-only', 'week2', 'later']);
  assert.equal(all.filter((id) => id === 'week2').length, 1);

  const janeAll = sandbox.dashVisibleUpcoming(rows, today, 'all', 'id:jane', sandbox.instructors, {}).map((s) => s.id);
  assert.deepEqual(janeAll, ['near', 'zoom', 'week2', 'later']);
  const janeSoon = sandbox.dashVisibleUpcoming(rows, today, '14', 'id:jane', sandbox.instructors, {}).map((s) => s.id);
  assert.deepEqual(janeSoon, ['near', 'zoom', 'week2']);
  const bobSoon = sandbox.dashVisibleUpcoming(rows, today, '14', 'id:bob', sandbox.instructors, {}).map((s) => s.id);
  assert.deepEqual(bobSoon, ['bob-only', 'week2']);

  const loads = sandbox.dashFortnightLoad(rows, today, sandbox.instructors, {});
  const jane = loads.find((g) => g.key === 'id:jane');
  assert.ok(jane);
  assert.deepEqual(Array.from(jane.ids), ['near', 'week2']);
  assert.equal(jane.ids.includes('zoom'), false);
  assert.equal(jane.ids.includes('later'), false);
  assert.equal(jane.ids.filter((id) => id === 'week2').length, 1);
  const bob = loads.find((g) => g.key === 'id:bob');
  assert.deepEqual(Array.from(bob.ids), ['bob-only', 'week2']);
  assert.equal(bob.ids.filter((id) => id === 'week2').length, 1);

  const owner = sess('mine', '2026-11-09', { ownerTaught: true, instructorId: null, secondInstructorId: 'bob' });
  const open = sess('open', '2026-11-11', { instructorId: null });
  const slots = sandbox.dashTeachingSlots(owner, sandbox.instructors, {});
  assert.deepEqual(Array.from(slots, (slot) => slot.key), ['owner', 'id:bob']);
  assert.deepEqual(Array.from(sandbox.dashTeachingSlots(open, sandbox.instructors, {}), (slot) => slot.name), ['Needs an instructor']);
  const withOwner = rows.concat([owner, open]);
  const everyone = sandbox.dashVisibleUpcoming(withOwner, today, 'all', 'all', sandbox.instructors, {});
  assert.equal(everyone.filter((s) => s.id === 'mine').length, 1);
  assert.deepEqual(sandbox.dashVisibleUpcoming(withOwner, today, '14', 'owner', sandbox.instructors, {}).map((s) => s.id), ['mine']);
});

test('checklist cards name the instructor and the host, or say when either is missing', () => {
  sandbox.instructors = [
    { id: 'i1', name: 'Jane Doe' },
    { id: 'i2', name: 'Bob Smith' }
  ];
  sandbox.registrations = [];
  sandbox.orgPartners = [];
  sandbox.jobDataCache = { claimed: { instructorId: 'i1' } };

  const assigned = sess('claimed', '2026-10-16', { contactName: 'Dana Rivera', instructorId: null });
  assert.equal(sandbox.checklistInstructorLabel(assigned), 'Jane Doe');
  assert.equal(sandbox.checklistHostLabel(assigned), 'Dana Rivera');

  const owner = sess('owner', '2026-10-16', { ownerTaught: true, instructorId: null, secondInstructorId: 'i2', contactName: '' });
  assert.equal(sandbox.checklistInstructorLabel(owner), 'Lindsay Karr (owner) + Bob Smith');

  const open = sess('open-job', '2026-10-16', { instructorId: null, contactName: '   ', hasHost: true });
  assert.equal(sandbox.checklistInstructorLabel(open), 'No instructor');
  assert.equal(sandbox.checklistHostLabel(open), 'No host');

  sandbox.registrations = [
    { sessionId: 'reg-host', payStatus: 'paid', parentName: 'Not Host', studentName: 'A Student' },
    { sessionId: 'reg-host', payStatus: 'host', parentName: 'Sam Parent', studentName: 'Kid Host' },
    { sessionId: 'other', payStatus: 'host', parentName: 'Other Host', studentName: 'Nope' }
  ];
  const fromReg = sess('reg-host', '2026-10-16', { instructorId: 'i1', contactName: '' });
  assert.equal(sandbox.checklistHostLabel(fromReg), 'Sam Parent');

  sandbox.registrations = [
    { sessionId: 'kid-host', payStatus: 'host', parentName: '', studentName: 'Kid Host' }
  ];
  assert.equal(sandbox.checklistHostLabel(sess('kid-host', '2026-10-16', { contactName: '' })), 'Kid Host');

  sandbox.orgPartners = [{ id: 'org1', name: 'Temple Beth El', contactName: 'Alex Chen' }];
  const fromOrg = sess('org', '2026-10-16', { instructorId: null, contactName: '', hasHost: false, hostedFor: 'org1' });
  assert.equal(sandbox.checklistHostLabel(fromOrg), 'Alex Chen');
  sandbox.orgPartners = [{ id: 'org1', name: 'Temple Beth El', contactName: '' }];
  assert.equal(sandbox.checklistHostLabel(fromOrg), 'Temple Beth El');

  const named = sess('both', '2026-10-16', { contactName: 'Dana Rivera', hostedFor: 'org1' });
  sandbox.registrations = [{ sessionId: 'both', payStatus: 'host', parentName: 'Sam Parent', studentName: 'Kid' }];
  assert.equal(sandbox.sessionHostDisplayName(named), 'Dana Rivera');

  const block = admin.slice(admin.indexOf('// ── Pre-class action reminders'), admin.indexOf('// ─── SESSIONS'));
  assert.match(block, /checklistInstructorLabel\(s\)/);
  assert.match(block, /checklistHostLabel\(s\)/);
  assert.match(block, /roleLine\('Instructor',instrLabel,'No instructor'\)/);
  assert.match(block, /roleLine\(sessionIsOrganization\(s\)\?'Organization':'Host',hostLabel,sessionIsOrganization\(s\)\?'No organization':'No host'\)/);
  assert.match(block, /escapeHtml\(value\)/);
  assert.match(block, /preClassMaterialsLabel\(s\)/);
  assert.match(block, /preClassInstrReminderLabel\(s\)/);
  assert.match(block, /preClassShowsStudentCount\(s\)/);
  assert.match(block, /toggleMaterialsFromDash/);
  assert.doesNotMatch(block, /if\(!custom&&hasHost\)/);
  assert.doesNotMatch(block, /hostReminderSent/);
  assert.doesNotMatch(block, /Host reminder/);
  assert.doesNotMatch(block, /openHostReminder/);
  assert.match(block, /preClassTaskList\(s\)\.map/);
  assert.match(block, /preClassStudentReminderLabel\(s\)/);
  assert.match(admin, /return \(s&&s\.isCustomJob\)\?'Send reminder to instructor':'Send reminder \+ roster to instructor';/);
  assert.match(admin, /Family reminder — before class/);
  assert.match(block, /openInstructorReminder/);
  assert.match(block, /openClassReminder/);
  assert.match(block, /openInstructorFinalRoster/);
  assert.match(block, /preClassFinalRosterLabel\(s\)/);
  assert.match(block, /instrFinalRosterSent/);
  assert.doesNotMatch(block, /emailjs\.send/);
  assert.match(block, /fmtSessDate\(s,/);
});

test('custom jobs keep a materials checkbox and an instructor reminder only', () => {
  const walk = sess('walk', '2026-10-17', {
    course: 'Represent us at Shatterproof Walk DC',
    isCustomJob: true,
    hasHost: true,
    instructorId: 'i1'
  });
  const fest = sess('fest', '2026-10-17', {
    course: 'Represent us at Goddard School Bethesda Fall Fest',
    isCustomJob: true,
    hasHost: false,
    instructorId: 'i2'
  });
  sandbox.jobDataCache = { walk: {}, fest: {} };
  const keys = (s) => [...sandbox.preClassTaskList(s)].map((t) => t.key);
  assert.deepEqual(keys(walk), ['materialsSent', 'instrReminderSent']);
  assert.deepEqual(keys(fest), ['materialsSent', 'instrReminderSent']);
  assert.equal(sandbox.preClassMaterialsLabel(walk), 'Put out materials for the instructor');
  assert.equal(sandbox.preClassInstrReminderLabel(walk), 'Send reminder to instructor');
  assert.equal(sandbox.preClassShowsStudentCount(walk), false);
  assert.equal(sandbox.preClassShowsStudentCount(fest), false);

  const klass = sess('ss', '2026-10-16', { isCustomJob: false, hasHost: true, instructorId: 'i1' });
  sandbox.jobDataCache.ss = {};
  assert.deepEqual(keys(klass), ['materialsSent', 'instrReminderSent', 'classReminderSent']);
  assert.equal(sandbox.preClassMaterialsLabel(klass), 'Put out handbooks &amp; supplies');
  assert.equal(sandbox.preClassInstrReminderLabel(klass), 'Send reminder + roster to instructor');
  assert.equal(sandbox.preClassShowsStudentCount(klass), true);

  // Host and family flags do not keep a custom job on the card. The materials
  // checkbox is the owner's own reminder, and it uses the same flag as before.
  sandbox.jobDataCache.walk = { materialsSent: true, instrReminderSent: true };
  assert.equal(sandbox.preClassChecklistDone(walk), true);
  sandbox.jobDataCache.walk = {
    materialsSent: false,
    instrReminderSent: true,
    hostReminderSent: true,
    classReminderSent: true
  };
  assert.equal(sandbox.preClassChecklistDone(walk), false);
  assert.equal(sandbox.preClassTaskList(walk)[0].done, false);

  const today = new Date(2026, 9, 9);
  sandbox.jobDataCache.walk = { materialsSent: true, instrReminderSent: false };
  sandbox.jobDataCache.fest = { materialsSent: true, instrReminderSent: true };
  assert.equal(sandbox.preClassChecklistDone(fest), true);
  assert.deepEqual(sandbox.dashUpcomingSessions([walk, fest], today).map((s) => s.id), ['fest', 'walk']);

  const ownerBooth = sess('booth', '2026-10-17', {
    course: 'Represent us at a booth',
    isCustomJob: true,
    ownerTaught: true,
    instructorId: null,
    hasHost: false
  });
  sandbox.jobDataCache.booth = {};
  assert.deepEqual(keys(ownerBooth), ['materialsSent']);
  sandbox.jobDataCache.booth = { materialsSent: true };
  assert.equal(sandbox.preClassChecklistDone(ownerBooth), true);
});

test('a virtual class keeps week-before reminders and a day-before final roster', () => {
  const zoom = sess('abby', '2026-10-18', {
    course: 'Safe@Home — Virtual',
    isVirtual: true,
    hasHost: false,
    instructorId: 'abby',
    contactName: ''
  });
  sandbox.jobDataCache = { abby: {} };
  sandbox.registrations = [];
  const zoomKeys = (s) => [...sandbox.preClassTaskList(s)].map((t) => t.key);
  assert.deepEqual(zoomKeys(zoom), ['instrReminderSent', 'instrFinalRosterSent']);
  assert.equal(sandbox.preClassInstrReminderLabel(zoom), 'Week before — email instructor Zoom link + roster');
  assert.equal(sandbox.preClassFinalRosterLabel(zoom), 'Day before — send final roster to instructor');
  assert.equal(sandbox.preClassChecklistDone(zoom), false);
  sandbox.jobDataCache.abby = { materialsSent: false, instrReminderSent: true };
  assert.equal(sandbox.preClassChecklistDone(zoom), false);

  sandbox.registrations = [
    { sessionId: 'abby', payStatus: 'paid', contact: 'parent@example.com' },
    { sessionId: 'abby', payStatus: 'waitlist', contact: 'wait@example.com' }
  ];
  assert.deepEqual(zoomKeys(zoom), ['instrReminderSent', 'classReminderSent', 'instrFinalRosterSent']);
  assert.equal(sandbox.preClassStudentReminderLabel(zoom), 'Week before — email participants Zoom link');
  assert.equal(sandbox.preClassChecklistDone(zoom), false);
  sandbox.jobDataCache.abby.classReminderSent = true;
  assert.equal(sandbox.preClassChecklistDone(zoom), false);

  const tomorrow = new Date(2026, 9, 17);
  assert.deepEqual(sandbox.dashUpcomingSessions([zoom], tomorrow).map((s) => s.id), ['abby']);
  sandbox.jobDataCache.abby.instrFinalRosterSent = true;
  assert.equal(sandbox.preClassChecklistDone(zoom), true);
  assert.deepEqual(sandbox.dashUpcomingSessions([zoom], tomorrow).map((s) => s.id), ['abby']);

  const early = sess('early-zoom', '2026-10-27', {
    course: 'Safe@Home — Virtual',
    isVirtual: true,
    hasHost: false,
    instructorId: 'abby'
  });
  sandbox.registrations.push({ sessionId: 'early-zoom', payStatus: 'paid', contact: 'parent@example.com' });
  sandbox.jobDataCache['early-zoom'] = {
    instrReminderSent: true,
    classReminderSent: true,
    instrFinalRosterSent: false
  };
  assert.equal(sandbox.preClassChecklistDone(early), false);
  assert.deepEqual(sandbox.dashUpcomingSessions([early], tomorrow).map((s) => s.id), ['early-zoom']);
  sandbox.jobDataCache['early-zoom'].instrFinalRosterSent = true;
  assert.equal(sandbox.preClassChecklistDone(early), true);
  assert.deepEqual(sandbox.dashUpcomingSessions([early], tomorrow).map((s) => s.id), ['early-zoom']);

  const selfTaught = sess('self', '2026-10-18', {
    isVirtual: true,
    ownerTaught: true,
    instructorId: null,
    hasHost: false
  });
  sandbox.jobDataCache.self = {};
  sandbox.registrations = [{ sessionId: 'self', payStatus: 'paid', contact: 'parent@example.com' }];
  assert.deepEqual(zoomKeys(selfTaught), ['classReminderSent']);

  const room = sess('room', '2026-10-18', { isVirtual: false, hasHost: true, instructorId: 'i1' });
  sandbox.jobDataCache.room = {};
  assert.deepEqual(zoomKeys(room), ['materialsSent', 'instrReminderSent', 'classReminderSent']);
  assert.equal(sandbox.preClassMaterialsLabel(room), 'Put out handbooks &amp; supplies');
  assert.equal(sandbox.preClassInstrReminderLabel(room), 'Send reminder + roster to instructor');
  assert.equal(sandbox.preClassStudentReminderLabel(room), 'Family reminder — before class');
  assert.equal(sandbox.preClassTaskList(room).some((t) => t.key === 'instrFinalRosterSent'), false);

  const week = admin.slice(admin.indexOf('function openInstructorReminder'), admin.indexOf('function openInstructorFinalRoster'));
  const day = admin.slice(admin.indexOf('function openInstructorFinalRoster'), admin.indexOf('// ─── ERROR TRACKING'));
  assert.match(week, /opsDraft\('instructorZoomReminder'/);
  assert.match(week, /Send reminder \+ roster to instructor/);
  assert.match(day, /opsDraft\('instructorFinalRoster'/);
  assert.match(day, /body:draft\.body/);
  assert.match(day, /hasRoster:true/);
  assert.match(day, /privateCols:true/);
  assert.doesNotMatch(week + day, /emailjs/);
  assert.doesNotMatch(week + day, /mailto:/);
});

test('the day-before final roster flag round-trips on job_data', () => {
  const box = {
    INSTR_FINAL_ROSTER_COL: true,
    MATERIALS_SENT_AT_COL: true,
    MATERIALS_OUT_AT_COL: true,
    BADGE_SUMMARY_COL: true,
    RED_CROSS_REPORTED_COL: true
  };
  vm.createContext(box);
  vm.runInContext([extractFunction(admin, 'jobFromDB'), extractFunction(admin, 'jobToDB')].join('\n'), box);
  const sent = box.jobToDB('abby', { instrFinalRosterSent: true, waitlist: [], materialsSent: false });
  assert.equal(sent.instr_final_roster_sent, true);
  assert.equal(box.jobFromDB(sent).instrFinalRosterSent, true);
  const cleared = box.jobToDB('abby', { instrFinalRosterSent: false, waitlist: [] });
  assert.equal(cleared.instr_final_roster_sent, false);
  box.INSTR_FINAL_ROSTER_COL = false;
  const pending = box.jobToDB('abby', { instrFinalRosterSent: true, waitlist: [] });
  assert.equal(Object.prototype.hasOwnProperty.call(pending, 'instr_final_roster_sent'), false);

  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations/20261105_zoom_final_roster.sql'), 'utf8');
  assert.match(sql, /alter table public\.job_data\s+add column if not exists instr_final_roster_sent boolean not null default false;/);
  assert.match(sql, /grant select \(instr_final_roster_sent\), insert \(instr_final_roster_sent\), update \(instr_final_roster_sent\)/);
  assert.match(sql, /revoke select \(instr_final_roster_sent\), insert \(instr_final_roster_sent\), update \(instr_final_roster_sent\), references \(instr_final_roster_sent\)/);
  assert.match(sql, /from anon, public/);
  assert.match(sql, /to authenticated/);
  assert.match(sql, /Nothing in this migration sends email/);
});

test('an unsent host reminder does not keep a class on the checklist', () => {
  const today = new Date(2026, 8, 26);
  const ready = sess('ready', '2026-09-28', { hasHost: true, instructorId: 'i1' });
  sandbox.jobDataCache = {
    ready: { materialsSent: true, instrReminderSent: true, hostReminderSent: false, classReminderSent: true }
  };
  assert.deepEqual([...sandbox.preClassTaskList(ready)].map((t) => t.key), ['materialsSent', 'instrReminderSent', 'classReminderSent']);
  assert.equal(sandbox.preClassChecklistDone(ready), true);
  assert.deepEqual(sandbox.dashUpcomingSessions([ready], today).map((s) => s.id), ['ready']);

  const noHost = sess('no-host', '2026-09-29', { hasHost: false, instructorId: 'i1' });
  sandbox.jobDataCache['no-host'] = { materialsSent: true, instrReminderSent: true, hostReminderSent: false, classReminderSent: false };
  assert.equal(sandbox.preClassChecklistDone(noHost), false);
  assert.deepEqual(sandbox.dashUpcomingSessions([ready, noHost], today).map((s) => s.id), ['ready', 'no-host']);
});

test('a multi-day class and a series stay until the last date, then drop off', () => {
  const today = new Date(2026, 10, 7);
  const ongoing = sess('series', '2026-10-01', { isRecurring: true, recurEndDate: '2026-11-20', extraDates: ['2026-10-08'] });
  const twoDay = sess('two', '2026-11-06', { extraDates: ['2026-11-08'] });
  const finishedSeries = sess('old-series', '2026-09-01', { isRecurring: true, recurEndDate: '2026-11-06' });
  const endedExtra = sess('ended', '2026-11-01', { extraDates: ['2026-11-06'], extraDays: [{ date: '2026-11-06', time: '1:00 PM' }] });
  const todayClass = sess('today', '2026-11-07');
  const past = sess('past', '2026-11-05');
  assert.equal(sandbox.dashSessionDayDiff(ongoing, today), 13);
  assert.equal(sandbox.dashSessionDayDiff(twoDay, today), 1);
  assert.equal(sandbox.dashSessionDayDiff(todayClass, today), 0);
  assert.ok(sandbox.dashSessionDayDiff(finishedSeries, today) < 0);
  assert.ok(sandbox.dashSessionDayDiff(endedExtra, today) < 0);
  assert.ok(sandbox.dashSessionDayDiff(past, today) < 0);
  assert.deepEqual(
    sandbox.dashUpcomingSessions([finishedSeries, endedExtra, past, ongoing, twoDay, todayClass], today).map((s) => s.id),
    ['series', 'two', 'today']
  );
  assert.equal(sandbox.dashPrepDateLabel(twoDay), 'Fri, Nov 6, 2026 - Sun, Nov 8, 2026');
  assert.equal(sandbox.dashPrepDateLabel(todayClass), 'Sat, Nov 7, 2026');
  assert.equal(sandbox.dashPrepCity({ city: '  Silver Spring  ' }), 'Silver Spring');
  assert.equal(sandbox.dashPrepCity({ isVirtual: true, city: 'Zoom' }), 'Virtual');
});

test('finished prep is grouped under sessions that still need a step, and All upcoming stays the default', () => {
  const today = new Date(2026, 10, 7);
  const done = { materialsSent: true, instrReminderSent: true, hostReminderSent: true, classReminderSent: true };
  sandbox.jobDataCache = {
    sooner: done,
    needs: { materialsSent: false, instrReminderSent: true, classReminderSent: true },
    later: done
  };
  const rows = [
    sess('sooner', '2026-11-07'),
    sess('needs', '2026-11-08'),
    sess('later', '2026-11-12'),
    sess('gone', '2026-11-01', { extraDates: ['2026-11-06'] })
  ];
  const visible = sandbox.dashUpcomingSessions(rows, today);
  assert.deepEqual(visible.map((s) => s.id), ['sooner', 'needs', 'later']);
  const groups = sandbox.dashPrepPartition(visible, today);
  assert.deepEqual(Array.from(groups.needs, (s) => s.id), ['needs']);
  assert.deepEqual(Array.from(groups.done, (s) => s.id), ['sooner', 'later']);
  assert.deepEqual(Array.from(sandbox.dashPrepMissingNames(rows[1])), ['supplies']);
  assert.equal(sandbox.dashPrepMissingLine(rows[1]), 'Missing: supplies');
  const booth = sess('booth', '2026-11-09', { isCustomJob: true, instructorId: 'i1' });
  sandbox.jobDataCache.booth = { materialsSent: false, instrReminderSent: false };
  assert.deepEqual(Array.from(sandbox.dashPrepMissingNames(booth)), ['materials', 'instructor reminder']);
  assert.equal(sandbox.dashPrepMissingLine(booth), 'Missing: materials, instructor reminder');
  sandbox.jobDataCache.booth = { materialsSent: true, instrReminderSent: true };
  assert.equal(sandbox.dashPrepMissingLine(booth), '');

  const block = admin.slice(admin.indexOf('// ── Pre-class action reminders'), admin.indexOf('// ─── SESSIONS'));
  const render = extractFunction(admin, 'renderDashUpcoming');
  assert.ok(render.indexOf('NEEDS PREP (') < render.indexOf('READY TO GO ('), 'needs prep stays above ready to go');
  assert.match(block, /NEEDS PREP \(/);
  assert.match(block, /READY TO GO \(/);
  assert.match(block, /class="prep-missing"/);
  assert.match(block, /dashPrepMissingLine\(s\)/);
  assert.match(block, /class="prep-check"/);
  assert.match(block, /class="prep-row"/);
  assert.doesNotMatch(block, /prep-done-badge/);
  assert.doesNotMatch(block, /Prep complete/);
  assert.doesNotMatch(block, /border-left:3px solid/);
  assert.doesNotMatch(block, /Show these/);
  assert.match(block, /toggleDashPrepRow/);
  assert.match(block, /toggleDashPrepSection/);
  assert.match(block, /dashPrepCompactRow/);
  assert.match(block, /checklistInstructorLabel\(s\)/);
  assert.match(block, /dashPrepCity\(s\)/);
  assert.match(block, /Hide details/);
  assert.match(block, /Show details/);
  assert.match(admin, /let dashUpcomingScope='all'/);
  assert.match(block, /All upcoming/);
  assert.match(block, /packingKitHtml/);
  assert.doesNotMatch(admin, /dashChecklistSessions\(sessions, now\)\.filter\(function\(s\)\{return !preClassChecklistDone\(s\);\}/);
});
