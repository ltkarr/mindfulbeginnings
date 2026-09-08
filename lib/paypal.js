'use strict';

const { formatMoney, isChargeableAmount, paypalDescription } = require('./payment-utils');

function paypalBase() {
  const env = String(process.env.PAYPAL_ENV || process.env.PAYPAL_MODE || 'live').toLowerCase();
  const sandbox = env === 'sandbox' || env === 'test';
  return {
    sandbox,
    api: sandbox ? 'https://api-m.sandbox.paypal.com' : 'https://api-m.paypal.com',
    web: sandbox ? 'https://www.sandbox.paypal.com' : 'https://www.paypal.com',
    env: sandbox ? 'sandbox' : 'live'
  };
}

function credentials() {
  const clientId = (process.env.PAYPAL_CLIENT_ID || '').trim();
  const secret = (process.env.PAYPAL_CLIENT_SECRET || '').trim();
  return { clientId, secret, configured: !!(clientId && secret) };
}

let cachedToken = null;
let tokenExpiresAt = 0;

async function getAccessToken() {
  const { clientId, secret, configured } = credentials();
  if (!configured) {
    const err = new Error('PayPal is not configured (PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET)');
    err.status = 503;
    throw err;
  }
  if (cachedToken && Date.now() < tokenExpiresAt - 15000) return cachedToken;
  const { api } = paypalBase();
  const res = await fetch(api + '/v1/oauth2/token', {
    method: 'POST',
    headers: {
      Authorization: 'Basic ' + Buffer.from(clientId + ':' + secret).toString('base64'),
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: 'grant_type=client_credentials'
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    const err = new Error(body.error_description || body.error || 'PayPal auth failed');
    err.status = 502;
    err.details = body;
    throw err;
  }
  cachedToken = body.access_token;
  tokenExpiresAt = Date.now() + (Number(body.expires_in) || 300) * 1000;
  return cachedToken;
}

async function paypalFetch(path, { method = 'GET', body } = {}) {
  const token = await getAccessToken();
  const { api } = paypalBase();
  const res = await fetch(api + path, {
    method,
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const text = await res.text();
  let json = {};
  try { json = text ? JSON.parse(text) : {}; } catch (e) { json = { raw: text }; }
  if (!res.ok) {
    const msg = (json.message || json.error_description || json.name || ('PayPal ' + res.status)).toString();
    const err = new Error(msg);
    err.status = res.status;
    err.details = json;
    throw err;
  }
  return json;
}

function approveUrlFromOrder(order) {
  const links = (order && order.links) || [];
  const approve = links.find(l => l.rel === 'approve' || l.rel === 'payer-action');
  return approve ? approve.href : null;
}

async function createOrder({ amount, registrationId, description, studentName, course, returnUrl, cancelUrl }) {
  const formatted = formatMoney(amount);
  if (!isChargeableAmount(formatted)) {
    const err = new Error('Enter a valid amount between $0.01 and $1,000.');
    err.status = 400;
    throw err;
  }
  const desc = (description || paypalDescription({ studentName, course, registrationId })).slice(0, 127);
  const customId = String(registrationId || '').trim().slice(0, 127);
  const purchaseUnit = {
    description: desc,
    amount: { currency_code: 'USD', value: formatted }
  };
  if (customId) {
    purchaseUnit.custom_id = customId;
    // invoice_id must be unique per PayPal account; include a short nonce so retries still work.
    purchaseUnit.invoice_id = (customId + '-' + Date.now().toString(36)).slice(0, 127);
  }
  const applicationContext = {
    brand_name: 'Mindful Beginnings',
    shipping_preference: 'NO_SHIPPING',
    user_action: 'PAY_NOW'
  };
  if (returnUrl) applicationContext.return_url = returnUrl;
  if (cancelUrl) applicationContext.cancel_url = cancelUrl;

  const order = await paypalFetch('/v2/checkout/orders', {
    method: 'POST',
    body: {
      intent: 'CAPTURE',
      purchase_units: [purchaseUnit],
      application_context: applicationContext
    }
  });
  return {
    id: order.id,
    status: order.status,
    approveUrl: approveUrlFromOrder(order)
  };
}

async function captureOrder(orderId) {
  const id = String(orderId || '').trim();
  if (!id) {
    const err = new Error('Missing PayPal order id');
    err.status = 400;
    throw err;
  }
  try {
    return await paypalFetch('/v2/checkout/orders/' + encodeURIComponent(id) + '/capture', { method: 'POST', body: {} });
  } catch (err) {
    const name = err.details && (err.details.name || (err.details.details && err.details.details[0] && err.details.details[0].issue));
    // Already captured (client + webhook race): fetch the order instead.
    if (err.status === 422 || String(name).toUpperCase().includes('CAPTURED') || String(err.message).toUpperCase().includes('CAPTURED')) {
      return await getOrder(id);
    }
    throw err;
  }
}

async function getOrder(orderId) {
  return paypalFetch('/v2/checkout/orders/' + encodeURIComponent(orderId));
}

async function verifyWebhookSignature({ headers, body }) {
  const webhookId = (process.env.PAYPAL_WEBHOOK_ID || '').trim();
  if (!webhookId) {
    const err = new Error('PAYPAL_WEBHOOK_ID is not set');
    err.status = 503;
    throw err;
  }
  const transmissionId = headers['paypal-transmission-id'] || headers['PayPal-Transmission-Id'];
  const transmissionTime = headers['paypal-transmission-time'] || headers['PayPal-Transmission-Time'];
  const certUrl = headers['paypal-cert-url'] || headers['PayPal-Cert-Url'];
  const authAlgo = headers['paypal-auth-algo'] || headers['PayPal-Auth-Algo'];
  const transmissionSig = headers['paypal-transmission-sig'] || headers['PayPal-Transmission-Sig'];
  if (!transmissionId || !transmissionTime || !certUrl || !authAlgo || !transmissionSig) {
    const err = new Error('Missing PayPal webhook signature headers');
    err.status = 400;
    throw err;
  }
  const result = await paypalFetch('/v1/notifications/verify-webhook-signature', {
    method: 'POST',
    body: {
      auth_algo: authAlgo,
      cert_url: certUrl,
      transmission_id: transmissionId,
      transmission_sig: transmissionSig,
      transmission_time: transmissionTime,
      webhook_id: webhookId,
      webhook_event: body
    }
  });
  return result.verification_status === 'SUCCESS';
}

module.exports = {
  paypalBase,
  credentials,
  getAccessToken,
  paypalFetch,
  createOrder,
  captureOrder,
  getOrder,
  verifyWebhookSignature,
  approveUrlFromOrder
};
