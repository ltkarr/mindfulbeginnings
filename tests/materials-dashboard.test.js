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

const names = [
  'fmtYMD', 'matToday', 'matPrevDay', 'coEnd', 'coActiveOn', 'coNoEquipment', 'coUsesExisting',
  'qtyOutOn', 'matPhysicallyOut', 'matReservedAhead', 'matOpenCheckouts'
];
const sandbox = { matCheckouts: [], Date, String, Number };
vm.createContext(sandbox);
vm.runInContext(names.map((n) => extractFunction(admin, n)).join('\n'), sandbox);

function kit(id, extra) {
  return Object.assign({
    id, sessionId: 'sess-' + id, person: 'Helena Carboy',
    items: [{ equipmentId: 'infant', qty: 1 }],
    outDate: '2026-09-20', dueDate: '2026-09-24', returnedDate: null, notes: ''
  }, extra);
}

const planNames = [
  'sessionEndDate', 'sessionInstructorList', 'fmtYMD', 'matToday', 'matPrevDay', 'coEnd', 'coActiveOn',
  'coUsesExisting', 'coNoEquipment', 'qtyOutOn', 'matPhysicallyOut', 'matDateRange', 'minAvailInRange', 'matDaysBetween'
];
const needsStart = admin.indexOf('const MAT_NEEDS={');
const needsEnd = admin.indexOf('function matNeedsLabel(');
if (needsStart < 0 || needsEnd < needsStart) throw new Error('MAT_NEEDS block missing');
const planSandbox = {
  equipment: [],
  matCheckouts: [],
  sessions: [],
  instructors: [],
  jobDataCache: {},
  Date, String, Number, Math, Object
};
vm.createContext(planSandbox);
vm.runInContext(
  planNames.map((n) => extractFunction(admin, n)).join('\n') + '\n' + admin.slice(needsStart, needsEnd),
  planSandbox
);
planSandbox.matToday = () => '2026-09-25';

function shelf() {
  planSandbox.equipment = [
    { id: 'infant', name: 'Infant CPR Manikins', qty: 7 },
    { id: 'child', name: 'Child Manikins', qty: 5 },
    { id: 'av', name: 'AV Kit', qty: 7 }
  ];
  planSandbox.matCheckouts = [];
}

function line(plan, id) {
  return plan.lines.find((l) => l.eqId === id);
}

test('session kit plan reports a free reservation, a purchase shortfall, and reuse', () => {
  shelf();
  const open = planSandbox.matPlanForSession({
    course: 'Safe Sitter®', date: '2026-10-10', person: 'Helena Carboy', extraDates: []
  });
  assert.equal(open.skip, false);
  assert.equal(line(open, 'infant').requested, 1);
  assert.equal(line(open, 'infant').free, 7);
  assert.equal(line(open, 'infant').shortfall, 0);
  assert.equal(open.purchase.length, 0);

  planSandbox.matCheckouts = [{
    id: 'other', person: 'Someone Else', returnedDate: null,
    items: [{ equipmentId: 'infant', qty: 7 }],
    outDate: '2026-10-10', dueDate: '2026-10-10'
  }];
  const short = planSandbox.matPlanForSession({
    course: 'Safe Sitter®', date: '2026-10-10', person: 'Helena Carboy', extraDates: []
  });
  assert.equal(line(short, 'infant').free, 0);
  assert.equal(line(short, 'infant').shortfall, 1);
  assert.equal(short.purchase.length, 1);
  assert.equal(short.purchase[0].name, 'Infant CPR Manikins');
  assert.equal(short.purchase[0].shortfall, 1);
  assert.equal(short.reuseOffer, false);

  planSandbox.matCheckouts = [{
    id: 'held', person: 'Helena Carboy', returnedDate: null,
    items: [
      { equipmentId: 'infant', qty: 1 },
      { equipmentId: 'child', qty: 1 },
      { equipmentId: 'av', qty: 1 }
    ],
    outDate: '2026-10-08', dueDate: '2026-10-12'
  }];
  const held = planSandbox.matPlanForSession({
    course: 'Safe Sitter®', date: '2026-10-10', person: 'Helena Carboy', extraDates: []
  });
  assert.equal(held.reuseOffer, true);
  assert.equal(held.fullyCovered, true);
  const reused = planSandbox.matPlanForSession({
    course: 'Safe Sitter®', date: '2026-10-10', person: 'Helena Carboy', extraDates: [], reuse: true
  });
  assert.equal(line(reused, 'infant').requested, 0);
  assert.equal(reused.purchase.length, 0);
  const reusedItems = planSandbox.matCheckoutItemsFromPlan(reused, true);
  assert.equal(reusedItems.length, 1);
  assert.equal(reusedItems[0].usesExisting, true);
  assert.equal(reusedItems[0].qty, 0);

  planSandbox.matCheckouts[0].items = [{ equipmentId: 'infant', qty: 1 }];
  const partial = planSandbox.matPlanForSession({
    course: 'Safe Sitter®', date: '2026-10-10', person: 'Helena Carboy', extraDates: [], reuse: true
  });
  assert.equal(partial.fullyCovered, false);
  assert.equal(line(partial, 'infant').requested, 0);
  assert.equal(line(partial, 'child').requested, 1);
  const partialItems = planSandbox.matCheckoutItemsFromPlan(partial, true);
  assert.deepEqual(partialItems.map((it) => it.equipmentId).join(','), 'child,av');
  assert.equal(partialItems.some((it) => it.usesExisting), false);
});

