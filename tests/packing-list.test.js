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
  Date, String, Number, Math, Object, escapeHtml: null
};
vm.createContext(sandbox);
vm.runInContext(
  [
    extractFunction(admin, 'escapeHtml'),
    extractFunction(admin, 'fmtYMD'),
    extractFunction(admin, 'matAddDays'),
    extractFunction(admin, 'matDaysBetween'),
    extractFunction(admin, 'materialsCheckedStamp'),
    between('const PACKING_TOGETHER_DAYS', '// Tracks whether each pre-class reminder')
  ].join('\n'),
  sandbox
);

const TODAY = '2026-10-11';

function sess(partial) {
  return Object.assign({
    id: partial.id,
    course: partial.course || 'Safe Sitter®',
    date: partial.date,
    time: partial.time || '9:00 AM',
    location: partial.location || 'Beth El',
    city: partial.city || 'Alexandria',
    isVirtual: false,
    isCancelled: false,
    isHold: false,
    ownerTaught: false,
    instructorId: partial.instructorId || null
  }, partial);
}

const instructors = [
  { id: 'bk', name: 'Bronwen Kennedy' },
  { id: 'hc', name: 'Helena Carboy' }
];

function model(extra, days) {
  return sandbox.packingBuildModel(extra.sessions, instructors, extra.jobData || {}, TODAY, days == null ? 60 : days);
}

function ids(rows) {
  return Array.from(rows, (r) => String(r.id));
}

test('range defaults to 60 days and only accepts 2 weeks, 30, 60, and 90', () => {
  assert.match(admin, /let packingRangeDays=60;/);
  assert.equal(sandbox.packingRangeDaysValue('14'), 14);
  assert.equal(sandbox.packingRangeDaysValue(30), 30);
  assert.equal(sandbox.packingRangeDaysValue('60'), 60);
  assert.equal(sandbox.packingRangeDaysValue('90'), 90);
  assert.equal(sandbox.packingRangeDaysValue('45'), 60);
  assert.equal(sandbox.packingRangeDaysValue(''), 60);
  assert.equal(sandbox.packingRangeLabel(14), 'Next 2 weeks');
  assert.equal(sandbox.packingRangeLabel(60), 'Next 60 days');
});

test('upcoming in-person sessions stay, and virtual, cancelled, hold, undated, and out-of-range sessions drop', () => {
  const sessions = [
    sess({ id: 'today', date: '2026-10-11', instructorId: 'bk' }),
    sess({ id: 'edge', date: '2026-12-10', instructorId: 'bk' }),
    sess({ id: 'past', date: '2026-10-10', instructorId: 'bk' }),
    sess({ id: 'later', date: '2026-12-11', instructorId: 'bk' }),
    sess({ id: 'virt', date: '2026-10-15', isVirtual: true, instructorId: 'bk' }),
    sess({ id: 'cx', date: '2026-10-16', isCancelled: true, instructorId: 'bk' }),
    sess({ id: 'hold', date: '2026-10-17', isHold: true, instructorId: 'bk' }),
    sess({ id: 'nodate', date: '', instructorId: 'bk' }),
    sess({ id: 'bad', date: 'October 12', instructorId: 'bk' })
  ];
  const built = model({ sessions }, 60);
  assert.deepEqual(ids(built.rows), ['today', 'edge']);
  assert.equal(built.end, '2026-12-10');
  const twoWeeks = model({ sessions }, 14);
  assert.deepEqual(ids(twoWeeks.rows), ['today']);
  assert.equal(twoWeeks.end, '2026-10-25');
});

test('groups owner-taught as Lindsay (owner), names the instructor, and leaves unassigned last', () => {
  const sessions = [
    sess({ id: 'open', date: '2026-10-18', instructorId: null, course: 'Intro to Babysitting', time: '10:00 AM' }),
    sess({ id: 'owner', date: '2026-10-18', ownerTaught: true, instructorId: 'bk', course: 'Baby Ready', time: '1:00 PM', location: 'Community Center', city: 'Fairfax' }),
    sess({ id: 'helena', date: '2026-10-12', instructorId: 'hc', course: 'Safe@Home', time: '4:00 PM' }),
    sess({ id: 'claimed', date: '2026-10-13', instructorId: null, course: 'Care Ready', time: '9:00 AM' }),
    sess({ id: 'gone', date: '2026-10-14', instructorId: 'missing', course: 'Steady and Ready' })
  ];
  const built = model({
    sessions,
    jobData: { claimed: { instructorId: 'hc', materialsSent: false } }
  }, 60);
  assert.deepEqual(built.groups.map((g) => g.name), [
    'Helena Carboy',
    'Lindsay (owner)',
    'Instructor not on the roster',
    'Needs an instructor'
  ]);
  const helena = built.groups.find((g) => g.name === 'Helena Carboy');
  assert.deepEqual(ids(helena.rows), ['helena', 'claimed']);
  const owner = built.groups.find((g) => g.name === 'Lindsay (owner)');
  assert.deepEqual(ids(owner.rows), ['owner']);
  assert.equal(owner.rows[0].place, 'Community Center, Fairfax');
  const none = built.groups[built.groups.length - 1];
  assert.equal(none.name, 'Needs an instructor');
  assert.deepEqual(ids(none.rows), ['open']);
});

