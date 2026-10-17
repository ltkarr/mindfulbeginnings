'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const cron = require('../api/cron/post-course-drafts.js');
const outlook = require('../lib/outlook-draft.js');
const drafts = require('../js/post-course-emails.js');

const EM_DASH = /\u2014/;

// ---------------------------------------------------------------------------
// End-time parsing
// ---------------------------------------------------------------------------

test('parseEndMinutes handles common time-range formats', () => {
  assert.equal(cron.parseEndMinutes('9:00 AM - 12:00 PM'), 12 * 60);
  assert.equal(cron.parseEndMinutes('9 AM - 12 PM'), 12 * 60);
  assert.equal(cron.parseEndMinutes('1:00 PM - 3:30 PM'), 15 * 60 + 30);
  assert.equal(cron.parseEndMinutes('10:00 AM - 1:00 PM'), 13 * 60);
  assert.equal(cron.parseEndMinutes('6:00 PM - 8:00 PM'), 20 * 60);
  assert.equal(cron.parseEndMinutes('12:00 PM - 2:00 PM'), 14 * 60);
  assert.equal(cron.parseEndMinutes('12:00 AM - 1:00 AM'), 60);
  assert.equal(cron.parseEndMinutes('9:00 a.m. - 11:00 a.m.'), 11 * 60);
});

test('parseEndMinutes returns null when no usable time', () => {
  assert.equal(cron.parseEndMinutes(null), null);
  assert.equal(cron.parseEndMinutes(''), null);
  assert.equal(cron.parseEndMinutes('TBD'), null);
  assert.equal(cron.parseEndMinutes('morning'), null);
});

test('classHasEnded respects ET end times', () => {
  // Noon ET on 2026-10-17.
  const nowMs = cron.etWallToUtcMs('2026-10-17', 12 * 60);
  // Yesterday's noon-ending class is done.
  assert.ok(cron.classHasEnded({ date: '2026-10-16', time: '9:00 AM - 12:00 PM' }, nowMs));
  // Today's class ending at 4pm ET has not ended yet.
  assert.ok(!cron.classHasEnded({ date: '2026-10-17', time: '2:00 PM - 4:00 PM' }, nowMs));
  // Today's class ending at 10am ET has ended.
  assert.ok(cron.classHasEnded({ date: '2026-10-17', time: '9:00 AM - 10:00 AM' }, nowMs));
  // Tomorrow's class has not ended.
  assert.ok(!cron.classHasEnded({ date: '2026-10-18', time: '9:00 AM - 12:00 PM' }, nowMs));
  // No time recorded: treated as 11:59pm ET that day, so two days ago is done.
  assert.ok(cron.classHasEnded({ date: '2026-10-15', time: '' }, nowMs));
  // No date means we cannot tell: never treat as ended.
  assert.ok(!cron.classHasEnded({ date: '', time: '9:00 AM - 12:00 PM' }, nowMs));
});

// ---------------------------------------------------------------------------
// Watermark skip logic
// ---------------------------------------------------------------------------

test('isDraftCandidate skips watermarked and future sessions', () => {
  const nowMs = cron.etWallToUtcMs('2026-10-17', 12 * 60);
  const done = { 'sess-old': true };
  assert.ok(cron.isDraftCandidate({ id: 's1', date: '2026-10-16', time: '9:00 AM - 12:00 PM' }, done, nowMs));
  assert.ok(!cron.isDraftCandidate({ id: 'sess-old', date: '2026-10-16', time: '9:00 AM - 12:00 PM' }, done, nowMs));
  assert.ok(!cron.isDraftCandidate({ id: 's2', date: '2026-10-18', time: '9:00 AM - 12:00 PM' }, done, nowMs));
  assert.ok(!cron.isDraftCandidate({ id: '', date: '2026-10-16', time: '9:00 AM - 12:00 PM' }, done, nowMs));
  assert.ok(!cron.isDraftCandidate(null, done, nowMs));
});

