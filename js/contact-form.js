/* Contact page. Posts to /api/contact, which uses the same Lindsay notice as class requests. */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function mailtoHref(name, email, message) {
    var subject = 'Message from the Mindful Beginnings website';
    var body = message + '\n\n' + name + '\n' + email;
    return 'mailto:lindsay@mindfulbeginnings.org?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
  }

  function showError(message) {
    var box = $('contact-error');
    if (!box) return;
    box.hidden = false;
    box.textContent = message;
    box.focus();
  }

  function clearErrors(form) {
    form.querySelectorAll('.err').forEach(function (el) { el.classList.remove('err'); });
    var box = $('contact-error');
    if (box) { box.hidden = true; box.textContent = ''; }
  }

  function mark(form, name) {
    var el = form.querySelector('[name="' + name + '"]');
    if (el) el.classList.add('err');
  }

  async function onSubmit(e) {
    e.preventDefault();
    var form = e.currentTarget;
    clearErrors(form);
    var data = {
      name: (form.name.value || '').trim(),
      email: (form.email.value || '').trim(),
      message: (form.message.value || '').trim(),
      companyWebsite: form.companyWebsite ? form.companyWebsite.value : ''
    };
    if (!data.name) { mark(form, 'name'); showError('Please add your name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email)) { mark(form, 'email'); showError('Please add a valid email address.'); return; }
    if (!data.message) { mark(form, 'message'); showError('Please add a message.'); return; }

    var btn = $('contact-submit');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending...'; }
    var sent = false;
    try {
      var res = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      var json = {};
      try { json = await res.json(); } catch (err) { json = {}; }
      if (!res.ok || !json.ok) {
        if (json.field) mark(form, json.field);
        showError(json.error || 'Something went wrong. Please try again, or email us.');
        return;
      }
      sent = !!json.sent;
      form.hidden = true;
      var ok = $('contact-success');
      if (ok) ok.hidden = false;
      var hello = $('contact-hello');
      var first = data.name.split(/\s+/)[0];
      if (hello) hello.textContent = first ? ('Thank you, ' + first + '.') : 'Thank you.';
      var extra = $('contact-extra');
      var fallback = $('contact-fallback');
      var mail = $('contact-mailto');
      if (sent) {
        if (extra) extra.textContent = 'We reply within 1 business day.';
        if (fallback) fallback.hidden = true;
      } else {
        if (extra) extra.textContent = 'We could not send that from the site just now. Email it with the link below and we will still reply within 1 business day.';
        if (mail) mail.href = mailtoHref(data.name, data.email, data.message);
        if (fallback) fallback.hidden = false;
      }
    } catch (err) {
      showError('We could not reach the server. Please email lindsay@mindfulbeginnings.org.');
      var mailLink = $('contact-mailto');
      if (mailLink) mailLink.href = mailtoHref(data.name, data.email, data.message);
    } finally {
      if (btn && !form.hidden) { btn.disabled = false; btn.textContent = 'Send message'; }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var form = $('contact-form');
    if (form) form.addEventListener('submit', onSubmit);
  });
})();
