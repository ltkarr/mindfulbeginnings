'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const register = fs.readFileSync(path.join(__dirname, '../register.html'), 'utf8');

function extractFunction(source, name) {
  const start = source.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  let i = source.indexOf('{', start);
  let depth = 0;
  for (; i < source.length; i++) {
    const ch = source[i];
    if (ch === '{') depth++;
    else if (ch === '}') {
      depth--;
      if (depth === 0) return source.slice(start, i + 1);
    }
  }
  assert.fail('unclosed function ' + name);
}

function loadPredicate() {
  const context = {
    window: {
      location: {
        href: 'https://register.mindfulbeginnings.org/register.html',
        origin: 'https://register.mindfulbeginnings.org'
      }
    },
    URL
  };
  vm.createContext(context);
  vm.runInContext(extractFunction(register, 'isOwnPageFailure'), context);
  return context.isOwnPageFailure;
}

const isOwnPageFailure = loadPredicate();
const PAGE = 'https://register.mindfulbeginnings.org/register.html';

test('banner ignores opaque Script error and third-party or resource failures', () => {
  assert.equal(isOwnPageFailure(null), false);
  assert.equal(isOwnPageFailure({ message: 'Script error.', filename: '', target: null }), false);
  assert.equal(isOwnPageFailure({ message: 'Script error', filename: PAGE }), false);
  // WebKit sometimes attaches the page URL to a muted cross-origin error.
  assert.equal(isOwnPageFailure({ message: 'Script error.', filename: PAGE }), false);
  assert.equal(isOwnPageFailure({
    message: 'Cannot read properties of undefined',
    filename: 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.3/dist/umd/supabase.js'
  }), false);
  assert.equal(isOwnPageFailure({
    message: 'emailjs is not defined',
    filename: 'https://cdn.jsdelivr.net/npm/@emailjs/browser@4.4.1/dist/email.min.js'
  }), false);
  assert.equal(isOwnPageFailure({ message: 'injected', filename: '' }), false);
  assert.equal(isOwnPageFailure({ message: 'injected', filename: '   ' }), false);
  assert.equal(isOwnPageFailure({ message: '   ', filename: PAGE }), false);
  assert.equal(isOwnPageFailure({
    message: 'autoplay of undefined',
    filename: 'webkit-masked-url://hidden/'
  }), false);
  assert.equal(isOwnPageFailure({
    message: 'fb bridge',
    filename: 'https://connect.facebook.net/en_US/fbevents.js'
  }), false);
  const img = {};
  assert.equal(isOwnPageFailure({ message: '', filename: '', target: img }), false);
  assert.equal(isOwnPageFailure({ message: 'Loading failed', filename: PAGE, target: img }), false);
});

test('banner still fires for a same-origin page exception', () => {
  assert.equal(isOwnPageFailure({
    message: "Cannot read properties of null (reading 'value')",
    filename: PAGE
  }), true);
  assert.equal(isOwnPageFailure({
    message: 'payments failed',
    filename: 'https://register.mindfulbeginnings.org/js/payments.js'
  }), true);
  assert.equal(isOwnPageFailure({
    message: 'config failed',
    filename: '/config.js'
  }), true);
});

test('fatal banner is dismissable and does not use a fixed bottom bar', () => {
  const start = register.indexOf("b.id='mb-fatal-banner'");
  assert.ok(start >= 0);
  const css = register.slice(start, start + 700);
  assert.match(css, /position:relative/);
  assert.doesNotMatch(css, /position:fixed/);
  assert.doesNotMatch(css, /bottom:0/);
  assert.match(register, /id='mb-fatal-dismiss'/);
  assert.match(register, /aria-label','Dismiss'/);
  assert.match(register, /if\(!isOwnPageFailure\(ev\)\)return/);
  assert.match(register, /insertBefore\(b,root\.firstChild\)/);
});

test('third-party scripts on the registration page are pinned and CORS-enabled', () => {
  assert.match(register, /src="https:\/\/cdn\.jsdelivr\.net\/npm\/@supabase\/supabase-js@2\.117\.3\/dist\/umd\/supabase\.js" crossorigin="anonymous"/);
  assert.match(register, /src="https:\/\/cdn\.jsdelivr\.net\/npm\/@emailjs\/browser@4\.4\.1\/dist\/email\.min\.js" crossorigin="anonymous"/);
  assert.doesNotMatch(register, /supabase-js@2\/dist/);
  assert.doesNotMatch(register, /browser@4\/dist/);
});
