'use strict';

// Grant tracking: sessions tagged with a grant draw their Finances cost
// (instructor pay + linked/on-session expenses) down against the award, and
// the funder's standalone invoices show as invoiced/received — never as
// class revenue.

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

function extractConst(src, name) {
  const start = src.indexOf('const ' + name + '=');
  if (start < 0) throw new Error('missing const ' + name);
  const end = src.indexOf('];', start);
  if (end < 0) throw new Error('unclosed const ' + name);
  return src.slice(start, end + 2);
}

const names = ['grantByTag', 'grantSummary'];

function makeSandbox({ sessionList, invoiceList, finById }) {
  const sandbox = {
    sessions: sessionList,
    invoices: invoiceList,
    round2: (n) => Math.round(Number(n) * 100) / 100,
    calcFin: (s) => finById[s.id],
  };
  vm.createContext(sandbox);
  vm.runInContext(
    extractConst(admin, 'GRANTS') + '\n' + names.map((n) => extractFunction(admin, n)).join('\n'),
    sandbox
  );
  return sandbox;
}

const GRANT = { tag: 'dd-council-2027' };

test('the DD Council grant is registered at $3,000', () => {
  const sb = makeSandbox({ sessionList: [], invoiceList: [], finById: {} });
  const g = sb.grantByTag('dd-council-2027');
  assert.equal(g.award, 3000);
  assert.match(g.funder, /Developmental Disabilities Council/);
  assert.equal(sb.grantByTag('nope'), null);
});

test('tagged sessions spend against the award; untagged and cancelled do not', () => {
  const sb = makeSandbox({
    sessionList: [
      { id: 'a', course: 'Family Safety', date: '2027-01-23', grantTag: 'dd-council-2027' },
      { id: 'b', course: 'Family Safety', date: '2027-02-16', grantTag: 'dd-council-2027' },
      { id: 'c', course: 'Safe Sitter®', date: '2027-01-10', grantTag: '' },
      { id: 'd', course: 'Family Safety', date: '2027-03-13', grantTag: 'dd-council-2027', isCancelled: true },
    ],
    invoiceList: [],
    finById: {
      a: { totalCost: 262.5, instrFee: 187.5, extraCosts: 75 },
      b: { totalCost: 187.5, instrFee: 187.5, extraCosts: 0 },
      c: { totalCost: 400, instrFee: 400, extraCosts: 0 },
      d: { totalCost: 999, instrFee: 999, extraCosts: 0 },
    },
  });
  const sum = sb.grantSummary(sb.grantByTag(GRANT.tag));
  assert.equal(sum.rows.length, 2);
  assert.equal(sum.spent, 450);
  assert.equal(sum.remaining, 2550);
  assert.equal(sum.rows[0].date, '2027-01-23');
  assert.equal(sum.rows[0].instrFee, 187.5);
  assert.equal(sum.rows[0].extraCosts, 75);
});

test('funder invoices count as invoiced, paid ones as received', () => {
  const sb = makeSandbox({
    sessionList: [],
    invoiceList: [
      { orgName: 'Maryland Developmental Disabilities Council', total: 1000, status: 'paid' },
      { orgName: 'Maryland Developmental Disabilities Council', total: 1000, status: 'sent' },
      { orgName: 'Congregation Beth El', total: 1434, status: 'paid' },
    ],
    finById: {},
  });
  const sum = sb.grantSummary(sb.grantByTag(GRANT.tag));
  assert.equal(sum.invoiced, 2000);
  assert.equal(sum.received, 1000);
  assert.equal(sum.spent, 0);
  assert.equal(sum.remaining, 3000);
});

test('the grant tag round-trips through the session DB mapping', () => {
  assert.match(admin, /grantTag:r\.grant_tag\|\|''/);
  assert.match(admin, /o\.grant_tag=s\.grantTag\?String\(s\.grantTag\):null/);
});

test('admin session rows and instructor job posts show the grant tag', () => {
  assert.match(admin, /MD DD Council grant/);
  assert.match(admin, /grantPill/);
  const instructor = fs.readFileSync(path.join(__dirname, '..', 'instructor.html'), 'utf8');
  assert.match(instructor, /grantTag:r\.grant_tag\|\|''/);
  assert.match(instructor, /Grant-funded: Maryland Developmental Disabilities Council/);
  assert.match(instructor, /grantJobHtml\(s\)/);
  const sql = fs.readFileSync(path.join(__dirname, '..', 'migrations/20261103_instructor_grant_tag.sql'), 'utf8');
  assert.match(sql, /grant_tag/);
  assert.doesNotMatch(sql, /admin_private_notes/);
});

test('the Finances screen has a grants mount point and renders it', () => {
  assert.match(admin, /<div id="fin-grants"><\/div>/);
  assert.match(admin, /renderGrantFunds\(\)/);
});
