'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const register = fs.readFileSync(path.join(__dirname, '../register.html'), 'utf8');
const pay = fs.readFileSync(path.join(__dirname, '../pay.html'), 'utf8');
const config = fs.readFileSync(path.join(__dirname, '../config.js'), 'utf8');

function indexOf(haystack, needle) {
  const i = haystack.indexOf(needle);
  assert.ok(i >= 0, 'expected to find: ' + needle);
  return i;
}

test('step 1 lists private/host code entry first, then public sessions, with no filter UI', () => {
  const sessions = indexOf(register, 'id="public-sessions"');
  const hostCode = indexOf(register, 'id="host-code-card"');
  assert.ok(hostCode < sessions, 'private/host code entry should appear above public session cards');
  assert.match(register, /id="code-input"/);
  assert.match(register, /id="code-btn"/);
  assert.match(register, /function checkCode/);
  assert.match(register, /Have a private or host code\?/);
  assert.match(register, /Enter a host or private code, or tap a public class below to register/);
  assert.match(register, /Upcoming public sessions/);
  assert.match(register, /id="public-sessions-list"/);
  assert.match(register, /id="public-show-more"/);
  assert.match(register, /function loadPublicSessions/);
  assert.match(register, /public-sessions\.js/);
  assert.match(register, /Find a class/);
  assert.doesNotMatch(register, /id="pf-course"/);
  assert.doesNotMatch(register, /id="pf-when"/);
  assert.doesNotMatch(register, /id="pf-city"/);
  assert.doesNotMatch(register, /id="pf-price"/);
  assert.doesNotMatch(register, /class="public-filters"/);
  assert.doesNotMatch(register, /All courses/);
  assert.doesNotMatch(register, /Any area/);
  assert.doesNotMatch(register, /Any price/);
  assert.doesNotMatch(register, /host-code-details/);
  assert.match(register, /are not listed below/);
  assert.match(register, /enter it above/);
  assert.doesNotMatch(register, /enter it below/);
});

test('public cards show price; private/host sessions are excluded from the list', () => {
  assert.match(register, /class="pprice"/);
  assert.match(register, /sessionPriceLabel/);
  assert.match(register, /isPrivateHostSession|has_host/);
  assert.match(register, /list_public_sessions/);
  assert.match(register, /filterPublicSessions/);
  assert.doesNotMatch(register, /\.eq\('has_host',false\)/);
  assert.doesNotMatch(register, /\.from\('sessions'\)/);
  assert.match(config, /audience:'Grades 6–8'/);
});

