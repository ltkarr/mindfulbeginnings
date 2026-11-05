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
    'dashChecklistSessions'
  ].map((n) => extractFunction(admin, n)).join('\n'),
  sandbox
);

function sess(id, date, flags) {
  return Object.assign({ id, course: 'Safe Sitter®', date, isHold: false, isCancelled: false, hasHost: true, instructorId: 'i1' }, flags);
}

test('a finished pre-class checklist drops off and the next incomplete class fills in', () => {
  const today = new Date(2026, 8, 26);
  sandbox.jobDataCache = {
    done: { materialsSent: true, instrReminderSent: true, hostReminderSent: true, classReminderSent: true },
    soon: { materialsSent: true, instrReminderSent: false, hostReminderSent: true, classReminderSent: true },
    later: { materialsSent: false }
  };
  const rows = [
    sess('done', '2026-09-27'),
    sess('soon', '2026-09-30'),
    sess('later', '2026-10-20'),
    sess('old', '2026-09-01'),
    sess('hold', '2026-09-28', { isHold: true })
  ];
  const shown = sandbox.dashChecklistSessions(rows, today).map((s) => s.id);
  assert.deepEqual(shown, ['soon']);

  sandbox.jobDataCache.soon.classReminderSent = true;
  sandbox.jobDataCache.soon.instrReminderSent = true;
  const backfill = sandbox.dashChecklistSessions(rows, today).map((s) => s.id);
  assert.deepEqual(backfill, ['later']);

  sandbox.jobDataCache.later = { materialsSent: true, instrReminderSent: true, hostReminderSent: true, classReminderSent: true };
  assert.deepEqual(sandbox.dashChecklistSessions(rows, today), []);
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
  assert.match(admin, /All caught up — no upcoming class still needs checklist work/);
  assert.match(admin, /dashChecklistSessions\(sessions, now\)\.filter\(function\(s\)\{return !preClassChecklistDone\(s\);\}/);
});

test('the pre-class checklist keeps incomplete classes through 14 days, not only 8', () => {
  const today = new Date(2026, 10, 5);
  const open = { materialsSent: false };
  sandbox.jobDataCache = {
    d1: open,
    d8: open,
    d9: open,
    d14: open,
    d15: open
  };
  const rows = [
    sess('d1', '2026-11-06'),
    sess('d8', '2026-11-13'),
    sess('d9', '2026-11-14'),
    sess('d14', '2026-11-19'),
    sess('d15', '2026-11-20')
  ];
  assert.deepEqual(sandbox.dashChecklistSessions(rows, today).map((s) => s.id), ['d1', 'd8', 'd9', 'd14']);

  const done = { materialsSent: true, instrReminderSent: true, hostReminderSent: true, classReminderSent: true };
  sandbox.jobDataCache.d1 = done;
  sandbox.jobDataCache.d8 = done;
  sandbox.jobDataCache.d9 = done;
  sandbox.jobDataCache.d14 = done;
  assert.deepEqual(sandbox.dashChecklistSessions(rows, today).map((s) => s.id), ['d15']);

  const block = admin.slice(admin.indexOf('// ── Pre-class action reminders'), admin.indexOf('// ─── SESSIONS'));
  assert.match(admin, /The reminder window is the next 14 days/);
  assert.match(admin, /If the next 14 days are all done/);
  assert.match(admin, /dayDiff\(s\)<=14/);
  assert.doesNotMatch(admin, /next 8 days/);
  assert.doesNotMatch(admin, /dayDiff\(s\)<=8/);
  assert.match(block, /plan 2 weeks out; reminders due at 1 week &amp; 1 day/);
  assert.match(block, /dayDiff>=6&&dayDiff<=8/);
  assert.match(block, />1 week out</);
  assert.match(block, /Tomorrow · 1 day out/);
  assert.match(block, /dayDiff>=9&&dayDiff<=14/);
  assert.match(block, />2 weeks out</);
  assert.doesNotMatch(block, /reminders due at 1 week &amp; 1 day out/);
  assert.match(block, /printTeachingChecklist\('\$\{s\.id\}'\)/);
});

test('a wall of finished green checklists is removed from the dashboard', () => {
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
  const shown = sandbox.dashChecklistSessions(rows, today).map((s) => s.id);
  assert.deepEqual(shown, ['open']);
  rows.filter((s) => s.id !== 'open').forEach((s) => assert.equal(sandbox.preClassChecklistDone(s), true));
  assert.equal(sandbox.preClassChecklistDone(rows[4]), false);
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
  assert.match(block, /toggleMaterialsFromDash\('\$\{s\.id\}',this\.checked\)/);
  assert.doesNotMatch(block, /if\(!custom&&hasHost\)/);
  assert.doesNotMatch(block, /hostReminderSent/);
  assert.doesNotMatch(block, /Host reminder/);
  assert.doesNotMatch(block, /openHostReminder/);
  assert.match(block, /preClassTaskList\(s\)\.map/);
  assert.match(block, /preClassStudentReminderLabel\(s\)/);
  assert.match(admin, /return \(s&&s\.isCustomJob\)\?'Send reminder to instructor':'Send reminder \+ roster to instructor';/);
  assert.match(admin, /Family reminder — before class/);
  assert.match(block, /openInstructorReminder\('\$\{s\.id\}'\)/);
  assert.match(block, /openClassReminder\('\$\{s\.id\}'\)/);
  assert.match(block, /openInstructorFinalRoster\('\$\{s\.id\}'\)/);
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
  assert.deepEqual(sandbox.dashChecklistSessions([walk, fest], today).map((s) => s.id), ['walk', 'fest']);
  sandbox.jobDataCache.fest = { materialsSent: true, instrReminderSent: true };
  assert.deepEqual(sandbox.dashChecklistSessions([walk, fest], today).map((s) => s.id), ['walk']);

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
  assert.deepEqual(sandbox.dashChecklistSessions([zoom], tomorrow).map((s) => s.id), ['abby']);
  sandbox.jobDataCache.abby.instrFinalRosterSent = true;
  assert.equal(sandbox.preClassChecklistDone(zoom), true);
  assert.deepEqual(sandbox.dashChecklistSessions([zoom], tomorrow), []);

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
  assert.deepEqual(sandbox.dashChecklistSessions([early], tomorrow).map((s) => s.id), ['early-zoom']);
  sandbox.jobDataCache['early-zoom'].instrFinalRosterSent = true;
  assert.deepEqual(sandbox.dashChecklistSessions([early], tomorrow), []);

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
  assert.deepEqual(sandbox.dashChecklistSessions([ready], today), []);

  const noHost = sess('no-host', '2026-09-29', { hasHost: false, instructorId: 'i1' });
  sandbox.jobDataCache['no-host'] = { materialsSent: true, instrReminderSent: true, hostReminderSent: false, classReminderSent: false };
  assert.equal(sandbox.preClassChecklistDone(noHost), false);
  assert.deepEqual(sandbox.dashChecklistSessions([ready, noHost], today).map((s) => s.id), ['no-host']);
});
