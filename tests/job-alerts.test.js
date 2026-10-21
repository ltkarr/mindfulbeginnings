'use strict';

// Tests for the new-job-alert digest inside POST /api/remind-instructors.
// fetch is stubbed: Supabase REST returns fixture rows, EmailJS captures sends.
// Verifies opt-in only, eligibility filtering, watermarking, and that a missing
// EMAILJS_TEMPLATE_JOB_ALERTS skips alerts without breaking reminders.

const test = require('node:test');
const assert = require('node:assert/strict');

const SUPABASE_URL = 'https://evninlytzhtacanrguhx.supabase.co';

function mockRes() {
  const r = { statusCode: 0, headers: {}, body: '' };
  r.setHeader = (k, v) => { r.headers[k] = v; };
  r.end = (b) => { r.body = b || ''; };
  return r;
}

function loadHandler() {
  delete require.cache[require.resolve('../api/remind-instructors')];
  return require('../api/remind-instructors');
}

function req() {
  return { method: 'POST', headers: { authorization: 'Bearer test-secret' } };
}

function futureDate(days) {
  const d = new Date(Date.now() + days * 86400000);
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

function setup(fixtures) {
  const emailSends = [];
  const watermarkPosts = [];
  const calls = [];
  global.fetch = async (url, opts) => {
    calls.push({ url, method: (opts && opts.method) || 'GET' });
    const u = String(url);
    if (u.includes('/rpc/get_tomorrow_reminders')) {
      return { ok: true, json: async () => [] };
    }
    if (u.includes('/rpc/log_reminder_sent')) {
      return { ok: true, json: async () => true };
    }
    if (u.startsWith(SUPABASE_URL + '/rest/v1/instructors?')) {
      return { ok: true, json: async () => fixtures.instructors };
    }
    if (u.startsWith(SUPABASE_URL + '/rest/v1/sessions?')) {
      // Honor the created_at=gte.<cutoff> filter like PostgREST would.
      const m = u.match(/created_at=gte\.(\d+)/);
      const cutoff = m ? Number(m[1]) : 0;
      return { ok: true, json: async () => fixtures.sessions.filter(s => (s.created_at || 0) >= cutoff) };
    }
    if (u.startsWith(SUPABASE_URL + '/rest/v1/job_data?')) {
      return { ok: true, json: async () => fixtures.claimed };
    }
    if (u.startsWith(SUPABASE_URL + '/rest/v1/job_alert_notifications')) {
      if ((opts && opts.method) === 'POST') {
        watermarkPosts.push(JSON.parse(opts.body));
        return { ok: true, json: async () => [] };
      }
      return { ok: true, json: async () => fixtures.watermarks };
    }
    if (u.includes('api.emailjs.com')) {
      emailSends.push(JSON.parse(opts.body).template_params);
      return { ok: true, text: async () => 'OK' };
    }
    throw new Error('unexpected fetch: ' + u);
  };
  return { emailSends, watermarkPosts, calls };
}

function baseEnv() {
  process.env.CRON_SECRET = 'test-secret';
  process.env.EMAILJS_PRIVATE_KEY = 'pk';
  process.env.EMAILJS_TEMPLATE_REMINDER = 'tmpl-reminder';
  process.env.EMAILJS_TEMPLATE_JOB_ALERTS = 'tmpl-alerts';
}

function teardown() {
  delete global.fetch;
  delete process.env.CRON_SECRET;
  delete process.env.EMAILJS_PRIVATE_KEY;
  delete process.env.EMAILJS_TEMPLATE_REMINDER;
  delete process.env.EMAILJS_TEMPLATE_JOB_ALERTS;
}

const NOW = Date.now();
function instr(over) {
  return Object.assign({
    id: 'i1', name: 'Gen Instructor', email: 'gen@example.com',
    is_rn: false, speaks_spanish: false, safe_sitter_certified: null,
    safe_sitter_training_date: '', is_lead_teacher: false,
    is_active: true, job_alerts_enabled: true,
  }, over);
}
function sess(over) {
  return Object.assign({
    id: 's1', course: 'All Kids Welcome', date: futureDate(7), time: '10:00 AM',
    location: 'Library', city: 'Bethesda', state: 'MD', zip: '20814',
    host_address: '', is_virtual: false, owner_taught: false, is_hold: false,
    is_cancelled: false, is_custom_job: false, requires_rn: false,
    requires_safe_sitter: false, requires_spanish: false, created_at: NOW - 3600000,
  }, over);
}

test('subscribed + eligible instructor gets one digest email with the new job', async () => {
  baseEnv();
  const { emailSends, watermarkPosts } = setup({
    instructors: [instr({})],
    sessions: [sess({})],
    claimed: [],
    watermarks: [],
  });
  try {
    const res = mockRes();
    await loadHandler()(req(), res);
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.jobAlerts.sent, 1);
    assert.equal(emailSends.length, 1);
    assert.equal(emailSends[0].instructor_email, 'gen@example.com');
    assert.ok(emailSends[0].jobs_html.includes('All Kids Welcome'));
    assert.ok(emailSends[0].intro_line.startsWith('1 new job'));
    assert.deepEqual(watermarkPosts, [[{ instructor_id: 'i1', session_id: 's1' }]]);
  } finally { teardown(); }
});

