'use strict';

// Tests for POST /api/notify-instructor-cancelled — the automatic instructor
// email Lindsay triggers by cancelling a session in the admin. Only the
// auth/config rejections are tested here; the live EmailJS + Supabase path
// needs real credentials.

const test = require('node:test');
const assert = require('node:assert/strict');

function mockRes() {
  const r = { statusCode: 0, headers: {}, body: '' };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.end = (b) => { r.body = b || ''; };
  return r;
}

function loadHandler() {
  delete require.cache[require.resolve('../api/notify-instructor-cancelled')];
  return require('../api/notify-instructor-cancelled');
}

function postReq(body, bearer) {
  const headers = {};
  if (bearer) headers.authorization = 'Bearer ' + bearer;
  return {
    method: 'POST',
    headers,
    async *[Symbol.asyncIterator]() {
      yield Buffer.from(JSON.stringify(body || {}));
    },
  };
}

test('non-POST is rejected', async () => {
  const handler = loadHandler();
  const res = mockRes();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 405);
});

test('missing bearer token is unauthorized', async () => {
  const handler = loadHandler();
  const res = mockRes();
  await handler(postReq({ session_id: 'abc' }), res);
  assert.equal(res.statusCode, 401);
});

test('missing session_id is a bad request (after auth stub)', async () => {
  // verifyAdmin calls the Supabase Auth API; stub fetch to return an admin user.
  const realFetch = global.fetch;
  global.fetch = async (url) => ({
    ok: String(url).includes('/auth/v1/user'),
    json: async () => ({ email: 'lindsay@mindfulbeginnings.org' }),
  });
  try {
    const handler = loadHandler();
    const res = mockRes();
    await handler(postReq({}, 'fake-jwt'), res);
    assert.equal(res.statusCode, 400);
    assert.match(JSON.parse(res.body).error, /session_id/);
  } finally {
    global.fetch = realFetch;
  }
});

test('route refuses to send when the cancellation template is not configured', async () => {
  const realFetch = global.fetch;
  global.fetch = async (url) => ({
    ok: String(url).includes('/auth/v1/user'),
    json: async () => ({ email: 'lindsay@mindfulbeginnings.org' }),
  });
  delete process.env.EMAILJS_TEMPLATE_CANCELLATION;
  process.env.EMAILJS_PRIVATE_KEY = 'test-key';
  try {
    const handler = loadHandler();
    const res = mockRes();
    await handler(postReq({ session_id: 'abc' }, 'fake-jwt'), res);
    assert.equal(res.statusCode, 500);
    assert.match(JSON.parse(res.body).error, /not configured/);
  } finally {
    global.fetch = realFetch;
    delete process.env.EMAILJS_PRIVATE_KEY;
  }
});

test('admin.html auto-sends the instructor email after a successful cancel', () => {
  const fs = require('fs');
  const path = require('path');
  const admin = fs.readFileSync(path.join(__dirname, '..', 'admin.html'), 'utf8');
  assert.match(admin, /sendInstructorCancellationEmail\(id\)/);
  assert.match(admin, /fetch\('\/api\/notify-instructor-cancelled'/);
  // On success only the family pane opens; on failure the instructor pane
  // opens too so Lindsay can still send it manually.
  assert.match(admin, /openCancellationEmails\(id,instructorNotified\)/);
  assert.match(admin, /function openCancellationEmails\(sessId,instructorAlreadyNotified\)/);
});

test('cancellation setup doc exists with the template variables', () => {
  const fs = require('fs');
  const path = require('path');
  const doc = fs.readFileSync(path.join(__dirname, '..', 'docs/cancellation-notify-setup.md'), 'utf8');
  assert.match(doc, /EMAILJS_TEMPLATE_CANCELLATION/);
  assert.match(doc, /\{\{instructor_email\}\}/);
  assert.match(doc, /\{\{cancel_reason\}\}/);
});
