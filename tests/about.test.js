'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'about.html'), 'utf8');
const people = JSON.parse(fs.readFileSync(path.join(root, 'data/about-team.json'), 'utf8'));
const cfg = require('../vercel.json');

function decode(text) {
  return text
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;|&apos;/g, "'");
}

function roleFor(person) {
  if (person.role && person.role.trim()) return person.role.trim();
  if (person.section === 'Lead Instructors') return 'Lead Instructor';
  if (person.section === 'Instructors') return 'Instructor';
  return person.section;
}

function cards() {
  const out = [];
  const re = /<div class="person"([^>]*)>([\s\S]*?)<\/div>\s*<\/div>/g;
  let match;
  while ((match = re.exec(page))) {
    const attrs = match[1];
    const body = match[2];
    const attr = (name) => {
      const found = attrs.match(new RegExp('data-' + name + '="([^"]*)"'));
      return found ? decode(found[1]) : '';
    };
    const pick = (cls) => {
      const found = body.match(new RegExp('<span class="' + cls + '">([\\s\\S]*?)</span>'));
      return found ? decode(found[1]) : '';
    };
    const src = (body.match(/<img[^>]*\ssrc="([^"]*)"/) || [])[1] || '';
    const dataRole = (body.match(/<button[^>]*\sdata-role="([^"]*)"/) || [])[1] || '';
    const frame = (body.match(/object-position:([^"]*)/) || [])[1] || '';
    const zoom = /class="shot is-zoom"/.test(body);
    const bios = [];
    const bioMarker = '<div class="bio" hidden>';
    const bioStart = body.indexOf(bioMarker);
    const bioBlock = bioStart === -1 ? '' : body.slice(bioStart + bioMarker.length);
    const para = /<p>([\s\S]*?)<\/p>/g;
    let paragraph;
    while ((paragraph = para.exec(bioBlock))) bios.push(decode(paragraph[1]));
    out.push({
      section: attr('section'),
      name: attr('name'),
      heading: pick('name'),
      role: pick('role'),
      dataRole: decode(dataRole),
      frame: frame,
      zoom: zoom,
      credentials: pick('credentials'),
      hasCredentials: /<span class="credentials">/.test(body),
      button: /<button type="button" class="card"/.test(body),
      photo: decode(src),
      bio: bios
    });
  }
  return out;
}

test('about page is static HTML in the public page style', () => {
  assert.match(page, /<title>About the Team \| Mindful Beginnings<\/title>/);
  assert.match(page, /name="description"/);
  assert.match(page, /name="viewport"/);
  assert.match(page, /href="\/favicon\.ico(\?v=\d+)?"/);
  assert.match(page, /Montserrat/);
  assert.match(page, /#1E3161/);
  assert.match(page, /#F5F2EA/);
  assert.match(page, /#EFC75A/);
  assert.equal(page.includes('\u2014'), false);
  assert.equal(JSON.stringify(people).includes('\u2014'), false);
});

test('hero is just the script title now that the header carries the tagline', () => {
  assert.match(page, /<p class="mb-script-title">about<\/p>/);
  assert.doesNotMatch(page, /Safety and confidence for every age/);
  assert.doesNotMatch(page, /Lindsay: add/);
  assert.doesNotMatch(page, /class="mission"/);
  assert.doesNotMatch(page, />Mission</);
  const hero = page.slice(page.indexOf('<section class="hero">'), page.indexOf('</section>') + 10);
  const afterHero = page.slice(page.indexOf('</section>') + 10, page.indexOf('<div class="team-block">'));
  assert.equal(afterHero.trim(), '');
  assert.equal(hero.includes('\u2014'), false);
});

test('team cards match the uploaded people, in section order, with exact bios', () => {
  assert.equal(people.length, 27);
  const found = cards();
  assert.equal(found.length, people.length);
  const headings = [...page.matchAll(/<h2>([\s\S]*?)<\/h2>/g)].map((hit) => decode(hit[1].replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim()));
  assert.deepEqual(headings, ['Founder & President meet Lindsay!', 'Program Team the planners', 'Lead Instructors our pros', 'Instructors the team']);
  people.forEach((person, i) => {
    const card = found[i];
    assert.equal(card.section, person.section, 'section ' + person.name);
    assert.equal(card.name, person.name);
    assert.equal(card.heading, person.name);
    const role = roleFor(person);
    assert.equal(card.dataRole, role, 'dialog role ' + person.name);
    const repeatsSection = role === 'Founder & President' || role === 'Lead Instructor' || role === 'Instructor';
    assert.equal(card.role, repeatsSection ? '' : role, 'card role ' + person.name);
    assert.equal(card.photo, person.photo, 'photo ' + person.name);
    assert.equal(card.button, true, 'button ' + person.name);
    assert.deepEqual(card.bio, person.bio, 'bio ' + person.name);
    if (person.credentials && person.credentials.trim()) {
      assert.equal(card.credentials, person.credentials.trim(), 'credentials ' + person.name);
    } else {
      assert.equal(card.hasCredentials, false, 'no credentials ' + person.name);
    }
  });
});

test('each person is a button that opens a bio dialog', () => {
  assert.doesNotMatch(page, /Expand all bios/);
  assert.doesNotMatch(page, /expand-bios/);
  assert.equal((page.match(/class="bio" hidden/g) || []).length, 27);
  assert.equal((page.match(/<button type="button" class="card"/g) || []).length, 27);
  assert.match(page, /<dialog class="bio-dialog" id="bio-dialog"/);
  assert.match(page, /<button type="button" class="bio-close">Close<\/button>/);
  assert.match(page, /dialog\.showModal\(\)/);
  assert.match(page, /if \(!inside\) dialog\.close\(\)/);
  assert.match(page, /\.photo\{width:120px;height:120px;border-radius:50%/);
  assert.match(page, /grid-template-columns:repeat\(6,minmax\(0,1fr\)\)/);
  assert.match(page, /h1\{margin:0;font-size:clamp\(26px,3vw,32px\)/);
  assert.match(page, /\.team-section h2\{margin:0 0 14px;font-size:clamp\(20px,2\.2vw,26px\)/);
  assert.match(page, /\.name\{font-size:15px/);
  assert.match(page, /\.role\{font-size:13px/);
  assert.match(page, /button\.getAttribute\('data-role'\)/);
  assert.match(page, /photo\.style\.objectPosition/);
  const frames = {
    'Bronwen Kennedy': 'center top',
    'Kimberly Sinkford': 'center 19%',
    'Miryam Buchler': 'center top',
    'Kelley Butler': 'center top',
    'Marcie Berul': 'center 93%',
    'Jasmine Rhodes': 'center top',
    'Mary Parks': 'center top',
    'Jessica Katz': 'center top',
    'Ashira Lavine': 'center top',
    'Bela Shah Spooner': 'center 28%'
  };
  const found = cards();
  Object.keys(frames).forEach((name) => {
    const card = found.find((item) => item.name === name);
    assert.equal(card.frame, frames[name], 'frame ' + name);
    assert.equal(card.zoom, false, 'zoom ' + name);
  });
  const chyna = found.find((item) => item.name === 'Chyna Brodie');
  assert.equal(chyna.zoom, true);
  assert.match(page, /class="bio-shot" id="bio-shot"/);
  assert.match(page, /classList\.toggle\('is-zoom'/);
});

test('closing actions and footer sit together with no empty band', () => {
  assert.match(page, /<a class="gold-btn" href="\/host-a-class.html">Book a class<\/a>/);
  assert.match(page, /<a class="contact-link" href="\/contact.html">Contact<\/a>/);
  assert.match(page, /<section class="close">[\s\S]*Book a class[\s\S]*Contact[\s\S]*<\/section>\s*<footer class="mb-footer">/);
  assert.doesNotMatch(page, /margin-top:\s*auto/);
  assert.doesNotMatch(page, /min-height:\s*100vh/);
  const closeIndex = page.indexOf('<section class="close">');
  const footerIndex = page.indexOf('<footer class="footer">');
  const between = page.slice(closeIndex, footerIndex);
  assert.equal((between.match(/<section/g) || []).length, 1);
});

test('clean /about URL rewrites to the static page', () => {
  const rules = (cfg.rewrites || []).filter((rule) => rule.destination === '/about.html');
  const sources = rules.map((rule) => rule.source).sort();
  assert.deepEqual(sources, ['/about', '/about/']);
});
