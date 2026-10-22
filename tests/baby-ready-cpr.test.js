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
const configInstructor = fs.readFileSync(path.join(root, 'config-instructor.js'), 'utf8');
const staleCfg = fs.readFileSync(path.join(root, 'configinstructor.js'), 'utf8');
const orgPage = fs.readFileSync(path.join(root, 'organization.html'), 'utf8');
const hostPage = fs.readFileSync(path.join(root, 'host.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'migrations/20261013_baby_ready_cpr.sql'), 'utf8');
const booking = require('../js/course-booking.js');
const requests = require('../js/class-requests.js');
const publicSessions = require('../js/public-sessions.js');

const COURSE = 'Baby Ready + CPR Certification';

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

function loadConfig() {
  const ctx = {};
  vm.runInContext(
    configSrc + '\nthis.COURSES=COURSES; this.MAX_STUDENTS=MAX_STUDENTS; this.LATER_PRICE_CHANGES=LATER_PRICE_CHANGES; this.getSessionBasePrice=getSessionBasePrice; this.perPersonBooking=perPersonBooking; this.quotedCheckout=quotedCheckout;',
    vm.createContext(ctx)
  );
  return ctx;
}

const cfg = loadConfig();
const CUTOVER = Date.parse('2026-10-09T04:00:00Z');
const BEFORE = CUTOVER - 1;

test('Baby Ready + CPR Certification is $275 per person on every price table', () => {
  const row = cfg.COURSES[COURSE];
  assert.equal(row.price, 275);
  assert.equal(row.price2027, 275);
  assert.equal(row.priceNew, 275);
  assert.equal(row.priceNew2027, 275);
  assert.equal(row.couplePrice, 495);
  assert.equal(row.hours, 5);
  assert.equal(row.maxStudents, 12);
  assert.equal(row.seatsPerRegistration, 2);
  assert.equal(row.adult, true);
  assert.equal(row.requiresRN, undefined);
  assert.equal(row.requiresLeadTeacher, undefined);
  assert.equal(row.requiresSafeSitter, undefined);
  assert.equal(row.redCross, undefined);
  assert.equal(cfg.MAX_STUDENTS[COURSE], 12);
  for (const createdAt of [BEFORE, CUTOVER, Date.parse('2026-01-01'), Date.now()]) {
    assert.equal(cfg.getSessionBasePrice(COURSE, '2026-12-01', createdAt), 275);
    assert.equal(cfg.getSessionBasePrice(COURSE, '2027-06-01', createdAt), 275);
  }
  const catalogCutover = Date.parse('2026-10-14T04:00:00Z');
  assert.equal(cfg.getSessionBasePrice('Baby Ready', '2026-12-01', catalogCutover - 1), 195);
  assert.equal(cfg.getSessionBasePrice('Baby Ready', '2026-12-01', catalogCutover), 185);
  assert.equal(cfg.getSessionBasePrice('Adult & Pediatric First Aid/CPR/AED Certification', '2026-12-01', catalogCutover - 1), 185);
  assert.equal(cfg.getSessionBasePrice('Adult & Pediatric First Aid/CPR/AED Certification', '2026-12-01', catalogCutover), 125);
  assert.equal(cfg.getSessionBasePrice('Safe Sitter®', '2026-12-01', Date.now()), 225);
  for (const change of cfg.LATER_PRICE_CHANGES) {
    assert.equal(change.prices[COURSE], undefined);
  }
  const oct9 = configSrc.match(/\{from:'2026-10-09T04:00:00Z'[\s\S]*?\}\},/)[0];
  assert.doesNotMatch(oct9, /Baby Ready \+ CPR/);
});

test('admin can select the course and does not mark it RN-only', () => {
  assert.match(admin, /'Baby Ready \+ CPR Certification':\{price:275,price2027:275,priceNew:275,priceNew2027:275,couplePrice:495,matCost:0,hours:5,maxStudents:12,seatsPerRegistration:2,adult:true\}/);
  assert.doesNotMatch(admin, /'Baby Ready \+ CPR Certification':\{[^}\n]*requiresRN/);
  assert.equal((admin.match(/<option>Baby Ready \+ CPR Certification<\/option>/g) || []).length, 2);
  assert.match(admin, /\$\{s\.course==='Baby Ready \+ CPR Certification'\?'selected':''\}>Baby Ready \+ CPR Certification<\/option>/);
  assert.match(admin, /'Baby Ready','Baby Ready \+ CPR Certification','All Kids Welcome'/);
  assert.match(admin, /'Baby Ready \+ CPR Certification':'BRCPR'/);
  assert.match(admin, /\[\/baby ready\.\{0,20\}cpr\|cpr certification\/i,'BRCPR'\]/);
  assert.match(extractFunction(admin, 'updatePricePreview'), /registrationCheckoutTotal\(courseEl\.value, unit, seats, _pricingCtxCreatedAt\)/);
  assert.match(admin, /'Baby Ready \+ CPR Certification':\{infant:1,child:1,av:1\}/);
});

test('checkout and revenue charge $495 per couple and keep Baby Ready at $390', () => {
  const laterStart = admin.indexOf('const NEW_PRICING_EFFECTIVE=');
  const laterEnd = admin.indexOf('function laterPriceFor', laterStart);
  const names = [
    'laterPriceFor', 'getCoursePrice', 'seatsPerRegistration', 'bookingApi',
    'registrationSeatCount', 'seatCountOrBabyReady', 'seatsCharged',
    'couplePackagePrice', 'registrationCheckoutTotal',
    'regEffectivePrice', 'sessionListPrice', 'sessionBasePrice', 'familyPrice',
    'orgPortionAmount', 'orgBillRate', 'orgRevenueHeadcount', 'orgBillAmount',
    'isLiveReg', 'fmt', 'courseCheckoutDefaultLabel', 'familyForwardMoney'
  ];
  const sandbox = {
    COURSES: {
      'Baby Ready': { price: 195, price2027: 195, priceNew: 195, priceNew2027: 195, hours: 2.5, maxStudents: 12, seatsPerRegistration: 2, adult: true },
      [COURSE]: { price: 275, price2027: 275, priceNew: 275, priceNew2027: 275, couplePrice: 495, hours: 5, maxStudents: 12, seatsPerRegistration: 2, adult: true },
      'Safe Sitter®': { price: 225, price2027: 225, priceNew: 225, priceNew2027: 225, hours: 5, maxStudents: 16 }
    },
    registrations: [],
    Number, Math, String, isNaN, isFinite, Date, parseInt
  };
  vm.createContext(sandbox);
  vm.runInContext(admin.slice(laterStart, laterEnd) + '\n' + names.map((n) => extractFunction(admin, n)).join('\n'), sandbox);

  const session = { id: 'cpr', course: COURSE, date: '2026-12-01', createdAt: Date.now(), priceOverride: null };
  const oldCouple = { id: 'cpr-old', course: COURSE, date: '2026-12-01', createdAt: Date.parse('2026-10-13T12:00:00Z'), priceOverride: null };
  assert.equal(sandbox.getCoursePrice(COURSE, '2026-12-01', BEFORE), 275);
  assert.equal(sandbox.getCoursePrice(COURSE, '2027-03-01', CUTOVER), 275);
  assert.equal(sandbox.couplePackagePrice(COURSE), 495);
  assert.equal(sandbox.couplePackagePrice(COURSE, 275, Date.now()), null);
  assert.equal(sandbox.couplePackagePrice('Baby Ready'), null);
  assert.equal(sandbox.registrationCheckoutTotal(COURSE, 275, 2), 495);
  assert.equal(sandbox.registrationCheckoutTotal('Baby Ready', 195, 2), 390);
  assert.equal(sandbox.familyPrice(session), 275);
  assert.equal(sandbox.sessionListPrice(session), 275);
  assert.equal(sandbox.sessionListPrice(oldCouple), 495);
  assert.equal(sandbox.regEffectivePrice({ payStatus: 'paid', pricePaid: null }, session), 275);
  assert.equal(sandbox.regEffectivePrice({ payStatus: 'paid', pricePaid: null }, oldCouple), 495);
  assert.equal(sandbox.regEffectivePrice({ payStatus: 'paid', pricePaid: 400 }, session), 400);
  assert.equal(sandbox.courseCheckoutDefaultLabel(COURSE, '2026-12-01', Date.now()), '275');
  assert.equal(sandbox.courseCheckoutDefaultLabel(COURSE, '2026-12-01', Date.parse('2026-10-13T12:00:00Z')), '275 per person ($495 per couple)');
  assert.match(sandbox.familyForwardMoney(oldCouple).familyPayLine, /\$495/);

  const overridden = Object.assign({}, session, { priceOverride: 100 });
  assert.equal(sandbox.sessionListPrice(overridden), 100);
  assert.equal(sandbox.regEffectivePrice({ pricePaid: null }, overridden), 100);

  const orgPeople = Object.assign({}, session, { billToOrg: 'Hospital', billedHeadcount: 2, orgPortion: null });
  assert.equal(sandbox.orgBillRate(orgPeople), 275);
  assert.equal(sandbox.orgBillAmount(orgPeople), 550);

  const baby = { id: 'br', course: 'Baby Ready', date: '2026-12-01', createdAt: Date.now(), priceOverride: null };
  // Sessions created on or after Oct 22 2026 are $185 per person, one seat.
  assert.equal(sandbox.sessionListPrice(baby), 185);
  assert.equal(sandbox.familyPrice(baby), 185);
  const babyCouple = { id: 'br-couple', course: 'Baby Ready', date: '2026-12-01', createdAt: Date.parse('2026-10-20T12:00:00Z'), priceOverride: null };
  assert.equal(sandbox.sessionListPrice(babyCouple), 300);
  const babyBeforeCatalog = { id: 'br-old', course: 'Baby Ready', date: '2026-12-01', createdAt: Date.parse('2026-10-13T12:00:00Z'), priceOverride: null };
  assert.equal(sandbox.sessionListPrice(babyBeforeCatalog), 390);
  assert.equal(sandbox.familyPrice(babyBeforeCatalog), 195);

  const bare = { Number, Math, String, isFinite };
  vm.createContext(bare);
  vm.runInContext(['couplePackagePrice', 'registrationCheckoutTotal'].map((n) => extractFunction(admin, n)).join('\n'), bare);
  assert.equal(bare.registrationCheckoutTotal(COURSE, 275, 2), 495);
});

test('public registration checkout is $495 for the couple and still $390 for Baby Ready', () => {
  const regSandbox = {
    currentSession: { course: COURSE, date: '2026-12-01', createdAt: Date.now(), priceOverride: null },
    getSessionBasePrice: cfg.getSessionBasePrice,
    perPersonBooking: cfg.perPersonBooking,
    seatsPerCourse: (name) => (name === 'Baby Ready' || name === COURSE ? 2 : 1),
    COURSES: cfg.COURSES,
    Math, Number, isFinite, String
  };
  vm.createContext(regSandbox);
  vm.runInContext(
    ['couplePackagePrice', 'registrationCheckoutTotal', 'sessionIsQuoted', 'getEffectivePrice'].map((n) => extractFunction(register, n)).join('\n'),
    regSandbox
  );
  assert.equal(regSandbox.getEffectivePrice(), 275);
  regSandbox.currentSession = Object.assign({}, regSandbox.currentSession, { priceOverride: 100 });
  assert.equal(regSandbox.getEffectivePrice(), 100);
  regSandbox.currentSession = { course: 'Baby Ready', date: '2026-12-01', createdAt: Date.now(), priceOverride: null };
  assert.equal(regSandbox.getEffectivePrice(), 185);
  regSandbox.currentSession = { course: 'Baby Ready', date: '2026-12-01', createdAt: Date.parse('2026-10-20T12:00:00Z'), priceOverride: null };
  assert.equal(regSandbox.getEffectivePrice(), 300);
  regSandbox.currentSession = { course: 'Baby Ready', date: '2026-12-01', createdAt: Date.parse('2026-10-13T12:00:00Z'), priceOverride: null };
  assert.equal(regSandbox.getEffectivePrice(), 390);
  regSandbox.currentSession = { course: 'Safe Sitter®', date: '2026-12-01', createdAt: Date.now(), priceOverride: null };
  assert.equal(regSandbox.getEffectivePrice(), 225);

  assert.equal((register.match(/'Baby Ready \+ CPR Certification':275/g) || []).length, 4);
  assert.match(register, /'Baby Ready \+ CPR Certification':12/);
  assert.match(register, /Participants who complete it receive a certification card/);
  const cert = register.slice(register.indexOf(':isBabyReadyCpr'), register.indexOf(':isCareReady||isBabyReady'));
  assert.match(cert, /certification card/);
  assert.doesNotMatch(cert, /does not provide CPR certification/);
  const educational = register.slice(register.indexOf(':isCareReady||isBabyReady'), register.indexOf(':isCareReady||isBabyReady') + 280);
  assert.match(educational, /does not provide CPR certification/);
});

test('a couple counts as two people on the roster, packing list, and equipment', () => {
  assert.equal(booking.seatsPerRegistration(COURSE), 2);
  assert.equal(booking.isAdultCourse(COURSE), true);
  assert.equal(booking.seatsUsed(1, COURSE), 2);
  assert.equal(booking.registrationRowCap(12, COURSE), 6);
  assert.equal(booking.bookingFits(12, 5, COURSE), true);
  assert.equal(booking.bookingFits(12, 6, COURSE), false);
  assert.equal(booking.peopleCount([
    { studentName: 'Alex Rivera', notes: '[Partner: Jordan Lee]' }
  ], COURSE), 2);

  const rosterNames = [
    'bookingApi', 'isAdultCourse', 'seatsPerRegistration', 'partnerNameOf',
    'notesWithoutPartner', 'notesWithPartner', 'rosterPeople', 'rosterNameCell',
    'rosterCountPhrase', 'classRosterSection', 'courseAbbr'
  ];
  const roster = {
    COURSES: cfg.COURSES,
    escapeHtml: (t) => String(t == null ? '' : t)
  };
  vm.createContext(roster);
  const abbrStart = admin.indexOf('const COURSE_ABBR=');
  const abbrEnd = admin.indexOf('function courseAbbr', abbrStart);
  vm.runInContext(admin.slice(abbrStart, abbrEnd) + '\n' + rosterNames.map((n) => extractFunction(admin, n)).join('\n'), roster);
  const html = roster.classRosterSection(
    { course: COURSE, code: 'BRCPR-1' },
    [{ studentName: 'Alex Rivera', notes: '[Partner: Jordan Lee]' }],
    { when: 'Saturday' }
  );
  assert.match(html, /Alex Rivera/);
  assert.match(html, /Jordan Lee/);
  assert.match(html, /2 participants registered/);
  assert.doesNotMatch(html, /Grade/);
  assert.equal(roster.courseAbbr(COURSE), 'BRCPR');
  assert.equal(roster.courseAbbr('Baby Ready'), 'BR');
  assert.equal(roster.courseAbbr('Weekend CPR Certification class'), 'BRCPR');
  assert.notEqual(roster.courseAbbr(COURSE), roster.courseAbbr('Stay Ready: Choking Rescue and CPR'));

  const packing = { Number, Math, String, isFinite };
  vm.createContext(packing);
  vm.runInContext(extractFunction(admin, 'packingRegisteredCount'), packing);
  const rows = [
    { sessionId: 'cpr', payStatus: 'paid', studentName: 'Alex Rivera' },
    { sessionId: 'cpr', payStatus: 'host', studentName: 'Sam Host' },
    { sessionId: 'cpr', payStatus: 'waitlist', studentName: 'Pat Wait' },
    { sessionId: 'cpr', payStatus: 'cancelled', studentName: 'Casey Gone' }
  ];
  assert.equal(packing.packingRegisteredCount({ id: 'cpr', course: COURSE }, rows), 4);

  const gear = {
    COURSES: cfg.COURSES,
    sessions: [{ id: 'cpr', course: COURSE }],
    registrations: rows,
    MAT_LARGE_CLASS: 8,
    Number, Math, String, isFinite
  };
  vm.createContext(gear);
  vm.runInContext(
    ['bookingApi', 'seatsPerRegistration', 'countsTowardSeats', 'seatsOnSession', 'sessionHeadcount', 'matNeedsForHeadcount']
      .map((n) => extractFunction(admin, n)).join('\n'),
    gear
  );
  assert.equal(gear.seatsOnSession('cpr'), 4);
  assert.equal(gear.sessionHeadcount({ id: 'cpr', course: COURSE }), 4);
  const smallKit = gear.matNeedsForHeadcount({ infant: 1, child: 1, av: 1 }, 4);
  const largeKit = gear.matNeedsForHeadcount({ infant: 1, child: 1, av: 1 }, 10);
  assert.equal(smallKit.infant, 1);
  assert.equal(smallKit.child, 1);
  assert.equal(smallKit.av, 1);
  assert.equal(largeKit.infant, 2);
  assert.equal(largeKit.child, 2);
  assert.equal(largeKit.av, 1);

  assert.equal(publicSessions.seatsPerRegistration(COURSE), 2);
  assert.equal(publicSessions.seatsLeft({ course: COURSE }, 1, { [COURSE]: 12 }), 10);
  assert.doesNotMatch(publicSessions.courseAudience(COURSE), /\$495 per couple/);
  assert.match(publicSessions.courseAudience(COURSE), /\$275 per person/);
});

test('the instructor portal does not treat the course as RN-only, Safe Sitter-only, or Red Cross', () => {
  assert.match(instructor, /'Baby Ready \+ CPR Certification':\{hours:5, maxStudents:12, seatsPerRegistration:2, adult:true\}/);
  assert.doesNotMatch(instructor, /'Baby Ready \+ CPR Certification':\{[^}\n]*requiresRN/);
  assert.match(configInstructor, /"Baby Ready \+ CPR Certification":\{hours:5,maxStudents:12,seatsPerRegistration:2,adult:true\}/);
  assert.match(staleCfg, /"Baby Ready \+ CPR Certification":\{hours:5,maxStudents:12,seatsPerRegistration:2,adult:true\}/);
  assert.doesNotMatch(configInstructor, /Baby Ready \+ CPR Certification[^}\n]*requiresRN/);
  assert.doesNotMatch(staleCfg, /Baby Ready \+ CPR Certification[^}\n]*requiresRN/);

  const start = instructor.indexOf('Object.keys(COURSES).forEach(c=>{');
  const end = instructor.indexOf("if(typeof INSTR_RATE==='undefined')", start);
  const sandbox = {
    COURSES: {
      [COURSE]: { hours: 5, maxStudents: 12, seatsPerRegistration: 2, adult: true, requiresRN: true, requiresLeadTeacher: true, redCross: true, requiresSafeSitter: true },
      'Stay Ready: Choking Rescue and CPR': { hours: 1.5, maxStudents: 12 },
      'Baby Ready': { hours: 2.5, maxStudents: 12, seatsPerRegistration: 2, adult: true }
    }
  };
  vm.createContext(sandbox);
  vm.runInContext(instructor.slice(start, end), sandbox);
  assert.equal(sandbox.COURSES[COURSE].requiresRN, false);
  assert.equal(sandbox.COURSES[COURSE].requiresLeadTeacher, false);
  assert.equal(sandbox.COURSES[COURSE].redCross, false);
  assert.equal(sandbox.COURSES[COURSE].requiresSafeSitter, false);
  assert.equal(sandbox.COURSES['Stay Ready: Choking Rescue and CPR'].requiresRN, true);
  assert.equal(sandbox.COURSES['Baby Ready'].requiresRN, true);

  const who = {
    COURSES: cfg.COURSES,
    Number, String
  };
  vm.createContext(who);
  vm.runInContext(
    ['courseRequiresLeadTeacher', 'sessionRequiresRN', 'sessionRequiresSafeSitter', 'sessionRequiresSpanish', 'sessionRequiresLeadTeacher', 'sessionWhoCanTeach']
      .map((n) => extractFunction(admin, n)).join('\n'),
    who
  );
  const session = { course: COURSE, requiresRN: false, requiresSS: false };
  assert.equal(who.sessionRequiresRN(session), false);
  assert.equal(who.sessionRequiresSafeSitter(session), false);
  assert.equal(who.sessionRequiresLeadTeacher(session), false);
  assert.equal(who.sessionWhoCanTeach(session), 'Any instructor');
});

