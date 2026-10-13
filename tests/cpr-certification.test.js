'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'cpr-certification.html'), 'utf8');
const cfg = require('../vercel.json');

test('group CPR page is static HTML with a title and description', () => {
  assert.match(page, /<title>Group CPR Certification \| Mindful Beginnings<\/title>/);
  assert.match(page, /name="description"/);
  assert.match(page, /name="viewport"/);
  assert.match(page, /href="\/favicon\.ico"/);
  assert.doesNotMatch(page, /react/i);
  assert.doesNotMatch(page, /<script/i);
  assert.equal(page.includes('\u2014'), false);
});

test('schedule and contact links use mailto, phone, and the public site', () => {
  const mailto = 'mailto:lindsay@mindfulbeginnings.org?subject=Group%20CPR%20certification%20request';
  assert.equal((page.match(new RegExp(mailto.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 2);
  assert.match(page, />Schedule a group class</);
  assert.match(page, /href="#request"/);
  assert.match(page, /id="request"/);
  assert.equal((page.match(/href="tel:\+17039875979"/g) || []).length, 2);
  assert.match(page, />703-987-5979</);
  assert.match(page, /href="https:\/\/mindfulbeginnings\.org\/"/);
  assert.match(page, />mindfulbeginnings\.org</);
});

test('clean /cpr-certification URL rewrites to the static page', () => {
  const rules = (cfg.rewrites || []).filter((rule) => rule.destination === '/cpr-certification.html');
  const sources = rules.map((rule) => rule.source).sort();
  assert.deepEqual(sources, ['/cpr-certification', '/cpr-certification/']);
});
