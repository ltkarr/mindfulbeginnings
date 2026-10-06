'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const instructor = fs.readFileSync(path.join(__dirname, '..', 'instructor.html'), 'utf8');

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

function loadBoard() {
  const sandbox = { COURSES: { 'Safe Sitter®': { hours: 5 } } };
  vm.runInNewContext(
    [
      extractFn(instructor, 'escapeHtml'),
      extractFn(instructor, 'fmtDate'),
      extractFn(instructor, 'recurringMeetings'),
      extractFn(instructor, 'sessMeetings'),
      extractFn(instructor, 'sessClosures'),
      extractFn(instructor, 'sessRangeLabel'),
      extractFn(instructor, 'sessWeekdayPattern'),
      extractFn(instructor, 'sessTimeSummary'),
      extractFn(instructor, 'twoDayWhen'),
      extractFn(instructor, 'whenLineHTML')
    ].join('\n'),
    sandbox
  );
  return sandbox;
}

test('the instructor job board names both days of a two-day class', () => {
  const api = loadBoard();
  const split = {
    date: '2026-10-30',
    time: '1:00-4:00 PM',
    extraDates: ['2026-11-13'],
    extraDays: [{ date: '2026-11-13', time: '3:00-5:00 PM' }],
    course: 'Safe Sitter®'
  };
  const html = api.whenLineHTML(split);
  assert.match(html, /Friday, October 30, 2026 · 1:00-4:00 PM &amp; Friday, November 13, 2026 · 3:00-5:00 PM/);
  const same = {
    date: '2026-11-02',
    time: '1:30 to 4:00 PM',
    extraDates: ['2026-11-03'],
    extraDays: [{ date: '2026-11-03', time: '1:30 to 4:00 PM' }],
    course: 'Safe Sitter®'
  };
  assert.match(api.whenLineHTML(same), /Monday, November 2, 2026 &amp; Tuesday, November 3, 2026 · 1:30 to 4:00 PM/);
  const one = { date: '2026-10-18', time: '9:00 AM', extraDates: [], course: 'Safe Sitter®' };
  assert.match(api.whenLineHTML(one), /Sunday, October 18, 2026 · 9:00 AM/);
  assert.doesNotMatch(api.whenLineHTML(one), /&amp;/);
});
