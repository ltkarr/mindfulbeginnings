'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'host.html'), 'utf8');
const cfg = require('../vercel.json');

function slice(start, end) {
  const from = page.indexOf(start);
  const to = page.indexOf(end, from);
  assert.ok(from >= 0 && to > from, start);
  return page.slice(from, to);
}

test('host page restores the three class photos in the catalog card layout', () => {
  const band = slice('<section class="host-band"', '<section class="host-paths"');
  assert.equal(band.includes('\u2014'), false);
  assert.equal(band.includes('\u2013'), false);
  [
    ['/images/host/group-cards.jpg', 'Group of young girls sitting on couches holding cards.'],
    ['/images/host/living-room-class.jpg', 'A woman teaching a group of people in a living room setting.'],
    ['/images/host/babysitting-practice.jpg', 'An instructor guiding girls through a babysitting practice with a doll.']
  ].forEach(function (pair) {
    assert.match(band, new RegExp('src="' + pair[0].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"'));
    assert.match(band, new RegExp('alt="' + pair[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '"'));
    assert.equal(fs.existsSync(path.join(root, pair[0].slice(1))), true, pair[0]);
  });
  assert.equal((band.match(/<article class="step-card">/g) || []).length, 3);
  assert.match(page, /\.step-grid,\.path-grid\{[^}]*align-items:stretch/);
  assert.match(page, /@media \(min-width:760px\)\{[\s\S]*\.step-grid\{grid-template-columns:repeat\(3/);
});

test('choose your path cards keep the facts and pin both buttons to the bottom', () => {
  const paths = slice('<section class="host-paths"', '<main>');
  assert.equal(paths.includes('\u2014'), false);
  assert.equal(paths.includes('\u2013'), false);
  assert.match(paths, /Choose your path/);
  assert.match(paths, /Home hosts get one free spot/);
  assert.match(paths, /href="#request-form">Host at my home</);
  assert.match(paths, /href="\/organization\.html">Host for my organization</);
  assert.equal((paths.match(/class="path-btn"/g) || []).length, 2);
  assert.match(page, /\.step-grid,\.path-grid\{[^}]*align-items:stretch/);
  assert.match(page, /\.path-body\{[^}]*flex:1/);
  assert.match(page, /\.path-btn\{margin-top:auto/);
  assert.match(page, /@media \(min-width:760px\)\{[\s\S]*\.path-grid\{grid-template-columns:repeat\(2/);
  assert.match(paths, /Girl Scout troops/);
  assert.match(paths, /group CPR certification/);
});

test('clean /host URL rewrites to the host page', () => {
  const rules = (cfg.rewrites || []).filter((rule) => rule.destination === '/host.html');
  const sources = rules.map((rule) => rule.source).sort();
  assert.deepEqual(sources, ['/host', '/host/']);
});
