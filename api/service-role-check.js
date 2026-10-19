'use strict';

// GET-only proof that production has a working service-role key.
// Never returns the key, a JWT role, or any row from the database.

const { sendJson } = require('../lib/http');

const DEFAULT_URL = 'https://evninlytzhtacanrguhx.supabase.co';

function jwtRole(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) return null;
  try {
    const json = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!json || typeof json !== 'object') return false;
    return typeof json.role === 'string' ? json.role : '';
  } catch (e) {
    return false;
  }
}

module.exports = async function handler(req, res) {
  if (!req || req.method !== 'GET') {
    return sendJson(res, 405, { ok: false, reason: 'method' });
  }
  const key = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!key) return sendJson(res, 503, { ok: false, reason: 'missing' });
  const role = jwtRole(key);
  if (role === false || (role && role !== 'service_role')) {
    return sendJson(res, 503, { ok: false, reason: 'not_service_role' });
  }
  const url = String(process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || DEFAULT_URL).replace(/\/+$/, '');
  let upstream;
  try {
    upstream = await fetch(url + '/rest/v1/registrations?select=id&limit=1', {
      method: 'GET',
      headers: {
        apikey: key,
        Authorization: 'Bearer ' + key,
        Accept: 'application/json',
      },
    });
    await upstream.text();
  } catch (e) {
    return sendJson(res, 503, { ok: false, reason: 'unreachable' });
  }
  if (upstream.status === 200 || upstream.status === 206) {
    return sendJson(res, 200, { ok: true });
  }
  return sendJson(res, 503, { ok: false, reason: 'rejected', status: upstream.status });
};
