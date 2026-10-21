'use strict';

// Automated day-before class reminders for instructors, plus the daily
// new-job-alert digest for subscribed instructors.
//
// Runs on a daily Vercel cron (see vercel.json "crons"). Each run:
//   1. Calls the get_tomorrow_reminders() RPC — every session happening
//      tomorrow with an assigned instructor, not already reminded today.
//   2. Sends each instructor their reminder through EmailJS.
//   3. Logs the send via log_reminder_sent() so a re-run never double-sends.
//   4. Job alerts: finds sessions created in the last 48 hours that are still
//      open, and emails each OPTED-IN instructor (portal → My Profile →
//      "Email me when new jobs are posted") only about jobs they are eligible
//      to teach — the same canTeachSession rules as their Open jobs board
//      (lib/job-eligibility.js). One digest email per instructor per day, only
//      when there is something new. Watermarked in job_alert_notifications so
//      a re-run never double-sends.
//
// Required Vercel environment variables:
//   CRON_SECRET             — Vercel Cron sends this automatically as a
//                             Bearer token; requests without it get a 401.
//   EMAILJS_PRIVATE_KEY     — EmailJS private key (EmailJS dashboard → Account → General).
//   EMAILJS_TEMPLATE_REMINDER — the "Instructor class reminder" template ID.
//   EMAILJS_TEMPLATE_JOB_ALERTS — the "New job alerts" template ID. If unset,
//                             the reminder section still runs; job alerts are
//                             skipped until Lindsay finishes that setup step.
//
// The reminder template receives:
//   instructor_name, instructor_email, course, class_date, class_time,
//   location_text, student_count, portal_url
// The job-alert template receives:
//   instructor_name, instructor_email, intro_line, jobs_html, portal_url
//
// One-time setup for Lindsay is in docs/portal-reminder-setup.md (reminders)
// and docs/job-alerts-setup.md (job alerts).

const { sendJson } = require('../lib/http');
const INSTRUCTOR_PORTAL_URL = require('../lib/instructor-portal-url');
const { canTeachSession, isOpenSession, todayET } = require('../lib/job-eligibility');

