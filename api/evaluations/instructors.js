'use strict';

// Public instructor name list for the course evaluation form.
// GET /api/evaluations/instructors -> { instructors: ["Name One", ...] }
//
// Auth: none. Names only — the same names already appear on the public
// About page. Reads with the service role so the anon key needs no access
// to the instructors table.

const { sendJson, preflight } = require('../../lib/http');
const { supabaseConfig } = require('../../lib/class-request-submit-config');

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const cfg = supabaseConfig();
    if (!cfg.configured) return sendJson(res, 503, { error: 'Not configured' });
    const key = cfg.serviceKey;
    const headers = { Accept: 'application/json' };
    headers['apikey'] = key;
    headers['Authorization'] = 'Bearer ' + key;
    const r = await fetch(
      cfg.url + '/rest/v1/instructors?select=name&or=(is_active.is.true,is_active.is.null)&archived_at=is.null&order=name.asc',
      { headers: headers }
    );
    if (!r.ok) throw new Error('fetch failed');
    const rows = await r.json();
    const names = (rows || []).map(function (x) { return String(x.name || '').trim(); }).filter(Boolean);
    sendJson(res, 200, { instructors: names });
  } catch (err) {
    sendJson(res, 502, { error: 'Could not load instructors' });
  }
};
