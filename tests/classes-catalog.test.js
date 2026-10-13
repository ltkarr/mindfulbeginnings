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
  const re = /<article\b([^>]*)>([\s\S]*?)<\/article>/g;
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
      virtual: body.includes('>In-person or virtual<') || body.includes('In-person or virtual'),
      soon: body.includes('>Coming soon<'),
      book: /href="\/host\.html"/.test(body)
    });
  }
  return out;
}

const EXPECTED = [
  ['ages-8-10', 'safe-at-home', 'Safe@Home by Safe Sitter®', 'Ages 8-10 · 90-minute · In-person or virtual · $85', 'A class that prepares kids to stay home alone safely and know what to do if something goes wrong.', true, false],
  ['ages-8-10', 'steady-ready', 'Steady and Ready™', 'Ages 8-10 · 70-minute · In person · $65', 'A home safety class for kids and teens building independence, taught at a pace that fits how they learn.', false, false],
  ['ages-8-10', 'mfbc', "My First Babysitter's Club", 'Ages 8-10 · 2.5-hour · In person · $95', "A hands-on workshop introducing young students to the fun and responsibility of becoming a parent's helper. Includes a take-home activity tote bag!", false, false],
  ['ages-8-10', 'social-ready', 'Social Ready™', 'Ages 8-10 · 60-minute · In-person or virtual · $45', 'An interactive workshop that teaches phone safety, digital boundaries, handling group chats, and recognizing red flags before kids head online.', true, false],
  ['ages-10-12', 'intro', 'Introduction to Safe Babysitting by Safe Sitter®', 'Ages 10-12 · 60-minute · In-person or virtual · $40', 'An introduction to the basics of caring for younger children.', true, false],
  ['ages-10-12', 'ready-period', 'Ready. Period.™', 'Ages 10-12 · 90-minute · In-person or virtual · $75', 'A hands-on workshop for girls that pairs a period pouch craft with nurse-led teaching about puberty and body care.', true, false],
  ['ages-10-12', 'steady-ready', 'Steady and Ready™', 'Ages 10-12 · 70-minute · In-person or virtual · $65', 'A home safety class for kids and teens building independence, taught at a pace that fits how they learn.', true, false],
  ['ages-10-12', 'social-ready', 'Social Ready™', 'Ages 10-12 · 60-minute · In-person or virtual · $45', 'An interactive workshop that teaches phone safety, digital boundaries, handling group chats, and recognizing red flags before kids head online.', true, false],
  ['ages-11-14', 'essentials', 'Safe Sitter® Babysitting Essentials', 'Ages 11-14 · 4-hour · In person · $185', 'This babysitting course teaches tweens safety, child care basics, behavior management, and how to rescue a choking child. Students practice with hands-on role-play and leave with a Safe Sitter® completion card and their own handbook.', false, false],
  ['ages-11-14', 'sitter-cpr', 'Safe Sitter® Babysitting with CPR module', 'Ages 11-14 · 5-hour · In person · $225', 'A course that builds the skills and confidence to babysit safely, from infant care to handling emergencies. Includes a hands-on CPR module (not an official certification).', false, false],
  ['ages-11-14', 'rc-babysitter', "Red Cross Babysitter's Training + Pediatric First Aid/CPR/AED", 'Ages 11-14 · 7-hour · In person · $295', "Teens learn child care, safety, and leadership skills, practice infant and child CPR on manikins, and earn American Red Cross Babysitter's Training and Pediatric First Aid/CPR/AED certifications.", false, false],
  ['ages-11-14', 'stay-ready', 'Stay Ready™', 'Ages 11-14 · 75-minute · In person · $85', 'A hands-on workshop that reviews choking rescue, CPR, seizure awareness and response, and emergency response.', false, false],
  ['ages-11-14', 'all-kids', 'All Kids Welcome™', 'Ages 11-14 · 60-minute · In-person or virtual · $25', 'A class that teaches young caregivers how to care confidently for children with diverse needs.', true, false],
  ['ages-11-14', 'social-ready', 'Social Ready™', 'Ages 11-14 · 60-minute · In-person or virtual · $45', 'An interactive workshop that teaches phone safety, digital boundaries, handling group chats, and recognizing red flags before kids head online.', true, false],
  ['ages-11-14', 'adult-cpr', 'Adult & Pediatric First Aid/CPR/AED Certification', 'Ages 11-14 · 4-hour · In person · $125', 'A hands-on course covering adult, child, and infant CPR, choking rescue, AED use, and first aid. Participants earn a 2-year American Red Cross certification.', false, false],
  ['student-athletes', 'season-ready', 'Season Ready™', 'Student athletes · 60-minute · In person · $25', 'A hands-on workshop for student athletes on fueling, recovery, injury awareness, and emergency response.', false, false],
  ['student-athletes', 'stay-ready', 'Stay Ready™', 'Student athletes · 75-minute · In person · $85', 'A hands-on workshop that reviews choking rescue, CPR, seizure awareness and response, and emergency response.', false, false],
  ['high-school', 'campus-ready', 'Campus Ready™', 'High school juniors and seniors · 60-minute · In person · $75', 'A class taught by registered nurses that prepares students to stay safe and help a friend in an emergency during college life.', false, false],
  ['high-school', 'stay-ready', 'Stay Ready™', 'High school juniors and seniors · 75-minute · In person · $85', 'A hands-on workshop that reviews choking rescue, CPR, seizure awareness and response, and emergency response.', false, false],
  ['high-school', 'adult-cpr', 'Adult & Pediatric First Aid/CPR/AED Certification', 'High school juniors and seniors · 4-hour · In person · $125', 'A hands-on course covering adult, child, and infant CPR, choking rescue, AED use, and first aid. Participants earn a 2-year American Red Cross certification.', false, false],
  ['parents-caregivers', 'baby-ready', 'Baby Ready™', 'Parents, nannies, au pairs, and grandparents · 2.5-hour · In person · $185 per participant or $300 per couple', 'A hands-on newborn care class taught by a registered nurse, covering feeding, diapering, bathing, safe sleep, soothing, and infant choking rescue and CPR skills practice on manikins.', false, false],
  ['parents-caregivers', 'adult-cpr', 'Adult & Pediatric First Aid/CPR/AED Certification', 'Parents, nannies, au pairs, and grandparents · 4-hour · In person · $125', 'A hands-on course covering adult, child, and infant CPR, choking rescue, AED use, and first aid. Participants earn a 2-year American Red Cross certification.', false, false],
  ['parents-caregivers', 'grandparents', 'Grandparents: Getting Started by Safe Sitter®', 'Parents, nannies, au pairs, and grandparents · 3-hour · In person · $185', 'A workshop equipping grandparents with current standards, updated guidelines, and practical tips for caring for their grandchildren.', false, false],
  ['parents-caregivers', 'care-ready', 'Care Ready™', 'Parents, nannies, au pairs, and grandparents · 2.5-hour · In person · $185', 'A course that gives nannies and au pairs the practical safety and caregiving skills families count on.', false, false],
  ['parents-caregivers', 'stay-ready', 'Stay Ready™', 'Parents, nannies, au pairs, and grandparents · 75-minute · In person · $85', 'A hands-on workshop that reviews choking rescue, CPR, seizure awareness and response, and emergency response.', false, false]
];

