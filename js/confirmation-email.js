/* ════════════════════════════════════════════════════════════════════════
   Confirmation-email helpers (register.html + tests)

   Live EmailJS template `template_c3yfejb` interpolates Pay now fields.
   Gmail often drops padding/background on a lone styled <a>, so pay_button
   / pay_cta are a table-based ("bulletproof") button plus a plain-text
   fallback link. Inject unescaped HTML in the EmailJS editor:

     {{#pay_url}}
     {{{pay_button}}}
     {{/pay_url}}
     {{^pay_url}}
     <p style="margin: 0; color: #52606d;">{{pay_note}}</p>
     {{/pay_url}}

   Do not wrap {{pay_url}} in a lone <a href> if {{{pay_button}}} is used —
   that would duplicate the CTA. Paid / $0 emails omit the button (no href="").
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
  var PAY_BUTTON_BG = '#3f63ad';
  var PAY_BUTTON_A_STYLE = 'display:inline-block;padding:12px 22px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;font-weight:700;color:#ffffff;text-decoration:none;border:1px solid #3f63ad;border-radius:6px;';
  var PAY_BUTTON_TD_STYLE = 'background-color:#3f63ad;border-radius:6px;text-align:center;';
  var PAY_FALLBACK_P_STYLE = 'margin:12px 0 0;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;color:#52606d;';
  var PAY_FALLBACK_A_STYLE = 'color:#3f63ad;word-break:break-all;';

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

  /**
   * Gmail-safe bulletproof Pay now button: table + td bgcolor + nested <a>,
   * plus a plain-text fallback link. Never emits href="".
   */
  function buildPayNowButtonHtml(url) {
    var href = String(url || '').trim();
    if (!href || !/^https:\/\//i.test(href)) return '';
    var safe = escapeAttr(href);
    return (
      '<table role="presentation" border="0" cellspacing="0" cellpadding="0" style="border-collapse:collapse;">' +
        '<tr>' +
          '<td align="center" bgcolor="' + PAY_BUTTON_BG + '" style="' + PAY_BUTTON_TD_STYLE + '">' +
            '<a href="' + safe + '" style="' + PAY_BUTTON_A_STYLE + '">Pay now</a>' +
          '</td>' +
        '</tr>' +
      '</table>' +
      '<p style="' + PAY_FALLBACK_P_STYLE + '">If the button does not open, use this link: ' +
        '<a href="' + safe + '" style="' + PAY_FALLBACK_A_STYLE + '">' + safe + '</a>' +
      '</p>'
    );
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
