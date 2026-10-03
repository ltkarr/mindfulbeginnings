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

function sliceBetween(src, startMark, endMark) {
  const start = src.indexOf(startMark);
  const end = src.indexOf(endMark, start + startMark.length);
  assert.ok(start >= 0 && end > start, startMark + ' .. ' + endMark);
  return src.slice(start, end);
}

const sandbox = {};
vm.createContext(sandbox);
vm.runInContext(['emailsInField', 'parentLetterEmails'].map((n) => extractFunction(admin, n)).join('\n'), sandbox);

test('the parent-letter paste list is emails only, separated by semicolons', () => {
  const regs = [
    { contact: 'debra.example@gmail.com / 8179888897' },
    { contact: 'anna.example@gmail.com' },
    { contact: 'melissa.example@gmail.com / 6102957914' },
    { contact: 'sarah.example@gmail.com / 248-320-2973' },
    { contact: '301-717-5400 / lee.example@gmail.com' },
    { contact: '1202445553' },
    { contact: '' },
    { contact: null }
  ];
  const emails = sandbox.parentLetterEmails(regs);
  const pasted = emails.join('; ');
  assert.deepEqual(emails, [
    'debra.example@gmail.com',
    'anna.example@gmail.com',
    'melissa.example@gmail.com',
    'sarah.example@gmail.com',
    'lee.example@gmail.com'
  ]);
  assert.equal(pasted, 'debra.example@gmail.com; anna.example@gmail.com; melissa.example@gmail.com; sarah.example@gmail.com; lee.example@gmail.com');
  assert.doesNotMatch(pasted, /\d{7,}/);
  assert.doesNotMatch(pasted, / \/ /);
});

test('the wrap-up parent-letter box uses that list and keeps the checkbox and email button', () => {
  const fn = sliceBetween(admin, 'function openWrapup(', 'function toggleWrapField(');
  assert.match(fn, /const emails=parentLetterEmails\(regs\)/);
  assert.match(fn, /escapeHtml\(emails\.join\('; '\)\)/);
  assert.match(fn, /email address\$\{emails\.length!==1\?'es':''\} from registrations/);
  assert.match(fn, /Sent parent letter to class/);
  assert.match(fn, /parentLetterSent/);
  assert.match(fn, /openPostCourseEmail\('\$\{sessId\}'\)/);
  assert.match(fn, /Open post-course email/);
  assert.doesNotMatch(fn, /\.map\(r=>r\.contact\)/);
  assert.doesNotMatch(fn, /emails\.join\('; '\)\}/);
});
