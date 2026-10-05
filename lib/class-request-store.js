'use strict';

const { supabaseConfig } = require('./class-request-submit-config');

function notConfigured() {
  const err = new Error('SUPABASE_SERVICE_ROLE_KEY is not set — the class request was not saved');
  err.status = 503;
  err.code = 'supabase_unconfigured';
  return err;
}

async function rest(path, { method, body, headers } = {}) {
  const cfg = supabaseConfig();
  if (!cfg.configured) throw notConfigured();
  const res = await fetch(cfg.url + '/rest/v1/' + path.replace(/^\//, ''), {
    method: method || 'GET',
    headers: Object.assign({
      apikey: cfg.serviceKey,
      Authorization: 'Bearer ' + cfg.serviceKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation'
    }, headers || {}),
    body: body == null ? undefined : JSON.stringify(body)
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error((json && (json.message || json.hint || json.details)) || ('Supabase ' + res.status));
    err.status = res.status >= 500 ? 502 : 400;
    err.details = json;
    throw err;
  }
  return json;
}

async function listSessionCodes() {
  const rows = await rest('sessions?select=code', { method: 'GET' });
  return (rows || []).map(function (r) { return r.code; }).filter(Boolean);
}

async function insertSession(row) {
  const rows = await rest('sessions', { method: 'POST', body: row });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function insertRequest(row) {
  const rows = await rest('class_requests', { method: 'POST', body: row });
  return Array.isArray(rows) ? rows[0] : rows;
}

async function updateRequest(id, patch) {
  const rows = await rest('class_requests?id=eq.' + encodeURIComponent(id), { method: 'PATCH', body: patch });
  return Array.isArray(rows) ? rows[0] : rows;
}

module.exports = {
  listSessionCodes: listSessionCodes,
  insertSession: insertSession,
  insertRequest: insertRequest,
  updateRequest: updateRequest
};
