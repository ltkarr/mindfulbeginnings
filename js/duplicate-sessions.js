/* Duplicate-session checks for admin.html.
   Same course, date, and place is a possible duplicate only when the times
   overlap or a time cannot be read. A morning class and an afternoon class
   are not the same session. Dismissals are keyed on the unordered pair of
   session ids. */
(function (root) {
  'use strict';

  function dupeNorm(t) {
    return String(t == null ? '' : t).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }

  function sessionDupeKey(s) {
    if (!s || !s.date || s.isCancelled || s.isHold) return null;
    var place = s.isVirtual ? '~virtual~' : dupeNorm(s.location);
    return dupeNorm(s.course) + '|' + s.date + '|' + place;
  }

  function pairKey(a, b) {
    var x = String(a == null ? '' : a);
    var y = String(b == null ? '' : b);
    if (!x || !y || x === y) return '';
    return x < y ? x + '|' + y : y + '|' + x;
  }

  function merOf(token) {
    var m = /([ap])\.?m\.?/i.exec(String(token || ''));
    return m ? m[1].toLowerCase() + 'm' : null;
  }

  function clockMinutes(token, inheritedMer) {
    var m = /(\d{1,2})(?::(\d{2}))?/.exec(String(token || ''));
    if (!m) return null;
    var h = Number(m[1]);
    var min = m[2] ? Number(m[2]) : 0;
    if (h > 23 || min > 59) return null;
    if (h > 12) return h * 60 + min;
    var use = merOf(token) || inheritedMer;
    if (!use) return null;
    if (h === 12) h = 0;
    if (use === 'pm') h += 12;
    return h * 60 + min;
  }

  // Returns {start, end} minutes from midnight, end exclusive of the next day.
  // "11:00 to 1:00 PM" reads the start as morning. Null when the text is not a range.
  function parseTimeRange(str) {
    if (str == null || !String(str).trim()) return null;
    var s = String(str).replace(/\u2013|\u2014/g, '-').replace(/\s+to\s+/i, ' - ');
    var parts = s.split(/\s*-\s*/).map(function (x) { return x.trim(); }).filter(Boolean);
    if (parts.length < 2) return null;
    var startTok = parts[0];
    var endTok = parts.slice(1).join('-');
    var startMer = merOf(startTok);
    var endMer = merOf(endTok);
    var start = clockMinutes(startTok, startMer || endMer);
    var end = clockMinutes(endTok, endMer || startMer);
    if (start != null && end != null && start >= end && !startMer && endMer === 'pm') {
      start = clockMinutes(startTok, 'am');
    }
    if (start == null || end == null || end <= start) return null;
    return { start: start, end: end };
  }

  // True when the two times might be the same class. A readable range that
  // ends at or before the other starts is a different class. Missing or
  // unreadable times stay flagged.
  function timesCouldBeSameClass(a, b) {
    var ra = parseTimeRange(a);
    var rb = parseTimeRange(b);
    if (!ra || !rb) return true;
    return ra.start < rb.end && rb.start < ra.end;
  }

  function asSet(dismissed) {
    if (!dismissed) return new Set();
    if (typeof dismissed.has === 'function') return dismissed;
    return new Set(dismissed);
  }

  function findDuplicateGroups(sessions, dismissed) {
    var hidden = asSet(dismissed);
    var buckets = {};
    (sessions || []).forEach(function (s) {
      var k = sessionDupeKey(s);
      if (!k) return;
      (buckets[k] = buckets[k] || []).push(s);
    });
    var groups = [];
    Object.keys(buckets).forEach(function (k) {
      var rows = buckets[k];
      if (rows.length < 2) return;
      var parent = {};
      function idOf(s) { return String(s.id); }
      function find(a) {
        while (parent[a] !== a) {
          parent[a] = parent[parent[a]];
          a = parent[a];
        }
        return a;
      }
      rows.forEach(function (s) { parent[idOf(s)] = idOf(s); });
      var edges = [];
      for (var i = 0; i < rows.length; i++) {
        for (var j = i + 1; j < rows.length; j++) {
          if (!timesCouldBeSameClass(rows[i].time, rows[j].time)) continue;
          var pk = pairKey(rows[i].id, rows[j].id);
          if (!pk || hidden.has(pk)) continue;
          parent[find(idOf(rows[i]))] = find(idOf(rows[j]));
          edges.push(pk);
        }
      }
      var clusters = {};
      var edgeByRoot = {};
      rows.forEach(function (s) {
        var root = find(idOf(s));
        (clusters[root] = clusters[root] || []).push(s);
      });
      edges.forEach(function (pk) {
        var ids = pk.split('|');
        var root = find(ids[0]);
        (edgeByRoot[root] = edgeByRoot[root] || []).push(pk);
      });
      Object.keys(clusters).forEach(function (root) {
        if (clusters[root].length < 2) return;
        var list = clusters[root].slice().sort(function (a, b) {
          return (a.createdAt || 0) - (b.createdAt || 0) || String(a.time || '').localeCompare(String(b.time || ''));
        });
        groups.push({ key: k, pairKeys: edgeByRoot[root] || [], rows: list });
      });
    });
    groups.sort(function (a, b) { return String(b.rows[0].date).localeCompare(String(a.rows[0].date)); });
    return groups;
  }

  var api = {
    dupeNorm: dupeNorm,
    sessionDupeKey: sessionDupeKey,
    pairKey: pairKey,
    parseTimeRange: parseTimeRange,
    timesCouldBeSameClass: timesCouldBeSameClass,
    findDuplicateGroups: findDuplicateGroups
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBDuplicateSessions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
