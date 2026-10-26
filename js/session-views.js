/* Canonical session membership, meeting days, and roster wording.
   Admin and the instructor portal both load this file. A private class,
   a host headcount, and a second meeting day have to read the same way
   on Sessions, the dashboard, packing, equipment, and the instructor schedule.

   Prices and instructor pay are not computed here. */
(function (root) {
  'use strict';

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function ymd(value) {
    var s = text(value);
    return /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : '';
  }

  function flag(s, camel, snake) {
    if (!s) return false;
    return s[camel] === true || s[snake] === true;
  }

  function field(s, camel, snake) {
    if (!s) return '';
    if (s[camel] != null && text(s[camel]) !== '') return s[camel];
    if (snake && s[snake] != null) return s[snake];
    return s[camel];
  }

  function cleanTime(value) {
    return text(value).replace(/\u2013|\u2014/g, '-');
  }

  function daySpan(start, end) {
    var a = ymd(start);
    var b = ymd(end);
    if (!a || !b) return 0;
    var ms = new Date(b + 'T12:00:00') - new Date(a + 'T12:00:00');
    return Number.isFinite(ms) ? Math.round(ms / 86400000) : 0;
  }

  function addDays(ymdValue, n) {
    var d = new Date(ymd(ymdValue) + 'T12:00:00');
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + (Number(n) || 0));
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function formatDay(ymdValue) {
    var d = new Date(ymd(ymdValue) + 'T12:00:00');
    if (isNaN(d.getTime())) return ymd(ymdValue);
    return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Every meeting as {date, time}, first day included. extra_days wins for
  // the per-day time. A non-list (an empty object in a few older rows) is
  // no extra day, not a crash.
  function meetingDays(s) {
    if (!s) return [];
    var mainDate = ymd(s.date);
    var mainTime = cleanTime(s.time);
    var rawDays = s.extraDays != null ? s.extraDays : s.extra_days;
    var rawDates = s.extraDates != null ? s.extraDates : s.extra_dates;
    var src = (Array.isArray(rawDays) && rawDays.length) ? rawDays : (Array.isArray(rawDates) ? rawDates : []);
    var out = [];
    var seen = {};
    function push(date, time) {
      var d = ymd(date);
      if (!d || seen[d]) return;
      seen[d] = true;
      out.push({ date: d, time: cleanTime(time) || mainTime });
    }
    if (mainDate) push(mainDate, mainTime);
    src.forEach(function (item) {
      if (typeof item === 'string') push(item, '');
      else if (item) push(item.date, item.time);
    });
    out.sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    return out;
  }

  function meetingSummary(s) {
    var days = meetingDays(s);
    if (days.length < 2) return '';
    return days.map(function (d) {
      return formatDay(d.date) + (d.time ? ', ' + d.time : '');
    }).join('; ');
  }

  function lastMeeting(s) {
    var days = meetingDays(s);
    if (days.length) return days[days.length - 1].date;
    var recur = ymd(field(s, 'recurEndDate', 'recur_end_date'));
    return recur || ymd(s && s.date);
  }

  // A multi-week series is a recurring job that runs more than 7 days, or
  // three or more meeting days spread over more than 7 days. Two meeting
  // days are one class even when the second day is the following week.
  // That is what hid SS-261030 (Oct 30 and Nov 13) from Upcoming sessions.
  function isLongSeries(s) {
    if (!s || !ymd(s.date)) return false;
    if (flag(s, 'isRecurring', 'is_recurring')) {
      var end = ymd(field(s, 'recurEndDate', 'recur_end_date'));
      if (end && daySpan(s.date, end) > 7) return true;
    }
    var days = meetingDays(s);
    if (days.length >= 3 && daySpan(days[0].date, days[days.length - 1].date) > 7) return true;
    return false;
  }

  // The host or organization supplies the roster, so "0 registered" is the
  // wrong sentence. Organization registration is the explicit flag. A private
  // class billed to an organization at a $0 family price is the same pattern
  // when that flag was left off (SS-261030). A priced private class still
  // counts family registrations. A billed headcount on a split invoice
  // (families pay their own price) is not this roster.
  function hostHeadcountApplies(s) {
    if (!s || flag(s, 'isCustomJob', 'is_custom_job')) return false;
    if (flag(s, 'orgHandlesRegistration', 'org_handles_registration')) return true;
    var org = text(field(s, 'billToOrg', 'bill_to_org'));
    if (!org) return false;
    if (!flag(s, 'isPrivate', 'is_private')) return false;
    var price = field(s, 'priceOverride', 'price_override');
    if (price == null || price === '') return false;
    var n = Number(price);
    return isFinite(n) && n === 0;
  }

  function hostHeadcount(s) {
    if (!hostHeadcountApplies(s)) return null;
    var raw = field(s, 'billedHeadcount', 'billed_headcount');
    if (raw == null || raw === '') return null;
    var n = Number(raw);
    if (!isFinite(n) || n <= 0) return null;
    return Math.floor(n);
  }

  function registeredPhrase(n) {
    var count = Math.max(0, Number(n) || 0);
    return count + ' ' + (count === 1 ? 'participant' : 'participants') + ' registered';
  }

  // registeredPeople is the live registration headcount (people, not rows).
  // mode registered: families sign up here.
  // mode host: use the organization's count.
  // mode pending: the organization signs people up and has not sent a count.
  // mode both: names are on file and the host count is a different number.
  function rosterFact(s, registeredPeople) {
    var regs = Math.max(0, Number(registeredPeople) || 0);
    if (!hostHeadcountApplies(s)) {
      return { mode: 'registered', count: regs, people: regs, phrase: registeredPhrase(regs) };
    }
    var host = hostHeadcount(s);
    if (host == null && regs === 0) {
      return { mode: 'pending', count: null, people: 0, phrase: 'Headcount pending from host' };
    }
    if (host == null) {
      return { mode: 'registered', count: regs, people: regs, phrase: registeredPhrase(regs) };
    }
    if (regs === 0 || regs === host) {
      return { mode: 'host', count: host, people: host, phrase: 'Headcount from host: ' + host };
    }
    return {
      mode: 'both',
      count: host,
      people: Math.max(regs, host),
      phrase: regs + ' registered, headcount from host: ' + host
    };
  }

  function includedInUpcoming(s, today) {
    if (!s || flag(s, 'isCancelled', 'is_cancelled') || flag(s, 'isHold', 'is_hold')) return false;
    if (isLongSeries(s)) return false;
    var end = lastMeeting(s);
    if (!end) return false;
    if (today && end < today) return false;
    return true;
  }

  function includedInPacking(s, today, days) {
    if (!s || flag(s, 'isVirtual', 'is_virtual') || flag(s, 'isCancelled', 'is_cancelled') || flag(s, 'isHold', 'is_hold')) return false;
    if (!ymd(s.date)) return false;
    var start = ymd(today);
    var end = addDays(start, days == null ? 60 : days);
    if (!start || !end) return false;
    return meetingDays(s).some(function (d) { return d.date >= start && d.date <= end; });
  }

  function dateList(value) {
    if (value == null || value === '') return [];
    if (!Array.isArray(value)) return null;
    return value.map(function (item) {
      if (typeof item === 'string') return ymd(item);
      return ymd(item && item.date);
    }).filter(Boolean).sort();
  }

  function disagreements(input) {
    input = input || {};
    var sessions = input.sessions || [];
    var regs = input.registrations || [];
    var jobs = input.jobData || {};
    var jobMap = {};
    if (Array.isArray(jobs)) {
      jobs.forEach(function (row) {
        if (!row) return;
        var id = row.session_id || row.sessionId;
        if (id) jobMap[id] = row;
      });
    } else {
      jobMap = jobs;
    }
    var checkouts = input.checkouts || [];
    var requests = input.classRequests || [];
    var today = ymd(input.today);
    var out = [];
    var ids = {};
    sessions.forEach(function (s) { if (s && s.id) ids[s.id] = true; });

    sessions.forEach(function (s) {
      if (!s || !s.id) return;
      var code = text(s.code) || s.id;
      var dates = dateList(s.extraDates != null ? s.extraDates : s.extra_dates);
      var days = dateList(s.extraDays != null ? s.extraDays : s.extra_days);
      if (dates === null || days === null) {
        out.push({
          id: s.id,
          code: code,
          kind: 'extra-days-shape',
          detail: 'extra_dates or extra_days is not a list. Views treat that as no extra day. Not deleted.'
        });
      } else if (days.length && dates.join('|') !== days.join('|')) {
        out.push({
          id: s.id,
          code: code,
          kind: 'extra-days-mismatch',
          detail: 'extra_dates and extra_days list different dates, so a view can drop a meeting day.'
        });
      }
      if (hostHeadcountApplies(s) && !flag(s, 'orgHandlesRegistration', 'org_handles_registration')) {
        out.push({
          id: s.id,
          code: code,
          kind: 'org-flag-off',
          detail: 'Private class billed to an organization at a $0 family price. Views use the host headcount, and Organization registration is off.'
        });
      }
      var job = jobMap[s.id];
      if (job) {
        var jid = job.instructorId != null ? job.instructorId : job.instructor_id;
        var sid = s.instructorId != null ? s.instructorId : s.instructor_id;
        if (text(jid) !== text(sid)) {
          out.push({
            id: s.id,
            code: code,
            kind: 'instructor-mismatch',
            detail: 'The session instructor and the job assignment are different people.'
          });
        }
      }
      if (today && includedInPacking(s, today, 60) && !includedInUpcoming(s, today) && !isLongSeries(s)) {
        out.push({
          id: s.id,
          code: code,
          kind: 'view-split',
          detail: 'Packing includes this class and Upcoming sessions does not.'
        });
      }
    });

    Object.keys(jobMap).forEach(function (id) {
      if (!ids[id]) {
        out.push({ id: id, code: '', kind: 'orphan-job', detail: 'job_data row has no session. Not deleted.' });
      }
    });
    var seenReg = {};
    regs.forEach(function (r) {
      var id = r && (r.sessionId || r.session_id);
      if (!id || ids[id] || seenReg[id]) return;
      seenReg[id] = true;
      out.push({ id: id, code: '', kind: 'orphan-registration', detail: 'Registration rows point at a missing session. Not deleted.' });
    });
    var seenKit = {};
    checkouts.forEach(function (c) {
      var id = c && (c.sessionId || c.session_id);
      if (!id || ids[id] || seenKit[id]) return;
      seenKit[id] = true;
      out.push({ id: id, code: '', kind: 'orphan-equipment', detail: 'An equipment checkout points at a missing session. Not deleted.' });
    });
    requests.forEach(function (row) {
      if (!row || !row.session_id) return;
      var st = text(row.status).toLowerCase();
      if (st === 'pending' || st === 'received' || st === 'new') {
        out.push({
          id: row.session_id,
          code: text(row.session_code),
          kind: 'unapproved-request',
          detail: 'A class request still waiting for approval already has a session id.'
        });
      }
    });
    return out;
  }

  var api = {
    meetingDays: meetingDays,
    meetingSummary: meetingSummary,
    isLongSeries: isLongSeries,
    hostHeadcountApplies: hostHeadcountApplies,
    hostHeadcount: hostHeadcount,
    rosterFact: rosterFact,
    includedInUpcoming: includedInUpcoming,
    includedInPacking: includedInPacking,
    disagreements: disagreements,
    addDays: addDays
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBSessionViews = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
