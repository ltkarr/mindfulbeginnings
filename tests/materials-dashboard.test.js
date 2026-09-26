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
  'matEqIsConsumable', 'matItemIsConsumable', 'matDurableDemand', 'qtyOutOn', 'matPhysicallyOut', 'matReservedAhead', 'matKitIsOutNow', 'matOpenCheckouts'
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
  'coUsesExisting', 'coNoEquipment', 'matDurableDemand', 'qtyOutOn', 'matPhysicallyOut', 'matDateRange', 'minAvailInRange', 'matDaysBetween'
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
  assert.doesNotMatch(planSandbox.matKeepSentence(first), /handbook/i);
  assert.equal(line(first, 'infant').requested, 1);
  assert.equal(line(first, 'ss-book'), undefined);
  assert.equal(first.lines.every((l) => !l.consumable), true);
  const hb = first.books.find((b) => b.eqId === 'ss-book');
  assert.equal(hb.requested, 6);
  assert.equal(hb.shortfall, 4);
  assert.equal(first.purchase.some((p) => p.name === 'Safe Sitter handbooks'), false);
  assert.equal(first.bookBuy.some((p) => p.name === 'Safe Sitter handbooks' && p.shortfall === 4), true);
  assert.equal(planSandbox.matBookBuySentence(first), 'Buy 4 more Safe Sitter handbooks.');

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
  assert.equal(second.books.find((b) => b.eqId === 'ss-book').requested, 6);
  assert.match(planSandbox.matKeepSentence(second), /Keep it out/);
  assert.doesNotMatch(planSandbox.matKeepSentence(second), /handbook/i);
  const saved = planSandbox.matCheckoutItemsFromPlan(second, true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].usesExisting, true);
  assert.equal(saved.some((it) => it.consumable || it.equipmentId === 'ss-book'), false);
  assert.equal(saved.some((it) => it.equipmentId === 'infant'), false);
});

function useRoster() {
  planSandbox.COURSES = {
    'Safe Sitter®': { maxStudents: 10 },
    'Safe@Home': { maxStudents: 8 },
    'Grandparents: Getting Started': { maxStudents: 12 }
  };
  planSandbox.registrations = [];
  planSandbox.sessionMaxStudents = function (s) {
    if (s && s.maxStudentsOverride && Number(s.maxStudentsOverride) > 0) return Number(s.maxStudentsOverride);
    return (planSandbox.COURSES[s.course] || { maxStudents: 8 }).maxStudents;
  };
  planSandbox.seatsOnSession = function (id) {
    return planSandbox.registrations.filter((r) => r.sessionId === id && r.payStatus !== 'cancelled' && r.payStatus !== 'waitlist').length;
  };
}

