'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');

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

const rateBlockStart = admin.indexOf('const PARTNER_FLAT_RATE=');
const rateBlockEnd = admin.indexOf('const PARTNER_SETTINGS_DEFAULTS');
assert.ok(rateBlockStart > 0 && rateBlockEnd > rateBlockStart);

const sandbox = { Math, Number, String };
vm.createContext(sandbox);
vm.runInContext(
  [
    admin.slice(rateBlockStart, rateBlockEnd),
    extractFunction(admin, 'round2'),
    extractFunction(admin, 'fmtPlain'),
    extractFunction(admin, 'tierFor'),
    extractFunction(admin, 'applyPartnerRowRates')
  ].join('\n'),
  sandbox
);

test('the liaison rate is 40% of profit and Lindsay keeps 60%', () => {
  const tier = sandbox.tierFor(0);
  assert.equal(tier.rate, 0.40);
  assert.equal(tier.label, '40% of profit');
  assert.match(admin, /const PARTNER_FLAT_RATE=0\.40/);
  assert.match(admin, /% of profit — you keep \$\{Math\.round\(\(1-PARTNER_FLAT_RATE\)\*100\)\}%/);
  assert.doesNotMatch(admin, /PARTNER_FLAT_RATE=0\.20/);
  assert.doesNotMatch(admin, /20% of net/);
  assert.doesNotMatch(instructor, /flatRate\|\|0\.20/);
  assert.match(instructor, /flatRate!=null\?d\.flatRate:0\.40/);
  // Organization revenue-share stays on its own rate.
  assert.match(admin, /const ORG_SHARE_PCT=50/);
});

test('commission is 40% of profit, not 40% or 20% of collected revenue', () => {
  const row = {
    sessionId: 's1',
    isOrg: false,
    isRepeat: false,
    isReferral: false,
    gross: 225,
    collected: 200,
    costs: 80,
    net: 120
  };
  sandbox.applyPartnerRowRates([row], 200, { accelGrouping: 'booking', repeatPolicy: 'tier' });
  assert.equal(row.rate, 0.40);
  assert.equal(row.commission, 48); // 40% of 120 profit
  assert.notEqual(row.commission, 80); // 40% of collected
  assert.notEqual(row.commission, 90); // 40% of gross
  assert.notEqual(row.commission, 24); // the old 20% of profit
  assert.match(row.reason, /40% of \$120 profit/);
  assert.match(row.reason, /not a share of gross/);
});

test('a booking that lost money pays the liaison nothing', () => {
  const row = {
    sessionId: 's2',
    isOrg: false,
    isRepeat: false,
    isReferral: true,
    collected: 40,
    costs: 90,
    net: -50
  };
  sandbox.applyPartnerRowRates([row], 40, { accelGrouping: 'booking', repeatPolicy: 'tier' });
  assert.equal(row.commission, 0);
  assert.equal(row.rate, 0.40);
});
