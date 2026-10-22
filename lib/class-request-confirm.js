'use strict';

// Sends the requester an automatic confirmation that their class request
// was received. Uses EmailJS; skips gracefully until Lindsay creates the
// "Class request confirmation" template and sets EMAILJS_TEMPLATE_REQUEST_CONFIRM.

const EMAILJS_SERVICE_ID = 'service_delt0r4';
const EMAILJS_PUBLIC_KEY = 'FKuVu4SN8eXJ1cOYM';

function confirmEnv() {
  return {
    emailjsTemplate: String(process.env.EMAILJS_TEMPLATE_REQUEST_CONFIRM || '').trim(),
    emailjsPrivateKey: String(process.env.EMAILJS_PRIVATE_KEY || '').trim()
  };
}

async function confirmRequester(record, deps) {
  deps = deps || {};
  const fetchImpl = deps.fetch || fetch;
  const env = confirmEnv();
  const to = record && record.submitter_email ? String(record.submitter_email).trim() : '';
  if (!to) return { sent: false, reason: 'no_recipient' };
  if (!env.emailjsTemplate || !env.emailjsPrivateKey) {
    return { sent: false, reason: 'missing_credentials' };
  }
  const name = record.submitter_name ? String(record.submitter_name).trim() : 'there';
  const course = record.course ? String(record.course) : 'your class';
  const kind = record.kind === 'organization' ? 'organization' : 'host';
  const res = await fetchImpl('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: env.emailjsTemplate,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: env.emailjsPrivateKey,
      template_params: {
        to_email: to,
        submitter_name: name,
        course: course,
        kind: kind
      }
    })
  });
  if (!res.ok) {
    const detail = await res.text().catch(function () { return ''; });
    throw new Error('EmailJS ' + res.status + (detail ? ': ' + detail.slice(0, 180) : ''));
  }
  return { sent: true, to: to };
}

module.exports = { confirmRequester, confirmEnv };