// ---------------------------------------------------------------------------
// Email extraction
// ---------------------------------------------------------------------------

test('extractParticipantEmails dedupes, lowercases, validates', () => {
  const regs = [
    { contact: 'Mom@Example.com', pay_status: 'paid' },
    { contact: 'mom@example.com', pay_status: 'paid' },
    { contact: 'dad@example.com / 555-1234', pay_status: 'unpaid' },
    { contact: 'waiter@example.com', pay_status: 'waitlist' },
    { contact: 'cancelled@example.com', pay_status: 'cancelled' },
    { contact: 'not an email', pay_status: 'paid' },
    { contact: 'x@y', pay_status: 'paid' },
    { contact: '', pay_status: 'paid' },
    { contact: null, pay_status: 'paid' },
    { contact: '  GRANDMA@EXAMPLE.COM  ', pay_status: 'host' }
  ];
  assert.deepEqual(cron.extractParticipantEmails(regs),
    ['mom@example.com', 'dad@example.com', 'grandma@example.com']);
});

test('extractParticipantEmails returns empty for no valid contacts', () => {
  assert.deepEqual(cron.extractParticipantEmails([]), []);
  assert.deepEqual(cron.extractParticipantEmails(null), []);
  assert.deepEqual(cron.extractParticipantEmails([{ contact: 'n/a', pay_status: 'paid' }]), []);
});

// ---------------------------------------------------------------------------
// Draft module: links embedded, fallback exists
// ---------------------------------------------------------------------------

test('postCourseDraftFor embeds review and evaluation links', () => {
  const d = drafts.postCourseDraftFor('Safe Sitter®');
  assert.ok(d.subject);
  assert.ok(d.bodyHtml.includes('https://g.page/r/Ca2jsWW-MkfvEAE/review'));
  assert.ok(d.bodyHtml.includes('https://mindfulbeginnings.org/course-evaluation.html'));
  assert.ok(d.bodyHtml.includes('Lindsay Karr'));
  assert.ok(!EM_DASH.test(d.bodyHtml), 'no em dashes in draft html');
});

test('postCourseDraftFor falls back to a generic draft for unknown courses', () => {
  const d = drafts.postCourseDraftFor('Some Course That Does Not Exist 123');
  assert.ok(d && d.subject, 'generic fallback has a subject');
  assert.ok(d.bodyHtml.includes('course-evaluation.html'));
});

test('genericFallbackDraft has both links and no em dashes', () => {
  const d = cron.genericFallbackDraft('Mystery Course');
  assert.ok(d.subject.includes('Mindful Beginnings'));
  assert.ok(d.bodyHtml.includes('https://g.page/r/Ca2jsWW-MkfvEAE/review'));
  assert.ok(d.bodyHtml.includes('https://mindfulbeginnings.org/course-evaluation.html'));
  assert.ok(d.bodyHtml.includes('Lindsay Karr'));
  assert.ok(!EM_DASH.test(d.subject + d.bodyHtml), 'no em dashes in fallback');
});

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

const sampleDraft = {
  subject: 'Thank you for a great class',
  body: 'Hi there,\n\nThanks for coming.',
  bodyHtml: '<p>Hi there,</p><p>Thanks for coming.</p><p>Warmly,<br>Lindsay Karr, M.Ed. | Founder, Mindful Beginnings</p>'
};

test('buildPostCourseHtml wraps content with brand, links, and signoff', () => {
  const html = cron.buildPostCourseHtml(sampleDraft, { course: 'Safe Sitter®', date: '2026-10-16' }, ['a@b.com']);
  assert.ok(html.includes('#1E3161'), 'navy header');
  assert.ok(html.includes('#C7A24A'), 'gold accent');
  assert.ok(html.includes('Mindful Beginnings'));
  assert.ok(html.includes('https://g.page/r/Ca2jsWW-MkfvEAE/review'), 'review button link');
  assert.ok(html.includes('https://mindfulbeginnings.org/course-evaluation.html'), 'evaluation button link');
  assert.ok(html.includes('Leave a Google Review'), 'review button label');
  assert.ok(html.includes('Complete Our Program Evaluation'), 'evaluation button label');
  assert.ok(html.includes('Lindsay Karr, M.Ed. | Founder, Mindful Beginnings'), 'signoff');
  assert.ok(html.includes('Safe Sitter®'), 'course line');
  assert.ok(!html.includes('No participant emails were found'), 'no warning when emails exist');
  assert.ok(!EM_DASH.test(html), 'no em dashes in output');
});

