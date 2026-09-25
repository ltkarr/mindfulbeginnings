'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
const reminderApi = fs.readFileSync(path.join(root, 'api/remind-instructors.js'), 'utf8');
const reminderSql = fs.readFileSync(path.join(root, 'migrations/portal_reminders.sql'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations/admin_private_notes.sql'), 'utf8');

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

function loadMappers() {
  const flags = {
    LEGACY_CREATED_AT: 1,
    ORIGINATED_COL: false,
    HOSTED_FOR_COL: false,
    EXTRA_DATES_COL: false,
    EXTRA_DAYS_COL: false,
    CLOSURES_COL: false,
    INSTR_INFO_COL: false,
    REQUIRES_RN_COL: false,
    REQUIRES_SS_COL: false,
    CANCEL_COLS: false,
    EXTERNAL_URL_COL: false,
    ADMIN_PRIVATE_NOTES_COL: true
  };
  const sandbox = { ...flags };
  vm.runInNewContext(
    [
      extractFn(admin, 'extraDaysFromDB'),
      extractFn(admin, 'closuresFromDB'),
      extractFn(admin, 'sessionFromDB'),
      extractFn(admin, 'sessionToDB')
    ].join('\n'),
    sandbox
  );
  return sandbox;
}

test('private notes are a separate column from instructor-facing notes', () => {
  const { sessionFromDB, sessionToDB } = loadMappers();
  const session = sessionFromDB({
    id: 's1',
    notes: 'Park in the back lot',
    admin_private_notes: 'Girl Scout troop pays net 30. Do not share the rate.'
  });
  assert.equal(session.notes, 'Park in the back lot');
  assert.equal(session.adminPrivateNotes, 'Girl Scout troop pays net 30. Do not share the rate.');

  const row = sessionToDB(session);
  assert.equal(row.notes, 'Park in the back lot');
  assert.equal(row.admin_private_notes, 'Girl Scout troop pays net 30. Do not share the rate.');
});

test('clearing private notes writes null and does not touch instructor notes', () => {
  const { sessionToDB } = loadMappers();
  const row = sessionToDB({
    id: 's1',
    code: 'GS-1',
    course: 'Safe@Home',
    createdAt: 1,
    notes: 'Wear an MB shirt',
    adminPrivateNotes: ''
  });
  assert.equal(row.notes, 'Wear an MB shirt');
  assert.equal(row.admin_private_notes, null);
});

test('a session object that never loaded private notes does not blank the column', () => {
  const { sessionToDB } = loadMappers();
  const row = sessionToDB({ id: 's1', code: 'GS-1', course: 'Safe@Home', createdAt: 1, notes: 'Parking' });
  assert.equal(row.notes, 'Parking');
  assert.equal(Object.prototype.hasOwnProperty.call(row, 'admin_private_notes'), false);
});

test('admin create and edit forms, including custom jobs, have the private notes field', () => {
  const calls = admin.match(/\$\{adminPrivateNotesFieldHtml\(/g) || [];
  assert.equal(calls.length, 4, 'expected the field on add session, edit session, add custom job, and edit custom job');
  assert.match(admin, /Private notes <span[^>]*>\(admin only\)/);
  assert.match(admin, /id="m-private-notes"/);
  assert.match(admin, /adminPrivateNotes:readAdminPrivateNotes\(\)/);
});

test('instructor, public, and reminder surfaces never select the private column', () => {
  assert.doesNotMatch(instructor, /\.select\([^)]*admin_private_notes/);
  assert.doesNotMatch(register, /admin_private_notes|adminPrivateNotes/);
  assert.doesNotMatch(reminderApi, /admin_private_notes|adminPrivateNotes/);
  assert.doesNotMatch(reminderSql, /admin_private_notes/);
  const mentioned = instructor.split('\n').filter(line => line.includes('admin_private_notes'));
  assert.ok(mentioned.length > 0);
  mentioned.forEach(line => {
    assert.match(line.trim(), /^\/\//, 'instructor.html may mention the column only in a comment: ' + line.trim());
  });
  const lists = [
    ...instructor.matchAll(/SESSION_COLS\w*='([^']+)'/g),
    ...instructor.matchAll(/sessions'\)\.select\('([^']+)'\)/g)
  ].map(m => m[1]);
  assert.ok(lists.length >= 3);
  lists.forEach(list => assert.equal(list.split(',').includes('admin_private_notes'), false));
});

test('instructor reminder email keeps using the public notes field only', () => {
  assert.match(admin, /if\(s\.notes\)detailLines\.push\('Notes: '\+s\.notes\)/);
  assert.doesNotMatch(admin, /detailLines\.push\([^;\n]*adminPrivateNotes/);
  assert.doesNotMatch(admin, /EMAIL_(BODY|INTRO|CLOSING|SUBJECT)[^;]{0,400}adminPrivateNotes/);
});

test('migration grants the column to admin and withholds it from anon', () => {
  const sql = migration.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
  assert.match(sql, /add column if not exists admin_private_notes text/i);
  assert.match(sql, /revoke select \(admin_private_notes\), insert \(admin_private_notes\), update \(admin_private_notes\), references \(admin_private_notes\)[\s\S]*from anon, public/i);
  assert.doesNotMatch(sql, /revoke select, insert/i);
  const grants = sql.split(';').map(s => s.trim()).filter(s => /^grant\b/i.test(s));
  assert.equal(grants.length, 1);
  assert.match(grants[0], /admin_private_notes/);
  assert.match(grants[0], /to authenticated/i);
  assert.doesNotMatch(grants[0], /\banon\b/i);
});
