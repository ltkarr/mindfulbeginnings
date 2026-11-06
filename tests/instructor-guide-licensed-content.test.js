'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const guide = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');

const QUESTION = 'What should I know about Safe Sitter and American Red Cross program content?';
const ANSWER = 'Mindful Beginnings is a licensed provider of Safe Sitter and American Red Cross programs, so we\'re required to teach their content as provided. Please keep this in mind and refrain from requesting content changes or offering critiques of the curriculum. Thank you for respecting these program requirements!';

function loadFaqSections(src) {
  const start = src.indexOf('const FAQ_SECTIONS=');
  const end = src.indexOf('function renderGuide()');
  assert.ok(start >= 0 && end > start, 'FAQ_SECTIONS block missing');
  const sandbox = {};
  vm.createContext(sandbox);
  vm.runInContext(src.slice(start, end) + '\nglobalThis.__faq = FAQ_SECTIONS;', sandbox);
  assert.ok(Array.isArray(sandbox.__faq), 'FAQ_SECTIONS did not evaluate');
  return sandbox.__faq;
}

test('licensed program content FAQ sits in the courses section', () => {
  const sections = loadFaqSections(guide);
  const courses = sections.find(function (sec) {
    return sec.title === '1. Courses you are approved to teach';
  });
  assert.ok(courses, 'courses section missing');
  const block = (courses.blocks || []).find(function (bl) {
    return bl.sub === 'Program content';
  });
  assert.ok(block, 'Program content subsection missing');
  assert.equal(block.items.length, 1);
  assert.equal(block.items[0][0], QUESTION);
  assert.equal(block.items[0][1], ANSWER);

  const elsewhere = sections.filter(function (sec) { return sec !== courses; });
  const dumped = JSON.stringify(elsewhere);
  assert.equal(dumped.includes(QUESTION), false);
  assert.equal(dumped.includes('refrain from requesting content changes'), false);
  assert.equal(dumped.includes('offering critiques of the curriculum'), false);
});

test('the approved licensed-content answer appears once and adds no other rule', () => {
  const phrase = 'refrain from requesting content changes or offering critiques of the curriculum';
  const matches = guide.match(/refrain from requesting content changes or offering critiques of the curriculum/g) || [];
  assert.equal(matches.length, 1);
  assert.equal(guide.includes(phrase), true);
  assert.equal(guide.includes('does not have the authority to change their content'), false);
  const sections = loadFaqSections(guide);
  const courses = sections.find(function (sec) {
    return sec.title === '1. Courses you are approved to teach';
  });
  const block = courses.blocks.find(function (bl) { return bl.sub === 'Program content'; });
  const text = block.items.map(function (it) { return it.join(' '); }).join('\n');
  assert.equal(text, QUESTION + ' ' + ANSWER);
  assert.equal(/accommodation/i.test(text), false);
  assert.equal(/\b(fee|eligibility|onboarding|timing)\b/i.test(text), false);
});
