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

const sandbox = { Date, Math, Number, Object, String, isNaN, isFinite };
vm.createContext(sandbox);
vm.runInContext(
  [
    extractFn(admin, 'sessionEndDate'),
    extractFn(admin, 'sessionSpanDays'),
    extractFn(admin, 'sessionMeetingDates'),
    extractFn(admin, 'isLongSeries'),
  ].join('\n'),
  sandbox
);

test('one-off and two-day host classes are not long series', () => {
  assert.equal(sandbox.isLongSeries({ date: '2026-11-01' }), false);
  assert.equal(sandbox.isLongSeries({ date: '2026-11-01', extraDates: ['2026-11-03'] }), false);
  assert.equal(sandbox.isLongSeries({ date: '2026-11-01', extraDates: ['2026-11-08'] }), false); // exactly 7 days
  assert.equal(sandbox.isLongSeries({}), false);
  // Two dates more than a week apart used to count as a series because the span
  // was over 7 days. A host class that simply meets twice is still one session.
  assert.equal(sandbox.isLongSeries({ date: '2026-10-01', extraDates: ['2026-10-09'] }), false);
  // SS-261030: Safe Sitter, Oct 30 plus Nov 13, stored as an extra day.
  const ss = {
    code: 'SS-261030',
    date: '2026-10-30',
    extraDates: ['2026-11-13'],
    extraDays: [{ date: '2026-11-13', time: '3:00 PM – 5:00 PM' }]
  };
  assert.equal(sandbox.sessionSpanDays(ss), 14);
  assert.equal(sandbox.sessionMeetingDates(ss).length, 2);
  assert.equal(sandbox.isLongSeries(ss), false);
  // The second afternoon can live only on extraDays (per-day time).
  assert.equal(sandbox.isLongSeries({
    date: '2026-10-30',
    extraDays: [{ date: '2026-11-13', time: '3:00 PM' }]
  }), false);
});

test('recurring clubs and classes with 3 or more dates are series', () => {
  assert.equal(sandbox.sessionSpanDays({ date: '2026-10-01', extraDates: ['2026-10-08', '2026-10-15'] }), 14);
  assert.equal(sandbox.isLongSeries({ date: '2026-10-01', extraDates: ['2026-10-08', '2026-10-15'] }), true);
  assert.equal(sandbox.isLongSeries({
    date: '2026-10-01',
    extraDays: [{ date: '2026-10-08', time: '' }, { date: '2026-10-15', time: '' }]
  }), true);
  assert.equal(
    sandbox.isLongSeries({ date: '2026-10-01', isRecurring: true, recurEndDate: '2026-12-01' }),
    true
  );
  // The same day listed on both extraDates and extraDays counts once.
  assert.deepEqual(
    sandbox.sessionMeetingDates({
      date: '2026-10-30',
      extraDates: ['2026-11-13'],
      extraDays: [{ date: '2026-11-13', time: '3:00 PM' }]
    }),
    ['2026-10-30', '2026-11-13']
  );
});

test('Sessions scope dropdown defaults to All and still offers Multi-week series', () => {
  assert.match(admin, /<option value="all" selected>All sessions<\/option>/);
  assert.doesNotMatch(admin, /<option value="upcoming" selected>/);
  assert.match(admin, /<option value="series">Multi-week series<\/option>/);
  assert.match(admin, /if\(scope==='series'\)return series;/);
  assert.match(admin, /getElementById\('report-filter'\)\?\.value\|\|'all'/);
});
