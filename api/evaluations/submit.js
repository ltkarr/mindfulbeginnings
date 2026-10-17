'use strict';

// Public course evaluation submissions from the hidden course-evaluation.html page.
//
// POST /api/evaluations/submit
//   {
//     course: string (required),
//     instructor: string (required),
//     session_date: "YYYY-MM-DD" (optional),
//     info_clear: boolean (optional),
//     ready_on_time: boolean (optional),
//     registration_ease: 1-5 (optional),
//     instructor_engagement: 1-5 (optional),
//     safe_environment: 1-5 (optional),
//     recommend_likelihood: 1-5 (optional),
//     best_part: string (optional),
//     improvements: string (optional),
//     website: string (honeypot — must be empty)
//   }
//
// Auth: none. The anon key has no access to course_evaluations (RLS); this
// route inserts with the service role. A honeypot field rejects bots.
//
// Required Vercel environment variables:
//   SUPABASE_SERVICE_ROLE_KEY — already set (PayPal capture / reminders use it).

const { sendJson, readJson, preflight } = require('../../lib/http');
const { supabaseConfig } = require('../../lib/class-request-submit-config');

function cleanStr(v, max) {
  const s = String(v == null ? '' : v).trim();
  return s.length > max ? s.slice(0, max) : s;
}

function cleanRating(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  if (!Number.isInteger(n) || n < 1 || n > 5) return null;
  return n;
}

function cleanBool(v) {
  if (v === true || v === 'true' || v === 'yes') return true;
  if (v === false || v === 'false' || v === 'no') return false;
  return null;
}

function cleanDate(v) {
  const s = cleanStr(v, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + 'T12:00:00');
  if (isNaN(d.getTime())) return null;
  return s;
}

function svcHeaders(cfg) {
  const key = cfg.serviceKey;
  const h = { 'Content-Type': 'application/json', Prefer: 'return=minimal' };
  h['apikey'] = key;
  h['Authorization'] = 'Bearer ' + key;
  return h;
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const body = await readJson(req);

    // Honeypot: bots fill it, humans never see it.
    if (body.website) return sendJson(res, 200, { ok: true });

    const course = cleanStr(body.course, 120);
    const instructor = cleanStr(body.instructor, 120);
    if (!course) {
      const e = new Error('Please choose the course you completed.');
      e.status = 400; throw e;
    }
    if (!instructor) {
      const e = new Error('Please choose your instructor.');
      e.status = 400; throw e;
    }

    const row = {
      course: course,
      instructor: instructor,
      session_date: cleanDate(body.session_date),
      info_clear: cleanBool(body.info_clear),
      ready_on_time: cleanBool(body.ready_on_time),
      registration_ease: cleanRating(body.registration_ease),
      instructor_engagement: cleanRating(body.instructor_engagement),
      safe_environment: cleanRating(body.safe_environment),
      recommend_likelihood: cleanRating(body.recommend_likelihood),
      best_part: cleanStr(body.best_part, 2000) || null,
      improvements: cleanStr(body.improvements, 2000) || null
    };

    const cfg = supabaseConfig();
    if (!cfg.configured) {
      const e = new Error('Evaluation could not be saved right now. Please try again later.');
      e.status = 503; throw e;
    }

    const r = await fetch(cfg.url + '/rest/v1/course_evaluations', {
      method: 'POST',
      headers: svcHeaders(cfg),
      body: JSON.stringify(row)
    });
    if (!r.ok) {
      const e = new Error('Evaluation could not be saved right now. Please try again later.');
      e.status = 502; throw e;
    }

    sendJson(res, 200, { ok: true });
  } catch (err) {
    const status = err && err.status ? err.status : 500;
    const message = status === 400
      ? (err.message || 'Please check the form and try again.')
      : 'Something went wrong saving your evaluation. Please try again.';
    sendJson(res, status >= 400 && status < 600 ? status : 500, { error: message });
  }
};
