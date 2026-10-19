'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const guide = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');

test('instructor guide class sizes follow the program guide and owner overrides', () => {
  assert.match(guide, /Any class can be split into shorter sessions/);
  assert.match(guide, /4 to 12 participants/);
  assert.match(guide, /Babysitter\\?'s Club[\s\S]{0,180}8 to 12/);
  assert.match(guide, /Stay Ready.{0,40}Choking Rescue, CPR, and Seizure Response/);
  assert.match(guide, /Babysitting Grandkids Workshop/);
  assert.match(guide, /Safe Sitter(?:®|\\u00ae) Grandparents: Getting Started/);
  assert.match(guide, /Introduction to Safe Babysitting by Safe Sitter/);
  assert.match(guide, /Adult and Pediatric First Aid\/CPR\/AED is 4\.25 hours/);
  assert.match(guide, /Baby Ready.{0,20}3 hours/);
  assert.match(guide, /All Kids Welcome.{0,80}in person or virtual/);
  assert.match(guide, /Girl Scout badge workshops are custom-scheduled/);
  assert.match(guide, /There is no 10-week series/);
  assert.match(guide, /\$200 per participant/);
  assert.match(guide, /workshop is \$165/);
  assert.doesNotMatch(guide, /1 instructor up to/);
  assert.doesNotMatch(guide, /2 instructors up to/);
  assert.doesNotMatch(guide, /120-minute/);
  assert.doesNotMatch(guide, /up to 30/);
  assert.doesNotMatch(guide, /\$275/);
  assert.match(guide, /'Baby Ready':\{hours:3,/);
  assert.match(guide, /'All Kids Welcome':\{hours:1,/);
});
