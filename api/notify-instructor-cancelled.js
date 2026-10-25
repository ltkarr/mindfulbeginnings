'use strict';

// Automatic instructor email when Lindsay cancels a session in admin.html.
//
// POST /api/notify-instructor-cancelled  { session_id }
//
// Auth: the caller's Supabase user JWT as a Bearer <redacted> Admin.html sends the
// token from its own signed-in session; the route verifies it against the
// Supabase Auth API and only allows configured admin emails through.
//
// What it does:
//   1. Verifies the caller is an admin.
//   2. Loads the session (service role). Refuses unless is_cancelled is true,
//      so a stray call can never email about a live class.
//   3. Loads every assigned instructor with an email address.
//   4. Sends each one the cancellation notice through EmailJS.
//
// Required Vercel environment variables:
//   SUPABASE_SERVICE_ROLE_KEY  — already set (PayPal capture / reminders use it).
//   EMAILJS_PRIVATE_KEY        — already set (day-before reminders use it).
//   EMAILJS_TEMPLATE_CANCELLATION — the "Instructor cancellation notice"
//      EmailJS template ID. See docs/cancellation-notify-setup.md.
//   ADMIN_EMAILS               — comma-separated admin emails allowed to trigger
//      this route. Defaults to lindsay@mindfulbeginnings.org.

const { sendJson } = require('../lib/http');
const INSTRUCTOR_PORTAL_URL = require('../lib/instructor-portal-url');

const SUPABASE_URL = 'https://evninlytzhtacanrguhx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2bmlubHl0emh0YWNhbnJndWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTE1MzQsImV4cCI6MjA5MzIyNzUzNH0.7sr0P9BmcPW_cJgWZwndVtaHsZXsbVCcE0Pk1gm3VP8';
const EMAILJS_SERVICE_ID = 'service_delt0r4';
const EMAILJS_PUBLIC_KEY = 'FKuVu4SN8eXJ1cOYM';

function serviceKey() {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
}

function adminEmails() {
  const raw = (process.env.ADMIN_EMAILS || 'lindsay@mindfulbeginnings.org,ltkarr@gmail.com').trim();
  return raw.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

async function verifyAdmin(bearer) {
  if (!bearer) return null;
  const res = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: { apikey: SUPABASE_ANON_KEY, 'Authorization': `Bearer ${bearer}` },
  });
  if (!res.ok) return null;
  const user = await res.json().catch(() => null);
  const email = user && user.email ? String(user.email).toLowerCase() : '';
  return adminEmails().includes(email) ? email : null;
}

async function sbGet(path, key) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`Supabase GET ${path} failed with ${res.status}`);
  return res.json();
}

function fmtDate(iso) {
  if (!iso) return 'the scheduled date';
  const d = new Date(iso + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

async function sendCancellationEmail(instr, sess, templateId, privateKey) {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: templateId,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: privateKey,
      template_params: {
        instructor_name: instr.name || 'there',
        instructor_email: instr.email,
        course: sess.course || 'class',
        class_date: fmtDate(sess.date),
        class_time: sess.time || 'TBD',
        location_text: sess.location || 'TBD',
        cancel_reason: sess.cancel_reason || 'low enrollment',
        portal_url: INSTRUCTOR_PORTAL_URL,
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`EmailJS ${res.status}: ${detail.slice(0, 200)}`);
  }
}

module.exports = async function handler(req, res) {
  if (!req || req.method !== 'POST') {
    return sendJson(res, 405, { ok: false, reason: 'method' });
  }

  const auth = req.headers.authorization || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  const caller = await verifyAdmin(bearer).catch(() => null);
  if (!caller) {
    return sendJson(res, 401, { ok: false, error: 'Unauthorized' });
  }

  let body = {};
  try {
    const chunks = [];
    for await (const c of req) chunks.push(c);
    body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}');
  } catch (e) {
    return sendJson(res, 400, { ok: false, error: 'Bad JSON body' });
  }
  const sessionId = body.session_id;
  if (!sessionId) {
    return sendJson(res, 400, { ok: false, error: 'session_id is required' });
  }

  const privateKey = process.env.EMAILJS_PRIVATE_KEY;
  const templateId = process.env.EMAILJS_TEMPLATE_CANCELLATION;
  if (!privateKey || !templateId) {
    return sendJson(res, 500, {
      ok: false,
      error: 'Cancellation email is not configured yet (EMAILJS_PRIVATE_KEY / EMAILJS_TEMPLATE_CANCELLATION).',
    });
  }
  const key = serviceKey();
  if (!key) {
    return sendJson(res, 500, { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY is not configured.' });
  }

  let rows;
  try {
    rows = await sbGet(
      `sessions?select=id,course,date,time,location,instructor_id,second_instructor_id,owner_taught,is_cancelled,cancel_reason&id=eq.${encodeURIComponent(sessionId)}`,
      key
    );
  } catch (e) {
    return sendJson(res, 500, { ok: false, error: 'Could not load the session.', detail: e.message });
  }
  const sess = rows && rows[0];
  if (!sess) {
    return sendJson(res, 404, { ok: false, error: 'Session not found.' });
  }
  if (!sess.is_cancelled) {
    // Safety: never email about a session that is not actually cancelled.
    return sendJson(res, 409, { ok: false, error: 'Session is not cancelled; no email sent.' });
  }

  const instrIds = [sess.instructor_id, sess.second_instructor_id].filter(Boolean);
  let instructors = [];
  if (instrIds.length) {
    try {
      instructors = await sbGet(
        `instructors?select=id,name,email&id=in.(${instrIds.map(encodeURIComponent).join(',')})`,
        key
      );
    } catch (e) {
      return sendJson(res, 500, { ok: false, error: 'Could not load instructors.', detail: e.message });
    }
  }
  const recipients = instructors.filter(i => i.email && String(i.email).includes('@'));

  const sent = [];
  const failed = [];
  for (const instr of recipients) {
    try {
      await sendCancellationEmail(instr, sess, templateId, privateKey);
      sent.push({ id: instr.id, name: instr.name, email: instr.email });
    } catch (e) {
      failed.push({ id: instr.id, name: instr.name, email: instr.email, error: e.message });
    }
  }

  return sendJson(res, 200, { ok: true, sent, failed });
};
