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

/** Complimentary seats. Settled, and never revenue. */
const COMPED_STATUSES = new Set(['host', 'in_kind', 'comp', 'free']);

function registrationStatus(row) {
  if (!row) return '';
  const raw = row.payStatus != null ? row.payStatus : row.pay_status;
  return String(raw == null ? '' : raw).toLowerCase().trim();
}

/**
 * Cash still owed on an open registration.
 * Host, in-kind, comp, and free owe nothing, even when the class price is positive.
 * An explicit price of $0 owes nothing. A blank price uses listPrice (the class price).
 * A missing list price is unknown, so an unpaid row still counts as owing money.
 * Paid rows owe nothing — the money already landed, including a $0 paid comp.
 * Waitlist and cancelled are not open balances.
 */
function registrationOwesMoney(row, listPrice) {
  const status = registrationStatus(row);
  if (!row) return false;
  if (isTerminalPaidStatus(status) || COMPED_STATUSES.has(status)) return false;
  if (status !== '' && status !== 'pending' && status !== 'unpaid') return false;
  const custom = row.pricePaid != null ? row.pricePaid : row.price_paid;
  if (custom != null && custom !== '') {
    const n = parseMoney(custom);
    return n != null && n > 0;
  }
  if (listPrice == null || listPrice === '') return true;
  const n = parseMoney(listPrice);
  if (n == null) return true;
  return n > 0;
}

/** Settled for the roster and unpaid counts. Waitlist and cancelled are not settled. */
function registrationIsSettled(row, listPrice) {
  const status = registrationStatus(row);
  if (!row || status === 'waitlist' || status === 'cancelled') return false;
  if (isTerminalPaidStatus(status) || COMPED_STATUSES.has(status)) return true;
  if (status === '' || status === 'pending' || status === 'unpaid') {
    return !registrationOwesMoney(row, listPrice);
  }
  return false;
}

/** Roster label. Paid cash stays "paid". A host seat reads Comped/Host. */
function rosterSettlementLabel(row, listPrice) {
  const status = registrationStatus(row);
  if (status === 'host') return 'Comped/Host';
  if (status === 'in_kind') return 'in-kind';
  if (status === 'comp' || status === 'free') return 'Comped';
  if ((status === '' || status === 'pending' || status === 'unpaid') && registrationIsSettled(row, listPrice)) {
    return 'Comped';
  }
  if (status === 'paid') return 'paid';
  return status || 'unpaid';
}