test('handbook stock follows the roster and stays given out after a kit is checked in', () => {
  useRoster();
  planSandbox.equipment = [
    { id: 'hb', name: 'Safe Sitter handbooks', qty: 20, consumable: true, reorderAt: 10, reorderQty: 16 },
    { id: 'note', name: 'Safe Sitter notebooks', qty: 20, consumable: true, reorderAt: 10, reorderQty: 16 },
    { id: 'sah', name: 'Safe@Home handbooks', qty: 20, consumable: true, reorderAt: 10, reorderQty: 16 },
    { id: 'gp', name: 'Grandparents handbooks', qty: 20, consumable: true, reorderAt: 10, reorderQty: 16 }
  ];
  planSandbox.matCheckouts = [];
  planSandbox.sessions = [{ id: 'oct', course: 'Safe Sitter®', date: '2026-10-10', isVirtual: false }];
  planSandbox.registrations = [];
  assert.equal(planSandbox.matBookCommitted('hb', null, 'ahead'), 10);
  assert.equal(planSandbox.matBookCommitted('note', null, 'ahead'), 10);
  assert.equal(planSandbox.matBookCommitted('sah', null, 'all'), 0);

  planSandbox.registrations = [
    { sessionId: 'oct', payStatus: 'paid' },
    { sessionId: 'oct', payStatus: 'unpaid' },
    { sessionId: 'oct', payStatus: 'pending' },
    { sessionId: 'oct', payStatus: 'host' },
    { sessionId: 'oct', payStatus: 'waitlist' }
  ];
  assert.equal(planSandbox.matBookCommitted('hb', null, 'all'), 4);

  planSandbox.registrations[3].payStatus = 'cancelled';
  assert.equal(planSandbox.matBookCommitted('hb', null, 'all'), 3);
  assert.equal(planSandbox.matBookCommitted('note', null, 'all'), 3);

  planSandbox.sessions.push({ id: 'old', course: 'Safe Sitter®', date: '2026-09-01', isVirtual: false });
  planSandbox.registrations.push({ sessionId: 'old', payStatus: 'paid' }, { sessionId: 'old', payStatus: 'paid' });
  assert.equal(planSandbox.matBookCommitted('hb', null, 'all'), 3);

  planSandbox.sessions = [{ id: 'today', course: 'Safe Sitter®', date: '2026-09-25', isVirtual: false }];
  planSandbox.registrations = [
    { sessionId: 'today', payStatus: 'paid' },
    { sessionId: 'today', payStatus: 'paid' },
    { sessionId: 'today', payStatus: 'paid' },
    { sessionId: 'today', payStatus: 'paid' }
  ];
  planSandbox.matCheckouts = [{
    id: 'kit', outDate: '2026-09-25', dueDate: '2026-09-25', returnedDate: '2026-09-25',
    items: [{ equipmentId: 'infant', qty: 1 }]
  }];
  assert.equal(planSandbox.matPhysicallyOut('hb'), 4);
  assert.equal(planSandbox.qtyOutOn('hb', '2026-09-25'), 0);
  assert.equal(planSandbox.matFreeForDemand(planSandbox.equipment[0]), 16);
  planSandbox.equipment[0].qty = 10;
  const reorders = planSandbox.matReorderLines();
  assert.equal(reorders.length, 1);
  assert.equal(reorders[0].name, 'Safe Sitter handbooks');
  assert.equal(reorders[0].need, 16);
  assert.equal(reorders[0].onHand, 6);
});

