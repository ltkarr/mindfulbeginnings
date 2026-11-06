'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
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

test('school clubs copy lets the school choose before or after school and the series length', () => {
  const section = page.slice(page.indexOf('<h3>School Clubs</h3>'), page.indexOf('</ul>', page.indexOf('<h3>School Clubs</h3>')));
  assert.match(section, /one hour a week, before school or after dismissal/);
  assert.match(section, /whichever the school chooses/);
  assert.match(section, /before-school arrival or after-school dismissal to you/);
  assert.match(section, /certified teachers and registered nurses/);
  assert.match(section, /series length that fits their calendar, such as a <strong>6-, 8-, or 10-week series<\/strong>/);
  assert.match(section, /My First Babysitter&rsquo;s Club is 8 to 12 kids/);
  assert.match(section, /The other clubs are 8 to 16 kids/);
  assert.match(section, /minimum of 6 students/);
  assert.match(section, /Every club is also offered in Spanish/);
  assert.doesNotMatch(section, /right after dismissal/);
  assert.doesNotMatch(section, /8-week series only/);
  assert.doesNotMatch(section, /8 or 10 weeks/);
  assert.doesNotMatch(section, /—/);
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

test('quiz has 20 questions, passes at 16, and posts to the shared submit endpoint', () => {
  const questions = page.match(/lesson:\d+\}/g) || [];
  assert.equal(questions.length, 20);
  assert.match(page, /var PASS=16/);
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

function extractInlineScripts(html) {
  const scripts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    const attrs = match[1] || '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i);
    const type = typeMatch ? typeMatch[1].toLowerCase() : '';
    if (type && type !== 'text/javascript' && type !== 'application/javascript' && type !== 'text/ecmascript' && type !== 'module') {
      continue;
    }
    scripts.push(match[2]);
  }
  return scripts;
}

test('onboarding page inline script passes node --check', () => {
  const scripts = extractInlineScripts(page);
  assert.ok(scripts.length > 0, 'instructor-onboarding.html has no inline script to syntax-check');
  scripts.forEach((code, index) => {
    const file = path.join(os.tmpdir(), 'mb-onboarding-' + process.pid + '-' + index + '.js');
    fs.writeFileSync(file, code);
    try {
      const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
      const detail = (result.stderr || result.stdout || 'node --check failed').trim();
      assert.equal(result.status, 0, detail);
    } finally {
      fs.rmSync(file, { force: true });
    }
  });
});

test('admin has an onboarding screen wired to renderOnboarding', () => {
  assert.match(admin, /showScreen\('onboarding',this\)/);
  assert.match(admin, /id="screen-onboarding"/);
  assert.match(admin, /function renderOnboarding\(\)/);
  assert.match(admin, /from\('onboarding_results'\)/);
});
