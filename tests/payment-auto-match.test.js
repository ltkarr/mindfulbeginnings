'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');
const assert = require('node:assert/strict');
const { sessionListPrice, catalogFromMigration } = require('../lib/session-list-price');

const root = path.join(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'migrations/20261026_payment_auto_match.sql'), 'utf8');
const docs = fs.readFileSync(path.join(root, 'docs/PAYMENT-AUTO-MATCH.md'), 'utf8');
const gs = fs.readFileSync(path.join(root, 'scripts/payment-inbox-sync.gs'), 'utf8');
const configSrc = fs.readFileSync(path.join(root, 'config.js'), 'utf8');

function loadConfig() {
  const ctx = {};
  vm.runInContext(
    configSrc + '\nthis.COURSES=COURSES; this.getSessionBasePrice=getSessionBasePrice; this.COURSE_NAME_ALIASES=COURSE_NAME_ALIASES;',
    vm.createContext(ctx)
  );
  return ctx;
}

test('catalog prices in the migration match config.js and do not rewrite session prices', () => {
  const cfg = loadConfig();
  const catalog = catalogFromMigration(sql);
  const created = [
    null,
    Date.parse('2026-08-01T00:00:00Z'),
    Date.parse('2026-08-06T21:00:00Z') - 1,
    Date.parse('2026-08-06T21:00:00Z'),
    Date.parse('2026-08-12T04:00:00Z') - 1,
    Date.parse('2026-08-12T04:00:00Z'),
    Date.parse('2026-08-27T04:00:00Z') - 1,
    Date.parse('2026-08-27T04:00:00Z'),
    Date.parse('2026-10-09T04:00:00Z') - 1,
    Date.parse('2026-10-09T04:00:00Z'),
    Date.parse('2026-10-14T04:00:00Z') - 1,
    Date.parse('2026-10-14T04:00:00Z'),
    Date.parse('2026-10-19T04:00:00Z') - 1,
    Date.parse('2026-10-19T04:00:00Z'),
    Date.parse('2026-10-22T04:00:00Z') - 1,
    Date.parse('2026-10-22T04:00:00Z'),
    Date.parse('2026-10-26T12:00:00Z')
  ];
  const names = Object.keys(cfg.COURSES).concat(Object.keys(cfg.COURSE_NAME_ALIASES));
  names.forEach((course) => {
    created.forEach((at) => {
      ['2026-11-02', '2027-03-04'].forEach((date) => {
        const expected = cfg.getSessionBasePrice(course, date, at);
        const actual = sessionListPrice(catalog, course, date, at);
        if (expected == null) {
          assert.equal(actual, null, course + ' ' + date + ' ' + at);
        } else {
          assert.equal(actual, expected, course + ' ' + date + ' ' + at + ' expected ' + expected + ' got ' + actual);
        }
      });
    });
  });

  const code = sql.replace(/--.*$/gm, '');
  assert.doesNotMatch(code, /update\s+(public\.)?sessions\b/i);
  assert.doesNotMatch(code, /price_paid\s*=/);
  assert.doesNotMatch(code, /price_override\s*=/);
  assert.doesNotMatch(code, /do update set prices/i);
  assert.match(sql, /security definer/);
  assert.match(sql, /grant execute on function public\.ingest_payment_notification/);
  assert.doesNotMatch(sql, /to anon, authenticated/);
  assert.match(sql, /payment_ingest_secret/);
  assert.match(sql, /length\(v_secret\) < 20/);
});

test('user-facing auto-match copy has no em dashes', () => {
  assert.equal(docs.includes('\u2014'), false);
  assert.equal(gs.includes('\u2014'), false);
  const outside = sql
    .replace(/-- PRICE_CATALOG_START[\s\S]*?-- PRICE_CATALOG_END/, '')
    .split('\n')
    .filter((line) => !line.includes('awaiting payment'))
    .join('\n');
  assert.equal(outside.includes('\u2014'), false);
  assert.match(docs, /run `migrations\/20261026_payment_auto_match\.sql`/);
  assert.match(docs, /INGEST_SECRET/);
  assert.match(docs, /install/);
});