test('a class buy-more note names the shortfall and does not block a durable-only checkout', () => {
  useRoster();
  planSandbox.equipment = [
    { id: 'infant', name: 'Infant CPR Manikins', qty: 5 },
    { id: 'child', name: 'Child Manikins', qty: 5 },
    { id: 'av', name: 'AV Kit', qty: 7 },
    { id: 'hb', name: 'Safe Sitter handbooks', qty: 20, consumable: true, reorderAt: 10, reorderQty: 16 },
    { id: 'note', name: 'Safe Sitter notebooks', qty: 4, consumable: true, reorderAt: 10, reorderQty: 16 },
    { id: 'sah', name: 'Safe@Home handbooks', qty: 3, consumable: true, reorderAt: 10, reorderQty: 16 },
    { id: 'gp', name: 'Grandparents handbooks', qty: 20, consumable: true, reorderAt: 10, reorderQty: 16 }
  ];
  planSandbox.matCheckouts = [];
  planSandbox.sessions = [
    { id: 'oct3', course: 'Safe Sitter®', date: '2026-10-03', isVirtual: false },
    { id: 'home', course: 'Safe@Home', date: '2026-10-08', isVirtual: false },
    { id: 'gp', course: 'Grandparents: Getting Started', date: '2026-10-09', isVirtual: false }
  ];
  planSandbox.registrations = [
    { sessionId: 'oct3', payStatus: 'paid' },
    { sessionId: 'oct3', payStatus: 'paid' },
    { sessionId: 'oct3', payStatus: 'paid' },
    { sessionId: 'oct3', payStatus: 'paid' },
    { sessionId: 'oct3', payStatus: 'paid' },
    { sessionId: 'oct3', payStatus: 'paid' }
  ];
  const plan = planSandbox.matPlanForSession({
    course: 'Safe Sitter®', date: '2026-10-03', person: 'Bronwen Kennedy', sessionId: 'oct3', extraDates: [], headcount: 6
  });
  assert.equal(plan.lines.map((l) => l.eqId).join(','), 'infant,child,av');
  assert.equal(plan.books.find((b) => b.eqId === 'hb').requested, 6);
  assert.equal(plan.books.find((b) => b.eqId === 'hb').shortfall, 0);
  assert.equal(plan.books.find((b) => b.eqId === 'note').shortfall, 2);
  assert.equal(planSandbox.matBookBuySentence(plan), 'Buy 2 more Safe Sitter notebooks.');
  const items = planSandbox.matCheckoutItemsFromPlan(plan, false);
  assert.equal(items.some((it) => it.consumable || it.equipmentId === 'hb' || it.equipmentId === 'note'), false);

  const home = planSandbox.matPlanForSession({
    course: 'Safe@Home', date: '2026-10-08', sessionId: 'home', extraDates: [], headcount: 8
  });
  assert.equal(home.books.length, 1);
  assert.equal(home.books[0].name, 'Safe@Home handbooks');
  assert.equal(home.books[0].shortfall, 5);
  assert.equal(planSandbox.matBookBuySentence(home), 'Buy 5 more Safe@Home handbooks.');

  planSandbox.registrations.push(
    { sessionId: 'gp', payStatus: 'paid' },
    { sessionId: 'gp', payStatus: 'cancelled' }
  );
  assert.equal(planSandbox.matBookCommitted('gp', null, 'all'), 1);
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

test('a future kit stays off Who has what until the out date is today or earlier', () => {
  const realToday = sandbox.matToday;
  sandbox.matToday = () => '2026-09-26';
  sandbox.matCheckouts = [
    kit('bronwen-oct3', { person: 'Bronwen Kennedy', outDate: '2026-10-03', dueDate: '2026-10-03' })
  ];
  try {
    assert.equal(sandbox.matKitIsOutNow(sandbox.matCheckouts[0]), false);
    assert.deepEqual(sandbox.matOpenCheckouts().map((c) => c.id), []);
    sandbox.matCheckouts[0].outDate = '2026-09-26';
    assert.equal(sandbox.matKitIsOutNow(sandbox.matCheckouts[0]), true);
    assert.deepEqual(sandbox.matOpenCheckouts().map((c) => c.id), ['bronwen-oct3']);
  } finally {
    sandbox.matToday = realToday;
  }
});

test('the equipment screen has no checkout calendar', () => {
  assert.doesNotMatch(admin, /Checkout calendar/);
  assert.doesNotMatch(admin, /id="mat-cal"/);
  assert.doesNotMatch(admin, /function renderMatCal/);
  assert.match(admin, /Who has what right now/);
  assert.match(admin, /id="mat-holders"/);
  assert.match(admin, /id="mat-table"/);
  assert.match(admin, /function markOutToday/);
  assert.match(admin, /Mark out today/);
  assert.match(admin, /function matKitIsOutNow/);
});

test('the same instructor’s overlapping kits count as one physical unit', () => {
  const realToday = sandbox.matToday;
  sandbox.matToday = () => '2026-09-25';
  sandbox.matCheckouts = [
    kit('kim-a', { person: 'Kim Varner', outDate: '2026-09-20', dueDate: '2026-10-04' }),
    kit('kim-b', { person: 'Kim Varner', sessionId: 'sess-b', outDate: '2026-09-22', dueDate: '2026-09-28' }),
    kit('bronwen', { person: 'Bronwen Kennedy', sessionId: 'sess-c', outDate: '2026-09-21', dueDate: '2026-09-29' }),
    kit('kim-later', { person: 'Kim Varner', sessionId: 'sess-d', outDate: '2026-10-08', dueDate: '2026-10-10' }),
    kit('kim-later-2', { person: 'Kim Varner', sessionId: 'sess-e', outDate: '2026-10-12', dueDate: '2026-10-14' })
  ];
  try {
    assert.equal(sandbox.qtyOutOn('infant', '2026-09-25'), 2);
    assert.equal(sandbox.matPhysicallyOut('infant'), 2);
    assert.equal(sandbox.matReservedAhead('infant'), 1);
  } finally {
    sandbox.matToday = realToday;
  }
});

test('Intro to Babysitting reserves its handbooks, and Safe Sitter-like titles map to a kit', () => {
  useRoster();
  planSandbox.equipment = [
    { id: 'infant', name: 'Infant CPR Manikins', qty: 7 },
    { id: 'child', name: 'Child Manikins', qty: 5 },
    { id: 'av', name: 'AV Kit', qty: 7 },
    { id: '11111111-1111-4111-8111-111111111105', name: 'Intro to Babysitting handbooks', qty: 66, consumable: true, reorderAt: 10, reorderQty: 16 },
    { id: 'hb', name: 'Safe Sitter handbooks', qty: 40, consumable: true },
    { id: 'note', name: 'Safe Sitter notebooks', qty: 40, consumable: true },
    { id: 'sah', name: 'Safe@Home handbooks', qty: 40, consumable: true }
  ];
  planSandbox.matCheckouts = [];
  planSandbox.registrations = [];
  planSandbox.sessions = [
    { id: 'itb', course: 'Intro to Babysitting — Greenwood', date: '2026-10-16', isVirtual: false },
    { id: 'club', course: 'My First Babysitters Club', date: '2026-10-16', isVirtual: false },
    { id: 'welcome', course: 'Service Unit Welcome Event', date: '2026-10-16', isVirtual: false }
  ];
  planSandbox.registrations = [
    { sessionId: 'itb', payStatus: 'paid' },
    { sessionId: 'itb', payStatus: 'pending' },
    { sessionId: 'itb', payStatus: 'waitlist' },
    { sessionId: 'club', payStatus: 'paid' },
    { sessionId: 'welcome', payStatus: 'paid' }
  ];
  const intro = planSandbox.matPlanForSession({
    course: 'Intro to Babysitting — Greenwood', date: '2026-10-16', sessionId: 'itb', extraDates: [], headcount: 2
  });
  assert.equal(intro.skip, false);
  assert.equal(intro.lines.length, 0);
  assert.equal(intro.books.length, 1);
  assert.equal(intro.books[0].name, 'Intro to Babysitting handbooks');
  assert.equal(intro.books[0].requested, 2);
  assert.equal(planSandbox.matBookCommitted('11111111-1111-4111-8111-111111111105', null, 'all'), 2);

  const club = planSandbox.matPlanForSession({
    course: 'My First Babysitters Club', date: '2026-10-16', sessionId: 'club', extraDates: [], headcount: 8
  });
  assert.equal(club.skip, true);
  const welcome = planSandbox.matPlanForSession({
    course: 'Service Unit Welcome Event', date: '2026-10-16', sessionId: 'welcome', extraDates: [], headcount: 8
  });
  assert.equal(welcome.skip, true);
  const instructorsOnly = planSandbox.matPlanForSession({
    course: 'Babysitting Course *8 Week Series, in person* Safe Sitter instructors only',
    date: '2026-10-16', extraDates: [], headcount: 8
  });
  assert.equal(instructorsOnly.skip, true);

  const norwood = planSandbox.matPlanForSession({
    course: 'SafeSitter @Norwood School (after school program)', date: '2026-10-20', extraDates: [], headcount: 4
  });
  assert.equal(norwood.lines.map((l) => l.kind).join(','), 'infant,child,av');
  assert.equal(norwood.books.some((b) => b.eqId === 'hb'), true);
  assert.equal(norwood.books.some((b) => b.kind === 'ssNotebook'), true);

  const home = planSandbox.matPlanForSession({
    course: 'Safe@Home at Beth El', date: '2026-10-16', extraDates: [], headcount: 3
  });
  assert.equal(home.lines.map((l) => l.kind).join(','), 'av');
  assert.equal(home.books.length, 1);
  assert.equal(home.books[0].name, 'Safe@Home handbooks');
  assert.equal(home.lines.some((l) => l.kind === 'infant' || l.kind === 'child'), false);
});

test('a nearby class for the same instructor keeps the kit already out', () => {
  shelf();
  planSandbox.matCheckouts = [{
    id: 'home-kit', person: 'Kim Varner', returnedDate: null,
    items: [
      { equipmentId: 'av', qty: 1 }
    ],
    outDate: '2026-10-01', dueDate: '2026-10-03'
  }];
  const plan = planSandbox.matPlanForSession({
    course: 'All Kids Welcome', date: '2026-10-10', person: 'Kim Varner', extraDates: [], reuse: false
  });
  assert.equal(plan.fullyCovered, true);
  assert.equal(plan.reuseOffer, true);
  const saved = planSandbox.matCheckoutItemsFromPlan(plan, true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].usesExisting, true);
  assert.equal(saved[0].qty, 0);
  assert.match(planSandbox.matKeepSentence(plan), /already has this durable kit/);
});
