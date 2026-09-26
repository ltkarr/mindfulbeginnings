'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

function fnStart(name) {
  const asyncAt = admin.indexOf('async function ' + name);
  const plainAt = admin.indexOf('function ' + name);
  if (asyncAt >= 0 && (plainAt < 0 || asyncAt < plainAt)) return asyncAt;
  return plainAt;
}
function sliceFn(name, nextName) {
  const start = fnStart(name);
  const end = fnStart(nextName);
  assert.ok(start > 0 && end > start, name + ' before ' + nextName);
  return admin.slice(start, end);
}

function loadSaver() {
  const src = [
    sliceFn('sessionToDB', 'sessionUpsertRejectColumn'),
    sliceFn('sessionUpsertRejectColumn', 'applySessionUpsertReject'),
    sliceFn('applySessionUpsertReject', 'blankSessionUpsertFlags'),
    sliceFn('blankSessionUpsertFlags', 'upsertSessionRow'),
    sliceFn('upsertSessionRow', 'regFromDB'),
    sliceFn('sessionOptionalColToast', 'regFromDB')
  ].join('\n');
  const context = {
    LEGACY_CREATED_AT: 1785542400000,
    CANCEL_COLS: true,
    REQUIRES_SS_COL: true,
    REQUIRES_RN_COL: true,
    EXTERNAL_URL_COL: true,
    ADMIN_PRIVATE_NOTES_COL: true,
    HOSTED_FOR_COL: true,
    ORIGINATED_COL: true,
    EXTRA_DAYS_COL: true,
    EXTRA_DATES_COL: true,
    CLOSURES_COL: true,
    INSTR_INFO_COL: true,
    payloads: [],
    sb: {
      from(table) {
        assert.equal(table, 'sessions');
        return {
          upsert(row) {
            context.payloads.push(row);
            if ('hosted_for' in row) {
              return Promise.resolve({
                error: {
                  code: 'PGRST204',
                  message: "Could not find the 'hosted_for' column of 'sessions' in the schema cache"
                }
              });
            }
            return Promise.resolve({ error: null });
          }
        };
      }
    }
  };
  vm.createContext(context);
  vm.runInContext(src, context);
  return context;
}

const dabble = {
  id: 'c4aab029-4ee5-4c80-9da0-1d457eb3691b',
  code: 'MFBC-260918',
  course: "My First Babysitter's Club!",
  date: '2026-09-18',
  time: '4:00 – 5:00 PM',
  location: 'District Dabble Lab',
  instrPayOverride: 300,
  priceOverride: null,
  isCustomJob: true,
  isHold: false,
  isCancelled: true,
  notes: 'flat pay updated',
  instructorId: 'fd665ed2-fa6d-4add-aeac-bccb6fb0eace',
  createdAt: 1788373164797,
  adminPrivateNotes: '',
  holdTerm: '',
  holdPayment: '',
  extraDates: [],
  extraDays: [],
  closures: []
};

test('a missing hosted_for column does not drop flat pay or other edits', async () => {
  const ctx = loadSaver();
  const saved = await ctx.upsertSessionRow(dabble);
  assert.equal(saved.error, null);
  assert.equal(saved.missingHostedFor, true);
  assert.equal(ctx.payloads.length, 2);
  assert.equal(ctx.payloads[0].instr_pay_override, 300);
  assert.equal(ctx.payloads[0].notes, 'flat pay updated');
  assert.equal(ctx.payloads[0].location, 'District Dabble Lab');
  assert.ok('hosted_for' in ctx.payloads[0]);
  assert.equal(ctx.payloads[1].instr_pay_override, 300);
  assert.equal(ctx.payloads[1].is_custom_job, true);
  assert.equal(ctx.payloads[1].is_cancelled, true);
  assert.equal(ctx.payloads[1].instructor_id, dabble.instructorId);
  assert.equal('hosted_for' in ctx.payloads[1], false);
  assert.equal(ctx.sessionOptionalColToast(saved), '');
});

test('a hold keeps is_hold, optional date, term, and payment', async () => {
  const ctx = loadSaver();
  const saved = await ctx.upsertSessionRow(Object.assign({}, dabble, {
    isHold: true,
    isCustomJob: true,
    isCancelled: false,
    date: '',
    time: '6:30–7:30pm',
    holdTerm: 'Fall 2026',
    holdPayment: 'Paid by check, $780',
    reservedSeats: 12,
    instrPayOverride: 150,
    location: 'Takoma Presbyterian Church',
    notes: 'still on hold'
  }));
  assert.equal(saved.error, null);
  const row = ctx.payloads[1];
  assert.equal(row.is_hold, true);
  assert.equal(row.date, null);
  assert.equal(row.time, '6:30–7:30pm');
  assert.equal(row.hold_term, 'Fall 2026');
  assert.equal(row.hold_payment, 'Paid by check, $780');
  assert.equal(row.reserved_seats, 12);
  assert.equal(row.instr_pay_override, 150);
  assert.equal(row.location, 'Takoma Presbyterian Church');
  assert.equal(row.notes, 'still on hold');
  assert.equal('hosted_for' in row, false);
});

test('an unrelated database error is not retried away', async () => {
  const ctx = loadSaver();
  ctx.sb = {
    from() {
      return { upsert() { return Promise.resolve({ error: { message: 'permission denied for table sessions' } }); } };
    }
  };
  const saved = await ctx.upsertSessionRow(dabble);
  assert.ok(saved.error);
  assert.match(saved.error.message, /permission denied/);
  assert.equal(saved.missingHostedFor, false);
});

test('course sessions, custom jobs, and publish all use the shared retry', () => {
  const save = admin.slice(admin.indexOf('async function saveSession'), admin.indexOf('async function deleteSession'));
  const custom = admin.slice(admin.indexOf('async function saveCustomJob'), admin.indexOf('function openEditCustomJob'));
  const editCustom = admin.slice(admin.indexOf('async function saveEditCustomJob'), admin.indexOf('function toggleVirtualFields'));
  const publish = admin.slice(admin.indexOf('async function publishHold'), admin.indexOf('async function cancelSession'));
  for (const block of [save, custom, editCustom, publish]) {
    assert.match(block, /upsertSessionRow\(/);
    assert.doesNotMatch(block, /from\('sessions'\)\.upsert/);
  }
  assert.match(editCustom, /instrPayOverride:Number\(payRaw\)/);
  assert.match(editCustom, /const isHold=!!document\.getElementById\('cj-hold'\)\?\.checked/);
  assert.match(editCustom, /isHold,reservedSeats,holdTerm,holdPayment/);
  assert.match(save, /const isHold=document\.getElementById\('m-hold'\)\?\.checked\|\|false/);
  assert.match(save, /isHold,reservedSeats,holdTerm,holdPayment/);
  assert.match(save, /instructorId:preInstrId/);
  const upserts = admin.match(/from\('sessions'\)\.upsert/g) || [];
  assert.equal(upserts.length, 1);
});
