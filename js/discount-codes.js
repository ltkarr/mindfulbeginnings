/* Single-use class discount codes.
   Lindsay creates a code in the admin (More → Discount codes). The default
   amount off is $25. Each code can be redeemed for exactly one registration.

   Redemption (also documented in migrations/20261023_single_use_discount_codes.sql):
     - Typing a code does not use it. The public page only asks the server
       to reserve it once a registration row exists.
     - Reserve is one row update: status goes from unused to reserved only
       when it is still unused, inside a transaction that also writes the
       discounted price on that registration. Two families at the same time:
       one reserve wins, the other is told the code has already been used.
     - The code stays reserved for that registration until the registration
       is paid (then it is used for good) or the registration is cancelled,
       refunded, or moved to the waitlist before payment (then a still-
       reserved code goes back to unused). Removing the code before payment
       also returns it to unused.
     - A failed or abandoned signup that never saved a registration does
       not reserve a code. Closing the page after a successful reserve leaves
       the code on that saved registration, at the discounted price.
     - Paying $0 because the discount covers the class marks the code used
       when the family confirms. Nothing in this flow sends email.
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MBDiscountCodes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  var DEFAULT_AMOUNT = 25;
  var CODE_PREFIX = 'GIFT-';
  // Reports and the roster read this same shape from registration notes.
  var PROMO_NOTE_RE = /\[Promo\s+([A-Za-z0-9][A-Za-z0-9-]*)\s+applied:\s*[−-]\s*\$?(\d+(?:\.\d+)?)/;

  function round2(n) {
    var v = Number(n);
    if (!isFinite(v)) return null;
    return Math.round(v * 100) / 100;
  }

  function compactMoney(n) {
    var v = round2(n);
    if (v == null) return '0';
    if (Math.abs(v - Math.round(v)) < 0.001) return String(Math.round(v));
    return v.toFixed(2);
  }

  function normalizeCode(raw) {
    return String(raw == null ? '' : raw).toUpperCase().replace(/\s+/g, '').trim();
  }

  function randomByte() {
    if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
      var buf = new Uint8Array(1);
      crypto.getRandomValues(buf);
      return buf[0];
    }
    return Math.floor(Math.random() * 256);
  }

  // 32-character alphabet and a byte (0–255) divide evenly, so this is unbiased.
  function generateDiscountCode(nextByte) {
    var next = typeof nextByte === 'function' ? nextByte : randomByte;
    var body = '';
    var i;
    for (i = 0; i < 8; i++) body += ALPHABET[next() % ALPHABET.length];
    return CODE_PREFIX + body;
  }

  function payablePrice(listPrice, discountAmount) {
    var list = round2(listPrice);
    var off = round2(discountAmount);
    if (list == null || off == null) return null;
    if (off < 0) off = 0;
    return round2(Math.max(0, list - off));
  }

  function promoNote(code, amount, listPrice, payable) {
    return '[Promo ' + normalizeCode(code) + ' applied: −$' + compactMoney(amount) +
      ' off ' + compactMoney(listPrice) + ' → ' + compactMoney(payable) + ']';
  }

  function parsePromoNote(notes) {
    var m = PROMO_NOTE_RE.exec(String(notes == null ? '' : notes));
    if (!m) return null;
    return { code: String(m[1] || '').toUpperCase(), amount: round2(m[2]) };
  }

  function messageForReason(reason) {
    switch (String(reason || '')) {
      case 'used': return 'That code has already been used.';
      case 'deactivated': return 'That code is no longer active.';
      case 'not_found': return 'That code isn\'t valid. Please check it and try again.';
      case 'paid': return 'This registration is already paid, so a discount code can\'t be applied.';
      case 'host': return 'This registration is already free, so a discount code isn\'t used.';
      case 'waitlist': return 'Discount codes can\'t be used on the waitlist.';
      case 'closed': return 'This registration can\'t take a discount code.';
      case 'no_price': return 'We couldn\'t confirm the class price. Please refresh and try again.';
      case 'free': return 'This class is already free, so a discount code isn\'t used.';
      case 'bad_registration': return 'We couldn\'t apply that code to this registration. Please refresh and try again.';
      case 'forbidden': return 'Sign in again, then try that.';
      default: return 'We couldn\'t apply that code. Please try again.';
    }
  }

  // Mirrors the server decision. The database is what actually reserves the row.
  function claimOutcome(codeRow, registration, code) {
    if (!registration || !registration.id) return { ok: false, reason: 'bad_registration' };
    var status = String(registration.payStatus != null ? registration.payStatus : (registration.pay_status || '')).toLowerCase().trim();
    if (status === 'paid') return { ok: false, reason: 'paid' };
    if (status === 'waitlist') return { ok: false, reason: 'waitlist' };
    if (status === 'host' || status === 'comp' || status === 'free' || status === 'in_kind') return { ok: false, reason: 'host' };
    if (status === 'cancelled' || status === 'canceled' || status === 'refunded') return { ok: false, reason: 'closed' };
    if (status && status !== 'pending' && status !== 'unpaid') return { ok: false, reason: 'closed' };
    var want = normalizeCode(code);
    if (!codeRow || normalizeCode(codeRow.code) !== want) return { ok: false, reason: 'not_found' };
    if (codeRow.status === 'deactivated') return { ok: false, reason: 'deactivated' };
    if (codeRow.status === 'used') return { ok: false, reason: 'used' };
    if (codeRow.status === 'reserved' && codeRow.registrationId && codeRow.registrationId !== registration.id) {
      return { ok: false, reason: 'used' };
    }
    var list = registration.priceOverride != null && registration.priceOverride !== ''
      ? registration.priceOverride
      : registration.listPrice;
    var listNum = round2(list);
    if (listNum == null || listNum < 0 || listNum > 1000) return { ok: false, reason: 'no_price' };
    if (listNum === 0) return { ok: false, reason: 'free' };
    var amount = codeRow.amount == null ? DEFAULT_AMOUNT : codeRow.amount;
    return {
      ok: true,
      reason: codeRow.status === 'reserved' ? 'already' : 'reserved',
      code: want,
      amount: round2(amount),
      listPrice: listNum,
      payable: payablePrice(listNum, amount)
    };
  }

  // The atomic predicate: only an unused row can be reserved, and only once.
  function reserveIfUnused(row, registrationId) {
    if (!row || row.status !== 'unused') return false;
    row.status = 'reserved';
    row.registrationId = registrationId;
    return true;
  }

  function rosterDiscountNote(notes, pricePaid, listPrice) {
    var promo = parsePromoNote(notes);
    if (!promo) return null;
    var expected = payablePrice(listPrice, promo.amount);
    var actual = round2(pricePaid);
    return {
      code: promo.code,
      amount: promo.amount,
      matches: actual != null && expected != null && Math.abs(actual - expected) < 0.02
    };
  }

  return {
    ALPHABET: ALPHABET,
    DEFAULT_AMOUNT: DEFAULT_AMOUNT,
    CODE_PREFIX: CODE_PREFIX,
    PROMO_NOTE_RE: PROMO_NOTE_RE,
    round2: round2,
    compactMoney: compactMoney,
    normalizeCode: normalizeCode,
    generateDiscountCode: generateDiscountCode,
    payablePrice: payablePrice,
    promoNote: promoNote,
    parsePromoNote: parsePromoNote,
    messageForReason: messageForReason,
    claimOutcome: claimOutcome,
    reserveIfUnused: reserveIfUnused,
    rosterDiscountNote: rosterDiscountNote
  };
});
