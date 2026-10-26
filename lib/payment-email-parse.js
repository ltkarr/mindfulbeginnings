'use strict';

/*
  Parses Venmo, Zelle (bank alert), and PayPal "you received money" emails into
  { source, payerName, payerEmail, payerPhone, amount, memo, receivedAt }.
  Returns null for anything that is not money coming in (for example "You paid X").
  The block between PARSER_START and PARSER_END is pasted into
  scripts/payment-inbox-sync.gs (Apps Script). Keep those copies identical.
*/
// PARSER_START
function money(s) {
  const m = String(s || '').match(/\$\s*([0-9][0-9,]*(?:\.[0-9]{1,2})?)/);
  if (!m) return null;
  const n = Math.round(parseFloat(m[1].replace(/,/g, '')) * 100) / 100;
  return Number.isFinite(n) && n > 0 ? n : null;
}
function clean(s) { return String(s || '').replace(/\s+/g, ' ').trim(); }
function decodePlus(s) { return clean(String(s || '').replace(/\+/g, ' ')); }
function clip(s, n) {
  const t = clean(s);
  if (!t) return null;
  return t.length > n ? t.slice(0, n).trim() : t;
}
function findPhone(text) {
  const m = String(text || '').match(/(?:\+?1[\s.-]*)?\(?\d{3}\)?[\s.-]\d{3}[\s.-]\d{4}/);
  if (!m) return null;
  const digits = m[0].replace(/\D/g, '').slice(-10);
  return digits.length === 10 ? digits : null;
}
function findEmail(text) {
  const re = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}/gi;
  let m;
  const src = String(text || '');
  while ((m = re.exec(src))) {
    const email = m[0].toLowerCase();
    const host = email.split('@')[1] || '';
    if (host === 'paypal.com' || host.slice(-11) === '.paypal.com') continue;
    if (host === 'venmo.com' || host.slice(-10) === '.venmo.com') continue;
    return email;
  }
  return null;
}
function trimPayerName(name) {
  const drop = {
    with: 1, using: 1, via: 1, for: 1, zelle: 1, payment: 1, money: 1,
    see: 1, details: 1, amount: 1, date: 1, message: 1, memo: 1,
    transaction: 1, confirmation: 1, usd: 1
  };
  const parts = clean(name).split(' ');
  while (parts.length > 2 && drop[parts[parts.length - 1].toLowerCase()]) parts.pop();
  return parts.join(' ');
}
function wordsBefore(text, markerRe) {
  const src = String(text || '');
  const m = src.match(markerRe);
  if (!m || m.index == null) return null;
  const skip = { zelle: 1, with: 1, you: 1, received: 1, money: 1, payment: 1, from: 1, the: 1 };
  const words = src.slice(0, m.index).trim().split(/\s+/);
  const picked = [];
  for (let i = words.length - 1; i >= 0 && picked.length < 5; i--) {
    const w = words[i].replace(/^[("']+|[)."',:]+$/g, '');
    if (!/^[A-Z][A-Za-z\u00C0-\u024F'’-]*$/.test(w)) break;
    if (skip[w.toLowerCase()]) break;
    picked.unshift(w);
  }
  return picked.length >= 2 ? picked.join(' ') : null;
}
function nameAfterFrom(text) {
  const m = String(text || '').match(/\bfrom\s+([A-Z][A-Za-z\u00C0-\u024F'’-]*(?:\s+[A-Z][A-Za-z\u00C0-\u024F'’-]*){1,4})/);
  return m ? trimPayerName(m[1]) : null;
}

function parsePaymentEmail(msg) {
  msg = msg || {};
  const from = String(msg.from || '').toLowerCase();
  const subj = clean(msg.subject);
  const text = clean(msg.body);
  const blob = clean(subj + ' ' + text);
  let receivedAt = null;
  if (msg.date) {
    const d = new Date(msg.date);
    if (!isNaN(d.getTime())) receivedAt = d.toISOString();
  }

  if (from.indexOf('venmo@venmo.com') !== -1) {
    if (/^you paid\b/i.test(subj)) return null;
    const m = subj.match(/^(.+?) paid (?:you )?\$([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
    if (!m) return null;
    const amount = money('$' + m[2]);
    if (amount == null) return null;
    const memoM = text.match(/(Reg[ +]id_[a-z0-9]+.*?)(?:\s+See transaction|\s+Transaction details|$)/i);
    return {
      source: 'venmo',
      payerName: clean(m[1]),
      payerEmail: findEmail(text),
      payerPhone: findPhone(text),
      amount: amount,
      memo: clip(memoM ? decodePlus(memoM[1]) : null, 240),
      receivedAt: receivedAt
    };
  }

  if (from.indexOf('paypal.com') !== -1) {
    if (/\b(you paid|you sent|receipt for|automatic payment)\b/i.test(subj)) return null;
    let name = null;
    let amount = null;
    const subM = subj.match(/^(.+?) sent you \$([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
    if (subM && !/^you(?:'|’)?ve got money/i.test(subj)) {
      name = trimPayerName(subM[1]);
      amount = money('$' + subM[2]);
    }
    if (amount == null || !name) {
      const bodyName = wordsBefore(blob, /\s+sent you\s+\$/i);
      const bodyM = blob.match(/sent you\s+\$([0-9][0-9,]*(?:\.[0-9]{1,2})?)/i);
      if (bodyName && bodyM) {
        name = bodyName;
        amount = money('$' + bodyM[1]);
      }
    }
    if (!name || amount == null || /^you\b/i.test(name)) return null;
    const noteM = text.match(/Note from [^:]+:\s*(.+?)(?:\s+Transaction|\s+Details|$)/i);
    return {
      source: 'paypal',
      payerName: name,
      payerEmail: findEmail(text),
      payerPhone: findPhone(text),
      amount: amount,
      memo: clip(noteM ? noteM[1] : null, 240),
      receivedAt: receivedAt
    };
  }

  if (/zelle/i.test(blob)) {
    if (/\b(you sent money|money sent to|you sent \$|payment sent)\b/i.test(blob)) return null;
    const amount = money(subj) || money(text);
    if (amount == null) return null;
    const payer = wordsBefore(blob, /\s+sent you\b/i) || nameAfterFrom(blob);
    if (!payer) return null;
    const memoM = text.match(/(?:Memo|Message|Note):\s*(.+?)(?:\s+(?:Amount|Date|Transaction|Confirmation|Zelle)\b|$)/i);
    return {
      source: 'zelle',
      payerName: payer,
      payerEmail: findEmail(text),
      payerPhone: findPhone(text),
      amount: amount,
      memo: clip(memoM ? memoM[1] : null, 240),
      receivedAt: receivedAt
    };
  }
  return null;
}
// PARSER_END
module.exports = { parsePaymentEmail };
