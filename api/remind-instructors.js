'use strict';

// Automated day-before class reminders for instructors, plus the daily
// new-job-alert digest for subscribed instructors.
//
// Runs on a daily Vercel cron (see vercel.json "crons"). Each run:
//   1. Calls the get_tomorrow_reminders() RPC — every session happening
//      tomorrow with an assigned instructor, not already reminded today.
//   2. Sends each instructor their reminder through EmailJS.
//   3. Logs the send via log_reminder_sent() so a re-run never double-sends.
//   4. Job alerts: emails each OPTED-IN instructor (job_alerts_enabled = true)
//      about open jobs created after their job_alerts_last_digest_at cursor.
//      Same canTeachSession rules as the Open jobs board. At most one digest
//      per instructor per Eastern calendar day (job_alert_digests). A re-run
//      never double-sends a session (job_alert_notifications). Existing jobs
//      are not backfilled: the cursor is stamped before this section is enabled.
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
//   instructor_name, instructor_email, intro_line, jobs_html, message,
//   portal_url, unsubscribe_note
// jobs_html already ends with the turn-off instruction and portal link.
// Use {{{jobs_html}}} (triple braces) so EmailJS does not escape the markup.
//
// One-time setup for Lindsay is in docs/portal-reminder-setup.md (reminders)
// and docs/job-alerts-setup.md (job alerts).

const { sendJson } = require('../lib/http');
const INSTRUCTOR_PORTAL_URL = require('../lib/instructor-portal-url');
const { canTeachSession, isOpenSession, todayET } = require('../lib/job-eligibility');
const sessionPlace = require('../js/session-place');

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
// Opt-in only (job_alerts_enabled = true, default false). Each digest includes
// only open, eligible jobs posted after that instructor's last digest cursor.
// One digest per instructor per Eastern day. The email tells them how to turn
// it off on the portal Home screen.

const TEST_INSTRUCTOR_ID = '6677caa4-44d2-466b-a406-efdf41affba8';
const TEST_INSTRUCTOR_EMAIL = 'lindsay+testinstructor@mindfulbeginnings.org';
const UNSUBSCRIBE_NOTE = 'You are getting this because you turned on new-job alerts. To stop these emails, open the instructor portal and turn off New job alerts on your Home screen. The same switch is under My account.';

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
  if (!s) return 'Location to be confirmed';
  return sessionPlace.plain(s) || 'Location to be confirmed';
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

function unsubscribeHtml() {
  return '<p style="margin:16px 0 0;font-size:13px;line-height:1.5;color:#64748b">' + escapeHtml(UNSUBSCRIBE_NOTE) + '</p>' +
    '<p style="margin:8px 0 0;font-size:13px"><a href="' + INSTRUCTOR_PORTAL_URL + '">Turn off new-job alerts</a></p>';
}

function jobsBodyHtml(jobs) {
  return jobs.map(jobAlertHtml).join('') + unsubscribeHtml();
}

function jobsPlainText(jobs, intro) {
  const lines = jobs.map(function (s) {
    const when = formatJobDate(s.date) + (s.time ? ' · ' + s.time : '');
    return (s.course || 'Session') + '\n' + when + '\n' + jobLocationLine(s);
  });
  return [intro, '', lines.join('\n\n'), '', UNSUBSCRIBE_NOTE, INSTRUCTOR_PORTAL_URL].join('\n');
}

function jobAlertIntro(jobs, sample) {
  if (sample && !jobs.length) {
    return 'This is a delivery test of new-job alerts. No open job was available to include.';
  }
  if (sample) {
    const n = jobs.length;
    return n === 1
      ? 'This is a delivery test. Here is 1 open job currently on the board (not a backfill of your live subscription):'
      : 'This is a delivery test. Here are ' + n + ' open jobs currently on the board (not a backfill of your live subscription):';
  }
  const n = jobs.length;
  return n === 1
    ? '1 new job was posted that you\u2019re eligible to teach:'
    : n + ' new jobs were posted that you\u2019re eligible to teach:';
}

