'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const facing = require('../js/instructor-facing');
const requests = require('../js/class-requests');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'migrations/20261106_instructor_directions.sql'), 'utf8');
const publicList = fs.readFileSync(path.join(root, 'migrations/20261103_public_listing_spanish.sql'), 'utf8');

const PRIVATE_NOTE = 'SYN-PRIVATE-NOTE-7f3a';
const CLIENT_RATE = 'SYN-CLIENT-RATE-165';
const PARKING = 'SYN-PARK-VISITOR-LOT';
const OWN_PAY = 'SYN-INSTR-HOURLY-PAY';
const JOB_NOTE = 'SYN-JOB-NOTE-9c2e';
const REG_NOTE = 'SYN-REG-PAY-NOTE-4b1d';

function sqlBody(src) {
  return src.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
}

function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  throw new Error('unclosed function ' + name);
}

function between(src, startMark, endMark) {
  const start = src.indexOf(startMark);
  assert.ok(start >= 0, startMark);
  const end = src.indexOf(endMark, start + startMark.length);
  assert.ok(end > start, endMark);
  return src.slice(start, end);
}

function selectList(fnName) {
  const body = sqlBody(sql);
  const start = body.indexOf('function public.' + fnName);
  assert.ok(start >= 0, fnName);
  const next = body.indexOf('function public.', start + 10);
  return body.slice(start, next === -1 ? body.length : next);
}

function loadInstructorMapper() {
  const sandbox = { MBInstructorFacing: facing };
  vm.runInNewContext(
    [
      extractFn(instructor, 'extraDaysFromDB'),
      extractFn(instructor, 'closuresFromDB'),
      extractFn(instructor, 'sessionFromDB'),
      extractFn(instructor, 'instructorDirectionsText'),
      extractFn(instructor, 'escapeHtml'),
      extractFn(instructor, 'notesHTML'),
      extractFn(instructor, 'partnerNameOf')
    ].join('\n'),
    sandbox
  );
  return sandbox;
}

test('directions text is only the dedicated column', () => {
  const shown = facing.directionsText({
    notes: PRIVATE_NOTE + ' ' + CLIENT_RATE,
    admin_private_notes: PRIVATE_NOTE,
    instructor_directions: 'Parking: ' + PARKING,
    instructor_info: OWN_PAY
  });
  assert.match(shown, new RegExp(PARKING));
  assert.doesNotMatch(shown, new RegExp(OWN_PAY));
  assert.doesNotMatch(shown, new RegExp(PRIVATE_NOTE));
  assert.doesNotMatch(shown, new RegExp(CLIENT_RATE));
});

test('the instructor mapper ignores generic notes and client financial columns', () => {
  const { sessionFromDB, notesHTML, instructorDirectionsText, partnerNameOf } = loadInstructorMapper();
  const session = sessionFromDB({
    id: 's-synthetic',
    code: 'SS-SYN',
    course: 'Safe Sitter®',
    date: '2026-11-20',
    time: '1:00-4:00 PM',
    location: 'Troop meeting',
    city: 'Bethesda',
    state: 'MD',
    host_address: '100 Example Ave',
    host_phone: '555-0100',
    wifi_info: 'network secret',
    contact_day: 'Alex 555-0199',
    contact_name: 'Alex Example',
    zoom_link: 'https://zoom.example/secret',
    notes: 'Parking: ' + PARKING + '\n' + CLIENT_RATE + '\n' + PRIVATE_NOTE,
    admin_private_notes: PRIVATE_NOTE,
    instructor_directions: 'Parking: ' + PARKING,
    instructor_info: OWN_PAY,
    price_override: 0,
    org_portion: 165,
    bill_to_org: 'Troop synthetic',
    billed_headcount: 12,
    hold_payment: CLIENT_RATE,
    additional_costs: [{ label: CLIENT_RATE, amount: 40 }],
    fee_received: false,
    origination_note: CLIENT_RATE,
    grant_tag: 'dd-council-2027',
    instr_pay_override: 150,
    teaching_hours: 4,
    paid_travel_hours: 1
  });
  const packed = JSON.stringify(session);
  assert.equal(session.instructorDirections, 'Parking: ' + PARKING);
  assert.equal(session.instructorInfo, '');
  assert.equal(session.hostAddress, '100 Example Ave');
  assert.equal(session.notes, '');
  assert.equal(session.hostPhone, '');
  assert.equal(session.wifiInfo, '');
  assert.equal(session.contactDay, '');
  assert.equal(session.contactName, '');
  assert.equal(session.zoomLink, '');
  assert.equal(session.instrPayOverride, 150);
  assert.equal(session.teachingHours, 4);
  assert.equal(session.paidTravelHours, 1);
  assert.equal(session.grantTag, undefined);
  assert.equal(session.priceOverride, undefined);
  assert.equal(session.orgPortion, undefined);
  assert.equal(session.adminPrivateNotes, undefined);
  [PRIVATE_NOTE, CLIENT_RATE, '555-0100', 'network secret', 'dd-council-2027'].forEach(marker => {
    assert.equal(packed.includes(marker), false, marker);
  });
  const card = notesHTML(session);
  assert.match(card, /Directions/);
  assert.match(card, new RegExp(PARKING));
  assert.doesNotMatch(card, new RegExp(OWN_PAY));
  assert.doesNotMatch(card, new RegExp(PRIVATE_NOTE));
  assert.doesNotMatch(card, new RegExp(CLIENT_RATE));
  assert.equal(instructorDirectionsText(session).includes(PARKING), true);
  assert.equal(partnerNameOf({ notes: REG_NOTE + ' [Partner: Ada Example]', partner_name: 'Ada Example' }), 'Ada Example');
  assert.equal(partnerNameOf({ notes: REG_NOTE, partner_name: 'Invoice the troop' }), '');
  assert.equal(partnerNameOf({ notes: REG_NOTE, partner_name: 'Ada $165' }), '');
  assert.equal(partnerNameOf({ notes: REG_NOTE }), '');
});

