'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const copy = require('../js/course-copy');
const drafts = require('../js/post-course-emails');

function loadConfig() {
  const src = fs.readFileSync(path.join(__dirname, '..', 'config.js'), 'utf8');
  const ctx = vm.createContext({});
  vm.runInContext(src + '\nthis.COURSES=COURSES;', ctx);
  return ctx.COURSES;
}

const COURSES = loadConfig();

function expectFamily(name) {
  const cfg = COURSES[name] || {};
  if (cfg.redCross) return 'red-cross';
  if (cfg.requiresSafeSitter) return 'safe-sitter';
  if (name === 'Intro to Babysitting' || name === 'Grandparents: Getting Started') return 'safe-sitter';
  return 'other';
}

test('every catalog course gets the matching accommodations family', () => {
  Object.keys(COURSES).forEach(function (name) {
    const kind = expectFamily(name);
    assert.equal(copy.family(name, COURSES), kind, name);
    const html = copy.accommodationsHtml(name, COURSES);
    if (kind === 'safe-sitter') {
      assert.match(html, /Safe Sitter® does not provide CPR certification/);
      assert.match(html, /referral source of babysitters/);
      assert.match(copy.certificationText(name, COURSES), /Safe Sitter® certificate of completion/);
      assert.match(copy.certificationText(name, COURSES), /Formal CPR certification is not included/);
      assert.match(copy.releaseText(name, false, COURSES), /Safe Sitter, Inc/);
      assert.match(copy.reminderCertificationLine(name, COURSES), /Safe Sitter® Certificate of Completion/);
    } else if (kind === 'red-cross') {
      assert.match(html, /this American Red Cross course/);
      assert.match(html, /American Red Cross digital certificate/);
      assert.match(html, /including CPR\/First Aid when part of the course/);
      assert.doesNotMatch(html, /Safe Sitter/i, name);
      assert.doesNotMatch(html, /does not provide CPR/, name);
      assert.match(copy.certificationText(name, COURSES), /American Red Cross digital certificate/);
      assert.doesNotMatch(copy.certificationText(name, COURSES), /Safe Sitter|not included/, name);
      assert.doesNotMatch(copy.releaseText(name, false, COURSES), /Safe Sitter/, name);
      assert.doesNotMatch(copy.releaseText(name, true, COURSES), /Safe Sitter/, name);
      assert.match(copy.reminderCertificationLine(name, COURSES), /American Red Cross digital certificate/);
      assert.doesNotMatch(copy.cprNoticeHtml(name, COURSES), /Safe Sitter|does not provide CPR/, name);
    } else {
      assert.doesNotMatch(html, /Safe Sitter/i, name);
      assert.doesNotMatch(html, /Red Cross/i, name);
      assert.doesNotMatch(html, /certif/i, name);
      assert.equal(copy.certificationText(name, COURSES), '', name);
      assert.equal(copy.reminderCertificationLine(name, COURSES), '', name);
      assert.doesNotMatch(copy.releaseText(name, false, COURSES), /Safe Sitter/, name);
      assert.doesNotMatch(copy.releaseText(name, true, COURSES), /Safe Sitter/, name);
      assert.match(copy.releaseText(name, false, COURSES), /Mindful Beginnings/);
    }
    assert.doesNotMatch(html, /\u2014|\u2013/, name);
  });
});

test('stored Red Cross babysitter names are not treated as Safe Sitter', () => {
  ["Babysitter's Training", "Red Cross Babysitter's Training", "Red Cross Babysitter's Training + Pediatric First Aid/CPR/AED", 'Adult & Pediatric First Aid/CPR/AED Certification (Online + Classroom)', 'Adult & Pediatric First Aid/CPR/AED Certification (Hybrid)', 'Group CPR Certification for Workplaces'].forEach(function (name) {
    assert.equal(copy.family(name), 'red-cross', name);
    assert.equal(copy.isSafeSitterCourse(name), false, name);
  });
  assert.equal(copy.family('Baby Ready + CPR Certification'), 'other');
  assert.doesNotMatch(copy.accommodationsHtml('Baby Ready + CPR Certification'), /Red Cross|Safe Sitter|certif/i);
  assert.equal(copy.family('Safe Sitter® (Troop 123)'), 'safe-sitter');
  assert.equal(copy.family('Intro to Babysitting — Greenwood'), 'safe-sitter');
  assert.equal(copy.family('Girl Scouts — First Aid Badge Workshop'), 'other');
  assert.equal(copy.family('Girl Scout Badge Class'), 'other');
  assert.equal(copy.family('Social Ready'), 'other');
  assert.equal(copy.family('Campus Ready: Safety Skills for College Life'), 'other');
  assert.equal(copy.family('Safe@Home — Virtual'), 'other');
});

test('Babysitter\'s Training post-course email is the Red Cross draft', () => {
  const d = drafts.postCourseDraftFor("Babysitter's Training");
  assert.match(d.body, /Red Cross/);
  assert.doesNotMatch(d.body, /Safe Sitter/);
  const combo = drafts.postCourseDraftFor("Red Cross Babysitter's Training + Pediatric First Aid/CPR/AED");
  assert.match(combo.body, /seven and a half hours/);
  assert.match(combo.body, /American Red Cross certification/);
  assert.doesNotMatch(combo.body, /Safe Sitter/);
});
