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

test('family-facing JS is not cached so registration and PayPal helpers stay current', () => {
  const sources = (cfg.headers || []).map((rule) => rule.source);
  assert.ok(sources.includes('/js/payments.js'));
  assert.ok(sources.includes('/js/public-sessions.js'));
});

test('PayPal API routes on vercel.app are not redirected', () => {
  const rules = hostRedirects();
  assert.ok(
    rules.every((rule) => rule.source === '/' || /\(\?!api\//.test(rule.source)),
    'host redirects should exclude /api/ so existing PayPal webhooks keep working'
  );
});

const INSTRUCTOR_HOST = 'instructorportal.mindfulbeginnings.org';

test('root redirect to register.html does not fire on the instructor portal host', () => {
  const rule = (cfg.redirects || []).find(
    (r) => r.source === '/' && r.destination === '/register.html'
  );
  assert.ok(rule, 'expected the / -> /register.html redirect to still exist');
  const hosts = (rule.has || [])
    .filter((cond) => cond.type === 'host')
    .map((cond) => cond.value);
  assert.ok(
    hosts.includes('register.mindfulbeginnings.org') && !hosts.includes(INSTRUCTOR_HOST),
    'the / -> /register.html redirect must fire only on the register host, never the instructor portal host'
  );
});

test('instructor portal host redirects / to /instructor before the marketing homepage', () => {
  const rule = (cfg.redirects || []).find(
    (r) =>
      r.source === '/' &&
      r.destination === '/instructor' &&
      r.permanent === false &&
      (r.has || []).some(
        (cond) => cond.type === 'host' && cond.value === INSTRUCTOR_HOST
      )
  );
  assert.ok(rule, 'expected a host-conditioned / -> /instructor redirect');
  const fileRule = (cfg.redirects || []).find(
    (r) =>
      r.source === '/index.html' &&
      r.destination === '/instructor' &&
      (r.has || []).some(
        (cond) => cond.type === 'host' && cond.value === INSTRUCTOR_HOST
      )
  );
  assert.ok(fileRule, 'expected /index.html on the instructor host to redirect to /instructor');
  const deadRewrite = (cfg.rewrites || []).find(
    (r) =>
      r.source === '/' &&
      (r.has || []).some((cond) => cond.type === 'host' && cond.value === INSTRUCTOR_HOST)
  );
  assert.equal(deadRewrite, undefined, 'a rewrite of / never runs while index.html exists');
});

test('old instructor.html URL on register host permanently redirects to the portal', () => {
  const rule = (cfg.redirects || []).find(
    (r) =>
      r.source === '/instructor.html' &&
      r.destination === 'https://instructorportal.mindfulbeginnings.org/instructor' &&
      r.permanent === true &&
      (r.has || []).some(
        (cond) => cond.type === 'host' && cond.value === 'register.mindfulbeginnings.org'
      )
  );
  assert.ok(rule, 'expected a permanent /instructor.html -> instructor portal redirect on the register host');
});

test('mindfulbeginnings.org is not redirected to the instructor portal', () => {
  const rules = (cfg.redirects || []).concat(cfg.rewrites || []);
  const marketing = rules.filter((rule) =>
    (rule.has || []).some((cond) =>
      cond.type === 'host' &&
      (cond.value === 'mindfulbeginnings.org' || cond.value === 'www.mindfulbeginnings.org')
    )
  );
  assert.equal(marketing.length, 0);
  assert.ok(
    rules.every((rule) => {
      const hosts = (rule.has || []).filter((cond) => cond.type === 'host').map((cond) => cond.value);
      if (!hosts.length) return true;
      if (hosts.includes('mindfulbeginnings.org') || hosts.includes('www.mindfulbeginnings.org')) {
        return !String(rule.destination).includes('/instructor');
      }
      return true;
    })
  );
});

test('job emails, reminder cron, and cancellation email use the portal path', () => {
  const portal = require('../lib/instructor-portal-url');
  assert.equal(portal, 'https://instructorportal.mindfulbeginnings.org/instructor');
  const admin = fs.readFileSync(path.join(__dirname, '../admin.html'), 'utf8');
  const reminders = fs.readFileSync(path.join(__dirname, '../api/remind-instructors.js'), 'utf8');
  const cancelled = fs.readFileSync(path.join(__dirname, '../api/notify-instructor-cancelled.js'), 'utf8');
  assert.match(admin, /const INSTRUCTOR_PORTAL_URL='https:\/\/instructorportal\.mindfulbeginnings\.org\/instructor'/);
  assert.match(admin, /instructorportal\.mindfulbeginnings\.org\/instructor<\/a>/);
  assert.match(reminders, /portal_url: INSTRUCTOR_PORTAL_URL/);
  assert.match(cancelled, /portal_url: INSTRUCTOR_PORTAL_URL/);
  assert.doesNotMatch(admin, /INSTRUCTOR_PORTAL_URL='https:\/\/instructorportal\.mindfulbeginnings\.org\/'/);
});
