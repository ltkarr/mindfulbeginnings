'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const cfg = require('../vercel.json');
const { PUBLIC_ORIGIN } = require('../js/confirmation-email');

const BRANDED = 'https://register.mindfulbeginnings.org';

function hostRedirects() {
  return (cfg.redirects || []).filter((rule) =>
    (rule.has || []).some(
      (cond) => cond.type === 'host' && cond.value === 'mindfulbeginnings.vercel.app'
    )
  );
}

test('legacy vercel.app host permanently redirects to the branded domain', () => {
  const rules = hostRedirects();
  assert.ok(rules.length >= 1, 'expected at least one host-conditioned redirect');
  for (const rule of rules) {
    assert.equal(rule.permanent, true);
    assert.match(rule.destination, /^https:\/\/register\.mindfulbeginnings\.org/);
    assert.doesNotMatch(rule.destination, /vercel\.app/);
  }
});

test('register.html and query-bearing paths are covered by the host redirect', () => {
  const rules = hostRedirects();
  const coversRoot = rules.some((rule) => rule.source === '/' || /:path/.test(rule.source) || /\.\*/.test(rule.source));
  const coversNested = rules.some((rule) => /:path/.test(rule.source) || /\.\*/.test(rule.source));
  assert.equal(coversRoot, true);
  assert.equal(coversNested, true);
  assert.ok(
    rules.some((rule) => rule.destination.includes(':path') || rule.destination.endsWith('/')),
    'destination must preserve the request path'
  );
});

test('shared origin constants agree on the branded host', () => {
  assert.equal(PUBLIC_ORIGIN, BRANDED);
  const config = fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8');
  const admin = fs.readFileSync(path.join(__dirname, '../admin.html'), 'utf8');
  const register = fs.readFileSync(path.join(__dirname, '../register.html'), 'utf8');
  assert.match(config, /const PUBLIC_ORIGIN='https:\/\/register\.mindfulbeginnings\.org'/);
  assert.match(admin, /const REG_PAGE='https:\/\/register\.mindfulbeginnings\.org\/register\.html'/);
  assert.match(register, /register\.mindfulbeginnings\.org/);
  assert.doesNotMatch(admin, /mindfulbeginnings\.vercel\.app/);
  assert.doesNotMatch(register, /mindfulbeginnings\.vercel\.app/);
  assert.doesNotMatch(config, /mindfulbeginnings\.vercel\.app/);
});

test('PayPal API routes on vercel.app are not redirected', () => {
  const rules = hostRedirects();
  assert.ok(
    rules.every((rule) => rule.source === '/' || /\(\?!api\//.test(rule.source)),
    'host redirects should exclude /api/ so existing PayPal webhooks keep working'
  );
});

test('/register is rewritten to register.html so the clean URL stays in the bar', () => {
  const rewrites = cfg.rewrites || [];
  const destinations = rewrites
    .filter((rule) => rule.source === '/register' || rule.source === '/register/')
    .map((rule) => rule.destination);
  assert.ok(destinations.includes('/register.html'), 'expected /register → /register.html rewrite');
  assert.equal(
    destinations.length,
    2,
    'both /register and /register/ should rewrite to register.html'
  );
  assert.ok(
    !(cfg.redirects || []).some((rule) => rule.source === '/register' || rule.source === '/register/'),
    'do not 30x /register to .html; use a rewrite so the public URL can stay /register'
  );
});

test('existing /register.html links are not redirected away', () => {
  assert.ok(
    !(cfg.redirects || []).some((rule) => rule.source === '/register.html'),
    '/register.html must keep serving the registration page'
  );
  assert.equal(fs.existsSync(path.join(__dirname, '../register.html')), true);
});
