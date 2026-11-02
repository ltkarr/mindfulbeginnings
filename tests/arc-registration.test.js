'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const arc = require('../js/arc-registration');
const ONLINE = 'Adult & Pediatric First Aid/CPR/AED Certification (Online + Classroom)';
const HYBRID = 'Adult & Pediatric First Aid/CPR/AED Certification (Hybrid)';
const IN_PERSON = 'Adult & Pediatric First Aid/CPR/AED Certification';
const SESSION = '2026-12-12';

function loadConfig() {
  const src = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
  const ctx = vm.createContext({});
  vm.runInContext(src + '\nthis.COURSES=COURSES;this.MAX_STUDENTS=MAX_STUDENTS;this.getSessionBasePrice=getSessionBasePrice;', ctx);
  return ctx;
}

test('Adult & Pediatric Online + Classroom is the catalog name and Hybrid is the same course', () => {
  const cfg = loadConfig();
  assert.ok(cfg.COURSES[ONLINE]);
  assert.equal(cfg.COURSES[HYBRID], cfg.COURSES[ONLINE]);
  assert.equal(cfg.COURSES[ONLINE].price, 125);
  assert.equal(cfg.COURSES[ONLINE].maxStudents, 12);
  assert.equal(cfg.COURSES[ONLINE].redCross, true);
  assert.equal(cfg.COURSES[ONLINE].requiresLeadTeacher, true);
  assert.equal(cfg.COURSES[ONLINE].adult, undefined);
  assert.equal(cfg.COURSES[ONLINE].audience, 'Ages 13 and up');
  assert.equal(cfg.COURSES[IN_PERSON].audience, 'Ages 13 and up');
  assert.equal(cfg.MAX_STUDENTS[ONLINE], 12);
  assert.equal(cfg.MAX_STUDENTS[HYBRID], 12);
  assert.equal(cfg.getSessionBasePrice(ONLINE, SESSION, Date.now()), 125);
  assert.equal(cfg.getSessionBasePrice(HYBRID, SESSION, Date.now()), 125);
});

test('age 13 is measured on the skills session date', () => {
  assert.equal(arc.ageOnDate('2013-12-12', SESSION), 13);
  assert.equal(arc.ageOnDate('2013-12-13', SESSION), 12);
  assert.equal(arc.ageCheck('2013-12-12', SESSION).ok, true);
  const under = arc.ageCheck('2013-12-13', SESSION);
  assert.equal(under.ok, false);
  assert.match(under.message, /at least 13/);
  assert.equal(arc.ageCheck('', SESSION).ok, false);
  assert.equal(arc.ageCheck('2013-02-31', SESSION).ok, false);
});

test('blended ARC notice uses the Red Cross course text verbatim', () => {
  const html = arc.courseNoticeHtml(ONLINE, { maxStudents: 12 });
  assert.match(html, /2 hours online self-paced plus 2 hours in person/);
  assert.match(html, /The American Red Cross Adult and Pediatric First Aid\/CPR\/AED blended learning course equips students to recognize and care for a variety of first aid, breathing, and cardiac emergencies involving adults, children, and infants\./);
  assert.match(html, /satisfies OSHA workplace or other regulatory requirements/);
  assert.match(html, /the online portion \(accessed via mobile, desktop, or tablet\) must be completed prior to attending the instructor-led skills session/);
  assert.match(html, /a valid 2-year digital certificate for Adult and Pediatric First Aid\/CPR\/AED is issued/);
  assert.match(html, /Combines the flexibility of online training with instructor-led skills check/);
  assert.match(html, /Start taking your online portion immediately/);
  assert.match(html, /Convenient locations and times/);
  assert.match(html, /Red Cross courses offer Digital Certification, an online version of a Red Cross certificate/);
  assert.match(html, /There is no need to carry your printed certificate around anymore!/);
  assert.match(html, /For more information about continuing education and CEUs, please visit/);
  assert.match(html, /https:\/\/www\.redcross\.org\/take-a-class\/certificates-ceus/);
  assert.match(html, /After you register, Mindful Beginnings will email the Red Cross online portion link\./);
  assert.match(html, /ages 13 and up/);
  assert.match(html, /limited to 12 participants/);
  assert.doesNotMatch(html, /Safe Sitter/);
  assert.doesNotMatch(html, /does not provide CPR/);
  assert.doesNotMatch(html, /your child/i);
  assert.doesNotMatch(html, /\u2014|\u2013/);
  const liability = arc.liabilityHtml();
  assert.match(liability, /Liability acknowledgment/);
  assert.match(liability, /parent or legal guardian if the participant is under 18/);
  assert.doesNotMatch(liability, /your child/i);
  assert.doesNotMatch(liability, /Safe Sitter/);
  assert.doesNotMatch(liability, /\u2014|\u2013/);
  assert.equal(arc.SIGNATURE_LABEL, 'Participant full name (electronic signature), or parent/guardian if participant is under 18 *');
});

