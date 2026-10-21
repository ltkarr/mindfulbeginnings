'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../js/class-requests');
const adminUi = require('../js/class-requests-admin');
const { submitClassRequest } = require('../lib/class-request-submit');
const { approveClassRequest } = require('../lib/class-request-approve');
const { createOutlookDraft } = require('../lib/outlook-draft');
const { notifyLindsay, LINDSAY } = require('../lib/class-request-notify');

const root = path.join(__dirname, '..');
const hostPage = fs.readFileSync(path.join(root, 'host.html'), 'utf8');
const orgPage = fs.readFileSync(path.join(root, 'organization.html'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
const outlookSrc = fs.readFileSync(path.join(root, 'lib/outlook-draft.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations/class_requests.sql'), 'utf8');
const intakeCss = fs.readFileSync(path.join(root, 'css/intake.css'), 'utf8');

function hostBody(over) {
  return Object.assign({
    kind: 'host',
    who: 'home',
    name: 'Jane Host',
    email: 'jane@example.com',
    phone: '703-555-0100',
    courseKey: 'safe-sitter',
    address: '123 Maple St, Bethesda, MD 20814',
    expectedCount: '8',
    days: [{ date: '2026-11-02', start: '13:30', end: '16:00' }],
    checklistAnswer: 'yes',
    food: 'snacks',
    specialInstructions: 'Park in the driveway.'
  }, over || {});
}

function orgBody(over) {
  return Object.assign({
    kind: 'organization',
    organizationName: 'Congregation Beth El',
    name: 'Alex Brown',
    email: 'alex@example.org',
    phone: '301-555-0199',
    courseKey: 'safe-sitter',
    location: 'Congregation Beth El, 8215 Old Georgetown Rd, Bethesda, MD 20814',
    expectedCount: '10',
    days: [
      { date: '2026-11-02', start: '13:30', end: '16:00' },
      { date: '2026-11-03', start: '13:30', end: '16:00' }
    ],
    billing: 'org_full_link',
    av: ['Projector', 'Screen or blank wall'],
    parking: 'Visitor lot on the left.',
    arrival: 'Use the side door. Code 1234.'
  }, over || {});
}

test('host and organization pages use the shared brand header without a duplicate title', () => {
  assert.equal(hostPage.includes('<img class="mb-logo"'), true);
  assert.equal(hostPage.includes('src="/images/logo-navy.png"'), true);
  assert.equal(orgPage.includes('<img class="mb-logo"'), true);
  assert.equal(orgPage.includes('src="/images/logo-navy.png"'), true);
  assert.match(hostPage, /<span class="mb-lockup">Mindful <span class="mb-lockup-script">Beginnings<\/span><\/span>/);
  assert.match(orgPage, /<span class="mb-lockup">Mindful <span class="mb-lockup-script">Beginnings<\/span><\/span>/);
  assert.doesNotMatch(hostPage, /Safe Sitter® and family safety courses/);
  assert.doesNotMatch(orgPage, /Safe Sitter® and family safety courses/);
  assert.doesNotMatch(intakeCss, /border-radius:\s*50%/);
  assert.match(hostPage, /we will confirm the date/);
  assert.match(orgPage, /<h1>Organization site information<\/h1>/);
});

test('host course choices on the page match the catalog, and organizations are sent to the other form', () => {
  model.coursesFor('host').forEach(function (course) {
    assert.match(hostPage, new RegExp('value="' + course.key + '"'));
    assert.match(hostPage, new RegExp(model.courseOptionLabel(course).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
  assert.match(hostPage, /organization\.html/);
  assert.match(hostPage, /Home hosts get one free spot/);
  assert.doesNotMatch(hostPage, /Organizations: please use this form/i);
  assert.match(register, /host\.html/);
  assert.match(register, /organization\.html/);
  assert.match(register, /Need help finding a class\? <a href="mailto:lindsay@mindfulbeginnings\.org">Contact us<\/a>\./);
});

test('Social Ready is $45 per kid; virtual courses are organization-only, never on the home host menu', () => {
  ['social-ready', 'social-ready-virtual'].forEach(function (key) {
    const course = model.courseByKey(key);
    assert.equal(course.course, 'Social Ready');
    assert.equal(course.price, 45);
    assert.equal(course.host, true);
    assert.equal(course.org, true);
    assert.equal(course.abbr, 'SOC');
    const label = model.courseOptionLabel(course);
    assert.match(label, /\$45/);
    assert.match(orgPage, new RegExp('value="' + key + '"'));
    assert.match(orgPage, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
  assert.equal(model.courseByKey('social-ready').virtual, undefined);
  assert.equal(model.courseByKey('social-ready-virtual').virtual, true);
  // Oct 2026: virtual options removed from host inquiries — the in-person
  // course stays on the host menu, no virtual course appears there.
  assert.match(hostPage, /value="social-ready"/);
  assert.doesNotMatch(hostPage, /value="[a-z0-9-]*-virtual"/);
  assert.equal(model.coursesFor('host').filter(c => c.virtual).length, 0);
  assert.ok(model.coursesFor('organization').some(c => c.virtual), 'org form keeps virtual courses');

  const host = model.normalizeSubmission(hostBody({ courseKey: 'social-ready' }));
  assert.equal(model.validate(host).length, 0);
  const hostPlan = model.buildSessionRow(host, []);
  assert.equal(hostPlan.row.course, 'Social Ready');
  assert.equal(hostPlan.row.code, 'SOC-261102');
  assert.equal(hostPlan.row.is_virtual, false);
  assert.equal(hostPlan.row.price_override, null);
  assert.match(model.buildDraft(host, hostPlan.row).body, /\$45 per participant/);

  const virtual = model.normalizeSubmission(hostBody({ courseKey: 'social-ready-virtual', address: 'Virtual' }));
  const virtualPlan = model.buildSessionRow(virtual, []);
  assert.equal(virtualPlan.row.course, 'Social Ready');
  assert.equal(virtualPlan.row.is_virtual, true);
  assert.equal(virtualPlan.row.location, 'Virtual');

  const org = model.normalizeSubmission(orgBody({ courseKey: 'social-ready', billing: 'individual' }));
  const orgPlan = model.buildSessionRow(org, []);
  assert.equal(orgPlan.row.course, 'Social Ready');
  assert.equal(orgPlan.row.price_override, null);
  assert.match(model.buildDraft(org, orgPlan.row).body, /\$45 per participant/);
});

test('organization course choices match the catalog, including Girl Scout badge and four billing options', () => {
  model.coursesFor('organization').forEach(function (course) {
    assert.match(orgPage, new RegExp('value="' + course.key + '"'));
  });
  assert.match(orgPage, /href="https:\/\/mindfulbeginnings\.org\/girl-scouts"/);
  assert.match(orgPage, /see badge descriptions/);
  assert.doesNotMatch(orgPage, /gsnc/);
  assert.doesNotMatch(hostPage, /gsnc/);
  assert.doesNotMatch(hostPage, /lindsay/i);
  assert.doesNotMatch(orgPage, /lindsay/i);
  assert.doesNotMatch(hostPage, /changes later/i);
  assert.doesNotMatch(orgPage, /changes later/i);
  const formScript = fs.readFileSync(path.join(root, 'js/class-request-form.js'), 'utf8');
  assert.match(formScript, /We will confirm the date/);
  assert.doesNotMatch(formScript, /lindsay/i);
  assert.match(orgPage, /name="badge"/);
  assert.match(orgPage, /value="org_full_external"/);
  assert.match(orgPage, /value="org_full_link"/);
  assert.match(orgPage, /value="individual"/);
  assert.match(orgPage, /value="split"/);
  assert.match(orgPage, /host\.html/);
});

test('After School Clubs is a $200/participant organization option with a club picker', () => {
  const asc = model.coursesFor('organization').find(function (c) { return c.key === 'after-school-clubs'; });
  assert.ok(asc, 'catalog has after-school-clubs for organizations');
  assert.equal(asc.price, 200);
  assert.equal(asc.course, 'After School Clubs');
  assert.ok(!model.coursesFor('host').some(function (c) { return c.key === 'after-school-clubs'; }), 'not on the home host form');
  assert.match(orgPage, /value="after-school-clubs"/);
  assert.match(orgPage, /After School Clubs \(please list the club you want below\), Elementary clubs, 1 hour a week, typically 8-10 weeks, in person \(\$200 per participant\)/);
  assert.match(orgPage, /\$200 per participant/);
  assert.match(orgPage, /id="clubs-wrap"/);
  ['My First Babysitter\'s Club', 'Little Medics', 'Pet Sitter\'s Club', 'Snack Squad', 'Kid Boss Club',
   'Middle School, Here I Come', 'Big Sibling Club', 'My First Phone', 'Walk and Roll Ready', 'Calm and Ready'
  ].forEach(function (club) {
    assert.match(orgPage, new RegExp('name="clubs"[^>]*value="' + club.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
  const formScript = fs.readFileSync(path.join(root, 'js/class-request-form.js'), 'utf8');
  assert.match(formScript, /after-school-clubs/);
  assert.match(formScript, /clubs-wrap/);
  const n = model.normalizeSubmission(orgBody({ courseKey: 'after-school-clubs', clubs: ['Little Medics (Grades K–2)', 'Snack Squad (Grades 2–5)'] }));
  assert.equal(n.course.key, 'after-school-clubs');
  assert.equal(n.course.price, 200);
  assert.deepEqual(n.clubs, ['Little Medics (Grades K–2)', 'Snack Squad (Grades 2–5)']);
  assert.equal(model.validate(n).length, 0);
});

test('a home host maps to a private session with a free host seat and catalog pricing', () => {
  const n = model.normalizeSubmission(hostBody());
  assert.equal(model.validate(n).length, 0);
  const plan = model.buildSessionRow(n, []);
  assert.equal(plan.created, true);
  assert.equal(plan.row.code, 'SS-261102');
  assert.equal(plan.row.course, 'Safe Sitter®');
  assert.equal(plan.row.date, '2026-11-02');
  assert.equal(plan.row.time, '1:30 to 4:00 PM');
  assert.equal(plan.row.price_override, null);
  assert.equal(plan.row.bill_to_org, null);
  assert.equal(plan.row.org_portion, null);
  assert.equal(plan.row.has_host, true);
  assert.equal(plan.row.is_private, true);
  assert.equal(plan.row.is_hold, false);
  assert.equal(plan.row.city, 'Bethesda');
  assert.equal(plan.row.state, 'MD');
  assert.equal(plan.row.zip, '20814');
  assert.equal(plan.row.host_address, '123 Maple St');
  assert.equal(plan.row.requires_safe_sitter, true);
  const draft = model.buildDraft(n, plan.row);
  assert.match(draft.body, /Home hosts get one free spot/);
  assert.match(draft.body, /SS-261102/);
  assert.match(draft.body, /\$225 per participant/);
  assert.match(draft.body, /Park in the driveway/);
  assert.equal(draft.to, 'jane@example.com');
  assert.doesNotMatch(draft.body, /this email was sent automatically/i);
});

test('multi-day organization text follows the Beth El SS-261102 extra-day shape', () => {
  const days = model.parseDaysFromText('November 2, 2026, 1:30 to 4:00 PM\nNovember 3, 2026, 1:30 to 4:00 PM');
  assert.deepEqual(days, [
    { date: '2026-11-02', time: '1:30 to 4:00 PM' },
    { date: '2026-11-03', time: '1:30 to 4:00 PM' }
  ]);
  const n = model.normalizeSubmission(orgBody({
    days: undefined,
    datesText: 'November 2 and 3, 2026, 1:30 to 4:00 PM'
  }));
  const plan = model.buildSessionRow(n, ['SS-261102']);
  assert.equal(plan.row.code, 'SS-261102B');
  assert.equal(plan.row.date, '2026-11-02');
  assert.deepEqual(plan.row.extra_dates, ['2026-11-03']);
  assert.deepEqual(plan.row.extra_days, [{ date: '2026-11-03', time: '1:30 to 4:00 PM' }]);
  assert.equal(plan.row.price_override, 0);
  assert.equal(plan.row.org_portion, 225);
  assert.equal(plan.row.bill_to_org, 'Congregation Beth El');
  assert.equal(plan.row.billed_headcount, 10);
  assert.equal(plan.row.has_host, false);
  assert.equal(plan.row.is_private, true);
  assert.equal(plan.row.is_hold, false);
});

test('billing modes map to family price, organization portion, and whether a private link is offered', () => {
  const fullExternal = model.normalizeSubmission(orgBody({ billing: 'org_full_external' }));
  const externalPlan = model.buildSessionRow(fullExternal, []);
  assert.equal(externalPlan.row.price_override, 0);
  assert.equal(externalPlan.row.org_portion, 225);
  assert.equal(externalPlan.row.is_private, true);
  assert.equal(externalPlan.row.code, null);
  assert.equal(externalPlan.row.org_handles_registration, true);
  assert.doesNotMatch(model.buildDraft(fullExternal, externalPlan.row).body, /Session code:/);
  const externalDraft = model.buildDraft(fullExternal, externalPlan.row);
  assert.match(externalDraft.body, /Price: \$225 per participant\. Estimated total for 10 participants: \$2250, final invoice based on attendance/);
  assert.match(externalDraft.body, /no family payment link/i);
  assert.doesNotMatch(externalDraft.body, /register\.html\?code=/);
  assert.doesNotMatch(externalDraft.body, /\u2014/);

  const link = model.normalizeSubmission(orgBody({ billing: 'org_full_link' }));
  const linkDraft = model.buildDraft(link, model.buildSessionRow(link, []).row);
  assert.match(linkDraft.body, /Price: \$225 per participant\. Estimated total for 10 participants: \$2250, final invoice based on attendance/);
  assert.match(linkDraft.body, /private link at no charge/i);
  assert.match(linkDraft.body, /register\.html\?code=SS-261102/);

  const individual = model.normalizeSubmission(orgBody({ billing: 'individual' }));
  const individualPlan = model.buildSessionRow(individual, []);
  assert.equal(individualPlan.row.price_override, null);
  assert.equal(individualPlan.row.bill_to_org, null);
  assert.equal(individualPlan.row.org_portion, null);
  assert.equal(individualPlan.row.is_private, true);
  assert.match(model.buildDraft(individual, individualPlan.row).body, /Price: \$225 per participant\./);
  assert.doesNotMatch(model.buildDraft(individual, individualPlan.row).body, /Estimated total/);

  const split = model.normalizeSubmission(orgBody({ billing: 'split', portionText: '$25' }));
  const splitPlan = model.buildSessionRow(split, []);
  assert.equal(splitPlan.row.price_override, 200);
  assert.equal(splitPlan.row.org_portion, 25);
  assert.equal(splitPlan.row.bill_to_org, 'Congregation Beth El');
  const splitDraft = model.buildDraft(split, splitPlan.row);
  assert.match(splitDraft.body, /Price: \$25 per participant\. Estimated total for 10 participants: \$250, final invoice based on attendance/);
  assert.match(splitDraft.body, /\$200/);
  assert.match(splitDraft.body, /\$25 per participant/);

  const half = model.mapBilling({ kind: 'organization', billing: 'split', orgName: 'Troop', portionText: '50%', catalogPrice: 225, expectedCount: '6' });
  assert.equal(half.resolved, true);
  assert.equal(half.priceOverride, 113);
  assert.equal(half.orgPortion, 112);

  const messy = model.normalizeSubmission(orgBody({ billing: 'split', portionText: 'whatever seems fair' }));
  assert.equal(model.validate(messy).length, 0);
  assert.equal(model.canCreateSession(messy).ok, false);
  assert.equal(model.canCreateSession(messy).reason, 'billing');
  assert.equal(model.buildSessionRow(messy, []).created, false);
});

test('GSFA evening end 08:30 next to a 19:00 start displays as 8:30 PM, with a per-participant total', () => {
  assert.equal(model.formatSpan('19:00', '08:30'), '7:00 to 8:30 PM');
  assert.equal(model.formatSpan('19:00', '20:30'), '7:00 to 8:30 PM');
  assert.equal(model.formatSpan('07:00', '08:30'), '7:00 to 8:30 AM');
  assert.equal(model.formatSpan('13:30', '16:00'), '1:30 to 4:00 PM');
  assert.equal(model.formatSpan('22:00', '00:00'), '10:00 PM to 12:00 AM');
  assert.equal(model.formatSpan('11:00', '13:00'), '11:00 AM to 1:00 PM');

  const n = model.normalizeSubmission(orgBody({
    courseKey: 'gs-first-aid',
    organizationName: 'GS Troop 55090',
    expectedCount: '11 7th graders',
    billing: 'org_full_link',
    days: [{ date: '2026-11-12', start: '19:00', end: '08:30' }]
  }));
  assert.equal(n.days[0].time, '7:00 to 8:30 PM');
  assert.equal(n.billing.billedHeadcount, 11);
  const plan = model.buildSessionRow(n, []);
  assert.equal(plan.row.code, 'GSFA-261112');
  assert.equal(plan.row.time, '7:00 to 8:30 PM');
  assert.equal(plan.row.org_portion, 45);
  assert.equal(plan.row.billed_headcount, 11);
  const draft = model.buildDraft(n, plan.row);
  assert.match(draft.body, /Time: 7:00 to 8:30 PM/);
  assert.doesNotMatch(draft.body, /8:30 AM/);
  assert.match(draft.body, /Price: \$45 per participant\. Estimated total for 11 participants: \$495, final invoice based on attendance/);
  assert.match(draft.body, /Participants register on this private link at no charge/);
  assert.doesNotMatch(draft.body, /Price:.*\u2014/);
  assert.doesNotMatch(draft.body, /Payment:.*\u2014/);

  const unknown = model.normalizeSubmission(orgBody({
    courseKey: 'gs-first-aid',
    expectedCount: '',
    billing: 'org_full_link',
    days: [{ date: '2026-11-12', start: '19:00', end: '20:30' }]
  }));
  const unknownDraft = model.buildDraft(unknown, model.buildSessionRow(unknown, []).row);
  assert.match(unknownDraft.body, /Price: \$45 per participant\./);
  assert.doesNotMatch(unknownDraft.body, /Estimated total/);
});

test('a custom course and a request with no date are saved as requests but do not create a session', () => {
  const custom = model.normalizeSubmission(orgBody({ courseKey: 'custom', customRequest: 'A parent workshop.' }));
  assert.equal(model.validate(custom).length, 0);
  assert.equal(model.buildSessionRow(custom, []).reason, 'course');
  const undated = model.normalizeSubmission(hostBody({ days: [] }));
  assert.equal(model.canCreateSession(undated).reason, 'date');
});

test('a home form filled out for an organization is refused and pointed at the organization form', () => {
  const n = model.normalizeSubmission(hostBody({ forOrganization: true }));
  const errors = model.validate(n);
  assert.equal(errors[0].redirect, '/organization.html');
});

test('checklist stays pending until a session is approved, then advances only when Lindsay marks a step', () => {
  const fresh = model.checklistAfterSubmit(true);
  assert.equal(fresh.checklist.received, true);
  assert.equal(fresh.checklist.session_created, true);
  assert.equal(fresh.checklist.email_sent, false);
  assert.equal(fresh.status, 'session_created');

  const waiting = model.checklistAfterSubmit(false);
  assert.equal(waiting.status, 'pending');
  assert.equal(waiting.checklist.session_created, false);

  const sent = model.applyChecklistUpdate(fresh.checklist, { email_sent: true });
  assert.equal(sent.status, 'done');
  assert.equal(sent.checklist.email_sent, true);
  assert.equal(sent.checklist.done, true);

  const done = model.applyChecklistUpdate(sent.checklist, { done: true });
  assert.equal(done.status, 'done');

  const locked = model.applyChecklistUpdate(fresh.checklist, { received: false, email_sent: true });
  assert.equal(locked.checklist.received, true);

  const reopened = model.applyChecklistUpdate(done.checklist, { done: false });
  assert.equal(reopened.status, 'email_sent');
});

test('ADMIN lists the checklist and keeps the email-sent step manual', () => {
  assert.match(admin, /id="screen-requests"/);
  assert.match(admin, /id="nav-requests"/);
  assert.match(admin, /class_requests/);
  assert.match(admin, /migrations\/class_requests\.sql/);
  const html = adminUi.renderList([{
    id: 'req-1',
    kind: 'host',
    status: 'session_created',
    submitter_name: 'Jane Host',
    course: 'Safe Sitter®',
    session_id: 'sess-1',
    session_code: 'SS-261102',
    draft_subject: 'Hosting your Safe Sitter® course',
    draft_body: 'Hi Jane',
    draft_to: 'jane@example.com',
    checklist: model.checklistAfterSubmit(true).checklist,
    payload: hostBody(),
    created_at: '2026-10-05T12:00:00Z'
  }], 'open', [{ id: 'sess-1', instructorId: null }]);
  assert.match(html, /Session created in ADMIN/);
  assert.doesNotMatch(html, /Confirmation email drafted/);
  assert.match(html, /Email sent/);
  assert.doesNotMatch(html, /Instructor claimed/);
  assert.doesNotMatch(html, /Archived/);
  assert.match(html, /Open confirmation draft/);
  assert.match(html, /SS-261102/);
  assert.doesNotMatch(html, /Approve and create session/);
  const pendingHtml = adminUi.renderList([{
    id: 'req-pending',
    kind: 'organization',
    status: 'pending',
    submitter_name: 'Alex Brown',
    course: 'Safe Sitter®',
    session_id: null,
    session_code: null,
    checklist: model.checklistAfterSubmit(false).checklist,
    payload: orgBody(),
    created_at: '2026-10-05T12:00:00Z'
  }], 'open', []);
  assert.match(pendingHtml, /Approve and create session/);
  assert.match(pendingHtml, /Pending/);
  assert.doesNotMatch(pendingHtml, /\u2014/);
  assert.equal(adminUi.openCount([{ checklist: { done: false } }, { checklist: { done: false, email_sent: true } }, { checklist: { done: true } }]), 1);
  assert.match(admin, /<option value="open" selected>Open<\/option>/);
  assert.match(admin, /<option value="done">Done<\/option>/);
  assert.doesNotMatch(admin, /Just received/);
  assert.doesNotMatch(admin, /value="archived"/);
  const fresh = { checklist: { done: false, session_created: false } };
  const attention = { checklist: { done: false, session_created: true } };
  const emailed = { checklist: { done: false, email_sent: true } };
  const finished = { checklist: { done: true } };
  const filed = { checklist: { done: false, archived: true } };
  assert.equal(adminUi.matchesFilter(fresh, 'open'), true);
  assert.equal(adminUi.matchesFilter(attention, 'open'), true);
  assert.equal(adminUi.matchesFilter(emailed, 'open'), false);
  assert.equal(adminUi.matchesFilter(finished, 'open'), false);
  assert.equal(adminUi.matchesFilter(finished, 'done'), true);
  assert.equal(adminUi.matchesFilter(filed, 'done'), true);
  assert.equal(adminUi.matchesFilter(filed, 'open'), false);
  assert.equal(adminUi.matchesFilter(fresh, 'done'), false);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.class_requests from public, anon/i);
  assert.doesNotMatch(outlookSrc, /sendMail/);
});

test('submitting creates no session, stores a pending request, keeps the confirmation a draft, and notifies only Lindsay', async () => {
  const saved = [];
  const notices = [];
  const drafts = [];
  const result = await submitClassRequest(orgBody(), {
    listSessionCodes: async function () { throw new Error('submit must not read sessions'); },
    insertSession: async function () { throw new Error('submit must not create a session'); },
    insertRequest: async function (row) { saved.push(row); return row; },
    updateRequest: async function () { return {}; },
    createOutlookDraft: async function (draft) { drafts.push(draft); return { created: false, reason: 'missing_credentials' }; },
    notifyLindsay: async function (record) { notices.push(record); return { sent: false, reason: 'missing_credentials' }; }
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.ok, true);
  assert.equal(result.body.sessionCreated, false);
  assert.equal(result.body.outlookDraftCreated, false);
  assert.equal(result.body.draftStored, true);
  assert.equal(saved.length, 1);
  assert.equal(saved[0].status, 'pending');
  assert.equal(saved[0].session_id, null);
  assert.equal(saved[0].session_code, null);
  assert.equal(saved[0].checklist.session_created, false);
  assert.equal(saved[0].checklist.email_sent, false);
  assert.equal(drafts[0].to, 'alex@example.org');
  assert.match(drafts[0].body, /Warmly/);
  assert.doesNotMatch(drafts[0].body, /SS-261102/);
  assert.match(drafts[0].body, /I will send the private registration link when the class is confirmed/);
  assert.doesNotMatch(drafts[0].body, /\u2014/);
  assert.equal(notices.length, 1);
  assert.match(notices[0].draft_body, /not sent|Warmly|private registration link/i);
  assert.equal(notices[0].session_code, null);

  const honeypot = await submitClassRequest(orgBody({ companyWebsite: 'http://spam.example' }), {
    insertSession: async function () { throw new Error('spam must not create a session'); },
    insertRequest: async function () { throw new Error('spam must not be saved'); },
    createOutlookDraft: async function () { throw new Error('spam must not draft mail'); },
    notifyLindsay: async function () { throw new Error('spam must not notify'); }
  });
  assert.equal(honeypot.status, 200);
  assert.equal(honeypot.body.ok, true);
  assert.equal(honeypot.body.id, null);
  assert.equal(honeypot.body.sessionCreated, false);

  const unclear = await submitClassRequest(orgBody({ billing: 'split', portionText: 'call me' }), {
    insertSession: async function () { throw new Error('submit must not create a session'); },
    insertRequest: async function (row) { return row; },
    createOutlookDraft: async function () { return { created: false, reason: 'missing_credentials' }; },
    notifyLindsay: async function () { return { sent: false, reason: 'missing_credentials' }; }
  });
  assert.equal(unclear.status, 200);
  assert.equal(unclear.body.sessionCreated, false);
  assert.equal(unclear.body.sessionSkippedReason, null);
});

function approvalMemory(payload) {
  const row = {
    id: 'req-1',
    status: 'pending',
    checklist: model.checklistAfterSubmit(false).checklist,
    payload: payload,
    session_id: null,
    session_code: null,
    draft_body: 'Draft before approval'
  };
  const sessions = [];
  let chain = Promise.resolve();
  const deps = {
    getRequest: async function () { return Object.assign({}, row); },
    claimRequest: async function (id, patch) {
      let release;
      const prev = chain;
      chain = new Promise(function (resolve) { release = resolve; });
      await prev;
      try {
        if (row.session_id) return null;
        Object.assign(row, patch);
        return Object.assign({}, row);
      } finally {
        release();
      }
    },
    releaseClaim: async function (id, sessionId) {
      if (row.session_id === sessionId) {
        row.session_id = null;
        row.session_code = null;
      }
      return Object.assign({}, row);
    },
    listSessionCodes: async function () {
      return ['SS-EXISTING'].concat(sessions.map(function (s) { return s.code; }));
    },
    insertSession: async function (session) {
      sessions.push(session);
      return session;
    },
    updateSession: async function () { throw new Error('approving must not change an existing session'); },
    updateRequest: async function (id, patch) {
      Object.assign(row, patch);
      return Object.assign({}, row);
    },
    createOutlookDraft: async function (draft) {
      row.outlook_web_link = 'https://outlook.office.com/mail/draft/approved';
      return { created: true, id: 'draft-approved', webLink: row.outlook_web_link, body: draft.body };
    }
  };
  return { row: row, sessions: sessions, deps: deps };
}

test('approving a pending request creates exactly one session and a second click does not create another', async () => {
  const mem = approvalMemory(hostBody());
  const first = await approveClassRequest('req-1', mem.deps);
  assert.equal(first.status, 200);
  assert.equal(first.body.ok, true);
  assert.equal(first.body.created, true);
  assert.equal(mem.sessions.length, 1);
  assert.equal(mem.sessions[0].code, 'SS-261102');
  assert.equal(mem.sessions[0].is_private, true);
  assert.equal(mem.sessions[0].price_override, null);
  assert.equal(mem.sessions[0].id, first.body.sessionId);
  assert.equal(mem.row.session_id, first.body.sessionId);
  assert.equal(mem.row.session_code, 'SS-261102');
  assert.equal(mem.row.status, 'session_created');
  assert.equal(mem.row.checklist.session_created, true);
  assert.match(mem.row.draft_body, /SS-261102/);
  assert.match(mem.row.draft_body, /register\.html\?code=SS-261102/);
  assert.doesNotMatch(mem.row.draft_body, /\u2014/);
  assert.equal(mem.row.outlook_web_link, 'https://outlook.office.com/mail/draft/approved');

  const second = await approveClassRequest('req-1', mem.deps);
  assert.equal(second.status, 200);
  assert.equal(second.body.created, false);
  assert.equal(second.body.sessionId, first.body.sessionId);
  assert.equal(second.body.sessionCode, 'SS-261102');
  assert.equal(mem.sessions.length, 1);

  const raced = approvalMemory(orgBody());
  const both = await Promise.all([
    approveClassRequest('req-1', raced.deps),
    approveClassRequest('req-1', raced.deps)
  ]);
  assert.equal(raced.sessions.length, 1);
  assert.equal(raced.sessions[0].code, 'SS-261102');
  assert.equal(raced.sessions[0].price_override, 0);
  assert.equal(raced.sessions[0].is_private, true);
  const createdFlags = both.map(function (result) { return result.body.created; }).sort();
  assert.deepEqual(createdFlags, [false, true]);
  assert.equal(both[0].body.sessionId, both[1].body.sessionId);

  const blocked = approvalMemory(orgBody({ billing: 'split', portionText: 'call me' }));
  const denied = await approveClassRequest('req-1', blocked.deps);
  assert.equal(denied.status, 400);
  assert.equal(denied.body.reason, 'billing');
  assert.equal(blocked.sessions.length, 0);
  assert.equal(blocked.row.session_id, null);
});

test('Graph draft creation posts a message and does not send it', async () => {
  const calls = [];
  const result = await createOutlookDraft(
    { to: 'jane@example.com', subject: 'Hosting', body: 'Hi Jane' },
    {
      env: { tenant: 'tenant', clientId: 'id', clientSecret: 'secret', mailbox: LINDSAY, configured: true },
      fetch: async function (url, opts) {
        calls.push({ url: url, body: opts.body });
        if (String(url).includes('/token')) {
          return { ok: true, json: async function () { return { access_token: 'tok' }; } };
        }
        assert.doesNotMatch(String(url), /sendMail/);
        assert.match(String(url), /\/messages$/);
        return { ok: true, json: async function () { return { id: 'draft-1', webLink: 'https://outlook.office.com/mail/draft/1' }; } };
      }
    }
  );
  assert.equal(result.created, true);
  assert.equal(result.id, 'draft-1');
  assert.equal(calls.length, 2);

  const missing = await createOutlookDraft({ to: 'a@b.c', subject: 'S', body: 'B' }, { env: { configured: false } });
  assert.equal(missing.created, false);
  assert.equal(missing.reason, 'missing_credentials');
});

test('the new-request notice goes to Lindsay and never to the family', async () => {
  const sent = [];
  const result = await notifyLindsay({
    kind: 'host',
    submitter_name: 'Jane Host',
    submitter_email: 'jane@example.com',
    course: 'Safe Sitter®',
    session_code: 'SS-261102'
  }, {
    env: {
      graphTenant: 'tenant',
      graphClientId: 'id',
      graphSecret: 'secret',
      mailbox: LINDSAY,
      emailjsTemplate: '',
      emailjsPrivateKey: ''
    },
    fetch: async function (url, opts) {
      sent.push({ url: String(url), body: opts.body });
      if (String(url).includes('/token')) {
        return { ok: true, status: 200, json: async function () { return { access_token: 'tok' }; }, text: async function () { return ''; } };
      }
      return { ok: true, status: 202, json: async function () { return {}; }, text: async function () { return ''; } };
    }
  });
  assert.equal(result.sent, true);
  assert.equal(result.to, LINDSAY);
  const mail = sent.find(function (call) { return call.url.includes('sendMail'); });
  const payload = JSON.parse(mail.body);
  assert.deepEqual(payload.message.toRecipients, [{ emailAddress: { address: LINDSAY } }]);
  assert.match(payload.message.body.content, /not sent to the family/i);
  assert.doesNotMatch(JSON.stringify(payload.message.toRecipients), /jane@example.com/);

  const quiet = await notifyLindsay({}, { env: {}, fetch: async function () { throw new Error('should not send'); } });
  assert.equal(quiet.sent, false);
  assert.equal(quiet.reason, 'missing_credentials');
});

test('the public API rejects a bad email without touching the database', async () => {
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  const handler = require('../api/class-requests');
  const res = { statusCode: 0, headers: {}, body: '', setHeader: function (k, v) { this.headers[k] = v; }, end: function (b) { this.body = b || ''; } };
  const req = {
    method: 'POST',
    headers: {},
    on: function (ev, cb) {
      if (ev === 'data') cb(Buffer.from(JSON.stringify(hostBody({ email: 'not-an-email' }))));
      if (ev === 'end') cb();
    }
  };
  await handler(req, res);
  assert.equal(res.statusCode, 400);
  assert.match(JSON.parse(res.body).error, /email/i);
});

test('a Spanish request on either public form flags the auto-created session', () => {
  assert.match(hostPage, /name="spanishRequested"/);
  assert.match(orgPage, /name="spanishRequested"/);
  assert.match(hostPage, /Do you want this class instructed in Spanish\?/);
  assert.match(orgPage, /Do you want this class instructed in Spanish\?/);
  const yes = model.normalizeSubmission(hostBody({ spanishRequested: true }));
  assert.equal(yes.spanishRequested, true);
  const plan = model.buildSessionRow(yes, [], { id: 's1', requestId: 'r1', createdAt: 1 });
  assert.equal(plan.created, true);
  assert.equal(plan.row.requires_spanish, true);
  assert.match(plan.row.notes, /Spanish/);
  const no = model.normalizeSubmission(hostBody());
  const plan2 = model.buildSessionRow(no, [], { id: 's2', requestId: 'r2', createdAt: 1 });
  assert.equal(plan2.row.requires_spanish, false);
});

test('approving requires an admin and does not create a session when unauthenticated', async () => {
  delete require.cache[require.resolve('../api/class-requests')];
  const handler = require('../api/class-requests');
  const res = { statusCode: 0, headers: {}, body: '', setHeader: function (k, v) { this.headers[k] = v; }, end: function (b) { this.body = b || ''; } };
  const req = {
    method: 'POST',
    headers: {},
    on: function (ev, cb) {
      if (ev === 'data') cb(Buffer.from(JSON.stringify({ action: 'approve', id: 'req-1' })));
      if (ev === 'end') cb();
    }
  };
  await handler(req, res);
  assert.equal(res.statusCode, 401);
  const adminSrc = fs.readFileSync(path.join(root, 'js/class-requests-admin.js'), 'utf8');
  const submitSrc = fs.readFileSync(path.join(root, 'lib/class-request-submit.js'), 'utf8');
  const approveSrc = fs.readFileSync(path.join(root, 'lib/class-request-approve.js'), 'utf8');
  const apiSrc = fs.readFileSync(path.join(root, 'api/class-requests.js'), 'utf8');
  assert.match(adminSrc, /Approve and create session/);
  assert.match(adminSrc, /action: 'approve'/);
  assert.match(apiSrc, /body\.action === 'approve'/);
  assert.equal(fs.existsSync(path.join(root, 'api/class-requests-approve.js')), false);
  assert.doesNotMatch(submitSrc, /insertSession|buildSessionRow/);
  assert.doesNotMatch(approveSrc, /sessions\?id=eq/);
  assert.match(fs.readFileSync(path.join(root, 'migrations/20261021_class_request_pending.sql'), 'utf8'), /'pending'/);
  const apiFiles = [];
  (function walk(dir) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) walk(full);
      else if (name.endsWith('.js') && !name.startsWith('_')) apiFiles.push(full);
    }
  })(path.join(root, 'api'));
  assert.ok(apiFiles.length <= 12, 'Hobby plan allows 12 Serverless Functions, found ' + apiFiles.length);
});

test('the Spanish session flag has the same column shape as the other requirement flags', () => {
  const migration = require('fs').readFileSync(require('path').join(__dirname, '..', 'migrations/20261017_spanish_flags.sql'), 'utf8');
  assert.match(migration, /requires_spanish boolean default false/);
  assert.match(migration, /speaks_spanish boolean default false/);
  assert.match(migration, /grant select \(requires_spanish\) on public\.sessions to anon/);
  assert.match(migration, /instructor_speaks_spanish/);
  assert.match(migration, /instructor_list_sessions/);
});
