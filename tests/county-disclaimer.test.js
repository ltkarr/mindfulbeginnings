'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const rule = require('../js/county-disclaimer.js');
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const sql = fs.readFileSync(path.join(root, 'migrations/20261102_county_disclaimer.sql'), 'utf8');
const explicit = fs.readFileSync(path.join(root, 'migrations/20261104_county_disclaimer_explicit.sql'), 'utf8');
const listSql = fs.readFileSync(path.join(root, 'migrations/20261103_public_listing_spanish.sql'), 'utf8');
const codeSql = fs.readFileSync(path.join(root, 'migrations/20261103_session_code_spanish.sql'), 'utf8');

const LINE = 'This activity is not sponsored, associated with, or endorsed by Montgomery County Government';

test('the disclaimer shows only when a session explicitly turns it on', () => {
  assert.equal(rule.TEXT, LINE);
  assert.equal(rule.shows({ location: 'Magothy River Middle School', hostAddress: '241 Peninsula Farm Road' }), false);
  assert.equal(rule.shows({ location: 'Ashburton Elementary School' }), false);
  assert.equal(rule.shows({ location: 'Winston Churchill High School' }), false);
  assert.equal(rule.shows({ location: 'MCPS Board Room' }), false);
  assert.equal(rule.shows({ location: 'Edgemoor Community Center', city: 'Bethesda' }), false);
  assert.equal(rule.shows({ location: 'Bethesda-Chevy Chase Regional Services Center', hostAddress: '4805 Edgemoor Ln', city: 'Bethesda' }), false);
  assert.equal(rule.shows({ location: 'Twinbrook Library Medium Room', city: 'Rockville' }), false);
  assert.equal(rule.shows({ location: 'Host home', hostAddress: '5508 Center St', city: 'Chevy Chase' }), false);
  assert.equal(rule.shows({ location: null }), false);
  assert.equal(rule.shows({}), false);
  assert.equal(rule.shows(null), false);
  assert.equal(rule.shows({ location: 'School', countyDisclaimer: false }), false);
  assert.equal(rule.shows({ location: 'School', county_disclaimer: null }), false);
  assert.equal(rule.shows({ location: null, county_disclaimer: false }), false);
  assert.equal(rule.shows({ location: 'Host home', county_disclaimer: true }), true);
  assert.equal(rule.shows({ location: 'Twinbrook Library Medium Room', countyDisclaimer: true }), true);
  assert.equal(rule.shows({ location: 'Ashburton Elementary School', county_disclaimer: true }), true);
});

test('registration shows the line in the session details and before Reserve my spot', () => {
  assert.match(register, /src="\/js\/county-disclaimer\.js"/);
  assert.match(register, /id="county-disclaimer-before-reserve"/);
  assert.match(register, new RegExp(LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  const banner = register.slice(register.indexOf('function setBanner'), register.indexOf('function toggleSitterList'));
  assert.match(banner, /MBCountyDisclaimer\.shows\(s\)/);
  assert.match(banner, /MBCountyDisclaimer\.html\(\)/);
  assert.match(banner, /county-disclaimer-before-reserve/);
  const card = register.slice(register.indexOf("html+='<div class=\"public-card'"), register.indexOf('box.innerHTML=html'));
  assert.match(card, /MBCountyDisclaimer\.shows\(r\)/);
  assert.match(register, /\.county-disclaimer\{margin:8px 0 0;font-size:13px/);
});

test('admin defaults the disclaimer to hidden and can turn it on for one session', () => {
  assert.match(admin, /id="m-county-disclaimer"/);
  assert.match(admin, /Don't show/);
  assert.match(admin, /Always show/);
  assert.doesNotMatch(admin, /Automatic — schools and Edgemoor/);
  assert.doesNotMatch(admin, /Hide for this session/);
  const field = admin.slice(admin.indexOf('function countyDisclaimerFieldHtml'), admin.indexOf('function toggleOrgRegistration'));
  assert.doesNotMatch(field, /\u2014/);
  assert.match(field, /only when you choose Always show/);
  assert.match(field, /value="hide"\$\{show\?'':' selected'\}/);
  assert.match(field, /if\(el\.value==='show'\)return true;/);
  assert.match(field, /return false;/);
  assert.match(admin, /countyDisclaimer:r\.county_disclaimer===true\?true:\(r\.county_disclaimer===false\?false:null\)/);
  assert.match(admin, /o\.county_disclaimer=s\.countyDisclaimer===true\?true:\(s\.countyDisclaimer===false\?false:null\)/);
  assert.equal((admin.match(/\$\{countyDisclaimerFieldHtml\(/g) || []).length, 4);
});

test('public registration resolves the disclaimer from the explicit flag only', () => {
  const fn = explicit.slice(explicit.indexOf('create or replace function public.session_county_disclaimer'));
  assert.match(fn, /select p_flag is true;/);
  assert.doesNotMatch(fn, /edgemoor|school|elementary|middle|high|mcps/i);
  assert.match(explicit, /False and null hide it/);
  assert.doesNotMatch(explicit, /^\s*update\s+public\.sessions/im);
  assert.match(listSql, /session_county_disclaimer\(s\.county_disclaimer, s\.location, s\.host_address, s\.city\)/);
  assert.match(listSql, /null::text/);
  assert.match(codeSql, /session_county_disclaimer\(s\.county_disclaimer, s\.location, s\.host_address, s\.city\)/);
  assert.match(codeSql, /s\.host_address/);
  assert.match(codeSql, /s\.location/);
  assert.match(sql, /add column if not exists county_disclaimer boolean/);
  assert.doesNotMatch(sql, /grant select \(county_disclaimer\)/i);
  assert.doesNotMatch(explicit, /grant select \(county_disclaimer\)/i);
});
