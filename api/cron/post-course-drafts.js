"use strict";

// Automated post-course email drafts in Lindsay's Outlook drafts folder.
//
// Runs on a Vercel cron every 2 hours (see vercel.json "crons"). Each run:
//   1. Finds sessions whose class end time has passed within the last 3 days
//      (not cancelled, not on hold), skipping any already in the
//      post_course_draft_watermarks table.
//   2. Collects participant emails from live registrations for each session.
//   3. Loads the matching per-course post-course draft from
//      js/post-course-emails.js (or a generic fallback), and wraps it in
//      branded HTML with Google review + program evaluation buttons.
//   4. Creates an Outlook DRAFT in Lindsay's mailbox (to herself, BCC to
//      participants). NOTHING IS EVER SENT: this endpoint only calls
//      POST /users/{mailbox}/messages, which creates a draft. Lindsay
//      reviews and sends each draft herself.
//   5. Records a watermark row so each session is drafted exactly once.
//
// Required Vercel environment variables:
//   CRON_SECRET               - Vercel Cron sends this as Bearer <token>
//   SUPABASE_SERVICE_ROLE_KEY - service role (RLS bypass)
//   MS_GRAPH_TENANT_ID / MS_GRAPH_CLIENT_ID / MS_GRAPH_CLIENT_SECRET
//                             (already used for class-request drafts)

var sendJson = require('../../lib/http').sendJson;
var supabaseConfig = require('../../lib/class-request-submit-config').supabaseConfig;
var createOutlookDraft = require('../../lib/outlook-draft').createOutlookDraft;

var LINDSAY_EMAIL = 'lindsay@mindfulbeginnings.org';
var REVIEW_URL = 'https://g.page/r/Ca2jsWW-MkfvEAE/review';
var EVAL_URL = 'https://mindfulbeginnings.org/course-evaluation.html';
var LOOKBACK_DAYS = 3;
var ET_TZ = 'America/New_York';

var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ---------------------------------------------------------------------------
// Time helpers (all class times are America/New_York)
// ---------------------------------------------------------------------------

// "2026-10-17" for today in ET.
function etToday() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: ET_TZ, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(new Date());
}

// Minutes since midnight for the END of a "9:00 AM - 12:00 PM" style range.
// Returns null when no usable time is found.
function parseEndMinutes(timeStr) {
  if (!timeStr) return null;
  var parts = String(timeStr).split('-');
  var end = (parts.length > 1 ? parts[parts.length - 1] : parts[0]).trim();
  var m = end.match(/(\d{1,2})(?::(\d{2}))?\s*([aApP])\.?\s*[mM]\.?/);
  if (m) {
    var h = parseInt(m[1], 10);
    var min = m[2] ? parseInt(m[2], 10) : 0;
    var ap = m[3].toLowerCase();
    if (ap === 'p' && h !== 12) h += 12;
    if (ap === 'a' && h === 12) h = 0;
    return h * 60 + min;
  }
  var m24 = end.match(/(\d{1,2}):(\d{2})/);
  if (m24) return parseInt(m24[1], 10) * 60 + parseInt(m24[2], 10);
  return null;
}

// UTC timestamp (ms) for dateStr "YYYY-MM-DD" at `minutes` minutes past
// midnight in America/New_York. Standard iterative wall-clock conversion.
function etWallToUtcMs(dateStr, minutes) {
  var d = String(dateStr).split('-').map(Number);
  var h = Math.floor(minutes / 60), min = minutes % 60;
  var utc = Date.UTC(d[0], d[1] - 1, d[2], h, min);
  var fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: ET_TZ, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  });
  for (var i = 0; i < 3; i++) {
    var p = {};
    fmt.formatToParts(new Date(utc)).forEach(function (x) { p[x.type] = x.value; });
    var asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, (+p.hour) % 24, +p.minute, +p.second);
    var wallUtc = Date.UTC(d[0], d[1] - 1, d[2], h, min);
    utc += (wallUtc - asUtc);
  }
  return utc;
}

// True when the class has finished: end time (from the time range, or
// 11:59pm ET when no time is recorded) is in the past.
function classHasEnded(session, nowMs) {
  if (!session || !session.date) return false;
  var mins = parseEndMinutes(session.time);
  var endMins = mins == null ? (23 * 60 + 59) : mins;
  return etWallToUtcMs(session.date, endMins) <= nowMs;
}

// ---------------------------------------------------------------------------
// Email extraction
// ---------------------------------------------------------------------------

