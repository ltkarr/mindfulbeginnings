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
      compact: /\bcompact\b/.test(attrs),
      name: pick('card-head') ? decode((body.match(/<h3>([\s\S]*?)<\/h3>/) || [])[1] || '') : '',
      price: pick('price'),
      length: pick('length'),
      desc: pick('desc'),
      virtual: body.includes('>In-person or virtual<'),
      soon: body.includes('>Coming soon<'),
      book: /href="\/host\.html"/.test(body)
    });
  }
  return out;
}

const EXPECTED = [
  ['ages-8-10', 'safe-at-home', 'Safe@Home by Safe Sitter®', '$85', '90-minute', '90-minute class that prepares kids to stay home alone safely and know what to do if something goes wrong.', true, false, false],
  ['ages-8-10', 'steady-ready', 'Steady and Ready™', '$65', '60-minute', '60-minute home safety class for kids and teens building independence, taught at a pace that fits how they learn.', false, false, false],
  ['ages-8-10', 'mfbc', "My First Babysitter's Club", '$95', '2.5 hour', "2.5 hour hands-on workshop introducing young students to the fun and responsibility of becoming a parent's helper. Includes a take-home activity tote bag!", false, false, false],
  ['ages-8-10', 'social-ready', 'Social Ready™', '$45', '60-minute', '60-minute interactive workshop that teaches phone safety, digital boundaries, handling group chats, and recognizing red flags before kids head online.', true, false, true],
  ['ages-10-12', 'intro', 'Introduction to Safe Babysitting BY SAFE SITTER®', '$40', '60-minute', '60-minute introduction to the basics of caring for younger children.', true, false, false],
  ['ages-10-12', 'ready-period', 'Ready. Period.™', '$75', '90-minute', '90-minute hands-on workshop for girls that pairs a period pouch craft with nurse-led teaching about puberty and body care.', true, false, false],
  ['ages-10-12', 'steady-ready', 'Steady and Ready™', '$65', '60-minute', '60-minute home safety class for kids and teens building independence, taught at a pace that fits how they learn.', true, false, false],
  ['ages-10-12', 'social-ready', 'Social Ready™', '$45', '60-minute', '60-minute interactive workshop that teaches phone safety, digital boundaries, handling group chats, and recognizing red flags before kids head online.', true, false, true],
  ['ages-11-14', 'essentials', 'Safe Sitter® Babysitting Essentials', '$185', '4-hour', '4-hour babysitting course teaches tweens safety, child care basics, behavior management, and how to rescue a choking child. Students practice with hands-on role-play and leave with a Safe Sitter® completion card and their own handbook.', false, false, false],
  ['ages-11-14', 'sitter-cpr', 'Safe Sitter® Babysitting with CPR module', '$225', '5-hour', '5-hour course that builds the skills and confidence to babysit safely, from infant care to handling emergencies. Includes hands-on CPR module (not an official certification).', false, false, false],
  ['ages-11-14', 'rc-babysitter', "Red Cross Babysitter's Training + Pediatric First Aid/CPR/AED", '$295', '7 hours', "7 hours. Teens learn child care, safety, and leadership skills, practice infant and child CPR on manikins, and earn American Red Cross Babysitter's Training and Pediatric First Aid/CPR/AED certifications.", false, true, false],
  ['ages-11-14', 'stay-ready', 'Stay Ready™', '$85', '75-minute', '75-minute hands-on workshop that reviews choking rescue, CPR, seizure awareness and response, and emergency response.', false, false, true],
  ['ages-11-14', 'all-kids', 'All Kids Welcome™', '$25', '60-minute', '60-minute class that teaches young caregivers how to care confidently for children with diverse needs.', true, false, false],
  ['ages-11-14', 'social-ready', 'Social Ready™', '$45', '60-minute', '60-minute interactive workshop that teaches phone safety, digital boundaries, handling group chats, and recognizing red flags before kids head online.', true, false, true],
  ['ages-11-14', 'adult-cpr', 'Adult & Pediatric First Aid/CPR/AED Certification', '$185', '4-hour', '4-hour hands-on course covering adult, child, and infant CPR, choking rescue, AED use, and first aid. Participants earn a 2-year American Red Cross certification.', false, true, true],
  ['student-athletes', 'season-ready', 'Season Ready™', '$25', '60-minute', '60-minute hands-on workshop for student athletes on fueling, recovery, injury awareness, and emergency response.', false, false, false],
  ['student-athletes', 'stay-ready', 'Stay Ready™', '$85', '75-minute', '75-minute hands-on workshop that reviews choking rescue, CPR, seizure awareness and response, and emergency response.', false, false, true],
  ['high-school', 'campus-ready', 'Campus Ready™', '$75', '60-minute', '60-minute class taught by registered nurses that prepares students to stay safe and help a friend in an emergency during college life.', false, false, false],
  ['high-school', 'stay-ready', 'Stay Ready™', '$85', '75-minute', '75-minute hands-on workshop that reviews choking rescue, CPR, seizure awareness and response, and emergency response.', false, false, true],
  ['high-school', 'adult-cpr', 'ADULT & PEDIATRIC FIRST AID/CPR/AED CERTIFICATION', '$185', '4-hour', '4-hour hands-on course covering adult, child, and infant CPR, choking rescue, AED use, and first aid. Participants earn a 2-year American Red Cross certification.', false, true, true],
  ['parents-caregivers', 'baby-ready', 'Baby Ready™', '$185', '3-hour', '3-hour hands-on newborn care class taught by a registered nurse, covering feeding, diapering, bathing, safe sleep, soothing, and infant choking rescue and CPR skills practice on manikins.', false, false, false],
  ['parents-caregivers', 'adult-cpr', 'ADULT & PEDIATRIC FIRST AID/CPR/AED CERTIFICATION', '$185', '4-hour', '4-hour hands-on course covering adult, child, and infant CPR, choking rescue, AED use, and first aid. Participants earn a 2-year American Red Cross certification.', false, true, true],
  ['parents-caregivers', 'grandparents', 'Grandparents: Getting Started BY SAFE SITTER®', '$185', '3-hour', '3-hour workshop equipping grandparents with current standards, updated guidelines, and practical tips for caring for their grandchildren.', false, false, false],
  ['parents-caregivers', 'care-ready', 'Care Ready™', '$175', '2.5-hour', '2.5-hour course that gives nannies and au pairs the practical safety and caregiving skills families count on.', false, false, false],
  ['parents-caregivers', 'stay-ready', 'STAY READY™', '$85', '75-minute', '75-minute hands-on workshop that reviews choking rescue, CPR, seizure awareness and response, and emergency response.', false, false, true]
];

