'use strict';

const model = require('../js/class-requests');
const { randomUUID } = require('crypto');

const BLOCKED = {
  course: 'Choose a specific course before creating a session.',
  date: 'Add a date before creating a session.',
  time: 'Add a start time before creating a session.',
  location: 'Add a place before creating a session.',
  billing: 'The billing amount needs a clear number before a session can be created.'
};

function blockedMessage(reason) {
  return BLOCKED[reason] || 'This request is not ready for a session yet.';
}

function existingResult(row) {
  return {
    status: 200,
    body: {
      ok: true,
      created: false,
      sessionId: row.session_id,
      sessionCode: row.session_code || null,
      status: row.status || 'session_created',
      checklist: row.checklist || null,
      draft_subject: row.draft_subject || null,
      draft_body: row.draft_body || null,
      outlook_web_link: row.outlook_web_link || null,
      session: null
    }
  };
}

function unconfigured(err) {
  return err && err.code === 'supabase_unconfigured';
}

// If a previous approve saved the session but stopped before the checklist
// or the confirmation text, finish those fields. Never inserts another session
// and never writes a sessions row.
async function finishSavedSession(row, deps) {
  const patch = {};
  const flags = model.checklistAfterSubmit(true);
  if (!row.checklist || !row.checklist.session_created) {
    patch.status = 'session_created';
    patch.checklist = flags.checklist;
    patch.session_error = null;
  }
  if (row.session_code && (!row.draft_body || String(row.draft_body).indexOf(row.session_code) < 0)) {
    const normalized = model.normalizeSubmission(row.payload || {});
    const draft = model.buildDraft(normalized, { id: row.session_id, code: row.session_code });
    patch.draft_subject = draft.subject;
    patch.draft_body = draft.body;
    patch.draft_to = draft.to;
  }
  if (!Object.keys(patch).length || !deps.updateRequest) return row;
  patch.updated_at = new Date().toISOString();
  const saved = await deps.updateRequest(row.id, patch);
  return saved || Object.assign({}, row, patch);
}

async function approveClassRequest(requestId, deps) {
  deps = deps || {};
  if (!requestId) return { status: 400, body: { error: 'Request id is required.' } };

  let row;
  try {
    row = await deps.getRequest(requestId);
  } catch (err) {
    if (unconfigured(err)) {
      return { status: 503, body: { error: 'Requests are not saved yet. Please try again in a moment.' } };
    }
    throw err;
  }
  if (!row) return { status: 404, body: { error: 'That class request was not found.' } };

  if (row.session_id) {
    const finished = await finishSavedSession(row, deps);
    return existingResult(finished || row);
  }

  const normalized = model.normalizeSubmission(row.payload || {});
  let codes = [];
  try {
    codes = await deps.listSessionCodes();
  } catch (err) {
    if (unconfigured(err)) {
      return { status: 503, body: { error: 'Requests are not saved yet. Please try again in a moment.' } };
    }
    throw err;
  }

  const sessionId = randomUUID();
  const plan = model.buildSessionRow(normalized, codes || [], {
    id: sessionId,
    requestId: requestId,
    createdAt: Date.now()
  });
  if (!plan.created) {
    return { status: 400, body: { error: blockedMessage(plan.reason), reason: plan.reason || 'session' } };
  }

  // Claim the row before insert. A second click matches zero rows and must
  // not insert. The new row is an insert only. Existing session prices are
  // never read or written.
  let claimed;
  try {
    claimed = await deps.claimRequest(requestId, {
      session_id: plan.row.id,
      session_code: plan.row.code,
      updated_at: new Date().toISOString()
    });
  } catch (err) {
    if (unconfigured(err)) {
      return { status: 503, body: { error: 'Requests are not saved yet. Please try again in a moment.' } };
    }
    throw err;
  }
  if (!claimed) {
    const again = await deps.getRequest(requestId);
    if (again && again.session_id) {
      const finished = await finishSavedSession(again, deps);
      return existingResult(finished || again);
    }
    return {
      status: 409,
      body: { error: 'This request is already being approved. Wait a moment, then check the session before trying again.' }
    };
  }

  let sessionRow;
  try {
    sessionRow = await deps.insertSession(plan.row);
  } catch (err) {
    // A 4xx means Supabase rejected the insert, so the claim can be cleared
    // and a later click can try once. A 5xx or a network error may have
    // landed the row, so the claim stays and a retry will not insert again.
    const maybeLanded = !err || !err.status || err.status >= 500;
    if (!maybeLanded && deps.releaseClaim) {
      try { await deps.releaseClaim(requestId, plan.row.id); } catch (e2) { /* claim stays */ }
    }
    if (unconfigured(err)) {
      return { status: 503, body: { error: 'Requests are not saved yet. Please try again in a moment.' } };
    }
    throw err;
  }

  const draft = model.buildDraft(normalized, plan.row);
  let outlook = { created: false, reason: 'missing_credentials' };
  if (deps.createOutlookDraft) {
    try {
      outlook = await deps.createOutlookDraft({ to: draft.to, subject: draft.subject, body: draft.body });
    } catch (err) {
      outlook = { created: false, error: err.message || 'Outlook draft was not created' };
    }
  }

  const flags = model.checklistAfterSubmit(true);
  const patch = {
    status: 'session_created',
    checklist: flags.checklist,
    session_error: null,
    draft_subject: draft.subject,
    draft_body: draft.body,
    draft_to: draft.to,
    updated_at: new Date().toISOString()
  };
  if (outlook && outlook.created) {
    patch.outlook_draft_id = outlook.id || null;
    patch.outlook_web_link = outlook.webLink || null;
    patch.outlook_error = null;
  } else if (outlook && (outlook.error || (outlook.reason && outlook.reason !== 'missing_credentials'))) {
    patch.outlook_error = outlook.error || outlook.reason;
  }

  let saved = claimed;
  if (deps.updateRequest) {
    saved = await deps.updateRequest(requestId, patch);
  }
  const out = saved || Object.assign({}, row, patch, {
    session_id: plan.row.id,
    session_code: plan.row.code
  });

  return {
    status: 200,
    body: {
      ok: true,
      created: true,
      sessionId: plan.row.id,
      sessionCode: plan.row.code,
      status: out.status || 'session_created',
      checklist: out.checklist || flags.checklist,
      draft_subject: draft.subject,
      draft_body: draft.body,
      outlook_web_link: out.outlook_web_link || null,
      session: sessionRow || plan.row
    }
  };
}

module.exports = { approveClassRequest: approveClassRequest, blockedMessage: blockedMessage };
