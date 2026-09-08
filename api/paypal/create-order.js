'use strict';

const { sendJson, readJson, preflight } = require('../../lib/http');
const { createOrder } = require('../../lib/paypal');
const { loadRegistration } = require('../../lib/mark-paid');
const { isTerminalPaidStatus, parseMoney } = require('../../lib/payment-utils');

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const body = await readJson(req);
    const amount = parseMoney(body.amount);
    const registrationId = String(body.registrationId || body.registration_id || '').trim();
    if (registrationId) {
      try {
        const row = await loadRegistration(registrationId);
        if (!row) return sendJson(res, 400, { error: 'That registration was not found. Please refresh and try again.' });
        if (isTerminalPaidStatus(row.pay_status)) {
          return sendJson(res, 409, { error: 'This registration is already marked paid. You will not be charged again.', alreadyPaid: true });
        }
      } catch (e) {
        if (e.code !== 'supabase_unconfigured') throw e;
        // Env not set yet: still allow creating a PayPal order so checkout can be tested.
      }
    }
    const order = await createOrder({
      amount,
      registrationId,
      description: body.description,
      studentName: body.studentName,
      course: body.course,
      returnUrl: body.returnUrl,
      cancelUrl: body.cancelUrl
    });
    sendJson(res, 200, order);
  } catch (err) {
    sendJson(res, err.status || 500, { error: err.message || 'Could not start PayPal checkout' });
  }
};
