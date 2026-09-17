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

  // Default browse window and "show more" page size. Families should not face
  // an endless raw list; they can widen the date filter or tap Show more.
  var DEFAULT_WINDOW_DAYS = 60;
  var DEFAULT_VISIBLE = 6;

  // Parent-facing audience / age lines. config.js COURSES.audience wins when set.
  var COURSE_AUDIENCE = {
    'Safe Sitter®': 'Grades 3–9',
    'Intro to Babysitting': 'Grades 4–8',
    'Safe@Home': 'Kids home alone',
    'Safe@Home — Virtual': 'Kids home alone · Virtual',
    'Safe@Home — Series': 'Kids home alone · multi-week',
    'Grandparents: Getting Started': 'Grandparents & caregivers',
    'All Kids Welcome': 'Experienced sitters · Grades 3–9',
    'Stay Ready: Choking Rescue and CPR': 'Grades 7–12',
    'Campus Ready: Safety Skills for College Life': '11th–12th grade & college',
    'Steady and Ready': 'Family safety workshop',
    'My First Babysitters Club': 'Younger sitters · 8-week series',
    'My First Babysitters Club — Single Session': 'Younger sitters',
    'Ready. Period.': 'Grades 5–7',
    'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes': 'Student athletes · Grades 6–12'
  };

  function todayLocalISO(now) {
    var d = now ? new Date(now) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function addDaysISO(iso, days) {
    var parts = String(iso || '').split('-');
    if (parts.length < 3) return '';
    var d = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
    if (isNaN(d.getTime())) return '';
    d.setDate(d.getDate() + Number(days || 0));
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

  // City/area for filters and cards. Venue name (location) is OK when it is not
  // a street address; host_address is never shown on the public list.
  function sessionCardPlace(row) {
    if (!row) return '';
    if (flagOn(row, 'is_virtual') || flagOn(row, 'isVirtual')) return 'Virtual';
    var city = String(row.city || '').replace(/\s+/g, ' ').trim().replace(/,\s*$/, '');
    var loc = String(row.location || '').replace(/\s+/g, ' ').trim();
    if (loc && /\d/.test(loc)) loc = '';
    if (loc && city && loc.toLowerCase() !== city.toLowerCase()) return loc + ' · ' + city;
    return loc || city || 'Location TBD';
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

  function seatsLabel(left) {
    if (left == null) return '';
    if (left <= 0) return 'Full — waitlist';
    if (left === 1) return '1 seat left';
    return left + ' seats left';
  }

  function monthLabel(dateStr) {
    if (!dateStr) return '';
    var d = new Date(String(dateStr) + 'T12:00:00');
    if (isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  }

  function courseAudience(course, coursesConfig) {
    var name = String(course || '');
    var cfg = coursesConfig || (typeof root.COURSES === 'object' ? root.COURSES : null);
    if (cfg && cfg[name] && cfg[name].audience) return String(cfg[name].audience);
    return COURSE_AUDIENCE[name] || '';
  }

  function sessionPriceLabel(price) {
    if (price == null || isNaN(Number(price))) return '';
    var n = Number(price);
    if (n <= 0) return 'Free';
    return n % 1 === 0 ? ('$' + n) : ('$' + n.toFixed(2));
  }

  function matchesPriceFilter(price, filter) {
    var f = String(filter || '');
    if (!f) return true;
    if (price == null || isNaN(Number(price))) return false;
    var n = Number(price);
    if (f === 'free') return n <= 0;
    if (f === 'paid') return n > 0;
    return true;
  }

  function uniqueSorted(values) {
    var seen = {};
    var out = [];
    (values || []).forEach(function (v) {
      var s = String(v || '').trim();
      if (!s || seen[s]) return;
      seen[s] = true;
      out.push(s);
    });
    out.sort(function (a, b) { return a.localeCompare(b); });
    return out;
  }

  function uniqueCourses(rows) {
    return uniqueSorted((rows || []).map(function (r) { return r && r.course; }));
  }

  function uniqueCities(rows) {
    return uniqueSorted((rows || []).map(function (r) { return sessionPlace(r); }));
  }

  /**
   * Shrink a public-session list using the browse filters.
   * Cards always show price. A Free / Paid filter is optional.
   * filters: { course, city, price, windowDays }
   * opts: { today, getBasePrice }
   */
  function applyBrowseFilters(rows, filters, opts) {
    filters = filters || {};
    opts = opts || {};
    var today = opts.today || todayLocalISO();
    var getBasePrice = opts.getBasePrice;
    var windowDays = filters.windowDays;
    if (windowDays == null || windowDays === '') windowDays = DEFAULT_WINDOW_DAYS;
    var endDate = null;
    if (windowDays !== 'all' && windowDays !== 'All' && Number(windowDays) > 0) {
      endDate = addDaysISO(today, Number(windowDays));
    }
    var course = String(filters.course || '').trim();
    var city = String(filters.city || '').trim();
    var price = String(filters.price || '').trim();
    return (rows || []).filter(function (row) {
      if (course && String(row.course || '') !== course) return false;
      if (city && sessionPlace(row) !== city) return false;
      if (endDate && row.date && String(row.date) > endDate) return false;
      if (price && !matchesPriceFilter(sessionPrice(row, getBasePrice), price)) return false;
      return true;
    });
  }

  function sliceForDisplay(rows, showAll, limit) {
    var n = limit == null ? DEFAULT_VISIBLE : Number(limit);
    if (!n || n < 1) n = DEFAULT_VISIBLE;
    var list = rows || [];
    if (showAll || list.length <= n) {
      return { rows: list.slice(), hidden: 0, truncated: false };
    }
    return { rows: list.slice(0, n), hidden: list.length - n, truncated: true };
  }

  var api = {
    OPS_CODE_PREFIXES: OPS_CODE_PREFIXES,
    COURSE_AUDIENCE: COURSE_AUDIENCE,
    DEFAULT_WINDOW_DAYS: DEFAULT_WINDOW_DAYS,
    DEFAULT_VISIBLE: DEFAULT_VISIBLE,
    todayLocalISO: todayLocalISO,
    addDaysISO: addDaysISO,
    isPublicSession: isPublicSession,
    filterPublicSessions: filterPublicSessions,
    sessionPlace: sessionPlace,
    sessionCardPlace: sessionCardPlace,
    sessionPrice: sessionPrice,
    sessionCap: sessionCap,
    seatsLeft: seatsLeft,
    seatsLabel: seatsLabel,
    monthLabel: monthLabel,
    courseAudience: courseAudience,
    sessionPriceLabel: sessionPriceLabel,
    matchesPriceFilter: matchesPriceFilter,
    uniqueCourses: uniqueCourses,
    uniqueCities: uniqueCities,
    applyBrowseFilters: applyBrowseFilters,
    sliceForDisplay: sliceForDisplay
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBPublicSessions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
