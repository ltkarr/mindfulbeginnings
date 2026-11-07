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
    'dashSessionDayDiff',
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
  assert.match(block, /openInstructorFortnight/);
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

test('each upcoming card has a read-only left prep mark from the existing rule', () => {
  const statusFns = [
    'dashPrepStatusHtml',
    'escapeHtml',
    'adminPlaceText',
    'fmtSessDate',
    'sessionInstructorList',
    'sessionInstructorNames',
    'sessionIsOrganization',
    'sessionHostDisplayName',
    'checklistInstructorLabel',
    'checklistHostLabel',
    'isLiveReg',
    'preClassMaterialsLabel',
    'preClassInstrReminderLabel',
    'preClassStudentReminderLabel',
    'preClassFinalRosterLabel',
    'preClassShowsStudentCount',
    'preClassLiveStudentCount',
    'preClassNeedsStudentReminder',
    'preClassTaskList',
    'preClassChecklistDone',
    'dashSessionDayDiff',
    'dashUpcomingSessions',
    'dashTeachingSlots',
    'dashVisibleUpcoming',
    'dashInstructorChoices',
    'dashFortnightLoad',
    'dashPacksWithAnother',
    'materialsCheckedStamp',
    'renderDashUpcoming',
    'setMaterialsSent',
    'toggleMaterialsFromDash',
    'toggleReminderFlag'
  ];
  const alerts = { innerHTML: '' };
  const box = {
    Date,
    String,
    Number,
    Math,
    Object,
    Array,
    isNaN,
    document: { getElementById(id) { return id === 'reminder-alerts' ? alerts : null; } },
    MBTeachingChecklists: { forSession(s) { return s && !s.isVirtual ? { id: 'sheet' } : null; } },
    dashUpcomingScope: 'all',
    dashUpcomingInstructor: 'all',
    instructors: [
      { id: 'bela', name: 'Bela Spooner' },
      { id: 'kim', name: 'Kim Varner' },
      { id: 'abby', name: 'Abby Chen' }
    ],
    orgPartners: [],
    registrations: [],
    sessions: [],
    jobDataCache: {},
    saved: [],
    toasts: []
  };
  box.window = { MBTeachingChecklists: box.MBTeachingChecklists };
  box.paintLockboxRow = function () {};
  box.upsertJobData = function (id) { box.saved.push(id); return Promise.resolve(true); };
  box.showToast = function (msg) { box.toasts.push(msg); };
  box.renderJobs = function () {};
  box.renderDashboard = function () { box.renderDashUpcoming(new Date(2026, 10, 7)); };
  vm.createContext(box);
  vm.runInContext(statusFns.map((n) => extractFunction(admin, n)).join('\n'), box);

  const completeMark = box.dashPrepStatusHtml(true);
  const openMark = box.dashPrepStatusHtml(false);
  assert.match(completeMark, /class="dash-prep-status is-complete"/);
  assert.match(completeMark, /data-prep-status="complete"/);
  assert.match(completeMark, /Prep complete/);
  assert.match(completeMark, /<path /);
  assert.match(completeMark, /fill="currentColor"/);
  assert.doesNotMatch(completeMark, /<input|onclick|onchange|button/);
  assert.match(openMark, /class="dash-prep-status is-open"/);
  assert.match(openMark, /data-prep-status="open"/);
  assert.match(openMark, /Not complete/);
  assert.match(openMark, /fill="none"/);
  assert.doesNotMatch(openMark, /<path |Prep complete|<input|onclick|onchange|button|checked/);

  const block = admin.slice(admin.indexOf('// ── Pre-class action reminders'), admin.indexOf('// ─── SESSIONS'));
  assert.match(block, /dashPrepStatusHtml\(preClassChecklistDone\(s\)\)/);
  assert.doesNotMatch(block, /margin-top:4px">Prep complete/);
  assert.match(block, /class="dash-prep-card"/);
  assert.match(block, /printTeachingChecklist\('\$\{s\.id\}'\)/);
  assert.match(block, /toggleMaterialsFromDash/);
  assert.match(block, /toggleReminderFlag/);
  assert.match(extractFunction(admin, 'preClassChecklistDone'), /preClassTaskList\(s\)\.every/);
  assert.match(admin, /@media\(max-width:480px\)\{[\s\S]*?\.dash-prep-status\{/);
  assert.doesNotMatch(admin, /\.dash-prep-status\{[^}]*display:\s*none/);
  assert.match(admin, /body\.teach-printing \.main-content\{display:none !important\}/);
  assert.match(admin, /function printTeachingChecklist\(sessId\)/);

  function cardFor(id) {
    const parts = alerts.innerHTML.split('<div class="dash-prep-card"').slice(1);
    const hit = parts.find((part) => part.includes("'" + id + "'"));
    assert.ok(hit, 'missing card ' + id);
    return '<div class="dash-prep-card"' + hit;
  }
  function statusOf(card) {
    const end = card.indexOf('<div class="dash-prep-body"');
    assert.ok(end > 0, 'missing card body');
    return card.slice(0, end);
  }
  function inputFor(card, token) {
    const at = card.indexOf(token);
    assert.ok(at > 0, 'missing ' + token);
    const start = card.lastIndexOf('<input', at);
    return card.slice(start, card.indexOf('>', at) + 1);
  }

  const carlin = sess('carlin', '2026-11-12', {
    course: 'Carlin Springs Moms Group — FREE Bilingual Infant & Child Choking Rescue',
    isCustomJob: true,
    hasHost: false,
    contactName: 'Carol Sabatino, Community School Coordinator',
    instructorId: 'bela',
    location: 'Carlin Springs Elementary School',
    hostAddress: '5995 5th Rd S',
    city: 'Arlington',
    state: 'VA'
  });
  const library = sess('library', '2026-11-14', {
    course: 'Fixture Library Visit — Infant Safety Talk',
    isCustomJob: true,
    hasHost: false,
    contactName: 'Fixture Host',
    instructorId: 'bela',
    location: 'Fixture Library'
  });
  const raphael = sess('raphael', '2026-11-19', {
    course: "Represent us at St. Raphael School's Girls Night Out!",
    isCustomJob: true,
    hasHost: false,
    contactName: 'St. Raphael School',
    instructorId: 'kim',
    location: 'St. Raphael School'
  });
  const sitter = sess('sitter', '2026-11-21', {
    course: 'Safe Sitter®',
    isCustomJob: false,
    hasHost: true,
    contactName: 'Dana Rivera',
    instructorId: 'kim',
    location: 'Community center'
  });
  const zoom = sess('zoom', '2026-11-09', {
    course: 'Safe@Home — Virtual',
    isVirtual: true,
    hasHost: false,
    instructorId: 'abby',
    location: ''
  });
  box.sessions = [carlin, library, raphael, sitter, zoom];
  box.jobDataCache = {
    carlin: {
      materialsSent: true,
      instrReminderSent: true,
      hostReminderSent: false,
      classReminderSent: false,
      materialsSentAt: '2026-11-06T00:40:00.000Z',
      materialsOutAt: '2026-11-06T00:40:00.000Z'
    },
    library: { materialsSent: true, instrReminderSent: false, materialsSentAt: '2026-11-06T15:00:00.000Z' },
    raphael: { materialsSent: true, instrReminderSent: true, materialsSentAt: '2026-11-06T19:00:00.000Z' },
    sitter: {
      materialsSent: true,
      instrReminderSent: true,
      classReminderSent: false,
      hostReminderSent: false,
      materialsSentAt: '2026-11-04T15:00:00.000Z'
    },
    zoom: { materialsSent: true, instrReminderSent: true, instrFinalRosterSent: false }
  };
  box.renderDashboard();

  assert.equal(box.preClassChecklistDone(carlin), true);
  assert.equal(box.preClassChecklistDone(library), false);
  assert.equal(box.preClassChecklistDone(raphael), true);
  assert.equal(box.preClassChecklistDone(sitter), false);
  assert.equal(box.preClassChecklistDone(zoom), false);
  assert.deepEqual([...box.preClassTaskList(zoom)].map((t) => t.key), ['instrReminderSent', 'instrFinalRosterSent']);

  const carlinCard = cardFor('carlin');
  const carlinStatus = statusOf(carlinCard);
  assert.match(carlinStatus, /data-prep-status="complete"/);
  assert.match(carlinStatus, /Prep complete/);
  assert.doesNotMatch(carlinStatus, /<input|onclick|onchange/);
  const carlinStamp = box.materialsCheckedStamp(box.jobDataCache.carlin);
  assert.match(carlinCard, /Put out materials for the instructor/);
  assert.match(carlinCard, /Send reminder to instructor/);
  assert.match(carlinCard, new RegExp(carlinStamp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(carlinCard, /printTeachingChecklist\('carlin'\)/);
  assert.doesNotMatch(carlinCard, /Family reminder|Host reminder|Day before/);
  assert.equal((carlinCard.match(/type="checkbox"/g) || []).length, 2);
  assert.match(inputFor(carlinCard, "toggleMaterialsFromDash('carlin'"), / checked/);
  assert.match(inputFor(carlinCard, "toggleReminderFlag('carlin','instrReminderSent'"), / checked/);

  const libraryCard = cardFor('library');
  assert.match(statusOf(libraryCard), /data-prep-status="open"/);
  assert.match(statusOf(libraryCard), /Not complete/);
  assert.doesNotMatch(statusOf(libraryCard), /<path /);
  assert.match(libraryCard, /Put out materials for the instructor/);
  assert.match(inputFor(libraryCard, "toggleMaterialsFromDash('library'"), / checked/);
  assert.doesNotMatch(inputFor(libraryCard, "toggleReminderFlag('library','instrReminderSent'"), / checked/);

  const sitterCard = cardFor('sitter');
  assert.match(statusOf(sitterCard), /data-prep-status="open"/);
  assert.match(sitterCard, /Family reminder — before class/);
  assert.doesNotMatch(sitterCard, /Host reminder/);
  assert.equal((sitterCard.match(/type="checkbox"/g) || []).length, 3);

  const zoomCard = cardFor('zoom');
  assert.match(statusOf(zoomCard), /data-prep-status="open"/);
  assert.match(zoomCard, /Day before — send final roster to instructor/);
  assert.doesNotMatch(zoomCard, /Put out handbooks|Put out materials/);
  assert.doesNotMatch(zoomCard, /printTeachingChecklist/);

  const stamp = box.jobDataCache.carlin.materialsSentAt;
  box.toggleReminderFlag('carlin', 'instrReminderSent', false);
  assert.equal(box.jobDataCache.carlin.materialsSent, true);
  assert.equal(box.jobDataCache.carlin.materialsSentAt, stamp);
  assert.equal(box.jobDataCache.carlin.instrReminderSent, false);
  assert.equal(box.preClassChecklistDone(carlin), false);
  const afterOff = cardFor('carlin');
  assert.match(statusOf(afterOff), /data-prep-status="open"/);
  assert.match(statusOf(afterOff), /Not complete/);
  assert.doesNotMatch(statusOf(afterOff), /<path /);
  assert.match(afterOff, new RegExp(carlinStamp.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(inputFor(afterOff, "toggleMaterialsFromDash('carlin'"), / checked/);
  assert.doesNotMatch(inputFor(afterOff, "toggleReminderFlag('carlin','instrReminderSent'"), / checked/);

  box.toggleReminderFlag('carlin', 'instrReminderSent', true);
  assert.equal(box.preClassChecklistDone(carlin), true);
  assert.match(statusOf(cardFor('carlin')), /data-prep-status="complete"/);
  assert.equal(box.jobDataCache.carlin.materialsSentAt, stamp);

  const sitterStamp = box.jobDataCache.sitter.materialsSentAt;
  box.toggleReminderFlag('sitter', 'classReminderSent', true);
  assert.equal(box.preClassChecklistDone(sitter), true);
  assert.match(statusOf(cardFor('sitter')), /data-prep-status="complete"/);
  assert.equal(box.jobDataCache.sitter.hostReminderSent, false);
  assert.equal(box.jobDataCache.sitter.materialsSentAt, sitterStamp);

  box.toggleReminderFlag('zoom', 'instrFinalRosterSent', true);
  assert.equal(box.preClassChecklistDone(zoom), true);
  assert.match(statusOf(cardFor('zoom')), /data-prep-status="complete"/);
  assert.equal(box.jobDataCache.zoom.materialsSent, true);
  assert.doesNotMatch(cardFor('zoom'), /Put out materials|Put out handbooks/);
});
