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
  'sessionEndDate', 'fmtYMD', 'sessionEndMinutes', 'newYorkClock', 'sessionEndTimeText', 'sessionIsComplete',
  'sessionBillingMonth', 'sessionListedMonths', 'sessionReadyMonths', 'sessionInvoiceRangeLabel', 'invoiceLineIncluded',
  'invoicedSessionIds', 'orgSessionsForMonth', 'uninvoicedOrgGroups',
  'billToOrgName', 'sessionNeedsBillToOrg', 'suggestedBillToOrg', 'missingBillToWhy', 'orgBillingGaps',
  'formLocationName', 'formPartnerName', 'formNeedsBillToOrg', 'syncBillToRequirement', 'resolveBillToOrg'
];

const sandbox = {
  sessions: [],
  invoices: [],
  orgPartners: [],
  invoiceLineFor: (s) => ({ sessionId: s.id, amount: s.amount == null ? 150 : s.amount }),
  orgBillDismissed: () => sandbox.dismissed.slice(),
  dismissed: [],
  toggleOrgHeadcount() { sandbox.headcountCalls += 1; },
  headcountCalls: 0,
  lastAlert: '',
  alert(msg) { sandbox.lastAlert = String(msg); },
  nodes: {},
  document: {
    getElementById(id) { return sandbox.nodes[id] || null; }
  },
  Date, Intl, String, Number, Math, Array, Object, isNaN
};
vm.createContext(sandbox);
vm.runInContext('var _billToAutofill="";\n' + names.map((n) => extractFunction(admin, n)).join('\n'), sandbox);

