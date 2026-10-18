'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'migrations/20261018_fix_instructor_uploads.sql'), 'utf8');

function extractFn(src, name) {
  let start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  if (src.slice(Math.max(0, start - 6), start) === 'async ') start -= 6;
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

test('upload migration adds the columns and a security-definer folder check', () => {
  assert.match(sql, /add column if not exists headshot_path text/);
  assert.match(sql, /add column if not exists w9_path text/);
  assert.match(sql, /add column if not exists w9_received_date date/);
  assert.match(sql, /function public\.is_instructor_folder\(p_name text\)/);
  assert.match(sql, /security definer/);
  assert.match(sql, /id::text = \(storage\.foldername\(p_name\)\)\[1\]/);
  assert.match(sql, /grant execute on function public\.is_instructor_folder\(text\) to anon, authenticated/);
  assert.match(sql, /drop policy if exists "anon upload to instructor-docs"/);
  assert.match(sql, /drop policy if exists "Instructors can upload docs"/);
  assert.match(sql, /create policy "portal insert instructor-docs"/);
  assert.match(sql, /create policy "portal update instructor-docs"/);
  assert.match(sql, /storage\.filename\(name\) not like 'w9\.%'/);
  assert.match(sql, /create policy "portal read instructor-docs"/);
  assert.doesNotMatch(sql, /drop policy if exists "admin full access to instructor-docs"/);
  assert.doesNotMatch(admin, /rpc\(\s*['"]is_instructor_folder/);
  assert.doesNotMatch(instructor, /20261018_fix_instructor_uploads/);
});

test('instructorToDB does not clear headshot_path and maps the new paperwork columns', () => {
  const start = admin.indexOf('const INSTRUCTOR_LEVELS=');
  const end = admin.indexOf('function jobFromDB');
  const sandbox = {};
  vm.runInNewContext(admin.slice(start, end) + `
    globalThis.instructorFromDB = instructorFromDB;
    globalThis.instructorToDB = instructorToDB;
    globalThis.setHeadshotCol = (v) => { HEADSHOT_PATH_COL = v; };
  `, sandbox);

  const blank = sandbox.instructorToDB({
    id: 'i1', name: 'Ada', pin: '111111',
    headshotPath: '', w9Path: '', w9ReceivedDate: '',
    headshotCompleted: true, w9Submitted: false
  });
  assert.equal(Object.prototype.hasOwnProperty.call(blank, 'headshot_path'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(blank, 'w9_path'), false);
  assert.equal(Object.prototype.hasOwnProperty.call(blank, 'w9_received_date'), false);
  assert.equal(blank.headshot_completed, true);
  assert.equal(blank.w9_submitted, false);

  const saved = sandbox.instructorToDB({
    id: 'i1', name: 'Ada', pin: '111111',
    headshotPath: 'i1/headshot.heic',
    w9Path: 'i1/w9.pdf',
    w9ReceivedDate: '2026-10-18',
    headshotCompleted: true,
    w9Submitted: true
  });
  assert.equal(saved.headshot_path, 'i1/headshot.heic');
  assert.equal(saved.w9_path, 'i1/w9.pdf');
  assert.equal(saved.w9_received_date, '2026-10-18');

  const loaded = sandbox.instructorFromDB({
    id: 'i1', name: 'Ada', pin: '111111',
    w9_path: 'i1/w9.pdf',
    w9_received_date: '2026-10-01',
    w9_submitted: true,
    headshot_path: 'i1/headshot.jpg',
    headshot_completed: true
  });
  assert.equal(loaded.w9Path, 'i1/w9.pdf');
  assert.equal(loaded.w9ReceivedDate, '2026-10-01');
  assert.equal(loaded.w9Submitted, true);
  assert.equal(loaded.headshotPath, 'i1/headshot.jpg');
  assert.equal(loaded.headshotCompleted, true);
  const roundTrip = sandbox.instructorToDB(loaded);
  assert.equal(roundTrip.headshot_path, 'i1/headshot.jpg');
  const cleared = sandbox.instructorFromDB({ id: 'i2', name: 'Bea', pin: '222222' });
  assert.equal(cleared.headshotPath, '');
  assert.equal(Object.prototype.hasOwnProperty.call(sandbox.instructorToDB(cleared), 'headshot_path'), false);

  sandbox.setHeadshotCol(false);
  const deferred = sandbox.instructorToDB({
    id: 'i1', name: 'Ada', pin: '111111', headshotPath: 'i1/headshot.jpg'
  });
  assert.equal(Object.prototype.hasOwnProperty.call(deferred, 'headshot_path'), false);
});

test('adminUploadInstructorDoc maps each document type to its path and column', async () => {
  const calls = [];
  const roster = [{ id: 'abc', name: 'Ada' }];
  const sandbox = {
    instructors: roster,
    console,
    showToast() {},
    renderInstructors() { calls.push('render'); },
    openInstructorProfile(id) { calls.push(['profile', id]); },
    fmtYMD() { return '2026-10-18'; },
    HEADSHOT_PATH_COL: true,
    W9_PATH_COL: true,
    W9_RECEIVED_COL: true,
    sb: {
      storage: {
        from(bucket) {
          return {
            upload(filePath, file, opts) {
              calls.push({ op: 'upload', bucket, path: filePath, opts, name: file.name });
              return Promise.resolve({ error: null });
            }
          };
        }
      },
      from(table) {
        return {
          update(patch) {
            const snap = Object.assign({}, patch);
            return {
              eq(col, id) {
                calls.push({ op: 'update', table, col, id, patch: snap });
                return Promise.resolve({ error: null });
              }
            };
          }
        };
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(
    [
      extractFn(admin, 'instructorDocContentType'),
      extractFn(admin, 'instructorUploadErrorText'),
      extractFn(admin, 'adminUploadInstructorDoc')
    ].join('\n'),
    sandbox
  );

  await sandbox.adminUploadInstructorDoc('abc', 'w9', { name: 'Form.PDF', size: 1000, type: 'application/pdf' });
  const w9up = calls.find((c) => c.op === 'upload' && c.path === 'abc/w9.pdf');
  assert.ok(w9up);
  assert.equal(w9up.bucket, 'instructor-docs');
  assert.equal(w9up.opts.upsert, true);
  assert.equal(w9up.opts.contentType, 'application/pdf');
  const w9row = calls.find((c) => c.op === 'update' && c.patch.w9_path);
  assert.deepEqual(w9row.patch, {
    w9_path: 'abc/w9.pdf',
    w9_submitted: true,
    w9_received_date: '2026-10-18'
  });

  await sandbox.adminUploadInstructorDoc('abc', 'headshot', { name: 'me.HEIC', size: 2000, type: '' });
  const hs = calls.find((c) => c.op === 'upload' && c.path === 'abc/headshot.heic');
  assert.ok(hs);
  assert.equal(hs.opts.upsert, true);
  assert.equal(hs.opts.contentType, 'image/heic');
  const hsrow = calls.find((c) => c.op === 'update' && c.patch.headshot_path);
  assert.equal(hsrow.patch.headshot_path, 'abc/headshot.heic');
  assert.equal(hsrow.patch.headshot_completed, true);

  await sandbox.adminUploadInstructorDoc('abc', 'cpr', { name: 'card.jpg', size: 10, type: 'image/jpeg' });
  assert.ok(calls.some((c) => c.op === 'upload' && c.path === 'abc/cpr.jpg'));
  assert.ok(calls.some((c) => c.op === 'update' && c.patch.cpr_cert_path === 'abc/cpr.jpg'));

  await sandbox.adminUploadInstructorDoc('abc', 'license', { name: 'id.png', size: 10, type: 'image/png' });
  assert.ok(calls.some((c) => c.op === 'update' && c.patch.license_path === 'abc/license.png'));

  await sandbox.adminUploadInstructorDoc('abc', 'resume', { name: 'cv.pdf', size: 10, type: 'application/pdf' });
  assert.ok(calls.some((c) => c.op === 'update' && c.patch.resume_path === 'abc/resume.pdf'));

  const before = calls.length;
  await sandbox.adminUploadInstructorDoc('abc', 'license', { name: 'id.gif', size: 10, type: 'image/gif' });
  await sandbox.adminUploadInstructorDoc('abc', 'headshot', { name: 'big.jpg', size: 10 * 1024 * 1024 + 1, type: 'image/jpeg' });
  assert.equal(calls.length, before);
  assert.equal(roster[0].w9Path, 'abc/w9.pdf');
  assert.equal(roster[0].w9Submitted, true);
  assert.equal(roster[0].headshotPath, 'abc/headshot.heic');
  assert.equal(roster[0].headshotCompleted, true);
  assert.equal(roster[0].licensePath, 'abc/license.png');
  assert.ok(calls.some((c) => c[0] === 'profile' && c[1] === 'abc'));
});

test('wrapProgress no longer requires instructor follow-up or the host eval', () => {
  const body = extractFn(admin, 'wrapProgress');
  assert.doesNotMatch(body, /instrFollowupSent/);
  assert.doesNotMatch(body, /evalSentToHost/);
  const sandbox = {
    isInstructorPaymentDone(s, jdi) { return !!(jdi && jdi.payStatus === 'paid'); },
    isVendorFairSession(s) { return !!(s && s.fair); },
    wrapReportTasks(s) { return s && s.report ? [{ field: 'repNotified' }] : []; }
  };
  vm.createContext(sandbox);
  vm.runInContext(body, sandbox);

  const klass = sandbox.wrapProgress({ report: true }, {
    repNotified: true,
    parentLetterSent: true,
    payStatus: 'paid',
    instrFollowupSent: false,
    evalSentToHost: false
  });
  assert.equal(klass.wrapTotal, 3);
  assert.equal(klass.wrapAllDone, true);

  const missingLetter = sandbox.wrapProgress({ report: true }, {
    repNotified: true,
    parentLetterSent: false,
    payStatus: 'paid',
    instrFollowupSent: true,
    evalSentToHost: true
  });
  assert.equal(missingLetter.wrapAllDone, false);

  const fair = sandbox.wrapProgress({ fair: true }, {
    payStatus: 'paid',
    instrFollowupSent: false,
    evalSentToHost: false
  });
  assert.equal(fair.wrapTotal, 1);
  assert.equal(fair.wrapAllDone, true);
});

test('instructor portal accepts HEIC and treats a stored W-9 as on file', () => {
  assert.match(instructor, /id="upload-license"[^>]*accept="\.pdf,\.jpg,\.jpeg,\.png,\.heic"/);
  assert.match(instructor, /id="upload-headshot"[^>]*accept="\.jpg,\.jpeg,\.png,\.webp,\.heic"/);
  const w9 = extractFn(instructor, 'renderW9');
  assert.match(w9, /me\.w9Path\|\|me\.w9Submitted/);
  assert.match(w9, /W-9 on file/);
  assert.match(extractFn(instructor, 'uploadErrorText'), /e\.code/);
  assert.match(extractFn(instructor, 'handleUpload'), /uploadErrorText\(e\)/);
  assert.match(extractFn(admin, 'openEditInstructor'), /id="m-iw9"/);
  assert.match(extractFn(admin, 'openEditInstructor'), /id="m-iw9date"/);
  assert.match(extractFn(admin, 'openEditInstructor'), /id="m-iheadshot"/);
  assert.match(extractFn(admin, 'openEditInstructor'), /Contract signed /);
  assert.match(admin, /Mark received \/ Upload/);
  assert.match(admin, /getSignedUrl\(i\.w9Path\)/);
  assert.match(admin, /instructorDocRow\(i,'w9','W-9',w9Url,'View W-9','W-9 not on file',w9Mark\)/);
  assert.match(admin, /const w9Mark=i\.w9Submitted\?'':`<button type="button" class="btn sm"/);
  assert.doesNotMatch(extractFn(admin, 'instructorDocRow'), /<img/);
});