/** CSS tag class. Comped seats use the host (settled) color, not the unpaid warning. */
function rosterSettlementTagClass(row, listPrice) {
  const status = registrationStatus(row);
  if (status === 'host' || status === 'comp' || status === 'free') return 'host';
  if ((status === '' || status === 'pending' || status === 'unpaid') && registrationIsSettled(row, listPrice)) {
    return 'host';
  }
  if (status === 'in_kind') return 'in_kind';
  if (status === 'paid') return 'paid';
  if (status === 'cancelled') return 'cancelled';
  if (status === 'pending') return 'pending';
  if (status === 'waitlist') return 'waitlist';
  return status || 'unpaid';
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

/** Stored on registrations.payment_method. Keep the admin.html copy in sync. */
const PAYMENT_METHODS = ['paypal', 'venmo', 'zelle', 'check', 'other'];

const PAYMENT_METHOD_LABELS = {
  paypal: 'PayPal',
  venmo: 'Venmo',
  zelle: 'Zelle',
  check: 'Check',
  other: 'Other'
};

function normalizePaymentMethod(value) {
  const s = String(value == null ? '' : value).trim().toLowerCase();
  if (s === 'card' || s === 'paypal-link') return 'paypal';
  return PAYMENT_METHODS.indexOf(s) === -1 ? '' : s;
}

function paymentMethodLabel(method) {
  const key = normalizePaymentMethod(method);
  return key ? PAYMENT_METHOD_LABELS[key] : '';
}

/**
 * Fields to persist when someone chooses how a registration was paid.
 * paypal_tx_id is set only for PayPal, and only when a reference is known,
 * so a Venmo/Zelle save does not wipe a capture id.
 */
function paymentMethodPatch({ method, ref, detail, paypalTxId } = {}) {
  const key = normalizePaymentMethod(method);
  if (!key) {
    return { ok: false, error: 'Choose how they paid (PayPal, Venmo, Zelle, check, or other).' };
  }
  const cleanDetail = String(detail == null ? '' : detail).replace(/\s+/g, ' ').trim();
  if (key === 'other' && !cleanDetail) {
    return { ok: false, error: 'Describe the other way they paid.' };
  }
  const cleanRef = String(ref == null ? '' : ref).replace(/\s+/g, ' ').trim();
  const fields = {
    payment_method: key,
    payment_ref: cleanRef || null,
    payment_detail: key === 'other' ? cleanDetail : null
  };
  if (key === 'paypal') {
    const tx = cleanRef || String(paypalTxId == null ? '' : paypalTxId).trim();
    if (tx) {
      fields.paypal_tx_id = tx;
      fields.payment_ref = tx;
    }
  }
  return { ok: true, fields };
}

/** PayPal capture: method, capture id, and the existing paid note. Does not set price_paid. */
function paypalCapturePatch({ captureId, amount, existingNotes, existingPaypalTxId, existingPaymentRef } = {}) {
  const tx = captureId || existingPaypalTxId || null;
  const keptRef = existingPaymentRef ? String(existingPaymentRef).trim() : '';
  return {
    pay_status: 'paid',
    payment_method: 'paypal',
    paypal_tx_id: tx,
    payment_ref: tx || keptRef || null,
    notes: paidNotesLine({ captureId: captureId || tx, amount, existingNotes })
  };
}

/** Note line for a non-capture mark-paid. PayPal reuses paidNotesLine. */
function appendPaidMethodNote({ method, ref, detail, amount, existingNotes } = {}) {
  const key = normalizePaymentMethod(method);
  if (key === 'paypal') {
    return paidNotesLine({ captureId: ref || 'unknown', amount, existingNotes });
  }
  const label = paymentMethodLabel(key) || 'Other';
  const detailBit = key === 'other' && String(detail || '').trim() ? ' (' + String(detail).trim() + ')' : '';
  const refText = String(ref || '').trim();
  const refBit = refText ? ' ref ' + refText : '';
  const amt = formatMoney(amount);
  const line = '[Paid via ' + label + detailBit + refBit + (amt ? ' — $' + amt : '') + ']';
  const prev = clearPendingPaymentNotes(existingNotes);
  if (prev.indexOf('[Paid via ' + label) !== -1) return prev;
  return (line + (prev ? ' ' + prev : '')).trim();
}

/**
 * Registrations "Mark paid" / match-payment update.
 * Does not set price_paid — revenue stays on the class price or an existing override.
 */
function rosterMarkPaidPatch({ method, ref, detail, amount, existingNotes, paypalTxId } = {}) {
  const built = paymentMethodPatch({ method, ref, detail, paypalTxId });
  if (!built.ok) return { error: built.error };
  const notes = appendPaidMethodNote({
    method: built.fields.payment_method,
    ref: built.fields.payment_ref,
    detail: built.fields.payment_detail,
    amount: amount,
    existingNotes: existingNotes
  });
  return Object.assign({ pay_status: 'paid', notes: notes }, built.fields);
}

/**
 * Roster / registration label. Empty when nothing was stored.
 * A PayPal capture id already on the row is shown, because checkout wrote it.
 * Notes are not parsed — older Venmo/Zelle rows stay blank until someone chooses a method.
 */
function formatPaymentMethodDisplay(row) {
  row = row || {};
  const method = normalizePaymentMethod(row.paymentMethod != null ? row.paymentMethod : row.payment_method);
  const detail = String(row.paymentDetail != null ? row.paymentDetail : (row.payment_detail || '')).trim();
  const ref = String(row.paymentRef != null ? row.paymentRef : (row.payment_ref || '')).trim();
  const tx = String(row.paypalTxId != null ? row.paypalTxId : (row.paypal_tx_id || '')).trim();
  if (!method) {
    if (tx) return 'PayPal · ' + tx;
    return '';
  }
  let text = paymentMethodLabel(method);
  if (method === 'other' && detail) text += ' (' + detail + ')';
  const shownRef = ref || (method === 'paypal' ? tx : '');
  if (shownRef) text += ' · ' + shownRef;
  return text;
}

function paymentHowText(row) {
  const shown = formatPaymentMethodDisplay(row);
  if (shown) return shown;
  const status = String((row && (row.payStatus || row.pay_status)) || '').toLowerCase();
  if (status === 'paid') return 'How paid unknown';
  return '';
}

/** Form default only. Never written unless the admin (or checkout) saves it. */
function suggestPaymentMethod(row) {
  row = row || {};
  const existing = normalizePaymentMethod(row.paymentMethod != null ? row.paymentMethod : row.payment_method);
  if (existing) return existing;
  const tx = String(row.paypalTxId != null ? row.paypalTxId : (row.paypal_tx_id || '')).trim();
  if (tx) return 'paypal';
  const notes = String(row.notes || '').toLowerCase();
  if (notes.indexOf('venmo') !== -1) return 'venmo';
  if (notes.indexOf('zelle') !== -1) return 'zelle';
  if (/\bcheck\b/.test(notes)) return 'check';
  if (notes.indexOf('paypal') !== -1) return 'paypal';
  return '';
}

/**
 * Supabase patch for the helper used by tests and any $0 comp-style toggle.
 * Host-initiated confirmation is not a collected checkout, so revenue is $0.
 * The registrations screen uses rosterMarkPaidPatch instead and does not change price_paid.
 * PayPal/card capture still writes the charged total via markRegistrationPaid().
 */
function adminTogglePaidPatch({ currentlyPaid, existingPricePaid, method, ref, detail, amount, existingNotes, paypalTxId } = {}) {
  if (currentlyPaid) {
    const patch = { pay_status: 'unpaid' };
    if (existingPricePaid === 0) patch.price_paid = null;
    return patch;
  }
  const paid = rosterMarkPaidPatch({ method, ref, detail, amount, existingNotes, paypalTxId });
  if (paid.error) return paid;
  paid.price_paid = 0;
  return paid;
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
    // A $0 / comped seat has nothing to collect, so it is not an open match.
    if (due != null && !(due > 0)) return;
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
  COMPED_STATUSES,
  registrationStatus,
  registrationOwesMoney,
  registrationIsSettled,
  rosterSettlementLabel,
  rosterSettlementTagClass,
  buildPaymentMemo,
  paypalDescription,
  extractCaptureFromOrder,
  clearPendingPaymentNotes,
  notesForPaymentStatus,
  paidNotesLine,
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  normalizePaymentMethod,
  paymentMethodLabel,
  paymentMethodPatch,
  paypalCapturePatch,
  appendPaidMethodNote,
  rosterMarkPaidPatch,
  formatPaymentMethodDisplay,
  paymentHowText,
  suggestPaymentMethod,
  adminTogglePaidPatch,
  findPaymentMatches
};
