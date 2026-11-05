'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const pack = require('../js/pack-quantities.js');
const sheets = require('../js/teaching-checklists.js');

const TODAY = '2026-11-05';
const INFANT = '419e04a9-5916-450c-b2a3-65c292a235ec';
const CHILD = '4246a269-a2e3-411d-a4a7-359756a33a31';
const AV = 'f6a82532-10fc-4e62-931a-ae2e3d039b15';
const EQUIPMENT = [
  { id: INFANT, name: 'Infant manikin' },
  { id: CHILD, name: 'Child manikin' },
  { id: AV, name: 'AV kit' }
];

function regs(id, statuses) {
  return statuses.map(function (st, i) {
    return { id: 'r' + i, sessionId: id, payStatus: st, studentName: 'Student ' + i };
  });
}

function line(plan, id) {
  return plan.lines.filter(function (row) { return row.id === id; })[0];
}

test('six paid Safe Sitter registrations pack 6 handbooks and 6 note pads', () => {
  const plan = pack.forChecklist({
    checklistId: 'safe-sitter',
    session: { id: 'ss', course: 'Safe Sitter®' },
    registrations: regs('ss', ['paid', 'paid', 'paid', 'paid', 'paid', 'paid', 'waitlist', 'cancelled', 'refunded']),
    today: TODAY,
    instructorNames: ['Kathryn Greenberg (Katy)'],
    instructorCount: 1,
    refresh: { ok: true },
    checkouts: [],
    equipment: EQUIPMENT
  });
  assert.equal(plan.count, 6);
  assert.equal(line(plan, 'ssHandbook').required, 6);
  assert.equal(line(plan, 'ssHandbook').packNow, 6);
  assert.match(pack.packNowText(plan), /Pack now: 6 Safe Sitter Student Handbooks/);
  assert.match(pack.packNowText(plan), /6 Safe Sitter Important Information note pads/);
  assert.equal(line(plan, 'ssNotebook').packNow, 6);
  assert.equal(line(plan, 'faceShield').packNow, 6);
  assert.equal(line(plan, 'nameTag').required, 7);
  assert.equal(line(plan, 'infant').required, 1);
  assert.equal(line(plan, 'child').required, 1);
  assert.equal(line(plan, 'av').required, 1);
  assert.match(plan.basis, /6 participants are registered/);
  assert.match(plan.refreshNote, /rechecked just now/);
  const html = sheets.printHtml(sheets.byId('safe-sitter'), {
    date: '2026-11-13',
    instructor: 'Kathryn Greenberg (Katy)',
    pack: plan
  });
  assert.match(html, /PACK NOW 6/);
  assert.match(html, /Safe Sitter Student Handbooks: 6 required/);
  assert.match(html, /Important Information note pads: 6 required/);
  assert.match(html, /Instructor: Kathryn Greenberg \(Katy\)/);
  assert.doesNotMatch(html, /Student 0|@/);
});

test('enrollment changes and refunds change the pack count', () => {
  const session = { id: 'ss', course: 'Safe Sitter®' };
  const four = pack.forChecklist({
    checklistId: 'safe-sitter',
    session: session,
    registrations: regs('ss', ['paid', 'unpaid', 'pending', 'host', 'refunded', 'canceled', 'waitlist']),
    today: TODAY,
    refresh: { ok: true },
    skipRefresh: true
  });
  assert.equal(four.count, 4);
  assert.equal(line(four, 'ssHandbook').packNow, 4);
  const nine = pack.forChecklist({
    checklistId: 'safe-sitter',
    session: session,
    registrations: regs('ss', ['paid', 'paid', 'paid', 'paid', 'paid', 'paid', 'paid', 'paid', 'paid']),
    today: TODAY,
    refresh: { ok: true },
    skipRefresh: true
  });
  assert.equal(nine.count, 9);
  assert.equal(line(nine, 'infant').required, 2);
  assert.equal(line(nine, 'child').required, 2);
  assert.equal(line(nine, 'ssHandbook').required, 9);
});

