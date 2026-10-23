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
  const digestClaims = new Set(fixtures.digests || []);
  global.fetch = async (url, opts) => {
    const method = (opts && opts.method) || 'GET';
    calls.push({ url, method });
    const u = String(url);
    if (u.includes('/rpc/get_tomorrow_reminders')) {
      return { ok: true, status: 200, json: async () => [], text: async () => '[]' };
    }
    if (u.includes('/rpc/log_reminder_sent')) {
      return { ok: true, status: 200, json: async () => true, text: async () => 'true' };
    }
    if (u.includes('/rest/v1/job_alert_digests')) {
      if (method === 'POST') {
        const row = JSON.parse(opts.body);
        const key = row.instructor_id + ':' + row.digest_date;
        if (digestClaims.has(key)) {
          return { ok: false, status: 409, json: async () => ({}), text: async () => 'duplicate key value violates unique constraint' };
        }
        digestClaims.add(key);
        return { ok: true, status: 201, json: async () => [], text: async () => '' };
      }
      if (method === 'DELETE') {
        const id = decodeURIComponent((u.match(/instructor_id=eq\.([^&]+)/) || [])[1] || '');
        const day = (u.match(/digest_date=eq\.([^&]+)/) || [])[1] || '';
        digestClaims.delete(id + ':' + day);
        return { ok: true, status: 204, json: async () => [], text: async () => '' };
      }
    }
    if (u.startsWith(SUPABASE_URL + '/rest/v1/instructors?')) {
      if (method === 'PATCH' || method === 'DELETE') {
        return { ok: true, status: 204, json: async () => [], text: async () => '' };
      }
      return { ok: true, status: 200, json: async () => fixtures.instructors, text: async () => '' };
    }
    if (u.startsWith(SUPABASE_URL + '/rest/v1/sessions?')) {
      const gt = u.match(/created_at=gt\.(\d+)/);
      const rows = gt
        ? fixtures.sessions.filter(s => (s.created_at || 0) > Number(gt[1]))
        : fixtures.sessions;
      return { ok: true, status: 200, json: async () => rows, text: async () => '' };
    }
    if (u.startsWith(SUPABASE_URL + '/rest/v1/job_data?')) {
      return { ok: true, status: 200, json: async () => fixtures.claimed, text: async () => '' };
    }
    if (u.startsWith(SUPABASE_URL + '/rest/v1/job_alert_notifications')) {
      if (method === 'POST') {
        watermarkPosts.push(JSON.parse(opts.body));
        return { ok: true, status: 201, json: async () => [], text: async () => '' };
      }
      return { ok: true, status: 200, json: async () => fixtures.watermarks, text: async () => '' };
    }
    if (u.includes('api.emailjs.com')) {
      emailSends.push(JSON.parse(opts.body).template_params);
      return { ok: true, status: 200, json: async () => ({}), text: async () => 'OK' };
    }
    throw new Error('unexpected fetch: ' + method + ' ' + u);
  };
  return { emailSends, watermarkPosts, calls, digestClaims };
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
    job_alerts_last_digest_at: new Date(NOW - 7 * 86400000).toISOString(),
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

test('already-notified pairs and claimed, cancelled, or pre-cursor jobs are skipped', async () => {
  baseEnv();
  const { emailSends } = setup({
    instructors: [instr({ job_alerts_last_digest_at: new Date(NOW - 24 * 3600000).toISOString() })],
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
    // s1 already notified, s2 claimed, s3 cancelled, s4 posted before the cursor
    assert.equal(body.jobAlerts.sent, 0);
    assert.equal(emailSends.length, 0);
  } finally { teardown(); }
});

test('a job older than 48 hours is included when it was posted after the last digest', async () => {
  baseEnv();
  const { emailSends } = setup({
    instructors: [instr({})],
    sessions: [sess({ id: 'old', course: 'All Kids Welcome', created_at: NOW - 72 * 3600000 })],
    claimed: [],
    watermarks: [],
  });
  try {
    const res = mockRes();
    await loadHandler()(req(), res);
    const body = JSON.parse(res.body);
    assert.equal(body.jobAlerts.sent, 1);
    assert.equal(emailSends.length, 1);
  } finally { teardown(); }
});

test('a second run the same day does not send another digest', async () => {
  baseEnv();
  const fixtures = {
    instructors: [instr({})],
    sessions: [sess({}), sess({ id: 's2', course: 'All Kids Welcome', created_at: NOW - 1000 })],
    claimed: [],
    watermarks: [],
  };
  const { emailSends } = setup(fixtures);
  try {
    const first = mockRes();
    await loadHandler()(req(), first);
    const second = mockRes();
    await loadHandler()(req(), second);
    assert.equal(JSON.parse(first.body).jobAlerts.sent, 1);
    assert.equal(JSON.parse(second.body).jobAlerts.sent, 0);
    assert.equal(emailSends.length, 1);
    assert.equal(JSON.parse(second.body).jobAlerts.skipped[0].reason, 'already sent today');
  } finally { teardown(); }
});

test('the digest names the street instead of Host home and tells the instructor how to turn it off', async () => {
  baseEnv();
  const { emailSends, calls } = setup({
    instructors: [instr({}), instr({ id: 'i-u', email: 'uma@example.com', job_alerts_enabled: false })],
    sessions: [sess({
      location: 'Host home',
      host_address: '4218 Silverwood Ln',
      city: 'Bethesda',
      state: 'MD',
      zip: '20816',
    })],
    claimed: [],
    watermarks: [],
  });
  try {
    const res = mockRes();
    await loadHandler()(req(), res);
    assert.equal(emailSends.length, 1);
    assert.match(emailSends[0].jobs_html, /4218 Silverwood Ln, Bethesda, MD 20816/);
    assert.doesNotMatch(emailSends[0].jobs_html, /Host home/);
    assert.match(emailSends[0].jobs_html, /Turn off new-job alerts/);
    assert.match(emailSends[0].message, /turn off New job alerts on your Home screen/);
    assert.ok(calls.some(c => String(c.url).includes('job_alerts_enabled=eq.true')));
  } finally { teardown(); }
});

test('a test send cannot target any address except the named test instructor', async () => {
  baseEnv();
  const { emailSends } = setup({
    instructors: [instr({ id: 'other', email: 'other@example.com' })],
    sessions: [sess({})],
    claimed: [],
    watermarks: [],
  });
  try {
    const result = await loadHandler().runJobAlerts('pk', {
      onlyEmail: 'other@example.com',
      onlyInstructorId: 'other',
      sampleIfEmpty: true,
    });
    assert.equal(result.skipped, true);
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
