'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('node:vm');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');

function extractFn(src, name) {
  const start = src.indexOf('function ' + name + '(');
  assert.ok(start >= 0, 'missing function ' + name);
  const from = src.slice(Math.max(0, start - 6), start) === 'async ' ? start - 6 : start;
  let i = src.indexOf('{', start);
  let depth = 0;
  for (; i < src.length; i++) {
    if (src[i] === '{') depth++;
    else if (src[i] === '}') {
      depth--;
      if (depth === 0) return src.slice(from, i + 1);
    }
  }
  throw new Error('unclosed function ' + name);
}

test('portal and admin show Apparel size and still bind sweatshirt_size', () => {
  assert.match(instructor, /id="apparel-size-label"[^>]*>Apparel size</);
  assert.match(instructor, /Please select your apparel size\./);
  assert.match(instructor, /aria-labelledby="apparel-size-label"/);
  assert.match(instructor, /Documents, contact details, and apparel size\./);
  assert.match(instructor, /Apparel size saved:/);
  assert.match(instructor, /p_changes:\{sweatshirt_size:size\}/);
  assert.match(instructor, /sweatshirtSize:profile\.sweatshirt_size/);
  assert.doesNotMatch(instructor, /Sweatshirt [Ss]ize/);
  assert.doesNotMatch(instructor, /select your sweatshirt size/);

  assert.match(admin, /<label for="m-isweat">Apparel size<\/label><select id="m-isweat"/);
  assert.match(admin, /field\('Apparel size', i\.sweatshirtSize/);
  assert.match(admin, /'Training Date','Apparel size','Contract Signed'/);
  assert.match(admin, />Apparel size<\/div>/);
  assert.match(admin, /sweatshirt_size:i\.sweatshirtSize/);
  assert.match(admin, /sweatshirtSize:r\.sweatshirt_size/);
  assert.doesNotMatch(admin, /Sweatshirt/);
  assert.match(admin, /<option value="XS"/);
  assert.match(admin, /<option value="2XL"/);
  assert.match(instructor, /const sizes=\['XS','S','M','L','XL','XXL','XXXL'\]/);
});

test('a stored sweatshirt_size still loads and saves under that name', async () => {
  const adminStart = admin.indexOf('const INSTRUCTOR_LEVELS=');
  const adminEnd = admin.indexOf('function jobFromDB');
  assert.ok(adminStart >= 0 && adminEnd > adminStart);
  const sandbox = {};
  vm.runInNewContext(admin.slice(adminStart, adminEnd) + `
    globalThis.instructorFromDB = instructorFromDB;
    globalThis.instructorToDB = instructorToDB;
  `, sandbox);

  const loaded = sandbox.instructorFromDB({
    id: 'fixture-jessica',
    name: 'Fixture Jessica',
    sweatshirt_size: 'M',
    hourly_rate: 50
  });
  assert.equal(loaded.sweatshirtSize, 'M');
  const saved = sandbox.instructorToDB(Object.assign({}, loaded, { sweatshirtSize: 'L' }));
  assert.equal(saved.sweatshirt_size, 'L');
  assert.equal(saved.sweatshirtSize, undefined);

  const portal = {
    me: {
      id: 'fixture-daniela',
      name: 'Fixture Daniela',
      email: 'fixture@example.com',
      phone: '',
      zelle: '',
      pin: '0000',
      hourlyRate: 50,
      sweatshirtSize: 'M',
      isLeadTeacher: false,
      isRN: false,
      jobAlertsEnabled: false
    },
    document: {
      getElementById: function () {
        return { innerHTML: '' };
      }
    },
    escapeHtml: function (t) { return String(t == null ? '' : t); },
    jobAlertsOptInHtml: function () { return ''; },
    isSafeSitterCertified: function () { return false },
    showToast: function (message) { portal.lastToast = message; },
    sb: {
      rpc: async function (name, args) {
        portal.rpc = { name: name, args: args };
        return { error: null };
      }
    },
    console: console
  };
  vm.createContext(portal);
  vm.runInContext([
    extractFn(instructor, 'renderMyInfo'),
    extractFn(instructor, 'selectSweatshirt')
  ].join('\n'), portal);

  let html = '';
  portal.document.getElementById = function () {
    return {
      set innerHTML(value) { html = value; },
      get innerHTML() { return html; }
    };
  };
  portal.renderMyInfo();
  assert.match(html, /Apparel size/);
  assert.match(html, /aria-labelledby="apparel-size-label"/);
  assert.match(html, /id="sz-M"[^>]*aria-pressed="true"/);
  assert.match(html, /Size on file: M/);
  assert.doesNotMatch(html, /[Ss]weatshirt [Ss]ize/);

  await portal.selectSweatshirt('L');
  assert.equal(portal.rpc.name, 'instructor_update_self');
  assert.equal(portal.rpc.args.p_changes.sweatshirt_size, 'L');
  assert.equal(Object.keys(portal.rpc.args.p_changes).length, 1);
  assert.equal(Object.keys(portal.rpc.args.p_changes)[0], 'sweatshirt_size');
  assert.equal(portal.me.sweatshirtSize, 'L');
  assert.match(portal.lastToast, /Apparel size saved: L/);
});
