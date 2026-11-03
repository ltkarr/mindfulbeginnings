/* Shared loader for the Safe & Ready Families class-day and follow-up pages.
   Looks up the class by code, then posts to /api/evaluations/submit. */
(function (root) {
  'use strict';

  var SB_URL = 'https://evninlytzhtacanrguhx.supabase.co';
  var SB_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV2bmlubHl0emh0YWNhbnJndWh4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc2NTE1MzQsImV4cCI6MjA5MzIyNzUzNH0.7sr0P9BmcPW_cJgWZwndVtaHsZXsbVCcE0Pk1gm3VP8';

  function prettyDate(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso || ''))) return '';
    var p = String(iso).split('-');
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  function showError(box, msg) {
    if (!box) return;
    box.textContent = msg;
    box.style.display = 'block';
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function client() {
    var lib = root.supabase;
    if (!lib || typeof lib.createClient !== 'function') return null;
    return lib.createClient(SB_URL, SB_KEY);
  }

  function mount(opts) {
    var api = root.MBSrfGrant;
    var slot = document.getElementById(opts.slot);
    var when = document.getElementById(opts.whenId);
    var errBox = document.getElementById('srf-error');
    var card = document.getElementById('srf-card');
    if (!api || !slot) return;
    var code = '';
    try { code = new URLSearchParams(location.search).get('code') || ''; } catch (e) { code = ''; }
    code = String(code).trim().toUpperCase();

    function paint(session) {
      var html = opts.part === 'C' ? api.followupHtml() : api.classSurveyHtml(session || {});
      slot.innerHTML = '<form id="srf-form" novalidate>' + html +
        '<div class="hp" aria-hidden="true"><label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label></div>' +
        '<button type="submit" class="mb-btn mb-btn-gold eval-submit" id="srf-submit">' +
        (opts.part === 'C' ? 'Submit follow-up' : 'Submit survey') + '</button></form>' +
        '<div class="eval-thanks" id="srf-thanks"><h2>Thank you!</h2><p>' +
        (opts.part === 'C'
          ? 'Your follow-up has been received. Your two minutes count toward the report that funds this class.'
          : 'Your survey has been received. Watch your email in about two months for a two-minute follow-up.') +
        '</p></div>';
      var form = document.getElementById('srf-form');
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        errBox.style.display = 'none';
        var read = opts.part === 'C' ? api.readFollowup(form) : api.readClassSurvey(form);
        if (!read.ok) { showError(errBox, read.error); return; }
        var btn = document.getElementById('srf-submit');
        btn.disabled = true;
        btn.textContent = 'Submitting...';
        var honeypot = form.querySelector('input[name="website"]');
        fetch('/api/evaluations/submit', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            form: 'srf-grant',
            part: opts.part,
            session_code: code,
            session_date: (session && session.date) || read.answers.class_date || '',
            email: read.answers.email,
            answers: read.answers,
            website: honeypot ? honeypot.value : ''
          })
        }).then(function (r) {
          return r.json().then(function (j) { return { ok: r.ok, body: j }; });
        }).then(function (res) {
          if (res.ok && res.body && res.body.ok) {
            form.style.display = 'none';
            document.getElementById('srf-thanks').style.display = 'block';
            root.scrollTo({ top: 0, behavior: 'smooth' });
          } else {
            showError(errBox, (res.body && res.body.error) || 'Something went wrong. Please try again.');
          }
        }).catch(function () {
          showError(errBox, 'Something went wrong. Please check your connection and try again.');
        }).finally(function () {
          btn.disabled = false;
          btn.textContent = opts.part === 'C' ? 'Submit follow-up' : 'Submit survey';
        });
      });
    }

    function block(msg) {
      if (card) card.style.display = 'none';
      showError(errBox, msg);
    }

    if (!/^[A-Za-z0-9_-]{2,20}$/.test(code)) {
      block(opts.part === 'C'
        ? 'This follow-up needs the link from Mindful Beginnings.'
        : 'This survey needs the class link from your instructor.');
      return;
    }

    var sb = client();
    var lookup = sb ? sb.rpc('get_session_by_code', { p_code: code }) : Promise.resolve({ data: null, error: { message: 'offline' } });
    lookup.then(function (res) {
      var row = res && res.data && res.data[0] ? res.data[0] : (Array.isArray(res && res.data) ? null : (res && res.data && res.data.course ? res.data : null));
      var tail = opts.part === 'C' ? ' This takes about two minutes.' : ' This takes about four minutes.';
      if (res && res.error) {
        if (when) when.textContent = 'Safe & Ready Families.' + tail;
        paint(null);
        return;
      }
      if (!row || row.course !== api.COURSE || row.is_cancelled) {
        block('This survey link does not match a Safe & Ready Families class.');
        return;
      }
      if (when) {
        var nice = prettyDate(row.date);
        when.textContent = (nice ? ('Safe & Ready Families · ' + nice + '.') : 'Safe & Ready Families.') + tail;
      }
      paint({ date: row.date || '' });
    }).catch(function () {
      var tail = opts.part === 'C' ? ' This takes about two minutes.' : ' This takes about four minutes.';
      if (when) when.textContent = 'Safe & Ready Families.' + tail;
      paint(null);
    });
  }

  root.MBSrfGrantPage = { mount: mount };
})(typeof globalThis !== 'undefined' ? globalThis : this);
