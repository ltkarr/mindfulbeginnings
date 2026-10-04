'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const admin = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed function ' + name);
}

function courseLine(name) {
  const needle = "'" + name + "':{";
  const at = admin.indexOf(needle);
  assert.ok(at >= 0, 'missing course ' + name);
  return admin.slice(at, admin.indexOf('\n', at));
}

function loadEmail() {
  const sandbox = {
    instructors: [],
    jobDataCache: {},
    COURSES: {
      'Safe Sitter®': { hours: 5, requiresSafeSitter: true },
      'Safe@Home': { hours: 1.5 },
      'Safe@Home — Virtual': { hours: 1, instrFlatFee: 75, virtual: true },
      'All Kids Welcome': { hours: 1.5, instrFlatFee: 75, virtual: true },
      'Ready. Period.': { hours: 1.5, requiresRN: true },
      'Stay Ready: Choking Rescue and CPR': { hours: 1.5, requiresRN: true },
      'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes': { hours: 1, requiresRN: true },
      'Care Ready': { hours: 2.5 },
      'Campus Ready: Safety Skills for College Life': { hours: 1, instrFlatFee: 100, requiresRN: true }
    },
    INSTR_RATE: 50,
    INSTR_EXTRA_HOURS: 0.5,
    INSTRUCTOR_PORTAL_URL: 'https://instructorportal.mindfulbeginnings.org/'
  };
  vm.runInNewContext(
    [
      'var INSTRUCTOR_PORTAL_URL="https://instructorportal.mindfulbeginnings.org/";',
      extractFn(admin, 'escapeHtml'),
      extractFn(admin, 'fmt'),
      extractFn(admin, 'instrBaseFee'),
      extractFn(admin, 'sessionRequiresRN'),
      extractFn(admin, 'sessionRequiresSafeSitter'),
      extractFn(admin, 'sessionWhoCanTeach'),
      extractFn(admin, 'openJobPayIsFlat'),
      extractFn(admin, 'formatPayHours'),
      extractFn(admin, 'hourLabel'),
      extractFn(admin, 'openJobHourlyHours'),
      extractFn(admin, 'openJobPayText'),
      extractFn(admin, 'openJobDigestLine'),
      extractFn(admin, 'openJobDigestHtml'),
      extractFn(admin, 'openJobPortalText')
    ].join('\n'),
    sandbox
  );
  return sandbox;
}

const VIRTUALS = [
  { code: 'SAHV-261108', course: 'Safe@Home — Virtual', who: 'Any instructor' },
  { code: 'RP-261115', course: 'Ready. Period.', who: 'RN instructors only' },
  { code: 'AKWV-261122', course: 'All Kids Welcome', who: 'Any instructor' },
  { code: 'SEAR-261206', course: 'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes', who: 'RN instructors only' },
  { code: 'STYV-261213', course: 'Stay Ready: Choking Rescue and CPR', who: 'RN instructors only' }
];

test('course flags match who can teach, without hardcoding those course names', () => {
  assert.match(courseLine('Ready. Period.'), /requiresRN:true/);
  assert.match(courseLine('Stay Ready: Choking Rescue and CPR'), /requiresRN:true/);
  assert.match(courseLine('Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes'), /requiresRN:true/);
  assert.match(courseLine('Safe Sitter®'), /requiresSafeSitter:true/);
  assert.doesNotMatch(courseLine('Safe@Home — Virtual'), /requiresRN|requiresSafeSitter/);
  assert.doesNotMatch(courseLine('All Kids Welcome'), /requiresRN|requiresSafeSitter/);
  assert.doesNotMatch(courseLine('Safe@Home'), /requiresRN|requiresSafeSitter/);
  const who = extractFn(admin, 'sessionWhoCanTeach');
  assert.match(who, /sessionRequiresRN/);
  assert.match(who, /sessionRequiresSafeSitter/);
  assert.doesNotMatch(who, /Ready\. Period|Season Ready|Stay Ready|Safe@Home|All Kids Welcome/);
});

