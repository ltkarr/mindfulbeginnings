'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

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

function loadAbout() {
  const sandbox = {
    instructors: [],
    jobDataCache: {},
    recurLabel: s => (s && s.isRecurring ? 'Weekly, Oct 4 – Dec 13' : ''),
    COURSES: {
      'Safe Sitter®': { hours: 5, requiresSafeSitter: true },
      'Safe@Home': { hours: 1.5 },
      'Safe@Home — Virtual': { hours: 1, instrFlatFee: 75, virtual: true },
      'All Kids Welcome': { hours: 1.5, instrFlatFee: 75, virtual: true },
      'Ready. Period.': { hours: 1.5, requiresRN: true },
      'Stay Ready: Choking Rescue and CPR': { hours: 1.5, requiresRN: true },
      'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes': { hours: 1, requiresRN: true },
      'Care Ready': { hours: 2.5 }
    },
    INSTR_RATE: 50,
    INSTR_EXTRA_HOURS: 0.5
  };
  vm.runInNewContext(
    [
      extractFn(admin, 'escapeHtml'),
      extractFn(admin, 'fmt'),
      extractFn(admin, 'instrBaseFee'),
      extractFn(admin, 'instrDisplayFee'),
      extractFn(admin, 'secondInstrDisplayFee'),
      extractFn(admin, 'wrapupPayAmount'),
      extractFn(admin, 'sessionInstructorPayAmount'),
      extractFn(admin, 'sessionRequiresRN'),
      extractFn(admin, 'sessionRequiresSafeSitter'),
      extractFn(admin, 'sessionJobNotesText'),
      extractFn(admin, 'sessionAboutWhereText'),
      extractFn(admin, '_aboutDateLabel'),
      extractFn(admin, 'sessionAboutWhenText'),
      extractFn(admin, 'sessionAboutInstructors'),
      extractFn(admin, '_aboutLinked'),
      extractFn(admin, 'sessionAboutPayHtml'),
      extractFn(admin, 'sessionAboutBodyHtml')
    ].join('\n'),
    sandbox
  );
  return sandbox;
}

const longJobNotes = 'PAY $500. Wear MB shirt and/or sweatshirt and badge. Bring banner, sign-in sheet, and the spare manikin. Check in at the volunteer tent on the north side.';

test('Manage menu offers About for every session, including holds and custom jobs, and keeps Edit', () => {
  const menu = admin.slice(admin.indexOf('function openSessionMenu'), admin.indexOf('function closeSessionMenu') > admin.indexOf('function openSessionMenu')
    ? admin.indexOf('// ─── SESSION ABOUT')
    : admin.indexOf('// ─── SESSION ABOUT'));
  const fn = admin.slice(admin.indexOf('function openSessionMenu'), admin.indexOf('// ─── SESSION ABOUT'));
  const aboutAt = fn.indexOf("items.push({label:'ℹ️ About',act:`openSessionAbout('${sessId}')`})");
  const holdAt = fn.indexOf('if(s.isHold){');
  assert.ok(aboutAt >= 0, 'About item missing from Manage menu');
  assert.ok(holdAt > aboutAt, 'About must be added before the hold/regular split so both get it');
  assert.equal(fn.split('openSessionAbout').length - 1, 1);
  assert.match(fn, /Edit session/);
  assert.match(fn, /deleteSession/);
  assert.match(admin, /function openSessionAbout\(id\)/);
  assert.doesNotMatch(admin.slice(admin.indexOf('function openSessionAbout'), admin.indexOf('// ─── ADDITIONAL COSTS HELPERS')), /isCustomJob\)return/);
  void menu;
});

