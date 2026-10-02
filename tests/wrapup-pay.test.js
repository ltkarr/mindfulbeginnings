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

const names = [
  'escapeHtml', 'fmt',
  'instrBaseFee', 'instrDisplayFee', 'secondInstrDisplayFee',
  'wrapupPayAmount', 'wrapupPayCallout'
];

const sandbox = {
  COURSES: {
    'Safe Sitter®': { price: 225, hours: 5, maxStudents: 16 },
    'Campus Ready: Safety Skills for College Life': { price: 75, hours: 1, instrFlatFee: 100, requiresRN: true },
    'All Kids Welcome': { price: 25, hours: 1.5, instrFlatFee: 75, virtual: true }
  },
  INSTR_RATE: 50,
  INSTR_EXTRA_HOURS: 0.5
};
vm.createContext(sandbox);
vm.runInContext(names.map((n) => extractFunction(admin, n)).join('\n'), sandbox);

const alex = { id: 'a', name: 'Alex Rivera', hourlyRate: 40, zelle: 'alex@example.com' };
const jordan = { id: 'j', name: 'Jordan Lee', hourlyRate: 60, zelle: '555-0100' };

test('a course session shows each instructor the fee the pay screens already use', () => {
  const session = { course: 'Safe Sitter®', isVirtual: false };
  // hours × rate + one hour of travel + 30 minutes, at that instructor's rate
  assert.equal(sandbox.wrapupPayAmount(session, alex, {}, 'primary'), 5 * 40 + 40 + 0.5 * 40);
  assert.equal(sandbox.wrapupPayAmount(session, jordan, {}, 'second'), 5 * 60 + 60 + 0.5 * 60);
});

test('a flat course fee plus the extra half hour is what gets sent', () => {
  const session = { course: 'Campus Ready: Safety Skills for College Life' };
  assert.equal(sandbox.wrapupPayAmount(session, alex, {}, 'primary'), 100 + 0.5 * 40);
  const virtual = { course: 'All Kids Welcome', isVirtual: true };
  assert.equal(sandbox.wrapupPayAmount(virtual, alex, {}, 'primary'), 75 + 0.5 * 40);
});

test('a session pay override is the amount for every instructor on that job', () => {
  const session = { course: 'Safe Sitter®', instrPayOverride: 150 };
  assert.equal(sandbox.wrapupPayAmount(session, alex, {}, 'primary'), 150);
  assert.equal(sandbox.wrapupPayAmount(session, jordan, {}, 'second'), 150);
});

test('a custom job with no pay entered is not $0', () => {
  const session = { course: 'Library fair table', isCustomJob: true, instrPayOverride: null };
  assert.equal(sandbox.wrapupPayAmount(session, alex, {}, 'primary'), null);
  assert.equal(sandbox.wrapupPayAmount({ ...session, instrPayOverride: '' }, alex, {}, 'second'), null);
});

test('a custom job pay amount, including an explicit $0, is shown as entered', () => {
  const session = { course: '5K table', isCustomJob: true, instrPayOverride: 175 };
  assert.equal(sandbox.wrapupPayAmount(session, alex, {}, 'primary'), 175);
  assert.equal(sandbox.wrapupPayAmount({ ...session, instrPayOverride: 0 }, alex, {}, 'primary'), 0);
});

test('once marked paid, the frozen fee is what was sent, plus any referral bonus on the primary only', () => {
  const session = { course: 'Safe Sitter®', instrPayOverride: 200 };
  const jdi = { payStatus: 'paid', paidFee: 180, secondInstrPaid: true, secondInstrPaidFee: 160, referralBonus: 25 };
  assert.equal(sandbox.wrapupPayAmount(session, alex, jdi, 'primary'), 205);
  assert.equal(sandbox.wrapupPayAmount(session, jordan, jdi, 'second'), 160);
});

test('an unpaid primary adds the referral bonus on top of the live fee', () => {
  const session = { course: 'Safe Sitter®', instrPayOverride: 150 };
  assert.equal(sandbox.wrapupPayAmount(session, alex, { referralBonus: 25 }, 'primary'), 175);
  assert.equal(sandbox.wrapupPayAmount(session, jordan, { referralBonus: 25 }, 'second'), 150);
});

test('the wrap-up callout tells Lindsay the amount, or that pay is not set', () => {
  const due = sandbox.wrapupPayCallout(alex, 175, { paid: false, bonus: 0 });
  assert.match(due, /Send \$175 to Alex Rivera/);
  assert.match(due, /Zelle: alex@example\.com/);
  assert.match(due, /pay-send-due/);
  assert.doesNotMatch(due, /\$0/);

  const withBonus = sandbox.wrapupPayCallout(alex, 200, { paid: false, bonus: 25 });
  assert.match(withBonus, /Send \$200 to Alex Rivera/);
  assert.match(withBonus, /includes \$25 referral bonus/);

  const paid = sandbox.wrapupPayCallout(jordan, 160.5, { paid: true, payDate: '2026-10-01' });
  assert.match(paid, /Sent \$160\.50 to Jordan Lee/);
  assert.match(paid, /Marked paid on 2026-10-01/);
  assert.match(paid, /pay-send-paid/);

  const missing = sandbox.wrapupPayCallout(alex, null, {});
  assert.match(missing, /Pay isn't set yet for Alex Rivera/);
  assert.match(missing, /not \$0 owed/);
  assert.match(missing, /pay-send-missing/);
  assert.doesNotMatch(missing, /Send \$/);
});

test('instructor names in the amount line are escaped', () => {
  const html = sandbox.wrapupPayCallout({ name: 'A & B <script>', zelle: 'a&b@x.com' }, 90, {});
  assert.match(html, /Send \$90 to A &amp; B &lt;script&gt;/);
  assert.match(html, /Zelle: a&amp;b@x\.com/);
  assert.doesNotMatch(html, /<script>/);
});

test('wrap-up pay rows use the callout and still mark paid the same way', () => {
  assert.match(admin, /wrapupPayCallout\(inst,amount,/);
  assert.match(admin, /toggleInstrPaidFromWrap\('\$\{sessId\}',this\.checked\)/);
  assert.match(admin, /toggleSecondInstrPaidFromWrap\('\$\{sessId\}',this\.checked\)/);
  assert.match(admin, /You taught this session — no payment needed/);
  assert.doesNotMatch(admin, /Click to mark paid via Zelle/);
});