test('buildPostCourseHtml warns visibly when no participant emails', () => {
  const html = cron.buildPostCourseHtml(sampleDraft, { course: 'Safe Sitter®', date: '2026-10-16' }, []);
  assert.ok(html.includes('No participant emails were found for this session'), 'visible note');
  assert.ok(html.includes('add recipients before sending'), 'instruction');
  assert.ok(!EM_DASH.test(html), 'no em dashes in output');
});

// ---------------------------------------------------------------------------
// createOutlookDraft: bcc + htmlBody, backward compatible
// ---------------------------------------------------------------------------

function mockGraph(captured) {
  return async function (url, opts) {
    captured.push({ url, opts });
    if (url.includes('login.microsoftonline.com')) {
      return { ok: true, json: async () => ({ access_token: 'tok' }) };
    }
    return { ok: true, json: async () => ({ id: 'draft-1', webLink: 'https://x' }) };
  };
}

const mockEnv = {
  configured: true,
  tenant: 't', clientId: 'c', clientSecret: 's', mailbox: 'lindsay@mindfulbeginnings.org'
};

test('createOutlookDraft stays backward compatible with text body', async () => {
  const captured = [];
  const r = await outlook.createOutlookDraft(
    { to: 'a@b.com', subject: 'Hi', body: 'hello' },
    { env: mockEnv, fetch: mockGraph(captured) });
  assert.ok(r.created);
  const msg = captured.find((c) => c.url.includes('/messages'));
  const payload = JSON.parse(msg.opts.body);
  assert.equal(payload.body.contentType, 'Text');
  assert.equal(payload.body.content, 'hello');
  assert.deepEqual(payload.toRecipients, [{ emailAddress: { address: 'a@b.com' } }]);
  assert.ok(!('bccRecipients' in payload), 'no bcc key when none given');
  assert.ok(!msg.url.includes('sendMail'), 'creates a draft, never sends');
});

test('createOutlookDraft sends HTML with BCC recipients', async () => {
  const captured = [];
  const r = await outlook.createOutlookDraft(
    { to: 'lindsay@mindfulbeginnings.org', subject: 'Thanks', htmlBody: '<p>Hi</p>', bcc: ['a@b.com', 'c@d.com'] },
    { env: mockEnv, fetch: mockGraph(captured) });
  assert.ok(r.created);
  assert.equal(r.id, 'draft-1');
  const msg = captured.find((c) => c.url.includes('/messages'));
  const payload = JSON.parse(msg.opts.body);
  assert.equal(payload.body.contentType, 'HTML');
  assert.equal(payload.body.content, '<p>Hi</p>');
  assert.deepEqual(payload.bccRecipients,
    [{ emailAddress: { address: 'a@b.com' } }, { emailAddress: { address: 'c@d.com' } }]);
  assert.ok(!msg.url.includes('sendMail'), 'creates a draft, never sends');
});

test('createOutlookDraft rejects incomplete drafts', async () => {
  const captured = [];
  const r1 = await outlook.createOutlookDraft({ to: 'a@b.com', subject: 'Hi' }, { env: mockEnv, fetch: mockGraph(captured) });
  assert.equal(r1.created, false);
  assert.equal(captured.length, 0, 'no Graph call on incomplete draft');
  const r2 = await outlook.createOutlookDraft({ subject: 'Hi', body: 'x' }, { env: mockEnv, fetch: mockGraph(captured) });
  assert.equal(r2.created, false);
});
