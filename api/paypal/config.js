'use strict';

const { sendJson, preflight } = require('../../lib/http');
const { credentials, paypalBase } = require('../../lib/paypal');

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== 'GET') return sendJson(res, 405, { error: 'Method not allowed' });
  const { clientId, configured } = credentials();
  const { env } = paypalBase();
  sendJson(res, 200, {
    configured,
    clientId: configured ? clientId : '',
    env
  });
};
