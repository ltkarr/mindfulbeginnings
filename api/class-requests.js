'use strict';

const { sendJson, readJson, preflight } = require('../lib/http');
const { submitClassRequest } = require('../lib/class-request-submit');
const { approveClassRequest } = require('../lib/class-request-approve');
const store = require('../lib/class-request-store');
const { createOutlookDraft } = require('../lib/outlook-draft');
const { notifyLindsay } = require('../lib/class-request-notify');
const { confirmRequester } = require('../lib/class-request-confirm');

const SUPABASE_URL = 'https://evninlytzhtacanrguhx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2bmlubHl0emh0YWNhbnJndWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTE1MzQsImV4cCI6MjA5MzIyNzUzNH0.7sr0P9BmcPW_cJgWZwndVtaHsZXsbVCcE0Pk1gm3VP8';

// Approval lives on this same function. A second file under api/ would be a
// 13th Serverless Function, and this project is already at the Hobby limit of 12.
function adminEmails() {
  const raw = (process.env.ADMIN_EMAILS || 'lindsay@mindfulbeginnings.org').trim();
  return raw.split(',').map(function (s) { return s.trim().toLowerCase(); }).filter(Boolean);
}

async function verifyAdmin(bearer) {
  if (!bearer) return null;
  const res = await fetch(SUPABASE_URL + '/auth/v1/user', {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: 'Bearer ' + bearer }
  });
  if (!res.ok) return null;
  const user = await res.json().catch(function () { return null; });
  const email = user && user.email ? String(user.email).toLowerCase() : '';
  return adminEmails().includes(email) ? email : null;
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  let approving = false;
  try {
    const body = await readJson(req);
    if (body && body.action === 'approve') {
      approving = true;
      const auth = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
      const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      const caller = await verifyAdmin(bearer).catch(function () { return null; });
      if (!caller) return sendJson(res, 401, { error: 'Unauthorized' });
      const id = body.id || body.request_id;
      if (!id) return sendJson(res, 400, { error: 'Request id is required.' });
      const result = await approveClassRequest(String(id), {
        getRequest: store.getRequest,
        claimRequest: store.claimRequest,
        releaseClaim: store.releaseClaim,
        listSessionCodes: store.listSessionCodes,
        insertSession: store.insertSession,
        updateRequest: store.updateRequest,
        createOutlookDraft: createOutlookDraft
      });
      return sendJson(res, result.status, result.body);
    }
    if (body && body.action === 'delete') {
      const auth = (req.headers && (req.headers.authorization || req.headers.Authorization)) || '';
      const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
      const caller = await verifyAdmin(bearer).catch(function () { return null; });
      if (!caller) return sendJson(res, 401, { error: 'Unauthorized' });
      const id = body.id || body.request_id;
      if (!id) return sendJson(res, 400, { error: 'Request id is required.' });
      const removed = await store.deleteRequest(String(id));
      if (!removed) return sendJson(res, 404, { error: 'That request was not found.' });
      return sendJson(res, 200, { ok: true });
    }
    const result = await submitClassRequest(body, {
      insertRequest: store.insertRequest,
      updateRequest: store.updateRequest,
      createOutlookDraft: createOutlookDraft,
      notifyLindsay: notifyLindsay,
      confirmRequester: confirmRequester
    });
    sendJson(res, result.status, result.body);
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    const message = status === 400
      ? (err.message || (approving ? 'Please check the request and try again.' : 'Please check the form and try again.'))
      : (approving
        ? 'Something went wrong creating the session. If this request already has a session, approving again will not create another.'
        : 'Something went wrong saving your request. Please try again.');
    sendJson(res, status >= 400 && status < 600 ? status : 500, { error: message });
  }
};
