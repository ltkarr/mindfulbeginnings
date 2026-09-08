'use strict';

const { canMarkPaid, isTerminalPaidStatus, paidNotesLine, parseMoney } = require('./payment-utils');

function supabaseConfig() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://evninlytzhtacanrguhx.supabase.co').replace(/\/+$/, '');
  const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  return { url, serviceKey, configured: !!(url && serviceKey) };
}

async function supabaseRest(path, { method = 'GET', body, headers } = {}) {
  const { url, serviceKey, configured } = supabaseConfig();
  if (!configured) {
    const err = new Error('SUPABASE_SERVICE_ROLE_KEY is not set — payment captured but registration was not marked paid');
    err.status = 503;
    err.code = 'supabase_unconfigured';
    throw err;
  }
  const res = await fetch(url + '/rest/v1/' + path.replace(/^\//, ''), {
    method,
    headers: {
      apikey: serviceKey,
      Authorization: 'Bearer ' + serviceKey,
      'Content-Type': 'application/json',
      Prefer: 'return=representation',
      ...headers
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch (e) { json = { raw: text }; }
  if (!res.ok) {
    const err = new Error((json && (json.message || json.hint || json.details)) || ('Supabase ' + res.status));
    err.status = res.status;
    err.details = json;
    throw err;
  }
  return json;
}

async function loadRegistration(id) {
  const rows = await supabaseRest('registrations?id=eq.' + encodeURIComponent(id) + '&select=id,pay_status,paypal_tx_id,price_paid,notes,student_name');
  return Array.isArray(rows) && rows[0] ? rows[0] : null;
}

/**
 * Mark a pending/unpaid registration as paid after a successful PayPal capture.
 * Never demotes host / in_kind / already-paid rows.
 */
async function markRegistrationPaid({ registrationId, captureId, amount }) {
  const id = String(registrationId || '').trim();
  if (!id) return { ok: true, skipped: true, reason: 'no_registration' };

  const row = await loadRegistration(id);
  if (!row) return { ok: false, skipped: true, reason: 'not_found' };

  const amt = parseMoney(amount);
  if (row.paypal_tx_id && captureId && row.paypal_tx_id === captureId) {
    return { ok: true, already: true, registration: row };
  }
  if (isTerminalPaidStatus(row.pay_status)) {
    return { ok: true, already: true, reason: 'already_' + String(row.pay_status).toLowerCase(), registration: row };
  }
  if (!canMarkPaid(row.pay_status)) {
    return { ok: false, skipped: true, reason: 'status_' + row.pay_status, registration: row };
  }

  const patch = {
    pay_status: 'paid',
    paypal_tx_id: captureId || row.paypal_tx_id || null,
    notes: paidNotesLine({ captureId, amount: amt, existingNotes: row.notes })
  };
  if (amt != null) patch.price_paid = amt;

  const updated = await supabaseRest('registrations?id=eq.' + encodeURIComponent(id), {
    method: 'PATCH',
    body: patch
  });
  return { ok: true, registration: Array.isArray(updated) ? updated[0] : patch };
}

module.exports = {
  supabaseConfig,
  loadRegistration,
  markRegistrationPaid
};
