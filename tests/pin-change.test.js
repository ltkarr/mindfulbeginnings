'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'migrations', '20261006_force_pin_change.sql'), 'utf8');

test('the portal stops a flagged instructor on the change screen', () => {
  const login = instructor.slice(instructor.indexOf('async function doLogin'), instructor.indexOf('function enterApp'));
  assert.match(login, /if\(me\.pinChangeRequired\)/);
  assert.match(login, /pinchange-screen/);
  const gate = login.slice(login.indexOf('if(me.pinChangeRequired)'), login.lastIndexOf('enterApp();'));
  assert.match(gate, /return;/);
});

test('a new PIN must be six digits, not a guessable pattern, and not the old PIN', () => {
  const weak = instructor.slice(instructor.indexOf('function weakPin'), instructor.indexOf('async function submitNewPin'));
  assert.match(weak, /same digit six times/);
  assert.match(weak, /six digits in a row/);
  assert.match(weak, /p===me\.pin/);
  assert.match(weak, /different from your old one/);
  const save = instructor.slice(instructor.indexOf('async function submitNewPin'), instructor.indexOf('async function loadData'));
  assert.match(save, /instructor_change_pin/);
  assert.match(save, /res==='same'/);
  assert.match(save, /\^\[0-9\]\{6\}\$/);
});

test('the database function rejects the current PIN and the same weak patterns', () => {
  assert.match(sql, /if p_new_pin = p_pin then return 'same'; end if;/);
  assert.match(sql, /p_new_pin !~ '\^\[0-9\]\{6\}\$'/);
  assert.match(sql, /pin_change_required = false/);
  assert.match(sql, /GRANT EXECUTE ON FUNCTION public\.instructor_change_pin/);
});