test('a class within 8 days of another for the same instructor is marked pack together', () => {
  const sessions = [
    sess({ id: 'a', date: '2026-10-11', instructorId: 'bk', time: '1:00 PM' }),
    sess({ id: 'b', date: '2026-10-19', instructorId: 'bk', time: '9:00 AM' }),
    sess({ id: 'c', date: '2026-10-28', instructorId: 'bk', time: '9:00 AM' }),
    sess({ id: 'other', date: '2026-10-12', instructorId: 'hc', time: '9:00 AM' })
  ];
  const built = model({ sessions }, 60);
  const bronwen = built.groups.find((g) => g.name === 'Bronwen Kennedy');
  const byId = Object.fromEntries(bronwen.rows.map((r) => [r.id, r]));
  assert.equal(byId.a.packTogether, true);
  assert.equal(byId.b.packTogether, true);
  assert.equal(byId.c.packTogether, false);
  assert.deepEqual(ids(bronwen.rows), ['a', 'b', 'c']);
  const helena = built.groups.find((g) => g.name === 'Helena Carboy');
  assert.equal(helena.rows[0].packTogether, false);
  assert.equal(sandbox.Math.abs(sandbox.matDaysBetween('2026-10-11', '2026-10-19')), 8);
  assert.equal(sandbox.matDaysBetween('2026-10-19', '2026-10-28'), 9);
});

test('busy days are dates with 3 or more in-person sessions, counted by course', () => {
  const sessions = [
    sess({ id: 's1', date: '2026-10-18', instructorId: 'bk', course: 'Safe Sitter®' }),
    sess({ id: 's2', date: '2026-10-18', instructorId: 'hc', course: 'Safe Sitter®', time: '11:00 AM' }),
    sess({ id: 's3', date: '2026-10-18', instructorId: null, course: 'Baby Ready', time: '2:00 PM' }),
    sess({ id: 'virt', date: '2026-10-18', isVirtual: true, course: 'Safe@Home — Virtual', time: '6:00 PM' }),
    sess({ id: 'pair1', date: '2026-10-20', instructorId: 'bk', course: 'Care Ready' }),
    sess({ id: 'pair2', date: '2026-10-20', instructorId: 'hc', course: 'Care Ready', time: '1:00 PM' })
  ];
  const built = model({ sessions }, 60);
  assert.equal(built.busy.length, 1);
  assert.equal(built.busy[0].date, '2026-10-18');
  assert.equal(built.busy[0].total, 3);
  assert.deepEqual(JSON.parse(JSON.stringify(built.busy[0].courses)), [
    { course: 'Safe Sitter®', count: 2 },
    { course: 'Baby Ready', count: 1 }
  ]);
  assert.equal(sandbox.packingCourseCountText(built.busy[0].courses), 'Safe Sitter® (2), Baby Ready (1)');
});