test('class-request logistics are separate from the billing agreement', () => {
  const submitted = requests.normalizeSubmission({
    kind: 'organization',
    organizationName: 'Synthetic Troop',
    name: 'Alex Example',
    email: 'alex@example.org',
    phone: '301-555-0199',
    courseKey: 'safe-sitter',
    location: '100 Example Ave, Bethesda, MD 20814',
    expectedCount: '10',
    days: [{ date: '2026-11-02', start: '13:30', end: '16:00' }],
    billing: 'org_full_external',
    parking: PARKING,
    arrival: 'Side door',
    av: ['Projector'],
    specialInstructions: CLIENT_RATE + ' billed after class',
    customRequest: PRIVATE_NOTE
  });
  const plan = requests.buildSessionRow(submitted, [], { id: 's-syn', requestId: 'req-syn', createdAt: 1 });
  assert.equal(plan.created, true);
  const row = plan.row;
  assert.match(row.instructor_directions, new RegExp(PARKING));
  assert.match(row.instructor_directions, /Side door/);
  assert.match(row.instructor_directions, /Projector/);
  assert.doesNotMatch(row.instructor_directions, new RegExp(CLIENT_RATE));
  assert.doesNotMatch(row.instructor_directions, new RegExp(PRIVATE_NOTE));
  assert.doesNotMatch(row.instructor_directions, /Invoice/);
  assert.doesNotMatch(row.instructor_directions, /\$/);
  assert.match(row.admin_private_notes, /Invoice the organization/);
  assert.match(row.notes, new RegExp(CLIENT_RATE));
  assert.match(row.notes, new RegExp(PRIVATE_NOTE));
  assert.equal(row.price_override, 0);
});

test('admin still stores private notes and does not copy them into instructor directions', () => {
  const flags = {
    LEGACY_CREATED_AT: 1,
    ORIGINATED_COL: false,
    HOSTED_FOR_COL: false,
    EXTRA_DATES_COL: false,
    EXTRA_DAYS_COL: false,
    CLOSURES_COL: false,
    INSTR_INFO_COL: true,
    REQUIRES_RN_COL: false,
    REQUIRES_SS_COL: false,
    REQUIRES_SPANISH_COL: false,
    CANCEL_COLS: false,
    EXTERNAL_URL_COL: false,
    ADMIN_PRIVATE_NOTES_COL: true,
    ORG_PORTION_COL: true,
    FEE_RECEIVED_COL: true,
    INSTR_DIRECTIONS_COL: true
  };
  const sandbox = Object.assign({}, flags);
  vm.runInNewContext(
    [extractFn(admin, 'sessionToDB')].join('\n'),
    sandbox
  );
  const row = sandbox.sessionToDB({
    id: 's-syn',
    code: 'SS-SYN',
    course: 'Safe Sitter®',
    createdAt: 1,
    notes: PRIVATE_NOTE + ' ' + CLIENT_RATE,
    adminPrivateNotes: PRIVATE_NOTE,
    instructorDirections: 'Parking: ' + PARKING,
    instructorInfo: OWN_PAY,
    priceOverride: 0,
    orgPortion: 165
  });
  assert.equal(row.notes, PRIVATE_NOTE + ' ' + CLIENT_RATE);
  assert.equal(row.admin_private_notes, PRIVATE_NOTE);
  assert.equal(row.instructor_directions, 'Parking: ' + PARKING);
  assert.equal(row.instructor_info, OWN_PAY);
  assert.equal(row.price_override, 0);
  assert.equal(row.org_portion, 165);
  assert.doesNotMatch(row.instructor_directions, new RegExp(PRIVATE_NOTE));
  assert.doesNotMatch(row.instructor_directions, new RegExp(CLIENT_RATE));
});

