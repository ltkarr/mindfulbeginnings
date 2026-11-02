/* ADMIN class-request inbox. One status, a linked session code, and the full text. Does not send email. */
(function (root) {
  'use strict';

  var model = root.MBClassRequests;

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var REQUEST_STATUSES = [
    { value: 'received', label: 'Received' },
    { value: 'replied', label: 'Replied' },
    { value: 'confirmed', label: 'Confirmed' },
    { value: 'session_built', label: 'Session built' }
  ];

  function canonicalStatus(row) {
    var s = String((row && row.status) || '').trim();
    if (s === 'replied' || s === 'draft_ready') return 'replied';
    if (s === 'confirmed' || s === 'email_sent') return 'confirmed';
    if (s === 'session_built' || s === 'session_created' || s === 'instructor_open' || s === 'instructor_claimed' || s === 'done') return 'session_built';
    return 'received';
  }

  function statusLabel(value) {
    var hit = REQUEST_STATUSES.filter(function (item) { return item.value === value; })[0];
    if (hit) return hit.label;
    if (model && model.STATUS_LABELS && model.STATUS_LABELS[value]) return model.STATUS_LABELS[value];
    return 'Received';
  }

  function statusOf(row) {
    return canonicalStatus(row);
  }

  function openCount(rows) {
    return (rows || []).filter(function (row) { return canonicalStatus(row) !== 'session_built'; }).length;
  }

  function receivedCount(rows) {
    return (rows || []).filter(function (row) { return canonicalStatus(row) === 'received'; }).length;
  }

  function matchesFilter(row, filter) {
    if (filter === 'all') return true;
    if (filter === 'received' || filter === 'pending') return canonicalStatus(row) === 'received';
    return canonicalStatus(row) !== 'session_built';
  }

  function whenText(row) {
    var payload = row.payload || {};
    if (!model) return '';
    var n = model.normalizeSubmission(payload);
    if (!n.days.length) return 'Date not set';
    return n.days.map(function (d) {
      return model.longDate(d.date) + (d.time ? ' · ' + d.time : '');
    }).join('; ');
  }

  function detailRows(row) {
    var payload = row.payload || {};
    var n = model ? model.normalizeSubmission(payload) : null;
    var rows = [];
    function add(label, value) {
      if (value == null || value === '' || (Array.isArray(value) && !value.length)) return;
      rows.push('<div style="margin:4px 0"><span style="color:var(--muted)">' + esc(label) + '</span><br>' + esc(Array.isArray(value) ? value.join(', ') : value) + '</div>');
    }
    if (!n) {
      add('Details', JSON.stringify(payload));
      return rows.join('');
    }
    add('Email', n.email);
    add('Phone', n.phone);
    add('Organization', n.organizationName);
    add('Course', n.course ? (n.course.course || n.course.label) : n.courseKey);
    add('When', whenText(row));
    add('Place', n.place && (n.place.raw || n.place.location));
    add('Expected participants', n.expectedCount);
    add('Billing', model.billingSentence(n));
    add('Portion they wrote', n.portionText);
    add('Girl Scout badge', (payload && payload.badge) || n.badge);
    add('Instructor request', n.instructorRequest);
    if (n.spanishRequested) add('Language', 'Requested in Spanish. A Spanish-speaking instructor is required.');
    add('Hosting checklist', n.checklistAnswer);
    add('Checklist questions', n.checklistQuestions);
    add('Food', n.food);
    add('AV', n.av);
    add('Parking', n.parking);
    add('Arrival', n.arrival);
    add('For participants', (payload && payload.participantInfo) || n.participantInfo);
    add('Special instructions', (payload && payload.specialInstructions) || n.specialInstructions);
    add('Custom request', (payload && payload.customRequest) || n.customRequest);
    add('Referral', n.referral);
    if (row.payload && row.payload.spam_flag) add('Review flag', 'Hidden spam-check field was filled (bot, or a real browser autofill). Saved so a real lead is never discarded.');
    if (row.session_error) add('Session was not saved', row.session_error);
    if (row.outlook_error) add('Outlook draft', row.outlook_error === 'missing_credentials' ? 'Not set up yet, so no draft was created' : row.outlook_error);
    if (row.notify_error) add('Lindsay notification', row.notify_error === 'missing_credentials' ? 'Not set up yet, so no email was sent' : row.notify_error);
    return rows.join('');
  }

  function instructorLine(row, session) {
    if (!session) return '';
    var name = '';
    if (session.instructorId && typeof instructors !== 'undefined') {
      var person = instructors.find(function (i) { return i.id === session.instructorId; });
      name = person ? person.name : '';
    }
    if (!session.instructorId) return '';
    return '<div style="font-size:14px;color:var(--muted);margin-top:6px">Instructor on the session: <strong>' + esc(name || 'assigned') + '</strong></div>';
  }

  function linkedSession(row, session, sessionList) {
    if (session) return session;
    var code = String((row && row.session_code) || '').trim();
    if (!code) return null;
    return (sessionList || []).find(function (s) { return s && s.code === code; }) || null;
  }

  function sessionCodeHtml(row, session) {
    var code = String(row.session_code || '').trim();
    var field = '<label style="display:block;font-size:15px;margin-top:10px">Linked session code ' +
      '<input type="text" value="' + esc(code) + '" placeholder="Optional" ' +
      'onchange="saveClassRequestCode(\'' + esc(row.id) + '\', this.value)" ' +
      'style="margin-left:8px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;font:inherit"></label>';
    if (!code) return field;
    var link;
    if (session && session.id) {
      link = '<a href="#" onclick="openRequestSession(\'' + esc(row.id) + '\');return false;">' + esc(code) + '</a>';
    } else {
      link = '<a href="https://register.mindfulbeginnings.org/register.html?code=' + encodeURIComponent(code) + '" target="_blank" rel="noopener">' + esc(code) + '</a>';
    }
    return field + '<div style="font-size:15px;margin-top:4px">Session: ' + link + '</div>';
  }

  function statusSelectHtml(row) {
    var current = canonicalStatus(row);
    var options = REQUEST_STATUSES.map(function (item) {
      return '<option value="' + item.value + '"' + (item.value === current ? ' selected' : '') + '>' + esc(item.label) + '</option>';
    }).join('');
    return '<label style="display:block;font-size:15px;margin-top:12px">Status ' +
      '<select onchange="setClassRequestStatus(\'' + esc(row.id) + '\', this.value)" ' +
      'style="margin-left:8px;padding:6px 8px;border:1px solid var(--border);border-radius:8px;font:inherit">' +
      options + '</select></label>';
  }

  function textValue(value) {
    if (value == null || value === '') return '';
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  }

  function requestPlainText(row) {
    var payload = (row && row.payload) || {};
    var n = model ? model.normalizeSubmission(payload) : null;
    var lines = [];
    function add(label, value) {
      var text = textValue(value);
      if (!text) return;
      lines.push(label + ': ' + text);
    }
    add('Name', row.submitter_name || (n && n.name));
    add('Type', row.kind === 'organization' ? 'Organization' : 'Private host');
    add('Email', (n && n.email) || payload.email);
    add('Phone', (n && n.phone) || payload.phone);
    add('Organization', row.organization_name || (n && n.organizationName) || payload.organizationName);
    add('Course', row.course || (n && n.course && (n.course.course || n.course.label)) || payload.courseKey);
    add('When', whenText(row));
    add('Place', n && n.place && (n.place.raw || n.place.location));
    add('Expected participants', (n && n.expectedCount) || payload.expectedCount);
    add('Billing', n && model ? model.billingSentence(n) : '');
    add('Portion they wrote', (n && n.portionText) || payload.portionText);
    add('Girl Scout badge', payload.badge || (n && n.badge));
    add('Instructor request', (n && n.instructorRequest) || payload.instructorRequest);
    if (n && n.spanishRequested) add('Language', 'Requested in Spanish. A Spanish-speaking instructor is required.');
    add('Hosting checklist', (n && n.checklistAnswer) || payload.checklistAnswer);
    add('Checklist questions', payload.checklistQuestions || (n && n.checklistQuestions));
    add('Food', (n && n.food) || payload.food);
    add('AV', (n && n.av) || payload.av);
    add('Parking', payload.parking || (n && n.parking));
    add('Arrival', payload.arrival || (n && n.arrival));
    add('For participants', payload.participantInfo || (n && n.participantInfo));
    add('Special instructions', payload.specialInstructions || (n && n.specialInstructions));
    add('Custom request', payload.customRequest || (n && n.customRequest));
    add('Referral', (n && n.referral) || payload.referral);
    add('Dates as written', payload.datesText || (n && n.datesText));
    add('Clubs', (n && n.clubs) || payload.clubs);
    add('Linked session code', row.session_code);
    add('Status', statusLabel(canonicalStatus(row)));
    return lines.join('\n');
  }

  function cardHtml(row, session) {
    var status = canonicalStatus(row);
    var label = statusLabel(status);
    var kind = row.kind === 'organization' ? 'Organization' : 'Private host';
    var created = row.created_at ? new Date(row.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    return '<div class="card" style="padding:16px 18px;margin-bottom:12px">' +
      '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
        '<div><div style="font-weight:700;font-size:18px">' + esc(row.submitter_name || 'Untitled request') + '</div>' +
        '<div style="color:var(--muted);font-size:15px">' + esc(kind) + (row.organization_name ? ' · ' + esc(row.organization_name) : '') + (row.course ? ' · ' + esc(row.course) : '') + '</div>' +
        '<div style="font-size:15px;margin-top:4px">' + esc(whenText(row)) + '</div></div>' +
        '<div style="text-align:right"><span style="background:#e9eff8;color:#27467A;border-radius:100px;padding:3px 10px;font-size:13px;font-weight:700">' + esc(label) + '</span>' +
        '<div style="font-size:13px;color:var(--muted);margin-top:6px">' + esc(created) + '</div></div></div>' +
      statusSelectHtml(row) +
      sessionCodeHtml(row, session) +
      instructorLine(row, session) +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
        '<button class="btn sm" type="button" onclick="copyClassRequest(\'' + esc(row.id) + '\')">Copy request</button>' +
        '<button class="btn sm" type="button" style="color:#b91c1c;border-color:#e5b4b4" onclick="deleteClassRequest(\'' + esc(row.id) + '\')">Delete request</button>' +
      '</div>' +
      '<details style="margin-top:10px"><summary style="cursor:pointer;color:var(--navy);font-weight:600">Full submission</summary><div style="margin-top:8px;font-size:15px;line-height:1.45">' + detailRows(row) + '</div></details>' +
      '</div>';
  }

  function renderList(rows, filter, sessionList) {
    var shown = (rows || []).filter(function (row) { return matchesFilter(row, filter || 'open'); });
    if (!shown.length) return '<div class="card" style="padding:18px;color:var(--muted)">No requests in this view.</div>';
    return shown.map(function (row) {
      var session = (sessionList || []).find(function (s) { return s.id === row.session_id; }) || null;
      return cardHtml(row, linkedSession(row, session, sessionList));
    }).join('');
  }

  function bannerHtml(rows, tableReady) {
    if (tableReady === false) return '';
    var n = openCount(rows);
    if (!n) return '';
    var fresh = receivedCount(rows);
    return '<div class="card" style="padding:14px 16px;margin-bottom:16px;border-color:#f0d090;background:#fff7e6">' +
      '<div style="font-weight:700">' + n + ' class request' + (n === 1 ? '' : 's') + ' need attention</div>' +
      '<div style="font-size:15px;color:#7a5000">' + (fresh ? fresh + ' just received. ' : '') +
      '<a href="#" onclick="showScreen(\'requests\', document.getElementById(\'nav-requests\'));return false;">Open class requests</a></div></div>';
  }

  var api = {
    statusOf: statusOf,
    canonicalStatus: canonicalStatus,
    openCount: openCount,
    receivedCount: receivedCount,
    matchesFilter: matchesFilter,
    renderList: renderList,
    bannerHtml: bannerHtml,
    whenText: whenText,
    requestPlainText: requestPlainText
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBClassRequestAdmin = api;

  root.renderClassRequestNav = function () {
    var el = document.querySelector('#nav-requests .nav-label');
    if (!el || typeof classRequests === 'undefined') return;
    var n = openCount(classRequests);
    el.textContent = n ? ('Class requests (' + n + ')') : 'Class requests';
  };

  root.renderClassRequestBanner = function () {
    var el = document.getElementById('class-request-banner');
    if (!el || typeof classRequests === 'undefined') return;
    el.innerHTML = bannerHtml(classRequests, typeof classRequestsTableReady === 'undefined' ? true : classRequestsTableReady);
  };

  root.renderClassRequests = function () {
    var rootEl = document.getElementById('class-requests-root');
    if (!rootEl) return;
    if (typeof classRequestsTableReady !== 'undefined' && !classRequestsTableReady) {
      rootEl.innerHTML = '<div class="card" style="padding:18px"><strong>Class requests are not in the database yet.</strong><p style="margin:8px 0 0">Run <code>migrations/class_requests.sql</code> in the Supabase SQL editor, then refresh.</p></div>';
      return;
    }
    var filterEl = document.getElementById('cr-filter');
    var filter = filterEl ? filterEl.value : 'open';
    var list = typeof classRequests === 'undefined' ? [] : classRequests;
    var sess = typeof sessions === 'undefined' ? [] : sessions;
    rootEl.innerHTML = renderList(list, filter, sess);
    if (root.renderClassRequestNav) root.renderClassRequestNav();
  };

  root.setClassRequestStatus = async function (id, status) {
    var allowed = { received: true, replied: true, confirmed: true, session_built: true };
    if (!allowed[status]) return;
    var row = (classRequests || []).find(function (r) { return r.id === id; });
    if (!row || typeof sb === 'undefined') return;
    var ok = await dbWrite(sb.from('class_requests').update({
      status: status,
      updated_at: new Date().toISOString()
    }).eq('id', id), 'Class request status');
    if (!ok) {
      root.renderClassRequests();
      return;
    }
    row.status = status;
    root.renderClassRequests();
    root.renderClassRequestBanner();
  };

  root.saveClassRequestCode = async function (id, code) {
    var row = (classRequests || []).find(function (r) { return r.id === id; });
    if (!row || typeof sb === 'undefined') return;
    var next = String(code || '').trim();
    var patch = { session_code: next || null, updated_at: new Date().toISOString() };
    if (next && typeof sessions !== 'undefined') {
      var match = sessions.find(function (s) { return s && s.code === next; });
      if (match) patch.session_id = match.id;
    }
    if (!next) patch.session_id = null;
    var ok = await dbWrite(sb.from('class_requests').update(patch).eq('id', id), 'Class request session code');
    if (!ok) {
      root.renderClassRequests();
      return;
    }
    row.session_code = patch.session_code;
    if (Object.prototype.hasOwnProperty.call(patch, 'session_id')) row.session_id = patch.session_id;
    root.renderClassRequests();
  };

  root.copyClassRequest = async function (id) {
    var row = (classRequests || []).find(function (r) { return r.id === id; });
    if (!row) return;
    var text = requestPlainText(row);
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        var area = document.createElement('textarea');
        area.value = text;
        document.body.appendChild(area);
        area.select();
        document.execCommand('copy');
        document.body.removeChild(area);
      }
      if (typeof showToast === 'function') showToast('Request copied.');
    } catch (err) {
      if (typeof showToast === 'function') showToast('Could not copy the request.');
    }
  };

  root.openClassRequestDraft = function (id) {
    var row = (classRequests || []).find(function (r) { return r.id === id; });
    if (!row || typeof openDocEmail !== 'function') return;
    openDocEmail({
      type: 'hostLetter',
      category: 'Confirmation draft',
      field: 'to',
      emails: [row.draft_to || row.submitter_email || ''],
      subject: row.draft_subject || '',
      body: row.draft_body || '',
      note: 'This draft is for you to send. Nothing is sent from this screen. Copy the message into Outlook, or open the Outlook draft if Graph already created one.',
      sessionLine: (row.course || '') + (row.session_code ? ' · ' + row.session_code : '')
    });
  };

  root.openRequestSession = function (id) {
    var row = (classRequests || []).find(function (r) { return r.id === id; });
    if (!row || !row.session_id || typeof openEditSession !== 'function') return;
    var nav = document.querySelector('.nav-item[title="Sessions"]');
    if (typeof showScreen === 'function') showScreen('sessions', nav);
    openEditSession(row.session_id);
  };

root._deleteLocks = root._deleteLocks || {};

  root.deleteClassRequest = async function (id) {
    if (!id || root._deleteLocks[id]) return;
    var row = (typeof classRequests !== 'undefined' ? classRequests : []).find(function (r) { return r.id === id; });
    var msg = row && row.session_id
      ? 'Delete this request? The session ' + (row.session_code || '') + ' stays in Admin and the portal. Only this request card is removed. This cannot be undone.'
      : 'Delete this request? This cannot be undone.';
    if (!window.confirm(msg)) return;
    root._deleteLocks[id] = true;
    try {
      if (typeof sb === 'undefined' || !sb.auth || !sb.auth.getSession) {
        if (typeof showToast === 'function') showToast('Sign in again, then delete the request.');
        return;
      }
      var sess = await sb.auth.getSession();
      var token = sess && sess.data && sess.data.session && sess.data.session.access_token;
      if (!token) {
        if (typeof showToast === 'function') showToast('Sign in again, then delete the request.');
        return;
      }
      var res = await fetch('/api/class-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'delete', id: id })
      });
      var body = {};
      try { body = await res.json(); } catch (e) { body = {}; }
      if (!res.ok || !body.ok) {
        if (typeof showToast === 'function') showToast(body.error || 'The request was not deleted. Please try again.');
        return;
      }
      if (typeof classRequests !== 'undefined') {
        var ix = classRequests.findIndex(function (r) { return r.id === id; });
        if (ix >= 0) classRequests.splice(ix, 1);
      }
      if (typeof showToast === 'function') showToast('Request deleted.');
      if (root.renderClassRequests) root.renderClassRequests();
      if (root.renderClassRequestBanner) root.renderClassRequestBanner();
    } catch (err) {
      if (typeof showToast === 'function') showToast('The request was not deleted. Please try again.');
    } finally {
      root._deleteLocks[id] = false;
    }
  };

  root._approveLocks = root._approveLocks || {};

  root.approveClassRequest = async function (id) {
    if (!id) return;
    if (root._approveLocks[id]) return;
    root._approveLocks[id] = true;
    try {
      if (typeof sb === 'undefined' || !sb.auth || !sb.auth.getSession) {
        if (typeof showToast === 'function') showToast('Sign in again, then create the session.');
        return;
      }
      var sess = await sb.auth.getSession();
      var token = sess && sess.data && sess.data.session && sess.data.session.access_token;
      if (!token) {
        if (typeof showToast === 'function') showToast('Sign in again, then create the session.');
        return;
      }
      var res = await fetch('/api/class-requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
        body: JSON.stringify({ action: 'approve', id: id })
      });
      var body = {};
      try { body = await res.json(); } catch (e) { body = {}; }
      if (!res.ok || !body.ok) {
        if (typeof showToast === 'function') showToast(body.error || 'The session was not created. Please try again.');
        return;
      }
      var row = (typeof classRequests !== 'undefined' ? classRequests : []).find(function (r) { return r.id === id; });
      if (row) {
        row.session_id = body.sessionId || row.session_id;
        row.session_code = body.sessionCode || row.session_code;
        row.status = body.status || 'session_created';
        if (body.checklist) row.checklist = body.checklist;
        if (body.draft_body) row.draft_body = body.draft_body;
        if (body.draft_subject) row.draft_subject = body.draft_subject;
        if (body.outlook_web_link) row.outlook_web_link = body.outlook_web_link;
        row.session_error = null;
      }
      if (typeof loadData === 'function') {
        await loadData();
      } else if (body.session && typeof sessions !== 'undefined' && typeof sessionFromDB === 'function') {
        var mapped = sessionFromDB(body.session);
        if (mapped && !sessions.some(function (s) { return s.id === mapped.id; })) sessions.push(mapped);
      }
      if (typeof showToast === 'function') {
        var code = body.sessionCode || (row && row.session_code) || 'the session';
        showToast(body.created === false ? ('Session ' + code + ' was already created.') : ('Session ' + code + ' created.'));
      }
      if (root.renderClassRequests) root.renderClassRequests();
      if (root.renderClassRequestBanner) root.renderClassRequestBanner();
    } catch (err) {
      if (typeof showToast === 'function') showToast('The session was not created. Please try again.');
    } finally {
      root._approveLocks[id] = false;
    }
  };
})(typeof globalThis !== 'undefined' ? globalThis : this);