function node(fields) {
  return Object.assign({ value: '', checked: false, textContent: '', style: { display: '' }, options: [], selectedIndex: 0 }, fields);
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

function labSeries(overrides) {
  return Object.assign({
    id: 'lab',
    course: 'Lab School 8-week series',
    date: '2026-09-08',
    time: '4:00-5:00 PM',
    extraDates: ['2026-09-15', '2026-09-22', '2026-09-29', '2026-10-06', '2026-10-13', '2026-10-20', '2026-11-03'],
    billToOrg: 'Lab School',
    location: 'Lab School',
    isHold: false,
    isCancelled: false,
    isCustomJob: true,
    orgHandlesRegistration: true,
    priceOverride: 780,
    amount: 780
  }, overrides);
}

const BEFORE_LAST = new Date('2026-11-03T21:59:00Z');
const AT_LAST = new Date('2026-11-03T22:00:00Z');

test('an 8-week series is complete on its last date and keeps a single invoice total', () => {
  const series = labSeries();
  assert.equal(sandbox.sessionEndDate(series), '2026-11-03');
  assert.equal(sandbox.sessionEndMinutes('4:00-5:00 PM'), 17 * 60);
  assert.equal(sandbox.sessionIsComplete(series, new Date('2026-09-09T16:00:00Z')), false);
  assert.equal(sandbox.sessionIsComplete(series, BEFORE_LAST), false);
  assert.equal(sandbox.sessionIsComplete(series, AT_LAST), true);
  assert.equal(sandbox.sessionBillingMonth(series), '2026-11');
  assert.deepEqual(plain(sandbox.sessionListedMonths(series)), ['2026-09', '2026-10', '2026-11']);
  assert.deepEqual(plain(sandbox.sessionReadyMonths(series)), ['2026-09', '2026-11']);
  assert.match(sandbox.sessionInvoiceRangeLabel(series), /Sep 8/);
  assert.match(sandbox.sessionInvoiceRangeLabel(series), /Nov 3, 2026/);

  sandbox.sessions = [series];
  sandbox.invoices = [];
  assert.deepEqual(plain(sandbox.uninvoicedOrgGroups(new Date('2026-10-01T16:00:00Z'))), []);

  const groups = sandbox.uninvoicedOrgGroups(AT_LAST);
  const byMonth = Object.fromEntries(plain(groups).map((g) => [g.ym, g]));
  assert.deepEqual(Object.keys(byMonth).sort(), ['2026-09', '2026-11']);
  assert.equal(byMonth['2026-09'].total, 0);
  assert.equal(byMonth['2026-11'].total, 780);
  assert.deepEqual(byMonth['2026-09'].sessions.map((s) => s.id), ['lab']);
  assert.deepEqual(byMonth['2026-11'].sessions.map((s) => s.id), ['lab']);
  assert.equal(groups.reduce((n, g) => n + g.total, 0), 780);

  assert.deepEqual(plain(sandbox.orgSessionsForMonth('Lab School', '2026-10')).map((s) => s.id), ['lab']);
  assert.deepEqual(plain(sandbox.orgSessionsForMonth('Lab School', '2026-08')), []);
  assert.deepEqual(plain(sandbox.orgSessionsForMonth('Other', '2026-11')), []);

  assert.equal(sandbox.invoiceLineIncluded(series, '2026-11', true, false), true);
  assert.equal(sandbox.invoiceLineIncluded(series, '2026-09', true, false), false);
  assert.equal(sandbox.invoiceLineIncluded(series, '2026-10', true, false), false);
  assert.equal(sandbox.invoiceLineIncluded(series, '2026-11', true, true), false);
  assert.equal(sandbox.invoiceLineIncluded(series, '2026-11', false, false), false);

  sandbox.invoices = [{ lineItems: [{ sessionId: 'lab' }] }];
  assert.deepEqual(plain(sandbox.uninvoicedOrgGroups(AT_LAST)), []);
});

test('a recurring series with only a last meeting date uses that end month', () => {
  const series = labSeries({
    extraDates: [],
    isRecurring: true,
    recurEndDate: '2026-11-03'
  });
  assert.equal(sandbox.sessionEndDate(series), '2026-11-03');
  assert.deepEqual(plain(sandbox.sessionReadyMonths(series)), ['2026-09', '2026-11']);
  assert.equal(sandbox.sessionIsComplete(series, AT_LAST), true);
});

test('Bill to organization is required for organization registration or a custom-job fee, and prefills from the location', () => {
  assert.equal(sandbox.sessionNeedsBillToOrg({ orgHandlesRegistration: true }), true);
  assert.equal(sandbox.sessionNeedsBillToOrg({ isCustomJob: true, priceOverride: 780 }), true);
  assert.equal(sandbox.sessionNeedsBillToOrg({ isCustomJob: true, priceOverride: 0 }), false);
  assert.equal(sandbox.sessionNeedsBillToOrg({ isCustomJob: true, priceOverride: null }), false);
  assert.equal(sandbox.sessionNeedsBillToOrg({ isCustomJob: false, priceOverride: 150 }), false);
  assert.equal(sandbox.sessionNeedsBillToOrg({ orgHandlesRegistration: true, isCancelled: true }), false);

  assert.equal(sandbox.suggestedBillToOrg({ billToOrg: 'Beth El', location: 'Lab School' }), 'Beth El');
  assert.equal(sandbox.suggestedBillToOrg({ billToOrg: '  ', location: 'Lab School' }), 'Lab School');
  assert.equal(sandbox.suggestedBillToOrg({ location: 'Host home' }), '');
  assert.equal(sandbox.suggestedBillToOrg({ location: 'Virtual' }), '');
  sandbox.orgPartners = [{ id: 'p1', name: 'Lab School' }];
  assert.equal(sandbox.suggestedBillToOrg({ location: '', hostedFor: 'p1' }), 'Lab School');

  const future = {
    id: 'future', course: 'Lab School series', date: '2026-12-01', time: '4:00-5:00 PM',
    orgHandlesRegistration: true, billToOrg: '', isCustomJob: false, isCancelled: false, location: 'Lab School'
  };
  const fee = {
    id: 'fee', course: 'Booth', date: '2026-12-15', isCustomJob: true, priceOverride: 500,
    billToOrg: ' ', isCancelled: false
  };
  const familyPrice = {
    id: 'family', course: 'Safe Sitter®', date: '2026-12-01', isCustomJob: false,
    priceOverride: 150, orgHandlesRegistration: false, billToOrg: '', isCancelled: false
  };
  const freeJob = {
    id: 'free', course: 'Welcome table', date: '2026-12-01', isCustomJob: true,
    priceOverride: 0, billToOrg: '', isCancelled: false
  };
  const named = {
    id: 'named', course: 'Already named', date: '2026-12-01', isCustomJob: true,
    priceOverride: 200, billToOrg: 'Lab School', isCancelled: false, amount: 200
  };
  const zeroLater = {
    id: 'zero', course: 'No fee', date: '2026-10-01', isCustomJob: true,
    priceOverride: 0, billToOrg: 'Lab School', isCancelled: false, amount: 0
  };
  sandbox.sessions = [future, fee, familyPrice, freeJob, named, zeroLater];
  sandbox.invoices = [];
  sandbox.dismissed = [];
  const gaps = sandbox.orgBillingGaps(AT_LAST);
  const ids = plain(gaps).map((g) => g.s.id);
  assert.deepEqual(ids, ['fee', 'future', 'zero']);
  assert.match(gaps.find((g) => g.s.id === 'future').why, /Organization registration is on/);
  assert.match(gaps.find((g) => g.s.id === 'future').why, /Name it now/);
  assert.match(gaps.find((g) => g.s.id === 'fee').why, /organization fee/);
  assert.match(gaps.find((g) => g.s.id === 'fee').why, /Name it now/);
  assert.match(gaps.find((g) => g.s.id === 'zero').why, /\$0/);
  assert.equal(gaps[0].fix, 'Bill to organization');

  sandbox.dismissed = ['future'];
  assert.deepEqual(plain(sandbox.orgBillingGaps(AT_LAST)).map((g) => g.s.id), ['fee', 'zero']);
});

test('the session form prefills and blocks a blank organization name', () => {
  sandbox.nodes = {
    'm-org-reg': node({ checked: true }),
    'm-loc': node({ value: 'Lab School' }),
    'm-billorg': node({ value: '' }),
    'billto-req-label': node({ textContent: '' }),
    'billto-required-note': node({ style: { display: 'none' } })
  };
  sandbox.headcountCalls = 0;
  sandbox.syncBillToRequirement();
  assert.equal(sandbox.nodes['m-billorg'].value, 'Lab School');
  assert.match(sandbox.nodes['billto-req-label'].textContent, /required/i);
  assert.equal(sandbox.nodes['billto-required-note'].style.display, 'block');
  assert.equal(sandbox.headcountCalls, 1);

  sandbox.nodes['m-loc'].value = 'Other Place';
  sandbox.syncBillToRequirement();
  assert.equal(sandbox.nodes['m-billorg'].value, 'Other Place');

  sandbox.nodes['m-billorg'].value = 'Beth El';
  sandbox.nodes['m-loc'].value = 'Lab School';
  sandbox.syncBillToRequirement();
  assert.equal(sandbox.nodes['m-billorg'].value, 'Beth El');

  sandbox.nodes = {
    'cj-orgfee': node({ value: '400' }),
    'cj-loc': node({ value: 'Lab School' }),
    'cj-billorg': node({ value: '' }),
    'cj-billto-req-label': node({ textContent: '' })
  };
  sandbox.syncBillToRequirement();
  assert.equal(sandbox.nodes['cj-billorg'].value, 'Lab School');
  assert.match(sandbox.nodes['cj-billto-req-label'].textContent, /required/i);

  sandbox.nodes['cj-orgfee'].value = '0';
  sandbox.nodes['cj-billorg'].value = '';
  sandbox.syncBillToRequirement();
  assert.equal(sandbox.nodes['cj-billorg'].value, '');
  assert.match(sandbox.nodes['cj-billto-req-label'].textContent, /optional/i);

  sandbox.lastAlert = '';
  sandbox.nodes = {
    'm-org-reg': node({ checked: true }),
    'm-loc': node({ value: 'Host home' }),
    'm-billorg': node({ value: '   ' })
  };
  assert.equal(sandbox.resolveBillToOrg('m-billorg'), null);
  assert.match(sandbox.lastAlert, /required/i);

  sandbox.nodes['m-loc'].value = 'Lab School';
  sandbox.nodes['m-billorg'].value = '';
  assert.equal(sandbox.resolveBillToOrg('m-billorg'), 'Lab School');

  sandbox.nodes['m-org-reg'].checked = false;
  sandbox.nodes['m-billorg'].value = '';
  assert.equal(sandbox.resolveBillToOrg('m-billorg'), '');
  assert.equal(sandbox.formNeedsBillToOrg(), false);
});

test('save paths require the organization name, and invoices are not rewritten', () => {
  function body(name) {
    return extractFunction(admin, name);
  }
  for (const name of ['saveSession', 'saveCustomJob', 'saveEditCustomJob']) {
    const src = body(name);
    assert.ok(src.indexOf('resolveBillToOrg(') >= 0, name);
    assert.ok(src.indexOf('resolveBillToOrg(') < src.indexOf('upsertSessionRow'), name);
  }
  assert.match(body('toggleOrgRegistration'), /syncBillToRequirement\(\)/);
  assert.match(body('orgBillingFieldsHtml'), /id="billto-req-label"/);
  assert.match(admin, /id="cj-orgfee"[^>]*oninput="syncBillToRequirement\(\)"/);
  assert.match(body('renderInvoices'), /orgBillingGapBannerHtml\(\)/);
  assert.match(body('renderInvoices'), /invoiceGroupBlurb/);
  assert.match(body('rebuildInvoiceLines'), /invoiceLineIncluded/);
  assert.match(body('rebuildInvoiceLines'), /li\.range/);
  assert.match(body('saveInvoice'), /already on an invoice/);
  assert.match(body('openInvoiceDoc'), /li\.range\?escapeHtml\(li\.range\)/);
  assert.doesNotMatch(admin, /update\([^)]*bill_to_org/i);
  assert.equal(fs.readdirSync(path.join(__dirname, '..', 'migrations')).some((f) => /bill_to/.test(f)), false);
});
