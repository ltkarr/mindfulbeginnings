'use strict';

// Notifies Lindsay that a request arrived. Never emails the family.
// The badge and other free-text answers are included in full.

const LINDSAY = 'lindsay@mindfulbeginnings.org';
const EMAILJS_SERVICE_ID = 'service_delt0r4';
const EMAILJS_PUBLIC_KEY = 'FKuVu4SN8eXJ1cOYM';

function notifyEnv() {
  return {
    graphTenant: String(process.env.MS_GRAPH_TENANT_ID || process.env.AZURE_TENANT_ID || '').trim(),
    graphClientId: String(process.env.MS_GRAPH_CLIENT_ID || process.env.AZURE_CLIENT_ID || '').trim(),
    graphSecret: String(process.env.MS_GRAPH_CLIENT_SECRET || process.env.AZURE_CLIENT_SECRET || '').trim(),
    mailbox: String(process.env.MS_GRAPH_MAILBOX || LINDSAY).trim() || LINDSAY,
    emailjsTemplate: String(process.env.EMAILJS_TEMPLATE_CLASS_REQUEST || '').trim(),
    emailjsPrivateKey: String(process.env.EMAILJS_PRIVATE_KEY || '').trim()
  };
}

function payloadText(record, key) {
  const payload = record && record.payload && typeof record.payload === 'object' ? record.payload : {};
  const direct = record && record[key] != null ? record[key] : '';
  const fromPayload = payload[key] != null ? payload[key] : '';
  return String(fromPayload || direct || '').replace(/\u0000/g, '').trim();
}

function messageText(record) {
  record = record || {};
  const lines = [];
  lines.push('A new class request is waiting in ADMIN.');
  lines.push('');
  lines.push('Type: ' + (record.kind === 'organization' ? 'Organization' : 'Private host'));
  lines.push('From: ' + (record.submitter_name || '') + (record.submitter_email ? ' <' + record.submitter_email + '>' : ''));
  if (record.organization_name) lines.push('Organization: ' + record.organization_name);
  if (record.course) lines.push('Course: ' + record.course);
  if (record.session_code) lines.push('Session: ' + record.session_code);
  else lines.push('Session: not linked yet.');
  const badge = payloadText(record, 'badge');
  const special = payloadText(record, 'specialInstructions');
  const participants = payloadText(record, 'participantInfo');
  const custom = payloadText(record, 'customRequest');
  if (badge) {
    lines.push('');
    lines.push('Girl Scout badge / message:');
    lines.push(badge);
  }
  if (special) {
    lines.push('');
    lines.push('Special instructions:');
    lines.push(special);
  }
  if (participants) {
    lines.push('');
    lines.push('For participants:');
    lines.push(participants);
  }
  if (custom) {
    lines.push('');
    lines.push('Custom request:');
    lines.push(custom);
  }
  lines.push('');
  lines.push('This notice was not sent to the family.');
  lines.push('Open ADMIN: https://register.mindfulbeginnings.org/admin.html');
  return lines.join('\n').slice(0, 20000);
}

async function graphToken(env, fetchImpl) {
  const body = new URLSearchParams({
    client_id: env.graphClientId,
    client_secret: env.graphSecret,
    scope: 'https://graph.microsoft.com/.default',
    grant_type: 'client_credentials'
  });
  const res = await fetchImpl('https://login.microsoftonline.com/' + encodeURIComponent(env.graphTenant) + '/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString()
  });
  const json = await res.json().catch(function () { return {}; });
  if (!res.ok || !json.access_token) {
    throw new Error((json && (json.error_description || json.error)) || 'Graph token failed');
  }
  return json.access_token;
}

async function sendGraphNotice(env, subject, text, fetchImpl) {
  const token = await graphToken(env, fetchImpl);
  const url = 'https://graph.microsoft.com/v1.0/users/' + encodeURIComponent(env.mailbox) + '/sendMail';
  const res = await fetchImpl(url, {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + token,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      message: {
        subject: subject,
        body: { contentType: 'Text', content: text },
        toRecipients: [{ emailAddress: { address: LINDSAY } }]
      },
      saveToSentItems: true
    })
  });
  if (!res.ok && res.status !== 202) {
    const json = await res.json().catch(function () { return {}; });
    throw new Error((json && json.error && json.error.message) || ('Graph send ' + res.status));
  }
  return { sent: true, via: 'graph', to: LINDSAY };
}

async function sendEmailJsNotice(env, subject, text, fetchImpl) {
  const res = await fetchImpl('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: env.emailjsTemplate,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: env.emailjsPrivateKey,
      template_params: {
        to_email: LINDSAY,
        subject: subject,
        message: text
      }
    })
  });
  if (!res.ok) {
    const detail = await res.text().catch(function () { return ''; });
    throw new Error('EmailJS ' + res.status + (detail ? ': ' + detail.slice(0, 180) : ''));
  }
  return { sent: true, via: 'emailjs', to: LINDSAY };
}

async function notifyLindsay(record, deps) {
  deps = deps || {};
  const env = deps.env || notifyEnv();
  const fetchImpl = deps.fetch || fetch;
  const subject = 'New class request: ' + (record.submitter_name || 'someone') + (record.course ? ', ' + record.course : '');
  const text = messageText(record || {});
  const graphReady = !!(env.graphTenant && env.graphClientId && env.graphSecret);
  const emailjsReady = !!(env.emailjsTemplate && env.emailjsPrivateKey);
  if (!graphReady && !emailjsReady) return { sent: false, reason: 'missing_credentials' };
  try {
    if (graphReady) return await sendGraphNotice(env, subject, text, fetchImpl);
    return await sendEmailJsNotice(env, subject, text, fetchImpl);
  } catch (err) {
    if (graphReady && emailjsReady) {
      try { return await sendEmailJsNotice(env, subject, text, fetchImpl); } catch (e2) {
        return { sent: false, reason: 'error', error: e2.message || err.message };
      }
    }
    return { sent: false, reason: 'error', error: err.message || 'Notification failed' };
  }
}

module.exports = {
  LINDSAY: LINDSAY,
  notifyEnv: notifyEnv,
  messageText: messageText,
  notifyLindsay: notifyLindsay
};
