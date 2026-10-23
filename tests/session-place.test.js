'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const place = require('../js/session-place');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations/20261023_job_alerts_text_ids.sql'), 'utf8');
const retired = fs.readFileSync(path.join(root, 'migrations/20261021_job_alerts.sql'), 'utf8');

test('host-home sessions lead with the street and link to maps', () => {
  const home = {
    location: 'Host home',
    hostAddress: '4218 Silverwood Ln',
    city: 'Bethesda',
    state: 'MD',
    zip: '20816'
  };
  assert.equal(place.plain(home), '4218 Silverwood Ln, Bethesda, MD 20816');
  assert.equal(place.isGenericHostLabel("Host's home"), true);
  assert.match(place.html(home, { link: true }), /google\.com\/maps\/search/);
  assert.match(place.html(home, { link: true }), /4218 Silverwood Ln/);
  assert.doesNotMatch(place.plain(home), /Host home/);

  const troop = {
    location: 'Meredith Sarver / Troop Leader House',
    host_address: '11007 Raccoon Ridge Rd Ct',
    city: 'Reston',
    state: 'VA',
    zip: '20191'
  };
  assert.equal(
    place.plain(troop),
    'Meredith Sarver / Troop Leader House, 11007 Raccoon Ridge Rd Ct, Reston, VA 20191'
  );
  assert.equal(place.plain({ isVirtual: true, zoomLink: 'https://zoom.us/j/1' }), 'Virtual (Zoom)');
  assert.equal(place.mapsUrl({ location: 'Host home' }), '');
  assert.equal(place.plain({ location: 'Library', city: 'Bethesda', state: 'MD', zip: '20814' }), 'Library, Bethesda, MD 20814');
});

test('public registration does not load the address helper, and parent copy stays on the stored location', () => {
  assert.doesNotMatch(register, /session-place\.js/);
  assert.match(admin, /session-place\.js/);
  assert.match(instructor, /session-place\.js/);
  const copyStart = admin.indexOf('function copySessionText(btn)');
  const copy = admin.slice(copyStart, admin.indexOf('\nfunction ', copyStart + 10));
  assert.match(copy, /s\.location/);
  assert.doesNotMatch(copy, /hostAddress|adminPlaceText/);
});

test('instructor job-board help is a tap-friendly info control, and Safe@Home 2026 is in resources', () => {
  const open = instructor.slice(instructor.indexOf('id="tab-open"'), instructor.indexOf('id="tab-myjobs"'));
  assert.match(open, /Jobs you can claim </);
  assert.doesNotMatch(open, />\?<\/span>/);
  assert.match(open, /<details class="info-tip">/);
  assert.match(open, /Every job listed here is unclaimed/);
  const guide = instructor.slice(instructor.indexOf('id="tab-guide"'), instructor.indexOf('id="tab-partner"'));
  assert.match(guide, /<details class="info-tip">/);
  assert.match(guide, /FAQs cover preparing/);
  assert.match(instructor, /Safe@Home Curriculum — 2026 \(NEW\)/);
  assert.match(instructor, /ONLY use this if you have the NEW 2026 Handbooks!/);
  assert.match(instructor, /mb-res-note\$\{r\[4\]==='warn'\?' warn':''\}/);
  assert.match(instructor, /For older \(pre-2026\) handbooks/);
  assert.match(instructor, /2026 Facilitator Guide only with the new 2026 handbooks/);
});

test('home and account job-alert toggles share one saved setting', () => {
  assert.match(instructor, /jobAlertsOptInHtml\('home'\)/);
  assert.match(instructor, /jobAlertsOptInHtml\('account'\)/);
  assert.match(instructor, /id="\$\{id\}"/);
  assert.match(instructor, /job-alerts-toggle-home/);
  assert.match(instructor, /job_alerts_enabled:!!checked/);
  const toggle = instructor.slice(instructor.indexOf('async function toggleJobAlerts'), instructor.indexOf('// ─── ONBOARDING COMPLETE'));
  assert.match(toggle, /syncJobAlertToggles/);
});

test('job-alert migration uses text ids and does not opt instructors in', () => {
  assert.match(migration, /instructor_id text not null references public\.instructors\(id\)/);
  assert.match(migration, /session_id text not null references public\.sessions\(id\)/);
  assert.match(migration, /job_alerts_enabled boolean not null default false/);
  assert.match(migration, /job_alerts_last_digest_at timestamptz not null default now\(\)/);
  assert.match(migration, /job_alert_digests/);
  assert.doesNotMatch(migration, /instructor_id uuid|session_id uuid/);
  assert.match(retired, /SUPERSEDED/);
  assert.doesNotMatch(retired, /references public\.instructors/);
});