test('a following class keeps the durable kit and still reserves new handbooks', () => {
  shelf();
  planSandbox.equipment.push(
    { id: 'ss-book', name: 'Safe Sitter handbooks', qty: 2, consumable: true, reorderAt: 10, reorderQty: 16 },
    { id: 'ss-note', name: 'Safe Sitter notebooks', qty: 20, consumable: true, reorderAt: 10, reorderQty: 16 }
  );
  planSandbox.instructors = [{ id: 'bk', name: 'Bronwen Kennedy' }];
  planSandbox.jobDataCache = {};
  planSandbox.sessions = [
    { id: 'oct3', course: 'Safe Sitter®', date: '2026-10-03', instructorId: 'bk', isVirtual: false, isHold: false, isCancelled: false, extraDates: [] },
    { id: 'oct10', course: 'Safe Sitter®', date: '2026-10-10', instructorId: 'bk', isVirtual: false, isHold: false, isCancelled: false, extraDates: [] }
  ];
  const first = planSandbox.matPlanForSession({
    course: 'Safe Sitter®', date: '2026-10-03', person: 'Bronwen Kennedy', sessionId: 'oct3', extraDates: [], headcount: 6
  });
  assert.equal(first.keep.later.length, 1);
  assert.equal(first.keep.later[0].date, '2026-10-10');
  assert.equal(first.holdUntil, '2026-10-10');
  assert.match(planSandbox.matKeepSentence(first), /KEEP the durable kit/);
  assert.match(planSandbox.matKeepSentence(first), /only need to leave new Safe Sitter handbooks/);
  assert.equal(line(first, 'infant').requested, 1);
  assert.equal(line(first, 'ss-book').requested, 6);
  assert.equal(line(first, 'ss-book').shortfall, 4);
  assert.equal(first.purchase.some((p) => p.name === 'Safe Sitter handbooks' && p.shortfall === 4), true);

  planSandbox.matCheckouts = [{
    id: 'kit', person: 'Bronwen Kennedy', returnedDate: null,
    items: [
      { equipmentId: 'infant', qty: 1 },
      { equipmentId: 'child', qty: 1 },
      { equipmentId: 'av', qty: 1 }
    ],
    outDate: '2026-10-03', dueDate: '2026-10-03'
  }];
  const second = planSandbox.matPlanForSession({
    course: 'Safe Sitter®', date: '2026-10-10', person: 'Bronwen Kennedy', sessionId: 'oct10',
    extraDates: [], headcount: 6, reuse: true
  });
  assert.equal(second.fullyCovered, true);
  assert.equal(line(second, 'infant').requested, 0);
  assert.equal(line(second, 'ss-book').requested, 6);
  assert.match(planSandbox.matKeepSentence(second), /Keep it out/);
  assert.match(planSandbox.matKeepSentence(second), /Only deliver new Safe Sitter handbooks/);
  const saved = planSandbox.matCheckoutItemsFromPlan(second, true);
  assert.equal(saved[0].usesExisting, true);
  assert.equal(saved.some((it) => it.equipmentId === 'ss-book' && it.qty === 6 && it.consumable === true), true);
  assert.equal(saved.some((it) => it.equipmentId === 'infant'), false);
});

test('handbook stock stays consumed after check-in and can raise a reorder alert', () => {
  planSandbox.equipment = [{ id: 'hb', name: 'Safe Sitter handbooks', qty: 10, consumable: true, reorderAt: 10, reorderQty: 16 }];
  planSandbox.matCheckouts = [{
    id: 'used', outDate: '2026-09-01', dueDate: '2026-09-01', returnedDate: '2026-09-01',
    items: [{ equipmentId: 'hb', qty: 4, consumable: true }]
  }];
  assert.equal(planSandbox.qtyOutOn('hb', '2026-09-25'), 4);
  assert.equal(planSandbox.matFreeForDemand(planSandbox.equipment[0]), 6);
  const reorders = planSandbox.matReorderLines();
  assert.equal(reorders.length, 1);
  assert.equal(reorders[0].name, 'Safe Sitter handbooks');
  assert.equal(reorders[0].need, 16);
});

test('on hand ignores future reservations and kits already checked back in today', () => {
  sandbox.matCheckouts = [
    kit('out', { outDate: '2026-09-20', dueDate: '2026-09-30' }),
    kit('ahead', { outDate: '2026-10-02', dueDate: '2026-10-03' }),
    kit('back', { outDate: '2026-09-18', dueDate: '2026-09-25', returnedDate: '2026-09-25' }),
    kit('shared', { items: [{ usesExisting: true, qty: 0 }], outDate: '2026-09-20', dueDate: '2026-09-30' }),
    kit('none', { items: [{ noEquipment: true, qty: 0 }] })
  ];
  const realToday = sandbox.matToday;
  sandbox.matToday = () => '2026-09-25';
  try {
    assert.equal(sandbox.matPhysicallyOut('infant'), 1);
    assert.equal(sandbox.matReservedAhead('infant'), 1);
    const open = sandbox.matOpenCheckouts();
    assert.deepEqual(open.map((c) => c.id), ['out']);
  } finally {
    sandbox.matToday = realToday;
  }
});
