"use strict";

// Weekly instructor evaluation reports + $5/hr raise tracking.
//
// Runs on a Monday Vercel cron (see vercel.json "crons"). Each run:
//   1. Counts completed classes per instructor (session date in the past,
//      not cancelled, not on hold) via the service role.
//   2. For each instructor with 5+ newly completed classes since their last
//      report, builds an evaluation summary from course_evaluations.
//   3. Flags a $5/hr raise when the instructor has 5 new classes AND
//      "excellent" evaluations: 3+ responses averaging 4.5+ on engagement,
//      safe environment, and likelihood to recommend.
//   4. Emails the summary to Lindsay via EmailJS (reminder for HER to send
//      the update to the instructor and apply any raise in the admin
//      Instructors tab — nothing is sent to instructors automatically).
//   5. Advances the per-instructor watermark so each 5-class milestone is
//      reported exactly once.
//
// Required Vercel environment variables:
//   CRON_SECRET               — Vercel Cron sends this as Bearer <redacted>
//   SUPABASE_SERVICE_ROLE_KEY — service role (RLS bypass)
//   EMAILJS_PRIVATE_KEY       — EmailJS private key
//   EMAILJS_TEMPLATE_EVAL_REPORT — the "Instructor evaluation report" template
//
// The EmailJS template receives: to_email, subject, report_html.

const { sendJson } = require('../../lib/http');
const { supabaseConfig } = require('../../lib/class-request-submit-config');

const EMAILJS_SERVICE_ID = 'service_delt0r4';
const EMAILJS_PUBLIC_KEY = 'FKuVu4SN8eXJ1cOYM';
const REPORT_TO = 'lindsay@mindfulbeginnings.org';
const CLASSES_PER_REPORT = 5;
const RAISE_AMOUNT = 5;
const EXCELLENT_AVG = 4.5;
const EXCELLENT_MIN_RESPONSES = 3;

function sbHeaders(cfg) {
  const key = cfg.serviceKey;
  return { Accept: 'application/json', apikey: key, Authorization: 'Bearer ' + key };
}

async function sbGet(cfg, path) {
  const r = await fetch(cfg.url + '/rest/v1/' + path, { headers: sbHeaders(cfg) });
  if (!r.ok) throw new Error('Supabase GET ' + path + ' failed: ' + r.status);
  return r.json();
}

