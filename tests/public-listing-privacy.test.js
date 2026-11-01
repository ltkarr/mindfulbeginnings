'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const sql = fs.readFileSync(path.join(root, 'migrations/20261101_public_listing_city_state.sql'), 'utf8');
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');

test('the public list returns city and state and not a venue or street', () => {
  const list = sql.slice(sql.indexOf('function public.list_public_sessions'), sql.indexOf('drop function if exists public.get_session_by_code'));
  assert.match(list, /null::text/);
  assert.match(list, /s\.state/);
  assert.doesNotMatch(list, /s\.location/);
  assert.doesNotMatch(list, /host_address/);
  assert.match(list, /has_host = false/);
});

test('opening one session returns the street, and the list page blanks it first', () => {
  const lookup = sql.slice(sql.indexOf('function public.get_session_by_code'));
  assert.match(lookup, /s\.host_address/);
  assert.match(lookup, /s\.location/);
  assert.doesNotMatch(lookup, /zoom_link/);
  assert.match(register, /stripPublicListingAddress/);
  assert.match(register, /hostAddress:r\.host_address\|\|''/);
  assert.doesNotMatch(register, /if\(venue&&!\/\\d\/\.test\(venue\)\)place\.name=venue/);
});
