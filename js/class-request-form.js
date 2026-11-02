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

  // The same choices as the registration form, including Vanessa in Vienna.
  // A plain text field (older pages) still submits whatever was typed.
  function referralAnswer(form) {
    if (!form || !form.referral) return '';
    var sel = String(form.referral.value || '').trim();
    var other = form.referralOther ? String(form.referralOther.value || '').trim() : '';
    var detail = form.referralDetail ? String(form.referralDetail.value || '').trim() : '';
    if (sel === 'Other') sel = other ? ('Other: ' + other) : 'Other';
    var answer = sel && detail ? (sel + ' — ' + detail) : (sel || detail);
    return answer.slice(0, 300);
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
      referral: referralAnswer(form),
      days: readDays(form),
      specialInstructions: form.specialInstructions ? form.specialInstructions.value : '',
      spanishRequested: !!(form.spanishRequested && form.spanishRequested.checked),
      companyWebsite: form.companyWebsite ? form.companyWebsite.value : ''
    };
    data.address = form.address ? String(form.address.value || '').trim() : '';
    data.city = form.city ? String(form.city.value || '').trim() : '';
    data.state = form.state ? String(form.state.value || '').trim() : '';
    data.zip = form.zip ? String(form.zip.value || '').trim() : '';
    if (kind === 'host') {
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
      data.clubs = checkedValues(form, 'clubs');
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
    var clubs = $('clubs-wrap');
    if (clubs) clubs.hidden = !opt || opt.value !== 'after-school-clubs';
    var badge = $('badge-wrap');
    if (badge) badge.hidden = !opt || opt.value !== 'gs-first-aid';
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

  function courseIsVirtual(form) {
    var sel = form && form.courseKey;
    if (!sel || sel.selectedIndex < 0) return false;
    var opt = sel.options[sel.selectedIndex];
    if (!opt) return false;
    if (/-virtual$/.test(opt.value || '')) return true;
    return /this class is virtual/i.test(opt.getAttribute('data-note') || '');
  }

  // In-person requests need a street, city, state, and ZIP. A single
  // street-address box used to accept "5012 Tothill Drive" and leave the
  // rest blank. Virtual courses do not have a street address.
  function addressErrors(form) {
    if (courseIsVirtual(form)) return [];
    var errors = [];
    function add(field, message) { errors.push({ field: field, message: message }); }
    var street = form.address ? String(form.address.value || '').trim() : '';
    var city = form.city ? String(form.city.value || '').trim() : '';
    var state = form.state ? String(form.state.value || '').trim() : '';
    var zip = form.zip ? String(form.zip.value || '').trim().replace(/\s+/g, '') : '';
    if (!street) add('address', 'Please add the street address.');
    if (!city) add('city', 'Please add the city.');
    if (!state) add('state', 'Please add the state.');
    else if (!/^[A-Za-z]{2}$/.test(state) && !/^[A-Za-z][A-Za-z .'-]{2,}$/.test(state)) {
      add('state', 'Please add a two-letter state, such as MD.');
    }
    if (!zip) add('zip', 'Please add the ZIP code.');
    else if (!/^\d{5}(?:-\d{4})?$/.test(zip)) add('zip', 'Please add a 5-digit ZIP code.');
    return errors;
  }

  function updateAddressRequirement(form) {
    var wrap = $('address-fields');
    if (!wrap || !form) return;
    var virtual = courseIsVirtual(form);
    wrap.hidden = virtual;
    wrap.querySelectorAll('input').forEach(function (input) {
      if (virtual) input.removeAttribute('required');
      else input.setAttribute('required', '');
    });
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
    var missingAddress = addressErrors(form);
    if (missingAddress.length) {
      missingAddress.forEach(function (err) { fieldError(form, err.field); });
      showError(missingAddress[0].message);
      var first = form.querySelector('[name="' + missingAddress[0].field + '"]');
      if (first && first.focus) first.focus();
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
        showError(json.error || 'Something went wrong. Please try again.');
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
          extra.textContent = 'Mindful Beginnings has your request. We will confirm the date.';
        }
      }
    } catch (err) {
      showError('We could not reach the server. Please try again.');
    } finally {
      if (btn && !form.hidden) { btn.disabled = false; btn.textContent = 'Submit request'; }
    }
  }

  function toggleReferralOther() {
    var sel = $('referral');
    var wrap = $('referral-other-wrap');
    if (!sel || !wrap) return;
    var show = sel.value === 'Other';
    wrap.hidden = !show;
    if (!show) {
      var other = $('referral-other');
      if (other) other.value = '';
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var form = $('request-form');
    var referral = $('referral');
    if (referral) referral.addEventListener('change', toggleReferralOther);
    if (!form) return;
    bindDays(form);
    form.addEventListener('submit', onSubmit);
    form.addEventListener('change', function () {
      updateCourseNote();
      updateSteer();
      updatePortion();
      updateQuestions();
      updateAddressRequirement(form);
    });
    if (form.state) form.state.addEventListener('blur', function () {
      var v = String(form.state.value || '').trim();
      if (/^[A-Za-z]{2}$/.test(v)) form.state.value = v.toUpperCase();
    });
    updateCourseNote();
    updateSteer();
    updatePortion();
    updateQuestions();
    updateAddressRequirement(form);
  });
})();
