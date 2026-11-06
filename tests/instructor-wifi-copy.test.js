'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const onboarding = fs.readFileSync(path.join(root, 'instructor-onboarding.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

const POLICY = 'The host will provide Wi-Fi details when you arrive on site. Please ask the host for the network name and password.';
const NOT_A_CODE = 'Accepting a job does not add a Wi-Fi code to your job card.';

function between(src, start, end) {
  const at = src.indexOf(start);
  const stop = src.indexOf(end, at + start.length);
  assert.ok(at >= 0 && stop > at, start + ' .. ' + end);
  return src.slice(at, stop);
}

function loadPortalCopy() {
  const src = between(instructor, 'function whatHappensHTML', 'function instructorDirectionsText');
  const sandbox = {
    escapeHtml(value) {
      return String(value == null ? '' : value);
    },
    fmt() { return '$0'; },
    instrFee() { return 0; }
  };
  vm.runInNewContext(
    src + '\nthis.api={whatHappensHTML,locationHTML,HOST_WIFI_ON_ARRIVAL};',
    sandbox
  );
  return sandbox.api;
}

function loadFaq() {
  const src = between(instructor, 'const FAQ_SECTIONS=', 'function renderGuide()');
  const sandbox = {};
  vm.runInNewContext(src + '\nthis.faq=FAQ_SECTIONS;', sandbox);
  return sandbox.faq;
}

function quizQuestions(html) {
  const start = html.indexOf('var QUESTIONS=');
  const end = html.indexOf('];', start);
  return Function(html.slice(start, end + 2) + '\nreturn QUESTIONS;')();
}

const portal = loadPortalCopy();
const inPerson = {
  isVirtual: false,
  location: 'Library',
  city: 'Bethesda',
  state: 'MD',
  hostAddress: '100 Example Ave'
};
const virtual = { isVirtual: true, course: 'Safe@Home — Virtual' };

test('host-on-arrival Wi-Fi wording is the shared instructor sentence', () => {
  assert.equal(portal.HOST_WIFI_ON_ARRIVAL, POLICY);
  assert.match(onboarding, new RegExp(POLICY.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(onboarding, new RegExp(NOT_A_CODE));
  const faq = loadFaq();
  const av = faq.find((sec) => sec.title === '6. Equipment and technology')
    .blocks.find((block) => block.sub === 'AV and WiFi');
  const where = av.items.find((item) => item[0] === 'Where do I get the Wi-Fi?');
  assert.ok(where, 'Wi-Fi FAQ missing');
  assert.equal(where[1], POLICY + ' ' + NOT_A_CODE);
  const reminder = between(admin, 'function openInstructorReminder', 'function openInstructorFinalRoster');
  const virtualBranch = reminder.slice(reminder.indexOf('if(s.isVirtual)'), reminder.indexOf('}else{'));
  const inPersonBranch = reminder.slice(reminder.indexOf('}else{'), reminder.indexOf('detailLines.push(\'Session code:\''));
  assert.equal(virtualBranch.includes(POLICY), false);
  assert.equal(inPersonBranch.includes(POLICY), true);
  assert.match(inPersonBranch, /if\(s\.wifiInfo\)detailLines\.push\('Wi-Fi note on file: '\+s\.wifiInfo\)/);
  assert.match(reminder, /Directions: /);
  assert.doesNotMatch(reminder, /s\.notes/);
  assert.doesNotMatch(reminder, /adminPrivateNotes/);
});

test('open and accepted in-person cards tell instructors to ask the host', () => {
  const open = portal.locationHTML(inPerson, false, {
    hostPhone: '555-0100',
    wifiInfo: 'SYN-NET-NOTE',
    contactDay: 'Alex'
  }, '');
  assert.match(open, /100 Example Ave/);
  assert.match(open, /The host's cell number is shared as soon as you accept this job/);
  assert.match(open, new RegExp(POLICY));
  assert.equal(open.includes('555-0100'), false);
  assert.equal(open.includes('SYN-NET-NOTE'), false);
  assert.equal(open.includes('Alex'), false);

  const accepted = portal.locationHTML(inPerson, true, {
    hostAddress: '100 Example Ave',
    hostPhone: '555-0100',
    contactDay: 'Alex',
    wifiInfo: ''
  }, '');
  assert.match(accepted, /100 Example Ave/);
  assert.match(accepted, /Host cell:/);
  assert.match(accepted, /555-0100/);
  assert.match(accepted, /Day-of contact:/);
  assert.match(accepted, new RegExp(POLICY));
  assert.equal(accepted.includes('Wi-Fi note on file'), false);

  const noted = portal.locationHTML(inPerson, true, { wifiInfo: 'SYN-NET-NOTE', hostPhone: '555-0100' }, '');
  assert.match(noted, /Wi-Fi note on file:/);
  assert.match(noted, /SYN-NET-NOTE/);
  assert.match(noted, new RegExp(POLICY));

  const zoom = portal.locationHTML(virtual, false, { wifiInfo: 'SYN-NET-NOTE' }, '');
  assert.match(zoom, /Zoom link is sent to you once you accept/);
  assert.equal(zoom.includes(POLICY), false);
  assert.equal(zoom.includes('SYN-NET-NOTE'), false);
});

test('accepting a job still explains street address, and not a Wi-Fi code', () => {
  const happens = portal.whatHappensHTML(inPerson);
  assert.match(happens, /The host's cell number unlocks on your job card once you accept/);
  assert.match(happens, /The street address is already on this card/);
  assert.match(happens, new RegExp(POLICY));
  assert.match(onboarding, /including the street address/);
  const zoom = portal.whatHappensHTML(virtual);
  assert.match(zoom, /Zoom link is sent to you and to registered families/);
  assert.equal(zoom.includes(POLICY), false);
});

test('the onboarding quiz keeps three choices and no longer teaches that Wi-Fi unlocks', () => {
  const questions = quizQuestions(onboarding);
  const item = questions.find((q) => q.q.indexOf('what unlocks on your job card') >= 0);
  assert.ok(item);
  assert.equal(item.options.length, 3);
  assert.equal(item.answer, 1);
  assert.equal(item.options[item.answer], 'The host\u2019s cell number');
  assert.equal(item.options[0], 'The host\u2019s street address');
  assert.equal(item.options[2], 'A Wi-Fi network name and password');
  assert.equal(item.lesson, 2);
});

test('old instructor-facing promises that a Wi-Fi code appears after acceptance are gone', () => {
  const surfaces = [onboarding, instructor, between(admin, 'function openInstructorReminder', 'function openInstructorFinalRoster')];
  const banned = [
    /cell number and Wi-?Fi/i,
    /Wi-?Fi unlock/i,
    /Wi-?Fi are shared/i,
    /verify your credentials/i,
    /wifi codes appear/i
  ];
  surfaces.forEach((src) => {
    banned.forEach((pattern) => {
      assert.equal(pattern.test(src), false, pattern);
    });
  });
  const roster = between(instructor, 'async function printRoster', 'function myUpcomingJobs');
  assert.match(roster, /const wifiPolicy=s\.isVirtual\?'':/);
  assert.match(roster, /HOST_WIFI_ON_ARRIVAL/);
  assert.match(roster, /Directions:/);
  assert.match(roster, /Host cell:/);
  const troubleshoot = between(instructor, "{sub:'AV and WiFi'", "{title:'7. Virtual classes");
  assert.match(troubleshoot, /ask the host to confirm the network name and password/);
  assert.match(onboarding, /ask the host to confirm the network name and password/);
  assert.match(instructor, /in case Wi-Fi is not strong/);
});