test('the list and the PDF show the lock-box status and escape class names', () => {
  const sessions = [
    sess({
      id: 'sent',
      date: '2026-10-18',
      ownerTaught: true,
      course: 'Baby Ready',
      time: '1:00 PM'
    }),
    sess({
      id: 'open',
      date: '2026-10-12',
      instructorId: 'hc',
      course: '<img src=x onerror=alert(1)>',
      location: 'Temple Rodef Shalom',
      city: 'Falls Church'
    })
  ];
  const built = model({
    sessions,
    jobData: { sent: { materialsSent: true, materialsSentAt: '2026-10-10T14:30:00.000Z' } }
  }, 60);
  const screen = sandbox.packingGroupsHtml(built);
  const pdf = sandbox.packingPrintHtml(built, new Date('2026-10-11T15:00:00.000Z'));
  assert.match(screen, /Materials in lock box/);
  assert.match(screen, /data-sess="sent" checked/);
  assert.match(screen, /Not checked yet/);
  assert.match(screen, /Checked Oct 10, 2026/);
  assert.match(screen, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(screen, /<img src=x/);
  assert.match(pdf, /Mindful Beginnings/);
  assert.match(pdf, /Generated October 11, 2026/);
  assert.match(pdf, /<h2>Lindsay \(owner\)<\/h2>/);
  assert.match(pdf, /<h2>Helena Carboy<\/h2>/);
  assert.match(pdf, /Materials in lock box/);
  assert.match(pdf, /Checked Oct 10, 2026/);
  assert.match(pdf, /Not checked yet/);
  assert.match(pdf, /&lt;img/);
  assert.equal((pdf.match(/<h2>/g) || []).length >= 2, true);
});

test('checking the packing list writes the same materials_sent flag as the dashboard', () => {
  const box = {
    checked: true,
    getAttribute(name) { return name === 'data-sess' ? 'abc' : null; }
  };
  sandbox.sessions = [{ id: 'abc', isCustomJob: false, course: 'Safe Sitter®' }];
  sandbox.jobDataCache = {};
  sandbox.painted = [];
  sandbox.upserts = [];
  sandbox.toasts = [];
  sandbox.rendered = 0;
  sandbox.paintLockboxRow = function (id) { sandbox.painted.push(id); };
  sandbox.upsertJobData = function (id) { sandbox.upserts.push(id); return 'saved'; };
  sandbox.showToast = function (msg) { sandbox.toasts.push(msg); };
  sandbox.renderPackingList = function () { sandbox.rendered += 1; };
  vm.runInContext(extractFunction(admin, 'setMaterialsSent'), sandbox);
  const before = Date.now();
  sandbox.toggleMaterialsFromPacking(box);
  assert.equal(sandbox.jobDataCache.abc.materialsSent, true);
  const stamp = Date.parse(sandbox.jobDataCache.abc.materialsSentAt);
  assert.ok(stamp >= before && stamp <= Date.now() + 1000);
  assert.deepEqual(sandbox.upserts, ['abc']);
  assert.deepEqual(sandbox.painted, ['abc']);
  assert.equal(sandbox.rendered, 1);
  assert.match(sandbox.toasts[0], /lock box/);
  assert.match(extractFunction(admin, 'toggleMaterialsFromDash'), /setMaterialsSent\(sessId,checked\)/);
  assert.match(extractFunction(admin, 'toggleMaterialsFromPacking'), /setMaterialsSent\(sessId, checked\)/);
});

test('the packing tab is added without removing the other screens', () => {
  const labels = [...admin.matchAll(/<span class="nav-label">([^<]+)<\/span>/g)].map((m) => m[1]);
  assert.deepEqual(labels, [
    'Dashboard',
    'Sessions',
    'Packing list',
    'Class requests',
    'Registrations',
    'Finances',
    'Instructors',
    'Liaisons',
    'Partnerships',
    'Equipment',
    'Reports',
    'Narrow the menu',
    'Sign out'
  ]);
  for (const id of ['dashboard', 'sessions', 'requests', 'registrations', 'finances', 'instructors', 'partners', 'orgpartners', 'materials', 'reports', 'packing']) {
    assert.match(admin, new RegExp('id="screen-' + id + '"'));
  }
  assert.match(admin, /id="pack-range"/);
  assert.match(admin, /Next 2 weeks/);
  assert.match(admin, /value="60" selected/);
  assert.match(admin, /Download PDF/);
  assert.match(admin, /onclick="downloadPackingPdf\(\)"/);
  assert.match(extractFunction(admin, 'showScreen'), /if\(name==='packing'\)renderPackingList\(\)/);
  assert.match(extractFunction(admin, 'rerenderActiveScreen'), /else if\(name==='packing'\)renderPackingList\(\)/);
  assert.match(extractFunction(admin, 'downloadPackingPdf'), /window\.print\(\)/);
  assert.match(extractFunction(admin, 'downloadPackingPdf'), /pack-printing/);
  const printCss = admin.slice(admin.indexOf('@media print{'), admin.indexOf('</style>'));
  assert.match(printCss, /body\.pack-printing #screen-packing\{display:block !important\}/);
  assert.match(printCss, /body\.pack-printing \.screen:not\(#screen-packing\)/);
  assert.match(printCss, /body\.pack-printing > div\{display:none !important\}/);
  assert.match(printCss, /body\.pack-printing \.sidebar\{display:none !important/);
  assert.match(admin, /@media\(max-width:768px\)\{\s*#screen-packing \.pack-actions\{width:100%\}/);
  assert.match(admin, /\.pack-row\{display:grid/);
  assert.doesNotMatch(printCss, /body:not\(\.pack-printing\) \.sidebar\{display:none/);
});
