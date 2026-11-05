'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const overviews = require(path.join(root, 'js/course-overviews.js'));
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
const build = fs.readFileSync(path.join(root, 'scripts/build-overview-pages.py'), 'utf8');

function readPage(slug) {
  return fs.readFileSync(path.join(root, 'course-overviews', slug + '.html'), 'utf8');
}

function stripClass(html, className) {
  const tagRe = /<(\/?)(div|p|span|tr|h2|h3|table|section)\b([^>]*)>/gi;
  let out = '';
  let i = 0;
  let skipping = 0;
  let skipTag = '';
  let match;
  while (i < html.length) {
    tagRe.lastIndex = i;
    match = tagRe.exec(html);
    if (!match) {
      if (!skipping) out += html.slice(i);
      break;
    }
    if (!skipping) out += html.slice(i, match.index);
    const closing = match[1] === '/';
    const tag = match[2].toLowerCase();
    const attrs = match[3] || '';
    if (!closing && !skipping && new RegExp('class="[^"]*\\b' + className + '\\b').test(attrs)) {
      skipping = 1;
      skipTag = tag;
    } else if (skipping) {
      if (!closing && tag === skipTag) skipping += 1;
      else if (closing && tag === skipTag) skipping -= 1;
    } else {
      out += match[0];
    }
    i = tagRe.lastIndex;
  }
  return out;
}

function view(slug, format) {
  const html = readPage(slug);
  const main = html.slice(html.indexOf('<main'), html.indexOf('</main>'));
  return stripClass(main, format === 'virtual' ? 'ov-inperson' : 'ov-virtual');
}

test('virtual sessions and virtual course names get the format query', () => {
  const base = 'https://mindfulbeginnings.org/course-overviews/';
  assert.equal(overviews.isVirtualSession({ course: 'Ready. Period.', is_virtual: true }), true);
  assert.equal(overviews.isVirtualSession({ course: 'Ready. Period.', isVirtual: false }), false);
  assert.equal(overviews.isVirtualSession({ course: 'Safe@Home — Virtual', isVirtual: false }), true);
  assert.equal(overviews.urlFor('Social Ready', { virtual: true }), base + 'social-ready?format=virtual');
  assert.equal(overviews.urlFor('Season Ready™: Safety Skills for Student Athletes', { virtual: true }), base + 'season-ready?format=virtual');
  assert.equal(overviews.urlFor('Safe@Home', { virtual: false }), base + 'safe-at-home');
  assert.equal(overviews.urlForLang('Safe & Ready Families', 'es', { virtual: true }), base + 'safe-and-ready-families-es?format=virtual');
});

test('registration overview link passes the session virtual flag', () => {
  assert.match(register, /function overviewUrlForSession\(s\)/);
  assert.match(register, /api\.isVirtualSession\(s\)/);
  assert.match(register, /api\.urlFor\(s\.course,opts\)/);
});

test('the overview build reapplies the virtual format after a Drive sync', () => {
  assert.match(build, /patch_page\(page, slug\)/);
});

test('virtual overview pages hide in-person kits and keep in-person materials on the default view', () => {
  ['safe-at-home', 'stay-ready', 'season-ready', 'ready-period', 'social-ready'].forEach(function (slug) {
    const html = readPage(slug);
    assert.match(html, /data-overview-format/);
    assert.match(html, /format'\)==='virtual'/);
    assert.doesNotMatch(view(slug, 'virtual'), /\u2014|\u2013/);
  });

  const homeV = view('safe-at-home', 'virtual');
  const homeP = view('safe-at-home', 'in-person');
  assert.match(homeV, /No class materials/);
  assert.match(homeV, /device and a camera/);
  assert.doesNotMatch(homeV, /All class materials brought to your home/);
  assert.doesNotMatch(homeV, /one pad|large spoon|glass of water/);
  assert.match(homeP, /All class materials brought to your home, school or meeting space/);
  assert.match(homeP, /Ninety minutes, taught in one sitting/);

  const stayV = view('stay-ready', 'virtual');
  const stayP = view('stay-ready', 'in-person');
  assert.match(stayV, /No class materials/);
  assert.match(stayV, /no hands-on practice/);
  assert.doesNotMatch(stayV, /manikin/i);
  assert.doesNotMatch(stayV, /one pad|large spoon|glass of water/);
  assert.match(stayP, /Infant, child and adult manikins and all practice materials/);
  assert.match(stayP, /Two full minutes of CPR on each manikin/);

  const seasonV = view('season-ready', 'virtual');
  const seasonP = view('season-ready', 'in-person');
  assert.match(seasonV, /do not bring class materials/);
  assert.match(seasonV, /Live on Zoom/);
  assert.doesNotMatch(seasonV, /manikin/i);
  assert.doesNotMatch(seasonV, /bring all materials/i);
  assert.doesNotMatch(seasonV, /one pad|large spoon|glass of water/);
  assert.match(seasonP, /Our RNs bring all materials directly to your team/);
  assert.match(seasonP, /hands-only CPR manikins/);
  assert.match(seasonP, /We come to you/);

  const socialV = view('social-ready', 'virtual');
  const socialP = view('social-ready', 'in-person');
  assert.match(socialV, /device and a camera/);
  assert.match(socialV, /do not bring class materials/);
  assert.doesNotMatch(socialV, /we bring everything/i);
  assert.doesNotMatch(socialV, /one pad|large spoon|glass of water/);
  assert.match(socialP, /we bring everything/i);
  assert.match(socialP, /device and a camera/);

  const periodV = view('ready-period', 'virtual');
  const periodP = view('ready-period', 'in-person');
  assert.match(periodV, /one pad, a glass of water, a large spoon, and a towel/);
  assert.match(periodV, /Live on Zoom/);
  assert.doesNotMatch(periodV, /no class materials/i);
  assert.doesNotMatch(periodV, /pouch/i);
  assert.doesNotMatch(periodV, /product table/i);
  assert.doesNotMatch(periodV, /manikin/i);
  assert.match(periodP, /stocked mini period pouch/);
  assert.match(periodP, /The product table/);
  assert.match(periodP, /A full product table to open, touch and examine/);
  assert.doesNotMatch(periodP, /large spoon/);
});
