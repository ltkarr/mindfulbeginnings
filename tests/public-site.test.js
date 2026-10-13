'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const cfg = require('../vercel.json');
const contactApi = require('../api/contact');
const { notifyLindsay, LINDSAY } = require('../lib/class-request-notify');

const root = path.join(__dirname, '..');

const PUBLIC_PAGES = [
  'index.html',
  'host-a-class.html',
  'girl-scouts.html',
  'reviews.html',
  'contact.html',
  'classes-catalog.html',
  'about.html',
  'cpr-certification.html',
  'register.html',
  'host.html',
  'organization.html',
  'pay.html'
];

function read(name) {
  return fs.readFileSync(path.join(root, name), 'utf8');
}

function navHrefs(html) {
  const nav = html.match(/<nav class="mb-nav"[\s\S]*?<\/nav>/);
  assert.ok(nav, 'missing shared nav');
  return [...nav[0].matchAll(/href="([^"]+)"/g)].map((match) => match[1]);
}

const NAV = [
  '/classes-catalog',
  '/host-a-class',
  '/girl-scouts',
  '/about',
  '/contact',
  '/cpr-certification',
  '/register.html'
];

test('every public page uses the same header nav and footer', () => {
  const header = read('partials/site-header.html');
  assert.deepEqual(navHrefs(header), NAV);
  assert.doesNotMatch(header, /Reviews/);
  assert.doesNotMatch(header, /x\.com|twitter/i);
  for (const name of PUBLIC_PAGES) {
    const html = read(name);
    assert.deepEqual(navHrefs(html), NAV, name);
    assert.match(html, /class="mb-footer"/, name);
    assert.match(html, /Mindful Beginnings LLC · Bethesda, MD · within 60 miles of DC/, name);
    assert.match(html, /href="tel:\+17039875979"/, name);
    assert.match(html, /href="mailto:lindsay@mindfulbeginnings\.org"/, name);
    assert.match(html, /facebook\.com\/share\/1GnY6MQ5cy/, name);
    assert.match(html, /instagram\.com\/mindfulbeginningsllc/, name);
    assert.doesNotMatch(html.match(/<footer class="mb-footer">[\s\S]*?<\/footer>/)[0], /x\.com|twitter/i, name);
    assert.match(html, /href="\/css\/site\.css"/, name);
  }
  assert.match(read('css/site.css'), /Montserrat/);
  assert.match(read('css/site.css'), /font-size:16px/);
  assert.match(read('css/site.css'), /#1E3161/);
  assert.match(read('css/site.css'), /#EFC75A/);
  assert.match(read('css/site.css'), /#F5F2EA/);
  assert.doesNotMatch(read('admin.html'), /class="mb-header"/);
  assert.doesNotMatch(read('instructor.html'), /class="mb-header"/);
});

test('home page uses the published headline, catalog anchors, and from-prices', () => {
  const home = read('index.html');
  const catalog = read('classes-catalog.html');
  assert.match(home, /<title>Safety and babysitting classes, DC area \| Mindful Beginnings<\/title>/);
  assert.match(home, /<h1>Safety and babysitting classes for kids, teens and caregivers\. We come to you\.<\/h1>/);
  assert.match(home, /Hands-on home alone, babysitting, first aid, CPR and choking rescue classes/);
  assert.match(home, /href="\/register\.html">Find a class</);
  assert.match(home, /href="\/host-a-class">Host a class for your group</);
  assert.match(home, /CPR certification for your team, taught where you work/);
  assert.match(home, /href="\/cpr-certification">See group CPR certification</);
  assert.match(home, /How it works/);
  assert.match(home, /We come to you/);
  assert.doesNotMatch(home, /<blockquote|testimonial/i);
  assert.equal(home.includes('\u2014'), false);

  const mins = {};
  const cards = catalog.match(/<article\b[^>]*data-group="[^"]+"[\s\S]*?<\/article>/g) || [];
  assert.ok(cards.length > 0);
  for (const card of cards) {
    const group = (card.match(/data-group="([^"]+)"/) || [])[1];
    const meta = (card.match(/<p class="meta">([\s\S]*?)<\/p>/) || [])[1] || '';
    const amounts = [...meta.matchAll(/\$(\d+)/g)].map((hit) => Number(hit[1]));
    assert.ok(amounts.length, group);
    const low = Math.min(...amounts);
    mins[group] = mins[group] == null ? low : Math.min(mins[group], low);
  }
  for (const [group, price] of Object.entries(mins)) {
    assert.match(home, new RegExp('href="/classes-catalog#' + group + '" data-from="' + price + '"'), group);
    assert.match(home, new RegExp('From \\$' + price + ' per participant'), group);
  }
});

test('host, girl scouts, reviews, and contact pages carry the live copy and SEO', () => {
  const host = read('host-a-class.html');
  const scouts = read('girl-scouts.html');
  const reviews = read('reviews.html');
  const contact = read('contact.html');
  assert.match(host, /<title>Host a safety or babysitting class \| Mindful Beginnings<\/title>/);
  assert.match(host, /href="\/host\.html"/);
  assert.match(host, /href="\/organization\.html"/);
  assert.match(host, /Who counts as an organization/);
  assert.match(host, /Home hosts receive one free registration/);
  assert.match(host, /703-987-5979/);
  assert.match(host, /lindsay@mindfulbeginnings\.org/);
  assert.equal(host.includes('\u2014'), false);

  assert.match(scouts, /<title>Girl Scout first aid and safety badges \| Mindful Beginnings<\/title>/);
  for (const level of ['Daisy', 'Brownie', 'Junior', 'Cadette', 'Senior', 'Ambassador']) {
    assert.match(scouts, new RegExp('<h2>' + level + ' \\('));
  }
  assert.match(scouts, /Handling choking emergencies/);
  assert.doesNotMatch(scouts, /chocking/);
  assert.match(scouts, /href="\/organization\.html">Request a troop workshop</);
  assert.equal(scouts.includes('\u2014'), false);

  assert.match(reviews, /<title>Reviews from families and students \| Mindful Beginnings<\/title>/);
  assert.match(reviews, /Reviews coming soon/);
  assert.match(reviews, /href="\/register\.html">Find a class</);
  assert.doesNotMatch(reviews, /<blockquote/);
  assert.equal(reviews.includes('\u2014'), false);

  assert.match(contact, /<title>Contact Mindful Beginnings \| Bethesda, MD<\/title>/);
  assert.match(contact, /We reply within 1 business day/);
  assert.match(contact, /id="name"[^>]*required/);
  assert.match(contact, /id="email"[^>]*type="email"[^>]*required/);
  assert.match(contact, /id="message"[^>]*required/);
  assert.match(contact, /src="\/js\/contact-form\.js"/);
  assert.equal(contact.includes('\u2014'), false);
});

test('clean marketing URLs rewrite, and the old GoDaddy paths redirect', () => {
  function destinations(file) {
    return (cfg.rewrites || []).filter((rule) => rule.destination === file).map((rule) => rule.source).sort();
  }
  assert.deepEqual(destinations('/host-a-class.html'), ['/host-a-class', '/host-a-class/']);
  assert.deepEqual(destinations('/girl-scouts.html'), ['/girl-scouts', '/girl-scouts/']);
  assert.deepEqual(destinations('/reviews.html'), ['/reviews', '/reviews/']);
  assert.deepEqual(destinations('/contact.html'), ['/contact', '/contact/']);
  const redirect = (source) => (cfg.redirects || []).find((rule) => rule.source === source);
  assert.equal(redirect('/host-a-class-1').destination, '/host-a-class');
  assert.equal(redirect('/host-a-class-1').permanent, true);
  assert.equal(redirect('/classes').destination, '/classes-catalog');
  assert.equal(redirect('/classes/').destination, '/classes-catalog');
  assert.equal(redirect('/').destination === '/register.html', false);
});

test('downloaded class and badge images from the live site are in the repo', () => {
  for (const file of [
    'images/girl-with-dog.jpg',
    'images/cpr.jpg',
    'images/host-home.jpg',
    'images/class-group.png',
    'images/girl-scouts-council.png',
    'images/badges/daisy-good-neighbor.jpg',
    'images/badges/junior-first-aid.jpg',
    'images/partners/safe-sitter.png',
    'images/partners/red-cross.png'
  ]) {
    const buf = fs.readFileSync(path.join(root, file));
    assert.ok(buf.length > 1000, file);
  }
});

test('contact form notifies Lindsay through the class-request mailer and does not email the sender', async () => {
  const sent = [];
  const ignored = await contactApi.submitContact({
    name: 'Ada',
    email: 'ada@example.com',
    message: 'Hello',
    companyWebsite: 'http://spam.example'
  }, {
    notifyLindsay: async function () { throw new Error('should not notify'); }
  });
  assert.equal(ignored.status, 200);
  assert.equal(ignored.body.sent, false);

  const missing = await contactApi.submitContact({ name: '', email: 'ada@example.com', message: 'Hello' });
  assert.equal(missing.status, 400);
  assert.equal(missing.body.field, 'name');

  const badEmail = await contactApi.submitContact({ name: 'Ada', email: 'not-an-email', message: 'Hello' });
  assert.equal(badEmail.status, 400);
  assert.equal(badEmail.body.field, 'email');

  const quiet = await contactApi.submitContact({
    name: 'Ada Lovelace',
    email: 'ada@example.com',
    message: 'Can you teach our troop?'
  }, {
    notifyLindsay: async function () { return { sent: false, reason: 'missing_credentials' }; }
  });
  assert.equal(quiet.status, 200);
  assert.equal(quiet.body.ok, true);
  assert.equal(quiet.body.sent, false);

  const result = await notifyLindsay({
    kind: 'contact',
    submitter_name: 'Ada Lovelace',
    submitter_email: 'ada@example.com',
    payload: { message: 'Can you teach our troop?' }
  }, {
    env: {
      graphTenant: 'tenant',
      graphClientId: 'id',
      graphSecret: 'secret',
      mailbox: LINDSAY,
      emailjsTemplate: '',
      emailjsPrivateKey: ''
    },
    fetch: async function (url, opts) {
      sent.push({ url: String(url), body: opts.body });
      if (String(url).includes('/token')) {
        return { ok: true, status: 200, json: async function () { return { access_token: 'tok' }; }, text: async function () { return ''; } };
      }
      return { ok: true, status: 202, json: async function () { return {}; }, text: async function () { return ''; } };
    }
  });
  assert.equal(result.sent, true);
  assert.equal(result.to, LINDSAY);
  const mail = sent.find((call) => call.url.includes('sendMail'));
  const payload = JSON.parse(mail.body);
  assert.match(payload.message.subject, /Website message - Ada Lovelace/);
  assert.match(payload.message.body.content, /Can you teach our troop\?/);
  assert.doesNotMatch(JSON.stringify(payload.message.toRecipients), /ada@example.com/);
});
