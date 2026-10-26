'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

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

function between(startNeedle, endNeedle) {
  const start = admin.indexOf(startNeedle);
  const end = admin.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0 && end > start, startNeedle);
  return admin.slice(start, end);
}

const sandbox = {
  Date, String, Number, Math, Object, escapeHtml: null,
  registrations: [],
  instructors: [{ id: 'hc', name: 'Helena Carboy' }, { id: 'bk', name: 'Bronwen Kennedy' }],
  jobDataCache: {}
};
vm.createContext(sandbox);
vm.runInContext(
  [
    extractFunction(admin, 'escapeHtml'),
    extractFunction(admin, 'fmtYMD'),
    extractFunction(admin, 'matAddDays'),
    extractFunction(admin, 'matDaysBetween'),
    extractFunction(admin, 'materialsCheckedStamp'),
    extractFunction(admin, 'materialsPutOutPhrase'),
    between('const PACKING_TOGETHER_DAYS', '// Tracks whether each pre-class reminder')
  ].join('\n'),
  sandbox
);

const TODAY = '2026-10-13';

function sess(partial) {
  return Object.assign({
    id: partial.id,
    course: partial.course || 'Safe Sitter®',
    date: partial.date,
    time: partial.time || '9:00 AM',
    location: 'Beth El',
    city: 'Alexandria',
    isVirtual: false,
    isCancelled: false,
    isHold: false,
    ownerTaught: false,
    instructorId: partial.instructorId || 'hc'
  }, partial);
}

test('the materials checklist card sits directly above upcoming expenses', () => {
  const dash = admin.slice(admin.indexOf('id="screen-dashboard"'), admin.indexOf('id="screen-requests"'));
  const check = dash.indexOf('id="dash-mat-check"');
  const upcoming = dash.indexOf('id="dash-upcoming"');
  assert.ok(check >= 0 && upcoming > check);
  assert.equal(dash.slice(check, upcoming).indexOf('id="'), 0);
  assert.match(extractFunction(admin, 'renderDashboard'), /renderDashMatChecklist\(now\);\s*renderUpcomingExpenses\(now\);/);
  assert.match(extractFunction(admin, 'renderDashMatChecklist'), /Materials checklist/);
  assert.match(extractFunction(admin, 'renderDashMatChecklist'), /packingKitHtml\(r\)/);
  assert.doesNotMatch(admin, /id="dash-materials"/);
});

test('the checklist is the next 2 weeks of in-person classes that still need a kit, soonest first', () => {
  const realBring = sandbox.packingBringLine;
  const realManikins = sandbox.sessionUsesManikins;
  sandbox.sessionUsesManikins = function (s) { return s.course === 'Care Ready'; };
  sandbox.packingBringLine = function (s, n) {
    if (s.course === 'Safe Sitter®' && n > 0) return 'Bring: ' + n + ' Safe Sitter handbooks, 1 infant manikin';
    if (s.course === 'Intro to Babysitting') return 'Bring: 1 Intro to Babysitting handbook';
    return '';
  };
  sandbox.jobDataCache = { done: { materialsSent: true, materialsOutAt: '2026-10-12T15:00:00.000Z' } };
  sandbox.registrations = [
    { sessionId: 'soon', payStatus: 'paid' },
    { sessionId: 'later', payStatus: 'paid' }
  ];
  const rows = [
    sess({ id: 'later', date: '2026-10-20', time: '1:00 PM', course: 'Safe Sitter®' }),
    sess({ id: 'soon', date: '2026-10-14', time: '4:00 PM', course: 'Safe Sitter®', instructorId: 'bk' }),
    sess({ id: 'early', date: '2026-10-14', time: '9:00 AM', course: 'Intro to Babysitting' }),
    sess({ id: 'done', date: '2026-10-15', course: 'Safe Sitter®' }),
    sess({ id: 'past', date: '2026-10-12', course: 'Safe Sitter®' }),
    sess({ id: 'far', date: '2026-10-28', course: 'Safe Sitter®' }),
    sess({ id: 'zoom', date: '2026-10-16', course: 'Safe Sitter®', isVirtual: true }),
    sess({ id: 'hold', date: '2026-10-16', isHold: true }),
    sess({ id: 'none', date: '2026-10-18', course: 'Ready. Period.' }),
    sess({ id: 'care', date: '2026-10-19', course: 'Care Ready', time: '11:00 AM' })
  ];
  const shown = sandbox.materialsChecklistRows(rows, TODAY);
  assert.deepEqual(shown.map((r) => r.id), ['early', 'soon', 'care', 'later']);
  assert.equal(shown[1].instructor, 'Bronwen Kennedy');
  assert.equal(shown[1].bring, 'Bring: 1 Safe Sitter handbooks, 1 infant manikin');
  assert.equal(shown[2].bring, '');
  assert.equal(shown[2].manikins, true);
  const html = sandbox.packingKitHtml(shown[1]);
  assert.match(html, /class="pack-bring">Bring: 1 Safe Sitter handbooks, 1 infant manikin/);
  if (realManikins) sandbox.sessionUsesManikins = realManikins;
  else delete sandbox.sessionUsesManikins;
  sandbox.packingBringLine = realBring;
});

