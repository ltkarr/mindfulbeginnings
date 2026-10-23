'use strict';

// One delivery test of the new-job alert. Refuses every recipient except
// Lindsay's test instructor. Does not opt anyone in and does not change the
// production EmailJS template setting. Requires EMAILJS_PRIVATE_KEY,
// EMAILJS_TEMPLATE_JOB_ALERTS, and SUPABASE_SERVICE_ROLE_KEY in the environment.

const handler = require('../api/remind-instructors');

const EMAIL = 'lindsay+testinstructor@mindfulbeginnings.org';
const ID = '6677caa4-44d2-466b-a406-efdf41affba8';

async function main() {
  if (!process.env.EMAILJS_PRIVATE_KEY || !process.env.EMAILJS_TEMPLATE_JOB_ALERTS || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Missing EMAILJS_PRIVATE_KEY, EMAILJS_TEMPLATE_JOB_ALERTS, or SUPABASE_SERVICE_ROLE_KEY');
    process.exit(1);
  }
  const result = await handler.runJobAlerts(process.env.EMAILJS_PRIVATE_KEY, {
    onlyEmail: EMAIL,
    onlyInstructorId: ID,
    allowUnsubscribedTest: true,
    sampleIfEmpty: true,
  });
  const sent = (result.instructors || []).map(function (row) {
    return { instructor: row.instructor, jobs: row.jobs, sample: row.sample };
  });
  console.log(JSON.stringify({
    sent: result.sent || 0,
    instructors: sent,
    skipped: result.skipped || null,
    reason: result.reason || null,
    error: result.error || null,
  }));
  if (!result.sent) process.exit(2);
}

main().catch(function (err) {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
