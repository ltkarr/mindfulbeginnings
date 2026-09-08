/* ════════════════════════════════════════════════════════════════════════
   Shared family-facing payment helpers (register.html + pay.html)

   PayPal/card: dynamic amount via /api/paypal/* (Orders API). The secret
   never ships in this file. Venmo/Zelle stay off-platform; we prefill a
   memo that includes the registration id so Lindsay can match them.
   ════════════════════════════════════════════════════════════════════════ */
(function (global) {
  'use strict';

  var VENMO_USER = 'mindfulbeginnings';
  var ZELLE_EMAIL = 'lindsay@mindfulbeginnings.org';
  var sdkPromise = null;
  var cachedConfig = null;
  var buttonsInstance = null;

  function parseMoney(value) {
    var n = typeof value === 'number' ? value : parseFloat(String(value == null ? '' : value).replace(/[^0-9.-]/g, ''));
    if (!isFinite(n)) return null;
    return Math.round(n * 100) / 100;
  }

  function formatMoney(value) {
    var n = parseMoney(value);
    return n == null ? null : n.toFixed(2);
  }

  function buildPaymentMemo(opts) {
    opts = opts || {};
    var parts = [];
    var id = String(opts.registrationId || '').trim();
    if (id) parts.push('Reg ' + id);
    var who = String(opts.studentName || '').replace(/\s+/g, ' ').trim();
    var what = String(opts.course || '').replace(/\s+/g, ' ').trim();
    if (who && what) parts.push(who + ' — ' + what);
    else if (who) parts.push(who);
    else if (what) parts.push(what);
    return parts.join(' | ') || opts.fallback || 'Mindful Beginnings payment';
  }

  function venmoUrl(opts) {
    opts = opts || {};
    var amount = formatMoney(opts.amount);
    var memo = opts.memo || buildPaymentMemo(opts);
    var url = 'https://venmo.com/?txn=pay&audience=private&recipients=' + encodeURIComponent(VENMO_USER);
    if (amount) url += '&amount=' + encodeURIComponent(amount);
    if (memo) url += '&note=' + encodeURIComponent(memo);
    return url;
  }

  function jsonFetch(url, opts) {
    return fetch(url, opts).then(function (res) {
      return res.json().then(function (body) {
        if (!res.ok) {
          var err = new Error((body && body.error) || ('Request failed (' + res.status + ')'));
          err.status = res.status;
          err.body = body;
          throw err;
        }
        return body;
      });
    });
  }

  function loadConfig() {
    if (cachedConfig) return Promise.resolve(cachedConfig);
    return jsonFetch('/api/paypal/config').then(function (cfg) {
      cachedConfig = cfg || { configured: false };
      return cachedConfig;
    }).catch(function () {
      cachedConfig = { configured: false };
      return cachedConfig;
    });
  }

  function loadSdk(cfg) {
    if (global.paypal) return Promise.resolve(global.paypal);
    if (sdkPromise) return sdkPromise;
    sdkPromise = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      var host = (cfg.env === 'sandbox') ? 'https://www.sandbox.paypal.com/sdk/js' : 'https://www.paypal.com/sdk/js';
      s.src = host
        + '?client-id=' + encodeURIComponent(cfg.clientId)
        + '&currency=USD&intent=capture&components=buttons'
        + '&disable-funding=applepay,venmo,paylater&enable-funding=card';
      s.setAttribute('data-sdk-integration-source', 'mindfulbeginnings');
      s.onload = function () {
        if (global.paypal) resolve(global.paypal);
        else reject(new Error('PayPal SDK loaded without window.paypal'));
      };
      s.onerror = function () { reject(new Error('Could not load PayPal checkout')); };
      document.head.appendChild(s);
    });
    return sdkPromise;
  }

  function captureReturnedOrder() {
    if (!global.location) return Promise.resolve(null);
    var p = new URLSearchParams(global.location.search);
    var token = p.get('token') || p.get('paypal_order');
    var payer = p.get('PayerID') || p.get('PayerId') || p.get('payerID');
    if (!token || !payer) return Promise.resolve(null);
    return jsonFetch('/api/paypal/capture-order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderID: token })
    });
  }

  function clearButtons(container) {
    if (buttonsInstance && typeof buttonsInstance.close === 'function') {
      try { buttonsInstance.close(); } catch (e) {}
    }
    buttonsInstance = null;
    if (container) container.innerHTML = '';
  }

  /**
   * Render PayPal/card Smart Buttons that charge getAmount() and, when a
   * registration id is provided, mark that row paid on capture.
   *
   * opts: {
   *   container,            // element or selector
   *   getAmount,            // () => number
   *   getContext,           // () => { registrationId, studentName, course, description }
   *   onPaid,               // ({ captureId, amount, markedPaid }) => void
   *   onError,              // (message) => void
   *   onUnavailable         // () => void   // API not configured
   * }
   */
  function mountCardButtons(opts) {
    opts = opts || {};
    var container = typeof opts.container === 'string' ? document.querySelector(opts.container) : opts.container;
    if (!container) return Promise.resolve({ configured: false });

    return loadConfig().then(function (cfg) {
      if (!cfg.configured || !cfg.clientId) {
        clearButtons(container);
        if (typeof opts.onUnavailable === 'function') opts.onUnavailable();
        return { configured: false };
      }
      return loadSdk(cfg).then(function (paypal) {
        clearButtons(container);
        buttonsInstance = paypal.Buttons({
          style: { layout: 'vertical', color: 'gold', shape: 'rect', label: 'paypal', tagline: false, height: 45 },
          createOrder: function () {
            var ctx = (typeof opts.getContext === 'function' ? opts.getContext() : {}) || {};
            var amount = parseMoney(typeof opts.getAmount === 'function' ? opts.getAmount() : ctx.amount);
            if (amount == null || amount < 0.01) {
              return Promise.reject(new Error('Enter a valid amount first.'));
            }
            var page = global.location ? (global.location.origin + global.location.pathname) : '';
            return jsonFetch('/api/paypal/create-order', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                amount: amount,
                registrationId: ctx.registrationId || '',
                studentName: ctx.studentName || '',
                course: ctx.course || '',
                description: ctx.description || buildPaymentMemo(ctx),
                returnUrl: page,
                cancelUrl: page
              })
            }).then(function (order) {
              if (!order || !order.id) throw new Error('PayPal did not return an order id');
              return order.id;
            });
          },
          onApprove: function (data) {
            var ctx = (typeof opts.getContext === 'function' ? opts.getContext() : {}) || {};
            if (typeof opts.onCaptureStart === 'function') opts.onCaptureStart();
            return jsonFetch('/api/paypal/capture-order', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                orderID: data.orderID,
                registrationId: ctx.registrationId || ''
              })
            }).then(function (result) {
              if (result && result.pending) {
                if (typeof opts.onError === 'function') opts.onError(result.error || 'Payment is still processing.');
                return result;
              }
              if (typeof opts.onPaid === 'function') opts.onPaid(result || {});
              return result;
            });
          },
          onError: function (err) {
            var msg = (err && err.message) ? err.message : 'PayPal checkout could not be completed. Please try again or use Venmo / Zelle.';
            if (typeof opts.onError === 'function') opts.onError(msg);
          },
          onCancel: function () {}
        });
        return buttonsInstance.render(container).then(function () {
          return { configured: true };
        });
      });
    }).catch(function (err) {
      clearButtons(container);
      if (typeof opts.onError === 'function') opts.onError(err && err.message ? err.message : 'PayPal is unavailable right now.');
      if (typeof opts.onUnavailable === 'function') opts.onUnavailable();
      return { configured: false, error: err };
    });
  }

  global.MBPayments = {
    VENMO_USER: VENMO_USER,
    ZELLE_EMAIL: ZELLE_EMAIL,
    parseMoney: parseMoney,
    formatMoney: formatMoney,
    buildPaymentMemo: buildPaymentMemo,
    venmoUrl: venmoUrl,
    loadConfig: loadConfig,
    mountCardButtons: mountCardButtons,
    captureReturnedOrder: captureReturnedOrder,
    clearButtons: function (sel) {
      var el = typeof sel === 'string' ? document.querySelector(sel) : sel;
      clearButtons(el);
    }
  };
})(typeof window !== 'undefined' ? window : this);
