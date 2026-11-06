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

test('quiz has 21 questions, passes at 17, and posts to the shared submit endpoint', () => {
  const questions = page.match(/lesson:\d+\}/g) || [];
  assert.equal(questions.length, 21);
  assert.match(page, /var PASS=17/);
  assert.match(page, /21 questions/);
  assert.match(page, /17 or more correct/);
  assert.match(page, /\/api\/evaluations\/submit/);
  assert.match(page, /form:'onboarding'/);
  assert.match(page, /ob-website/); // honeypot field
});

function quizQuestions(html) {
  const code = extractInlineScripts(html).find((script) => script.includes('var QUESTIONS='));
  assert.ok(code, 'quiz question bank was not found');
  const start = code.indexOf('var QUESTIONS=');
  const end = code.indexOf('];', start);
  return Function(code.slice(start, end + 2) + '\nreturn QUESTIONS;')();
}

test('each onboarding item has three plausible choices and one in-range key', () => {
  const questions = quizQuestions(page);
  const keyed = [
    'The Open jobs tab',
    'Text Lindsay for your PIN',
    'The host\u2019s cell number',
    'Up to three days before, unless Lindsay agrees to earlier',
    'As soon as you get the kit, at least one day before',
    'Check every compartment of every bag against the checklist',
    'Text Lindsay right away, before the day of class',
    '15 minutes early, so you can set up and test the technology',
    'Only on the manikins, never on another person',
    'On the floor, kneeling beside it',
    'Introduction first, and CPR before Life and Business Skills when you can',
    'The Safe@Home student evaluation',
    'Teach the course without slides, using your instructor guide',
    'Contact the instructor sub list yourself, right away',
    'You are paid in full, whether or not you had arrived',
    'Keep the kit for next week\u2019s class',
    'When the course is done, materials are returned, and evaluations are in',
    'Leave it to Mindful Beginnings, which sends raises in writing',
    'Leave the job posted and do not accept it',
    'Claim host, then open the slides and share your screen',
    'Draw one ticket at the end of class'
  ];
  const lessons = [1, 1, 2, 3, 3, 3, 3, 3, 4, 4, 4, 4, 5, 7, 7, 8, 8, 8, 8, 6, 4];
  assert.equal(questions.length, 21);
  assert.deepEqual(questions.map((item) => item.lesson), lessons);
  questions.forEach((item, index) => {
    assert.equal(item.options.length, 3, 'question ' + (index + 1) + ' does not have 3 choices');
    assert.equal(new Set(item.options).size, 3, 'question ' + (index + 1) + ' repeats a choice');
    assert.equal(Number.isInteger(item.answer) && item.answer >= 0 && item.answer < item.options.length, true);
    assert.equal(item.options[item.answer], keyed[index], 'question ' + (index + 1) + ' key changed');
    item.options.forEach((option) => {
      assert.doesNotMatch(option, /all of the above|none of the above/i);
      assert.equal(option.includes("'"), false, 'question ' + (index + 1) + ' has a straight apostrophe');
    });
  });
  const bank = questions.map((item) => item.q + ' ' + item.options.join(' ')).join('\n');
  [
    'Ask another instructor for theirs',
    'pillows and cushions',
    'Buy the item yourself',
    'Teach without it and say nothing',
    'Ask the host to make up',
    'Every Friday',
    'Once a month',
    'On the instructor',
    'Record the session',
    'candy',
    'skip the drawing',
    'pillows'
  ].forEach((phrase) => {
    assert.equal(bank.toLowerCase().includes(phrase.toLowerCase()), false, phrase);
  });
});

test('pass stays 17 of 21, which is the server 80 percent rule', () => {
  const questions = quizQuestions(page);
  function scoreOf(picks) {
    return questions.reduce((score, item, index) => score + (picks[index] === item.answer ? 1 : 0), 0);
  }
  const correct = questions.map((item) => item.answer);
  const seventeen = correct.map((answer, index) => index < 4 ? (answer + 1) % 3 : answer);
  const sixteen = correct.map((answer, index) => index < 5 ? (answer + 1) % 3 : answer);
  assert.equal(scoreOf(correct), 21);
  assert.equal(scoreOf(seventeen), 17);
  assert.equal(scoreOf(sixteen), 16);
  assert.equal(scoreOf(seventeen) >= 17, true);
  assert.equal(scoreOf(sixteen) >= 17, false);
  assert.equal(scoreOf(seventeen) / questions.length >= 0.8, true);
  assert.equal(scoreOf(sixteen) / questions.length >= 0.8, false);
  assert.match(page, /id="ob-retake"/);
});

test('onboarding explains bingo and raffle prizes without making them universal', () => {
  assert.match(page, /For classes using bingo prizes or a raffle, Mindful Beginnings chooses the setup/);
  assert.match(page, /sometimes a gift card, such as an Amazon gift card/);
  assert.match(page, /The choice can depend on the age group/);
  assert.match(page, /give raffle tickets as prizes or for volunteering, then draw the gift card at the end of class/);
  assert.match(page, /Mindful Beginnings provides the tickets/);
  assert.match(page, /You do not have to buy anything/);
  assert.match(page, /No candy/);
  assert.doesNotMatch(page, /grand prize is your responsibility/);
  assert.doesNotMatch(page, /reimburs/);
  assert.doesNotMatch(page, /not a promise that every class/);
});

test('Safe Sitter guide prize notes match onboarding and do not assign the grand prize to the instructor', () => {
  const guide = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
  const prizes = guide.slice(guide.indexOf("{sub:'Prizes'"), guide.indexOf("{sub:'Videos'"));
  assert.match(prizes, /For a class using bingo prizes or a raffle, Mindful Beginnings chooses the setup/);
  assert.match(prizes, /sometimes a gift card, such as an Amazon gift card/);
  assert.match(prizes, /The choice can depend on the age group/);
  assert.match(prizes, /Give raffle tickets as prizes or for volunteering, then draw the gift card at the end of class/);
  assert.match(prizes, /Mindful Beginnings provides the tickets/);
  assert.match(prizes, /You do not have to buy anything\. No candy\./);
  assert.doesNotMatch(prizes, /grand prize is your responsibility/);
  assert.equal(guide.split('grand prize is your responsibility').length, 1);
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
