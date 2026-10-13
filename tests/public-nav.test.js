'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const partial = fs.readFileSync(path.join(root, 'partials/site-header.html'), 'utf8');

const pages = {
  'classes-catalog.html': '/classes-catalog',
  'cpr-certification.html': '/cpr-certification',
  'about.html': '/about',
  'register.html': '/register.html',
  'host.html': '/host-a-class',
  'organization.html': '/host-a-class',
  'index.html': '',
  'host-a-class.html': '/host-a-class',
  'girl-scouts.html': '/girl-scouts',
  'contact.html': '/contact',
  'pay.html': ''
};

function normalize(nav) {
  return nav.replace(/\saria-current="page"/g, '').replace(/\s+/g, ' ').trim();
}

function navOf(html, file) {
  const found = [...html.matchAll(/<nav class="mb-nav" aria-label="Primary">[\s\S]*?<\/nav>/g)];
  assert.equal(found.length, 1, file + ' should have one primary nav');
  return found[0][0];
}

test('shared header partial is the public nav, with no em dash', () => {
  assert.equal(partial.includes('\u2014'), false);
  assert.match(partial, /<nav class="mb-nav" aria-label="Primary">/);
  const hrefs = [...navOf(partial, 'partials/site-header.html').matchAll(/href="([^"]*)"/g)].map((hit) => hit[1]);
  assert.deepEqual(hrefs, [
    '/classes-catalog',
    '/host-a-class',
    '/girl-scouts',
    '/about',
    '/contact',
    '/cpr-certification',
    '/register.html'
  ]);
  assert.match(partial, /href="\/cpr-certification">CPR for groups<\/a>/);
  assert.match(partial, /class="mb-register" href="\/register\.html">Register<\/a>/);
  assert.doesNotMatch(partial, /mindfulbeginnings\.org\/host-a-class/);
  assert.doesNotMatch(partial, /Reviews/);
});

test('every public page uses that same nav and the shared stylesheet', () => {
  const expected = normalize(navOf(partial, 'partials/site-header.html'));
  Object.keys(pages).forEach((file) => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    assert.match(html, /href="\/css\/site\.css"/, file);
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
