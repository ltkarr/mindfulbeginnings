'use strict';

// 30-day cash forecast: instructor pay owed for sessions dated in the next
// 30 days, against the business account balance.

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

const names = ['fmtYMD', 'round2', 'cashForecast30', 'cashForecastBalance', 'setCashForecastBalance'];

// 2026-10-16 -> window is 2026-10-16 .. 2026-11-15
const NOW = new Date('2026-10-16T12:00:00');

function makeSandbox(sessionList) {
  const store = {};
  const sandbox = {
    sessions: sessionList,
    fmtYMD: (d) => {
      const p = (n) => String(n).padStart(2, '0');
      return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
    },
    round2: (n) => Math.round(Number(n) * 100) / 100,
    instructorPayStillOwed: (s) => Number(s.owed || 0),
    sessionInstructorNames: (s) => s.who || 'TBD',
    customJobPayMissing: () => false,
    localStorage: {
      getItem: (k) => (k in store ? store[k] : null),
      setItem: (k, v) => { store[k] = String(v); },
    },
  };
  vm.createContext(sandbox);
  vm.runInContext(names.map((n) => extractFunction(admin, n)).join('\n'), sandbox);
  return sandbox;
}

test('only sessions dated inside the 30-day window count', () => {
  const sb = makeSandbox([
    { id: 'a', course: 'Safe Sitter®', date: '2026-10-20', owed: 300, who: 'Ashira Lavine' },
    { id: 'b', course: 'Safe@Home', date: '2026-11-15', owed: 150, who: 'Kim Varner' },
    { id: 'c', course: 'Safe Sitter®', date: '2026-11-16', owed: 999, who: 'Too Late' },
    { id: 'd', course: 'Safe@Home', date: '2026-10-10', owed: 888, who: 'Too Early' },
    { id: 'e', course: 'Safe Sitter®', date: '2026-10-25', owed: 0, who: 'Already Paid' },
  ]);
  const fc = sb.cashForecast30(NOW);
  assert.equal(fc.rows.length, 2);
  assert.equal(fc.total, 450);
  assert.deepEqual(fc.rows.map((r) => r.course), ['Safe Sitter®', 'Safe@Home']);
});

test('cancelled and hold sessions are excluded', () => {
  const sb = makeSandbox([
    { id: 'a', course: 'Safe Sitter®', date: '2026-10-20', owed: 300, isCancelled: true },
    { id: 'b', course: 'Safe@Home', date: '2026-10-21', owed: 200, isHold: true },
    { id: 'c', course: 'Care Ready', date: '2026-10-22', owed: 175 },
  ]);
  const fc = sb.cashForecast30(NOW);
  assert.equal(fc.rows.length, 1);
  assert.equal(fc.total, 175);
});

test('dateless sessions are excluded', () => {
  const sb = makeSandbox([
    { id: 'a', course: 'Safe Sitter®', date: '', owed: 300 },
    { id: 'b', course: 'Safe@Home', date: '2026-10-20', owed: 150 },
  ]);
  const fc = sb.cashForecast30(NOW);
  assert.equal(fc.total, 150);
});

test('balance defaults to 1500 and persists', () => {
  const sb = makeSandbox([]);
  assert.equal(sb.cashForecastBalance(), 1500);
  sb.setCashForecastBalance(2200);
  assert.equal(sb.cashForecastBalance(), 2200);
});

test('rows are sorted by date', () => {
  const sb = makeSandbox([
    { id: 'b', course: 'B', date: '2026-11-01', owed: 100 },
    { id: 'a', course: 'A', date: '2026-10-18', owed: 100 },
  ]);
  const fc = sb.cashForecast30(NOW);
  assert.equal(fc.rows[0].course, 'A');
  assert.equal(fc.rows[1].course, 'B');
});
