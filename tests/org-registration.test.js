'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'migrations/20261015_org_handles_registration.sql'), 'utf8');

function sliceFn(name, nextName) {
  const start = admin.indexOf('function ' + name);
  const end = admin.indexOf('function ' + nextName);
  assert.ok(start > 0 && end > start, name);
  return admin.slice(start, end);
}

test('organization registration closes public list, code lookup, and register_student', () => {
  const list = sql.slice(sql.indexOf('function public.list_public_sessions'), sql.indexOf('function public.get_session_by_code'));
  const lookup = sql.slice(sql.indexOf('function public.get_session_by_code'), sql.indexOf('function public.register_student'));
  const reg = sql.slice(sql.indexOf('function public.register_student'));
  assert.match(list, /org_handles_registration, false\) = false/);
  assert.match(list, /s\.code is not null/);
  assert.match(lookup, /where s\.code = p_code/);
  assert.match(lookup, /org_handles_registration, false\) = false/);
  assert.doesNotMatch(lookup, /is_private/);
  assert.match(lookup, /case when s\.has_host then null else s\.location end/);
  assert.doesNotMatch(lookup, /host_address/);
  assert.match(reg, /if v_org_reg then/);
  assert.match(reg, /'reason', 'closed'/);
  assert.match(reg, /v_occupied := greatest\(v_rows \* v_per, coalesce\(v_committed, 0\)\)/);
  assert.match(reg, /when 'Safe Sitter®' then 16/);
  assert.match(reg, /when 'Baby Ready \+ CPR Certification' then 12/);
  assert.doesNotMatch(sql, /max_students_override\s*=/);
});

test('existing Beth El and school sessions are flagged, and Troop 37234 is not', () => {
  ['SS-1016', 'SAH-1016', 'SS-NORW-F26', 'LM-BGES-W27', 'CJ-0916', 'CJ-0916-2', 'CJ-0910-2'].forEach((code) => {
    assert.match(sql, new RegExp("'" + code + "'"));
  });
  assert.doesNotMatch(sql, /'GSFA-270303'/);
  assert.doesNotMatch(sql, /'GS-H4782'/);
  assert.match(sql, /code !~ '\^\(GS-\|GSFA-\)'/);
  assert.match(sql, /girl scout\|troop/);
  assert.match(sql, /code = null/);
});

test('the add and edit session forms have an Organization registration checkbox that suppresses the code', () => {
  const add = sliceFn('openAddSession', 'openEditSession');
  const edit = sliceFn('openEditSession', 'confirmNotDuplicate');
  const box = sliceFn('orgRegistrationFieldHtml', 'toggleOrgRegistration');
  const save = admin.slice(admin.indexOf('async function saveSession'), admin.indexOf('async function deleteSession'));
  assert.match(box, /Organization registration/);
  assert.match(box, /id="m-org-reg"/);
  assert.match(box, /public registration limit is 0/);
  assert.match(add, /id="m-code"/);
  assert.match(edit, /id="m-code"/);
  assert.match(add, /orgRegistrationFieldHtml\(null,'m-code'\)/);
  assert.match(edit, /orgRegistrationFieldHtml\(s,'m-code'\)/);
  assert.match(save, /const orgHandlesRegistration=!!document\.getElementById\('m-org-reg'\)\?\.checked/);
  assert.match(save, /if\(orgHandlesRegistration\)\{\s*\/\/ No code is generated[\s\S]*?code=null;/);
  assert.match(admin, /orgHandlesRegistration:r\.org_handles_registration===true/);
  assert.match(admin, /o\.org_handles_registration=!!s\.orgHandlesRegistration/);
  assert.match(admin, /s\.orgHandlesRegistration\?'':s\.code/);
  assert.match(sliceFn('renderCodes', 'copySessionLink'), /s\.orgHandlesRegistration\)return false/);
  assert.match(admin, /if\(!s\|\|s\.orgHandlesRegistration\|\|!s\.code\)return/);
});
