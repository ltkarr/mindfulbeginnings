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
//     website: string (honeypot, must be empty)
//   }
//
// Auth: none. The anon key has no access to course_evaluations (RLS); this
// route inserts with the service role. A honeypot field rejects bots.
//
// This function also accepts instructor onboarding quiz results
// (POST with form: 'onboarding' from instructor-onboarding.html), which
// insert into onboarding_results instead. The Vercel Hobby plan caps the
// project at 12 Serverless Functions, so the public form endpoints share
// this one; the pass mark is recomputed server-side at 80%.
//
// Safe & Ready Families grant answers use form: 'srf-grant' and part A, B,
// or C. They insert into srf_grant_responses. Nothing is emailed from here.
//
// Required Vercel environment variables:
//   SUPABASE_SERVICE_ROLE_KEY — already set (PayPal capture / reminders use it).

const { sendJson, readJson, preflight } = require('../../lib/http');
const { supabaseConfig } = require('../../lib/class-request-submit-config');
const srfGrant = require('../../js/srf-grant');

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

const ONBOARDING_PASS_FRACTION = 0.8; // 12 of 15 on the current quiz

function cleanAnswers(v) {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const out = {};
  for (const k of Object.keys(v).slice(0, 30)) {
    if (!/^q\d{1,2}$/.test(k)) continue;
    const n = Number(v[k]);
    if (Number.isInteger(n) && n >= 0 && n <= 9) out[k] = n;
  }
  return Object.keys(out).length ? out : null;
}

async function handleOnboarding(res, body) {
  const name = cleanStr(body.instructor_name, 120);
  const email = cleanStr(body.instructor_email, 160).toLowerCase();
  if (name.length < 2) return sendJson(res, 400, { error: 'Please enter your full name.' });
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return sendJson(res, 400, { error: 'Please enter a valid email address.' });
  }
  const total = Number(body.total);
  const score = Number(body.score);
  if (!Number.isInteger(total) || total < 1 || total > 50 ||
      !Number.isInteger(score) || score < 0 || score > total) {
    return sendJson(res, 400, { error: 'That quiz result does not look right. Please retake the quiz.' });
  }
  const row = {
    instructor_name: name,
    instructor_email: email,
    score: score,
    total: total,
    passed: score / total >= ONBOARDING_PASS_FRACTION,
    answers: cleanAnswers(body.answers)
  };
  const cfg = supabaseConfig();
  if (!cfg.configured) {
    return sendJson(res, 503, { error: 'Your result could not be saved right now. Please try again later.' });
  }
  const r = await fetch(cfg.url + '/rest/v1/onboarding_results', {
    method: 'POST',
    headers: svcHeaders(cfg),
    body: JSON.stringify(row)
  });
  if (!r.ok) {
    return sendJson(res, 502, { error: 'Your result could not be saved right now. Please try again later.' });
  }
  return sendJson(res, 200, { ok: true, passed: row.passed });
}

function cleanToken(v, max) {
  const s = cleanStr(v, max);
  return /^[A-Za-z0-9_-]+$/.test(s) ? s : '';
}

async function srfSession(cfg, code) {
  const url = cfg.url + '/rest/v1/sessions?code=eq.' + encodeURIComponent(code) +
    '&select=id,code,course,date,is_cancelled,requires_spanish&limit=1';
  const r = await fetch(url, {
    headers: { apikey: cfg.serviceKey, Authorization: 'Bearer ' + cfg.serviceKey }
  });
  if (!r.ok) return { error: 'lookup' };
  const rows = await r.json();
  return { session: rows && rows[0] ? rows[0] : null };
}

async function handleSrfGrant(res, body) {
  const part = cleanStr(body.part, 1).toUpperCase();
  if (part !== 'A' && part !== 'B' && part !== 'C') {
    return sendJson(res, 400, { error: 'Unknown survey.' });
  }
  const lang = String(body.lang || '').toLowerCase() === 'es' ? 'es' : 'en';
  const accepted = srfGrant.accept(part, body.answers, lang);
  if (!accepted.ok) return sendJson(res, 400, { error: accepted.error });

  const code = cleanToken(body.session_code, 20).toUpperCase();
  if (!code) return sendJson(res, 400, { error: 'This survey needs the class link.' });
  const cfg = supabaseConfig();
  if (!cfg.configured) {
    return sendJson(res, 503, { error: 'Your answers could not be saved right now. Please try again later.' });
  }
  const found = await srfSession(cfg, code);
  if (found.error) {
    return sendJson(res, 503, { error: 'Your answers could not be saved right now. Please try again later.' });
  }
  const session = found.session;
  if (!session || session.course !== srfGrant.COURSE || session.is_cancelled) {
    var mismatch = lang === 'es'
      ? 'Este enlace no corresponde a una clase de Safe & Ready Families.'
      : 'This survey link does not match a Safe & Ready Families class.';
    return sendJson(res, 400, { error: mismatch });
  }
  if (session.requires_spanish && accepted.answers) accepted.answers.lang = 'es';

  const email = part === 'A'
    ? cleanStr(body.email, 160).toLowerCase()
    : accepted.answers.email;
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
    return sendJson(res, 400, { error: 'Please enter the email you used to register.' });
  }
  const registrationId = cleanToken(body.registration_id, 40);
  if (part === 'A' && !registrationId) {
    return sendJson(res, 400, { error: 'Your registration could not be matched. Please try again.' });
  }

  const row = {
    part: part,
    session_id: session.id || cleanToken(body.session_id, 80) || null,
    session_code: session.code || code,
    session_date: cleanDate(session.date) || cleanDate(body.session_date),
    email: email,
    registration_id: registrationId || null,
    answers: accepted.answers
  };

  const headers = svcHeaders(cfg);
  let filter = 'part=eq.' + part + '&session_code=eq.' + encodeURIComponent(row.session_code);
  if (part === 'A') filter += '&registration_id=eq.' + encodeURIComponent(registrationId);
  else filter += '&email=eq.' + encodeURIComponent(email);
  const removed = await fetch(cfg.url + '/rest/v1/srf_grant_responses?' + filter, {
    method: 'DELETE',
    headers: headers
  });
  if (!removed.ok && removed.status !== 404) {
    return sendJson(res, 502, { error: 'Your answers could not be saved right now. Please try again later.' });
  }
  const saved = await fetch(cfg.url + '/rest/v1/srf_grant_responses', {
    method: 'POST',
    headers: headers,
    body: JSON.stringify(row)
  });
  if (!saved.ok) {
    return sendJson(res, 502, { error: 'Your answers could not be saved right now. Please try again later.' });
  }
  return sendJson(res, 200, { ok: true });
}

module.exports = async function handler(req, res) {
  if (preflight(req, res)) return;
  if (req.method !== 'POST') return sendJson(res, 405, { error: 'Method not allowed' });
  try {
    const body = await readJson(req);

    // Honeypot: bots fill it, humans never see it.
    if (body.website) return sendJson(res, 200, { ok: true });

    // Instructor onboarding quiz results share this function (see header).
    if (body.form === 'onboarding') return handleOnboarding(res, body);
    // Safe & Ready Families registration questions and the two surveys.
    if (body.form === 'srf-grant') return handleSrfGrant(res, body);

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