async function sendJobAlertEmail(instr, jobs, templateId, privateKey, sample) {
  const intro = jobAlertIntro(jobs, sample);
  const html = jobsBodyHtml(jobs);
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
        jobs_html: html,
        message: jobsPlainText(jobs, intro),
        portal_url: INSTRUCTOR_PORTAL_URL,
        unsubscribe_note: UNSUBSCRIBE_NOTE,
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => '');
    throw new Error(`EmailJS ${res.status}: ${detail.slice(0, 200)}`);
  }
}

function markerMs(instr) {
  const raw = instr && instr.job_alerts_last_digest_at;
  if (raw == null || raw === '') return Date.now();
  const t = Date.parse(raw);
  return isNaN(t) ? Date.now() : t;
}

function sessionCreatedMs(session) {
  const n = Number(session && session.created_at);
  return isFinite(n) ? n : 0;
}

async function restWrite(path, method, body) {
  const key = supabaseKey();
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    method: method,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: body == null ? undefined : JSON.stringify(body),
  });
  const detail = await res.text().catch(() => '');
  return { ok: res.ok, status: res.status, detail: detail };
}

async function claimDigestDay(instructorId, digestDate) {
  const result = await restWrite('job_alert_digests', 'POST', {
    instructor_id: instructorId,
    digest_date: digestDate,
  });
  if (result.ok) return true;
  if (result.status === 409 || /23505|duplicate key/i.test(result.detail || '')) return false;
  throw new Error(`digest claim failed with ${result.status}`);
}

async function releaseDigestDay(instructorId, digestDate) {
  const id = encodeURIComponent(instructorId);
  await restWrite(
    'job_alert_digests?instructor_id=eq.' + id + '&digest_date=eq.' + digestDate,
    'DELETE'
  );
}

const SESSION_ALERT_SELECT = 'id,course,date,time,location,city,state,zip,host_address,is_virtual,owner_taught,is_hold,is_cancelled,is_custom_job,requires_rn,requires_safe_sitter,requires_spanish,created_at';
const INSTRUCTOR_ALERT_SELECT = 'id,name,email,is_rn,speaks_spanish,safe_sitter_certified,safe_sitter_training_date,is_lead_teacher,is_active,job_alerts_enabled,job_alerts_last_digest_at';

function lockedTestRecipient(opts) {
  const email = String(opts.onlyEmail || '').trim().toLowerCase();
  return opts.onlyInstructorId === TEST_INSTRUCTOR_ID && email === TEST_INSTRUCTOR_EMAIL;
}

