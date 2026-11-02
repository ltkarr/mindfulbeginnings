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

const LINE = 'This activity is not sponsored, associated with, or endorsed by Montgomery County Government';

test('the venue rule matches schools and Edgemoor, and leaves other places alone', () => {
  assert.equal(rule.TEXT, LINE);
  assert.equal(rule.shows({ location: 'Magothy River Middle School', hostAddress: '241 Peninsula Farm Road' }), true);
  assert.equal(rule.shows({ location: 'Ashburton Elementary School' }), true);
  assert.equal(rule.shows({ location: 'Winston Churchill High School' }), true);
  assert.equal(rule.shows({ location: 'MCPS Board Room' }), true);
  assert.equal(rule.shows({ location: 'Edgemoor Community Center', city: 'Bethesda' }), true);
  assert.equal(rule.shows({ location: 'Bethesda-Chevy Chase Regional Services Center', hostAddress: '4805 Edgemoor Ln', city: 'Bethesda' }), true);
  assert.equal(rule.shows({ location: 'Host home', hostAddress: '5508 Center St', city: 'Chevy Chase' }), false);
  assert.equal(rule.shows({ location: 'Highland Farms', city: 'Potomac' }), false);
  assert.equal(rule.shows({ course: 'Hallie Wells Middle School Holiday Shopping Event', location: 'Host home' }), false);
  assert.equal(rule.shows({ location: 'School', countyDisclaimer: false }), false);
  assert.equal(rule.shows({ location: 'Host home', county_disclaimer: true }), true);
  assert.equal(rule.shows({ location: null, county_disclaimer: false }), false);
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

test('admin can leave the disclaimer automatic or force it on or off', () => {
  assert.match(admin, /id="m-county-disclaimer"/);
  assert.match(admin, /Automatic — schools and Edgemoor/);
  assert.match(admin, /Always show/);
  assert.match(admin, /Hide for this session/);
  assert.match(admin, /function readCountyDisclaimer/);
  assert.match(admin, /countyDisclaimer:r\.county_disclaimer===true\?true:\(r\.county_disclaimer===false\?false:null\)/);
  assert.match(admin, /o\.county_disclaimer=s\.countyDisclaimer===true\?true:\(s\.countyDisclaimer===false\?false:null\)/);
  assert.equal((admin.match(/\$\{countyDisclaimerFieldHtml\(/g) || []).length, 4);
});

test('the public list still hides the street and returns the resolved disclaimer', () => {
  const list = sql.slice(sql.indexOf('function public.list_public_sessions'), sql.indexOf('drop function if exists public.get_session_by_code'));
  assert.match(list, /null::text/);
  assert.match(list, /session_county_disclaimer\(s\.county_disclaimer, s\.location, s\.host_address, s\.city\)/);
  assert.match(list, /county_disclaimer boolean/);
  const lookup = sql.slice(sql.indexOf('function public.get_session_by_code'));
  assert.match(lookup, /s\.host_address/);
  assert.match(lookup, /s\.location/);
  assert.match(lookup, /session_county_disclaimer/);
  assert.match(sql, /\\m\(school\|elementary\|middle\|high\|mcps\)\\M/);
  assert.match(sql, /edgemoor/);
  assert.match(sql, /add column if not exists county_disclaimer boolean/);
  assert.doesNotMatch(sql, /grant select \(county_disclaimer\)/i);
});
