'use strict';

const { sendJson, readJson, preflight } = require('../lib/http');
const { notifyLindsay } = require('../lib/class-request-notify');

function clip(value, max) {
  return String(value == null ? '' : value).replace(/\s+/g, ' ').trim().slice(0, max);
}

function messageBody(value) {
  return String(value == null ? '' : value).replace(/\r\n/g, '\n').trim().slice(0, 4000);
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function validateContact(body) {
  body = body || {};
  const honeypot = clip(body.companyWebsite || body.company_website, 200);
  const name = clip(body.name, 200);
  const email = clip(body.email, 200);
  const message = messageBody(body.message);
  if (honeypot) return { ok: true, ignored: true };
  if (!name) return { ok: false, status: 400, field: 'name', error: 'Please add your name.' };
  if (!validEmail(email)) return { ok: false, status: 400, field: 'email', error: 'Please add a valid email address.' };
  if (!message) return { ok: false, status: 400, field: 'message', error: 'Please add a message.' };
  return { ok: true, name: name, email: email, message: message };
}

async function submitContact(body, deps) {
  deps = deps || {};
  const checked = validateContact(body);
  if (!checked.ok) {
    return { status: checked.status || 400, body: { ok: false, error: checked.error, field: checked.field } };
  }
  if (checked.ignored) {
    return { status: 200, body: { ok: true, sent: false } };
  }
  const notify = deps.notifyLindsay || notifyLindsay;
  let notice = { sent: false, reason: 'missing_credentials' };
  try {
    notice = await notify({
      kind: 'contact',
      submitter_name: checked.name,
      submitter_email: checked.email,
      payload: { message: checked.message }
    });
  } catch (err) {
    notice = { sent: false, reason: 'error', error: err && err.message };
  }
  return { status: 200, body: { ok: true, sent: !!(notice && notice.sent) } };
}

async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const body = await readJson(req);
    const result = await submitContact(body);
    sendJson(res, result.status, result.body);
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    sendJson(res, status >= 400 && status < 600 ? status : 500, {
      error: status === 400 ? (err.message || 'Please check the form and try again.') : 'Something went wrong. Please try again.'
    });
  }
}

handler.submitContact = submitContact;
handler.validateContact = validateContact;
module.exports = handler;
