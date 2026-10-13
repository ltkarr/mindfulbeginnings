'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'girl-scouts.html'), 'utf8');
const cfg = require('../vercel.json');

test('girl scout workshops keep each level and use one request button', () => {
  assert.equal(page.includes('\u2014'), false);
  assert.equal(page.includes('\u2013'), false);
  ['Daisy', 'Brownie', 'Junior', 'Cadette', 'Senior', 'Ambassador'].forEach(function (level) {
    assert.match(page, new RegExp('>' + level + ' \\('));
  });
  assert.match(page, /Good Neighbor/);
  assert.match(page, /My Best Self Badge/);
  assert.match(page, /Babysitter Badge/);
  assert.match(page, /Science of Happiness Badge/);
  assert.match(page, /Eating for You Badge/);
  assert.match(page, /Women's Health Badge/);
  assert.match(page, /Coaching Badge/);
  assert.match(page, /Pricing varies by workshop and group size/);
  assert.doesNotMatch(page, /\$\d/);
  const buttons = page.match(/Request a troop workshop/g) || [];
  assert.equal(buttons.length, 1);
  assert.match(page, /<div class="section-action">\s*<a class="gold-btn" href="\/organization\.html">Request a troop workshop<\/a>/);
  const cards = page.match(/<article class="card">[\s\S]*?<\/article>/g) || [];
  assert.equal(cards.length, 16);
  cards.forEach(function (card) {
    assert.doesNotMatch(card, /Request a troop workshop/);
    assert.doesNotMatch(card, /<a /);
  });
  cards.forEach(function (card) {
    const src = (card.match(/src="([^"]+)"/) || [])[1];
    assert.ok(src, 'card image');
    assert.equal(fs.existsSync(path.join(root, src.slice(1))), true, src);
  });
  assert.match(page, /\.card img\{[^}]*object-fit:contain/);
  assert.match(page, /\.card img\{[^}]*width:112px;height:112px/);
  assert.doesNotMatch(page, /object-fit:\s*cover/);
});

test('clean /girl-scouts URL rewrites to the workshop page', () => {
  const rules = (cfg.rewrites || []).filter((rule) => rule.destination === '/girl-scouts.html');
  const sources = rules.map((rule) => rule.source).sort();
  assert.deepEqual(sources, ['/girl-scouts', '/girl-scouts/']);
});
