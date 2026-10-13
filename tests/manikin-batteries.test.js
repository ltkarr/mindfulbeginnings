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
  Date, String, Number, Math, Object,
  equipment: [],
  matCheckouts: [],
  escapeHtml: null
};
vm.createContext(sandbox);
vm.runInContext(
  [
    extractFunction(admin, 'escapeHtml'),
    extractFunction(admin, 'fmtYMD'),
    extractFunction(admin, 'matAddDays'),
    extractFunction(admin, 'matDaysBetween'),
    extractFunction(admin, 'materialsCheckedStamp'),
    extractFunction(admin, 'coNoEquipment'),
    between('const MAT_NEEDS={', 'function matRegisteredHeadcount'),
    extractFunction(admin, 'matNeedsLabel'),
    between('const PACKING_TOGETHER_DAYS', '// Tracks whether each pre-class reminder')
  ].join('\n'),
  sandbox
);

sandbox.matEqOfKind = function (kind) {
  const names = {
    infant: 'Infant CPR Manikins',
    child: 'Child CPR Manikins',
    adult: 'Adult CPR Manikins',
    av: 'AV Kit'
  };
  return names[kind] ? { name: names[kind] } : null;
};

const TODAY = '2026-10-11';

function sess(partial) {
  return Object.assign({
    id: partial.id,
    course: partial.course,
    date: partial.date,
    time: '9:00 AM',
    location: 'Beth El',
    city: 'Alexandria',
    isVirtual: false,
    isCancelled: false,
    isHold: false,
    ownerTaught: false,
    instructorId: 'bk'
  }, partial);
}

test('manikin courses include the pack item and AV-only courses do not', () => {
  const yes = [
    'Safe Sitter®',
    'Safe Sitter® Babysitting Essentials',
    'SafeSitter @Norwood',
    'Grandparents: Getting Started',
    'Baby Ready + CPR Certification',
    'Baby Ready',
    'Care Ready',
    'Stay Ready: Choking Rescue and CPR',
    'Campus Ready: Safety Skills for College Life',
    'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes'
  ];
  const no = [
    'Safe@Home',
    'Safe@Home — Virtual',
    'All Kids Welcome',
    'Intro to Babysitting',
    'Ready. Period.',
    'Social Ready',
    'Girl Scout Badge Class'
  ];
  yes.forEach(function (course) {
    assert.equal(sandbox.courseUsesManikins(course), true, course);
  });
  no.forEach(function (course) {
    assert.equal(sandbox.courseUsesManikins(course), false, course);
  });
  assert.equal(sandbox.sessionUsesManikins({ id: 'v', course: 'Safe Sitter®', isVirtual: true }), false);
  sandbox.matCheckouts = [{ sessionId: 'none', returnedDate: '', items: [{ noEquipment: true }] }];
  assert.equal(sandbox.sessionUsesManikins({ id: 'none', course: 'Care Ready', isVirtual: false }), false);
  sandbox.matCheckouts = [];
  assert.equal(sandbox.sessionUsesManikins({ id: 'care', course: 'Care Ready', isVirtual: false }), true);

  assert.equal(
    sandbox.matNeedsLabel({ infant: 1, child: 1, av: 1 }),
    '1× Infant CPR Manikins, 1× Child CPR Manikins, 1× AV Kit, Batteries + screwdriver'
  );
  assert.equal(sandbox.matNeedsLabel({ av: 1 }), '1× AV Kit');
  assert.equal(sandbox.matNeedsLabel({ adult: 1, av: 1 }), '1× Adult CPR Manikins, 1× AV Kit, Batteries + screwdriver');
});

test('the packing list and PDF name Batteries + screwdriver only for manikin sessions', () => {
  const instructors = [{ id: 'bk', name: 'Bronwen Kennedy' }];
  const sessions = [
    sess({ id: 'ss', date: '2026-10-18', course: 'Safe Sitter®' }),
    sess({ id: 'home', date: '2026-10-18', course: 'Safe@Home', time: '1:00 PM' }),
    sess({ id: 'intro', date: '2026-10-19', course: 'Intro to Babysitting' }),
    sess({ id: 'baby', date: '2026-10-19', course: 'Baby Ready', time: '2:00 PM' }),
    sess({ id: 'cpr', date: '2026-10-20', course: 'Baby Ready + CPR Certification' }),
    sess({ id: 'zoom', date: '2026-10-20', course: 'Safe Sitter®', isVirtual: true, time: '6:00 PM' })
  ];
  const built = sandbox.packingBuildModel(sessions, instructors, {}, TODAY, 60, []);
  const byId = Object.fromEntries(built.rows.map(function (r) { return [r.id, r]; }));
  assert.equal(byId.ss.manikins, true);
  assert.equal(byId.baby.manikins, true);
  assert.equal(byId.cpr.manikins, true);
  assert.equal(byId.home.manikins, false);
  assert.equal(byId.intro.manikins, false);
  assert.equal(byId.zoom, undefined);
  const screen = sandbox.packingGroupsHtml(built);
  const pdf = sandbox.packingPrintHtml(built, new Date('2026-10-11T15:00:00.000Z'));
  assert.equal((screen.match(/Batteries \+ screwdriver/g) || []).length, 3);
  assert.equal((pdf.match(/Batteries \+ screwdriver/g) || []).length, 3);
  assert.match(screen, /class="pack-kit">Batteries \+ screwdriver/);
  assert.match(extractFunction(admin, 'renderSessionMaterials'), /Batteries \+ screwdriver/);
  assert.match(extractFunction(admin, 'coNeedsHint'), /Batteries \+ screwdriver/);
});