test('a failed roster refresh is labeled and is not described as rechecked', () => {
  const plan = pack.forChecklist({
    checklistId: 'safe-sitter',
    session: { id: 'ss' },
    registrations: regs('ss', ['paid', 'paid']),
    today: TODAY,
    refresh: { ok: false }
  });
  assert.match(plan.refreshNote, /not rechecked/);
  assert.doesNotMatch(plan.refreshNote, /rechecked just now/);
  assert.equal(plan.count, 2);
});

test('an organization class uses the billed headcount and does not print zero', () => {
  const missing = pack.forChecklist({
    checklistId: 'safe-sitter',
    session: { id: 'org', orgHandlesRegistration: true, billToOrg: 'Troop 1', billedHeadcount: null },
    registrations: [],
    today: TODAY,
    refresh: { ok: true },
    skipRefresh: true
  });
  assert.equal(missing.count, null);
  assert.equal(missing.missing, true);
  assert.equal(line(missing, 'ssHandbook').confirm, true);
  assert.match(line(missing, 'ssHandbook').note, /not confirmed/);
  const set = pack.forChecklist({
    checklistId: 'safe-sitter',
    session: { id: 'org', orgHandlesRegistration: true, billToOrg: 'Troop 1', billedHeadcount: 10 },
    registrations: regs('org', ['paid']),
    today: TODAY,
    refresh: { ok: true },
    skipRefresh: true
  });
  assert.equal(set.count, 10);
  assert.equal(line(set, 'ssHandbook').required, 10);
  assert.equal(line(set, 'infant').required, 2);
});

test('Red Cross equipment stays at 2 adult, 2 child, and 2 infant manikins', () => {
  const plan = pack.forChecklist({
    checklistId: 'rc-adult-peds',
    session: { id: 'rc' },
    registrations: regs('rc', ['paid', 'paid', 'paid']),
    today: TODAY,
    instructorCount: 1,
    refresh: { ok: true },
    skipRefresh: true
  });
  assert.equal(line(plan, 'adult').required, 2);
  assert.equal(line(plan, 'child').required, 2);
  assert.equal(line(plan, 'infant').required, 2);
  assert.equal(line(plan, 'rcHandout').required, 3);
  assert.equal(line(plan, 'nameTag').required, 4);
  const big = pack.forChecklist({
    checklistId: 'rc-bt-peds',
    session: { id: 'rc2' },
    registrations: regs('rc2', Array.from({ length: 12 }, function () { return 'paid'; })),
    today: TODAY,
    refresh: { ok: true },
    skipRefresh: true
  });
  assert.equal(line(big, 'adult').required, 2);
  assert.equal(line(big, 'infant').required, 2);
  assert.equal(line(big, 'rcHandbook').required, 12);
});

test('verified gear already out is subtracted, and a future reservation is not possession', () => {
  const names = ['Kathryn Greenberg (Katy)'];
  const plan = pack.forChecklist({
    checklistId: 'safe-sitter',
    session: { id: 'upcoming', course: 'Safe Sitter®' },
    registrations: regs('upcoming', ['paid', 'paid', 'paid', 'paid', 'paid', 'paid']),
    instructorNames: names,
    today: TODAY,
    refresh: { ok: true },
    skipRefresh: true,
    equipment: EQUIPMENT,
    checkouts: [
      {
        id: 'future',
        sessionId: 'upcoming',
        person: 'Katy Greenberg',
        outDate: '2026-11-01',
        dueDate: '2026-11-27',
        returnedDate: null,
        items: [
          { equipmentId: INFANT, qty: 2 },
          { equipmentId: CHILD, qty: 2 },
          { equipmentId: AV, qty: 1 }
        ]
      },
      {
        id: 'held',
        sessionId: 'prior',
        person: 'Kathryn Greenberg',
        outDate: '2026-10-20',
        dueDate: '2026-11-20',
        returnedDate: null,
        source: 'SS-261020',
        items: [
          { equipmentId: INFANT, qty: 1 },
          { equipmentId: CHILD, qty: 1 },
          { equipmentId: AV, qty: 1 }
        ]
      }
    ]
  });
  assert.equal(line(plan, 'infant').already, 1);
  assert.equal(line(plan, 'infant').packNow, 0);
  assert.match(line(plan, 'infant').alreadyNote, /SS-261020/);
  assert.equal(line(plan, 'child').packNow, 0);
  assert.equal(line(plan, 'av').packNow, 0);
  assert.equal(line(plan, 'ssHandbook').packNow, 6);
  assert.equal(line(plan, 'ssHandbook').already, 0);
  const phrases = pack.phrases(plan);
  assert.match(phrases.packNow, /6 Safe Sitter Student Handbooks/);
  assert.match(phrases.already, /Infant manikins/);
  assert.doesNotMatch(phrases.packNow, /Infant manikins/);
});