async function runJobAlerts(privateKey, opts) {
  opts = opts || {};
  const templateId = process.env.EMAILJS_TEMPLATE_JOB_ALERTS;
  if (!templateId) return { skipped: true, reason: 'EMAILJS_TEMPLATE_JOB_ALERTS not set' };

  if ((opts.onlyEmail || opts.onlyInstructorId || opts.allowUnsubscribedTest || opts.sampleIfEmpty) && !lockedTestRecipient(opts)) {
    return { sent: 0, skipped: true, reason: 'test send is locked to the named test instructor' };
  }

  const instructorPath = opts.allowUnsubscribedTest
    ? ('instructors?select=' + INSTRUCTOR_ALERT_SELECT + '&id=eq.' + encodeURIComponent(TEST_INSTRUCTOR_ID))
    : ('instructors?select=' + INSTRUCTOR_ALERT_SELECT + '&job_alerts_enabled=eq.true');

  let subscribers = await restGet(instructorPath);
  subscribers = (subscribers || []).filter(function (instr) {
    if (instr && instr.job_alerts_enabled === true) return true;
    return !!(opts.allowUnsubscribedTest && instr && lockedTestRecipient(opts) && instr.id === TEST_INSTRUCTOR_ID
      && String(instr.email || '').trim().toLowerCase() === TEST_INSTRUCTOR_EMAIL);
  });
  if (opts.onlyEmail) {
    subscribers = subscribers.filter(function (instr) {
      return instr.id === TEST_INSTRUCTOR_ID
        && String(instr.email || '').trim().toLowerCase() === TEST_INSTRUCTOR_EMAIL;
    });
  }
  if (!subscribers.length) {
    return { sent: 0, instructors: [], skipped: [], jobsConsidered: 0 };
  }

  const floor = subscribers.reduce(function (min, instr) { return Math.min(min, markerMs(instr)); }, Date.now());
  const [sessions, claimed] = await Promise.all([
    restGet('sessions?select=' + SESSION_ALERT_SELECT + '&created_at=gt.' + floor),
    restGet('job_data?select=session_id&instructor_id=not.is.null'),
  ]);

  const today = todayET();
  const claimedIds = new Set((claimed || []).map(r => r.session_id));
  const open = (sessions || []).filter(s => isOpenSession(s, today, claimedIds) && sessionCreatedMs(s) > floor);

  let samplePool = [];
  if (opts.sampleIfEmpty) {
    samplePool = await restGet('sessions?select=' + SESSION_ALERT_SELECT + '&is_cancelled=eq.false&is_hold=eq.false&order=created_at.desc&limit=40');
  }

  let notified = new Set();
  if (open.length) {
    const watermarks = await restGet(
      'job_alert_notifications?select=instructor_id,session_id&session_id=in.(' + open.map(s => s.id).join(',') + ')'
    );
    notified = new Set((watermarks || []).map(r => r.instructor_id + ':' + r.session_id));
  }

  const sent = [];
  const skipped = [];
  for (const instr of subscribers) {
    const active = instr.is_active === undefined || instr.is_active === null ? true : !!instr.is_active;
    const emailOk = !!(instr.email && String(instr.email).includes('@'));
    if ((!active || !emailOk) && !(opts.allowUnsubscribedTest && instr.id === TEST_INSTRUCTOR_ID)) {
      skipped.push({ instructor: instr.name, reason: !active ? 'inactive' : 'no email' });
      continue;
    }
    const cursor = markerMs(instr);
    let fresh = open.filter(s => sessionCreatedMs(s) > cursor && canTeachSession(s, instr) && !notified.has(instr.id + ':' + s.id));
    let sample = false;
    if (!fresh.length && opts.sampleIfEmpty && instr.id === TEST_INSTRUCTOR_ID) {
      fresh = (samplePool || []).filter(s => isOpenSession(s, today, claimedIds) && canTeachSession(s, instr)).slice(0, 2);
      sample = true;
    }
    if (!fresh.length && !sample) continue;

    let claimedDay = false;
    try {
      claimedDay = await claimDigestDay(instr.id, today);
      if (!claimedDay) {
        skipped.push({ instructor: instr.name, reason: 'already sent today' });
        continue;
      }
      await sendJobAlertEmail(instr, fresh, templateId, privateKey, sample);
      if (!sample) {
        const patch = await restWrite('instructors?id=eq.' + encodeURIComponent(instr.id), 'PATCH', {
          job_alerts_last_digest_at: new Date().toISOString(),
        });
        if (!patch.ok) throw new Error('cursor update failed with ' + patch.status);
        if (fresh.length) {
          const wm = await restWrite('job_alert_notifications', 'POST', fresh.map(function (s) {
            return { instructor_id: instr.id, session_id: s.id };
          }));
          if (!wm.ok && wm.status !== 409 && !/23505|duplicate key/i.test(wm.detail || '')) {
            throw new Error('watermark write failed with ' + wm.status);
          }
        }
      }
      sent.push({ instructor: instr.name, jobs: fresh.length, sample: sample });
    } catch (e) {
      if (claimedDay) {
        try { await releaseDigestDay(instr.id, today); } catch (ignore) { void ignore; }
      }
      skipped.push({ instructor: instr.name, reason: e.message });
    }
  }

  return { sent: sent.length, instructors: sent, skipped, jobsConsidered: open.length };
}

async function handler(req, res) {
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
}

handler.runJobAlerts = runJobAlerts;
module.exports = handler;
