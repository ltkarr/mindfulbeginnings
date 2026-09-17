/* ════════════════════════════════════════════════════════════════════════
   Public-session helpers for register.html

   Families without a host code can browse upcoming public classes. This file
   is the filter + display logic so register.html and the unit tests stay in
   sync. There is no is_public column on sessions — public means "a regular
   upcoming course session," not an ops / custom / hold / cancelled job.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  // Ops / private / partner codes used in admin for custom jobs and events.
  // Kept even though is_custom_job usually covers these, so a mis-flagged row
  // still stays off the public list.
  var OPS_CODE_PREFIXES = ['CJ-', 'RUA-', 'SUN-', 'TWU-'];
  var OPS_COURSE_RE = /represent|welcome event|\btrinity\b/i;

  function todayLocalISO(now) {
    var d = now ? new Date(now) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function startsWithOpsCode(code) {
    var c = String(code || '').trim().toUpperCase();
    for (var i = 0; i < OPS_CODE_PREFIXES.length; i++) {
      if (c.indexOf(OPS_CODE_PREFIXES[i]) === 0) return true;
    }
    return false;
  }

  function isOpsCourseName(course) {
    return OPS_COURSE_RE.test(String(course || ''));
  }

  function flagOn(row, key) {
    if (!row || row[key] == null) return false;
    return row[key] === true || row[key] === 'true' || row[key] === 1 || row[key] === '1';
  }

  function isPublicSession(row, today) {
    if (!row || !row.code) return false;
    var day = today || todayLocalISO();
    if (row.date && String(row.date) < day) return false;
    if (flagOn(row, 'is_cancelled') || flagOn(row, 'isCancelled')) return false;
    if (flagOn(row, 'is_hold') || flagOn(row, 'isHold')) return false;
    if (flagOn(row, 'is_custom_job') || flagOn(row, 'isCustomJob')) return false;
    if (startsWithOpsCode(row.code)) return false;
    if (isOpsCourseName(row.course)) return false;
    return true;
  }

  function filterPublicSessions(rows, today) {
    var day = today || todayLocalISO();
    return (rows || []).filter(function (row) { return isPublicSession(row, day); })
      .sort(function (a, b) {
        var da = String(a.date || '');
        var db = String(b.date || '');
        if (da !== db) return da < db ? -1 : 1;
        return String(a.code || '').localeCompare(String(b.code || ''));
      });
  }

  function sessionPlace(row) {
    if (!row) return '';
    if (flagOn(row, 'is_virtual') || flagOn(row, 'isVirtual')) return 'Virtual';
    var city = String(row.city || '').replace(/\s+/g, ' ').trim().replace(/,\s*$/, '');
    return city || 'Location TBD';
  }

  function sessionPrice(row, getBasePrice) {
    if (!row) return null;
    if (row.price_override != null && row.price_override !== '') {
      var n = Number(row.price_override);
      if (!isNaN(n)) return Math.max(0, n);
    }
    if (row.priceOverride != null && row.priceOverride !== '') {
      var o = Number(row.priceOverride);
      if (!isNaN(o)) return Math.max(0, o);
    }
    if (typeof getBasePrice === 'function') {
      var base = getBasePrice(row.course, row.date, row.created_at != null ? row.created_at : row.createdAt);
      if (base != null && !isNaN(Number(base))) return Number(base);
    }
    return null;
  }

  function sessionCap(row, maxStudents) {
    if (!row) return null;
    var override = row.max_students_override != null ? row.max_students_override : row.maxStudentsOverride;
    if (override != null && Number(override) > 0) return Number(override);
    if (maxStudents && row.course && maxStudents[row.course] != null) return Number(maxStudents[row.course]);
    return null;
  }

  function seatsLeft(row, registeredCount, maxStudents) {
    var cap = sessionCap(row, maxStudents);
    if (cap == null) return null;
    var used = Number(registeredCount);
    if (!isFinite(used) || used < 0) used = 0;
    return Math.max(0, cap - used);
  }

  function monthLabel(dateStr) {
    if (!dateStr) return '';
    var d = new Date(String(dateStr) + 'T12:00:00');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  var api = {
    OPS_CODE_PREFIXES: OPS_CODE_PREFIXES,
    todayLocalISO: todayLocalISO,
    isPublicSession: isPublicSession,
    filterPublicSessions: filterPublicSessions,
    sessionPlace: sessionPlace,
    sessionPrice: sessionPrice,
    sessionCap: sessionCap,
    seatsLeft: seatsLeft,
    monthLabel: monthLabel
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBPublicSessions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
