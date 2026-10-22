'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { confirmRequester } = require('../lib/class-request-confirm');

function mockFetch(calls) {
  return async function (url, opts) {
    calls.push({ url: url, body: JSON.parse(opts.body) });
    return { ok: true, text: async function () { return ''; } };
  };
}

test('confirmation email goes to the requester via EmailJS', async function () {
  process.env.EMAILJS_TEMPLATE_REQUEST_CONFIRM = 'tmpl_confirm';
  process.env.EMAILJS_PRIVATE_KEY = 'pk';
  const calls = [];
  const result = await confirmRequester(
    { submitter_name: 'Jane Doe', submitter_email: 'jane@example.com', course: "Babysitter's Training", kind: 'host' },
    { fetch: mockFetch(calls) }
  );
  assert.equal(result.sent, true);
  assert.equal(calls.length, 1);
  const params = calls[0].body.template_params;
  assert.equal(params.to_email, 'jane@example.com');
  assert.equal(params.submitter_name, 'Jane Doe');
  assert.equal(params.course, "Babysitter's Training");
  assert.equal(calls[0].body.template_id, 'tmpl_confirm');
  delete process.env.EMAILJS_TEMPLATE_REQUEST_CONFIRM;
  delete process.env.EMAILJS_PRIVATE_KEY;
});

test('confirmation skips gracefully without a template configured', async function () {
  delete process.env.EMAILJS_TEMPLATE_REQUEST_CONFIRM;
  const calls = [];
  const result = await confirmRequester(
    { submitter_name: 'Jane', submitter_email: 'jane@example.com', course: 'Safe@Home', kind: 'host' },
    { fetch: mockFetch(calls) }
  );
  assert.equal(result.sent, false);
  assert.equal(calls.length, 0);
});

test('confirmation skips gracefully without a recipient email', async function () {
  process.env.EMAILJS_TEMPLATE_REQUEST_CONFIRM = 'tmpl_confirm';
  process.env.EMAILJS_PRIVATE_KEY = 'pk';
  const calls = [];
  const result = await confirmRequester(
    { submitter_name: 'Jane', submitter_email: '', course: 'Safe@Home', kind: 'host' },
    { fetch: mockFetch(calls) }
  );
  assert.equal(result.sent, false);
  assert.equal(calls.length, 0);
  delete process.env.EMAILJS_TEMPLATE_REQUEST_CONFIRM;
  delete process.env.EMAILJS_PRIVATE_KEY;
});
