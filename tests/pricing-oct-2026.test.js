// Classes page prices (Oct 2026) apply only to sessions created from
// midnight ET on Oct 9 2026. Anything created earlier keeps its old price.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const configSrc = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');

function loadConfig() {
  const ctx = vm.createContext({});
  vm.runInContext(configSrc + '\nthis.getSessionBasePrice=getSessionBasePrice;this.LATER_PRICE_CHANGES=LATER_PRICE_CHANGES;', ctx);
  return ctx;
}

const CUTOVER = Date.parse('2026-10-09T04:00:00Z');
const BEFORE = CUTOVER - 1;
const NEWEST_EXISTING_SESSION = 1791470081950; // newest sessions.created_at on Oct 8 2026

const CHANGES = {
  'Social Ready': [35, 45],
  'Stay Ready: Choking Rescue and CPR': [75, 85],
  'Grandparents: Getting Started': [185, 195],
  'Care Ready': [185, 195],
  'Baby Ready': [225, 195]
};

test('new classes page prices start only for sessions created on/after Oct 9 2026 midnight ET', () => {
  const cfg = loadConfig();
  assert.ok(NEWEST_EXISTING_SESSION < CUTOVER);
  for (const [course, [oldPrice, newPrice]] of Object.entries(CHANGES)) {
    for (const date of ['2026-11-15', '2027-03-01']) {
      assert.equal(cfg.getSessionBasePrice(course, date, BEFORE), oldPrice, course + ' before');
      assert.equal(cfg.getSessionBasePrice(course, date, NEWEST_EXISTING_SESSION), oldPrice, course + ' newest existing');
      assert.equal(cfg.getSessionBasePrice(course, date, CUTOVER), newPrice, course + ' after');
    }
  }
});

test('courses whose price did not change keep the same price after the cutover', () => {
  const cfg = loadConfig();
  const unchanged = {
    'Safe Sitter®': 225, 'Safe@Home': 85, 'Intro to Babysitting': 40,
    'Steady and Ready': 65, 'My First Babysitters Club — Single Session': 95,
    'Ready. Period.': 75, 'All Kids Welcome': 25,
    'Campus Ready: Safety Skills for College Life': 75,
    'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes': 25
  };
  for (const [course, price] of Object.entries(unchanged)) {
    assert.equal(cfg.getSessionBasePrice(course, '2026-12-01', BEFORE), price, course);
    assert.equal(cfg.getSessionBasePrice(course, '2026-12-01', CUTOVER), price, course);
  }
});

test('admin.html and register.html carry the same Oct 2026 price entry as config.js', () => {
  const block = /\{from:'2026-10-09T04:00:00Z'[\s\S]*?\}\},/;
  const norm = (s) => s.match(block)[0].replace(/\s+/g, '');
  const want = norm(configSrc);
  assert.equal(norm(admin), want);
  assert.equal(norm(register), want);
});
