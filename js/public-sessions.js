/* ════════════════════════════════════════════════════════════════════════
   Public-session helpers for register.html

   Families without a host code can browse upcoming public classes. This file
   is the list + display logic so register.html and the unit tests stay in
   sync.    There is no is_public column on sessions — public means "a regular
   upcoming course at a public venue," not a private/host home, ops, custom,
   hold, or cancelled job. Custom jobs never appear here, even when they have
   an https external_registration_url. A real public course can still use that
   link so families book on a partner site instead of paying here. Someone
   with the session code can still open a custom job; that path is separate.

   The register page does not expose Course / When / City / Price filters.
   applyBrowseFilters still applies a default upcoming window internally.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  // Ops / private / partner codes used in admin for custom jobs and events.
  // Kept even though is_custom_job usually covers these, so a mis-flagged row
  // still stays off the public list.
  var OPS_CODE_PREFIXES = ['CJ-', 'RUA-', 'SUN-', 'TWU-', 'GS-', 'GSFA-'];
  var OPS_COURSE_RE = /represent|welcome event|\btrinity\b/i;

  // Default upcoming window and "show more" page size. No user-facing filters.
  var DEFAULT_WINDOW_DAYS = 365;
  var DEFAULT_VISIBLE = 6;

  // Parent-facing audience / age lines. config.js COURSES.audience wins when set.
  var COURSE_AUDIENCE = {
    'Safe Sitter®': 'Ages 11 to 14',
    'Safe Sitter® Babysitting Essentials': 'Ages 11 to 14',
    'Intro to Babysitting': 'Ages 10 to 12',
    'Safe@Home': 'Ages 8 to 10',
    'Safe@Home — Virtual': 'Ages 8 to 10, virtual',
    'Safe@Home — Series': 'Ages 8 to 10, multi-week',
    'Grandparents: Getting Started': 'Grandparents and caregivers',
    'Care Ready': 'Nannies and au pairs',
    'Baby Ready': 'Expecting and new parents',
    'Baby Ready + CPR Certification': 'Expecting parents, $275 per person',
    'All Kids Welcome': 'Experienced sitters',
    'Stay Ready: Choking Rescue and CPR': 'Ages 11 and up',
    'Campus Ready: Safety Skills for College Life': 'Teens & college-bound',
    'Steady and Ready': 'Ages 8 to 12',
    'My First Babysitters Club': 'Ages 8 to 10, 8-week series',
    'My First Babysitters Club — Single Session': 'Ages 8 to 10, 2.5-hour workshop',
    'Ready. Period.': 'Girls ages 10 to 12',
    'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes': 'Student athletes',
    'Social Ready': 'Ages 8 to 14',
    'Girl Scouts — First Aid Badge Workshop': 'Girl Scout troops, custom schedule',
    'Girl Scout Badge Class': 'Girl Scout troops, custom schedule'
  };

  // Family-facing names. Stored course keys stay unchanged so existing sessions match.
  var COURSE_PUBLIC_NAME = {
    'Safe Sitter®': 'Safe Sitter® Babysitting with CPR Module',
    'Intro to Babysitting': 'Introduction to Safe Babysitting by Safe Sitter®',
    'Safe@Home': 'Safe@Home: First Steps to Independence',
    'Grandparents: Getting Started': 'Safe Sitter® Grandparents: Getting Started',
    'Stay Ready: Choking Rescue and CPR': 'Stay Ready™: Choking Rescue, CPR, and Seizure Response',
    'My First Babysitters Club': "My First Babysitter's Club™",
    'My First Babysitters Club — Single Session': "My First Babysitter's Club™ workshop",
    'All Kids Welcome': 'All Kids Welcome™: For Experienced Sitters',
    'Steady and Ready': 'Steady and Ready™',
    'Social Ready': 'Social Ready™',
    'Ready. Period.': 'Ready. Period.™',
    'Care Ready': 'Care Ready™',
    'Baby Ready': 'Baby Ready™',
    'Baby Ready + CPR Certification': 'Baby Ready™ + CPR Certification',
    'Campus Ready: Safety Skills for College Life': 'Campus Ready™: Safety Skills for College Life',
    'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes': 'Season Ready™: Safety Skills for Student Athletes'
  };

  function coursePublicName(course) {
    var name = String(course || '');
    return COURSE_PUBLIC_NAME[name] || name;
  }

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

  // Admin: has_host true (default) = "Allow host registration (private home)".
  // has_host false = "No host — public venue". Private/host sessions stay off
  // the family-facing list. If the column was not selected at all, do not hide
  // every row — the query fallback can omit has_host.
  // Partner booking link. Only https is treated as a real redirect so a blank,
  // http, or script-looking value cannot send a family off-site or into checkout.
  function externalRegistrationUrl(row) {
    if (!row) return '';
    var raw = row.external_registration_url != null ? row.external_registration_url : row.externalRegistrationUrl;
    var url = String(raw == null ? '' : raw).replace(/^\s+|\s+$/g, '');
    if (!url || !/^https:\/\//i.test(url)) return '';
    return url;
  }

  function externalRegistrationHost(url) {
    var m = String(url || '').match(/^https:\/\/([^\/?#]+)/i);
    if (!m) return '';
    return m[1].replace(/^www\./i, '').toLowerCase();
  }

  function externalRegistrationLabel(url) {
    var host = externalRegistrationHost(url);
    if (host === 'districtdabblelab.com') return 'Register on District DabbleLab';
    return 'Register externally';
  }

  function isPrivateHostSession(row) {
    if (!row) return false;
    var hasCamel = Object.prototype.hasOwnProperty.call(row, 'hasHost');
    var hasSnake = Object.prototype.hasOwnProperty.call(row, 'has_host');
    if (!hasCamel && !hasSnake) return false;
    var v = hasSnake ? row.has_host : row.hasHost;
    return v !== false && v !== 'false' && v !== 0 && v !== '0';
  }

  function isPublicSession(row, today) {
    if (!row || !row.code) return false;
    var day = today || todayLocalISO();
    if (row.date && String(row.date) < day) return false;
    if (flagOn(row, 'is_cancelled') || flagOn(row, 'isCancelled')) return false;
    if (flagOn(row, 'is_hold') || flagOn(row, 'isHold')) return false;
    // Custom jobs (Shatterproof, instructor booths, partner events) are not
    // public classes. An https partner link does not put them on this list.
    if (flagOn(row, 'is_custom_job') || flagOn(row, 'isCustomJob')) return false;
     // Admin "private" flag (e.g. Beth El sessions): never listed publicly.
     if (flagOn(row, 'is_private') || flagOn(row, 'isPrivate')) return false;
    // Organization registration: public limit 0, and no session code is accepted.
    if (flagOn(row, 'org_handles_registration') || flagOn(row, 'orgHandlesRegistration')) return false;
    if (isPrivateHostSession(row)) return false;
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

  // City/area for cards. Venue name (location) is OK when it is not a street
  // address; host_address is never shown on the public list.
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

  // People held by one registration. Baby Ready is a couple booking (2) even
  // when COURSES is not on this page; MBCourseBooking wins when it is loaded.
  function seatsPerRegistration(course, createdAt) {
    if (root.MBCourseBooking && typeof root.MBCourseBooking.seatsPerRegistration === 'function') {
      return root.MBCourseBooking.seatsPerRegistration(course, null, createdAt);
    }
    var t = createdAt == null || createdAt === '' ? NaN : (typeof createdAt === 'number' ? createdAt : Date.parse(createdAt));
    if (!isNaN(t) && t >= Date.parse('2026-10-22T00:00:00Z')) return 1;
    if (course === 'Baby Ready' || course === 'Baby Ready + CPR Certification') return 2;
    return 1;
  }

  function seatsLeft(row, registeredCount, maxStudents) {
    var cap = sessionCap(row, maxStudents);
    if (cap == null) return null;
    var regs = Number(registeredCount);
    if (!isFinite(regs) || regs < 0) regs = 0;
    var created = row && (row.createdAt != null ? row.createdAt : row.created_at);
    var per = seatsPerRegistration(row && row.course, created);
    return Math.max(0, cap - regs * per);
  }

  // Families never see an exact remaining count. Under this many open seats
  // the public card shows a scarcity line; at or above it, no seat text.
  var SCARCITY_BELOW = 5;
  var FEW_SEATS_LABEL = 'FEW SEATS LEFT';

  function seatsLabel(left, seatsNeeded) {
    if (left == null) return '';
    var need = Number(seatsNeeded);
    if (!isFinite(need) || need < 1) need = 1;
    // Not enough room for one more registration. The public card turns this
    // into a native waitlist button; a session code still opens the on-page waitlist form.
    if (left < need) return 'WAITLIST ONLY';
    if (left < SCARCITY_BELOW) return FEW_SEATS_LABEL;
    return '';
  }

  var WAITLIST_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  function formatWaitlistDate(dateStr) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr || ''));
    if (!m) return '';
    var month = Number(m[2]);
    var day = Number(m[3]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return '';
    return WAITLIST_MONTHS[month - 1] + ' ' + day + ', ' + m[1];
  }

  // mailto Lindsay can answer without opening the registration form.
  // Subject shape: Waitlist request: Safe Sitter® — SS-1103 — Nov 3, 2026
  function waitlistMailto(row) {
    row = row || {};
    var course = String(row.course || '').trim() || 'Class';
    var code = String(row.code || '').trim();
    var when = formatWaitlistDate(row.date);
    var detail = [course, code, when].filter(Boolean).join(' — ');
    var subject = 'Waitlist request: ' + detail;
    var body = 'I would like to join the waitlist for ' + detail + '.';
    return 'mailto:lindsay@mindfulbeginnings.org?subject=' + encodeURIComponent(subject) + '&body=' + encodeURIComponent(body);
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
   * Apply the default upcoming window (and optional internal filters).
   * The register page does not expose these as UI; it passes the default
   * 365-day window only.
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
    externalRegistrationUrl: externalRegistrationUrl,
    externalRegistrationHost: externalRegistrationHost,
    externalRegistrationLabel: externalRegistrationLabel,
    isPrivateHostSession: isPrivateHostSession,
    isPublicSession: isPublicSession,
    filterPublicSessions: filterPublicSessions,
    sessionPlace: sessionPlace,
    sessionCardPlace: sessionCardPlace,
    sessionPrice: sessionPrice,
    sessionCap: sessionCap,
    seatsPerRegistration: seatsPerRegistration,
    seatsLeft: seatsLeft,
    seatsLabel: seatsLabel,
    SCARCITY_BELOW: SCARCITY_BELOW,
    FEW_SEATS_LABEL: FEW_SEATS_LABEL,
    waitlistMailto: waitlistMailto,
    monthLabel: monthLabel,
    courseAudience: courseAudience,
    coursePublicName: coursePublicName,
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
