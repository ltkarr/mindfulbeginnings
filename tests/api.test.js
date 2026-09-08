'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

function mockRes() {
  const r = { statusCode: 0, headers: {}, body: '' };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.end = (b) => { r.body = b || ''; };
  return r;
}

test('GET /api/paypal/config reports unconfigured without secrets', async () => {
  delete process.env.PAYPAL_CLIENT_ID;
  delete process.env.PAYPAL_CLIENT_SECRET;
  const handler = require('../api/paypal/config');
  const res = mockRes();
  await handler({ method: 'GET', headers: {} }, res);
  assert.equal(res.statusCode, 200);
  const body = JSON.parse(res.body);
  assert.equal(body.configured, false);
  assert.equal(body.clientId, '');
});

test('POST /api/paypal/create-order rejects a zero amount', async () => {
  process.env.PAYPAL_CLIENT_ID = 'test-id';
  process.env.PAYPAL_CLIENT_SECRET = 'test-secret';
  const handler = require('../api/paypal/create-order');
  const req = {
    method: 'POST',
    headers: {},
    on(ev, cb) {
      if (ev === 'data') cb(Buffer.from(JSON.stringify({ amount: 0, registrationId: '' })));
      if (ev === 'end') cb();
    }
  };
  const res = mockRes();
  await handler(req, res);
  assert.equal(res.statusCode, 400);
  const body = JSON.parse(res.body);
  assert.match(body.error || '', /valid amount/i);
});