test('classes catalog matches the public class list', () => {
  assert.match(page, /<title>Class Catalog \| Mindful Beginnings<\/title>/);
  assert.match(page, /name="viewport"/);
  assert.match(page, /Prices are per participant\. Home hosts get one free spot\./);
  assert.match(page, /Founded by a 20-year classroom teacher • Taught by registered nurses and certified educators • Safe Sitter® and American Red Cross courses/);
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
    assert.equal(card.virtual, row[5], 'virtual ' + row[1]);
    assert.equal(card.soon, row[6], 'soon ' + row[1]);
    assert.equal(card.book, true, 'book ' + row[1]);
  });
});

test('each class name sits in the navy band', () => {
  const cards = page.match(/<article\b[\s\S]*?<\/article>/g) || [];
  assert.equal(cards.length, EXPECTED.length);
  cards.forEach((card) => {
    assert.match(card, /<div class="card-visual">\s*<h3>[\s\S]*?<\/h3>\s*<\/div>/);
    assert.equal(/<div class="card-body">[\s\S]*<h3>/.test(card), false);
  });
  assert.match(page, /\.card-visual h3\{[^}]*color:#fff/);
  assert.match(page, /\.card-visual h3\{[^}]*font-family:'Montserrat'/);
  assert.match(page, /\.card-visual h3\{[^}]*font-weight:700/);
  assert.equal(/\.card-visual\{[^}]*aspect-ratio/.test(page), false);
});

test('booking, custom programs, and group CPR links stay on this site', () => {
  assert.equal((page.match(/href="\/host\.html"/g) || []).length, 26);
  assert.match(page, /href="\/organization\.html"/);
  assert.match(page, /Request a custom program/);
  assert.match(page, /Mindful Beginnings partners with organizations from the ground up/);
  assert.match(page, /Past offerings include customizable Girl Scout badge workshops/);
  assert.equal((page.match(/href="\/cpr-certification"/g) || []).length, 3);
  assert.equal((page.match(/>Coming soon</g) || []).length, 0);
});

test('clean /classes-catalog URL rewrites to the static page', () => {
  const rules = (cfg.rewrites || []).filter((rule) => rule.destination === '/classes-catalog.html');
  const sources = rules.map((rule) => rule.source).sort();
  assert.deepEqual(sources, ['/classes-catalog', '/classes-catalog/']);
});