test('the migration projection separates client financials from instructor pay', () => {
  const body = sqlBody(sql);
  assert.match(body, /add column if not exists instructor_directions text/i);
  assert.doesNotMatch(body, /update\s+public\.sessions/i);
  assert.doesNotMatch(body, /grant[\s\S]{0,200}job_data/i);
  assert.doesNotMatch(body, /anon_read_job_board/i);
  assert.match(body, /revoke select \(instructor_directions\)[\s\S]*from anon, public/i);
  assert.match(body, /revoke select \(notes\)[\s\S]*from anon, public/i);

  const list = selectList('instructor_list_sessions');
  const listSelect = between(list, 'select s.id', 'from public.sessions s');
  ['instructor_directions', 'host_address', 'instr_pay_override', 'teaching_hours', 'paid_travel_hours', 'city'].forEach(col => {
    assert.match(listSelect, new RegExp('\\b' + col + '\\b'));
  });
  ['instructor_info', 'notes', 'admin_private_notes', 'price_override', 'org_portion', 'bill_to_org', 'billed_headcount', 'hold_payment', 'additional_costs', 'fee_received', 'origination_note', 'grant_tag', 'host_phone', 'wifi_info', 'zoom_link'].forEach(col => {
    assert.equal(listSelect.includes(col), false, col);
  });
  assert.match(list, /v_active is distinct from true/);
  assert.match(list, /second_instructor_id::text = v_id/);
  assert.match(body, /^begin;/m);
  assert.match(body, /^commit;/m);
  assert.match(body, /402193d8-a9b7-4a7b-bdbb-b939c08dbd6d/);
  assert.match(body, /private\.is_portal_admin\(\)/);
  assert.doesNotMatch(body, /user_metadata/);
  assert.match(body, /app_metadata/);

  const notesFn = selectList('instructor_session_notes');
  assert.match(notesFn, /s\.instructor_directions/);
  assert.match(notesFn, /s\.instructor_id::text = v_id/);
  assert.match(notesFn, /s\.second_instructor_id::text = v_id/);
  assert.doesNotMatch(notesFn, /s\.notes/);
  assert.doesNotMatch(notesFn, /admin_private_notes/);

  const jobs = selectList('instructor_job_details');
  ['pay_status', 'pay_date', 'paid_fee', 'referral_bonus'].forEach(col => {
    assert.match(jobs, new RegExp('\\b' + col + '\\b'));
  });
  assert.doesNotMatch(jobs, /j\.notes/);

  const roster = selectList('instructor_get_roster');
  assert.match(roster, /partner_name/);
  assert.match(roster, /private\.partner_display_name\(r\.notes\)/);
  assert.match(body, /function private\.partner_display_name/);
  assert.doesNotMatch(roster, /r\.pay_status/);
  const rosterReturns = between(roster, 'returns table', 'language plpgsql');
  assert.equal(rosterReturns.includes('notes'), false);
  assert.equal(rosterReturns.includes('pay_status'), false);

  assert.doesNotMatch(body, /function public\.list_public_sessions/);
  assert.doesNotMatch(body, /function public\.get_session_by_code/);
  assert.match(publicList, /price_override/);
  assert.doesNotMatch(publicList, /admin_private_notes/);
});

