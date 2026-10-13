'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const partial = fs.readFileSync(path.join(root, 'partials/site-nav.html'), 'utf8');

const pages = {
  'classes-catalog.html': '/classes-catalog',
  'cpr-certification.html': '/cpr-certification',
  'about.html': '/about',
  'register.html': '/register.html',
  'organization.html': '',
  'host.html': '',
  'girl-scouts.html': '/girl-scouts'
};

function normalize(nav) {
  return nav.replace(/\saria-current="page"/g, '').replace(/\s+/g, ' ').trim();
}

function navOf(html, file) {
  const found = [...html.matchAll(/<nav class="site-nav" aria-label="Primary">[\s\S]*?<\/nav>/g)];
  assert.equal(found.length, 1, file + ' should have one primary nav');
  return found[0][0];
}

test('shared nav partial is the catalog nav plus a CPR link, with no em dash', () => {
  assert.equal(partial.includes('\u2014'), false);
  assert.match(partial, /<nav class="site-nav" aria-label="Primary">/);
  const hrefs = [...partial.matchAll(/href="([^"]*)"/g)].map((hit) => hit[1]);
  assert.deepEqual(hrefs, [
    '/classes-catalog',
    '/cpr-certification',
    'https://mindfulbeginnings.org/host-a-class-1',
    '/girl-scouts',
    '/about',
    'https://mindfulbeginnings.org/reviews',
    'https://mindfulbeginnings.org/contact',
    'https://register.mindfulbeginnings.org/register.html',
    '/register.html'
  ]);
  assert.match(partial, /href="\/cpr-certification">CPR<\/a>/);
  assert.match(partial, /href="https:\/\/register\.mindfulbeginnings\.org\/register\.html">Find a class<\/a>/);
  assert.match(partial, /class="header-btn" href="\/register\.html">Register<\/a>/);
});

test('every public page uses that same nav and the shared stylesheet', () => {
  const expected = normalize(partial);
  Object.keys(pages).forEach((file) => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /href="\/css\/public\.css"/, file);
    const nav = navOf(html, file);
    assert.equal(normalize(nav), expected, file);
    const current = [...nav.matchAll(/<a\b([^>]*)>/g)]
      .filter((hit) => /aria-current="page"/.test(hit[1]))
      .map((hit) => (hit[1].match(/href="([^"]*)"/) || [])[1]);
    if (pages[file]) {
      assert.deepEqual(current, [pages[file]], file);
    } else {
      assert.deepEqual(current, [], file);
    }
  });
});
