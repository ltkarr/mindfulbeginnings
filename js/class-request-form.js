/* Shared behavior for host.html and organization.html. */
(function () {
  'use strict';

  function $(id) { return document.getElementById(id); }

  function fieldError(form, name) {
    var el = form.querySelector('[name="' + name + '"]');
    if (el) el.classList.add('err');
  }

  function clearErrors(form) {
    form.querySelectorAll('.err').forEach(function (el) { el.classList.remove('err'); });
    var box = $('form-error');
    if (box) { box.hidden = true; box.textContent = ''; }
  }

  function showError(message) {
    var box = $('form-error');
    if (!box) return;
    box.hidden = false;
    box.textContent = message;
    box.focus();
  }

  function readDays(form) {
    return Array.prototype.map.call(form.querySelectorAll('.day-row'), function (row) {
      return {
        date: (row.querySelector('[name="day_date"]') || {}).value || '',
        start: (row.querySelector('[name="day_start"]') || {}).value || '',
        end: (row.querySelector('[name="day_end"]') || {}).value || ''
      };
    }).filter(function (d) { return d.date || d.start || d.end; });
  }

  function dayRowHtml() {
    return '<div class="day-row">' +
      '<div class="field"><label>Date<input type="date" name="day_date" required></label></div>' +
      '<div class="field"><label>Start<input type="time" name="day_start" required></label></div>' +
      '<div class="field"><label>End <span class="hint">(optional)</span><input type="time" name="day_end"></label></div>' +
      '<button type="button" class="remove-day">Remove</button>' +
      '</div>';
  }

  function bindDays(form) {
    var list = $('day-list');
    var add = $('add-day');
    if (!list) return;
    if (!list.children.length) list.insertAdjacentHTML('beforeend', dayRowHtml());
    list.addEventListener('click', function (e) {
      var btn = e.target.closest('.remove-day');
      if (!btn) return;
      var rows = list.querySelectorAll('.day-row');
      if (rows.length < 2) {
        rows[0].querySelectorAll('input').forEach(function (input) { input.value = ''; });
        return;
      }
      btn.closest('.day-row').remove();
    });
    if (add) add.addEventListener('click', function () {
      list.insertAdjacentHTML('beforeend', dayRowHtml());
    });
  }

  function selected(form, name) {
    var el = form.querySelector('[name="' + name + '"]:checked');
    return el ? el.value : '';
  }

  function checkedValues(form, name) {
    return Array.prototype.map.call(form.querySelectorAll('[name="' + name + '"]:checked'), function (el) { return el.value; });
  }

  function payloadFrom(form) {
    var kind = form.getAttribute('data-kind');
    var data = {
      kind: kind,
      name: (form.name && form.name.value || '').trim(),
      email: (form.email && form.email.value || '').trim(),
      phone: (form.phone && form.phone.value || '').trim(),
      courseKey: form.courseKey ? form.courseKey.value : '',
      expectedCount: form.expectedCount ? form.expectedCount.value : '',
      referral: form.referral ? form.referral.value : '',
      days: readDays(form),
      specialInstructions: form.specialInstructions ? form.specialInstructions.value : '',
      companyWebsite: form.companyWebsite ? form.companyWebsite.value : ''
    };
    if (kind === 'host') {
      data.address = form.address ? form.address.value : '';
      data.forOrganization = selected(form, 'who') === 'organization';
      data.checklistAnswer = selected(form, 'checklistAnswer');
      data.checklistQuestions = form.checklistQuestions ? form.checklistQuestions.value : '';
      data.food = selected(form, 'food');
    } else {
      data.organizationName = form.organizationName ? form.organizationName.value : '';
      data.location = form.location ? form.location.value : '';
      data.badge = form.badge ? form.badge.value : '';
      data.instructorRequest = form.instructorRequest ? form.instructorRequest.value : '';
      data.av = checkedValues(form, 'av');
      data.parking = form.parking ? form.parking.value : '';
      data.billing = selected(form, 'billing');
      data.portionText = form.portionText ? form.portionText.value : '';
      data.arrival = form.arrival ? form.arrival.value : '';
      data.participantInfo = form.participantInfo ? form.participantInfo.value : '';
      data.customRequest = form.customRequest ? form.customRequest.value : '';
    }
    return data;
  }

  function updateCourseNote() {
    var select = $('courseKey');
    var note = $('course-note');
    if (!select || !note) return;
    var opt = select.options[select.selectedIndex];
    note.textContent = opt && opt.getAttribute('data-note') ? opt.getAttribute('data-note') : '';
    var custom = $('custom-wrap');
    if (custom) custom.hidden = !opt || opt.value !== 'custom';
  }

  function updateSteer() {
    var org = document.querySelector('[name="who"][value="organization"]');
    var panel = $('org-steer');
    var rest = $('host-fields');
    if (!org || !panel || !rest) return;
    var on = org.checked;
    panel.hidden = !on;
    rest.hidden = on;
  }

  function updatePortion() {
    var split = document.querySelector('[name="billing"][value="split"]');
    var wrap = $('portion-wrap');
    if (!split || !wrap) return;
    wrap.hidden = !split.checked;
  }

  function updateQuestions() {
    var q = document.querySelector('[name="checklistAnswer"][value="questions"]');
    var wrap = $('questions-wrap');
    if (!q || !wrap) return;
    wrap.hidden = !q.checked;
  }

  async function onSubmit(e) {
    e.preventDefault();
    var form = e.currentTarget;
    clearErrors(form);
    var data = payloadFrom(form);
    if (data.forOrganization) {
      showError('Schools, troops, and other organizations use the organization form.');
      return;
    }
    var needsDate = data.courseKey && data.courseKey !== 'unsure' && data.courseKey !== 'custom';
    var dated = (data.days || []).some(function (d) { return d.date && d.start; });
    if (needsDate && !dated) {
      showError('Please add at least one date and a start time.');
      return;
    }
    var btn = $('submit-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    try {
      var res = await fetch('/api/class-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data)
      });
      var json = {};
      try { json = await res.json(); } catch (err) { json = {}; }
      if (!res.ok || !json.ok) {
        if (json.redirect) window.location.href = json.redirect;
        showError(json.error || 'Something went wrong. Please email lindsay@mindfulbeginnings.org.');
        if (json.field) fieldError(form, json.field);
        return;
      }
      form.hidden = true;
      var ok = $('success');
      if (ok) {
        ok.hidden = false;
        var name = (data.name || '').trim().split(/\s+/)[0];
        var hello = $('success-hello');
        if (hello) hello.textContent = name ? ('Thank you, ' + name + '.') : 'Thank you.';
        var extra = $('success-extra');
        if (extra) {
          extra.textContent = json.sessionCreated
            ? 'Lindsay has the details, including a private session on her calendar. She will email you a confirmation. Nothing is sent automatically from this form.'
            : 'Lindsay has your request. A date, time, or billing detail still needs a look before a registration link is ready, and she will follow up. Nothing is sent automatically from this form.';
        }
      }
    } catch (err) {
      showError('We could not reach the server. Please try again, or email lindsay@mindfulbeginnings.org.');
    } finally {
      if (btn && !form.hidden) { btn.disabled = false; btn.textContent = 'Submit request'; }
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var form = $('request-form');
    if (!form) return;
    bindDays(form);
    form.addEventListener('submit', onSubmit);
    form.addEventListener('change', function () {
      updateCourseNote();
      updateSteer();
      updatePortion();
      updateQuestions();
    });
    updateCourseNote();
    updateSteer();
    updatePortion();
    updateQuestions();
  });
})();
