'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const sheets = require(path.join(root, 'js/teaching-checklist.js'));
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const source = fs.readFileSync(path.join(root, 'js/teaching-checklist.js'), 'utf8');

function sheet(partial) {
  return sheets.buildSheet(Object.assign({
    course: 'Safe Sitter®',
    date: '2026-10-31',
    time: '9:00 AM',
    place: 'Beth El, Alexandria',
    instructor: 'Jane Doe',
    hostLabel: 'Host',
    host: 'Dana Rivera',
    code: 'SS-261031',
    registered: 8,
    expected: null,
    tasks: [
      { label: 'Put out handbooks and supplies', done: true },
      { label: 'Send reminder and roster to instructor', done: false }
    ],
    kitLines: ['8 Safe Sitter handbooks', '8 Safe Sitter notebooks', '1 infant manikin', '1 child manikin', '1 AV kit', 'Batteries + screwdriver']
  }, partial));
}

test('new checklist copy does not use an em dash or an en dash', () => {
  assert.equal(source.includes('\u2014'), false);
  assert.equal(source.includes('\u2013'), false);
  const html = sheets.sheetHtml(sheet());
  assert.equal(html.includes('\u2014'), false);
  assert.equal(html.includes('\u2013'), false);
});

test('a Safe Sitter class prints its own steps, kit, and the checked pre-class boxes', () => {
  const model = sheet();
  assert.equal(model.kind, 'class');
  assert.equal(model.courseId, 'safe-sitter');
  assert.equal(model.title, 'Teaching checklist');
  assert.equal(sheets.buttonLabel(model.kind), 'Print checklist (PDF)');
  assert.match(model.when, /Saturday, October 31, 2026 at 9:00 AM/);
  assert.equal(model.people, '8 participants registered');
  assert.equal(model.pack, 'Pack for 8.');
  assert.equal(model.tasks[0].done, true);
  assert.equal(model.tasks[1].done, false);
  assert.ok(model.steps.some((step) => /choking rescue/i.test(step) && /CPR/i.test(step)));
  assert.ok(model.steps.some((step) => /babysitting business/i.test(step)));
  assert.ok(model.supplies.some((row) => row.label === '8 Safe Sitter handbooks' && row.done === false));
  assert.ok(model.supplies.some((row) => /face shield/i.test(row.label)));
  assert.ok(model.supplies.some((row) => /dolls/i.test(row.label)));
  assert.equal(model.supplies.filter((row) => /handbook/i.test(row.label)).length, 1);
  const html = sheets.sheetHtml(model);
  assert.match(html, /data-kind="class"/);
  assert.match(html, /data-course="safe-sitter"/);
  assert.match(html, /&#9745;/);
  assert.match(html, /&#9744;/);
  assert.match(html, /Beth El, Alexandria/);
  assert.match(html, /Jane Doe/);
  assert.match(html, /Dana Rivera/);
  assert.match(html, /SS-261031/);
  assert.match(html, /<h2>Teaching steps<\/h2>/);
  assert.ok(model.steps.length <= 12);
  assert.ok(model.supplies.length <= 22);
  assert.ok(model.supplies.some((row) => row.label === '1 AV kit'));
  assert.ok(model.supplies.some((row) => row.label === 'Laptop, case, and speakers (Mindful Beginnings)'));
  assert.ok(model.supplies.some((row) => /Projector, case, and remote/.test(row.label) && /host provides the wall or screen/.test(row.label)));
  assert.ok(model.supplies.some((row) => row.label === 'USB-C to HDMI adapter (in the AV kit)'));
  assert.ok(model.supplies.some((row) => row.label === 'Power strip or cord (in the AV kit)'));
  assert.ok(model.after.length <= 6);
});

test('the larger of registered and expected is the pack count', () => {
  const model = sheet({ registered: 8, expected: 12 });
  assert.equal(model.people, '8 participants registered. Participants expected: 12');
  assert.equal(model.pack, 'Pack for 12.');
});

test('Intro to Babysitting, Safe@Home, and Stay Ready do not share the Safe Sitter lesson', () => {
  const intro = sheet({ course: 'Intro to Babysitting', kitLines: ['6 Intro to Babysitting handbooks'] });
  assert.equal(intro.courseId, 'intro-to-babysitting');
  assert.ok(intro.steps.some((step) => /60 minutes/i.test(step)));
  assert.ok(intro.steps.every((step) => !/5 hours/i.test(step)));
  assert.ok(intro.after.some((row) => /Child Care Skills patch/i.test(row.label)));

  const home = sheet({ course: 'Safe@Home', kitLines: ['10 Safe@Home student handbooks (1 per student)', '10 Safe@Home completion certificates (1 per student)', '1 AV kit'] });
  assert.equal(home.courseId, 'safe-at-home');
  assert.ok(home.steps.some((step) => /First Aid Chart/i.test(step)));
  assert.ok(home.steps.every((step) => !/babysitting business/i.test(step)));

  const series = sheets.findCourse('Safe@Home — Series');
  assert.equal(series.id, 'safe-at-home-series');
  assert.ok(series.steps.some((step) => /Week 5/i.test(step)));

  const stay = sheet({ course: 'Stay Ready: Choking Rescue and CPR', kitLines: ['1 infant manikin', '1 child manikin', '1 adult manikin', '1 AV kit'] });
  assert.equal(stay.courseId, 'stay-ready');
  assert.ok(stay.steps.some((step) => /0:32 to 0:50/.test(step)));
  assert.ok(stay.supplies.every((row) => !/Safe Sitter handbook/i.test(row.label)));
});

test('an in-person AV class keeps the kit pieces, and a Zoom class does not pack them', () => {
  const home = sheet({
    course: 'Safe@Home',
    kitLines: ['10 Safe@Home student handbooks (1 per student)', '1 AV kit']
  });
  assert.equal(home.courseId, 'safe-at-home');
  assert.ok(home.supplies.some((row) => row.label === '1 AV kit'));
  assert.ok(home.supplies.some((row) => /Laptop, case, and speakers/.test(row.label)));
  assert.equal(home.supplies.some((row) => /if the site needs one/.test(row.label)), false);

  const intro = sheet({ course: 'Intro to Babysitting', kitLines: ['6 Intro to Babysitting handbooks'] });
  assert.ok(intro.supplies.some((row) => /USB-C to HDMI adapter/.test(row.label)));
  assert.equal(intro.supplies.some((row) => /if the site needs one/.test(row.label)), false);

  const zoom = sheet({
    course: 'Safe@Home',
    isVirtual: true,
    zoom: 'https://zoom.us/j/123',
    kitLines: ['1 AV kit', 'Laptop, case, and speakers (Mindful Beginnings)']
  });
  assert.equal(zoom.courseId, 'safe-at-home-virtual');
  assert.equal(zoom.supplies.some((row) => /laptop/i.test(row.label)), false);
  assert.equal(zoom.supplies.some((row) => /projector/i.test(row.label)), false);
  assert.equal(zoom.supplies.some((row) => /HDMI/i.test(row.label)), false);
  assert.equal(zoom.supplies.some((row) => row.label === '1 AV kit'), false);

  const period = sheet({ course: 'Ready. Period.', kitLines: [] });
  assert.equal(period.supplies.some((row) => /Laptop, case, and speakers/.test(row.label)), false);

  const bare = sheet({ course: 'Safe Sitter®', kitLines: [] });
  assert.ok(bare.supplies.some((row) => /Projector, case, and remote/.test(row.label)));
});

test('a Zoom class prints the link and the virtual plan when that course has one', () => {
  const zoom = sheet({
    course: 'Safe@Home',
    isVirtual: true,
    zoom: 'https://zoom.us/j/123',
    place: 'Virtual',
    kitLines: []
  });
  assert.equal(zoom.courseId, 'safe-at-home-virtual');
  assert.equal(zoom.whereLabel, 'Zoom');
  assert.equal(zoom.where, 'https://zoom.us/j/123');
  assert.equal(zoom.thinNote.length > 0, true);
  assert.ok(zoom.steps.some((step) => /60-minute virtual/i.test(step)));
  const html = sheets.sheetHtml(zoom);
  assert.match(html, /https:\/\/zoom\.us\/j\/123/);
  assert.doesNotMatch(html, /Beth El/);
});

test('Babysitting Essentials is not the 5-hour CPR course', () => {
  const model = sheet({ course: 'Safe Sitter® Babysitting Essentials' });
  assert.equal(model.courseId, 'safe-sitter-essentials');
  assert.ok(model.steps.some((step) => /not the 5-hour course/i.test(step)));
  assert.ok(model.steps.every((step) => !/^5 hours/.test(step)));
});

test('Girl Scout first aid has badge steps, and a badge class without first aid stays thin', () => {
  const aid = sheet({ course: 'Girl Scouts — First Aid Badge Workshop', troop: 'Brownie (grades 2–3)', kitLines: [] });
  assert.equal(aid.courseId, 'girl-scout-first-aid');
  assert.equal(aid.thinNote, '');
  assert.ok(aid.steps.some((step) => /Check-Call-Care/.test(step)));
  assert.equal(aid.troop, 'Brownie (grades 2–3)');

  const badge = sheet({ course: 'Girl Scout Badge Class', kitLines: [] });
  assert.equal(badge.courseId, 'girl-scout-badge');
  assert.equal(badge.kind, 'class');
  assert.match(badge.thinNote, /not on this sheet yet/);
});

test('Red Cross certifications stay a class and do not invent a lesson plan', () => {
  const adult = sheet({
    course: 'Adult & Pediatric First Aid/CPR/AED Certification',
    kitLines: ['1 infant manikin', '1 child manikin', '1 adult manikin', '1 AV kit', 'Batteries + screwdriver']
  });
  assert.equal(adult.courseId, 'red-cross');
  assert.match(adult.thinNote, /Red Cross lesson plan/);
  assert.ok(adult.supplies.every((row) => !/Babysitter Training handbook/i.test(row.label)));

  const training = sheet({ course: "Babysitter's Training", kitLines: [] });
  assert.equal(training.courseId, 'red-cross');
  assert.ok(training.supplies.some((row) => /Babysitter Training handbook/i.test(row.label)));

  const hybrid = sheet({ course: 'Adult & Pediatric First Aid/CPR/AED Certification (Online + Classroom)', kitLines: [] });
  assert.ok(hybrid.steps.some((step) => /online portion is already done/i.test(step)));
});

test('after-school clubs with no facilitator agenda stay thin instead of borrowing another class', () => {
  ['Pet Sitter\'s Club', 'Snack Squad', 'Kid Boss Club', 'Middle School, Here I Come', 'Big Sibling Club', 'My First Phone', 'Walk and Roll Ready', 'Calm and Ready'].forEach((course) => {
    const model = sheet({ course: course, kitLines: [] });
    assert.equal(model.kind, 'class', course);
    assert.match(model.thinNote, /not on this sheet yet/, course);
    assert.equal(model.steps.length, 0, course);
    assert.ok(model.steps.every((step) => !/choking rescue/i.test(step)));
  });
  const club = sheet({ course: 'My First Babysitters Club', kitLines: [] });
  assert.equal(club.courseId, 'my-first-club');
  assert.ok(club.steps.some((step) => /Week 8/i.test(step)));
});

test('a booth or vendor fair gets a packing sheet and no teaching steps', () => {
  const booth = sheet({
    course: 'Represent us at Goddard School Bethesda Fall Fest',
    isCustomJob: true,
    code: 'RUA-261031',
    kitLines: [],
    tasks: [{ label: 'Put out materials for the instructor', done: false }]
  });
  assert.equal(booth.kind, 'event');
  assert.equal(booth.courseId, '');
  assert.equal(booth.title, 'Packing sheet');
  assert.equal(booth.steps.length, 0);
  assert.equal(booth.after.length, 0);
  assert.match(booth.eventNote, /not a taught class/);
  assert.equal(sheets.buttonLabel('event'), 'Print packing sheet (PDF)');
  const html = sheets.sheetHtml(booth);
  assert.doesNotMatch(html, /Teaching steps/);
  assert.doesNotMatch(html, /choking rescue/i);
  assert.match(html, /No course kit is listed/);

  assert.equal(sheets.sheetKind({ course: 'Welcome Event', code: 'RUA-1' }), 'event');
  assert.equal(sheets.sheetKind({ course: 'Library story hour', isCustomJob: true }), 'event');
  assert.equal(sheets.sheetKind({ course: 'Safe Sitter at the library', isCustomJob: true }), 'class');
  assert.equal(sheets.sheetKind({ course: 'Walk and Roll Ready' }), 'class');
});

test('session facts that are missing stay visible, and a name cannot inject markup', () => {
  const model = sheet({
    course: '<img src=x onerror=alert(1)>',
    code: '',
    instructor: '',
    host: '',
    place: '',
    zoom: '',
    isVirtual: true,
    registered: 0,
    expected: null,
    kitLines: [],
    tasks: []
  });
  assert.equal(model.code, 'not set');
  assert.equal(model.instructor, 'No instructor');
  assert.equal(model.where, 'Zoom link not set');
  assert.match(model.pack, /Headcount is not set yet/);
  const html = sheets.sheetHtml(model);
  assert.match(html, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.doesNotMatch(html, /<img/);
});

test('a hold still prints as a class, with the hold called out', () => {
  const model = sheet({ isHold: true });
  assert.equal(model.kind, 'class');
  assert.equal(model.status, 'On hold');
  assert.match(sheets.sheetHtml(model), /On hold/);
});

test('the print button is on the pre-class card, the materials row, and Manage', () => {
  assert.match(admin, /<script src="\/js\/teaching-checklist\.js"><\/script>/);
  const dash = admin.slice(admin.indexOf('// ── Pre-class action reminders'), admin.indexOf('// ─── SESSIONS'));
  assert.match(dash, /printTeachingChecklist/);
  assert.match(dash, /teachingPrintLabel\(s\)/);
  const menuStart = admin.indexOf('function openSessionMenu');
  const menu = admin.slice(menuStart, admin.indexOf('if(s.isHold){', menuStart));
  assert.match(menu, /printTeachingChecklist\('\$\{sessId\}'\)/);
  assert.match(menu, /teachingPrintLabel\(s\)/);
  const upcoming = admin.slice(admin.indexOf('function renderDashUpcoming'), admin.indexOf('// ─── SESSIONS'));
  assert.match(upcoming, /printTeachingChecklist/);
  assert.match(upcoming, /teachingPrintLabel\(s\)/);
  const apiDir = fs.readdirSync(path.join(root, 'api'));
  assert.equal(apiDir.some((name) => /teaching|checklist/i.test(name)), false);
});

test('course catalog records which checklists still have a thin agenda', () => {
  const rows = sheets.courses();
  const byId = {};
  rows.forEach((row) => { byId[row.id] = row; });
  ['safe-sitter', 'intro-to-babysitting', 'safe-at-home', 'safe-at-home-series', 'stay-ready', 'season-ready', 'campus-ready', 'all-kids-welcome', 'girl-scout-first-aid', 'my-first-club', 'little-medics', 'ready-period', 'social-ready', 'grandparents-started', 'baby-ready', 'care-ready', 'steady-and-ready'].forEach((id) => {
    assert.equal(byId[id].thin, false, id);
  });
  ['safe-at-home-virtual', 'girl-scout-badge', 'baby-ready-cpr', 'red-cross', 'pet-sitters-club', 'snack-squad', 'walk-and-roll', 'calm-and-ready', 'middle-school-ready', 'screen-ready', 'lunchroom'].forEach((id) => {
    assert.equal(byId[id].thin, true, id);
  });
});
