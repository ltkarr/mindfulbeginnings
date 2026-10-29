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

// A submission saves a pending class_requests row only. It does not create a
// session, so the request stays off the instructor board and out of job emails
// until an admin approves it. The confirmation stays a draft. Because no
// session exists yet, that draft has no session code and no private
// registration link. Approving rewrites the draft with both.
async function submitClassRequest(body, deps) {
  deps = deps || {};
  const normalized = model.normalizeSubmission(body);
  // Honeypot: the hidden field was filled, by a bot or by a real person's
  // browser autofill. Never discard the submission: save it like any other
  // request and flag it in the payload, so a real lead (an auction winner
  // with an enthusiastic password manager) can never vanish silently while
  // the visitor sees a success screen.
  // validate() flags the filled honeypot as a 'spam' error; that flag is
  // the signal to save-and-flag below, not a reason to reject.
  const errors = model.validate(normalized).filter(function (e) { return e.field !== 'companyWebsite'; });
  if (errors.length) {
    const first = errors[0];
    return {
      status: 400,
      body: { error: first.message, field: first.field, redirect: first.redirect || null }
    };
  }

  const requestId = randomUUID();
  const draft = model.buildDraft(normalized, null);
  let outlook = { created: false, reason: 'missing_credentials' };
  if (deps.createOutlookDraft) {
    outlook = await deps.createOutlookDraft({ to: draft.to, subject: draft.subject, body: draft.body });
  }

  const flags = model.checklistAfterSubmit(false);
  const payload = body && typeof body === 'object' ? Object.assign({}, body) : {};
  delete payload.companyWebsite;
  delete payload.company_website;
  if (normalized.honeypot) payload.spam_flag = 'honeypot_filled';

  const record = {
    id: requestId,
    kind: normalized.kind,
    status: 'pending',
    checklist: flags.checklist,
    payload: payload,
    submitter_name: normalized.name,
    submitter_email: normalized.email,
    submitter_phone: normalized.phone,
    organization_name: normalized.organizationName || null,
    course: normalized.course && normalized.course.course ? normalized.course.course : (normalized.course && normalized.course.label) || null,
    course_key: normalized.courseKey || null,
    session_id: null,
    session_code: null,
    session_error: null,
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
      return { status: 503, body: { error: 'Requests are not saved yet. Please try again in a moment.' } };
    }
    throw err;
  }

  if (deps.notifyLindsay) {
    try {
      const notice = await deps.notifyLindsay(saved || record);
      if (deps.updateRequest && notice && notice.sent) {
        await deps.updateRequest(requestId, { notified_at: new Date().toISOString(), notify_error: null });
      } else if (deps.updateRequest && notice && !notice.sent) {
        await deps.updateRequest(requestId, { notify_error: notice.error || notice.reason || 'not sent' });
      }
    } catch (err) {
      if (deps.updateRequest) {
        try { await deps.updateRequest(requestId, { notify_error: err.message || 'Notification failed' }); } catch (e2) { /* banner still shows the request */ }
      }
    }
  }

  if (deps.confirmRequester) {
    try {
      await deps.confirmRequester(saved || record);
    } catch (err) {
      // Confirmation failure never blocks the submission; Lindsay still gets
      // her notification above and can follow up manually.
    }
  }

  return { status: 200, body: publicResult(saved || record, { created: false }, outlook) };
}

module.exports = { submitClassRequest: submitClassRequest, publicResult: publicResult };