test('a partial manikin shortfall packs only the difference', () => {
  const plan = pack.forChecklist({
    checklistId: 'safe-sitter',
    session: { id: 'big' },
    registrations: regs('big', Array.from({ length: 9 }, function () { return 'paid'; })),
    instructorNames: ['Priya Shah'],
    today: TODAY,
    refresh: { ok: true },
    skipRefresh: true,
    equipment: EQUIPMENT,
    checkouts: [{
      id: 'part',
      person: 'Priya Shah',
      outDate: '2026-11-01',
      returnedDate: null,
      source: 'earlier class',
      items: [{ equipmentId: INFANT, qty: 1 }, { equipmentId: CHILD, qty: 3 }, { equipmentId: AV, qty: 1 }]
    }]
  });
  assert.equal(line(plan, 'infant').required, 2);
  assert.equal(line(plan, 'infant').already, 1);
  assert.equal(line(plan, 'infant').packNow, 1);
  assert.equal(line(plan, 'child').packNow, 0);
  assert.equal(line(plan, 'child').already, 3);
  assert.ok(line(plan, 'infant').packNow >= 0);
});

test('a returned auto-closed checkout is not treated as gear in hand', () => {
  const plan = pack.forChecklist({
    checklistId: 'safe-sitter',
    session: { id: 'upcoming' },
    registrations: regs('upcoming', ['paid', 'paid', 'paid', 'paid', 'paid', 'paid']),
    instructorNames: ['Kathryn Greenberg (Katy)'],
    today: TODAY,
    refresh: { ok: true },
    skipRefresh: true,
    equipment: EQUIPMENT,
    checkouts: [{
      id: 'closed',
      person: 'Kathryn Greenberg',
      outDate: '2026-10-24',
      dueDate: '2026-10-24',
      returnedDate: '2026-10-13',
      notes: '[auto-closed 2026-10-13 cleanup]',
      source: 'SS-261024',
      items: [
        { kind: 'infant', qty: 1 },
        { kind: 'child', qty: 1 },
        { kind: 'av', qty: 1 }
      ]
    }]
  });
  assert.equal(line(plan, 'infant').already, 0);
  assert.equal(line(plan, 'infant').packNow, null);
  assert.match(plan.warning, /automatic cleanup/);
  assert.match(plan.warning, /not counted as already out/);
  assert.equal(line(plan, 'ssHandbook').packNow, 6);
});

test('an ordinary returned checkout does not warn and does not reduce the pack', () => {
  const plan = pack.forChecklist({
    checklistId: 'safe-sitter',
    session: { id: 'upcoming' },
    registrations: regs('upcoming', ['paid']),
    instructorNames: ['Priya Shah'],
    today: TODAY,
    refresh: { ok: true },
    skipRefresh: true,
    equipment: EQUIPMENT,
    checkouts: [{
      id: 'back',
      person: 'Priya Shah',
      outDate: '2026-09-01',
      returnedDate: '2026-09-02',
      notes: 'Returned after class',
      items: [{ equipmentId: INFANT, qty: 1 }]
    }]
  });
  assert.equal(plan.warning, '');
  assert.equal(line(plan, 'infant').packNow, 1);
  assert.equal(line(plan, 'infant').already, 0);
});