test('About shows where, when, claimed instructor, private notes, and job notes in full', () => {
  const api = loadAbout();
  api.instructors = [{ id: 'i1', name: 'Dana Rivera' }, { id: 'i2', name: 'Sam Lee' }];
  api.jobDataCache = { s1: { instructorId: 'i1' } };
  const html = api.sessionAboutBodyHtml({
    id: 's1',
    code: 'SS-261018',
    course: 'Safe Sitter®',
    date: '2026-10-18',
    time: '9:00 AM – 3:00 PM',
    location: 'Bethesda Community Center',
    hostAddress: '123 Maple St',
    city: 'Bethesda',
    state: 'MD',
    zip: '20814',
    instructorId: 'i1',
    secondInstructorId: 'i2',
    notes: longJobNotes,
    adminPrivateNotes: 'Girl Scout troop pays net 30.\nDo not share the rate.',
    extraDays: [{ date: '2026-10-19', time: '1:00 PM – 4:00 PM' }]
  });
  assert.match(html, /Where/);
  assert.match(html, /When/);
  assert.match(html, /Who's teaching/);
  assert.match(html, /Notes to me/);
  assert.match(html, /Bethesda Community Center/);
  assert.match(html, /123 Maple St, Bethesda, MD 20814/);
  assert.match(html, /9:00 AM – 3:00 PM/);
  assert.match(html, /1:00 PM – 4:00 PM/);
  assert.match(html, /Dana Rivera/);
  assert.match(html, />Claimed</);
  assert.match(html, /Sam Lee/);
  assert.match(html, />Assigned</);
  assert.match(html, /Girl Scout troop pays net 30\.\nDo not share the rate\./);
  assert.match(html, /Private notes/);
  assert.match(html, /admin only/);
  assert.match(html, new RegExp(longJobNotes.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(html, /what instructors see/);
  assert.match(html, /SS-261018/);
});

test('an assigned-but-unclaimed instructor is labeled Assigned, and an open job says so', () => {
  const api = loadAbout();
  api.instructors = [{ id: 'i1', name: 'Dana Rivera' }];
  api.jobDataCache = {};
  const assigned = api.sessionAboutInstructors({ id: 's2', instructorId: 'i1' });
  assert.equal(assigned.length, 1);
  assert.equal(assigned[0].name, 'Dana Rivera');
  assert.equal(assigned[0].status, 'Assigned');
  const open = api.sessionAboutBodyHtml({ id: 's3', course: 'Care Ready', date: '2026-11-02', time: '4:00 PM', location: '' });
  assert.match(open, /No instructor yet/);
  assert.match(open, /No location yet/);
  assert.match(open, /None/);
});

test('owner-taught, virtual, hold, and custom-job notes all render', () => {
  const api = loadAbout();
  api.instructors = [{ id: 'i9', name: 'Avery Chen' }];
  api.jobDataCache = { job1: { instructorId: 'i9' } };
  const owner = api.sessionAboutBodyHtml({
    id: 'own',
    ownerTaught: true,
    secondInstructorId: 'i9',
    course: 'Safe@Home',
    isVirtual: true,
    zoomLink: 'https://zoom.us/j/123',
    date: '',
    holdTerm: 'Fall 2026',
    time: '10:00 AM',
    notes: 'Park behind the school',
    instructorInfo: 'Bring the banner',
    adminPrivateNotes: 'Org rate is private'
  });
  assert.match(owner, /Lindsay Karr/);
  assert.match(owner, /You are teaching/);
  assert.match(owner, /Avery Chen/);
  assert.match(owner, /Virtual \(Zoom\)/);
  assert.match(owner, /https:\/\/zoom\.us\/j\/123/);
  assert.match(owner, /Fall 2026/);
  assert.match(owner, /10:00 AM/);
  assert.match(owner, /Park behind the school\n\nBring the banner/);
  assert.match(owner, /Org rate is private/);

  const job = api.sessionAboutBodyHtml({
    id: 'job1',
    isCustomJob: true,
    isRecurring: true,
    course: 'Girls on the Run',
    date: '2026-10-04',
    time: '4:00 – 5:00 PM',
    location: 'Greenwood Elementary',
    city: 'Bethesda',
    notes: longJobNotes,
    adminPrivateNotes: 'Invoice GOTR at month end',
    instructorId: 'i9'
  });
  assert.match(job, /Greenwood Elementary/);
  assert.match(job, /Bethesda/);
  assert.match(job, /4:00 – 5:00 PM/);
  assert.match(job, /Weekly, Oct 4 – Dec 13/);
  assert.match(job, /Dana Rivera|Avery Chen/);
  assert.match(job, />Claimed</);
  assert.match(job, /Invoice GOTR at month end/);
  assert.match(job, new RegExp(longJobNotes.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('About shows instructor pay, including a flat session override', () => {
  const api = loadAbout();
  api.instructors = [{ id: 'i1', name: 'Dana Rivera', hourlyRate: 40 }];
  api.jobDataCache = { claimed: { instructorId: 'i1' } };

  const override = api.sessionAboutBodyHtml({
    id: 'sear',
    code: 'SEAR-261206',
    course: 'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes',
    isVirtual: true,
    instrPayOverride: 100,
    priceOverride: 25,
    date: '2026-12-06',
    time: '10:00 AM',
    requiresRN: true
  });
  assert.match(override, /Instructor pay/);
  assert.match(override, /\$100/);
  assert.doesNotMatch(override, /\$75/);
  assert.doesNotMatch(override, /\$25/);
  assert.equal(api.sessionInstructorPayAmount({
    course: 'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes',
    isVirtual: true,
    instrPayOverride: 100,
    priceOverride: 25
  }), 100);

  const usual = api.sessionAboutBodyHtml({
    id: 'ss',
    code: 'SS-261018',
    course: 'Safe Sitter®',
    date: '2026-10-18',
    time: '9:00 AM',
    location: 'Bethesda Community Center',
    instructorId: 'i1'
  });
  // 5 hours × $40 + 1 travel hour + 30 minutes, at Dana's rate. No override.
  assert.match(usual, /Instructor pay/);
  assert.match(usual, /\$260/);
  assert.equal(api.sessionInstructorPayAmount({
    id: 'claimed',
    course: 'Safe Sitter®',
    instructorId: 'i1'
  }), api.wrapupPayAmount({
    id: 'claimed',
    course: 'Safe Sitter®',
    instructorId: 'i1'
  }, api.instructors[0], api.jobDataCache.claimed, 'primary'));

  const openUsual = api.sessionAboutBodyHtml({
    id: 'care',
    course: 'Care Ready',
    date: '2026-11-02',
    time: '4:00 PM',
    location: 'Library'
  });
  // 2.5 hours × $50 + travel + 30 minutes, default rate, nobody assigned yet.
  assert.match(openUsual, /\$200/);
  assert.doesNotMatch(openUsual, /Pay isn't set yet/);
});

test('About says when instructor pay is not owed or not set', () => {
  const api = loadAbout();
  const owner = api.sessionAboutBodyHtml({
    id: 'own2',
    ownerTaught: true,
    course: 'Safe@Home',
    date: '2026-11-01',
    time: '10:00 AM'
  });
  assert.match(owner, /No instructor pay — you are teaching/);
  assert.doesNotMatch(owner, /\$/);

  const custom = api.sessionAboutBodyHtml({
    id: 'fair',
    isCustomJob: true,
    course: 'Library fair table',
    date: '2026-11-08',
    instrPayOverride: null
  });
  assert.match(custom, /Pay isn't set yet/);
  assert.doesNotMatch(custom, /\$0/);
});

test('About escapes note text instead of rendering it as HTML', () => {
  const api = loadAbout();
  const html = api.sessionAboutBodyHtml({
    id: 'x',
    course: '<img src=x onerror=alert(1)>',
    location: 'Venue',
    date: '2026-10-18',
    notes: 'Bring <script>alert(1)</script> banner',
    adminPrivateNotes: 'Rate <b>secret</b>'
  });
  assert.doesNotMatch(html, /<script>/);
  assert.doesNotMatch(html, /<img/);
  assert.doesNotMatch(html, /<b>secret<\/b>/);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /&lt;b&gt;secret&lt;\/b&gt;/);
});

test('custom job notes are a multi-line textarea on add and edit', () => {
  const add = admin.slice(admin.indexOf('function openAddCustomJob'), admin.indexOf('function fillCjInstrSelect'));
  const edit = admin.slice(admin.indexOf('function openEditCustomJob'), admin.indexOf('function toggleCustomHoldMode'));
  assert.match(add, /<textarea id="cj-notes" rows="4"/);
  assert.match(edit, /<textarea id="cj-notes" rows="4"/);
  assert.doesNotMatch(add, /<input[^>]*id="cj-notes"/);
  assert.doesNotMatch(edit, /<input[^>]*id="cj-notes"/);
  assert.match(edit, /escapeHtml\(s\.notes/);
  const sessionEdit = admin.slice(admin.indexOf('function openEditSession'), admin.indexOf('async function saveSession'));
  assert.match(sessionEdit, /<textarea id="m-notes" rows="4"/);
});