test('in-person Adult & Pediatric does not claim an online portion', () => {
  const html = arc.courseNoticeHtml(IN_PERSON);
  assert.match(html, /ages 13 and up/);
  assert.match(html, /Digital Certification/);
  assert.doesNotMatch(html, /online portion must be completed/);
  assert.doesNotMatch(html, /will email the Red Cross online portion link/);
});

test('Safe Sitter is not treated as an ARC waiver course', () => {
  assert.equal(arc.isArcWaiverCourse('Safe Sitter®'), false);
  assert.equal(arc.isArcWaiverCourse("Babysitter's Training"), false);
  assert.equal(arc.isArcWaiverCourse(ONLINE), true);
  assert.equal(arc.isArcWaiverCourse(HYBRID), true);
  assert.equal(arc.isArcBlendedCourse(HYBRID), true);
  assert.equal(arc.isArcBlendedCourse(IN_PERSON), false);
  assert.equal(arc.showsCertificationLine(ONLINE, {}), true);
  assert.equal(arc.showsCertificationLine(ONLINE, { [ONLINE]: { redCross: true } }), true);
  assert.equal(arc.showsCertificationLine('Safe Sitter®', {}), false);
});

test('register.html requires a date of birth for every ARC course and blocks under 13', () => {
  const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
  assert.match(register, /isArcWaiverCourse\(currentSession\.course\)/);
  assert.match(register, /arcApi\.ageCheck\(dobEl\?dobEl\.value:'', currentSession\.date\)/);
  assert.match(register, /Participants must be at least 13 years old on the session date/);
  assert.match(register, /<div class="parc">American Red Cross Certification<\/div>/);
  assert.match(register, /\.parc,\.public-card \.parc\{display:block;color:#ED1B2E/);
});

test('register.html wires the ARC form and leaves the Safe Sitter waiver in place', () => {
  const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
  assert.match(register, /\/js\/arc-registration\.js/);
  assert.match(register, /id="s-dob"/);
  assert.match(register, /id="arc-course-notice"/);
  assert.match(register, /id="terms-arc"/);
  assert.match(register, /American Red Cross Certification/);
  assert.match(register, /#ED1B2E/);
  assert.match(register, /applyArcForm/);
  assert.match(register, /accommodationsHtml\(s\.course\)/);
  assert.match(register, /\/js\/course-copy\.js/);
  const courseCopy = require('../js/course-copy');
  assert.match(courseCopy.accommodationsHtml('Safe Sitter®'), /Safe Sitter® does not provide CPR certification/);
  assert.match(courseCopy.accommodationsHtml("Babysitter's Training"), /American Red Cross digital certificate/);
  assert.doesNotMatch(courseCopy.accommodationsHtml("Babysitter's Training"), /Safe Sitter/);
  assert.match(courseCopy.accommodationsHtml('Adult & Pediatric First Aid/CPR/AED Certification'), /American Red Cross/);
  assert.doesNotMatch(courseCopy.accommodationsHtml('Adult & Pediatric First Aid/CPR/AED Certification'), /Safe Sitter|does not provide CPR/);
  assert.match(register, /Parent \/ guardian full name \(electronic signature\)/);
  assert.match(register, /This course provides a Safe Sitter® certificate of completion/);
  assert.doesNotMatch(register, /does not provide CPR certification[\s\S]{0,80}Online \+ Classroom/);
});