test('classes catalog matches the public class list', () => {
  assert.match(page, /<title>Classes \| Mindful Beginnings<\/title>/);
  assert.match(page, /name="viewport"/);
  assert.match(page, /Prices are per participant\. Hosts always get one free registration!/);
  assert.equal(page.includes('\u2014'), false);
  const found = cards();
  assert.equal(found.length, EXPECTED.length);
  EXPECTED.forEach((row, i) => {
    const card = found[i];
    assert.equal(card.group, row[0], 'group ' + i);
    assert.equal(card.key, row[1], 'key ' + i);
    assert.equal(card.name, row[2], 'name ' + row[1]);
    assert.equal(card.price, row[3], 'price ' + row[1]);
    assert.equal(card.length, row[4], 'length ' + row[1]);
    assert.equal(card.desc, row[5], 'desc ' + row[1]);
    assert.equal(card.virtual, row[6], 'virtual ' + row[1]);
    assert.equal(card.soon, row[7], 'soon ' + row[1]);
    assert.equal(card.compact, row[8], 'compact ' + row[1]);
    assert.equal(card.book, true, 'book ' + row[1]);
  });
});

test('booking, custom programs, and group CPR links stay on this site', () => {
  assert.equal((page.match(/href="\/host\.html"/g) || []).length, 27);
  assert.match(page, /href="\/organization\.html"/);
  assert.match(page, /Request a custom program/);
  assert.match(page, /Mindful Beginnings partners with organizations from the ground up/);
  assert.match(page, /Past offerings include customizable Girl Scout badge workshops/);
  assert.equal((page.match(/href="\/cpr-certification"/g) || []).length, 2);
  assert.equal((page.match(/>Coming soon</g) || []).length, 4);
});

test('clean /classes-catalog URL rewrites to the static page', () => {
  const rules = (cfg.rewrites || []).filter((rule) => rule.destination === '/classes-catalog.html');
  const sources = rules.map((rule) => rule.source).sort();
  assert.deepEqual(sources, ['/classes-catalog', '/classes-catalog/']);
});