test('the five virtual overrides show $100 and who can teach them', () => {
  const api = loadEmail();
  VIRTUALS.forEach((row, idx) => {
    const session = {
      code: row.code,
      course: row.course,
      isVirtual: true,
      instrPayOverride: 100,
      priceOverride: 25,
      requiresRN: row.who.indexOf('RN') === 0,
      time: '4:00 to 5:00 PM'
    };
    const line = api.openJobDigestLine(session, idx, 'Sunday, November 8, 2026');
    assert.match(line, new RegExp(row.course.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(line, /Instructor pay: \$100/);
    assert.match(line, new RegExp(row.who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(line, /Sunday, November 8, 2026 · 4:00 to 5:00 PM/);
    assert.match(line, /Virtual \(Zoom\)/);
    assert.doesNotMatch(line, /\$25/);
    assert.doesNotMatch(line, /your hourly pay/);
    assert.doesNotMatch(line, /\$75/);
    const html = api.openJobDigestHtml(session, idx, 'Sunday, November 8, 2026');
    assert.match(html, /Instructor pay: \$100/);
    assert.match(html, new RegExp(row.who.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(html, /4:00 to 5:00 PM/);
  });
});

test('a custom job with a flat fee shows that total, and an hourly job does not invent one', () => {
  const api = loadEmail();
  const fair = {
    isCustomJob: true,
    course: 'Represent Us! Girl Scouts — Monster Birthday Bash Table (Camp Potomac Woods)',
    instrPayOverride: 300,
    priceOverride: 25,
    time: 'Event 5:00 PM – 9:00 PM',
    location: 'Camp Potomac Woods — Monster Birthday Bash for Girl Scouts',
    city: 'Leesburg'
  };
  const fairLine = api.openJobDigestLine(fair, 0, 'Saturday, October 31, 2026');
  assert.match(fairLine, /Instructor pay: \$300 — Any instructor/);
  assert.match(fairLine, /Saturday, October 31, 2026 · Event 5:00 PM/);
  assert.match(fairLine, /Leesburg/);
  assert.doesNotMatch(fairLine, /your hourly pay/);

  const sitter = { course: 'Safe Sitter®', time: '9:00 AM', location: 'Library', city: 'Bethesda' };
  const group = api.openJobPayText(sitter);
  assert.match(group, /Instructor pay: your hourly pay × 6\.5 hours/);
  assert.match(group, /5 hours of class \+ 1\.5 hours travel/);
  assert.equal(api.sessionWhoCanTeach(sitter), 'Safe Sitter® instructors only');
  assert.match(api.openJobDigestLine(sitter, 0, 'Saturday, October 18, 2026'), /Safe Sitter® instructors only/);
  assert.doesNotMatch(group, /\$325|\$260|\$50/);

  const dana = { hourlyRate: 40 };
  assert.equal(api.openJobPayText(sitter, dana), 'Instructor pay: $260');
  assert.equal(api.instrBaseFee(sitter, dana), 260);

  const care = { course: 'Care Ready' };
  assert.match(api.openJobPayText(care), /your hourly pay × 4 hours \(2\.5 hours of class \+ 1\.5 hours travel\)/);
  assert.equal(api.sessionWhoCanTeach(care), 'Any instructor');
});

test('a course flat fee is not rewritten as hourly times 1.5 travel, and a virtual hourly class does not add a travel hour', () => {
  const api = loadEmail();
  const kids = { course: 'All Kids Welcome', isVirtual: true };
  assert.match(api.openJobPayText(kids), /Instructor pay: \$75 plus 30 minutes at your hourly pay/);
  assert.equal(api.sessionWhoCanTeach(kids), 'Any instructor');
  assert.equal(api.openJobPayText(kids, { hourlyRate: 40 }), 'Instructor pay: $95');
  assert.equal(api.instrBaseFee(kids, { hourlyRate: 40 }), 95);

  const virtualHourly = { course: 'Ready. Period.', isVirtual: true };
  assert.match(api.openJobPayText(virtualHourly), /your hourly pay × 2 hours/);
  assert.match(api.openJobPayText(virtualHourly), /no travel hour/);
  assert.doesNotMatch(api.openJobPayText(virtualHourly), /1\.5 hours travel/);
  assert.equal(api.sessionWhoCanTeach(virtualHourly), 'RN instructors only');
  assert.equal(api.openJobPayText(virtualHourly, { hourlyRate: 60 }), 'Instructor pay: $120');
  assert.equal(api.instrBaseFee(virtualHourly, { hourlyRate: 60 }), 120);
});

test('the admin open-jobs email is the Jobs open right now list, with a portal link and no babysitting subject', () => {
  const fn = admin.slice(admin.indexOf('function emailOpenJobs'), admin.indexOf('function opsEmailsApi'));
  assert.match(fn, /subject:'Mindful Beginnings jobs available now'/);
  assert.doesNotMatch(fn, /babysitting/i);
  assert.match(fn, /Jobs open right now/);
  assert.match(fn, /openJobDigestLine/);
  assert.match(fn, /openJobDigestHtml/);
  assert.match(fn, /openJobPortalText/);
  assert.match(fn, /openJobPortalHtml/);
  assert.match(fn, /copyExtra:jobText/);
  assert.doesNotMatch(fn, /\bbody:/);
  assert.doesNotMatch(admin.slice(admin.indexOf("subject:'Mindful Beginnings jobs available now'"), admin.indexOf('function opsEmailsApi')), /babysitting/i);
  const portal = loadEmail().openJobPortalText();
  assert.equal(portal, 'Claim a job in the instructor portal: https://instructorportal.mindfulbeginnings.org/');
  assert.match(admin, /function emailOpenJobs\(\)/);
  assert.match(admin, /onclick="emailOpenJobs\(\)"/);
});
