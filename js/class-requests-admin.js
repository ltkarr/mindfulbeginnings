/* ADMIN class-request inbox. Renders the checklist. Does not send email. */
(function (root) {
  'use strict';

  var model = root.MBClassRequests;

  function esc(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function checks(row) {
    var c = (row && row.checklist) || {};
    return {
      received: c.received !== false,
      session_created: !!c.session_created,
      draft_ready: !!c.draft_ready,
      email_sent: !!c.email_sent,
      instructor_claimed: !!c.instructor_claimed,
      done: !!c.done,
      archived: !!c.archived
    };
  }

  function statusOf(row) {
    if (model) return model.statusFromChecklist(checks(row));
    return row && row.status || 'received';
  }

  function openCount(rows) {
    return (rows || []).filter(function (row) {
      var c = checks(row);
      return !c.done && !c.archived;
    }).length;
  }

  function receivedCount(rows) {
    return (rows || []).filter(function (row) {
      var c = checks(row);
      return !c.archived && !c.done && !c.session_created;
    }).length;
  }

  var CHECK_UI = [
    { key: 'received', label: 'Received', locked: true },
    { key: 'session_created', label: 'Session created in ADMIN' },
    { key: 'draft_ready', label: 'Confirmation email drafted' },
    { key: 'email_sent', label: 'Email sent' },
    { key: 'instructor_claimed', label: 'Instructor claimed' },
    { key: 'done', label: 'Done' },
    { key: 'archived', label: 'Archived' }
  ];

  function matchesFilter(row, filter) {
    var c = checks(row);
    var status = statusOf(row);
    if (filter === 'archived') return c.archived;
    if (filter === 'done') return c.done && !c.archived;
    if (filter === 'received') return status === 'received' && !c.archived;
    if (filter === 'all') return true;
    return !c.done && !c.archived;
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
    add('Girl Scout badge', n.badge);
    add('Instructor request', n.instructorRequest);
    add('Hosting checklist', n.checklistAnswer);
    add('Checklist questions', n.checklistQuestions);
    add('Food', n.food);
    add('AV', n.av);
    add('Parking', n.parking);
    add('Arrival', n.arrival);
    add('For participants', n.participantInfo);
    add('Special instructions', n.specialInstructions);
    add('Custom request', n.customRequest);
    add('Referral', n.referral);
    if (row.session_error) add('Session was not saved', row.session_error);
    if (row.outlook_error && row.outlook_error !== 'missing_credentials') add('Outlook draft', row.outlook_error);
    if (row.notify_error) add('Lindsay notification', row.notify_error);
    return rows.join('');
  }

  function instructorLine(row, session) {
    if (!session) return '';
    var name = '';
    if (session.instructorId && typeof instructors !== 'undefined') {
      var person = instructors.find(function (i) { return i.id === session.instructorId; });
      name = person ? person.name : '';
    }
    if (!session.instructorId) return '<div style="font-size:14px;color:var(--muted);margin-top:6px">No instructor on the session yet — this request stays open.</div>';
    return '<div style="font-size:14px;margin-top:6px">Instructor on the session: <strong>' + esc(name || 'assigned') + '</strong>. Mark claimed once you have confirmed it.</div>';
  }

  function cardHtml(row, session) {
    var c = checks(row);
    var status = statusOf(row);
    var label = (model && model.STATUS_LABELS[status]) || status;
    var kind = row.kind === 'organization' ? 'Organization' : 'Private host';
    var boxes = CHECK_UI.map(function (item) {
      var on = !!c[item.key];
      var disabled = item.locked ? ' disabled' : '';
      return '<label style="display:flex;gap:8px;align-items:flex-start;font-size:15px;margin:4px 0">' +
        '<input type="checkbox" ' + (on ? 'checked' : '') + disabled +
        ' onchange="toggleClassRequestCheck(\'' + esc(row.id) + '\',\'' + item.key + '\',this.checked)">' +
        '<span>' + esc(item.label) + '</span></label>';
    }).join('');
    var sessionBtn = row.session_id
      ? '<button class="btn sm" type="button" onclick="openRequestSession(\'' + esc(row.id) + '\')">Open ' + esc(row.session_code || 'session') + '</button>'
      : '<span style="font-size:14px;color:var(--warn)">No session yet</span>';
    var outlook = row.outlook_web_link
      ? '<a class="btn sm" href="' + esc(row.outlook_web_link) + '" target="_blank" rel="noopener">Open Outlook draft</a>'
      : '';
    var created = row.created_at ? new Date(row.created_at).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : '';
    return '<div class="card" style="padding:16px 18px;margin-bottom:12px">' +
      '<div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap">' +
        '<div><div style="font-weight:700;font-size:18px">' + esc(row.submitter_name || 'Untitled request') + '</div>' +
        '<div style="color:var(--muted);font-size:15px">' + esc(kind) + (row.organization_name ? ' · ' + esc(row.organization_name) : '') + (row.course ? ' · ' + esc(row.course) : '') + '</div>' +
        '<div style="font-size:15px;margin-top:4px">' + esc(whenText(row)) + '</div></div>' +
        '<div style="text-align:right"><span style="background:#e9eff8;color:#27467A;border-radius:100px;padding:3px 10px;font-size:13px;font-weight:700">' + esc(label) + '</span>' +
        '<div style="font-size:13px;color:var(--muted);margin-top:6px">' + esc(created) + '</div></div></div>' +
      '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px 18px;margin-top:12px">' + boxes + '</div>' +
      instructorLine(row, session) +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px">' +
        sessionBtn +
        '<button class="btn sm" type="button" onclick="openClassRequestDraft(\'' + esc(row.id) + '\')">Open confirmation draft</button>' +
        outlook +
      '</div>' +
      '<details style="margin-top:10px"><summary style="cursor:pointer;color:var(--navy);font-weight:600">Full submission</summary><div style="margin-top:8px;font-size:15px;line-height:1.45">' + detailRows(row) + '</div></details>' +
      '</div>';
  }

  function renderList(rows, filter, sessionList) {
    var shown = (rows || []).filter(function (row) { return matchesFilter(row, filter || 'open'); });
    if (!shown.length) return '<div class="card" style="padding:18px;color:var(--muted)">No requests in this view.</div>';
    return shown.map(function (row) {
      var session = (sessionList || []).find(function (s) { return s.id === row.session_id; }) || null;
      return cardHtml(row, session);
    }).join('');
  }

  function bannerHtml(rows, tableReady) {
    if (tableReady === false) return '';
    var n = openCount(rows);
    if (!n) return '';
    var fresh = receivedCount(rows);
    return '<div class="card" style="padding:14px 16px;margin-bottom:16px;border-color:#f0d090;background:#fff7e6">' +
      '<div style="font-weight:700">' + n + ' class request' + (n === 1 ? '' : 's') + ' need attention</div>' +
      '<div style="font-size:15px;color:#7a5000">' + (fresh ? fresh + ' still waiting on a session. ' : '') +
      'Confirmation emails stay drafts until you send them. <a href="#" onclick="showScreen(\'requests\', document.getElementById(\'nav-requests\'));return false;">Open class requests</a></div></div>';
  }

  var api = {
    checks: checks,
    statusOf: statusOf,
    openCount: openCount,
    receivedCount: receivedCount,
    matchesFilter: matchesFilter,
    renderList: renderList,
    bannerHtml: bannerHtml,
    whenText: whenText
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

  root.toggleClassRequestCheck = async function (id, key, on) {
    if (!model || key === 'received') return;
    var row = (classRequests || []).find(function (r) { return r.id === id; });
    if (!row || typeof sb === 'undefined') return;
    var next = model.applyChecklistUpdate(row.checklist, (function () { var p = {}; p[key] = !!on; return p; })());
    var ok = await dbWrite(sb.from('class_requests').update({
      checklist: next.checklist,
      status: next.status,
      updated_at: new Date().toISOString()
    }).eq('id', id), 'Class request checklist');
    if (!ok) {
      root.renderClassRequests();
      return;
    }
    row.checklist = next.checklist;
    row.status = next.status;
    root.renderClassRequests();
    root.renderClassRequestBanner();
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
})(typeof globalThis !== 'undefined' ? globalThis : this);
