/* Organization invoice payment options.
   Shown on the invoice page, the print / PDF view, and the invoice email.
   Handles are the ones already used for families. Nothing here is invented.
   Venmo and Zelle match js/payments.js (VENMO_USER, ZELLE_EMAIL), pay.html,
   and register.html. No PayPal username, email, or paypal.me is stored. */
(function (root) {
  'use strict';

  var VENMO_USER = 'mindfulbeginnings';
  var ZELLE_EMAIL = 'lindsay@mindfulbeginnings.org';
  // Exact sentence already printed on organization invoices.
  var CHECK_PAYABLE = 'Please make checks payable to Mindful Beginnings LLC.';
  // No PayPal username, email, phone, or paypal.me link exists in this repo.
  var PAYPAL_TODO = 'TODO: no PayPal username, email, or paypal.me link is on file.';

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c];
    });
  }

  function paymentMethods() {
    return [
      { id: 'paypal', label: 'PayPal', detail: PAYPAL_TODO },
      { id: 'venmo', label: 'Venmo', detail: '@' + VENMO_USER },
      { id: 'zelle', label: 'Zelle', detail: ZELLE_EMAIL },
      { id: 'check', label: 'Check', detail: CHECK_PAYABLE }
    ];
  }

  function paymentPlainText() {
    return paymentMethods().map(function (m) {
      return m.label + ': ' + m.detail;
    }).join('\n');
  }

  // Same box as the invoice notes: cream panel, hairline border, 15.5px type.
  function html() {
    var methods = paymentMethods();
    var rows = methods.map(function (m, i) {
      var gap = i === methods.length - 1 ? '0' : '8px';
      return '<div style="margin:0 0 ' + gap + '"><strong>' + escapeHtml(m.label) + ':</strong> ' + escapeHtml(m.detail) + '</div>';
    }).join('');
    return '<div style="margin-top:26px">' +
      '<div class="label">How to pay</div>' +
      '<div style="background:#f8f9fc;border:1px solid #dde4ee;border-radius:8px;padding:14px 16px;font-size:15.5px">' +
      rows +
      '</div></div>';
  }

  function longDate(value) {
    if (!value) return '';
    var dt = new Date(String(value).slice(0, 10) + 'T12:00:00');
    if (isNaN(dt.getTime())) return String(value);
    return dt.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
  }

  function shortDate(value) {
    if (!value) return '';
    var dt = new Date(String(value).slice(0, 10) + 'T12:00:00');
    if (isNaN(dt.getTime())) return String(value);
    return dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  function monthLabel(ym) {
    if (!ym) return '';
    var dt = new Date(String(ym).slice(0, 7) + '-01T12:00:00');
    if (isNaN(dt.getTime())) return String(ym);
    return dt.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function money(n) {
    var x = Math.abs(Number(n) || 0);
    var shown = Number.isInteger(x)
      ? x.toLocaleString('en-US')
      : x.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return '$' + shown;
  }

  function lineText(li) {
    li = li || {};
    var qty = li.flat ? '—' : (li.qty == null ? '' : String(li.qty));
    var rate = li.flat ? 'flat fee' : money(li.rate);
    return [shortDate(li.date), li.desc || '', qty + ' × ' + rate, money(li.amount)].filter(function (part) {
      return part !== '';
    }).join(' — ');
  }

  function emailBody(invoice) {
    invoice = invoice || {};
    var bt = invoice.billTo || {};
    var lines = [];
    lines.push('Invoice ' + (invoice.invoiceNumber || ''));
    lines.push('Mindful Beginnings LLC');
    lines.push('Bethesda, Maryland');
    lines.push('mindfulbeginnings.org');
    lines.push('');
    lines.push('Bill to');
    [bt.name || invoice.orgName || '', bt.attn ? ('Attn: ' + bt.attn) : '', bt.address || '', bt.email || '']
      .forEach(function (line) {
        if (String(line || '').trim()) lines.push(String(line).trim());
      });
    lines.push('');
    if (invoice.issueDate) lines.push('Invoice date: ' + longDate(invoice.issueDate));
    if (invoice.dueDate) lines.push('Due date: ' + longDate(invoice.dueDate));
    if (invoice.invoiceMonth) lines.push('Billing period: ' + monthLabel(invoice.invoiceMonth));
    lines.push('');
    (invoice.lineItems || []).forEach(function (li) {
      lines.push(lineText(li));
    });
    lines.push('TOTAL DUE ' + money(invoice.total));
    lines.push('');
    var notes = String(invoice.notes || '').trim();
    if (notes) {
      lines.push(notes);
      lines.push('');
    }
    lines.push('How to pay');
    lines.push(paymentPlainText());
    lines.push('');
    lines.push('Thank you for partnering with Mindful Beginnings.');
    return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
  }

  var api = {
    VENMO_USER: VENMO_USER,
    ZELLE_EMAIL: ZELLE_EMAIL,
    CHECK_PAYABLE: CHECK_PAYABLE,
    PAYPAL_TODO: PAYPAL_TODO,
    paymentMethods: paymentMethods,
    paymentPlainText: paymentPlainText,
    html: html,
    emailBody: emailBody
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBInvoicePayments = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
