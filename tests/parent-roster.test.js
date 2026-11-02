'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');

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

function between(src, startMark, endMark) {
  const start = src.indexOf(startMark);
  const end = src.indexOf(endMark, start + startMark.length);
  assert.ok(start >= 0 && end > start, startMark + ' .. ' + endMark);
  return src.slice(start, end);
}

const names = [
  'escapeHtml', 'bookingApi', 'isAdultCourse', 'partnerNameOf', 'notesWithoutPartner',
  'rosterPeople', 'rosterNameCell', 'rosterCountPhrase', 'fmtSessDate',
  'parentRosterPlace', 'openRoster'
];

function kid(partial) {
  return Object.assign({
    sessionId: 's1',
    studentName: 'Emma Smith',
    grade: '6th grade',
    age: 11,
    dob: '2015-04-02',
    parentName: 'Jamie Shah',
    contact: 'jamie@example.com / 703-555-0142',
    cprPermission: 'yes',
    emergencyAuth: 'yes',
    waiverSigned: true,
    photoConsent: 'no',
    payStatus: 'paid',
    paymentMethod: 'venmo',
    notes: 'Peanut allergy. Bring inhaler.'
  }, partial);
}

const session = {
  id: 's1',
  course: 'Safe Sitter®',
  date: '2026-11-14',
  time: '9:00 AM - 2:00 PM',
  city: 'Bethesda',
  state: 'MD',
  zip: '20817',
  location: 'Host home',
  hostAddress: '8803 Bradmoor Drive',
  hostPhone: '703-555-0199',
  contactName: 'Lynne Chandler',
  wifiInfo: 'HomeNet-guest',
  code: 'SS-104'
};