// Unique, valid, lowercased participant emails from registration rows.
// Mirrors admin's familyEmailsForSession: contact may be "email / phone".
function extractParticipantEmails(registrations) {
  var seen = {};
  var out = [];
  (registrations || []).forEach(function (r) {
    var pay = String((r && r.pay_status) || 'unpaid').toLowerCase();
    if (pay === 'waitlist' || pay === 'cancelled' || pay === 'canceled') return;
    var contact = String((r && r.contact) || '').split(' / ')[0].trim().toLowerCase();
    if (!EMAIL_RE.test(contact)) return;
    if (seen[contact]) return;
    seen[contact] = true;
    out.push(contact);
  });
  return out;
}

// ---------------------------------------------------------------------------
// HTML builder
// ---------------------------------------------------------------------------

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function buildPostCourseHtml(draft, session, emails) {
  var bodyHtml = draft && draft.bodyHtml ? draft.bodyHtml : '';
  if (!bodyHtml) {
    var plain = String((draft && draft.body) || '').split('\n');
    bodyHtml = plain.map(function (line) {
      return line.trim() ? '<p>' + esc(line) : '';
    }).join('');
  }
  var noEmailsNote = '';
  if (!emails || !emails.length) {
    noEmailsNote =
      '<div style="background:#fff3cd;border:1px solid #e6c84a;border-radius:8px;' +
      'padding:12px 16px;margin:0 0 20px 0;font-size:14px;color:#6b5d1e;">' +
      '<b>Note:</b> No participant emails were found for this session, ' +
      'add recipients before sending.</div>';
  }
  var classLine = session && session.course
    ? '<p style="color:#6b7280;font-size:14px;margin:0 0 20px 0;">' +
      esc(session.course) + ' &middot; ' + esc(session.date || '') + '</p>'
    : '';
  return '<!DOCTYPE html><html><body style="margin:0;padding:0;background:#f5f2ea;">' +
    '<div style="max-width:600px;margin:0 auto;background:#ffffff;">' +
    '<div style="background:#1E3161;padding:26px 32px;text-align:center;">' +
    '<div style="color:#ffffff;font-size:22px;font-weight:bold;letter-spacing:1px;">Mindful Beginnings</div>' +
    '<div style="color:#C7A24A;font-size:12px;margin-top:6px;letter-spacing:3px;">KEEPING KIDS SAFE</div>' +
    '</div>' +
    '<div style="height:3px;background:#C7A24A;"></div>' +
    '<div style="padding:28px 32px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.6;color:#1f2937;">' +
    noEmailsNote + classLine + bodyHtml +
    '<div style="text-align:center;margin:30px 0 10px 0;">' +
    '<a href="' + REVIEW_URL + '" style="display:inline-block;background:#1E3161;color:#ffffff;' +
    'text-decoration:none;padding:14px 26px;border-radius:6px;font-weight:bold;font-size:15px;margin:0 8px 12px 0;">' +
    'Leave a Google Review</a>' +
    '<a href="' + EVAL_URL + '" style="display:inline-block;background:#C7A24A;color:#1E3161;' +
    'text-decoration:none;padding:14px 26px;border-radius:6px;font-weight:bold;font-size:15px;margin:0 0 12px 8px;">' +
    'Complete Our Program Evaluation</a>' +
    '</div>' +
    '</div>' +
    '<div style="background:#f5f2ea;padding:18px 32px;text-align:center;' +
    'font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#8a8a8a;">' +
    'Mindful Beginnings &middot; mindfulbeginnings.org &middot; 703-987-5979' +
    '</div>' +
    '</div></body></html>';
}

function genericFallbackDraft(course) {
  var subject = 'Thank you for a great class with Mindful Beginnings';
  var bodyHtml =
    '<p>Hi there,</p>' +
    '<p>Thank you for choosing Mindful Beginnings' +
    (course ? ' for ' + esc(course) : '') +
    '. We hope you or your child came home feeling confident, capable, and proud of everything accomplished.</p>' +
    '<p>Two quick asks: would you leave us a <a href="' + REVIEW_URL + '">Google review</a>? ' +
    'And please complete our short <a href="' + EVAL_URL + '">program evaluation</a>. ' +
    'Your feedback keeps our classes strong.</p>' +
    '<p>Warmly,<br>Lindsay Karr, M.Ed. | Founder, Mindful Beginnings</p>';
  return { subject: subject, body: 'Thank you for choosing Mindful Beginnings.', bodyHtml: bodyHtml };
}

// ---------------------------------------------------------------------------
// Supabase helpers
// ---------------------------------------------------------------------------

