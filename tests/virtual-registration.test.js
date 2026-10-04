'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const copy = require('../js/registration-copy.js');

const register = fs.readFileSync(path.join(__dirname, '../register.html'), 'utf8');

const VIRTUAL_PUBLIC = [
  { code: 'SAHV-261108', course: 'Safe@Home — Virtual' },
  { code: 'RP-261115', course: 'Ready. Period.' },
  { code: 'AKWV-261122', course: 'All Kids Welcome' },
  { code: 'SEAR-261206', course: 'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes' },
  { code: 'STYV-261213', course: 'Stay Ready: Choking Rescue and CPR' }
];

const IN_PERSON = [
  { code: 'SAH-261108', course: 'Safe@Home — Virtual', isVirtual: false },
  { code: 'RP-INPERSON', course: 'Ready. Period.', is_virtual: false },
  { code: 'AKW-INPERSON', course: 'All Kids Welcome' },
  { code: 'SEAR-INPERSON', course: 'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes', isVirtual: false },
  { code: 'STY-INPERSON', course: 'Stay Ready: Choking Rescue and CPR', isVirtual: false },
  { code: 'SS-INPERSON', course: 'Safe Sitter®', isVirtual: false }
];

function visibleText(session) {
  const result = copy.virtualRegistrationCopy(session);
  return [result.introHtml, result.accommodationsHtml, result.photoConsent, result.waiverText].join(' ');
}

function assertNoRoomOnlyPractice(text) {
  assert.doesNotMatch(text, /manikin/i);
  assert.doesNotMatch(text, /choking/i);
  assert.doesNotMatch(text, /chest-compression/i);
  assert.doesNotMatch(text, /send home/i);
  assert.doesNotMatch(text, /Safe Sitter® certificate/i);
  assert.doesNotMatch(text, /seek emergency care/i);
  assert.doesNotMatch(text, /arrange emergency medical care/i);
  assert.doesNotMatch(text, /arriving on time/i);
  assert.doesNotMatch(text, /practice on/i);
  assert.doesNotMatch(text, /will practice/i);
  assert.doesNotMatch(text, /hands-on practice of/i);
  assert.doesNotMatch(text, /craft supplies/i);
  assert.doesNotMatch(text, /supply pouch/i);
}

test('virtual public sessions use Zoom registration copy and drop room-only consent', () => {
  VIRTUAL_PUBLIC.forEach(function (row) {
    const session = { code: row.code, course: row.course, isVirtual: true };
    assert.equal(copy.sessionIsVirtual(session), true);
    assert.equal(copy.sessionIsVirtual({ course: row.course, is_virtual: 'true' }), true);
    const result = copy.virtualRegistrationCopy(session);
    assert.ok(result, row.code + ' should use the virtual form');
    const text = visibleText(session);
    assert.match(text, /live, one-hour class on Zoom/i);
    if (row.course === 'Safe@Home — Virtual' || row.course === 'All Kids Welcome') {
      assert.match(text, /certified teacher or registered nurse/);
    } else {
      assert.match(text, /taught by a registered nurse/);
    }
    assert.match(text, /no in-person attendance/i);
    assert.match(text, /no hands-on practice/i);
    assert.match(result.waiverText, /A disruptive student can be removed from the Zoom/);
    assert.equal(result.hidePermissions, true);
    assert.equal(result.hideHost, true);
    assertNoRoomOnlyPractice(text);
    if (row.course !== 'Stay Ready: Choking Rescue and CPR') {
      assert.doesNotMatch(text, /\bCPR\b/);
      assert.doesNotMatch(text, /\bAED\b/);
    }
  });
});

test('Stay Ready on Zoom keeps the prerequisite and does not ask for manikin practice', () => {
  const result = copy.virtualRegistrationCopy({
    code: 'STYV-261213',
    course: 'Stay Ready: Choking Rescue and CPR',
    is_virtual: true
  });
  assert.match(result.waiverText, /Safe Sitter® Babysitting Course and\/or a CPR and First Aid course previously/);
  const withoutPrereq = result.waiverText.replace('Safe Sitter® Babysitting Course and/or a CPR and First Aid course previously', '');
  assert.doesNotMatch(withoutPrereq, /\bCPR\b/);
  assert.doesNotMatch(result.waiverText, /manikin/i);
  assert.doesNotMatch(result.waiverText, /practice of choking/i);
  assert.doesNotMatch(result.waiverText, /hands-on practice of/i);
});

