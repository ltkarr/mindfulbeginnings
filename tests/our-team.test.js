'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const cfg = require('../vercel.json');

const PAGE = fs.readFileSync(path.join(__dirname, '../our-team.html'), 'utf8');
const WIDGET = fs.readFileSync(path.join(__dirname, '../our-team-widget.html'), 'utf8');

function imgSrcs(html) {
  return [...html.matchAll(/\ssrc="([^"]+)"/g)].map((m) => m[1]);
}

function names(html) {
  return [...html.matchAll(/class="mb-name">([^<]+)/g)].map((m) => m[1]);
}

test('Our Team page and GoDaddy widget list the same 27 people', () => {
  const pageNames = names(PAGE);
  const widgetNames = names(WIDGET);
  assert.equal(pageNames.length, 27);
  assert.deepEqual(pageNames, widgetNames);
  assert.ok(pageNames.includes('Lindsay Karr, M.Ed.'));
});

test('team photos are uncropped originals with a width-only resize', () => {
  for (const html of [PAGE, WIDGET]) {
    const srcs = imgSrcs(html);
    assert.equal(srcs.length, 54, '27 avatars + 27 expanded photos');
    for (const src of srcs) {
      assert.match(src, /^https:\/\/img1\.wsimg\.com\/isteam\/ip\/[^/]+\/.+:\/rs=w:800$/);
      assert.doesNotMatch(src, /\/cr=/);
      assert.doesNotMatch(src, /cg:true/);
      assert.doesNotMatch(src, /h:800/);
    }
  }
});

test('avatar and expanded photos use cover + face-centered object-position', () => {
  for (const html of [PAGE, WIDGET]) {
    assert.match(html, /\.mb-photo\s*\{[^}]*object-fit:\s*cover/s);
    assert.match(html, /\.mb-photo\s*\{[^}]*object-position:\s*center 20%/s);
    assert.match(html, /\.mb-photo-lg\s*\{[^}]*object-fit:\s*cover/s);
    assert.match(html, /\.mb-photo-lg\s*\{[^}]*object-position:\s*center 20%/s);
  }
});

test('/our-team is served from our-team.html', () => {
  const rule = (cfg.rewrites || []).find((r) => r.source === '/our-team');
  assert.ok(rule, 'expected a /our-team rewrite');
  assert.equal(rule.destination, '/our-team.html');
});
