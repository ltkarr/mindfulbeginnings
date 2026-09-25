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
