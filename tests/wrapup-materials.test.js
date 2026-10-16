'use strict';

// Wrap-up materials gate: pay only once materials are back, unless the
// instructor is holding the kit for an upcoming class that needs it.
// Also: the "Send invoice to organization" CTA in the wrap-up.

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
  'escapeHtml', 'fmtYMD',
  'wrapupOpenCheckoutsFor', 'wrapupUpcomingKitSessions', 'wrapupPayBlockedByMaterials',
  'wrapupCheckoutNames', 'wrapupShortDate', 'wrapupMaterialsNote', 'wrapupInvoiceCta'
];

const TODAY = '2026-10-16';
const alex = { id: 'a', name: 'Alex Rivera' };
const jordan = { id: 'j', name: 'Jordan Lee' };

function makeSandbox(overrides) {
  const sandbox = {
    TODAY,
    matCheckouts: [],
    sessions: [],
    instructors: [alex, jordan],
    equipment: [{ id: 'eq1', name: 'Infant manikin' }, { id: 'eq2', name: 'AV kit' }],
    invoices: [],
    matToday: () => TODAY,
    fmtYMD: (d) => d,
    ymLabel: (ym) => ym,
    // A checkout is "out" when not returned and carrying a positive qty.
    matKitIsOutNow: (c) => !c.returnedDate && (c.items || []).some((it) => Number(it.qty) > 0),
    matItemIsConsumable: () => false,
    coNoEquipment: () => false,
    sessionIsComplete: (s) => String(s.date || '') < TODAY,
    sessionMatNeeds: (s) => (s.isVirtual ? null : { kit: true }),
  };
  Object.assign(sandbox, overrides || {});
  vm.createContext(sandbox);
  vm.runInContext(names.map((n) => extractFunction(admin, n)).join('\n'), sandbox);
  return sandbox;
}

function co(person, sessionId, returnedDate) {
  return {
    id: 'c-' + person + '-' + (sessionId || 'x'),
    person, sessionId: sessionId || null,
    items: [{ equipmentId: 'eq1', qty: 2 }],
    outDate: '2026-10-10', dueDate: '2026-10-17',
    returnedDate: returnedDate || null, notes: ''
  };
}

test('no open checkouts means no note and no block', () => {
  const sb = makeSandbox();
  const s = { id: 's1', course: 'Safe Sitter®', date: '2026-10-15' };
  assert.deepEqual(sb.wrapupOpenCheckoutsFor(alex), []);
  assert.equal(sb.wrapupMaterialsNote(s, alex), '');
  assert.equal(sb.wrapupPayBlockedByMaterials(s, alex), null);
});

test('an open checkout matched by instructor name blocks pay', () => {
  const sb = makeSandbox({ matCheckouts: [co('Alex Rivera', 's1')] });
  const s = { id: 's1', course: 'Safe Sitter®', date: '2026-10-15' };
  const open = sb.wrapupOpenCheckoutsFor(alex);
  assert.equal(open.length, 1);
  assert.ok(sb.wrapupPayBlockedByMaterials(s, alex), 'pay is blocked');
  const note = sb.wrapupMaterialsNote(s, alex);
  assert.match(note, /not returned/);
  assert.match(note, /Mark returned/);
  assert.match(note, /Infant manikin/);
});

test('a returned checkout does not block pay', () => {
  const sb = makeSandbox({ matCheckouts: [co('Alex Rivera', 's1', '2026-10-15')] });
  const s = { id: 's1', course: 'Safe Sitter®', date: '2026-10-15' };
  assert.deepEqual(sb.wrapupOpenCheckoutsFor(alex), []);
  assert.equal(sb.wrapupPayBlockedByMaterials(s, alex), null);
});

test('a checkout linked by session (no person name) still counts', () => {
  const sb = makeSandbox({
    matCheckouts: [co('', 's9')],
    sessions: [{ id: 's9', course: 'Safe@Home', date: '2026-10-14', instructorId: 'a' }]
  });
  const s = { id: 's1', course: 'Safe Sitter®', date: '2026-10-15' };
  assert.equal(sb.wrapupOpenCheckoutsFor(alex).length, 1);
  assert.ok(sb.wrapupPayBlockedByMaterials(s, alex));
});

test('another instructor\u2019s checkout does not block this instructor', () => {
  const sb = makeSandbox({ matCheckouts: [co('Jordan Lee', 's1')] });
  const s = { id: 's1', course: 'Safe Sitter®', date: '2026-10-15' };
  assert.deepEqual(sb.wrapupOpenCheckoutsFor(alex), []);
  assert.equal(sb.wrapupPayBlockedByMaterials(s, alex), null);
});

test('holding the kit for an upcoming class is OK to pay', () => {
  const sb = makeSandbox({
    matCheckouts: [co('Alex Rivera', 's1')],
    sessions: [
      { id: 's2', course: 'Safe Sitter®', date: '2026-10-20', instructorId: 'a', isVirtual: false },
      { id: 's3', course: 'Safe@Home', date: '2026-10-10', instructorId: 'a', isVirtual: false }
    ]
  });
  const s = { id: 's1', course: 'Safe Sitter®', date: '2026-10-15' };
  const upcoming = sb.wrapupUpcomingKitSessions(alex, 's1');
  assert.equal(upcoming.length, 1);
  assert.equal(upcoming[0].id, 's2');
  assert.equal(sb.wrapupPayBlockedByMaterials(s, alex), null);
  const note = sb.wrapupMaterialsNote(s, alex);
  assert.match(note, /no return needed/);
  assert.match(note, /OK to pay/);
});

test('an upcoming virtual class does not excuse the return', () => {
  const sb = makeSandbox({
    matCheckouts: [co('Alex Rivera', 's1')],
    sessions: [
      { id: 's2', course: 'Safe@Home', date: '2026-10-20', instructorId: 'a', isVirtual: true }
    ]
  });
  const s = { id: 's1', course: 'Safe Sitter®', date: '2026-10-15' };
  assert.deepEqual(sb.wrapupUpcomingKitSessions(alex, 's1'), []);
  assert.ok(sb.wrapupPayBlockedByMaterials(s, alex), 'pay is still blocked');
});

test('invoice CTA is absent when the session is not billed to an org', () => {
  const sb = makeSandbox();
  assert.equal(sb.wrapupInvoiceCta({ id: 's1', course: 'X', date: '2026-10-15' }), '');
  assert.equal(sb.wrapupInvoiceCta({ id: 's1', course: 'X', date: '2026-10-15', billToOrg: '  ' }), '');
});

test('invoice CTA offers to send the invoice when the org has not been billed', () => {
  const sb = makeSandbox();
  const html = sb.wrapupInvoiceCta({ id: 's1', course: 'Safe Sitter®', date: '2026-10-15', billToOrg: 'GS Troop 42086' });
  assert.match(html, /Send invoice to GS Troop 42086/);
  assert.match(html, /openCreateInvoice/);
  assert.match(html, /2026-10/);
});

test('invoice CTA shows status when the session is already invoiced', () => {
  const sb = makeSandbox({
    invoices: [{
      id: 'v1', orgName: 'GS Troop 42086', invoiceNumber: 'MB-2026-10-003',
      status: 'sent', lineItems: [{ sessionId: 's1', amount: 150 }]
    }]
  });
  const html = sb.wrapupInvoiceCta({ id: 's1', course: 'Safe Sitter®', date: '2026-10-15', billToOrg: 'GS Troop 42086' });
  assert.match(html, /On invoice MB-2026-10-003/);
  assert.match(html, /sent/);
  assert.doesNotMatch(html, /Send invoice to/);
});
