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
    if (src[j] === '{') depth++;
    else if (src[j] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

const RCA = 'Adult & Pediatric First Aid/CPR/AED Certification';
const RCA_ONLINE = 'Adult & Pediatric First Aid/CPR/AED Certification (Online + Classroom)';

function assertKit(needs, expected, label) {
  assert.ok(needs, label);
  Object.keys(expected).forEach(function (k) {
    assert.equal(needs[k], expected[k], label + ' ' + k);
  });
  assert.equal(Object.keys(needs).length, Object.keys(expected).length, label);
}

const needsStart = admin.indexOf('const MAT_NEEDS={');
const needsEnd = admin.indexOf('// How many physical units');
if (needsStart < 0 || needsEnd < needsStart) throw new Error('equipment kit block missing');

const helpers = [
  'sessionEndDate', 'sessionInstructorList', 'fmtYMD', 'matToday', 'matPrevDay', 'matAddDays', 'coEnd',
  'coActiveOn', 'coUsesExisting', 'coNoEquipment', 'matKitIsOutNow', 'matDurableDemand', 'qtyOutOn',
  'matPhysicallyOut', 'matDateRange', 'minAvailInRange', 'matDaysBetween', 'escapeHtml'
];
const sandbox = {
  equipment: [
    { id: 'infant', name: 'Infant CPR Manikins', qty: 4 },
    { id: 'child', name: 'Child Manikins', qty: 4 },
    { id: 'adult', name: 'Adult Manikins', qty: 4 },
    { id: 'av', name: 'AV Kit', qty: 4 }
  ],
  matCheckouts: [],
  sessions: [],
  instructors: [],
  jobDataCache: {},
  Date, String, Number, Math, Object
};
vm.createContext(sandbox);
vm.runInContext(
  helpers.map((n) => extractFunction(admin, n)).join('\n') + '\n' + admin.slice(needsStart, needsEnd),
  sandbox
);
sandbox.matToday = () => '2026-11-02';

const packStart = admin.indexOf('const PACK_BRING_ORDER');
const packEnd = admin.indexOf('function packingKitHtml');
vm.runInContext(admin.slice(packStart, packEnd), sandbox);

function sess(partial) {
  return Object.assign({
    id: 's1',
    course: 'Safe Sitter®',
    code: 'SS-261201',
    date: '2026-12-01',
    isVirtual: false,
    isHold: false,
    isCancelled: false,
    extraDates: []
  }, partial);
}

test('a returned checkout does not cover the session on the equipment badge', () => {
  sandbox.matCheckouts = [];
  const open = sandbox.matSessBadge(sess({ id: 'open' }));
  assert.match(open, /Kit needed/);

  sandbox.matCheckouts = [{ id: 'out', sessionId: 'open', returnedDate: null, items: [{ equipmentId: 'infant', qty: 1 }] }];
  assert.equal(sandbox.matSessBadge(sess({ id: 'open' })), '');

  sandbox.matCheckouts = [{ id: 'back', sessionId: 'open', returnedDate: '2026-11-20', items: [{ equipmentId: 'infant', qty: 1 }] }];
  assert.match(sandbox.matSessBadge(sess({ id: 'open' })), /Kit needed/);

  sandbox.matCheckouts = [
    { id: 'back', sessionId: 'open', returnedDate: '2026-11-20' },
    { id: 'out', sessionId: 'open', returnedDate: null }
  ];
  assert.equal(sandbox.matSessBadge(sess({ id: 'open' })), '');
  assert.equal(sandbox.matSessBadge(sess({ id: 'hold', isHold: true })), '');
  assert.equal(sandbox.matSessBadge(sess({ id: 'cx', isCancelled: true })), '');
});

test('Adult & Pediatric Red Cross classes share one kit on the packing list and the badge', () => {
  const names = [
    RCA,
    RCA_ONLINE,
    'Adult & Pediatric First Aid/CPR/AED Certification (Hybrid)',
    'Adult and Pediatric First Aid — Bethesda'
  ];
  names.forEach(function (course) {
    const needs = sandbox.sessionMatNeeds(sess({ id: 'rc', course: course, code: '' }), 6);
    assertKit(needs, { infant: 1, child: 1, adult: 1, av: 1 }, course);
    assert.equal(sandbox.sessionUsesManikins(sess({ id: 'rc', course: course, code: '' })), true, course);
    assert.match(sandbox.matSessBadge(sess({ id: 'rc', course: course, code: '' })), /Kit needed/);
    const bring = sandbox.packingBringLine(sess({ id: 'rc', course: course, code: '' }), 6);
    assert.match(bring, /1 infant manikin/);
    assert.match(bring, /1 child manikin/);
    assert.match(bring, /1 adult manikin/);
    assert.match(bring, /1 AV kit/);
  });

  const coded = sess({ id: 'code', course: 'Custom class', code: 'RCAH-261212' });
  assertKit(sandbox.sessionMatNeeds(coded, 4), { infant: 1, child: 1, adult: 1, av: 1 }, 'RCAH code');
  assert.equal(sandbox.sessionUsesManikins(coded), true);
  assert.match(sandbox.packingBringLine(coded, 4), /1 adult manikin/);
  assert.match(sandbox.matSessBadge(coded), /Kit needed/);

  assert.equal(sandbox.sessionMatNeeds(sess({ course: 'Adult First Aid/CPR/AED Certification', code: 'RCAF-261101' }), 4), null);
  assert.equal(sandbox.matAliasCourse('Girl Scouts — First Aid Badge Workshop'), '');
  assert.equal(sandbox.sessionMatNeeds(sess({ course: 'Girl Scouts — First Aid Badge Workshop', code: 'GSFA-261103' }), 8), null);
});

test('Care Ready and Baby Ready kits match the manikin courses', () => {
  const care = sandbox.sessionMatNeeds(sess({ course: 'Care Ready', code: 'CRE-261201' }), 6);
  assertKit(care, { infant: 1, child: 1, av: 1 }, 'Care Ready');
  assert.equal(sandbox.courseUsesManikins('Care Ready'), true);
  assert.equal(sandbox.courseUsesManikins('Care Ready — Bethesda'), true);
  assert.match(sandbox.packingBringLine(sess({ course: 'Care Ready' }), 6), /1 infant manikin, 1 child manikin/);
  assert.match(sandbox.matSessBadge(sess({ id: 'care', course: 'Care Ready' })), /Kit needed/);

  const baby = sandbox.sessionMatNeeds(sess({ course: 'Baby Ready', code: 'BR-261201' }), 4);
  assertKit(baby, { infant: 1, av: 1 }, 'Baby Ready');
  assert.equal(sandbox.courseUsesManikins('Baby Ready'), true);
  assert.match(sandbox.packingBringLine(sess({ course: 'Baby Ready' }), 4), /1 infant manikin/);
  assert.doesNotMatch(sandbox.packingBringLine(sess({ course: 'Baby Ready' }), 4), /child manikin/);

  const plus = sandbox.sessionMatNeeds(sess({ course: 'Baby Ready CPR workshop', code: '' }), 4);
  assert.equal(plus.child, 1);
  assert.equal(sandbox.matAliasCourse('Baby Ready CPR workshop'), 'Baby Ready + CPR Certification');
});

test('more than 8 students, aliases, and the week-before buffer stay in the kit plan', () => {
  const big = sandbox.sessionMatNeeds(sess({ course: RCA_ONLINE, code: 'RCAH-261201' }), 9);
  assert.equal(big.infant, 2);
  assert.equal(big.child, 2);
  assert.equal(big.adult, 1);
  assert.equal(big.av, 1);
  const careBig = sandbox.sessionMatNeeds(sess({ course: 'Care Ready' }), 9);
  assert.equal(careBig.infant, 2);
  assert.equal(careBig.child, 2);
  assert.match(sandbox.packingBringLine(sess({ course: RCA, code: 'RCA-1' }), 9), /2 infant manikins, 2 child manikins, 1 adult manikin/);

  const eight = sandbox.matNeedsForHeadcount({ infant: 1, child: 1, av: 1 }, 8);
  assert.equal(eight.infant, 1);
  assert.equal(eight.child, 1);

  const s = sess({ date: '2026-12-15' });
  assert.equal(sandbox.matKitOutDate(s), '2026-12-08');
  assert.equal(sandbox.matKitDueDate(s), '2026-12-22');
  assert.match(admin, /const MAT_KIT_BUFFER_DAYS=7/);
  assert.match(admin, /const MAT_LARGE_CLASS=8/);
  assert.match(admin, /!c\.returnedDate/);
  const plan = sandbox.matPlanForSession({ course: 'Safe Sitter®', date: '2026-12-15', extraDates: [], headcount: 9 });
  assert.equal(plan.outDate, '2026-12-08');
  assert.equal(plan.dueDate, '2026-12-22');
  assert.equal(plan.largeKit, true);
});
