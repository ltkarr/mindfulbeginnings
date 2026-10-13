'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'migrations/20261013_org_committed_seats.sql'), 'utf8');

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

const sandbox = {
  registrations: [],
  seatsPerRegistration: function (course) {
    return course === 'Baby Ready' || course === 'Baby Ready + CPR Certification' ? 2 : 1;
  },
  Array, Object, Number, Math, String, isNaN, isFinite
};
vm.createContext(sandbox);
vm.runInContext(
  ['isLiveReg', 'orgCommittedParticipants', 'registeredSeatCount', 'sessionOccupiedSeats', 'sessionMaxStudents']
    .map((name) => extractFunction(admin, name))
    .join('\n'),
  sandbox
);
sandbox.COURSES = { 'Safe Sitter®': { maxStudents: 16 }, 'Baby Ready': { maxStudents: 12, seatsPerRegistration: 2 } };

function session(overrides) {
  return Object.assign({
    id: 'ss-1016',
    code: 'SS-1016',
    course: 'Safe Sitter®',
    billToOrg: 'Congregation Beth El',
    billedHeadcount: 4
  }, overrides || {});
}

test('a committed org roster fills the seat count before anyone registers', () => {
  sandbox.registrations = [];
  const s = session();
  assert.equal(sandbox.sessionOccupiedSeats(s), 4);
  assert.equal(sandbox.sessionMaxStudents(s), 16);
  assert.equal(16 - sandbox.sessionOccupiedSeats(s), 12);
});

test('registering the committed people does not add a second set of seats', () => {
  const s = session();
  sandbox.registrations = [
    { id: 'a', sessionId: s.id, payStatus: 'paid' },
    { id: 'b', sessionId: s.id, payStatus: 'unpaid' }
  ];
  assert.equal(sandbox.registeredSeatCount(s), 2);
  assert.equal(sandbox.sessionOccupiedSeats(s), 4);
  sandbox.registrations.push(
    { id: 'c', sessionId: s.id, payStatus: 'paid' },
    { id: 'd', sessionId: s.id, payStatus: 'host' }
  );
  assert.equal(sandbox.sessionOccupiedSeats(s), 4);
  sandbox.registrations.push({ id: 'e', sessionId: s.id, payStatus: 'paid' });
  assert.equal(sandbox.sessionOccupiedSeats(s), 5);
});

test('waitlist and cancelled rows do not count, and a blank commitment does not reserve seats', () => {
  const s = session({ billedHeadcount: null });
  sandbox.registrations = [
    { id: 'live', sessionId: s.id, payStatus: 'paid' },
    { id: 'wait', sessionId: s.id, payStatus: 'waitlist' },
    { id: 'cx', sessionId: s.id, payStatus: 'cancelled' }
  ];
  assert.equal(sandbox.sessionOccupiedSeats(s), 1);
  assert.equal(sandbox.orgCommittedParticipants(session({ billToOrg: '', billedHeadcount: 4 })), 0);
  assert.equal(sandbox.orgCommittedParticipants(session({ billedHeadcount: 0 })), 0);
});

test('a couple course counts people, and the commitment is not added on top of registrations', () => {
  const s = session({
    id: 'br',
    course: 'Baby Ready',
    billToOrg: 'Hospital',
    billedHeadcount: 4
  });
  sandbox.registrations = [{ id: 'couple', sessionId: 'br', payStatus: 'paid' }];
  assert.equal(sandbox.registeredSeatCount(s), 2);
  assert.equal(sandbox.sessionOccupiedSeats(s), 4);
  sandbox.registrations.push(
    { id: 'c2', sessionId: 'br', payStatus: 'paid' },
    { id: 'c3', sessionId: 'br', payStatus: 'paid' }
  );
  assert.equal(sandbox.registeredSeatCount(s), 6);
  assert.equal(sandbox.sessionOccupiedSeats(s), 6);
});

test('re-enrolling inside the commitment does not look like an extra seat', () => {
  const s = session();
  sandbox.registrations = [];
  assert.equal(sandbox.sessionOccupiedSeats(s), 4);
  assert.equal(sandbox.sessionOccupiedSeats(s, 1), 4);
  sandbox.registrations = [
    { id: '1', sessionId: s.id, payStatus: 'paid' },
    { id: '2', sessionId: s.id, payStatus: 'paid' },
    { id: '3', sessionId: s.id, payStatus: 'paid' },
    { id: '4', sessionId: s.id, payStatus: 'paid' }
  ];
  assert.equal(sandbox.sessionOccupiedSeats(s, 1), 5);
});

test('the sessions list, registration dropdown, and re-enroll warning use the occupied count', () => {
  const render = admin.slice(admin.indexOf('function renderSessions'), admin.indexOf('// "Materials in lock box"'));
  assert.equal((render.match(/sessionOccupiedSeats\(s\)/g) || []).length, 2);
  assert.doesNotMatch(render, /isLiveReg\(r\)\)\.length\*seatsPerRegistration/);
  const regs = extractFunction(admin, 'renderRegs');
  assert.match(regs, /sessionOccupiedSeats\(s\)/);
  const re = extractFunction(admin, 'reEnrollReg');
  assert.match(re, /sessionOccupiedSeats\(s,1\)/);
  assert.match(re, /after>cap/);
  const bill = extractFunction(admin, 'orgRevenueHeadcount');
  assert.match(bill, /billedHeadcount/);
  assert.doesNotMatch(bill, /sessionOccupiedSeats/);
});

test('registration counts and register_student reserve the committed roster without double counting', () => {
  assert.match(sql, /function public\.org_committed_participants/);
  assert.match(sql, /floor\(s\.billed_headcount\)::int/);
  assert.match(sql, /revoke all on function public\.org_committed_participants\(text\) from public, anon, authenticated/);
  assert.match(sql, /function public\.get_registration_count/);
  assert.match(sql, /function public\.get_all_registration_counts/);
  assert.match(sql, /greatest\(/);
  assert.match(sql, /v_occupied := greatest\(v_rows \* v_per, coalesce\(v_committed, 0\)\)/);
  assert.match(sql, /when 'Safe Sitter®' then 16/);
  assert.match(sql, /when 'Baby Ready \+ CPR Certification' then 12/);
  assert.match(sql, /v_course in \('Baby Ready', 'Baby Ready \+ CPR Certification'\) then 2/);
  assert.match(sql, /not in \('waitlist', 'cancelled', 'canceled', 'refunded'\)/);
  assert.doesNotMatch(sql, /v_rows \* v_per\)\) < v_per/);
});
