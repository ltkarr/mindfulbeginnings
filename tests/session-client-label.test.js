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
  'extraDaysFromDB', 'closuresFromDB', 'sessionFromDB',
  'sessionOrgName', 'sessionIsOrgBooking', 'sessionBookingKind',
  'sessionClientName', 'liaisonClientLabel'
];

const sandbox = {
  orgPartners: [{ id: 'org-beth', name: 'Temple Beth El', contactName: 'Alex Chen' }],
  String, Array
};
vm.createContext(sandbox);
vm.runInContext(names.map((n) => extractFunction(admin, n)).join('\n'), sandbox);

const writersCenter = {
  id: 'ss-1103',
  code: 'SS-1103',
  course: 'Safe Sitter®',
  date: '2026-11-03',
  location: "The Writer's Center",
  contactName: 'Amy Freeman',
  hasHost: false,
  isPrivate: false,
  orgHandlesRegistration: false,
  isCustomJob: false,
  billToOrg: '',
  hostedFor: null
};

test('a public venue class reads Public Course, not the rental contact', () => {
  assert.equal(sandbox.sessionBookingKind(writersCenter), 'public');
  assert.equal(sandbox.sessionClientName(writersCenter), 'Public Course');
  assert.equal(sandbox.liaisonClientLabel(writersCenter, '', 'plain'), 'Public Course');
  assert.equal(sandbox.liaisonClientLabel(writersCenter, '', 'pending'), 'Public Course');
  assert.equal(sandbox.liaisonClientLabel(writersCenter, '', 'statement'), 'Public Course');
  assert.equal(sandbox.liaisonClientLabel(writersCenter, 'Amy Freeman', 'plain'), 'Public Course');
});

test('a private-host class keeps the host name', () => {
  const host = {
    code: 'SS-HOME',
    contactName: 'Dana Rivera',
    hasHost: true,
    isPrivate: true,
    location: 'Host home'
  };
  assert.equal(sandbox.sessionBookingKind(host), 'host');
  assert.equal(sandbox.liaisonClientLabel(host, '', 'plain'), 'Dana Rivera');
  assert.equal(sandbox.liaisonClientLabel(host, '', 'pending'), 'Dana Rivera');
  assert.equal(sandbox.liaisonClientLabel(host, '', 'statement'), 'Private home class — Dana Rivera');

  const unnamed = Object.assign({}, host, { contactName: '  ' });
  assert.equal(sandbox.liaisonClientLabel(unnamed, '', 'plain'), 'Private home class');
  assert.equal(sandbox.liaisonClientLabel(unnamed, '', 'pending'), '—');
  assert.equal(sandbox.liaisonClientLabel(unnamed, '', 'statement'), 'Private home class');
});

test('an organization class keeps the organization, not the site contact', () => {
  const beth = {
    code: 'SS-BETH',
    contactName: 'Amy Freeman',
    hasHost: false,
    isPrivate: true,
    orgHandlesRegistration: true,
    billToOrg: 'Temple Beth El',
    location: 'Temple Beth El'
  };
  assert.equal(sandbox.sessionBookingKind(beth), 'org');
  assert.equal(sandbox.sessionClientName(beth), 'Temple Beth El');
  assert.equal(sandbox.liaisonClientLabel(beth, 'Temple Beth El', 'plain'), 'Temple Beth El');
  assert.equal(sandbox.liaisonClientLabel(beth, 'Temple Beth El', 'statement'), 'Temple Beth El');

  const partnership = {
    code: 'SS-PART',
    contactName: 'Amy Freeman',
    hasHost: false,
    hostedFor: 'org-beth',
    billToOrg: '',
    location: "The Writer's Center"
  };
  assert.equal(sandbox.sessionClientName(partnership), 'Temple Beth El');
  assert.equal(sandbox.liaisonClientLabel(partnership, '', 'pending'), 'Temple Beth El');

  const custom = {
    code: 'CJ-1',
    isCustomJob: true,
    hasHost: false,
    contactName: 'Dana Rivera',
    location: 'Girl Scouts of Nation\'s Capital',
    billToOrg: ''
  };
  assert.equal(sandbox.sessionClientName(custom), 'Girl Scouts of Nation\'s Capital');
});

test('a private booking that is not a public course still shows its contact', () => {
  const individual = {
    code: 'GSFA-270303',
    course: 'Girl Scout Badge Class',
    contactName: 'Mary Polacek',
    hasHost: false,
    isPrivate: true,
    orgHandlesRegistration: false,
    billToOrg: '',
    isCustomJob: false
  };
  assert.equal(sandbox.sessionBookingKind(individual), 'host');
  assert.equal(sandbox.liaisonClientLabel(individual, '', 'plain'), 'Mary Polacek');
});

test('session rows from the database keep is_private and has_host for the client label', () => {
  const row = sandbox.sessionFromDB({
    id: '1',
    code: 'SS-1103',
    course: 'Safe Sitter®',
    date: '2026-11-03',
    location: "The Writer's Center",
    contact_name: 'Amy Freeman',
    has_host: false,
    is_private: false,
    org_handles_registration: false,
    is_custom_job: false,
    bill_to_org: '',
    extra_dates: [],
    extra_days: [],
    closures: []
  });
  assert.equal(row.hasHost, false);
  assert.equal(row.isPrivate, false);
  assert.equal(sandbox.sessionClientName(row), 'Public Course');

  const troop = sandbox.sessionFromDB({
    id: '2',
    code: 'GS-H4782',
    contact_name: 'Mary Polacek',
    has_host: true,
    is_private: true,
    bill_to_org: 'Girl Scout Troop 34182',
    extra_dates: [],
    extra_days: [],
    closures: []
  });
  assert.equal(sandbox.sessionClientName(troop), 'Girl Scout Troop 34182');
});

test('Client columns in liaison and finance views use the shared label', () => {
  assert.match(admin, /<th>Expected<\/th><th>Session<\/th><th>Date<\/th><th>Client<\/th>/);
  assert.match(admin, /liaisonClientLabel\(x\.session,x\.org,'pending'\)/);
  assert.match(admin, /liaisonClientLabel\(r\.session,r\.org,'plain'\)/);
  assert.match(admin, /liaisonClientLabel\(r\.session,r\.org,'statement'\)/);
  assert.match(admin, /client:sessionClientName\(s\)\|\|p\.name/);
  assert.doesNotMatch(admin, /x\.org\|\|x\.session\.contactName/);
  assert.doesNotMatch(admin, /r\.session\.contactName\|\|'Private home class'/);
});
