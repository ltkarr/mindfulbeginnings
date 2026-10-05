'use strict';

const model = require('../js/class-requests');
const { randomUUID } = require('crypto');

function publicResult(saved, plan, outlook) {
  return {
    ok: true,
    id: saved && saved.id,
    sessionCreated: !!(plan && plan.created),
    sessionSkippedReason: plan && plan.created ? null : (plan && plan.reason) || null,
    draftStored: !!(saved && saved.draft_body),
    outlookDraftCreated: !!(outlook && outlook.created)
  };
}

async function submitClassRequest(body, deps) {
  deps = deps || {};
  const normalized = model.normalizeSubmission(body);
  if (normalized.honeypot) {
    return { status: 200, body: { ok: true, id: null, sessionCreated: false, draftStored: false, outlookDraftCreated: false } };
  }
  const errors = model.validate(normalized);
  if (errors.length) {
    const first = errors[0];
    return {
      status: 400,
      body: { error: first.message, field: first.field, redirect: first.redirect || null }
    };
  }

  const requestId = randomUUID();
  const sessionId = randomUUID();
  let codes = [];
  try {
    codes = await deps.listSessionCodes();
  } catch (err) {
    if (err && err.code === 'supabase_unconfigured') {
      return { status: 503, body: { error: 'Requests are not saved yet. Please email lindsay@mindfulbeginnings.org and we will take it from here.' } };
    }
    throw err;
  }

  const plan = model.buildSessionRow(normalized, codes, { id: sessionId, requestId: requestId, createdAt: Date.now() });
  let sessionRow = null;
  let sessionError = null;
  if (plan.created) {
    try {
      sessionRow = await deps.insertSession(plan.row);
    } catch (err) {
      if (err && err.code === 'supabase_unconfigured') {
        return { status: 503, body: { error: 'Requests are not saved yet. Please email lindsay@mindfulbeginnings.org and we will take it from here.' } };
      }
      sessionError = err.message || 'Session was not created';
      sessionRow = null;
    }
  }

  const draft = model.buildDraft(normalized, sessionRow ? plan.row : null);
  let outlook = { created: false, reason: 'missing_credentials' };
  if (deps.createOutlookDraft) {
    outlook = await deps.createOutlookDraft({ to: draft.to, subject: draft.subject, body: draft.body });
  }

  const flags = model.checklistAfterSubmit(!!sessionRow, !!(draft && draft.body));
  const payload = body && typeof body === 'object' ? Object.assign({}, body) : {};
  delete payload.companyWebsite;
  delete payload.company_website;

  const record = {
    id: requestId,
    kind: normalized.kind,
    status: flags.status,
    checklist: flags.checklist,
    payload: payload,
    submitter_name: normalized.name,
    submitter_email: normalized.email,
    submitter_phone: normalized.phone,
    organization_name: normalized.organizationName || null,
    course: normalized.course && normalized.course.course ? normalized.course.course : (normalized.course && normalized.course.label) || null,
    course_key: normalized.courseKey || null,
    session_id: sessionRow ? plan.row.id : null,
    session_code: sessionRow ? plan.row.code : null,
    session_error: sessionError,
    draft_subject: draft.subject,
    draft_body: draft.body,
    draft_to: draft.to,
    outlook_draft_id: outlook && outlook.id ? outlook.id : null,
    outlook_web_link: outlook && outlook.webLink ? outlook.webLink : null,
    outlook_error: outlook && outlook.created ? null : (outlook && (outlook.error || outlook.reason) || null),
    notify_error: null
  };

  let saved;
  try {
    saved = await deps.insertRequest(record);
  } catch (err) {
    if (err && err.code === 'supabase_unconfigured') {
      return { status: 503, body: { error: 'Requests are not saved yet. Please email lindsay@mindfulbeginnings.org and we will take it from here.' } };
    }
    throw err;
  }

  if (deps.notifyLindsay) {
    try {
      const notice = await deps.notifyLindsay(saved || record);
      if (deps.updateRequest && notice && notice.sent) {
        await deps.updateRequest(requestId, { notified_at: new Date().toISOString(), notify_error: null });
      } else if (deps.updateRequest && notice && !notice.sent && notice.reason !== 'missing_credentials') {
        await deps.updateRequest(requestId, { notify_error: notice.error || notice.reason || 'not sent' });
      }
    } catch (err) {
      if (deps.updateRequest) {
        try { await deps.updateRequest(requestId, { notify_error: err.message || 'Notification failed' }); } catch (e2) { /* banner still shows the request */ }
      }
    }
  }

  const outcome = sessionRow ? plan : { created: false, reason: sessionError ? 'session_save' : plan.reason };
  return { status: 200, body: publicResult(saved || record, outcome, outlook) };
}

module.exports = { submitClassRequest: submitClassRequest, publicResult: publicResult };
