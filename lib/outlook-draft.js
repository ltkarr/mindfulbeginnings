'use strict';

// Creates an Outlook draft in Lindsay's mailbox via Microsoft Graph.
// Confirmation emails stay drafts. This module only posts a message resource.

const LINDSAY = 'lindsay@mindfulbeginnings.org';

function graphEnv() {
  const tenant = String(process.env.MS_GRAPH_TENANT_ID || process.env.AZURE_TENANT_ID || '').trim();
  const clientId = String(process.env.MS_GRAPH_CLIENT_ID || process.env.AZURE_CLIENT_ID || '').trim();
  const clientSecret = String(process.env.MS_GRAPH_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET || '').trim();
  const mailbox = String(process.env.MS_GRAPH_MAILBOX || LINDSAY).trim() || LINDSAY;
  return {
    tenant: tenant,
    clientId: clientId,
    clientSecret: clientSecret,
    mailbox: mailbox,
    configured: !!(tenant && clientId && clientSecret)
  };
}

async function graphToken(env, fetchImpl) {
  const body = new URLSearchParams({
    client_id: env.clientId,
    client_secret: env.clientSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });
  const res = await fetchImpl('https://login.microsoftonline.com/' + encodeURIComponent(env.tenant) + '/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const json = await res.json().catch(function () { return {}; });
  if (!res.ok || !json.access_token) {
    const err = new Error((json && (json.error_description || json.error)) || ('Graph token failed (' + res.status + ')'));
    err.status = res.status;
    throw err;
  }
  return json.access_token;
}

/**
 * POST /users/{mailbox}/messages creates a draft. It does not send.
 * Returns { created, reason?, id?, webLink?, error? }.
 */
async function createOutlookDraft(draft, deps) {
  deps = deps || {};
  const env = deps.env || graphEnv();
  if (!env.configured) return { created: false, reason: 'missing_credentials' };
  const to = String((draft && draft.to) || '').trim();
  const subject = String((draft && draft.subject) || '').trim();
  const body = String((draft && draft.body) || '');
  if (!to || !subject || !body) return { created: false, reason: 'incomplete_draft' };
  const fetchImpl = deps.fetch || fetch;
  try {
    const token = await graphToken(env, fetchImpl);
    const url = 'https://graph.microsoft.com/v1.0/users/' + encodeURIComponent(env.mailbox) + '/messages';
    const res = await fetchImpl(url, {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        subject: subject,
        body: { contentType: 'Text', content: body },
        toRecipients: [{ emailAddress: { address: to } }]
      })
    });
    const json = await res.json().catch(function () { return {}; });
    if (!res.ok) {
      return {
        created: false,
        reason: 'graph_error',
        error: (json && (json.error && json.error.message || json.error_description)) || ('Graph ' + res.status)
      };
    }
    return {
      created: true,
      id: json.id || '',
      webLink: json.webLink || ''
    };
  } catch (err) {
    return { created: false, reason: 'graph_error', error: err.message || 'Graph draft failed' };
  }
}

module.exports = {
  LINDSAY: LINDSAY,
  graphEnv: graphEnv,
  createOutlookDraft: createOutlookDraft
};
