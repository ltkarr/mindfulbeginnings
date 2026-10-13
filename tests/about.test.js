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
  const re = /<article\b([^>]*)>([\s\S]*?)<\/article>/g;
  let match;
  while ((match = re.exec(page))) {
    const attrs = match[1];
    const body = match[2];
    const attr = (name) => {
      const found = attrs.match(new RegExp('data-' + name + '="([^"]*)"'));
      return found ? decode(found[1]) : '';
    };
    const pick = (cls) => {
      const found = body.match(new RegExp('<p class="' + cls + '">([\\s\\S]*?)</p>'));
      return found ? decode(found[1]) : '';
    };
    const src = (body.match(/<img[^>]*\ssrc="([^"]*)"/) || [])[1] || '';
    const bios = [];
    const bioBlock = (body.match(/<div class="bio">([\s\S]*?)<\/div>/) || [])[1] || '';
    const para = /<p>([\s\S]*?)<\/p>/g;
    let paragraph;
    while ((paragraph = para.exec(bioBlock))) bios.push(decode(paragraph[1]));
    out.push({
      section: attr('section'),
      name: attr('name'),
      heading: decode((body.match(/<h3>([\s\S]*?)<\/h3>/) || [])[1] || ''),
      role: pick('role'),
      credentials: pick('credentials'),
      hasCredentials: /<p class="credentials">/.test(body),
      photo: decode(src),
      bio: bios
    });
  }
  return out;
}

test('about page is static HTML in the public page style', () => {
  assert.match(page, /<title>About \| Mindful Beginnings<\/title>/);
  assert.match(page, /name="description"/);
  assert.match(page, /name="viewport"/);
  assert.match(page, /href="\/favicon\.ico"/);
  assert.match(page, /Montserrat/);
  assert.match(page, /#1E3161/);
  assert.match(page, /#F5F2EA/);
  assert.match(page, /#EFC75A/);
  assert.doesNotMatch(page, /<script/i);
  assert.equal(page.includes('\u2014'), false);
  assert.equal(JSON.stringify(people).includes('\u2014'), false);
});

test('hero and mission use Lindsay placeholders and nothing else', () => {
  assert.match(page, /<h1>\[Lindsay: add a one-line intro here\]<\/h1>/);
  assert.match(page, /<p class="mission-copy">\[Lindsay: add your mission here\]<\/p>/);
  const hero = page.slice(page.indexOf('<section class="hero">'), page.indexOf('</section>') + 10);
  assert.equal(hero.includes('\u2014'), false);
  assert.doesNotMatch(hero, /\d{2,}/);
});

test('team cards match the uploaded people, in section order, with exact bios', () => {
  assert.equal(people.length, 27);
  const found = cards();
  assert.equal(found.length, people.length);
  const headings = [...page.matchAll(/<h2>([\s\S]*?)<\/h2>/g)].map((hit) => decode(hit[1]));
  assert.deepEqual(headings, ['Mission', 'Founder & President', 'Program Team', 'Lead Instructors', 'Instructors']);
  people.forEach((person, i) => {
    const card = found[i];
    assert.equal(card.section, person.section, 'section ' + person.name);
    assert.equal(card.name, person.name);
    assert.equal(card.heading, person.name);
    assert.equal(card.role, roleFor(person), 'role ' + person.name);
    assert.equal(card.photo, person.photo, 'photo ' + person.name);
    assert.deepEqual(card.bio, person.bio, 'bio ' + person.name);
    if (person.credentials && person.credentials.trim()) {
      assert.equal(card.credentials, person.credentials.trim(), 'credentials ' + person.name);
    } else {
      assert.equal(card.hasCredentials, false, 'no credentials ' + person.name);
    }
  });
});

test('bios start collapsed behind Expand all bios and can be shown', () => {
  assert.match(page, />Expand all bios</);
  assert.match(page, /id="expand-bios"/);
  assert.match(page, /\.bio\{display:none/);
  assert.match(page, /\.bios-toggle:checked ~ \.team-inner \.bio\{display:flex\}/);
  assert.equal((page.match(/class="bio"/g) || []).length, 27);
});

test('closing actions and footer sit together with no empty band', () => {
  assert.match(page, /<a class="gold-btn" href="https:\/\/mindfulbeginnings\.org\/host-a-class-1">Book a class<\/a>/);
  assert.match(page, /<a class="contact-link" href="https:\/\/mindfulbeginnings\.org\/contact">Contact<\/a>/);
  assert.match(page, /<section class="close">[\s\S]*Book a class[\s\S]*Contact[\s\S]*<\/section>\s*<footer class="footer">/);
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
