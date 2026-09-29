'use strict';

const { canMarkPaid, isTerminalPaidStatus, paypalCapturePatch, parseMoney } = require('./payment-utils');

function isMissingPaymentColumnError(err) {
  const msg = String((err && (err.message || err.details || err.hint)) || '').toLowerCase();
  return msg.includes('payment_method') || msg.includes('payment_ref') || msg.includes('payment_detail')
    || (err && err.code === 'PGRST204' && msg.includes('payment'));
}

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
  const base = 'id,pay_status,paypal_tx_id,price_paid,notes,student_name';
  const withMethod = base + ',payment_method,payment_ref,payment_detail';
  try {
    const rows = await supabaseRest('registrations?id=eq.' + encodeURIComponent(id) + '&select=' + withMethod);
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  } catch (err) {
    if (!isMissingPaymentColumnError(err)) throw err;
    const rows = await supabaseRest('registrations?id=eq.' + encodeURIComponent(id) + '&select=' + base);
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }
}

async function patchRegistration(id, patch) {
  const path = 'registrations?id=eq.' + encodeURIComponent(id);
  try {
    return await supabaseRest(path, { method: 'PATCH', body: patch });
  } catch (err) {
    if (!isMissingPaymentColumnError(err)) throw err;
    const slim = Object.assign({}, patch);
    delete slim.payment_method;
    delete slim.payment_ref;
    delete slim.payment_detail;
    return await supabaseRest(path, { method: 'PATCH', body: slim });
  }
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

  const patch = paypalCapturePatch({
    captureId,
    amount: amt,
    existingNotes: row.notes,
    existingPaypalTxId: row.paypal_tx_id,
    existingPaymentRef: row.payment_ref
  });
  // Real checkout: persist the charged total. Admin "Mark paid" does not
  // change price_paid; it only records how the family paid.
  if (amt != null) patch.price_paid = amt;

  const updated = await patchRegistration(id, patch);
  return { ok: true, registration: Array.isArray(updated) ? updated[0] : patch };
}

module.exports = {
  supabaseConfig,
  loadRegistration,
  markRegistrationPaid
};
