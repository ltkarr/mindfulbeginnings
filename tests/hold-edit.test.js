'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

test('a hold opens the same edit form and still stays off public registration', () => {
  const menu = admin.slice(admin.indexOf('function openSessionMenu'), admin.indexOf('// ─── ADDITIONAL COSTS HELPERS'));
  assert.match(menu, /Publish to instructors/);
  assert.match(menu, /label:'✏️ Edit session',act:`openEditSession\('\$\{sessId\}'\)`/);
  assert.doesNotMatch(menu, /Edit hold/);
  // Edit session is shared with holds: it is pushed after the non-hold branch closes.
  const holdBranch = menu.indexOf('if(s.isHold){');
  const editItem = menu.indexOf("label:'✏️ Edit session'");
  const addStudent = menu.indexOf('Add student');
  assert.ok(holdBranch > 0 && editItem > holdBranch);
  assert.ok(addStudent > holdBranch && addStudent < editItem);

  const rowAt = admin.indexOf('if(s.isHold){\n        const seats');
  const row = admin.slice(rowAt, admin.indexOf('if(s.isCustomJob){', rowAt));
  assert.match(row, /\$\{instr\}/);
  assert.match(row, /ON HOLD/);
  assert.doesNotMatch(row, /<td style="color:var\(--muted\)">—<\/td>/);

  const edit = admin.slice(admin.indexOf('function openEditSession'), admin.indexOf('async function saveSession'));
  assert.match(edit, /assignedInstrId=\(jobDataCache\[s\.id\]\|\|\{\}\)\.instructorId\|\|s\.instructorId/);
  assert.match(edit, /id="m-hold"/);
  assert.match(edit, /id="m-date"/);
  assert.match(edit, /id="m-time"/);
  assert.match(edit, /id="m-loc"/);
  assert.match(edit, /id="m-notes"/);
  assert.match(edit, /id="m-hold-term"/);
  assert.match(edit, /id="m-hold-payment"/);
  assert.match(edit, /id="m-instr"/);
  assert.match(edit, /Save changes/);

  const save = admin.slice(admin.indexOf('async function saveSession'), admin.indexOf('async function deleteSession'));
  assert.match(save, /if\(!date&&!isHold\)/);
  assert.match(save, /holdTerm/);
  assert.match(save, /holdPayment/);
  assert.match(save, /instructorId:preInstrId/);
  assert.match(save, /notes:document\.getElementById\('m-notes'\)\.value/);
  assert.match(save, /location:document\.getElementById\('m-loc'\)\.value/);
  assert.match(save, /isHold,reservedSeats,holdTerm,holdPayment/);

  const cjForm = admin.slice(admin.indexOf('function openEditCustomJob'), admin.indexOf('function toggleCustomHoldMode'));
  assert.match(cjForm, /id="cj-hold"/);
  assert.match(cjForm, /id="cj-hold-term"/);
  assert.match(cjForm, /id="cj-hold-payment"/);
  assert.match(cjForm, /id="cj-date"/);
  assert.match(cjForm, /id="cj-notes"/);
  const cj = admin.slice(admin.indexOf('function toggleCustomHoldMode'), admin.indexOf('function toggleVirtualFields'));
  assert.match(cj, /if\(!date&&!isHold\)/);
  assert.match(cj, /getElementById\('cj-hold'\)/);
  assert.match(cj, /isHold,reservedSeats,holdTerm,holdPayment/);

  const addReg = admin.slice(admin.indexOf('function openAddReg'), admin.indexOf('async function saveReg'));
  assert.match(addReg, /!s\.isHold/);

  const pub = fs.readFileSync(path.join(root, 'js/public-sessions.js'), 'utf8');
  assert.match(pub, /flagOn\(row, 'is_hold'\) \|\| flagOn\(row, 'isHold'\)\) return false/);
});
