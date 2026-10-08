'use strict';

const fs = require('fs');
const path = require('path');
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

test('job-accept emails send a separate message to Lindsay and the instructor', () => {
  const fn = extractFn(instructor, 'sendJobAcceptedNotification');
  assert.match(fn, /TPL_LINDSAY_JOB_NOTIFY,Object\.assign\(\{\},shared,\{message:lindsayMessage\}\)/);
  assert.match(fn, /TPL_INSTRUCTOR_JOB_CONFIRM,Object\.assign\(\{\},shared,\{message:instructorMessage\}\)/);
  assert.match(fn, /accepted the \$\{session\.course\}/);
  assert.match(fn, /You are confirmed to teach/);
  assert.equal(fn.includes('message:params'), false);
  const onboarding = extractFn(instructor, 'checkAndNotifyOnboardingComplete');
  assert.match(onboarding, /template_iqkujzi/);
  assert.match(onboarding, /message:/);
  const cancel = extractFn(instructor, 'sendJobCancelledNotification');
  assert.match(cancel, /template_c94yuzm|TPL_LINDSAY_JOB_CANCEL/);
  assert.match(cancel, /message:`/);
});