test('class requests offer the course to organizations only, at the per-person rate', () => {
  const course = requests.courseByKey('baby-ready-cpr');
  assert.equal(course.course, COURSE);
  assert.equal(course.price, 275);
  assert.equal(course.hours, '5 hours');
  assert.equal(course.abbr, 'BRCPR');
  assert.equal(course.host, true);
  assert.equal(course.org, true);
  assert.equal(course.requiresRN, undefined);
  assert.equal(requests.coursesFor('host').some((c) => c.key === 'baby-ready-cpr'), true);
  const label = requests.courseOptionLabel(course);
  assert.equal(label, 'Baby Ready + CPR Certification, Expecting parents, $275 per person, Baby Ready portion is 3 hours, 5 hours, in person ($275)');
  assert.match(orgPage, /value="baby-ready-cpr"/);
  assert.match(orgPage, /data-note=""/);
  assert.match(orgPage, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(hostPage, /value="baby-ready-cpr"/);

  const submitted = requests.normalizeSubmission({
    kind: 'organization',
    organizationName: 'Congregation Beth El',
    name: 'Alex Brown',
    email: 'alex@example.org',
    phone: '301-555-0199',
    courseKey: 'baby-ready-cpr',
    location: 'Congregation Beth El, 8215 Old Georgetown Rd, Bethesda, MD 20814',
    expectedCount: '8',
    days: [{ date: '2026-11-02', start: '09:00', end: '14:00' }],
    billing: 'individual'
  });
  assert.equal(requests.validate(submitted).length, 0);
  const plan = requests.buildSessionRow(submitted, []);
  assert.equal(plan.row.course, COURSE);
  assert.equal(plan.row.requires_rn, false);
  assert.equal(plan.row.requires_safe_sitter, false);
  assert.match(plan.row.code, /^BRCPR-/);
});

test('register_student caps the course at 12 people and 2 per registration', () => {
  assert.match(sql, /when 'Baby Ready \+ CPR Certification' then 12/);
  assert.match(sql, /when 'Baby Ready' then 12/);
  assert.match(sql, /when 'Safe Sitter® Babysitting Essentials' then 16/);
  assert.match(sql, /v_course in \('Baby Ready', 'Baby Ready \+ CPR Certification'\) then 2/);
  assert.match(sql, /function public\.register_student/);
  assert.doesNotMatch(sql, /instructor_accept_job/);
  assert.doesNotMatch(sql, /requires_rn/);
});
