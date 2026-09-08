'use strict';

const { sendJson, readRaw, preflight } = require('../../lib/http');
const { captureOrder, verifyWebhookSignature } = require('../../lib/paypal');
const { markRegistrationPaid } = require('../../lib/mark-paid');
const { extractCaptureFromOrder, parseMoney } = require('../../lib/payment-utils');

function headerMap(req) {
  const out = {};
  const h = req.headers || {};
  Object.keys(h).forEach(k => { out[k.toLowerCase()] = h[k]; });
  return out;
}

async function markFromCaptureResource(resource) {
  const registrationId = String((resource && (resource.custom_id || resource.customId)) || '').trim();
  const captureId = resource && resource.id;
  const amount = resource && resource.amount && resource.amount.value;
  if (!registrationId) return { ok: true, skipped: true, reason: 'no_custom_id' };
  return markRegistrationPaid({
    registrationId,
    captureId,
    amount: parseMoney(amount)
  });
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const raw = await readRaw(req);
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; }
    catch (e) { return sendJson(res, 400, { error: 'Invalid JSON' }); }

    const headers = headerMap(req);
    let verified = false;
    try {
      verified = await verifyWebhookSignature({ headers, body });
    } catch (e) {
      if (e.message && e.message.includes('PAYPAL_WEBHOOK_ID')) {
        return sendJson(res, 503, { error: 'Webhook not configured' });
      }
      return sendJson(res, 400, { error: e.message || 'Webhook verification failed' });
    }
    if (!verified) return sendJson(res, 400, { error: 'Invalid webhook signature' });

    const event = String(body.event_type || '');
    const resource = body.resource || {};
    let result = { ok: true, event, handled: false };

    if (event === 'PAYMENT.CAPTURE.COMPLETED') {
      result = { ok: true, event, handled: true, mark: await markFromCaptureResource(resource) };
    } else if (event === 'CHECKOUT.ORDER.APPROVED') {
      const orderId = resource.id;
      if (orderId) {
        const captured = await captureOrder(orderId);
        const info = extractCaptureFromOrder(captured);
        const registrationId = info.customId;
        const mark = registrationId
          ? await markRegistrationPaid({ registrationId, captureId: info.captureId, amount: info.amount })
          : { skipped: true };
        result = { ok: true, event, handled: true, captureId: info.captureId, mark };
      }
    }

    sendJson(res, 200, result);
  } catch (err) {
    sendJson(res, err.status || 500, { error: err.message || 'Webhook handler failed' });
  }
};
