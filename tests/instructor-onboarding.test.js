'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const page = fs.readFileSync(path.join(root, 'instructor-onboarding.html'), 'utf8');
const api = fs.readFileSync(path.join(root, 'api/evaluations/submit.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations/20261031_onboarding_results.sql'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

test('onboarding page is hidden from search and teaches the portal flow', () => {
  assert.match(page, /noindex, nofollow/);
  assert.match(page, /instructorportal\.mindfulbeginnings\.org/);
  assert.match(page, /Forgot your PIN/);
  assert.match(page, /Accept this job/);
  assert.match(page, /Open jobs/);
  assert.match(page, /My jobs/);
});

test('onboarding page teaches the guide essentials', () => {
  assert.match(page, /15 minutes early/);
  assert.match(page, /no more than three days before/);
  assert.match(page, /every compartment of every bag/);
  assert.match(page, /Manikins only/);
  assert.match(page, /student evaluation before the class ends/);
  assert.match(page, /fewer than 48 hours/i);
  assert.match(page, /Cancelled on the class day: paid in full/);
  assert.match(page, /within 48 hours/);
  assert.match(page, /ID badge/);
});

test('secrets stay behind the portal PIN and are never printed on the public page', () => {
  assert.doesNotMatch(page, /Bradmoor/);
  assert.doesNotMatch(page, /385515/);
  assert.doesNotMatch(page, /843 6676 4411/);
});

test('quiz has 15 questions, passes at 12, and posts to the shared submit endpoint', () => {
  const questions = page.match(/lesson:\d+\}/g) || [];
  assert.equal(questions.length, 15);
  assert.match(page, /var PASS=12/);
  assert.match(page, /\/api\/evaluations\/submit/);
  assert.match(page, /form:'onboarding'/);
  assert.match(page, /ob-website/); // honeypot field
});

test('submit endpoint recomputes the pass instead of trusting the client', () => {
  assert.match(api, /ONBOARDING_PASS_FRACTION = 0\.8/);
  assert.match(api, /passed: score \/ total >= ONBOARDING_PASS_FRACTION/);
  assert.doesNotMatch(api, /passed:\s*body\.passed/);
  assert.match(api, /body\.form === 'onboarding'/);
  assert.match(api, /onboarding_results/);
  assert.match(api, /body\.website/); // honeypot
});

test('migration creates onboarding_results with admin-only reads', () => {
  assert.match(migration, /create table if not exists public\.onboarding_results/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.onboarding_results from public, anon/);
  assert.match(migration, /to authenticated/);
});

test('quiz never reveals the correct answers after grading', () => {
  assert.doesNotMatch(page, /oi===item\.answer\)lab\.classList\.add\('correct'\)/);
  assert.doesNotMatch(page, /correct answers are highlighted/);
  assert.match(page, /You missed this one\. Work it out in/);
  assert.match(page, /right answers are not shown on purpose/);
});

test('admin has an onboarding screen wired to renderOnboarding', () => {
  assert.match(admin, /showScreen\('onboarding',this\)/);
  assert.match(admin, /id="screen-onboarding"/);
  assert.match(admin, /function renderOnboarding\(\)/);
  assert.match(admin, /from\('onboarding_results'\)/);
});
