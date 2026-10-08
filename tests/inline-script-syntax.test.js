'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');

function htmlPages() {
  return fs.readdirSync(root)
    .filter((name) => name.endsWith('.html'))
    .sort();
}

function isJavaScriptType(type) {
  if (!type) return true;
  const normalized = type.toLowerCase();
  return normalized === 'text/javascript'
    || normalized === 'application/javascript'
    || normalized === 'text/ecmascript'
    || normalized === 'module';
}

// Pull each inline <script> out of an HTML page. External scripts (src=)
// are skipped. A later </script> ends the block, which matches how the
// browser reads the page, including scripts that mention "<script>" in a string.
function extractInlineScripts(html) {
  const scripts = [];
  const re = /<script\b([^>]*)>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(html))) {
    const attrs = match[1] || '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const typeMatch = attrs.match(/\btype\s*=\s*["']([^"']+)["']/i);
    const type = typeMatch ? typeMatch[1] : '';
    if (!isJavaScriptType(type)) continue;
    const openLine = html.slice(0, match.index).split('\n').length;
    const prefix = match[0].slice(0, match[0].indexOf('>') + 1);
    scripts.push({
      startLine: openLine + prefix.split('\n').length - 1,
      code: match[2],
      module: type.toLowerCase() === 'module'
    });
  }
  return scripts;
}

function checkWithNode(code, label, module) {
  const file = path.join(
    os.tmpdir(),
    'mb-inline-' + process.pid + '-' + Date.now() + '-' + Math.random().toString(16).slice(2) + (module ? '.mjs' : '.js')
  );
  fs.writeFileSync(file, code);
  try {
    const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
    if (result.status === 0) return;
    const detail = (result.stderr || result.stdout || 'node --check failed').trim();
    const escaped = file.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const mapped = detail.replace(new RegExp(escaped + ':(\\d+)', 'g'), function (_, line) {
      const htmlLine = label.startLine + Number(line) - 1;
      return label.page + ':' + htmlLine;
    });
    assert.fail(label.page + ' inline script at line ' + label.startLine + ' failed node --check\n' + mapped);
  } finally {
    fs.rmSync(file, { force: true });
  }
}

test('inline scripts in HTML pages pass node --check', () => {
  const pages = htmlPages();
  const covered = new Set();
  let sawAdminLogin = false;

  for (const page of pages) {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    const scripts = extractInlineScripts(html);
    if (!scripts.length) continue;
    covered.add(page);
    for (const script of scripts) {
      if (page === 'admin.html' && script.code.includes('function doLogin')) sawAdminLogin = true;
      checkWithNode(script.code, { page, startLine: script.startLine }, script.module);
    }
  }

  for (const page of ['admin.html', 'host.html', 'instructor.html', 'organization.html', 'pay.html', 'register.html']) {
    assert.ok(covered.has(page), page + ' inline script was not syntax-checked');
  }
  assert.equal(sawAdminLogin, true, 'the admin login script was not extracted whole');
});
