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
  paidNotesLine
};
