'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const admin = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');

function extractFunction(src, name) {
  const start = src.indexOf('function ' + name + '(');
  if (start < 0) throw new Error('missing ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (let j = i; j < src.length; j++) {
    const ch = src[j];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return src.slice(start, j + 1);
    }
  }
  throw new Error('unclosed ' + name);
}

function between(startNeedle, endNeedle) {
  const start = admin.indexOf(startNeedle);
  const end = admin.indexOf(endNeedle, start + startNeedle.length);
  assert.ok(start >= 0 && end > start, startNeedle);
  return admin.slice(start, end);
}

const sandbox = { Date, String, Number, Math, Object, isGirlScoutBadgeCourseName: function (course) {
  return /girl scouts?/i.test(course || '') && /badge/i.test(course || '');
}};
vm.createContext(sandbox);
vm.runInContext(
  [
    extractFunction(admin, 'escapeHtml'),
    extractFunction(admin, 'fmtYMD'),
    extractFunction(admin, 'matAddDays'),
    extractFunction(admin, 'matDaysBetween'),
    extractFunction(admin, 'materialsCheckedStamp'),
    between('const PACKING_TOGETHER_DAYS', '// Tracks whether each pre-class reminder')
  ].join('\n'),
  sandbox
);

test('badge and troop names map to one level with its grades', () => {
  assert.equal(sandbox.troopLevelFromText('Brownie First Aid badge for Troop 37234, about 11 Brownies.'), 'brownie');
  assert.equal(sandbox.troopLevelLabel('brownie'), 'Brownie (grades 2–3)');
  assert.equal(sandbox.troopLevelFromText('Girl Scout badge: Cadette First Aid\nExpected participants: 11 7th graders'), 'cadette');
  assert.equal(sandbox.troopLevelLabel('cadette'), 'Cadette (grades 6–8)');
  assert.equal(sandbox.troopLevelFromText('GS Cadette Troop 51093'), 'cadette');
  assert.equal(sandbox.troopLevelFromText('Junior (grades 4–5)'), 'junior');
  assert.equal(sandbox.troopLevelFromText('Daisy (K-1)'), 'daisy');
  assert.equal(sandbox.troopLevelFromText('Senior troop'), 'senior');
  assert.equal(sandbox.troopLevelFromText('Ambassador troop'), 'ambassador');
  assert.equal(sandbox.troopLevelFromText('Girl Scout badge: First Aider'), null);
  assert.equal(sandbox.troopLevelFromText('60-minute class for girls in grades 5–7.'), null);
  assert.equal(sandbox.troopLevelFromText('Clubs: Little Medics (Grades K–2), Kid Boss Club (Grades 4–5)\nGirl Scout badge: First Aider'), null);
  assert.equal(sandbox.troopLevelFromText('Brownie and Cadette troops together'), null);

  const saved = {
    course: 'Girl Scout Badge Class',
    code: 'GSFA-270303',
    troopLevel: 'daisy',
    notes: 'Brownie First Aid'
  };
  assert.equal(sandbox.troopLevelForSession(saved), 'daisy');
  assert.equal(sandbox.packingTroopPhrase(saved), 'Daisy (grades K–1)');
});

test('the packing list prints the troop level on a Girl Scout badge class', () => {
  const session = {
    id: 'gs',
    course: 'Girl Scout Badge Class',
    code: 'GSFA-270303',
    date: '2026-11-12',
    time: '5:00 PM',
    location: 'Library',
    city: 'Olney',
    billToOrg: 'Girl Scout Troop 37234 (Heather Swanek)',
    notes: 'Brownie First Aid badge for Girl Scout Troop 37234, about 11 Brownies.',
    hasHost: false,
    isVirtual: false,
    isCancelled: false,
    isHold: false
  };
  const plain = {
    id: 'ss',
    course: 'Safe Sitter®',
    code: 'SS-1103',
    date: '2026-11-03',
    time: '10:00 AM',
    location: 'Center',
    city: 'Bethesda',
    hasHost: false,
    isVirtual: false,
    isCancelled: false,
    isHold: false
  };
  const built = sandbox.packingBuildModel([session, plain], [], {}, '2026-10-29', 180, []);
  const byId = Object.fromEntries(built.rows.map((r) => [r.id, r]));
  assert.equal(byId.gs.troopPhrase, 'Brownie (grades 2–3)');
  assert.equal(byId.ss.troopPhrase, '');
  const screen = sandbox.packingGroupsHtml(built);
  const pdf = sandbox.packingPrintHtml(built, new Date('2026-10-29T15:00:00Z'));
  assert.match(screen, /Brownie \(grades 2–3\)/);
  assert.match(pdf, /Brownie \(grades 2–3\)/);
  assert.equal((screen.match(/Troop level: not set/g) || []).length, 0);

  const unknown = Object.assign({}, session, { id: 'unk', notes: 'Girl Scout badge: First Aider', billToOrg: 'Troop 22051' });
  const missing = sandbox.packingBuildModel([unknown], [], {}, '2026-10-29', 180, []);
  assert.equal(missing.rows[0].troopPhrase, 'Troop level: not set');
  assert.match(admin, /Troop level/);
  assert.match(admin, /id="m-troop-level"|m-troop-level/);
});
