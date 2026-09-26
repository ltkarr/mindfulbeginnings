'use strict';

/** Statuses that must never be overwritten by a PayPal capture. */
const TERMINAL_PAID_STATUSES = new Set(['paid', 'host', 'in_kind']);

function parseMoney(value) {
  const n = typeof value === 'number' ? value : parseFloat(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
  if (!Number.isFinite(n)) return null;
  return Math.round(n * 100) / 100;
}

function formatMoney(value) {
  const n = parseMoney(value);
  if (n == null) return null;
  return n.toFixed(2);
}

function isChargeableAmount(value, { min = 0.01, max = 1000 } = {}) {
  const n = parseMoney(value);
  if (n == null) return false;
  return n >= min && n <= max;
}

function isTerminalPaidStatus(status) {
  return TERMINAL_PAID_STATUSES.has(String(status || '').toLowerCase());
}

function canMarkPaid(status) {
  const s = String(status || '').toLowerCase();
  return s === '' || s === 'pending' || s === 'unpaid';
}

/**
 * Memo used for Venmo / Zelle (and shown next to PayPal).
 * Includes the registration id when we have one so Lindsay can match without guessing.
 */
function buildPaymentMemo({ registrationId, studentName, course, fallback } = {}) {
  const parts = [];
  const id = String(registrationId || '').trim();
  if (id) parts.push('Reg ' + id);
  const who = String(studentName || '').replace(/\s+/g, ' ').trim();
  const what = String(course || '').replace(/\s+/g, ' ').trim();
  if (who && what) parts.push(who + ' — ' + what);
  else if (who) parts.push(who);
  else if (what) parts.push(what);
  const memo = parts.join(' | ');
  return memo || fallback || 'Mindful Beginnings payment';
}

function paypalDescription({ studentName, course, registrationId } = {}) {
  const memo = buildPaymentMemo({ registrationId, studentName, course, fallback: 'Mindful Beginnings course' });
  return memo.slice(0, 127);
}

function extractCaptureFromOrder(order) {
  const pu = (order && order.purchase_units && order.purchase_units[0]) || {};
  const captures = (pu.payments && pu.payments.captures) || [];
  const cap = captures[0] || {};
  return {
    orderId: order && order.id,
    captureId: cap.id || null,
    status: String(cap.status || '').toUpperCase(),
    amount: cap.amount && cap.amount.value != null ? parseMoney(cap.amount.value) : parseMoney(pu.amount && pu.amount.value),
    customId: cap.custom_id || pu.custom_id || '',
    currency: (cap.amount && cap.amount.currency_code) || (pu.amount && pu.amount.currency_code) || 'USD'
  };
}

/** Reservation tags that become stale once pay_status is paid / host / in_kind. */
function clearPendingPaymentNotes(notes) {
  return String(notes || '')
    .replace(/\[Registered\s*[—-]\s*awaiting payment\]\s*/gi, '')
    .replace(/\[Family marked [^\]]*\]\s*/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function hasPaidIndicatorNote(notes) {
  return /\[(Paid via |Registered\s*[—-]\s*paid\]|FREE registration|AUCTION|Re-registration)/i.test(String(notes || ''));
}

/**
 * Notes shown (or persisted) for a registration, kept consistent with pay_status.
 * Paid / host / in_kind never keep "awaiting payment". Pending / unpaid keep it.
 */
function notesForPaymentStatus(payStatus, notes) {
  const raw = String(notes == null ? '' : notes);
  const status = String(payStatus || '').toLowerCase();
  if (!isTerminalPaidStatus(status)) return raw;
  const hadAwaiting = /\[Registered\s*[—-]\s*awaiting payment\]/i.test(raw);
  const cleaned = clearPendingPaymentNotes(raw);
  if (status === 'paid' && hadAwaiting && !hasPaidIndicatorNote(cleaned)) {
    return ('[Registered — paid]' + (cleaned ? ' ' + cleaned : '')).trim();
  }
  return cleaned;
}

function paidNotesLine({ captureId, amount, existingNotes }) {
  const line = '[Paid via PayPal TX ' + (captureId || 'unknown') + ' — $' + (formatMoney(amount) || amount) + ']';
  const prev = clearPendingPaymentNotes(existingNotes);
  if (prev.includes(captureId || '___never___')) return prev;
  return (line + (prev ? ' ' + prev : '')).trim();
}

/**
 * Supabase patch for the admin UI "Mark paid" / "Mark unpaid" toggle.
 * Host-initiated confirmation is not a collected checkout, so revenue is $0.
 * PayPal/card capture still writes the charged total via markRegistrationPaid().
 */
function adminTogglePaidPatch({ currentlyPaid, existingPricePaid } = {}) {
  if (currentlyPaid) {
    const patch = { pay_status: 'unpaid' };
    if (existingPricePaid === 0) patch.price_paid = null;
    return patch;
  }
  return { pay_status: 'paid', price_paid: 0 };
}

/**
 * Match a payment already received (PayPal, Venmo, Zelle, or anything else)
 * to open registrations. This does not call a bank or a payment app.
 * A row is included only when its registration id appears in the note, or when
 * the amount matches and at least one of email, phone, or name matches.
 * Keep the copy of this function in admin.html in sync.
 */
function findPaymentMatches(opts) {
  opts = opts || {};
  const list = Array.isArray(opts.registrations) ? opts.registrations : [];
  const payer = String(opts.payer || '');
  const memo = String(opts.memo || '');
  const hay = (payer + '\n' + memo).toLowerCase();
  const amt = matchMoney(opts.amount);
  const STOP = {
    paypal: 1, venmo: 1, zelle: 1, paid: 1, payment: 1, via: 1, from: 1,
    the: 1, and: 1, for: 1, reg: 1, sent: 1, registration: 1, class: 1, course: 1
  };

  function matchMoney(value) {
    if (value == null || value === '') return null;
    const raw = typeof value === 'number' ? String(value) : String(value).replace(/,/g, '');
    const n = typeof value === 'number' ? value : parseFloat(raw.replace(/[^0-9.-]/g, ''));
    if (!Number.isFinite(n)) return null;
    return Math.round(n * 100) / 100;
  }
  function matchEmails(text) {
    const out = [];
    const re = /[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z][a-z]+/gi;
    let m;
    const src = String(text || '');
    while ((m = re.exec(src))) out.push(m[0].toLowerCase());
    return out;
  }
  function matchPhones(text) {
    const out = [];
    const src = String(text || '');
    let cur = '';
    let sep = 0;
    function push() {
      if (!cur) return;
      let d = cur;
      if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
      if (d.length >= 7) out.push(d);
      cur = '';
      sep = 0;
    }
    for (let i = 0; i < src.length; i++) {
      const c = src.charAt(i);
      if (c >= '0' && c <= '9') { cur += c; sep = 0; }
      else if (cur && (c === ' ' || c === '-' || c === '.' || c === '(' || c === ')')) {
        sep++;
        if (sep > 2) push();
      } else push();
    }
    push();
    return out;
  }
  function matchTokens(text) {
    const stripped = String(text || '').replace(/[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z][a-z]+/gi, ' ');
    return stripped.toLowerCase().split(/[^a-z]+/).filter(function (t) {
      return t.length >= 2 && !STOP[t];
    });
  }
  function nameCovers(queryTokens, target) {
    const targetTokens = matchTokens(target);
    if (!queryTokens.length || !targetTokens.length) return false;
    if (queryTokens.length === 1) return targetTokens.indexOf(queryTokens[0]) !== -1;
    return queryTokens.every(function (t) { return targetTokens.indexOf(t) !== -1; });
  }
  function phonesMatch(left, contact) {
    const contactPhones = matchPhones(contact);
    const digits = String(contact || '').replace(/\D/g, '');
    return left.some(function (p) {
      const last10 = p.slice(-10);
      const last7 = p.length >= 7 ? p.slice(-7) : '';
      const inList = contactPhones.some(function (c) {
        if (last10 && c.slice(-10) === last10) return true;
        return !!(last7 && c.slice(-7) === last7);
      });
      if (inList) return true;
      if (digits && last10 && digits.indexOf(last10) !== -1) return true;
      return !!(digits && last7 && digits.indexOf(last7) !== -1);
    });
  }

  const blob = payer + ' ' + memo;
  const payerEmails = matchEmails(blob);
  const payerPhones = matchPhones(blob);
  const payerTokens = matchTokens(payer);
  const hits = [];

  list.forEach(function (r) {
    if (!r) return;
    const status = String(r.payStatus != null ? r.payStatus : (r.status || '')).toLowerCase();
    if (status !== '' && status !== 'pending' && status !== 'unpaid') return;
    const id = String(r.id || '');
    const reasons = [];
    let score = 0;
    const hasId = id.length >= 6 && hay.indexOf(id.toLowerCase()) !== -1;
    if (hasId) { score += 100; reasons.push('registration id'); }

    let due = null;
    if (typeof opts.priceOf === 'function') due = matchMoney(opts.priceOf(r));
    else if (r.amountDue != null) due = matchMoney(r.amountDue);
    const amountHit = amt != null && due != null && Math.abs(amt - due) <= 0.01;
    if (amountHit) { score += 40; reasons.push('amount'); }

    const contact = String(r.contact || '');
    const contactEmails = matchEmails(contact);
    const emailHit = payerEmails.some(function (e) { return contactEmails.indexOf(e) !== -1; });
    if (emailHit) { score += 30; reasons.push('email'); }

    const phoneHit = phonesMatch(payerPhones, contact);
    if (phoneHit) { score += 30; reasons.push('phone'); }

    const parent = r.parentName || r.parent_name || '';
    const student = r.studentName || r.student_name || '';
    const nameMatched = nameCovers(payerTokens, parent) || nameCovers(payerTokens, student)
      || nameCovers(matchTokens(parent), blob) || nameCovers(matchTokens(student), blob)
      || nameCovers(matchTokens(memo), parent) || nameCovers(matchTokens(memo), student);
    if (nameMatched) { score += 25; reasons.push('name'); }

    if (!(hasId || (amountHit && (emailHit || phoneHit || nameMatched)))) return;
    hits.push({
      id: id,
      registration: r,
      score: score,
      reasons: reasons,
      amountDue: due,
      amountDiffers: !!(hasId && amt != null && due != null && !amountHit)
    });
  });
  hits.sort(function (a, b) {
    if (b.score !== a.score) return b.score - a.score;
    return String(a.id).localeCompare(String(b.id));
  });
  return hits;
}

module.exports = {
  TERMINAL_PAID_STATUSES,
  parseMoney,
  formatMoney,
  isChargeableAmount,
  isTerminalPaidStatus,
  canMarkPaid,
  buildPaymentMemo,
  paypalDescription,
  extractCaptureFromOrder,
  clearPendingPaymentNotes,
  notesForPaymentStatus,
  paidNotesLine,
  adminTogglePaidPatch,
  findPaymentMatches
};
