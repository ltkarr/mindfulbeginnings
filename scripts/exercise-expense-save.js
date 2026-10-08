'use strict';

// Loads admin.html in headless Chrome and runs Edit expense → Yearly → Save.
// Usage: node scripts/exercise-expense-save.js [url]
// Default url is the local file server passed by the caller.

const { spawn } = require('child_process');
const http = require('http');
const fs = require('fs');

const url = process.argv[2];
if (!url) {
  console.error('Usage: node scripts/exercise-expense-save.js <admin.html url>');
  process.exit(2);
}

const port = 9222 + Math.floor(Math.random() * 1000);
const profile = '/tmp/chrome-expense-' + process.pid;
fs.mkdirSync(profile, { recursive: true });

const chrome = spawn('google-chrome', [
  '--headless=new',
  '--disable-gpu',
  '--no-sandbox',
  '--disable-dev-shm-usage',
  '--remote-debugging-port=' + port,
  '--user-data-dir=' + profile,
  url
], { stdio: 'ignore' });

function get(path) {
  return new Promise((resolve, reject) => {
    http.get({ host: '127.0.0.1', port, path }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    }).on('error', reject);
  });
}

function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }

async function target() {
  for (let i = 0; i < 40; i++) {
    try {
      const list = JSON.parse(await get('/json/list'));
      const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
      if (page) return page;
    } catch (e) {}
    await sleep(250);
  }
  throw new Error('Chrome did not open a page');
}

const expr = `(async function(){
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 50 && (typeof updateExpense !== 'function' || typeof COURSES === 'undefined'); i++) await wait(100);
  if (typeof updateExpense !== 'function') return { ok:false, error:'updateExpense was not defined' };
  const gsfa = { id:'gsfa', code:'GSFA-270303', course:'Girl Scout Badge Class', date:'2027-03-03', time:'5:00-6:30 PM', requiresRN:true, isCustomJob:false };
  if (!Array.isArray(sessions)) sessions = [];
  if (!sessions.some((s) => s.id === 'gsfa')) sessions.push(gsfa);
  _costSessionId = 'gsfa';
  expenses = [{ id:'yearly-exp', description:'Cursor Yearly', amount:240, date:'2026-01-01', category:'Software', paymentMethod:'', sessionId:null, recurrence:'monthly', recurUntil:'', recurActive:true }];
  openEditExpense('yearly-exp');
  const before = (document.querySelector('#modal-root h3') || {}).textContent || '';
  document.getElementById('m-erecur').value = 'yearly';
  try { await updateExpense('yearly-exp'); } catch (e) {}
  await wait(400);
  const h3 = document.querySelector('#modal-root h3');
  const sel = document.createElement('select');
  sel.id = 'm-course';
  const opt = document.createElement('option');
  opt.textContent = 'Girl Scout Badge Class';
  opt.selected = true;
  sel.appendChild(opt);
  const box = document.createElement('input');
  box.type = 'checkbox';
  box.id = 'm-rnonly';
  box.checked = true;
  const note = document.createElement('div');
  note.id = 'm-rn-notice';
  document.body.appendChild(sel);
  document.body.appendChild(box);
  document.body.appendChild(note);
  updateRnNotice();
  const row = expenses.find((e) => e.id === 'yearly-exp') || {};
  return {
    ok: before === 'Edit expense' && !h3 && row.recurrence === 'yearly' && box.disabled === false && !/must be taught by a certified registered nurse/.test(note.innerHTML || ''),
    before: before,
    after: h3 ? h3.textContent : '',
    recurrence: row.recurrence,
    costSessionId: _costSessionId,
    courseRequiresRN: !!((COURSES['Girl Scout Badge Class'] || {}).requiresRN),
    boxDisabled: box.disabled,
    note: note.textContent || ''
  };
})()`;

async function main() {
  const page = await target();
  await sleep(1500);
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve);
    ws.addEventListener('error', () => reject(new Error('devtools socket failed')));
  });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(ev.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  function send(method, params) {
    const msgId = ++id;
    return new Promise((resolve) => {
      pending.set(msgId, resolve);
      ws.send(JSON.stringify({ id: msgId, method, params }));
    });
  }
  await send('Runtime.enable', {});
  const evalRes = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  const value = evalRes.result && evalRes.result.result && evalRes.result.result.value;
  const err = evalRes.result && evalRes.result.exceptionDetails;
  console.log(JSON.stringify(value || { ok: false, error: err && err.text || evalRes }, null, 2));
  ws.close();
  chrome.kill();
  if (!value || !value.ok) process.exit(1);
}

main().catch((e) => {
  console.error(e);
  chrome.kill();
  process.exit(1);
});
