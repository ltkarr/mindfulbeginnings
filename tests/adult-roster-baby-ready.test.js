'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
const configSrc = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const booking = require('../js/course-booking.js');

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

const rosterNames = [
  'bookingApi', 'isAdultCourse', 'seatsPerRegistration', 'partnerNameOf',
  'notesWithoutPartner', 'notesWithPartner', 'rosterPeople', 'rosterNameCell',
  'rosterCountPhrase', 'classRosterSection', 'courseAbbr'
];
const sandbox = {
  COURSES: {
    'Grandparents: Getting Started': { adult: true, maxStudents: 16 },
    'Care Ready': { adult: true, maxStudents: 16 },
    'Baby Ready': { adult: true, maxStudents: 12, seatsPerRegistration: 2, price: 225 },
    'Safe Sitter®': { maxStudents: 16 },
    'Campus Ready: Safety Skills for College Life': { maxStudents: 12 }
  },
  COURSE_ABBR: null,
  escapeHtml: function (t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
};
vm.createContext(sandbox);
const abbrStart = admin.indexOf('const COURSE_ABBR=');
const abbrEnd = admin.indexOf('const TITLE_ABBR=', abbrStart);
vm.runInContext(admin.slice(abbrStart, abbrEnd) + '\n' + rosterNames.map((n) => extractFunction(admin, n)).join('\n'), sandbox);

function reg(partial) {
  return Object.assign({
    studentName: 'Alex Rivera',
    grade: '6th grade',
    parentName: 'Alex Rivera',
    contact: 'alex@example.com',
    notes: ''
  }, partial);
}

const session = (course) => ({ course: course, code: 'X-1' });

test('adult roster HTML omits Grade and Parent / guardian', () => {
  for (const course of ['Grandparents: Getting Started', 'Care Ready', 'Baby Ready']) {
    const html = sandbox.classRosterSection(session(course), [
      reg({ studentName: 'Barry Gorman', grade: '—', parentName: 'Barry Gorman' }),
      reg({ studentName: 'Stephanie Sutton', parentName: 'Stephanie Sutton', notes: '[Partner: Jordan Sutton]' })
    ], { when: 'Wednesday, September 30, 2026', where: 'Bethesda', who: 'Kim Varner', privateCols: false });
    assert.equal(sandbox.isAdultCourse(course), true);
    assert.doesNotMatch(html, /Grade/);
    assert.doesNotMatch(html, /Parent \/ guardian/);
    assert.match(html, />Participant</);
    assert.match(html, /Barry Gorman/);
    assert.match(html, /participants registered/);
  }
  const kids = sandbox.classRosterSection(session('Safe Sitter®'), [
    reg({ studentName: 'Emma Smith', grade: '6th grade', parentName: 'Jamie Smith' })
  ], { when: 'Friday', privateCols: false });
  assert.match(kids, />Student</);
  assert.match(kids, />Grade</);
  assert.match(kids, /Parent \/ guardian/);
  assert.match(kids, /6th grade/);
  assert.match(kids, /Jamie Smith/);
  assert.match(kids, /1 student registered/);
  assert.equal(sandbox.isAdultCourse('Safe Sitter®'), false);
});

test('adult instructor-facing roster keeps contact and still drops grade and parent', () => {
  const html = sandbox.classRosterSection(session('Grandparents: Getting Started'), [
    reg({ studentName: 'Susan Post', contact: 'susan@example.com' })
  ], { privateCols: true, when: 'Wednesday' });
  assert.match(html, />Participant</);
  assert.match(html, />Contact</);
  assert.doesNotMatch(html, /Grade/);
  assert.doesNotMatch(html, /Parent \/ guardian/);
  assert.match(html, /susan@example.com/);
});

test('couple roster lists both adults from the partner note', () => {
  const html = sandbox.classRosterSection(session('Baby Ready'), [
    reg({ studentName: 'Alex Rivera', notes: '[Partner: Jordan Lee] extra' })
  ], { when: 'Saturday' });
  assert.match(html, /Alex Rivera/);
  assert.match(html, /Jordan Lee/);
  assert.match(html, /2 participants registered/);
  assert.equal(sandbox.partnerNameOf({ notes: '[Partner: Jordan Lee]' }), 'Jordan Lee');
  assert.equal(sandbox.notesWithoutPartner('[Partner: Jordan Lee] allergy'), 'allergy');
  assert.equal(sandbox.notesWithPartner('allergy', 'Jordan Lee'), '[Partner: Jordan Lee] allergy');
});

test('Baby Ready is $195 per person, $390 per couple, and consumes two people-seats', () => {
  assert.equal(booking.seatsPerRegistration('Baby Ready'), 2);
  assert.equal(booking.seatsPerRegistration('Care Ready'), 1);
  assert.equal(booking.seatsUsed(1, 'Baby Ready'), 2);
  assert.equal(booking.seatsUsed(5, 'Baby Ready'), 10);
  assert.equal(booking.seatsRemaining(12, 5, 'Baby Ready'), 2);
  assert.equal(booking.bookingFits(12, 5, 'Baby Ready'), true);
  assert.equal(booking.bookingFits(12, 6, 'Baby Ready'), false);
  assert.equal(booking.bookingFits(12, 6, 'Safe Sitter®'), true);
  assert.equal(booking.registrationRowCap(12, 'Baby Ready'), 6);
  assert.equal(booking.registrationRowCap(11, 'Baby Ready'), 5);
  assert.equal(booking.registrationRowCap(16, 'Care Ready'), 16);
  assert.equal(booking.peopleCount([
    { studentName: 'Alex Rivera', notes: '[Partner: Jordan Lee]' }
  ], 'Baby Ready'), 2);
  assert.equal(booking.isAdultCourse('Grandparents: Getting Started'), true);
  assert.equal(booking.isAdultCourse('Care Ready'), true);
  assert.equal(booking.isAdultCourse('Baby Ready'), true);
  assert.equal(booking.isAdultCourse('Safe Sitter®'), false);

  const cfg = {};
  vm.runInContext(configSrc + '\nthis.COURSES=COURSES; this.MAX_STUDENTS=MAX_STUDENTS; this.getSessionBasePrice=getSessionBasePrice;', vm.createContext(cfg));
  const baby = cfg.COURSES['Baby Ready'];
  assert.equal(baby.price, 195);
  assert.equal(baby.priceNew, 195);
  assert.equal(baby.maxStudents, 12);
  assert.equal(baby.seatsPerRegistration, 2);
  assert.equal(baby.adult, true);
  assert.equal(cfg.MAX_STUDENTS['Baby Ready'], 12);
  assert.equal(cfg.MAX_STUDENTS['Care Ready'], 16);
  const beforeCatalog = Date.parse('2026-10-14T04:00:00Z') - 1;
  const person = cfg.getSessionBasePrice('Baby Ready', '2026-10-04', beforeCatalog);
  assert.equal(person, 195);
  assert.equal(person * booking.seatsPerRegistration('Baby Ready'), 390);
  assert.equal(cfg.getSessionBasePrice('Baby Ready', '2026-12-01', Date.parse('2026-10-14T04:00:00Z')), 185);
  assert.equal(cfg.getSessionBasePrice('Baby Ready', '2027-03-01', Date.parse('2026-01-01')), 195);
  assert.equal(cfg.getSessionBasePrice('Baby Ready', '2026-11-01', Date.parse('2026-08-27T04:00:00Z')), 195);
});

test('Baby Ready revenue and checkout use $195 per person and $390 per couple', () => {
  const names = [
    'regEffectivePrice', 'sessionListPrice', 'familyPrice', 'orgPortionAmount',
    'orgBillRate', 'orgRevenueHeadcount', 'orgBillAmount', 'isLiveReg'
  ];
  const sandbox = {
    getCoursePrice: () => 195,
    registrations: [],
    Number, Math, String, isNaN, isFinite
  };
  vm.createContext(sandbox);
  vm.runInContext(names.map((n) => extractFunction(admin, n)).join('\n'), sandbox);

  const session = { id: 'br', course: 'Baby Ready', date: '2026-11-01', createdAt: Date.now(), priceOverride: null };
  assert.equal(sandbox.familyPrice(session), 195);
  assert.equal(sandbox.sessionListPrice(session), 390);
  assert.equal(sandbox.regEffectivePrice({ payStatus: 'paid', pricePaid: null }, session), 390);
  assert.equal(sandbox.regEffectivePrice({ payStatus: 'paid', pricePaid: 225 }, session), 225);

  const overridden = Object.assign({}, session, { priceOverride: 100 });
  assert.equal(sandbox.sessionListPrice(overridden), 100);
  assert.equal(sandbox.regEffectivePrice({ pricePaid: null }, overridden), 100);

  const orgPeople = Object.assign({}, session, { billToOrg: 'Hospital', billedHeadcount: 4, orgPortion: null });
  assert.equal(sandbox.orgRevenueHeadcount(orgPeople), 4);
  assert.equal(sandbox.orgBillRate(orgPeople), 195);
  assert.equal(sandbox.orgBillAmount(orgPeople), 780);

  const orgLive = Object.assign({}, session, { billToOrg: 'Hospital', billedHeadcount: null, orgPortion: 50 });
  sandbox.registrations = [
    { sessionId: 'br', payStatus: 'paid' },
    { sessionId: 'br', payStatus: 'host' }
  ];
  assert.equal(sandbox.orgRevenueHeadcount(orgLive), 2);
  assert.equal(sandbox.orgBillAmount(orgLive), 100);

  const regSandbox = {
    currentSession: { course: 'Baby Ready', date: '2026-11-01', createdAt: Date.now(), priceOverride: null },
    getSessionBasePrice: () => 195,
    seatsPerCourse: () => 2,
    Math, Number, isFinite
  };
  vm.createContext(regSandbox);
  vm.runInContext(extractFunction(register, 'getEffectivePrice'), regSandbox);
  assert.equal(regSandbox.getEffectivePrice(), 390);
  regSandbox.currentSession = Object.assign({}, regSandbox.currentSession, { priceOverride: 250 });
  assert.equal(regSandbox.getEffectivePrice(), 250);
  regSandbox.currentSession = { course: 'Safe Sitter®', date: '2026-11-01', createdAt: Date.now(), priceOverride: null };
  regSandbox.getSessionBasePrice = () => 225;
  regSandbox.seatsPerCourse = () => 1;
  assert.equal(regSandbox.getEffectivePrice(), 225);
});

test('session codes keep Care Ready off Campus Ready\'s CR abbreviation', () => {
  assert.equal(sandbox.courseAbbr('Campus Ready: Safety Skills for College Life'), 'CR');
  assert.equal(sandbox.courseAbbr('Care Ready'), 'CRE');
  assert.equal(sandbox.courseAbbr('Baby Ready'), 'BR');
  assert.notEqual(sandbox.courseAbbr('Care Ready'), sandbox.courseAbbr('Campus Ready: Safety Skills for College Life'));
});

test('register and instructor pages book Baby Ready as an adult couple', () => {
  assert.match(register, /id="p2-first"/);
  assert.match(register, /id="couple-notice"/);
  assert.match(register, /One registration, two adults/);
  assert.match(register, /registrationRowCap\(peopleCap/);
  assert.match(register, /'Baby Ready':195/);
  assert.doesNotMatch(register, /'Baby Ready':225/);
  assert.match(register, /'Baby Ready':12/);
  assert.match(register, /\[Partner: /);
  assert.match(register, /\$195 per person/);
  assert.match(register, /\$390/);
  assert.match(admin, /'Baby Ready':\{price:195/);
  assert.doesNotMatch(admin, /'Baby Ready':\{price:225/);
  assert.match(admin, /<option>Baby Ready<\/option>/);
  assert.match(admin, /<option>Care Ready<\/option>/);
  assert.match(admin, /id="m-partner-wrap"/);
  assert.match(admin, /id="m-par-label"/);
  assert.match(instructor, /\$\{adult\?'':'<th>Grade<\/th><th>Parent \/ guardian<\/th>'\}/);
  assert.match(instructor, /seatsPerRegistration:2/);
  assert.match(instructor, /function printRoster/);
});