test('instructor pages do not ask for raw notes, and only admin signs in', () => {
  assert.doesNotMatch(instructor, /signInWithPassword/);
  assert.match(admin, /signInWithPassword/);
  assert.doesNotMatch(instructor, /instructor_session_notes/);
  assert.doesNotMatch(instructor, /r\.notes/);
  assert.match(instructor, /s\.notes=''/);
  instructor.split('\n').filter(line => line.includes('admin_private_notes')).forEach(line => {
    assert.match(line.trim(), /^\/\//);
  });
  assert.doesNotMatch(instructor, /price_override|org_portion|bill_to_org|fee_received/);
  assert.match(instructor, /instrPayOverride/);
  assert.match(instructor, /instructorDirectionsText\(s\)/);
  const email = between(admin, 'function openInstructorReminder', 'function openInstructorFinalRoster');
  assert.match(email, /Directions: /);
  assert.doesNotMatch(email, /Notes: '\+s\.notes/);
  assert.doesNotMatch(email, /adminPrivateNotes/);
  assert.doesNotMatch(email, /instructorInfo/);
  const chunks = between(admin, 'function opsEmailInfo', 'function courseOverviewApi');
  assert.doesNotMatch(chunks, /\[s\.notes/);
  assert.doesNotMatch(chunks, /s\.instructorInfo/);
  assert.match(chunks, /\[s\.instructorDirections\]/);
});

test('assigned instructors keep directions and own pay; other instructors do not', () => {
  const DOOR = 'SYN-DOOR-9f3c';
  const ZOOM = 'SYN-ZOOM-HOST-1a2b';
  const INFO = 'SYN-INFO-DOLLAR';
  const wide = {
    id: 's1',
    instructorId: 'inst-a',
    secondInstructorId: 'inst-c',
    instructorDirections: 'Door ' + DOOR + ' Zoom ' + ZOOM,
    instructorInfo: INFO + ' hourly instruction',
    notes: PRIVATE_NOTE + ' ' + CLIENT_RATE,
    hostAddress: '100 Secret St',
    city: 'Bethesda',
    location: 'Community room',
    instrPayOverride: 150,
    teachingHours: 6,
    paidTravelHours: 2
  };
  function copy() { return Object.assign({}, wide); }
  const assignee = facing.restrictToViewer(copy(), 'inst-a');
  const other = facing.restrictToViewer(copy(), 'inst-b');
  const second = facing.restrictToViewer(copy(), 'inst-c');
  const inactiveShape = facing.restrictToViewer(copy(), '');

  assert.match(facing.directionsText(assignee), new RegExp(DOOR));
  assert.match(facing.directionsText(assignee), new RegExp(ZOOM));
  assert.equal(assignee.instrPayOverride, 150);
  assert.equal(assignee.teachingHours, 6);
  assert.equal(assignee.hostAddress, '100 Secret St');
  assert.equal(assignee.city, 'Bethesda');

  assert.equal(facing.directionsText(other), '');
  assert.equal(other.instructorDirections, '');
  assert.equal(other.instrPayOverride, null);
  assert.equal(other.teachingHours, null);
  assert.equal(other.paidTravelHours, null);
  assert.equal(other.hostAddress, '');
  assert.equal(other.city, 'Bethesda');
  assert.equal(other.location, 'Community room');

  assert.match(facing.directionsText(second), new RegExp(DOOR));
  assert.equal(second.instrPayOverride, 150);

  assert.equal(facing.directionsText(inactiveShape), '');
  assert.equal(inactiveShape.instrPayOverride, null);

  [assignee, other, second].forEach(row => {
    const packed = JSON.stringify(row);
    assert.equal(packed.includes(INFO), false);
    assert.equal(packed.includes(PRIVATE_NOTE), false);
    assert.equal(packed.includes(CLIENT_RATE), false);
  });
  assert.equal(facing.partnerDisplayName('Ada Example'), 'Ada Example');
  assert.equal(facing.partnerDisplayName('Ada Example ' + CLIENT_RATE), '');
  assert.equal(facing.partnerDisplayName('Paid in full'), '');
});

test('rollback script is guarded and the forward script is one transaction', () => {
  const rollback = fs.readFileSync(path.join(root, 'migrations/20261106_instructor_directions_rollback.sql'), 'utf8');
  const forward = sqlBody(sql);
  assert.match(forward, /^begin;/m);
  assert.match(forward, /^commit;/m);
  assert.equal(forward.indexOf('begin;') < forward.indexOf('commit;'), true);
  assert.match(rollback, /mb\.rollback_instructor_privacy/);
  assert.match(rollback, /raise exception/i);
});
