'use strict';

const { sendJson, readJson, preflight } = require('../../lib/http');
const { captureOrder } = require('../../lib/paypal');
const { markRegistrationPaid } = require('../../lib/mark-paid');
const { extractCaptureFromOrder } = require('../../lib/payment-utils');

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const body = await readJson(req);
    const orderId = String(body.orderID || body.orderId || body.token || '').trim();
    if (!orderId) return sendJson(res, 400, { error: 'Missing PayPal order id' });

    const captured = await captureOrder(orderId);
    const info = extractCaptureFromOrder(captured);
    if (info.status && info.status !== 'COMPLETED') {
      return sendJson(res, 202, {
        ok: false,
        pending: true,
        status: info.status,
        orderId: info.orderId,
        captureId: info.captureId,
        error: 'Payment is still processing. You will not be charged twice; we will mark the registration paid when PayPal confirms it.'
      });
    }
    const registrationId = String(body.registrationId || body.registration_id || info.customId || '').trim();
    let marked = { ok: true, skipped: !registrationId, reason: registrationId ? null : 'no_registration' };
    if (registrationId) {
      try {
        marked = await markRegistrationPaid({
          registrationId,
          captureId: info.captureId,
          amount: info.amount
        });
      } catch (e) {
        marked = { ok: false, error: e.message, code: e.code || null };
      }
    }
    sendJson(res, 200, {
      ok: true,
      orderId: info.orderId,
      captureId: info.captureId,
      amount: info.amount,
      registrationId: registrationId || null,
      markedPaid: !!(marked && marked.ok && !marked.skipped),
      mark: marked
    });
  } catch (err) {
    sendJson(res, err.status || 500, { error: err.message || 'Could not complete PayPal payment' });
  }
};
