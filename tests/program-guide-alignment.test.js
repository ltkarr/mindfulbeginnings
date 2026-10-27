'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const configSrc = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const catalog = fs.readFileSync(path.join(root, 'classes-catalog.html'), 'utf8');
const clubs = fs.readFileSync(path.join(root, 'after-school-clubs.html'), 'utf8');

function loadConfig() {
  const ctx = {};
  vm.runInContext(
    configSrc + '\nthis.COURSES=COURSES; this.MAX_STUDENTS=MAX_STUDENTS; this.getSessionBasePrice=getSessionBasePrice; this.CUSTOM_QUOTE_FROM=CUSTOM_QUOTE_FROM;',
    vm.createContext(ctx)
  );
  return ctx;
}

const cfg = loadConfig();
const QUOTE = Date.parse('2026-10-22T04:00:00Z');
const BEFORE = QUOTE - 1;
const GS = 'Girl Scouts — First Aid Badge Workshop';
const STAY_OLD = 'Stay Ready: Choking Rescue and CPR';
const STAY_NEW = 'Stay Ready™: Choking Rescue, CPR, and Seizure Response';
const GP_OLD = 'Grandparents: Getting Started';
const GP_NEW = 'Safe Sitter® Grandparents: Getting Started';

test('new Girl Scout sessions are a custom quote and older ones stay $45', () => {
  assert.equal(cfg.getSessionBasePrice(GS, '2026-12-01', QUOTE), null);
  assert.equal(cfg.getSessionBasePrice('Girl Scout Badge Class', '2026-12-01', QUOTE), null);
  assert.equal(cfg.getSessionBasePrice(GS, '2026-11-01', BEFORE), 45);
  assert.equal(cfg.getSessionBasePrice(GS, '2026-11-01', null), 45);
  assert.equal(cfg.COURSES[GS].legacyPrice, 45);
  assert.equal(cfg.COURSES[GS].price, undefined);
});

test('renamed courses resolve the historical price under both stored names', () => {
  const oct9 = Date.parse('2026-10-09T04:00:00Z');
  assert.equal(cfg.getSessionBasePrice(STAY_NEW, '2026-12-01', oct9), 85);
  assert.equal(cfg.getSessionBasePrice(STAY_OLD, '2026-12-01', oct9), 85);
  assert.equal(cfg.getSessionBasePrice(GP_NEW, '2026-12-01', oct9), 185);
  assert.equal(cfg.getSessionBasePrice(GP_OLD, '2026-12-01', oct9), 185);
  assert.equal(cfg.COURSES[STAY_OLD], cfg.COURSES[STAY_NEW]);
  assert.equal(cfg.COURSES[GP_OLD], cfg.COURSES[GP_NEW]);
});

test('Babysitter Training, Baby Ready, workplace CPR, and Safe@Home keep the guide rates', () => {
  const now = Date.parse('2026-10-22T12:00:00Z');
  assert.equal(cfg.getSessionBasePrice("Babysitter's Training", '2026-12-01', now), 185);
  assert.equal(cfg.MAX_STUDENTS["Babysitter's Training"], 12);
  assert.equal(cfg.getSessionBasePrice('Baby Ready', '2026-12-01', Date.parse('2026-10-14T04:00:00Z')), 185);
  assert.equal(cfg.getSessionBasePrice('Baby Ready', '2026-12-01', Date.parse('2026-10-13T12:00:00Z')), 195);
  assert.equal(cfg.COURSES['Baby Ready'].seatsPerRegistration, undefined);
  assert.equal(cfg.getSessionBasePrice('Baby Ready + CPR Certification', '2026-12-01', now), 275);
  assert.equal(cfg.COURSES['Baby Ready + CPR Certification'].couplePrice, undefined);
  assert.equal(cfg.getSessionBasePrice('Group CPR Certification for Workplaces', '2026-12-01', now), null);
  assert.equal(cfg.MAX_STUDENTS['Group CPR Certification for Workplaces'], undefined);
  assert.equal(cfg.COURSES['Group CPR Certification for Workplaces'].customSize, true);
  assert.equal(cfg.getSessionBasePrice('Safe@Home — Virtual', '2026-12-01', now), 40);
  assert.equal(cfg.getSessionBasePrice('Safe@Home', '2026-12-01', Date.parse('2026-08-27T04:00:00Z')), 85);
  assert.equal(cfg.getSessionBasePrice('Safe@Home — Series', '2026-12-01', now), 125);
  assert.equal(cfg.getSessionBasePrice('Adult & Pediatric First Aid/CPR/AED Certification', '2026-12-01', now), 125);
  assert.equal(cfg.MAX_STUDENTS['My First Babysitters Club'], 16);
  assert.equal(cfg.MAX_STUDENTS['My First Babysitters Club — Single Session'], 16);
  assert.equal(cfg.COURSES['My First Babysitters Club'].audience, 'Grades 4 to 5 · 8-week series');
  assert.equal(cfg.COURSES['My First Babysitters Club — Single Session'].audience, 'Grades 4 to 5 · 2.5-hour workshop');
  assert.equal(cfg.COURSES['Steady and Ready'].hours, 1);
  assert.equal(cfg.getSessionBasePrice('Babysitting Grandkids Workshop', '2026-12-01', now), 75);
  assert.equal(cfg.COURSES['Babysitting Grandkids Workshop'].maxStudents, 20);
});

test('the public catalog shows both Safe@Home prices and drops couple pricing', () => {
  assert.match(catalog, /90-minute in person · \$65 · 60-minute virtual · \$40/);
  assert.match(catalog, /Ages 11 and up · 3 hours 45 minutes · In person · \$125/);
  assert.match(catalog, /\$185 per participant/);
  assert.doesNotMatch(catalog, /\$300 per couple/);
  assert.doesNotMatch(catalog, /\$495/);
  assert.match(catalog, /Baby Ready™ \+ CPR Certification/);
  assert.match(catalog, /Babysitting Grandkids Workshop/);
  // 2026-10-26 less-is-more: the catalog now uses the short hybrid note.
  assert.match(catalog, /Also offered as online plus classroom/);
  assert.match(clubs, /8-week series/);
  assert.doesNotMatch(clubs, /8-10 weeks/);
  assert.match(clubs, /Grades 4 to 5/);
  assert.match(clubs, /8-16 kids/);
});

test('admin and config have no merge conflict markers', () => {
  for (const file of ['admin.html', 'config.js', 'register.html', 'config-instructor.js']) {
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    assert.equal(text.includes('<<<<<<<'), false, file);
    assert.equal(text.includes('>>>>>>>'), false, file);
  }
  assert.match(admin, /function doLogin/);
  assert.match(admin, /'Safe@Home — Virtual':\{price:40/);
});
