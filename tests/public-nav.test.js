'use strict';

// The unified site shares one brand header (mb-header / mb-nav) across every
// marketing page. This replaces the old site-nav/public.css assertions: the
// nav lives inline per page. Since the 2026-10-26 less-is-more pass the
// primary nav has no Home link on any page (the logo links home instead),
// and aria-current marks the active page.

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');

// file -> href expected to carry aria-current="page" (null = none expected)
const pages = {
  'index.html': null,
  'about.html': '/about',
  'classes-catalog.html': '/classes-catalog',
  'host-a-class.html': '/host-a-class.html',
  'girl-scouts.html': '/girl-scouts.html',
  'cpr-certification.html': '/cpr-certification',
  'contact.html': '/contact.html',
};

function navOf(html, file) {
  const found = [...html.matchAll(/<nav class="mb-nav"[^>]*aria-label="Primary">[\s\S]*?<\/nav>/g)];
  assert.equal(found.length, 1, file + ' should have exactly one primary nav');
  return found[0][0];
}

test('every marketing page uses the shared unified nav with no em dash', () => {
  Object.keys(pages).forEach((file) => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const nav = navOf(html, file);
    assert.equal(nav.includes('—'), false, file + ' nav must not contain an em dash');
    assert.match(nav, /<a class="mb-btn mb-btn-gold mb-btn-sm" href="\/register\.html">Register<\/a>/,
      file + ' nav must end with the Register button');
    assert.match(nav, /href="\/cpr-certification"[^>]*>CPR Certification<\/a>/,
      file + ' nav must link CPR Certification');
  });
});

test('aria-current marks the active page, and the primary nav has no Home link', () => {
  Object.entries(pages).forEach(([file, expectedHref]) => {
    const html = fs.readFileSync(path.join(root, file), 'utf8');
    const nav = navOf(html, file);
    const current = [...nav.matchAll(/<a\b([^>]*)>/g)]
      .filter((hit) => /aria-current="page"/.test(hit[1]))
      .map((hit) => (hit[1].match(/href="([^"]*)"/) || [])[1]);
    if (expectedHref) {
      assert.deepEqual(current, [expectedHref], file);
    } else {
      assert.deepEqual(current, [], file + ' should mark nothing current');
    }
    assert.doesNotMatch(nav, />Home<\/a>/, file + ' primary nav should not link Home (logo does)');
  });
});
