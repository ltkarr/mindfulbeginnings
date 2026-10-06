'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const additive = fs.readFileSync(path.join(root, 'migrations/20261006_portal_security_additive.sql'), 'utf8');
const lockdown = fs.readFileSync(path.join(root, 'migrations/20261006_portal_security_lockdown.sql'), 'utf8');
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
const reminders = fs.readFileSync(path.join(root, 'api/remind-instructors.js'), 'utf8');

function sqlBody(src) {
  return src.split('\n').filter(line => !line.trim().startsWith('--')).join('\n');
}

test('additive security SQL does not lock the live site down', () => {
  const body = sqlBody(additive);
  assert.doesNotMatch(body, /drop policy/i);
  assert.doesNotMatch(body, /revoke all on table public\.registrations/i);
  assert.match(body, /function public\.register_student/);
  assert.match(body, /function public\.mark_payment_sent/);
  assert.match(body, /function public\.instructor_accept_job/);
  assert.match(body, /function public\.instructor_login/);
  assert.match(body, /function public\.get_session_instructor_phone/);
  assert.match(body, /mb_login_attempts/);
});

test('register_student sets status itself and ignores the client cap', () => {
  const body = sqlBody(additive);
  assert.match(additive, /p_max is ignored/i);
  assert.match(body, /v_status := 'pending'/);
  assert.match(body, /v_token = 'REREG-2026'/);
  assert.match(body, /v_token = 'AUCTION-2026'/);
  assert.match(body, /Re-registration — already paid via PayPal/);
  assert.match(body, /AUCTION — IN-KIND DONATION:/);
  assert.match(body, /paypal_tx_id/);
  assert.doesNotMatch(body, /v_count >= p_max/);
  assert.match(additive, /SEAT_COUNT_EXCLUDES/);
  assert.match(body, /not in \('waitlist', 'cancelled', 'canceled', 'refunded'\)/);
  assert.match(body, /when v_course = 'Baby Ready' then 2/);
});

test('accepting a job checks active, onboarding, Safe Sitter, and RN server-side', () => {
  const body = sqlBody(additive);
  assert.match(body, /not v_active or not v_onboarded/);
  assert.match(body, /safe_sitter_certified/);
  assert.match(body, /requires_rn/);
  assert.match(body, /requires_safe_sitter/);
  assert.match(body, /Stay Ready: Choking Rescue and CPR/);
  assert.match(body, /Ready\. Period\./);
  assert.match(body, /if not v_rn then/);
  assert.match(body, /if not v_ss then/);
});

test('lockdown drops the open policies and keeps admin authenticated access implied', () => {
  const body = sqlBody(lockdown);
  for (const table of ['registrations', 'instructors', 'expenses', 'job_data']) {
    assert.match(body, new RegExp('drop policy if exists public_all on public\\.' + table, 'i'));
    assert.match(body, new RegExp('revoke all on table public\\.' + table + ' from anon, public', 'i'));
  }
  assert.match(body, /grant select \(session_id, instructor_id, waitlist\) on public\.job_data to anon/i);
  assert.match(body, /revoke select \(notes\) on public\.sessions from anon, public/i);
  assert.match(body, /revoke all on function public\.get_instructor_phone\(text\) from public, anon, authenticated/i);
  assert.match(body, /revoke all on function public\.get_tomorrow_reminders\(\) from public, anon, authenticated/i);
  assert.match(body, /revoke all on function public\.log_reminder_sent\(text\) from public, anon, authenticated/i);
  assert.match(body, /revoke all on function public\.mark_host_taken\(text\) from public, anon, authenticated/i);
  assert.match(body, /grant execute on function public\.get_tomorrow_reminders\(\) to service_role/i);
  assert.doesNotMatch(body, /drop policy if exists "admin full access/i);
});

test('public registration no longer writes the registrations table directly', () => {
  assert.doesNotMatch(register, /\.from\('registrations'\)/);
  assert.match(register, /mark_payment_sent/);
  assert.match(register, /get_session_instructor_phone/);
  assert.doesNotMatch(register, /get_instructor_phone/);
  assert.match(register, /registration_token:method==='auction'\?'AUCTION-2026':\(method==='comp'\?'REREG-2026':null\)/);
});

test('instructor portal does not select session notes or every job column', () => {
  assert.doesNotMatch(instructor, /\.from\('job_data'\)\.select\('\*'\)/);
  assert.match(instructor, /session_id,instructor_id,waitlist/);
  assert.match(instructor, /instructor_job_details/);
  assert.match(instructor, /instructor_session_notes/);
  const lists = [
    ...instructor.matchAll(/SESSION_COLS\w*='([^']+)'/g),
    ...instructor.matchAll(/sessions'\)\.select\('([^']+)'\)/g)
  ].map(m => m[1]);
  assert.ok(lists.length >= 3);
  lists.forEach(list => {
    assert.equal(list.split(',').includes('notes'), false, list);
    assert.equal(list.split(',').includes('admin_private_notes'), false, list);
  });
});

test('reminder route prefers the service role key', () => {
  assert.match(reminders, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.match(reminders, /function supabaseKey\(\)/);
  assert.match(reminders, /apikey: supabaseKey\(\)/);
});