function loadRoster() {
  const written = [];
  const sandbox = {
    sessions: [session],
    registrations: [
      kid({ studentName: 'Noah Patel', grade: '5th grade', age: 10, parentName: 'Priya Shah', contact: 'priya@example.com', photoConsent: 'yes', payStatus: 'unpaid', paymentMethod: 'zelle', notes: '' }),
      kid({ studentName: 'Olivia Chen', payStatus: 'cancelled' }),
      kid()
    ],
    sessionInstructorNames: function () { return 'Kim Varner'; },
    showToast: function () { throw new Error('popup was blocked'); },
    localStorage: {
      getItem: function (k) { throw new Error('roster read storage ' + k); },
      setItem: function () { throw new Error('roster wrote storage'); }
    },
    sessionStorage: {
      getItem: function (k) { throw new Error('roster read session storage ' + k); },
      setItem: function () { throw new Error('roster wrote session storage'); }
    },
    window: {
      open: function () {
        return {
          document: {
            title: '',
            write: function (html) { written.push(html); },
            close: function () {}
          }
        };
      }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(names.map((n) => extractFunction(admin, n)).join('\n'), sandbox);
  return { sandbox, written };
}

const PRIVATE = [
  /jamie@example\.com/i,
  /priya@example\.com/i,
  /703-555-0142/,
  /703-555-0199/,
  /Jamie Shah/,
  /Priya Shah/,
  /Olivia Chen/,
  /6th grade/,
  /5th grade/,
  /Peanut/i,
  /inhaler/i,
  /allerg/i,
  /8803 Bradmoor/,
  /20817/,
  /Lynne Chandler/,
  /HomeNet/,
  /photo consent/i,
  />Photo</,
  />Waiver</,
  />Contact</,
  /Parent \/ guardian/,
  />Grade</,
  />Payment</,
  />Notes</,
  /Venmo/i,
  /Zelle/i,
  /\bPaid\b/,
  /\bUnpaid\b/,
  /CPR/,
  /Emerg/,
  /2015-04-02/,
  /<input/i,
  /checkbox/i
];

test('session menu Roster opens as names only, every time', () => {
  const { sandbox, written } = loadRoster();
  sandbox.openRoster('s1');
  sandbox.openRoster('s1');
  assert.equal(written.length, 2);
  assert.equal(written[0], written[1]);
  const html = written[0];
  assert.match(html, /For families\. Names only\./);
  assert.match(html, /Names only/);
  assert.match(html, /Emma Smith/);
  assert.match(html, /Noah Patel/);
  assert.match(html, /Safe Sitter/);
  assert.match(html, /Bethesda, MD/);
  assert.match(html, /Kim Varner/);
  assert.match(html, /2 students registered/);
  assert.match(html, />Student name</);
  PRIVATE.forEach((re) => assert.doesNotMatch(html, re));
  assert.equal((html.match(/<th[\s>]/g) || []).length, 2);
});

test('parent roster place is city and state, or Virtual', () => {
  const { sandbox } = loadRoster();
  assert.equal(sandbox.parentRosterPlace(session), 'Bethesda, MD');
  assert.equal(sandbox.parentRosterPlace({ isVirtual: true, city: 'Bethesda', hostAddress: '1 Secret St' }), 'Virtual');
  assert.equal(sandbox.parentRosterPlace({ city: 'Virtual', state: 'MD', hostAddress: '1 Secret St' }), 'Virtual');
  assert.equal(sandbox.parentRosterPlace({ city: 'Rockville' }), 'Rockville');
  assert.equal(sandbox.parentRosterPlace({ location: '123 Oak Street', hostAddress: '123 Oak Street' }), 'TBD');
});

test('adult parent roster lists both names and hides the partner note', () => {
  const { sandbox, written } = loadRoster();
  sandbox.sessions[0] = Object.assign({}, session, { id: 's2', course: 'Baby Ready', city: 'Arlington', state: 'VA' });
  sandbox.registrations = [{
    sessionId: 's2',
    studentName: 'Alex Rivera',
    grade: 'Adult',
    age: 34,
    parentName: 'Alex Rivera',
    contact: 'alex@example.com',
    photoConsent: 'yes',
    waiverSigned: true,
    payStatus: 'paid',
    paymentMethod: 'paypal',
    notes: '[Partner: Jordan Lee] tree nut allergy'
  }];
  sandbox.openRoster('s2');
  const html = written[0];
  assert.match(html, /Alex Rivera/);
  assert.match(html, /Jordan Lee/);
  assert.match(html, /For families\. Names only\./);
  assert.match(html, />Participant name</);
  assert.match(html, /1 participant registered/);
  assert.doesNotMatch(html, /tree nut/i);
  assert.doesNotMatch(html, /allerg/i);
  assert.doesNotMatch(html, /alex@example\.com/);
  assert.doesNotMatch(html, /paypal/i);
  assert.doesNotMatch(html, />Photo</);
  assert.doesNotMatch(html, /Adult/);
});

test('session menu Roster source does not print private columns or remember a view', () => {
  const fn = extractFunction(admin, 'openRoster');
  assert.match(fn, /rosterNameCell\(r\)/);
  assert.match(fn, /For families\. Names only\./);
  assert.doesNotMatch(fn, /r\.photoConsent|r\.grade|r\.parentName|r\.contact|r\.notes|r\.age|r\.dob/);
  assert.doesNotMatch(fn, /r\.cprPermission|r\.waiverSigned|r\.emergencyAuth|hostPhone|wifiInfo|hostAddress/);
  assert.doesNotMatch(fn, /paymentHowText|notesForPaymentStatus|rosterSettlementLabel|localStorage|sessionStorage/);
  assert.match(between(admin, 'function openSessionMenu', 'function sessionJobNotesText'), /openRoster\('\$\{sessId\}'\)/);
});

test('instructor roster still includes photo consent and is separate from the family list', () => {
  const section = between(admin, 'function classRosterSection', 'function emailFactsHtml');
  assert.match(section, /Photo/);
  assert.match(section, /privateCols/);
  const reminder = between(admin, 'function openInstructorReminder', 'function logEmailError');
  assert.match(reminder, /privateCols:\s*true/);
  assert.match(reminder, /classRosterSection/);
  const printFn = extractFunction(instructor, 'printRoster');
  assert.match(printFn, /Parent \/ guardian/);
  assert.match(printFn, />Contact</);
  assert.match(printFn, /function printRoster/);
  assert.doesNotMatch(printFn, /For families\. Names only\./);
});