async function sbUpsert(cfg, path, body) {
  const r = await fetch(cfg.url + '/rest/v1/' + path, {
    method: 'POST',
    headers: Object.assign(sbHeaders(cfg), {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    }),
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error('Supabase upsert ' + path + ' failed: ' + r.status);
}

function avg(nums) {
  const vs = nums.map(Number).filter(function (n) { return n >= 1 && n <= 5; });
  if (!vs.length) return null;
  return vs.reduce(function (a, b) { return a + b; }, 0) / vs.length;
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

async function sendReportEmail(privateKey, templateId, subject, reportHtml) {
  const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      service_id: EMAILJS_SERVICE_ID,
      template_id: templateId,
      user_id: EMAILJS_PUBLIC_KEY,
      accessToken: privateKey,
      template_params: {
        to_email: REPORT_TO,
        subject: subject,
        report_html: reportHtml,
      },
    }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(function () { return ''; });
    throw new Error('EmailJS ' + res.status + ': ' + detail.slice(0, 200));
  }
}

module.exports = async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.authorization || '';
  if (!secret || auth !== 'Bearer ' + secret) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  const cfg = supabaseConfig();
  if (!cfg.configured) return sendJson(res, 500, { error: 'Supabase not configured' });
  const privateKey = process.env.EMAILJS_PRIVATE_KEY;
  const templateId = process.env.EMAILJS_TEMPLATE_EVAL_REPORT;
  if (!privateKey || !templateId) {
    return sendJson(res, 500, { error: 'EmailJS not configured (EMAILJS_PRIVATE_KEY / EMAILJS_TEMPLATE_EVAL_REPORT).' });
  }

  const today = new Date().toISOString().slice(0, 10);

  let instructors, sessions, watermarks, evaluations;
  try {
    instructors = await sbGet(cfg,
      'instructors?select=id,name,hourly_rate&or=(is_active.is.true,is_active.is.null)&archived_at=is.null');
    sessions = await sbGet(cfg,
      'sessions?select=instructor_id,date&date=lt.' + today + '&is_cancelled=is.false&is_hold=is.false&instructor_id=not.is.null');
    watermarks = await sbGet(cfg, 'instructor_eval_watermarks?select=*');
    evaluations = await sbGet(cfg, 'course_evaluations?select=*');
  } catch (e) {
    return sendJson(res, 500, { error: 'Could not load data.', detail: e.message });
  }

  const wmById = {};
  (watermarks || []).forEach(function (w) { wmById[w.instructor_id] = w; });

  const completedById = {};
  (sessions || []).forEach(function (s) {
    if (!s.instructor_id) return;
    completedById[s.instructor_id] = (completedById[s.instructor_id] || 0) + 1;
  });

  const reports = [];
  (instructors || []).forEach(function (inst) {
    const total = completedById[inst.id] || 0;
    const wm = wmById[inst.id] || { classes_reported: 0, raises_given: 0 };
    const fresh = total - (wm.classes_reported || 0);
    if (fresh < CLASSES_PER_REPORT) return;

    const iname = String(inst.name || '').trim().toLowerCase();
    const evals = (evaluations || []).filter(function (e) {
      return String(e.instructor || '').trim().toLowerCase() === iname;
    });
    const aEng = avg(evals.map(function (e) { return e.instructor_engagement; }));
    const aSafe = avg(evals.map(function (e) { return e.safe_environment; }));
    const aRec = avg(evals.map(function (e) { return e.recommend_likelihood; }));
    const aReg = avg(evals.map(function (e) { return e.registration_ease; }));
    const pctRec = evals.length
      ? Math.round(evals.filter(function (e) { return Number(e.recommend_likelihood) >= 4; }).length / evals.length * 100)
      : null;
    const excellent = evals.length >= EXCELLENT_MIN_RESPONSES &&
      aEng != null && aEng >= EXCELLENT_AVG &&
      aSafe != null && aSafe >= EXCELLENT_AVG &&
      aRec != null && aRec >= EXCELLENT_AVG;

    const comments = evals
      .filter(function (e) { return (e.best_part && String(e.best_part).trim()) || (e.improvements && String(e.improvements).trim()); })
      .slice(0, 8);

    reports.push({
      instructor_id: inst.id,
      instructor_name: inst.name,
      hourly_rate: Number(inst.hourly_rate) || 50,
      total_completed: total,
      new_classes: fresh,
      eval_count: evals.length,
      avg_engagement: aEng, avg_safe: aSafe, avg_recommend: aRec, avg_registration: aReg,
      pct_recommend: pctRec,
      comments: comments.map(function (e) {
        return { date: (e.created_at || '').slice(0, 10), course: e.course, best: e.best_part, improve: e.improvements };
      }),
      qualifies_for_raise: excellent,
      raises_given: wm.raises_given || 0,
    });
  });

  if (!reports.length) {
    return sendJson(res, 200, { ok: true, reports: 0 });
  }

  const fmt = function (v) { return v == null ? '—' : v.toFixed(1); };
  const sections = reports.map(function (r) {
    const raiseLine = r.qualifies_for_raise
      ? '<p style="background:#e8f5e9;padding:10px 14px;border-radius:8px"><b>Qualifies for a $' + RAISE_AMOUNT + '/hr raise</b> ' +
        '(raise #' + (r.raises_given + 1) + ', excellent evaluations). ' +
        'Bump <b>' + esc(r.instructor_name) + '</b> from $' + r.hourly_rate + '/hr to $' + (r.hourly_rate + RAISE_AMOUNT) + '/hr in the admin Instructors tab.</p>'
      : '<p style="background:#fff8e1;padding:10px 14px;border-radius:8px">Does not qualify for a raise this cycle ' +
        '(needs ' + EXCELLENT_MIN_RESPONSES + '+ evaluations averaging ' + EXCELLENT_AVG + '+).</p>';
    const commentHtml = r.comments.length
      ? '<ul>' + r.comments.map(function (c) {
          return '<li><i>' + esc(c.date) + ' · ' + esc(c.course || '') + '</i><br>' +
            (c.best ? '<b>Best part:</b> ' + esc(c.best) + '<br>' : '') +
            (c.improve ? '<b>Improve:</b> ' + esc(c.improve) : '') + '</li>';
        }).join('') + '</ul>'
      : '<p><i>No written comments yet.</i></p>';
    return '<h2>' + esc(r.instructor_name) + ' — ' + r.new_classes + ' new completed classes</h2>' +
      '<p><b>' + r.eval_count + '</b> evaluations · ' +
      'Engagement ' + fmt(r.avg_engagement) + ' · Safe environment ' + fmt(r.avg_safe) + ' · ' +
      'Recommend ' + fmt(r.avg_recommend) + ' · Registration ' + fmt(r.avg_registration) +
      (r.pct_recommend != null ? ' · ' + r.pct_recommend + '% would recommend' : '') + '</p>' +
      raiseLine +
      '<h3>Recent comments</h3>' + commentHtml + '<hr>';
  }).join('');

  const names = reports.map(function (r) { return r.instructor_name; }).join(', ');
  const subject = 'Instructor evaluation update: ' + names;
  const reportHtml = '<p>Hi Lindsay,</p>' +
    '<p>These instructors each completed ' + CLASSES_PER_REPORT + '+ new classes since their last update. Time to send them their evaluation summary:</p>' +
    sections +
    '<p>— Ember</p>';

  try {
    await sendReportEmail(privateKey, templateId, subject, reportHtml);
  } catch (e) {
    return sendJson(res, 500, { error: 'Could not send report email.', detail: e.message });
  }

  try {
    await sbUpsert(cfg, 'instructor_eval_watermarks', reports.map(function (r) {
      return {
        instructor_id: r.instructor_id,
        classes_reported: r.total_completed,
        raises_given: r.raises_given + (r.qualifies_for_raise ? 1 : 0),
        last_reported_at: new Date().toISOString(),
      };
    }));
  } catch (e) {
    return sendJson(res, 200, { ok: true, reports: reports.length, warning: 'Email sent but watermark update failed: ' + e.message });
  }

  return sendJson(res, 200, { ok: true, reports: reports.length, instructors: names });
};