test('recorded remaining handbooks can be subtracted, and unrecorded leftovers cannot', () => {
  const base = {
    checklistId: 'safe-sitter',
    session: { id: 'ss' },
    registrations: regs('ss', ['paid', 'paid', 'paid', 'paid', 'paid', 'paid']),
    today: TODAY,
    refresh: { ok: true },
    skipRefresh: true
  };
  const assumed = pack.forChecklist(base);
  assert.equal(line(assumed, 'ssHandbook').packNow, 6);
  const recorded = pack.forChecklist(Object.assign({}, base, { remaining: { ssHandbook: 2 } }));
  assert.equal(line(recorded, 'ssHandbook').already, 2);
  assert.equal(line(recorded, 'ssHandbook').packNow, 4);
  assert.equal(line(recorded, 'ssNotebook').packNow, 6);
});

function ssPlan(count, extra) {
  return pack.forChecklist(Object.assign({
    checklistId: 'safe-sitter',
    session: { id: 'ss', course: 'Safe Sitter®' },
    registrations: regs('ss', Array.from({ length: count }, function () { return 'paid'; })),
    instructorNames: ['Priya Shah'],
    instructorCount: 1,
    today: TODAY,
    refresh: { ok: true },
    skipRefresh: true,
    equipment: EQUIPMENT,
    checkouts: []
  }, extra || {}));
}

test('Safe Sitter manikins are 1 each at 0, 6, and 8, and 2 each at 9', () => {
  [0, 6, 8].forEach(function (n) {
    const plan = ssPlan(n);
    assert.equal(line(plan, 'infant').required, 1, 'infant at ' + n);
    assert.equal(line(plan, 'child').required, 1, 'child at ' + n);
    assert.equal(line(plan, 'ssHandbook').required, n);
    assert.notEqual(line(plan, 'infant').required, 3);
    assert.notEqual(line(plan, 'infant').required, 4);
  });
  const nine = ssPlan(9);
  assert.equal(line(nine, 'infant').required, 2);
  assert.equal(line(nine, 'child').required, 2);
  assert.equal(line(nine, 'ssHandbook').required, 9);
  assert.notEqual(line(nine, 'infant').required, 3);
  assert.notEqual(line(nine, 'infant').required, 4);
});

