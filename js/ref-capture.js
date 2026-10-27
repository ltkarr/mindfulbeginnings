/* Referral-link capture.
   Mary Parks and Katy Greenberg each have a personal link:
     mindfulbeginnings.org/?ref=mary-parks
     mindfulbeginnings.org/?ref=katy-greenberg
   The link works on any page. Landing with it stores the person's name in
   localStorage for 90 days (the most recent link wins). When a visitor
   later reaches the registration form or a host/organization request form,
   the "How did you hear about us?" select is pre-filled with that name, so
   the booking lands on the right commission statement through the exact
   same answer a manual pick produces. The visitor can still change it.
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MBRefCapture = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var LINKS = {
    'mary-parks': 'Mary Parks',
    'katy-greenberg': 'Katy Greenberg'
  };
  var KEY = 'mb_referral';
  var TTL_MS = 90 * 24 * 60 * 60 * 1000;
  var SELECT_IDS = ['p-referral', 'referral'];

  function sourceForSlug(slug) {
    var key = String(slug == null ? '' : slug).toLowerCase().replace(/\s+/g, ' ').trim();
    return LINKS[key] || '';
  }

  // Store the referral named by a ?ref= link. Returns the stored source, or
  // '' when the URL carries no known link (any stored referral is kept).
  function captureFromUrl(search, store, now) {
    if (!store) return '';
    var params;
    try { params = new URLSearchParams(String(search || '')); } catch (e) { return ''; }
    var source = sourceForSlug(params.get('ref'));
    if (!source) return '';
    try {
      store.setItem(KEY, JSON.stringify({ source: source, at: Number(now) || Date.now() }));
    } catch (e) { return ''; }
    return source;
  }

  // The stored source, or '' when nothing is stored or it has expired.
  function storedSource(store, now) {
    if (!store) return '';
    var raw = null;
    try { raw = store.getItem(KEY); } catch (e) { return ''; }
    if (!raw) return '';
    var data;
    try { data = JSON.parse(raw); } catch (e) { return ''; }
    if (!data || !data.source || !data.at) return '';
    var age = (Number(now) || Date.now()) - Number(data.at);
    if (age < 0 || age > TTL_MS) return '';
    return String(data.source);
  }

  // Pre-fill the first empty hear-about select that offers this source.
  function prefillSelect(doc, source) {
    if (!doc || !source) return false;
    for (var i = 0; i < SELECT_IDS.length; i++) {
      var sel = doc.getElementById(SELECT_IDS[i]);
      if (!sel || sel.value) continue;
      for (var j = 0; j < sel.options.length; j++) {
        if (sel.options[j].value === source || sel.options[j].text === source) {
          sel.value = sel.options[j].value || sel.options[j].text;
          return true;
        }
      }
    }
    return false;
  }

  function boot(win) {
    var store = null;
    try { store = win.localStorage; } catch (e) { store = null; }
    captureFromUrl(win.location && win.location.search, store, Date.now());
    var apply = function () { prefillSelect(win.document, storedSource(store, Date.now())); };
    if (win.document && win.document.readyState === 'loading') {
      win.document.addEventListener('DOMContentLoaded', apply);
    } else {
      apply();
    }
  }

  return {
    LINKS: LINKS,
    KEY: KEY,
    TTL_MS: TTL_MS,
    sourceForSlug: sourceForSlug,
    captureFromUrl: captureFromUrl,
    storedSource: storedSource,
    prefillSelect: prefillSelect,
    boot: boot
  };
});

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  window.MBRefCapture.boot(window);
}
