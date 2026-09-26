'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

test('sessions table cells stay inside their columns and drop the wide org pill', () => {
  const cssAt = admin.indexOf('#sessions-table{table-layout:fixed');
  const css = admin.slice(cssAt, admin.indexOf('table{width:100%', cssAt));
  assert.match(css, /overflow:hidden/);
  assert.match(css, /\.sess-pill\{[^}]*max-width:100%/);
  assert.match(css, /\.sess-wrap\{[^}]*overflow-wrap:anywhere/);
  assert.match(css, /col\.c-loc/);
  assert.match(css, /col\.c-course/);

  const render = admin.slice(admin.indexOf('function renderSessions'), admin.indexOf('// ─── PER-ROW ACTIONS MENU'));
  assert.match(render, /<colgroup><col class="c-date"><col class="c-course"><col class="c-loc">/);
  assert.match(render, /class="sess-title"/);
  assert.match(render, /class="sess-pills"/);
  assert.match(render, /class="sess-wrap"/);
  assert.match(render, /Billed to /);
  assert.match(render, /ON HOLD/);
  assert.match(render, /\$\{instr\}/);
  assert.match(render, /flat pay/);
  const hold = render.slice(render.indexOf('if(s.isHold){'), render.indexOf('if(s.isCustomJob){'));
  assert.match(hold, /sess-clip/);
  assert.match(hold, /sess-clamp/);
  assert.match(hold, /cell-stack/);
  assert.doesNotMatch(hold, /pay-note">\$\{escapeHtml\(s\.time\)\}/);
  assert.doesNotMatch(render, /🏛/);
  assert.doesNotMatch(render, /CUSTOM JOB/);
  assert.doesNotMatch(render, /recurBadge\(s\)/);
  assert.doesNotMatch(render, /white-space:nowrap/);

  const badge = admin.slice(admin.indexOf('function matSessBadge'), admin.indexOf('// How many physical units'));
  assert.match(badge, /Kit needed/);
  assert.doesNotMatch(badge, /none needed/);
  assert.doesNotMatch(badge, /📦 ✓/);
});