test('checking the shared box stores materials_out_at and clearing the box clears it', () => {
  const box = { MATERIALS_SENT_AT_COL: true, MATERIALS_OUT_AT_COL: true, BADGE_SUMMARY_COL: true, RED_CROSS_REPORTED_COL: true };
  vm.createContext(box);
  vm.runInContext([extractFunction(admin, 'jobFromDB'), extractFunction(admin, 'jobToDB')].join('\n'), box);
  const sent = box.jobToDB('s1', {
    materialsSent: true,
    materialsSentAt: '2026-10-13T18:04:00.000Z',
    materialsOutAt: '2026-10-13T18:04:00.000Z',
    badgeSummarySent: true,
    redCrossReported: false,
    waitlist: []
  });
  assert.equal(sent.materials_out_at, '2026-10-13T18:04:00.000Z');
  assert.equal(sent.badge_summary_sent, true);
  assert.equal(sent.red_cross_reported, false);
  const back = box.jobFromDB(sent);
  assert.equal(back.materialsOutAt, '2026-10-13T18:04:00.000Z');
  assert.equal(back.badgeSummarySent, true);
  assert.equal(back.redCrossReported, false);
  const cleared = box.jobToDB('s1', {
    materialsSent: false,
    materialsSentAt: '2026-10-13T18:04:00.000Z',
    materialsOutAt: '2026-10-13T18:04:00.000Z',
    waitlist: []
  });
  assert.equal(cleared.materials_out_at, null);
  box.MATERIALS_OUT_AT_COL = false;
  box.BADGE_SUMMARY_COL = false;
  box.RED_CROSS_REPORTED_COL = false;
  const pending = box.jobToDB('s1', {
    materialsSent: true,
    materialsOutAt: '2026-10-13T18:04:00.000Z',
    badgeSummarySent: true,
    redCrossReported: true,
    waitlist: []
  });
  assert.equal(Object.prototype.hasOwnProperty.call(pending, 'materials_out_at'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pending, 'badge_summary_sent'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(pending, 'red_cross_reported'), false);

  const live = { jobDataCache: {}, painted: [], upserts: [] };
  vm.createContext(live);
  live.paintLockboxRow = function (id) { live.painted.push(id); };
  live.upsertJobData = function (id) { live.upserts.push(id); return 'saved'; };
  vm.runInContext(extractFunction(admin, 'setMaterialsSent'), live);
  const before = Date.now();
  live.setMaterialsSent('abc', true);
  assert.equal(live.jobDataCache.abc.materialsSent, true);
  assert.equal(live.jobDataCache.abc.materialsOutAt, live.jobDataCache.abc.materialsSentAt);
  const stamp = Date.parse(live.jobDataCache.abc.materialsOutAt);
  assert.ok(stamp >= before && stamp <= Date.now() + 1000);
  live.setMaterialsSent('abc', false);
  assert.equal(live.jobDataCache.abc.materialsSent, false);
  assert.equal(live.jobDataCache.abc.materialsOutAt, null);
});

test('the put-out date is shown on the session info and the packing list item', () => {
  assert.equal(sandbox.materialsPutOutPhrase('2026-10-13T18:04:00.000Z'), 'Materials put out on Oct 13, 2026');
  assert.equal(sandbox.materialsPutOutPhrase(''), '');
  assert.match(extractFunction(admin, 'lockboxFieldHtml'), /id="lockbox-putout"/);
  assert.match(extractFunction(admin, 'lockboxFieldHtml'), /materialsPutOutPhrase\(jd\.materialsOutAt\)/);
  assert.match(extractFunction(admin, 'openSessionAbout'), /lockboxFieldHtml\(s\)/);
  const row = {
    id: 'sent',
    date: '2026-10-18',
    time: '1:00 PM',
    course: 'Baby Ready',
    place: 'Community Center',
    registered: 2,
    materialsSent: true,
    materialsSentAt: '2026-10-13T18:04:00.000Z',
    materialsOutAt: '2026-10-13T18:04:00.000Z',
    bring: '',
    manikins: false,
    packTogether: false
  };
  const screen = sandbox.packingRowHtml(row);
  const model = { groups: [{ name: 'Helena Carboy', rows: [row] }], busy: [], days: 14, today: TODAY, end: '2026-10-27', rows: [row] };
  const pdf = sandbox.packingPrintHtml(model, new Date('2026-10-13T18:04:00.000Z'));
  assert.match(screen, /Materials put out on Oct 13, 2026/);
  assert.match(pdf, /Materials put out on Oct 13, 2026/);
  assert.match(screen, /Checked Oct 13, 2026/);
});

test('wrap-up reports follow the class, and a troop Safe Sitter class shows both', () => {
  const api = {
    COURSES: {
      "Red Cross Babysitter's Training + Pediatric First Aid/CPR/AED": { requiresLeadTeacher: true, redCross: true },
      'Adult & Pediatric First Aid/CPR/AED Certification': { requiresLeadTeacher: true, redCross: true },
      'Baby Ready': { hours: 5 },
      'Safe Sitter®': { requiresSafeSitter: true }
    }
  };
  vm.createContext(api);
  vm.runInContext(
    [
      extractFunction(admin, 'courseRequiresLeadTeacher'),
      extractFunction(admin, 'isGirlScoutBadgeCourseName'),
      extractFunction(admin, 'wrapReportTasks'),
      extractFunction(admin, 'wrapProgress')
    ].join('\n'),
    api
  );
  api.isInstructorPaymentDone = function () { return true; };
  function labels(s) { return JSON.parse(JSON.stringify(api.wrapReportTasks(s).map((t) => t.label))); }
  function fields(s) { return JSON.parse(JSON.stringify(api.wrapReportTasks(s).map((t) => t.field))); }
  assert.deepEqual(labels({ course: 'Safe Sitter®' }), ['Sent course completion to Safe Sitter rep']);
  assert.deepEqual(labels({ course: 'Safe Sitter® Babysitting Essentials' }), ['Sent course completion to Safe Sitter rep']);
  assert.deepEqual(labels({ course: 'SafeSitter @Norwood' }), ['Sent course completion to Safe Sitter rep']);
  assert.deepEqual(labels({ course: 'Girl Scout Badge Class' }), ['Sent badge summary to host']);
  assert.deepEqual(labels({ course: 'Girl Scouts — First Aid Badge Workshop' }), ['Sent badge summary to host']);
  assert.deepEqual(labels({ course: 'Custom class', code: 'GS-H4782', isCustomJob: true }), ['Sent badge summary to host']);
  assert.deepEqual(labels({ course: 'Babysitting', billToOrg: 'Troop 34182', isCustomJob: true }), ['Sent badge summary to host']);
  assert.deepEqual(fields({ course: "Red Cross Babysitter's Training + Pediatric First Aid/CPR/AED" }), ['redCrossReported']);
  assert.deepEqual(labels({ course: 'Adult & Pediatric First Aid/CPR/AED Certification' }), ['Reported completions to Red Cross']);
  assert.deepEqual(labels({ course: 'Baby Ready' }), []);
  assert.deepEqual(labels({ course: 'Care Ready' }), []);
  assert.deepEqual(labels({ course: 'Grandparents: Getting Started' }), []);
  assert.deepEqual(
    labels({ course: 'Safe Sitter®', code: 'GS-H4782' }),
    ['Sent course completion to Safe Sitter rep', 'Sent badge summary to host']
  );
  assert.deepEqual(
    labels({ course: 'Girl Scouts — Safe Sitter®', isCustomJob: true }),
    ['Sent course completion to Safe Sitter rep', 'Sent badge summary to host']
  );

  // Instructor follow-up and "eval sent to host" are no longer checklist
  // items, so they do not add to the total. Baby Ready is parent letter + pay.
  const baby = api.wrapProgress({ course: 'Baby Ready' }, {
    repNotified: false,
    parentLetterSent: true,
    instrFollowupSent: false,
    evalSentToHost: false
  });
  assert.equal(baby.wrapTotal, 2);
  assert.equal(baby.wrapAllDone, true);
  const stuck = api.wrapProgress({ course: 'Safe Sitter®' }, {
    repNotified: false,
    parentLetterSent: true,
    instrFollowupSent: true,
    evalSentToHost: true
  });
  assert.equal(stuck.wrapTotal, 3);
  assert.equal(stuck.wrapDone, 2);
  assert.equal(stuck.wrapAllDone, false);
  const both = api.wrapProgress({ course: 'Safe Sitter®', code: 'GS-34182' }, {
    repNotified: true,
    badgeSummarySent: false,
    parentLetterSent: true,
    instrFollowupSent: true,
    evalSentToHost: true
  });
  assert.equal(both.wrapTotal, 4);
  assert.equal(both.wrapAllDone, false);
  const red = api.wrapProgress({ course: 'Adult & Pediatric First Aid/CPR/AED Certification' }, {
    repNotified: true,
    redCrossReported: true,
    parentLetterSent: true,
    instrFollowupSent: false,
    evalSentToHost: false
  });
  assert.equal(red.wrapTotal, 3);
  assert.equal(red.wrapAllDone, true);
  assert.match(extractFunction(admin, 'openWrapup'), /wrapReportTasks\(s\)/);
  assert.doesNotMatch(admin, /Sent course completion to SafeSitter rep/);
  assert.match(extractFunction(admin, 'renderSessions'), /wrapProgress\(s,jdi\)/);
  assert.doesNotMatch(extractFunction(admin, 'renderSessions'), /wrapTotal=5/);
});

test('the materials checklist migration adds the three columns and is not applied by the app', () => {
  const sql = fs.readFileSync(path.join(root, 'migrations', '20261013_materials_checklist.sql'), 'utf8');
  assert.match(sql, /alter table public\.job_data\s+add column if not exists materials_out_at timestamptz;/);
  assert.match(sql, /alter table public\.job_data\s+add column if not exists badge_summary_sent boolean not null default false;/);
  assert.match(sql, /alter table public\.job_data\s+add column if not exists red_cross_reported boolean not null default false;/);
  assert.match(sql, /grant select \(materials_out_at\), insert \(materials_out_at\), update \(materials_out_at\)\s+on table public\.job_data to authenticated;/);
  assert.match(sql, /revoke select \(badge_summary_sent\), insert \(badge_summary_sent\), update \(badge_summary_sent\), references \(badge_summary_sent\)/);
  assert.match(admin, /migrations\/20261013_materials_checklist\.sql/);
  assert.doesNotMatch(admin, /supabase\.rpc|apply_migration/);
  const build = fs.readFileSync(path.join(root, 'admin-build.txt'), 'utf8').trim();
  const m = admin.match(/window\.MB_ADMIN_BUILD='([^']+)'/);
  assert.equal(m[1], build);
  assert.equal(build, '20261026-session-views');
});