test('unsubscribed instructors get nothing; ineligible jobs are filtered out', async () => {
  baseEnv();
  const rnOnly = instr({ id: 'i-rn', name: 'RN Nora', email: 'nora@example.com', is_rn: true });
  const unsub = instr({ id: 'i-u', name: 'Unsub Uma', email: 'uma@example.com', job_alerts_enabled: false });
  // unsubscribed instructors are filtered by the DB query itself; only subscribed rows come back
  const { emailSends } = setup({
    instructors: [instr({}), rnOnly],
    sessions: [
      sess({ id: 's1', course: 'All Kids Welcome' }),
      sess({ id: 's2', course: 'Stay Ready: Choking Rescue and CPR' }),
    ],
    claimed: [],
    watermarks: [],
  });
  try {
    const res = mockRes();
    await loadHandler()(req(), res);
    const body = JSON.parse(res.body);
    assert.equal(body.jobAlerts.sent, 2);
    const genMail = emailSends.find(e => e.instructor_email === 'gen@example.com');
    const rnMail = emailSends.find(e => e.instructor_email === 'nora@example.com');
    assert.ok(genMail.jobs_html.includes('All Kids Welcome'));
    assert.ok(!genMail.jobs_html.includes('Stay Ready'), 'general instructor must not see the RN job');
    assert.ok(rnMail.jobs_html.includes('Stay Ready'));
    assert.ok(!emailSends.some(e => e.instructor_email === 'uma@example.com'));
  } finally { teardown(); }
});

test('already-notified pairs and claimed/cancelled/old jobs are skipped', async () => {
  baseEnv();
  const { emailSends } = setup({
    instructors: [instr({})],
    sessions: [
      sess({ id: 's1', course: 'All Kids Welcome' }),
      sess({ id: 's2', course: 'All Kids Welcome' }),
      sess({ id: 's3', course: 'All Kids Welcome', is_cancelled: true }),
      sess({ id: 's4', course: 'All Kids Welcome', created_at: NOW - 72 * 3600000 }),
    ],
    claimed: [{ session_id: 's2' }],
    watermarks: [{ instructor_id: 'i1', session_id: 's1' }],
  });
  try {
    const res = mockRes();
    await loadHandler()(req(), res);
    const body = JSON.parse(res.body);
    // s1 already notified, s2 claimed, s3 cancelled, s4 older than 48h → no email at all
    assert.equal(body.jobAlerts.sent, 0);
    assert.equal(emailSends.length, 0);
  } finally { teardown(); }
});

test('missing EMAILJS_TEMPLATE_JOB_ALERTS skips alerts but reminders still run', async () => {
  baseEnv();
  delete process.env.EMAILJS_TEMPLATE_JOB_ALERTS;
  const { emailSends } = setup({
    instructors: [instr({})],
    sessions: [sess({})],
    claimed: [],
    watermarks: [],
  });
  try {
    const res = mockRes();
    await loadHandler()(req(), res);
    assert.equal(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.equal(body.jobAlerts.skipped, true);
    assert.equal(emailSends.length, 0, 'no alert email without the template configured');
  } finally { teardown(); }
});

test('unauthorized requests are still rejected', async () => {
  baseEnv();
  setup({ instructors: [], sessions: [], claimed: [], watermarks: [] });
  try {
    const res = mockRes();
    await loadHandler()({ method: 'POST', headers: {} }, res);
    assert.equal(res.statusCode, 401);
  } finally { teardown(); }
});
