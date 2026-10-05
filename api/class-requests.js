'use strict';

const { sendJson, readJson, preflight } = require('../lib/http');
const { submitClassRequest } = require('../lib/class-request-submit');
const store = require('../lib/class-request-store');
const { createOutlookDraft } = require('../lib/outlook-draft');
const { notifyLindsay } = require('../lib/class-request-notify');

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const body = await readJson(req);
    const result = await submitClassRequest(body, {
      listSessionCodes: store.listSessionCodes,
      insertSession: store.insertSession,
      insertRequest: store.insertRequest,
      updateRequest: store.updateRequest,
      createOutlookDraft: createOutlookDraft,
      notifyLindsay: notifyLindsay
    });
    sendJson(res, result.status, result.body);
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    const message = status === 400
      ? (err.message || 'Please check the form and try again.')
      : 'Something went wrong saving your request. Please try again.';
    sendJson(res, status >= 400 && status < 600 ? status : 500, { error: message });
  }
};
