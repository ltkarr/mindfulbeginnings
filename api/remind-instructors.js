'use strict';

// Automated day-before class reminders for instructors.
//
// Runs on a daily Vercel cron (see vercel.json "crons"). Each run:
//   1. Calls the get_tomorrow_reminders() RPC — every session happening
//      tomorrow with an assigned instructor, not already reminded today.
//   2. Sends each instructor their reminder through EmailJS.
//   3. Logs the send via log_reminder_sent() so a re-run never double-sends.
//
// Required Vercel environment variables:
//   CRON_SECRET             — Vercel Cron sends this automatically as a
//                             Bearer token; requests without it get a 401.
//   EMAILJS_PRIVATE_KEY     — EmailJS private key (EmailJS dashboard → Account → General).
//   EMAILJS_TEMPLATE_REMINDER — the "Instructor class reminder" template ID.
//
// The EmailJS template receives these variables:
//   instructor_name, instructor_email, course, class_date, class_time,
//   location_text, student_count
//
// One-time setup for Lindsay is in docs/portal-reminder-setup.md.

const { sendJson } = require('../lib/http');

const SUPABASE_URL = 'https://evninlytzhtacanrguhx.supabase.co';
// Public anon key — the same one shipped in the site's page source. It can only
// call the two definer RPCs used here, which expose no more than the reminder
// data itself.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2bmlubHl0emh0YWNhbnJndWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTE1MzQsImV4cCI6MjA5MzIyNzUzNH0.7sr0P9BmcPW_cJgWZwndVtaHsZXsbVCcE0Pk1gm3VP8';
const EMAILJS_SERVICE_ID = 'service_delt0r4';
const EMAILJS_PUBLIC_KEY = 'FKuVu4SN8eXJ1cOYM';

async function rpc(name, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(args || {}),
  });
  if (!res.ok) throw new Error(`RPC ${name} failed with ${res.status}`);
  return res.json();
}

async function sendReminderEmail(m, templateId, privateKey) {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: templateId,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: privateKey,
      template_params: {
        instructor_name: m.instructor_name,
        instructor_email: m.instructor_email,
        course: m.course,
        class_date: m.class_date,
        class_time: m.class_time || 'TBD',
        location_text: m.location_text || 'TBD',
        student_count: String(m.student_count || 0),
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`EmailJS ${res.status}: ${detail.slice(0, 200)}`);
  }
}

module.exports = async function handler(req, res) {
  // Vercel Cron automatically sends CRON_SECRET as a Bearer token.
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  if (!secret || auth !== `Bearer ${secret}`) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  const privateKey = process.env.EMAILJS_PRIVATE_KEY;
  const templateId = process.env.EMAILJS_TEMPLATE_REMINDER;
  if (!privateKey || !templateId) {
    return sendJson(res, 500, {
      error: 'Reminder email is not configured yet (EMAILJS_PRIVATE_KEY / EMAILJS_TEMPLATE_REMINDER).',
    });
  }

  let reminders;
  try {
    reminders = await rpc('get_tomorrow_reminders');
  } catch (e) {
    return sendJson(res, 500, { error: 'Could not look up tomorrow’s sessions.', detail: e.message });
  }

  const results = [];
  for (const m of reminders || []) {
    try {
      await sendReminderEmail(m, templateId, privateKey);
      await rpc('log_reminder_sent', { p_session_id: m.session_id });
      results.push({ session_id: m.session_id, instructor: m.instructor_name, sent: true });
    } catch (e) {
      results.push({ session_id: m.session_id, instructor: m.instructor_name, sent: false, error: e.message });
    }
  }

  return sendJson(res, 200, {
    checked: (reminders || []).length,
    sent: results.filter(r => r.sent).length,
    results,
  });
};