test('Ready. Period. on Zoom stays puberty education and drops the in-room craft', () => {
  const result = copy.virtualRegistrationCopy({ course: 'Ready. Period.', isVirtual: true });
  assert.match(result.waiverText, /puberty and period preparation/);
  assert.match(result.waiverText, /menstruation/);
  assert.match(result.waiverText, /not a substitute for the guidance of the participant's own physician/);
  assert.doesNotMatch(result.waiverText, /craft/i);
  assert.doesNotMatch(result.waiverText, /pouch/i);
  assert.doesNotMatch(result.waiverText, /manikin/i);
});

test('Season Ready on Zoom stays general education, not medical advice, with no manikin practice', () => {
  const result = copy.virtualRegistrationCopy({
    course: 'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes',
    isVirtual: 1
  });
  assert.match(result.waiverText, /general education for a group/);
  assert.match(result.waiverText, /not individualized medical, nutrition, or athletic-training advice/);
  assert.match(result.waiverText, /calorie counting/);
  assert.doesNotMatch(result.waiverText, /manikin/i);
  assert.doesNotMatch(result.waiverText, /\bCPR\b/);
  assert.doesNotMatch(result.waiverText, /\bAED\b/);
  assert.doesNotMatch(result.waiverText, /chest-compression/i);
});

test('in-person sessions do not get the virtual waiver', () => {
  IN_PERSON.forEach(function (row) {
    assert.equal(copy.sessionIsVirtual(row), false, row.code);
    assert.equal(copy.virtualRegistrationCopy(row), null, row.code);
  });
  assert.equal(copy.virtualRegistrationCopy({ course: 'Safe Sitter®' }), null);
  assert.equal(copy.sessionIsVirtual({ isVirtual: 'false' }), false);
  assert.equal(copy.sessionIsVirtual({ is_virtual: 0 }), false);
});

test('in-person waiver source still contains the existing manikin and emergency language', () => {
  assert.match(register, /id="cpr-perm-item"/);
  assert.match(register, /Safe Sitter® includes practice of rescue skills on CPR manikins/);
  assert.match(register, /Students will practice CPR and rescue skills on manikins/);
  assert.match(register, /This course provides a Safe Sitter® certificate of completion/);
  assert.match(register, /decline or send home any student who is disruptive/);
  assert.match(register, /chest-compression practice on a manikin and demonstration of movement and positioning/);
  assert.match(register, /including the use of craft supplies/);
  assert.match(register, /paired with a craft activity in which participants decorate and stock a personal supply pouch/);
  assert.match(register, /authorize the Instructor to seek emergency care for your child/);
  assert.match(register, /I understand the importance of attending all sessions and arriving on time/);
  const season = register.slice(register.indexOf('id="terms-season-ready"'), register.indexOf('id="terms-ready-period"'));
  assert.match(season, /manikin/);
  const period = register.slice(register.indexOf('id="terms-ready-period"'), register.indexOf('id="terms-virtual"'));
  assert.match(period, /puberty and period preparation/);
  assert.match(period, /craft activity/);
  assert.doesNotMatch(period, /manikin/i);
});

function fakeDoc() {
  const ids = [
    'virtual-class-notice', 'terms-virtual', 'terms-standard', 'terms-grandparent',
    'terms-campus-ready', 'terms-season-ready', 'terms-ready-period',
    'permissions-section', 'emerg-perm-item', 'cpr-perm-item', 'waiver-cpr-notice',
    'host-section', 'accom-notice', 'photo-consent-sub', 'screen-info'
  ];
  const els = {};
  ids.forEach(function (id) {
    els[id] = { id: id, style: { display: '' }, innerHTML: 'IN-PERSON', textContent: 'IN-PERSON', attrs: {} };
  });
  els['screen-info'].setAttribute = function (name, value) { this.attrs[name] = value; };
  const radios = [{ name: 'cpr-perm', checked: true }, { name: 'emerg-perm', checked: true }];
  return {
    els: els,
    radios: radios,
    getElementById: function (id) { return els[id] || null; },
    querySelectorAll: function () { return radios; }
  };
}

test('opening a virtual session hides in-person waiver blocks and shows the Zoom line', () => {
  const doc = fakeDoc();
  doc.els['terms-season-ready'].style.display = '';
  doc.els['terms-season-ready'].innerHTML = 'chest-compression practice on a manikin';
  doc.els['waiver-cpr-notice'].innerHTML = 'practice CPR and rescue skills on manikins';
  const result = copy.applyRegistrationMode({
    code: 'STYV-261213',
    course: 'Stay Ready: Choking Rescue and CPR',
    isVirtual: true
  }, doc);
  assert.match(doc.els['terms-virtual'].innerHTML, /removed from the Zoom/);
  assert.equal(doc.els['terms-virtual'].style.display, '');
  assert.equal(doc.els['terms-season-ready'].style.display, 'none');
  assert.equal(doc.els['terms-standard'].style.display, 'none');
  assert.equal(doc.els['permissions-section'].style.display, 'none');
  assert.equal(doc.els['cpr-perm-item'].style.display, 'none');
  assert.equal(doc.els['emerg-perm-item'].style.display, 'none');
  assert.equal(doc.els['waiver-cpr-notice'].style.display, 'none');
  assert.equal(doc.els['host-section'].style.display, 'none');
  assert.equal(doc.els['virtual-class-notice'].style.display, '');
  assert.match(doc.els['accom-notice'].innerHTML, /live Zoom class/);
  assert.doesNotMatch(doc.els['accom-notice'].innerHTML, /Safe Sitter/i);
  assert.equal(doc.els['screen-info'].attrs['data-registration-mode'], 'virtual');
  assert.equal(doc.radios[0].checked, false);
  assert.equal(doc.radios[1].checked, false);
  assert.doesNotMatch(result.waiverText, /manikin/i);

  copy.applyRegistrationMode({ course: 'Stay Ready: Choking Rescue and CPR', isVirtual: false }, doc);
  assert.equal(doc.els['terms-virtual'].style.display, 'none');
  assert.equal(doc.els['terms-virtual'].innerHTML, '');
  assert.equal(doc.els['permissions-section'].style.display, '');
  assert.equal(doc.els['emerg-perm-item'].style.display, '');
  assert.equal(doc.els['virtual-class-notice'].style.display, 'none');
  assert.equal(doc.els['screen-info'].attrs['data-registration-mode'], 'in-person');
  assert.equal(doc.els['terms-season-ready'].innerHTML, 'chest-compression practice on a manikin');
});

test('register.html applies virtual copy after the in-person course switch and skips room permissions', () => {
  assert.match(register, /src="\/js\/registration-copy\.js"/);
  const setBannerAt = register.indexOf('function setBanner');
  const setBanner = register.slice(setBannerAt, register.indexOf('function toggleSitterList', setBannerAt));
  const applyAt = setBanner.lastIndexOf('applyRegistrationMode');
  assert.ok(applyAt > setBanner.indexOf('terms-season-ready'), 'in-person course blocks are chosen before the virtual overlay');
  assert.ok(applyAt > setBanner.indexOf('waiver-cpr-notice'));
  assert.match(setBanner, /srTerms\.style\.display=isSeasonReady/);
  assert.match(register, /sessionIsVirtual\(currentSession\)/);
  assert.match(register, /if\(!isVirtualForm&&!document\.querySelector\('input\[name="emerg-perm"\]:checked'\)\)/);
  assert.match(register, /sessionIsVirtual\(s\)\)\?'':\(document\.querySelector\('input\[name="cpr-perm"\]:checked'\)/);
  assert.match(register, /id="virtual-class-notice"/);
  assert.match(register, /id="terms-virtual"/);
  const sitter = setBanner.slice(setBanner.indexOf('sitter-list-wrap'));
  assert.match(sitter, /isAKWCourse\?'':'none'/);
  assert.doesNotMatch(sitter, /isVirtual/);
});
