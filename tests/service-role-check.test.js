'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

function mockRes() {
  const r = { statusCode: 0, headers: {}, body: '' };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.end = (b) => { r.body = b || ''; };
  return r;
}

function jwt(payload) {
  const b64 = (obj) => Buffer.from(JSON.stringify(obj)).toString('base64url');
  return b64({ alg: 'none', typ: 'JWT' }) + '.' + b64(payload) + '.sig';
}

function loadHandler() {
  delete require.cache[require.resolve('../api/service-role-check')];
  return require('../api/service-role-check');
}

test('service-role check stays GET-only and never echoes the key or row data', async (t) => {
  const prevKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const prevUrl = process.env.SUPABASE_URL;
  const prevFetch = global.fetch;
  const source = fs.readFileSync(path.join(__dirname, '..', 'api', 'service-role-check.js'), 'utf8');
  assert.doesNotMatch(source, /console\./);

  t.after(() => {
    if (prevKey == null) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevKey;
    if (prevUrl == null) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevUrl;
    global.fetch = prevFetch;
  });

  async function call(method) {
    const handler = loadHandler();
    const res = mockRes();
    await handler({ method, headers: {} }, res);
    return res;
  }

  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  let fetched = false;
  global.fetch = async () => { fetched = true; return { status: 200, text: async () => '[]' }; };
  let res = await call('GET');
  assert.equal(res.statusCode, 503);
  assert.deepEqual(JSON.parse(res.body), { ok: false, reason: 'missing' });
  assert.equal(fetched, false);

  res = await call('POST');
  assert.equal(res.statusCode, 405);
  assert.equal(JSON.parse(res.body).reason, 'method');
  assert.equal(fetched, false);

  process.env.SUPABASE_SERVICE_ROLE_KEY = jwt({ role: 'anon' });
  res = await call('GET');
  assert.equal(res.statusCode, 503);
  assert.deepEqual(JSON.parse(res.body), { ok: false, reason: 'not_service_role' });
  assert.equal(fetched, false);
  assert.equal(res.body.includes(process.env.SUPABASE_SERVICE_ROLE_KEY), false);

  process.env.SUPABASE_SERVICE_ROLE_KEY = 'aaa.not-json.bbb';
  res = await call('GET');
  assert.equal(res.statusCode, 503);
  assert.equal(JSON.parse(res.body).reason, 'not_service_role');
  assert.equal(fetched, false);

  const serviceKey = jwt({ role: 'service_role', ref: 'evninlytzhtacanrguhx' });
  process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
  process.env.SUPABASE_URL = 'https://example.supabase.co';
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, opts });
    return {
      status: 200,
      text: async () => JSON.stringify([{ id: 'row-1', email: 'secret-parent@example.com', token: serviceKey }]),
    };
  };
  res = await call('GET');
  assert.equal(res.statusCode, 200);
  assert.deepEqual(JSON.parse(res.body), { ok: true });
  assert.equal(res.body.includes(serviceKey), false);
  assert.equal(res.body.includes('secret-parent@example.com'), false);
  assert.equal(res.body.includes('row-1'), false);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://example.supabase.co/rest/v1/registrations?select=id&limit=1');
  assert.equal(calls[0].opts.method, 'GET');
  assert.equal(calls[0].opts.headers.apikey, serviceKey);
  assert.equal(calls[0].opts.headers.Authorization, 'Bearer ' + serviceKey);

  global.fetch = async () => ({ status: 401, text: async () => '{"message":"JWT failed"}' });
  res = await call('GET');
  assert.equal(res.statusCode, 503);
  assert.deepEqual(JSON.parse(res.body), { ok: false, reason: 'rejected', status: 401 });
  assert.equal(res.body.includes('JWT'), false);

  global.fetch = async () => { throw new Error('network down ' + serviceKey); };
  res = await call('GET');
  assert.equal(res.statusCode, 503);
  assert.deepEqual(JSON.parse(res.body), { ok: false, reason: 'unreachable' });
  assert.equal(res.body.includes(serviceKey), false);

  process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_example';
  calls.length = 0;
  global.fetch = async (url) => {
    calls.push(url);
    return { status: 200, text: async () => '[]' };
  };
  res = await call('GET');
  assert.equal(res.statusCode, 200);
  assert.equal(calls.length, 1);
  assert.equal(res.body.includes('sb_secret_example'), false);
});
