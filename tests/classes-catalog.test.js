'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'classes-catalog.html'), 'utf8');
const cfg = require('../vercel.json');

function decode(text) {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function cards() {
  const out = [];
  const re = /<article class="course"([^>]*)>([\s\S]*?)<\/article>/g;
  let match;
  while ((match = re.exec(page))) {
    const attrs = match[1];
    const body = match[2];
    const attr = (name) => {
      const found = attrs.match(new RegExp('data-' + name + '="([^"]*)"'));
      return found ? found[1] : '';
    };
    const pick = (cls) => {
      const found = body.match(new RegExp('<[^>]*class="' + cls + '"[^>]*>([\\s\\S]*?)</'));
      return found ? decode(found[1].replace(/<[^>]+>/g, '')) : '';
    };
    out.push({
      group: attr('group'),
      key: attr('key'),
      name: decode((body.match(/<h3>([\s\S]*?)<\/h3>/) || [])[1] || ''),
      meta: pick('meta'),
      desc: pick('desc'),
      cert: pick('cert'),
    });
  }
  return out;
}


const EXPECTED = [
  ["ages-8-10", "safe-at-home", "Safe@Home by Safe Sitter®", "Ages 8 to 10 · 90-minute in person · $65 per person · 60-minute virtual · $40 per person", "A class that prepares kids to stay home alone safely and know what to do if something goes wrong.", null],
  ["ages-8-10", "steady-ready", "Steady and Ready™", "Ages 8 to 12 · 60-minute · In-person or virtual · $65 per person", "A neurodivergent-affirming safety class that builds essential emergency readiness skills in a low-pressure environment.", null],
  ["ages-8-10", "mfbc", "My First Babysitter's Club", "Grades 4 to 5 · 2.5-hour · In person · $165 per person", "A 2.5-hour workshop introducing young students to being a parent's helper, with a take-home activity tote bag.", null],
  ["ages-8-10", "social-ready", "Social Ready™", "Ages 8 to 14 · 60-minute · In-person or virtual · $45 per person", "An interactive workshop that teaches phone safety, digital boundaries, handling group chats, and recognizing red flags before kids head online.", null],
  ["ages-10-12", "intro", "Introduction to Safe Babysitting by Safe Sitter®", "Ages 10 to 12 · 60-minute · In-person or virtual · $40 per person", "An introduction to the basics of caring for younger children.", null],
  ["ages-10-12", "ready-period", "Ready. Period.™", "Girls ages 10 to 12 · 90-minute · In-person or virtual · $75 per person", "A hands-on workshop for girls that pairs a period pouch craft with nurse-led teaching about puberty and body care.", null],
  ["ages-10-12", "middle-school-ready", "Middle School Ready™", "Grades 5 to 7 · 60-minute in person · $40 per person · 60-minute virtual · $25 per person", "A workshop that helps new middle schoolers navigate the building, the rules, and the adults, with practice asking for help, being heard, and handling misunderstandings.", null],
  ["ages-11-14", "essentials", "Safe Sitter® Babysitting Essentials", "Ages 11 to 14 · 4-hour · In person · $185 per person", "Babysitting essentials for new sitters: safety, child care basics, behavior management, and choking rescue, with hands-on practice and a Safe Sitter® completion card.", null],
  ["ages-11-14", "sitter-cpr", "Safe Sitter® Babysitting with CPR Module", "Ages 11 to 14 · 5-hour · In person · $225 per person", "Safe Sitter® plus a hands-on CPR module, for sitters who want the practice without an official CPR certification.", null],
  ["ages-11-14", "babysitters-training", "Babysitter's Training", "Ages 11 to 15 · 4.25-hour · In person · $185 per person", "Child care, safety, and leadership skills for beginning babysitters, with hands-on practice.", "American Red Cross course"],
  ["ages-11-14", "rc-babysitter", "Red Cross Babysitter's Training + Pediatric First Aid/CPR/AED", "Ages 11 to 14 · 7-hour · In person · $295 per person", "Red Cross babysitting training plus Pediatric First Aid/CPR/AED certification, all in one day.", "Red Cross certificate included"],
  ["ages-11-14", "stay-ready", "Stay Ready™: Choking Rescue, CPR, and Seizure Response", "Ages 11 and up · 75-minute · In person · $85 per person", "A hands-on refresher for choking rescue, CPR, and seizure response.", null],
  ["ages-11-14", "all-kids", "All Kids Welcome™", "Experienced sitters · 60-minute · In-person or virtual · $25 per person", "A class that teaches young caregivers how to care confidently for children with diverse needs.", null],
  ["ages-11-14", "adult-cpr", "Adult & Pediatric First Aid/CPR/AED Certification", "Ages 11 and up · 3 hours 45 minutes · In person · $125 per person", "Adult, child, and infant CPR, choking rescue, AED use, and first aid, with a 2-year Red Cross certification. Also offered as online plus classroom.", "Red Cross certificate included"],
  ["student-athletes", "season-ready", "Season Ready™", "Student athletes · 60-minute · In person · $25 per person", "A hands-on workshop for student athletes on fueling, recovery, injury awareness, and emergency response.", null],
  ["high-school", "campus-ready", "Campus Ready™", "High school juniors and seniors · 60-minute · In person · $50 per person", "A class taught by registered nurses that prepares students to stay safe and help a friend in an emergency during college life.", null],
  ["parents-caregivers", "baby-ready", "Baby Ready™", "Parents, nannies, au pairs, and grandparents · 3-hour · In person · $185 per person", "A hands-on newborn care class taught by a registered nurse, covering feeding, diapering, bathing, safe sleep, soothing, and infant choking rescue and CPR skills practice on manikins.", null],
  ["parents-caregivers", "baby-ready-cpr", "Baby Ready™ + CPR Certification", "Expecting and new parents · 5-hour · In person · $275 per person", "Newborn care plus hands-on Pediatric First Aid and CPR. Each registration is one person.", "Certification card included"],
  ["parents-caregivers", "adult-cpr", "Adult & Pediatric First Aid/CPR/AED Certification", "Parents, nannies, au pairs, and grandparents · 3 hours 45 minutes · In person · $125 per person", "Adult, child, and infant CPR, choking rescue, AED use, and first aid, with a 2-year Red Cross certification. Also offered as online plus classroom.", "Red Cross certificate included"],
  ["parents-caregivers", "adult-fa", "Adult First Aid/CPR/AED Certification", "Adults · 3 hours 15 minutes · In person · $125 per person", "Adult skills only: CPR, AED use, choking relief, and basic first aid, with a 2-year Red Cross certification. Also offered as online plus classroom.", "Red Cross certificate included"],
  ["parents-caregivers", "bls", "Basic Life Support (BLS) Certification", "Healthcare providers · 4 hours · In person · $125 per person", "The professional-level course for healthcare providers and public safety staff: high-quality CPR, AED use, and team-based scenarios, with a 2-year Red Cross certification. Also offered as online plus classroom.", "Red Cross certificate included"],
  ["parents-caregivers", "grandparents", "Safe Sitter® Grandparents: Getting Started", "Grandparents and caregivers · 3-hour · In person · $185 per person", "A workshop equipping grandparents with current standards, updated guidelines, and practical tips for caring for their grandchildren.", null],
  ["parents-caregivers", "grandkids", "Babysitting Grandkids Workshop", "Grandparents of kids from infancy to about age 10 · 60-minute · In person · $75 per person · 60-minute virtual · $50 per person", "A relaxed workshop for grandparents who babysit, covering current safety basics for kids from infancy to about age 10. Also offered live online, taught by a registered nurse.", null],
  ["parents-caregivers", "care-ready", "Care Ready™", "Nannies and au pairs · 2.5-hour · In person · $185 per person", "A course that gives nannies and au pairs the practical safety and caregiving skills families count on.", null],
];

test('classes catalog matches the public class list', () => {
  assert.match(page, /<title>Safety & Babysitting Classes in the DC Metro Area \| Mindful Beginnings<\/title>/);
  assert.match(page, /name="viewport"/);
  assert.match(page, /class="mb-btn mb-btn-gold mb-btn-sm" href="\/register\.html">Register</);
  assert.equal(page.includes('\u2014'), false);
  const found = cards();
  assert.equal(found.length, EXPECTED.length);
  EXPECTED.forEach((row, i) => {
    const card = found[i];
    assert.equal(card.group, row[0], 'group ' + i);
    assert.equal(card.key, row[1], 'key ' + i);
    assert.equal(card.name, row[2], 'name ' + row[1]);
    assert.equal(card.meta, row[3], 'meta ' + row[1]);
    assert.equal(card.desc, row[4], 'desc ' + row[1]);
    assert.equal(card.cert, row[5] || '', 'cert ' + row[1]);
  });
});

test('classes are simple text rows with no pills, bands, or best-if boxes', () => {
  const rows = page.match(/<article class="course"[\s\S]*?<\/article>/g) || [];
  assert.equal(rows.length, EXPECTED.length);
  rows.forEach((row) => {
    assert.match(row, /<h3>[\s\S]*?<\/h3>/);
    assert.equal(row.includes('type-pill'), false);
    assert.equal(row.includes('best-if'), false);
    assert.equal(row.includes('card-visual'), false);
  });
  assert.equal(page.includes('filter-pill'), false);
  assert.match(page, /Red Cross certificate included/);
});

test('course rows are not links, and the group path is one clear button', () => {
  assert.equal(page.includes('<a class="course"'), false);
  assert.equal((page.match(/href="\/host-a-class.html"[^>]*>Bring a course to your group/g) || []).length, 2);
  assert.match(page, /href="\/contact\.html"/);
  assert.match(page, /Request a custom program/);
  assert.match(page, /We design tailored programs around your audience/);
  assert.match(page, /Past offerings include Girl Scout badge workshops, safety training for community volunteers, and programs for religious schools and PTAs/);
  // 2 since the 2026-10-26 less-is-more pass removed the duplicate CPR band
  // from the catalog (nav + footer still link CPR Certification).
  assert.equal((page.match(/href="\/cpr-certification"/g) || []).length, 2);
  assert.equal((page.match(/>Coming soon</g) || []).length, 0);
});

test('clean /classes-catalog URL rewrites to the static page', () => {
  const rules = (cfg.rewrites || []).filter((rule) => rule.destination === '/classes-catalog.html');
  const sources = rules.map((rule) => rule.source).sort();
  assert.deepEqual(sources, ['/classes-catalog', '/classes-catalog/']);
});
