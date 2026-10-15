'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed function ' + name);
}

const sandbox = { Date, Math, Number, isNaN, isFinite };
vm.createContext(sandbox);
vm.runInContext(
  [
    extractFn(admin, 'sessionEndDate'),
    extractFn(admin, 'sessionSpanDays'),
    extractFn(admin, 'isLongSeries'),
  ].join('\n'),
  sandbox
);

test('one-off sessions are not long series', () => {
  assert.equal(sandbox.isLongSeries({ date: '2026-11-01' }), false);
  assert.equal(sandbox.isLongSeries({ date: '2026-11-01', extraDates: ['2026-11-03'] }), false);
  assert.equal(sandbox.isLongSeries({ date: '2026-11-01', extraDates: ['2026-11-08'] }), false); // exactly 7 days
  assert.equal(sandbox.isLongSeries({}), false);
});

test('multi-week series span more than 7 days', () => {
  assert.equal(sandbox.sessionSpanDays({ date: '2026-10-01', extraDates: ['2026-10-08', '2026-10-15'] }), 14);
  assert.equal(sandbox.isLongSeries({ date: '2026-10-01', extraDates: ['2026-10-09'] }), true); // 8 days
  assert.equal(
    sandbox.isLongSeries({ date: '2026-10-01', isRecurring: true, recurEndDate: '2026-12-01' }),
    true
  );
});

test('Sessions scope dropdown offers a Multi-week series tab', () => {
  assert.match(admin, /<option value="series">Multi-week series<\/option>/);
  assert.match(admin, /if\(scope==='series'\)return series;/);
});
