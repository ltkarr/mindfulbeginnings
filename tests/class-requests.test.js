'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const model = require('../js/class-requests');
const adminUi = require('../js/class-requests-admin');
const { submitClassRequest } = require('../lib/class-request-submit');
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

test('host and organization headers use the large white logo without a duplicate title', () => {
  assert.equal(fs.existsSync(path.join(root, 'email-logo-white.png')), true);
  assert.match(hostPage, /<img src="\/email-logo-white\.png" alt="Mindful Beginnings">/);
  assert.match(orgPage, /<img src="\/email-logo-white\.png" alt="Mindful Beginnings">/);
  assert.match(hostPage, /<div class="tag">Host a private group course<\/div>/);
  assert.match(orgPage, /<div class="tag">Organization site information<\/div>/);
  assert.doesNotMatch(hostPage, /class="brand"/);
  assert.doesNotMatch(orgPage, /class="brand"/);
  assert.doesNotMatch(hostPage, /email-logo\.png/);
  assert.doesNotMatch(orgPage, /email-logo\.png/);
  assert.doesNotMatch(intakeCss, /border-radius:\s*50%/);
  assert.match(intakeCss, /width:min\(320px,86vw\)/);
});

test('host course choices on the page match the catalog, and organizations are sent to the other form', () => {
  model.coursesFor('host').forEach(function (course) {
    assert.match(hostPage, new RegExp('value="' + course.key + '"'));
    assert.match(hostPage, new RegExp(model.courseOptionLabel(course).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  });
  assert.match(hostPage, /organization\.html/);
  assert.match(hostPage, /one free registration/i);
  assert.doesNotMatch(hostPage, /Organizations: please use this form/i);
  assert.match(register, /host\.html/);
  assert.match(register, /organization\.html/);
  assert.match(register, /Need help finding a class\? <a href="mailto:lindsay@mindfulbeginnings\.org">Contact us<\/a>\./);
});

test('organization course choices match the catalog, including Girl Scout badge and four billing options', () => {
  model.coursesFor('organization').forEach(function (course) {
    assert.match(orgPage, new RegExp('value="' + course.key + '"'));
  });
  assert.match(orgPage, /href="https:\/\/mindfulbeginnings\.org\/girl-scouts"/);
  assert.match(orgPage, />https:\/\/mindfulbeginnings\.org\/girl-scouts</);
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
  assert.match(draft.body, /completely free/);
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
  const externalDraft = model.buildDraft(fullExternal, externalPlan.row);
  assert.match(externalDraft.body, /no family payment link/i);
  assert.doesNotMatch(externalDraft.body, /register\.html\?code=/);

  const link = model.normalizeSubmission(orgBody({ billing: 'org_full_link' }));
  const linkDraft = model.buildDraft(link, model.buildSessionRow(link, []).row);
  assert.match(linkDraft.body, /private link at no charge/i);
  assert.match(linkDraft.body, /register\.html\?code=SS-261102/);

  const individual = model.normalizeSubmission(orgBody({ billing: 'individual' }));
  const individualPlan = model.buildSessionRow(individual, []);
  assert.equal(individualPlan.row.price_override, null);
  assert.equal(individualPlan.row.bill_to_org, null);
  assert.equal(individualPlan.row.org_portion, null);
  assert.equal(individualPlan.row.is_private, true);
  assert.match(model.buildDraft(individual, individualPlan.row).body, /\$225 per participant/);

  const split = model.normalizeSubmission(orgBody({ billing: 'split', portionText: '$25' }));
  const splitPlan = model.buildSessionRow(split, []);
  assert.equal(splitPlan.row.price_override, 200);
  assert.equal(splitPlan.row.org_portion, 25);
  assert.equal(splitPlan.row.bill_to_org, 'Congregation Beth El');
  assert.match(model.buildDraft(split, splitPlan.row).body, /\$200/);
  assert.match(model.buildDraft(split, splitPlan.row).body, /\$25 per participant/);

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

test('checklist starts at received, advances only when Lindsay marks a step, and never marks the email sent on its own', () => {
  const fresh = model.checklistAfterSubmit(true, true);
  assert.equal(fresh.checklist.received, true);
  assert.equal(fresh.checklist.session_created, true);
  assert.equal(fresh.checklist.draft_ready, true);
  assert.equal(fresh.checklist.email_sent, false);
  assert.equal(fresh.checklist.instructor_claimed, false);
  assert.equal(fresh.status, 'draft_ready');

  const waiting = model.checklistAfterSubmit(false, true);
  assert.equal(waiting.status, 'received');
  assert.equal(waiting.checklist.draft_ready, true);

  const sent = model.applyChecklistUpdate(fresh.checklist, { email_sent: true });
  assert.equal(sent.status, 'instructor_open');
  assert.equal(sent.checklist.email_sent, true);

  const claimed = model.applyChecklistUpdate(sent.checklist, { instructor_claimed: true });
  assert.equal(claimed.status, 'instructor_claimed');

  const done = model.applyChecklistUpdate(claimed.checklist, { done: true });
  assert.equal(done.status, 'done');

  const archived = model.applyChecklistUpdate(done.checklist, { archived: true });
  assert.equal(archived.status, 'archived');
  assert.equal(archived.checklist.done, true);

  const locked = model.applyChecklistUpdate(fresh.checklist, { received: false, email_sent: true });
  assert.equal(locked.checklist.received, true);

  const reopened = model.applyChecklistUpdate(archived.checklist, { archived: false });
  assert.equal(reopened.status, 'done');
});

test('ADMIN lists the checklist and keeps the email-sent step manual', () => {
  assert.match(admin, /id="screen-requests"/);
  assert.match(admin, /id="nav-requests"/);
  assert.match(admin, /class_requests/);
  assert.match(admin, /migrations\/class_requests\.sql/);
  const html = adminUi.renderList([{
    id: 'req-1',
    kind: 'host',
    status: 'draft_ready',
    submitter_name: 'Jane Host',
    course: 'Safe Sitter®',
    session_id: 'sess-1',
    session_code: 'SS-261102',
    draft_subject: 'Hosting your Safe Sitter® course',
    draft_body: 'Hi Jane',
    draft_to: 'jane@example.com',
    checklist: model.checklistAfterSubmit(true, true).checklist,
    payload: hostBody(),
    created_at: '2026-10-05T12:00:00Z'
  }], 'open', [{ id: 'sess-1', instructorId: null }]);
  assert.match(html, /Session created in ADMIN/);
  assert.match(html, /Confirmation email drafted/);
  assert.match(html, /Email sent/);
  assert.match(html, /Instructor claimed/);
  assert.match(html, /Open confirmation draft/);
  assert.match(html, /SS-261102/);
  assert.equal(adminUi.openCount([{ checklist: { done: false, archived: false } }, { checklist: { done: true } }]), 1);
  assert.match(migration, /enable row level security/i);
  assert.match(migration, /revoke all on table public\.class_requests from public, anon/i);
  assert.doesNotMatch(outlookSrc, /sendMail/);
});

test('submit stores the request, creates the session, keeps the confirmation a draft, and notifies only Lindsay', async () => {
  const saved = [];
  const sessions = [];
  const notices = [];
  const drafts = [];
  const result = await submitClassRequest(orgBody(), {
    listSessionCodes: async function () { return ['SS-261030']; },
    insertSession: async function (row) { sessions.push(row); return row; },
    insertRequest: async function (row) { saved.push(row); return row; },
    updateRequest: async function () { return {}; },
    createOutlookDraft: async function (draft) { drafts.push(draft); return { created: false, reason: 'missing_credentials' }; },
    notifyLindsay: async function (record) { notices.push(record); return { sent: false, reason: 'missing_credentials' }; }
  });
  assert.equal(result.status, 200);
  assert.equal(result.body.sessionCreated, true);
  assert.equal(result.body.outlookDraftCreated, false);
  assert.equal(result.body.draftStored, true);
  assert.equal(sessions[0].code, 'SS-261102');
  assert.equal(sessions[0].is_private, true);
  assert.equal(sessions[0].price_override, 0);
  assert.equal(sessions[0].extra_dates.length, 1);
  assert.equal(saved[0].checklist.email_sent, false);
  assert.equal(saved[0].checklist.draft_ready, true);
  assert.equal(saved[0].status, 'draft_ready');
  assert.equal(drafts[0].to, 'alex@example.org');
  assert.match(drafts[0].body, /Warmly/);
  assert.equal(notices.length, 1);

  const skipped = await submitClassRequest(orgBody({ billing: 'split', portionText: 'call me' }), {
    listSessionCodes: async function () { return []; },
    insertSession: async function () { throw new Error('should not create a session'); },
    insertRequest: async function (row) { return row; },
    createOutlookDraft: async function () { return { created: false, reason: 'missing_credentials' }; },
    notifyLindsay: async function () { return { sent: false, reason: 'missing_credentials' }; }
  });
  assert.equal(skipped.status, 200);
  assert.equal(skipped.body.sessionCreated, false);
  assert.equal(skipped.body.sessionSkippedReason, 'billing');
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