const SUPABASE_URL = 'https://evninlytzhtacanrguhx.supabase.co';
// Reminder lookup returns instructor names and emails. After the lockdown
// migration, anon cannot call those functions. Use the service role, which
// PayPal capture already requires on this project. The anon key remains only
// as a fallback for a deploy that lands before that migration runs.
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2bmlubHl0emh0YWNhbnJndWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTE1MzQsImV4cCI6MjA5MzIyNzUzNH0.7sr0P9BmcPW_cJgWZwndVtaHsZXsbVCcE0Pk1gm3VP8';
function supabaseKey() {
  return (process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim() || SUPABASE_ANON_KEY;
}
const EMAILJS_SERVICE_ID = 'service_delt0r4';
const EMAILJS_PUBLIC_KEY = 'FKuVu4SN8eXJ1cOYM';

async function rpc(name, args) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${name}`, {
    method: 'POST',
    headers: {
      apikey: supabaseKey(),
      Authorization: `Bearer ${supabaseKey()}`,
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
        portal_url: INSTRUCTOR_PORTAL_URL,
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`EmailJS ${res.status}: ${detail.slice(0, 200)}`);
  }
}

// ─── NEW-JOB ALERT DIGEST ─────────────────────────────────────────────────
// Opt-in only: instructors subscribe in the portal (My Profile). Each run
// emails every subscriber about open sessions created in the last 48 hours
// that they are eligible to teach. The 48-hour window (not "since last run")
// plus the job_alert_notifications watermark means a failed or retried run
// neither misses jobs nor double-sends them.

const JOB_ALERT_WINDOW_MS = 48 * 60 * 60 * 1000;

async function restGet(path) {
  const key = supabaseKey();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: { apikey: key, Authorization: `Bearer ${key}` },
  });
  if (!res.ok) throw new Error(`REST ${path.split('?')[0]} failed with ${res.status}`);
  return res.json();
}

function formatJobDate(dateStr) {
  const d = new Date(String(dateStr || '') + 'T12:00:00');
  if (isNaN(d.getTime())) return String(dateStr || '');
  return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function jobLocationLine(s) {
  if (s.is_virtual) return 'Virtual (Zoom)';
  const csz = [s.city, s.state].filter(Boolean).join(', ') + (s.zip ? ' ' + s.zip : '');
  const parts = [s.location, s.host_address, csz.trim()].filter(p => p && String(p).trim());
  return parts.join(', ') || 'Location to be confirmed';
}

function escapeHtml(str) {
  return String(str || '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function jobAlertHtml(s) {
  const when = escapeHtml(formatJobDate(s.date) + (s.time ? ' · ' + s.time : ''));
  return '<div style="margin-bottom:12px;padding:12px 14px;border:1px solid #e2e8f0;border-radius:8px;background:#ffffff">' +
    '<div style="font-weight:700;color:#1E3161;font-size:15px;margin-bottom:4px">' + escapeHtml(s.course || 'Session') + '</div>' +
    '<div style="font-size:14px;color:#334155">' + when + '</div>' +
    '<div style="font-size:13px;color:#64748b">' + escapeHtml(jobLocationLine(s)) + '</div>' +
    '</div>';
}

async function sendJobAlertEmail(instr, jobs, templateId, privateKey) {
  const n = jobs.length;
  const intro = n === 1
    ? '1 new job was posted that you\u2019re eligible to teach:'
    : n + ' new jobs were posted that you\u2019re eligible to teach:';
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: templateId,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: privateKey,
      template_params: {
        instructor_name: instr.name,
        instructor_email: instr.email,
        intro_line: intro,
        jobs_html: jobs.map(jobAlertHtml).join(''),
        portal_url: INSTRUCTOR_PORTAL_URL,
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`EmailJS ${res.status}: ${detail.slice(0, 200)}`);
  }
}

async function runJobAlerts(privateKey) {
  const templateId = process.env.EMAILJS_TEMPLATE_JOB_ALERTS;
  if (!templateId) return { skipped: true, reason: 'EMAILJS_TEMPLATE_JOB_ALERTS not set' };

  const cutoff = Date.now() - JOB_ALERT_WINDOW_MS;
  const [subscribers, sessions, claimed] = await Promise.all([
    restGet('instructors?select=id,name,email,is_rn,speaks_spanish,safe_sitter_certified,safe_sitter_training_date,is_lead_teacher,is_active,job_alerts_enabled&job_alerts_enabled=eq.true'),
    restGet('sessions?select=id,course,date,time,location,city,state,zip,host_address,is_virtual,owner_taught,is_hold,is_cancelled,is_custom_job,requires_rn,requires_safe_sitter,requires_spanish,created_at&created_at=gte.' + cutoff),
    restGet('job_data?select=session_id&instructor_id=not.is.null'),
  ]);

  const today = todayET();
  const claimedIds = new Set((claimed || []).map(r => r.session_id));
  const open = (sessions || []).filter(s => isOpenSession(s, today, claimedIds));
  if (!open.length || !(subscribers || []).length) {
    return { sent: 0, instructors: [], skipped: [], jobsConsidered: open.length };
  }

  const watermarks = await restGet(
    'job_alert_notifications?select=instructor_id,session_id&session_id=in.(' + open.map(s => s.id).join(',') + ')'
  );
  const notified = new Set((watermarks || []).map(r => r.instructor_id + ':' + r.session_id));

  const sent = [];
  const skipped = [];
  const watermarkRows = [];
  for (const instr of subscribers) {
    // Active + has an email (same mapping the portal/admin use).
    const active = instr.is_active === undefined || instr.is_active === null ? true : !!instr.is_active;
    if (!active || !instr.email || !instr.email.includes('@')) {
      skipped.push({ instructor: instr.name, reason: !active ? 'inactive' : 'no email' });
      continue;
    }
    const fresh = open.filter(s => canTeachSession(s, instr) && !notified.has(instr.id + ':' + s.id));
    if (!fresh.length) continue;
    try {
      await sendJobAlertEmail(instr, fresh, templateId, privateKey);
      for (const s of fresh) watermarkRows.push({ instructor_id: instr.id, session_id: s.id });
      sent.push({ instructor: instr.name, jobs: fresh.length });
    } catch (e) {
      skipped.push({ instructor: instr.name, reason: e.message });
    }
  }

  if (watermarkRows.length) {
    const key = supabaseKey();
    const res = await fetch(`${SUPABASE_URL}/rest/v1/job_alert_notifications`, {
      method: 'POST',
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        Prefer: 'resolution=merge-duplicates',
      },
      body: JSON.stringify(watermarkRows),
    });
    if (!res.ok) throw new Error(`watermark write failed with ${res.status}`);
  }

  return { sent: sent.length, instructors: sent, skipped, jobsConsidered: open.length };
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

  // New-job alerts run independently — a failure here must not take down the
  // day-before reminders above, and vice versa.
  let jobAlerts = { skipped: true, reason: 'not attempted' };
  try {
    jobAlerts = await runJobAlerts(privateKey);
  } catch (e) {
    jobAlerts = { error: e.message };
  }

  return sendJson(res, 200, {
    checked: (reminders || []).length,
    sent: results.filter(r => r.sent).length,
    results,
    jobAlerts,
  });
};
