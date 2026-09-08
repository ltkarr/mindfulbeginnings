/* ════════════════════════════════════════════════════════════════════════
   Confirmation-email helpers (register.html + tests)

   Live EmailJS template `template_c3yfejb` renders a Pay now button as:
     <a href="{{pay_url}}" ...>Pay now →</a>
   plus a gray note line: {{pay_note}}

   sendConfirmationEmail used to omit those fields, so recipients got href="".
   This module builds the pay URL and the paid/unpaid copy that EmailJS
   interpolates. Wrap the button in the EmailJS editor with:

     {{#pay_url}}<a href="{{pay_url}}" ...>Pay now →</a>{{/pay_url}}
     {{^pay_url}}{{pay_note}}{{/pay_url}}

   so paid / $0 emails omit the button instead of leaving an empty href.
   ════════════════════════════════════════════════════════════════════════ */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MBConfirmationEmail = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var PUBLIC_ORIGIN = 'https://mindfulbeginnings.vercel.app';
  var PAID_NOTE = 'Payment received. You\'re all set — no further payment is needed.';
  var ZERO_NOTE = 'No payment is needed for this registration.';
  var PAY_BUTTON_STYLE = 'display: inline-block; padding: 12px 22px; background: #3f63ad; color: #ffffff; text-decoration: none; border-radius: 6px; font-weight: 700;';

  var TERMINAL_PAID = { paid: 1, host: 1, in_kind: 1, comp: 1, free: 1 };
  var PAID_METHODS = { paid: 1, host: 1, free: 1 };
  var DUE_STATUSES = { unpaid: 1, pending: 1, reserved: 1, awaiting: 1, '': 1 };

  function publicOrigin(origin) {
    var raw = String(origin == null ? '' : origin).trim();
    if (/^https:\/\//i.test(raw)) return raw.replace(/\/$/, '');
    try {
      if (typeof location !== 'undefined' && location.protocol === 'https:' && location.hostname && location.hostname !== 'localhost') {
        return String(location.origin).replace(/\/$/, '');
      }
    } catch (e) {}
    return PUBLIC_ORIGIN;
  }

  function parseAmount(value) {
    if (value == null || value === '') return null;
    var n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[^0-9.-]/g, ''));
    if (!isFinite(n)) return null;
    return Math.round(n * 100) / 100;
  }

  function isAmountDue(amount) {
    var n = parseAmount(amount);
    return n != null && n > 0;
  }

  function normalizeStatus(payStatus) {
    return String(payStatus == null ? '' : payStatus).toLowerCase().trim();
  }

  function isAlreadyPaid(payStatus, paymentMethod) {
    var status = normalizeStatus(payStatus);
    var method = String(paymentMethod == null ? '' : paymentMethod).toLowerCase().trim();
    return !!TERMINAL_PAID[status] || !!PAID_METHODS[method];
  }

  function shouldShowPayNow(opts) {
    opts = opts || {};
    if (!isAmountDue(opts.amount)) return false;
    if (isAlreadyPaid(opts.payStatus, opts.paymentMethod)) return false;
    var status = normalizeStatus(opts.payStatus);
    if (status === 'waitlist' || status === 'cancelled') return false;
    return !!DUE_STATUSES[status] || status === 'unknown';
  }

  function encodeQuery(params) {
    var parts = [];
    Object.keys(params).forEach(function (key) {
      var val = params[key];
      if (val == null || val === '') return;
      parts.push(encodeURIComponent(key) + '=' + encodeURIComponent(String(val)));
    });
    return parts.join('&');
  }

  function escapeAttr(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;')
      .replace(/"/g, '&quot;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');
  }

  /**
   * Absolute HTTPS checkout link for this registration.
   * Prefers register.html?paycode= (existing reminder flow) when a session
   * code is available; otherwise pay.html?reg=&amt=&name=&for=.
   */
  function buildPayNowUrl(opts) {
    opts = opts || {};
    var origin = publicOrigin(opts.origin);
    var amt = parseAmount(opts.amount);
    var name = String(opts.studentName || '').replace(/\s+/g, ' ').trim();
    var course = String(opts.course || '').replace(/\s+/g, ' ').trim();
    var regId = String(opts.registrationId || '').trim();
    var code = String(opts.sessionCode || opts.paycode || '').trim();
    var query;
    if (code) {
      query = encodeQuery({
        paycode: code,
        name: name,
        amt: amt == null ? '' : String(amt),
        reg: regId
      });
      return origin + '/register.html?' + query;
    }
    query = encodeQuery({
      amt: amt == null ? '' : String(amt),
      reg: regId,
      name: name,
      for: course
    });
    return origin + '/pay.html?' + query;
  }

  function buildPayNowButtonHtml(url) {
    var href = String(url || '').trim();
    if (!href || !/^https:\/\//i.test(href)) return '';
    return '<a href="' + escapeAttr(href) + '" style="' + PAY_BUTTON_STYLE + '">Pay now →</a>';
  }

  function payNoteFor(opts, showPay) {
    if (showPay) return '';
    if (isAlreadyPaid(opts.payStatus, opts.paymentMethod) && isAmountDue(opts.amount)) return PAID_NOTE;
    return ZERO_NOTE;
  }

  /**
   * EmailJS template params for the Pay now / paid CTA.
   * Never returns an <a href=""> — either a real https URL or no button.
   */
  function buildPayCta(opts) {
    opts = opts || {};
    var showPay = shouldShowPayNow(opts);
    var payUrl = showPay ? buildPayNowUrl(opts) : '';
    if (showPay && !/^https:\/\//i.test(payUrl)) payUrl = '';
    var note = payNoteFor(opts, showPay && !!payUrl);
    var button = payUrl ? buildPayNowButtonHtml(payUrl) : '';
    return {
      show_pay_now: !!(showPay && payUrl),
      pay_url: payUrl,
      pay_link: payUrl,
      payment_url: payUrl,
      pay_now_url: payUrl,
      pay_note: note,
      payment_note: note,
      pay_button: button,
      pay_cta: button || note
    };
  }

  function withPayUrlInAmount(amountLine, payUrl) {
    var line = String(amountLine == null ? '' : amountLine);
    if (!payUrl || line.indexOf(payUrl) !== -1) return line;
    return (line ? line + ' ' : '') + 'Pay now: ' + payUrl;
  }

  return {
    PUBLIC_ORIGIN: PUBLIC_ORIGIN,
    PAID_NOTE: PAID_NOTE,
    ZERO_NOTE: ZERO_NOTE,
    publicOrigin: publicOrigin,
    parseAmount: parseAmount,
    isAmountDue: isAmountDue,
    isAlreadyPaid: isAlreadyPaid,
    shouldShowPayNow: shouldShowPayNow,
    buildPayNowUrl: buildPayNowUrl,
    buildPayNowButtonHtml: buildPayNowButtonHtml,
    buildPayCta: buildPayCta,
    withPayUrlInAmount: withPayUrlInAmount
  };
});