function sbHeaders(cfg) {
  var key = cfg.serviceKey;
  return { Accept: 'application/json', apikey: key, Authorization: 'Bearer ' + key };
}

async function sbGet(cfg, path) {
  var r = await fetch(cfg.url + '/rest/v1/' + path, { headers: sbHeaders(cfg) });
  if (!r.ok) throw new Error('Supabase GET ' + path + ' failed: ' + r.status);
  return r.json();
}

async function sbUpsert(cfg, path, body) {
  var r = await fetch(cfg.url + '/rest/v1/' + path, {
    method: 'POST',
    headers: Object.assign(sbHeaders(cfg), {
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates'
    }),
    body: JSON.stringify(body)
  });
  if (!r.ok) throw new Error('Supabase upsert ' + path + ' failed: ' + r.status);
}

// A session needs a draft when it has an id, is not watermarked, and the
// class has already ended.
function isDraftCandidate(s, doneSet, nowMs) {
  return !!(s && s.id && !doneSet[s.id] && classHasEnded(s, nowMs));
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

async function handler(req, res) {
  var secret = process.env.CRON_SECRET;
  var auth = req.headers.authorization || '';
  if (!secret || auth !== 'Bearer ' + secret) {
    return sendJson(res, 401, { error: 'Unauthorized' });
  }

  var cfg = supabaseConfig();
  if (!cfg.configured) return sendJson(res, 500, { error: 'Supabase not configured' });

  var today = etToday();
  var cutoff = new Date(etWallToUtcMs(today, 0) - (LOOKBACK_DAYS - 1) * 86400000);
  var cutoffStr = cutoff.toISOString().slice(0, 10);

  var sessions, watermarks;
  try {
    sessions = await sbGet(cfg,
      'sessions?select=id,course,date,time,location&date=gte.' + cutoffStr +
      '&date=lte.' + today +
      '&or=(is_cancelled.is.false,is_cancelled.is.null)' +
      '&or=(is_hold.is.false,is_hold.is.null)');
    watermarks = await sbGet(cfg, 'post_course_draft_watermarks?select=session_id');
  } catch (e) {
    return sendJson(res, 500, { error: 'Could not load data.', detail: e.message });
  }

  var done = {};
  (watermarks || []).forEach(function (w) { done[w.session_id] = true; });

  var nowMs = Date.now();
  var candidates = (sessions || []).filter(function (s) {
    return isDraftCandidate(s, done, nowMs);
  });

  // js/post-course-emails.js is a browser IIFE attaching postCourseDraftFor to
  // `this`; in Node, `this` is module.exports, so require gives us the fn.
  var drafts = require('../../js/post-course-emails.js');

  var created = [];
  var errors = [];
  for (var i = 0; i < candidates.length; i++) {
    var s = candidates[i];
    try {
      var regs = await sbGet(cfg,
        'registrations?select=contact,pay_status&session_id=eq.' + encodeURIComponent(s.id));
      var emails = extractParticipantEmails(regs);

      var draft = null;
      try { draft = drafts.postCourseDraftFor(s.course); } catch (e) { draft = null; }
      if (!draft || !draft.subject) draft = genericFallbackDraft(s.course);

      var html = buildPostCourseHtml(draft, s, emails);
      var result = await createOutlookDraft({
        to: LINDSAY_EMAIL,
        bcc: emails,
        subject: draft.subject,
        htmlBody: html
      });
      if (!result.created) {
        throw new Error('Draft not created: ' + (result.reason || result.error || 'unknown'));
      }
      await sbUpsert(cfg, 'post_course_draft_watermarks', [{
        session_id: s.id,
        draft_id: result.id || null,
        recipient_count: emails.length
      }]);
      created.push({ id: s.id, course: s.course, recipients: emails.length, draftId: result.id || '' });
    } catch (e) {
      errors.push({ id: s.id, course: s.course, error: e.message });
    }
  }

  return sendJson(res, 200, {
    ok: true,
    draftsCreated: created.length,
    sessions: created,
    errors: errors
  });
}

module.exports = handler;
// Exported for unit tests.
module.exports.parseEndMinutes = parseEndMinutes;
module.exports.etWallToUtcMs = etWallToUtcMs;
module.exports.classHasEnded = classHasEnded;
module.exports.extractParticipantEmails = extractParticipantEmails;
module.exports.buildPostCourseHtml = buildPostCourseHtml;
module.exports.genericFallbackDraft = genericFallbackDraft;
module.exports.isDraftCandidate = isDraftCandidate;