test('register.html does not read the sessions table directly', () => {
  assert.doesNotMatch(register, /from\('sessions'\)/);
  assert.doesNotMatch(register, /from\("sessions"\)/);
  assert.match(register, /sb\.rpc\('list_public_sessions'\)/);
  assert.match(register, /sb\.rpc\('get_session_by_code'/);
  assert.match(register, /sb\.rpc\('get_session_logistics'/);
  assert.match(register, /hostAddress:''/);
  assert.match(register, /zoomLink:''/);
});

test('partner registration links open off-site and skip Mindful Beginnings payment', () => {
  assert.match(register, /external_registration_url/);
  assert.match(register, /function openExternalRegistration/);
  assert.match(register, /noopener,noreferrer/);
  assert.match(register, /externalRegistrationUrl\(r\)/);
  assert.match(register, /externalRegistrationLabel\(externalUrl\)/);
  assert.match(register, /data-external="1"/);
  const click = register.slice(register.indexOf("list.addEventListener('click'"), register.indexOf("list.addEventListener('click'") + 900);
  assert.match(click, /data-external/);
  assert.ok(click.indexOf('openExternalRegistration') < click.indexOf('selectPublicSession'), 'external cards return before the MB registration flow');
  const lookup = register.slice(register.indexOf('async function checkCode'), register.indexOf('async function checkCode') + 4000);
  assert.ok(lookup.indexOf('externalRegistrationUrl') < lookup.indexOf('currentSession=sessionFromCodeRow'), 'a partner link must leave checkCode before payment state is set');
});

test('Need help Contact us uses Lindsay mailto', () => {
  assert.match(register, /Need help finding a class\? <a href="mailto:lindsay@mindfulbeginnings\.org">Contact us<\/a>\./);
  assert.match(register, /href="\/contact\.html">Contact<\/a>/);
});

test('course config still carries parent-facing audience lines', () => {
  assert.match(config, /audience:'Grades 6–8'/);
});

test('trust cues sit on the info screen before the waiver', () => {
  const trust = indexOf(register, 'id="trust-box"');
  const waiver = indexOf(register, 'id="waiver-section"');
  assert.ok(trust < waiver, 'trust box should appear before the full waiver');
  assert.match(register, /We do not sell your data/);
  assert.match(register, /card or PayPal, Venmo, or Zelle/);
  assert.match(register, /Sales are final, but you may transfer/);
});

test('register checkout uses dynamic PayPal Orders, not the hosted NCP button', () => {
  assert.match(register, /src="\/js\/payments\.js"/);
  assert.match(register, /function mountRegisterPayPal/);
  assert.match(register, /\.mountCardButtons\(/);
  assert.match(register, /id="pay-amount-exact"/);
  assert.match(register, /You will be charged/);
  assert.doesNotMatch(register, /V9QPR5SLN9DD4/);
  assert.doesNotMatch(register, /ncp\/payment/);
  assert.match(register, /buildPayHtmlLink/);
});

test('header branding is multi-course, not Safe Sitter-only', () => {
  assert.equal(register.includes('<img class="mb-logo"'), true);
  assert.equal(register.includes('src="/images/logo-navy.png"'), true);
  assert.equal(pay.includes('<img class="mb-logo"'), true);
  assert.equal(pay.includes('src="/images/logo-navy.png"'), true);
  assert.match(register, /<span class="mb-lockup">Mindful <span class="mb-lockup-script">Beginnings<\/span><\/span>/);
  assert.match(pay, /<span class="mb-lockup">Mindful <span class="mb-lockup-script">Beginnings<\/span><\/span>/);
  assert.doesNotMatch(register, /<div class="tag">Safe Sitter® Courses<\/div>/);
  assert.doesNotMatch(pay, /<div class="tag">Safe Sitter® Courses<\/div>/);
});

test('full public sessions show a native JOIN WAITLIST button, not a mailto', () => {
  const render = register.slice(register.indexOf('function renderPublicSessions'), register.indexOf('async function loadPublicSessions'));
  assert.match(render, /seatsLabel\(left, per\)/);
  assert.match(render, /FEW_SEATS_LABEL/);
  assert.match(render, /pseats'\+\(scarce\?' few':''\)/);
  assert.match(render, /<button type="button" class="pseats full public-waitlist" data-waitlist-code="/);
  assert.doesNotMatch(render, /waitlistMailto\(r\)/);
  assert.doesNotMatch(register, /seats left/);
  assert.doesNotMatch(register, /All '\+max\+' spots/);
  assert.match(register, /\.public-card button\.public-waitlist\{/);
  const card = render.slice(render.indexOf("html+='<div class=\"public-card'"));
  assert.ok(card.indexOf('public-card-hit') >= 0);
  assert.doesNotMatch(render, /<button[^>]*class="public-card"/);
  assert.doesNotMatch(register, /Full — waitlist/);
  const click = register.slice(register.indexOf("list.addEventListener('click'"), register.indexOf("list.addEventListener('click'") + 900);
  assert.match(click, /public-waitlist/);
  assert.match(click, /public-card-hit/);
  assert.ok(click.indexOf('[data-waitlist-code]') < click.indexOf('public-card-hit'), 'waitlist button is handled before the card register target');
});

test('manually sold-out codes always route to the waitlist in checkCode', () => {
  assert.match(register, /function isSoldOutCode\(code\)/);
  const check = register.slice(register.indexOf('async function checkCode'), register.indexOf('async function checkCode') + 4000);
  assert.match(check, /isSoldOutCode\(r\.code\)/);
});

test('manually sold-out sessions show a red SOLD OUT banner, no price, and a JOIN WAITLIST contact link', () => {
  assert.match(register, /var SOLD_OUT_CODES=\['SS-1103'\]/);
  assert.match(register, /SOLD_OUT_CONTACT_URL='https:\/\/mindfulbeginnings\.org\/contact'/);
  const render = register.slice(register.indexOf('function renderPublicSessions'), register.indexOf('async function loadPublicSessions'));
  assert.match(render, /soldOut/);
  assert.match(render, /psoldout-banner/);
  assert.match(render, />SOLD OUT</);
  assert.match(render, /if\(soldOut\)priceLabel=''/);
  assert.match(render, /JOIN WAITLIST/);
  assert.match(render, /pgo-waitlist.+SOLD_OUT_CONTACT_URL/);
  assert.match(render, /soldout-card/);
  assert.match(register, /\.public-card \.psoldout-banner\{/);
  assert.match(register, /a\.pgo-waitlist\{/);
});

test('deep links and waitlist stay on this page', () => {
  assert.match(register, /p\.get\('paycode'\)/);
  assert.match(register, /p\.get\('code'\)/);
  assert.match(register, /function startPayNow/);
  assert.match(register, /function goToWaitlist/);
  assert.match(register, /id="screen-waitlist"/);
});

test('Care Ready is priced and capped consistently across config and register fallbacks', () => {
  assert.match(config, /'Care Ready':\{price:185,price2027:185,priceNew:185,priceNew2027:185,matCost:0,hours:2\.5,maxStudents:16/);
  assert.match(config, /'Care Ready':185,/);
  assert.match(register, /'Care Ready':185/);
  assert.match(register, /'Care Ready':16/);
});

test('Care Ready gets the adult registration treatment (no grade, no parent/guardian)', () => {
  assert.match(register, /const isCareReady=s\.course==='Care Ready'/);
  assert.match(register, /function isAdultCourseName/);
  assert.match(register, /name==='Grandparents: Getting Started'\|\|name==='Care Ready'\|\|name==='Baby Ready'/);
  assert.match(register, /const isAdult=isAdultCourseName\(s\.course\)/);
  assert.match(register, /isAdult\?'Your information':'Student information'/);
  assert.match(register, /isAdult\?'Your contact information':'Parent \/ guardian'/);
  assert.match(register, /isAdult\?'Your full name \(electronic signature\) \*'/);
  assert.match(register, /const isAdult=isAdultCourseName\(currentSession&&currentSession\.course\)/);
  assert.match(register, /document\.getElementById\('terms-grandparent'\)\.style\.display=isAdult\?'':'none'/);
  assert.match(register, /isAdult\|\|isOwnRelease\|\|isGirlScout\)\?'none':''/);
});

test('Care Ready CPR notice is adult-worded with no certification claim', () => {
  const i = indexOf(register, ':isCareReady');
  const branch = register.slice(i, i + 400);
  assert.match(branch, /This course is educational only and does not provide CPR certification/);
  assert.doesNotMatch(branch, /child/i);
});
