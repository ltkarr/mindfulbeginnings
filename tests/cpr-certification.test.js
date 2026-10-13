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
  assert.doesNotMatch(page, /<script(?![^>]*src="\/nav\.js")/i);
  assert.equal(page.includes('\u2014'), false);
});

test('schedule and contact links open the host page, contact page, and phone in the same tab', () => {
  assert.equal((page.match(/href="\/host-a-class\.html"/g) || []).length, 3);
  assert.match(page, /href="\/host-a-class\.html"[^>]*>Host a Class</);
  assert.match(page, /class="mb-btn mb-btn-gold mb-btn-sm" href="\/register\.html">Register</);
  assert.match(page, /href="\/host-a-class\.html"[^>]*>Schedule a group class</);
  assert.doesNotMatch(page, /target="_blank"/);
  assert.equal((page.match(/href="tel:\+17039875979"/g) || []).length, 2);
  assert.match(page, />703-987-5979</);
  assert.match(page, /href="mailto:lindsay@mindfulbeginnings\.org"/);
});

test('clean /cpr-certification URL rewrites to the static page', () => {
  const rules = (cfg.rewrites || []).filter((rule) => rule.destination === '/cpr-certification.html');
  const sources = rules.map((rule) => rule.source).sort();
  assert.deepEqual(sources, ['/cpr-certification', '/cpr-certification/']);
});
