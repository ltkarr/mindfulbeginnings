'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

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

function between(startNeedle, endNeedle) {
  const start = admin.indexOf(startNeedle);
  const end = admin.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0 && end > start, startNeedle);
  return admin.slice(start, end);
}

const sandbox = {
  Date, String, Number, Math, Object,
  classRequests: []
};
vm.createContext(sandbox);
vm.runInContext(
  [
    extractFunction(admin, 'escapeHtml'),
    extractFunction(admin, 'fmtYMD'),
    extractFunction(admin, 'matAddDays'),
    extractFunction(admin, 'matDaysBetween'),
    extractFunction(admin, 'materialsCheckedStamp'),
    between('const PACKING_TOGETHER_DAYS', '// Tracks whether each pre-class reminder')
  ].join('\n'),
  sandbox
);

const TODAY = '2026-10-29';
const instructors = [{ id: 'pj', name: 'Pat Instructor' }];

function sess(partial) {
  return Object.assign({
    id: partial.id || 'ss',
    course: 'Safe Sitter®',
    date: '2027-01-25',
    time: '8:30 AM',
    location: 'Host home',
    city: 'Potomac',
    isVirtual: false,
    isCancelled: false,
    isHold: false,
    hasHost: true
  }, partial);
}

test('notes, requests, rosters, and a saved field each supply an expected count', () => {
  assert.equal(sandbox.parseParticipantCount('6'), 6);
  assert.equal(sandbox.parseParticipantCount('11 7th graders'), 11);
  assert.equal(sandbox.parseParticipantCount('4-6'), 6);
  assert.equal(sandbox.parseParticipantCount('4 to 6'), 6);
  assert.equal(sandbox.expectedFromNotes('Expected participants: 6 kids ages 10–14'), 6);
  assert.equal(sandbox.expectedFromNotes('About 8 students expected. Pay $100.'), 8);
  assert.equal(sandbox.expectedFromNotes('8–10 moms; a couple of babies may be present'), 10);
  assert.equal(sandbox.expectedFromNotes('Bring a 6-foot folding table. Class runs 6:15–7:15 PM.'), null);
  assert.equal(sandbox.expectedFromNotes('Capped at 30.'), null);

  const saved = sess({ participantsExpected: 4, notes: 'Expected participants: 6', billedHeadcount: 9 });
  assert.equal(sandbox.participantsExpectedCount(saved), 4);

  const notes = sess({ id: 'ss270125', notes: 'Expected participants: 6 kids ages 10–14 (two are 10).', maxStudentsOverride: 6 });
  assert.equal(sandbox.participantsExpectedCount(notes), 6);

  sandbox.classRequests = [{ session_id: 'req', payload: { expectedCount: '4-6' } }];
  assert.equal(sandbox.participantsExpectedCount(sess({ id: 'req', notes: '' })), 6);
  sandbox.classRequests = [];

  const roster = sess({ hasHost: false, billedHeadcount: 11, notes: '' });
  assert.equal(sandbox.participantsExpectedCount(roster), 11);

  const hostCap = sess({ hasHost: true, maxStudentsOverride: 8, notes: 'Food: host provides a meal.' });
  assert.equal(sandbox.participantsExpectedCount(hostCap), 8);

  const publicCap = sess({ hasHost: false, isPrivate: false, maxStudentsOverride: 16, notes: '' });
  assert.equal(sandbox.participantsExpectedCount(publicCap), null);
});

test('the packing list shows registered and expected, and packs for the larger number', () => {
  const session = sess({
    id: 'ss270125',
    code: 'SS-270125',
    contactName: 'PJ Ju',
    notes: 'Expected participants: 6 kids ages 10–14.'
  });
  const regs = [
    { sessionId: 'ss270125', payStatus: 'paid', studentName: 'One' },
    { sessionId: 'ss270125', payStatus: 'paid', studentName: 'Two' },
    { sessionId: 'ss270125', payStatus: 'waitlist', studentName: 'Wait' }
  ];
  sandbox.sessionMatNeeds = function (s, n) {
    return n > 8 ? { infant: 2, child: 2 } : { infant: 1, child: 1 };
  };
  sandbox.sessionBookNeeds = function (s, n) {
    return n > 0 ? { ssHandbook: n } : null;
  };
  sandbox.matPlanForSession = function (draft) {
    const n = Number(draft.headcount) || 0;
    return {
      skip: false,
      books: n ? [{ kind: 'ssHandbook', need: n }] : [],
      lines: n ? [{ kind: 'infant', need: n > 8 ? 2 : 1, consumable: false }] : []
    };
  };
  const built = sandbox.packingBuildModel([session], instructors, {}, TODAY, 90, regs);
  const row = built.rows[0];
  assert.equal(row.registered, 2);
  assert.equal(row.expected, 6);
  assert.equal(sandbox.packingKitCount(session, 2), 6);
  assert.equal(row.bring, 'Bring: 6 Safe Sitter handbooks, 1 infant manikin');
  const screen = sandbox.packingGroupsHtml(built);
  const pdf = sandbox.packingPrintHtml(built, new Date('2026-10-29T15:00:00Z'));
  assert.match(screen, /2 participants registered/);
  assert.match(screen, /Participants expected: 6/);
  assert.match(pdf, /2 participants registered/);
  assert.match(pdf, /Participants expected: 6/);

  const big = sess({ id: 'big', participantsExpected: 9, notes: '' });
  const nine = sandbox.packingBuildModel([big], instructors, {}, TODAY, 90, [
    { sessionId: 'big', payStatus: 'paid', studentName: 'A' },
    { sessionId: 'big', payStatus: 'paid', studentName: 'B' }
  ]);
  assert.equal(nine.rows[0].registered, 2);
  assert.equal(nine.rows[0].expected, 9);
  assert.equal(nine.rows[0].bring, 'Bring: 9 Safe Sitter handbooks, 2 infant manikins');

  const open = sess({ id: 'open', hasHost: false, notes: '', participantsExpected: null, maxStudentsOverride: null });
  const none = sandbox.packingBuildModel([open], instructors, {}, TODAY, 90, []);
  assert.equal(none.rows[0].expected, null);
  assert.match(sandbox.packingGroupsHtml(none), /Participants expected: not set/);
  assert.equal(none.rows[0].bring, '');

  delete sandbox.sessionMatNeeds;
  delete sandbox.sessionBookNeeds;
  delete sandbox.matPlanForSession;
  assert.match(extractFunction(admin, 'syncOneSessionKit'), /packingKitCount\(s, registeredNow\)/);
  assert.match(admin, /participantsExpectedFieldHtml/);
  assert.match(admin, /'m-expected'/);
  assert.match(admin, /Participants expected/);
});
