'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'migrations', '20261006_portal_security_additive.sql'), 'utf8');

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

function loadGrades() {
  const sandbox = {};
  vm.runInNewContext(
    [extractFn(register, 'isGirlScoutBadgeCourse'), extractFn(register, 'registrationGradeOptions')].join('\n'),
    sandbox
  );
  return sandbox;
}

function labels(html) {
  return [...html.matchAll(/<option(?: value="")?>([^<]*)<\/option>/g)].map((m) => m[1]).filter((label) => label && label !== 'Select grade...');
}

test('Girl Scout badge workshops offer Kindergarten through 8th, and grade stays required', () => {
  const api = loadGrades();
  const badge = labels(api.registrationGradeOptions('Girl Scouts — First Aid Badge Workshop'));
  assert.deepEqual(badge, [
    'Kindergarten', '1st grade', '2nd grade', '3rd grade', '4th grade',
    '5th grade', '6th grade', '7th grade', '8th grade'
  ]);
  assert.equal(api.isGirlScoutBadgeCourse('Girl Scouts — Cooking Badge Workshop'), true);
  assert.deepEqual(labels(api.registrationGradeOptions('Girl Scouts — Cooking Badge Workshop')), badge);
  assert.ok(badge.includes('2nd grade'));
  assert.equal(badge.includes(''), false);
  const form = register.slice(register.indexOf('async function goToPayment'), register.indexOf('function toggleSitterList') === -1 ? register.length : register.indexOf('// Permission radios'));
  assert.match(register, /if\(!isAdult&&!gradeEl\.value\)/);
  assert.match(register, /gradeSel\.innerHTML=registrationGradeOptions\(s\.course\)/);
  assert.ok(form.length > 0);
});

test('other courses keep their existing grade lists', () => {
  const api = loadGrades();
  assert.deepEqual(labels(api.registrationGradeOptions('Safe Sitter®')), ['6th grade', '7th grade', '8th grade']);
  assert.deepEqual(labels(api.registrationGradeOptions('Safe@Home')), ['3rd grade', '4th grade', '5th grade', '6th grade', '7th grade', '8th grade', '9th grade']);
  assert.deepEqual(labels(api.registrationGradeOptions('All Kids Welcome')), ['3rd grade', '4th grade', '5th grade', '6th grade', '7th grade', '8th grade', '9th grade']);
  assert.deepEqual(labels(api.registrationGradeOptions('Intro to Babysitting')), ['4th grade', '5th grade', '6th grade', '7th grade', '8th grade']);
  assert.deepEqual(labels(api.registrationGradeOptions('Social Ready')), ['4th grade', '5th grade', '6th grade', '7th grade', '8th grade']);
  assert.deepEqual(labels(api.registrationGradeOptions('Ready. Period.')), ['5th grade', '6th grade', '7th grade']);
  assert.deepEqual(labels(api.registrationGradeOptions('Stay Ready: Choking Rescue and CPR')), ['7th grade', '8th grade', '9th grade', '10th grade', '11th grade', '12th grade']);
  assert.deepEqual(labels(api.registrationGradeOptions('Campus Ready: Safety Skills for College Life')), ['11th grade', '12th grade', 'College student']);
  assert.equal(api.isGirlScoutBadgeCourse('Girl Scouts — Intro to Babysitting + First Aid (Cadettes, 2 hours)'), false);
  assert.deepEqual(labels(api.registrationGradeOptions('Girl Scouts — Intro to Babysitting + First Aid (Cadettes, 2 hours)')), ['4th grade', '5th grade', '6th grade', '7th grade', '8th grade']);
  assert.equal(api.isGirlScoutBadgeCourse('Represent Us! Girl Scouts — Monster Birthday Bash Table (Camp Potomac Woods)'), false);
});

test('register_student stores the submitted grade and does not reject a grade value', () => {
  const start = sql.toLowerCase().indexOf('create or replace function public.register_student');
  assert.ok(start >= 0);
  const next = sql.toLowerCase().indexOf('create or replace function', start + 10);
  const fn = sql.slice(start, next > start ? next : sql.length);
  assert.match(fn, /v_clean := p_row - 'pay_status' - 'paypal_tx_id' - 'price_paid' - 'registration_token'/);
  assert.doesNotMatch(fn, /-\s*'grade'/);
  assert.doesNotMatch(fn, /grade/i);
});
