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
  'sessionEndDate', 'fmtYMD', 'matToday', 'matPrevDay', 'coEnd', 'coActiveOn',
  'coUsesExisting', 'coNoEquipment', 'qtyOutOn', 'matDateRange', 'minAvailInRange'
];
const needsStart = admin.indexOf('const MAT_NEEDS={');
const needsEnd = admin.indexOf('function matNeedsLabel(');
if (needsStart < 0 || needsEnd < needsStart) throw new Error('MAT_NEEDS block missing');
const planSandbox = {
  equipment: [],
  matCheckouts: [],
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