test('held equipment changes pack-now the same way on the print sheet and the packing line', () => {
  function check(count, heldInfant) {
    const plan = ssPlan(count, {
      checkouts: heldInfant ? [{
        id: 'held',
        person: 'Priya Shah',
        outDate: '2026-10-01',
        returnedDate: null,
        source: 'earlier class',
        items: [{ equipmentId: INFANT, qty: heldInfant }, { equipmentId: CHILD, qty: heldInfant }, { equipmentId: AV, qty: 1 }]
      }] : []
    });
    const html = sheets.printHtml(sheets.byId('safe-sitter'), { pack: plan, instructor: 'Priya Shah' });
    const text = pack.packNowText(plan);
    ['infant', 'child', 'ssHandbook', 'ssNotebook'].forEach(function (id) {
      const row = line(plan, id);
      assert.ok(row.packNow >= 0 || row.packNow == null);
      if (row.packNow != null) {
        assert.match(html, new RegExp(row.packNow + ' required|PACK NOW ' + row.packNow));
        assert.match(text, new RegExp(row.packNow + ' ' + row.label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
      }
    });
    if (heldInfant) {
      const need = count > 8 ? 2 : 1;
      assert.equal(line(plan, 'infant').already, Math.min(heldInfant, need) === need && heldInfant > need ? heldInfant : Math.min(heldInfant, need) > need ? heldInfant : Math.min(heldInfant, line(plan, 'infant').required));
      assert.equal(line(plan, 'infant').packNow, Math.max(0, line(plan, 'infant').required - Math.min(heldInfant, line(plan, 'infant').required) < 0 ? 0 : line(plan, 'infant').required - (heldInfant > line(plan, 'infant').required ? heldInfant : Math.min(heldInfant, line(plan, 'infant').required))));
    }
  }
  [0, 6, 8, 9].forEach(function (n) {
    check(n, 0);
    check(n, 1);
    check(n, 2);
  });
  const over = ssPlan(6, {
    checkouts: [{
      person: 'Priya Shah',
      outDate: '2026-10-01',
      returnedDate: null,
      items: [{ equipmentId: INFANT, qty: 5 }]
    }]
  });
  assert.equal(line(over, 'infant').packNow, 0);
  assert.ok(line(over, 'infant').packNow >= 0);
});

test('two open reservations for the same instructor count the larger quantity once', () => {
  const plan = ssPlan(6, {
    checkouts: [
      { person: 'Priya Shah', outDate: '2026-10-01', returnedDate: null, source: 'A', items: [{ equipmentId: INFANT, qty: 1 }] },
      { person: 'Priya Shah', outDate: '2026-10-02', returnedDate: null, source: 'B', items: [{ equipmentId: INFANT, qty: 1 }] }
    ]
  });
  assert.equal(line(plan, 'infant').already, 1);
  assert.equal(line(plan, 'infant').packNow, 0);
});

test('a similar but different name is not subtracted', () => {
  const plan = ssPlan(6, {
    instructorNames: ['Kathryn Greenberg (Katy)'],
    checkouts: [{
      person: 'Sam Greenberg',
      outDate: '2026-10-01',
      returnedDate: null,
      items: [{ equipmentId: INFANT, qty: 1 }, { equipmentId: CHILD, qty: 1 }, { equipmentId: AV, qty: 1 }]
    }]
  });
  assert.equal(line(plan, 'infant').already, 0);
  assert.equal(line(plan, 'infant').packNow, 1);
  assert.match(plan.warning, /Sam Greenberg/);
  assert.match(plan.warning, /not an exact match/);
  assert.equal(pack.namesMatch('Katy Greenberg', 'Kathryn Greenberg (Katy)'), true);
  assert.equal(pack.namesMatch('Sam Greenberg', 'Kathryn Greenberg'), false);
  assert.equal(pack.namesMatch('Kat Greenberg', 'Kathryn Greenberg'), false);
});

test('an auto-closed return asks for confirmation instead of a second manikin kit', () => {
  const plan = ssPlan(6, {
    instructorNames: ['Kathryn Greenberg (Katy)'],
    checkouts: [{
      person: 'Katy Greenberg',
      outDate: '2026-10-24',
      returnedDate: '2026-10-13',
      notes: '[auto-closed 2026-10-13 cleanup]',
      source: 'prior class',
      items: [{ kind: 'infant', qty: 1 }, { kind: 'child', qty: 1 }, { kind: 'av', qty: 1 }]
    }, {
      sessionId: 'ss',
      person: 'Kathryn Greenberg',
      outDate: '2026-11-06',
      returnedDate: null,
      items: [{ equipmentId: INFANT, qty: 2 }, { equipmentId: CHILD, qty: 2 }, { equipmentId: AV, qty: 1 }]
    }]
  });
  const html = sheets.printHtml(sheets.byId('safe-sitter'), { pack: plan, instructor: 'Kathryn Greenberg (Katy)', code: 'SS-261030' });
  assert.equal(line(plan, 'ssHandbook').packNow, 6);
  assert.equal(line(plan, 'ssNotebook').packNow, 6);
  assert.equal(line(plan, 'infant').already, 0);
  assert.equal(line(plan, 'infant').packNow, null);
  assert.match(plan.warning, /Confirm what is still with the instructor/);
  assert.match(html, /PACK NOW 6/);
  assert.match(html, /Confirm before packing another/);
  assert.doesNotMatch(html, /Infant manikins: 1 required, 0 already with instructor. PACK NOW 1/);
});
