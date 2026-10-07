/* Class-request intake: field mapping, session rows, checklist, confirmation drafts.
   Used by the server submit path, ADMIN, and tests. Nothing here sends email. */
(function (root) {
  'use strict';

  var PUBLIC_ORIGIN = 'https://register.mindfulbeginnings.org';
  var LINDSAY_EMAIL = 'lindsay@mindfulbeginnings.org';

  // Catalog prices match config.js (program guide). A few old Google Form
  // prices were stale; the intake shows these amounts so a new session matches
  // what families are charged everywhere else.
  var COURSES = [
    { key: 'safe-sitter', course: 'Safe Sitter®', abbr: 'SS', price: 225, hours: '5 hours', audience: 'Grades 6–8', where: 'in person', requiresSS: true, host: true, org: true },
    { key: 'safe-at-home', course: 'Safe@Home', abbr: 'SAH', price: 85, hours: '90 minutes', audience: 'Grades 3–5', where: 'in person', host: true, org: true },
    { key: 'safe-at-home-virtual', course: 'Safe@Home — Virtual', abbr: 'SAHV', price: 40, hours: '60 minutes', audience: 'Grades 3–5', where: 'virtual', virtual: true, host: true, org: true },
    { key: 'care-ready', course: 'Care Ready', abbr: 'CRE', price: 185, hours: '2.5 hours', audience: 'Adult caregivers', where: 'in person', host: true, org: true },
    { key: 'grandparents', course: 'Grandparents: Getting Started', abbr: 'GP', price: 185, hours: '3 hours', audience: 'Adults', where: 'in person', requiresSS: true, host: true, org: true },
    { key: 'mfbc-single', course: 'My First Babysitters Club — Single Session', abbr: 'MFBC1', price: 95, hours: '2.5 hours', audience: 'Grades 4–5', where: 'in person', host: true, org: true },
    { key: 'mfbc-series', course: 'My First Babysitters Club', abbr: 'MFBC', price: 165, hours: '1 hour a week', audience: 'Younger sitters · multi-week', where: 'in person', host: false, org: true },
    { key: 'campus-ready', course: 'Campus Ready: Safety Skills for College Life', abbr: 'CR', price: 75, hours: '1 hour', audience: 'Ages 16+', where: 'in person', requiresRN: true, host: true, org: true },
    { key: 'ready-period', course: 'Ready. Period.', abbr: 'RP', price: 75, hours: '90 minutes', audience: 'Grades 5–8', where: 'in person', requiresRN: true, host: true, org: true },
    { key: 'stay-ready', course: 'Stay Ready: Choking Rescue and CPR', abbr: 'SR', price: 75, hours: '90 minutes', audience: 'Grades 8+', where: 'in person', requiresRN: true, host: true, org: true },
    { key: 'steady-ready', course: 'Steady and Ready', abbr: 'STR', price: 65, hours: '1.5 hours', audience: 'Ages 8+', where: 'in person', host: true, org: true },
    { key: 'intro', course: 'Intro to Babysitting', abbr: 'IB', price: 40, hours: '1 hour', audience: 'Grades 6–8', where: 'in person', host: true, org: true },
    { key: 'intro-virtual', course: 'Intro to Babysitting', abbr: 'IB', price: 40, hours: '1 hour', audience: 'Grades 6–8', where: 'virtual', virtual: true, host: true, org: true },
    { key: 'all-kids-welcome', course: 'All Kids Welcome', abbr: 'AKW', price: 25, hours: '1 hour', audience: 'Experienced sitters', where: 'in person', host: true, org: true },
    { key: 'all-kids-welcome-virtual', course: 'All Kids Welcome', abbr: 'AKW', price: 25, hours: '1 hour', audience: 'Experienced sitters', where: 'virtual', virtual: true, host: true, org: true },
    // Social Ready matches config.js: $35/kid, 1 hour, grades 4–8, code SOC.
    // In person and virtual are separate choices, same as All Kids Welcome.
    { key: 'social-ready', course: 'Social Ready', abbr: 'SOC', price: 35, hours: '1 hour', audience: 'Grades 4–8', where: 'in person', host: true, org: true },
    { key: 'social-ready-virtual', course: 'Social Ready', abbr: 'SOC', price: 35, hours: '1 hour', audience: 'Grades 4–8', where: 'virtual', virtual: true, host: true, org: true },
    { key: 'baby-ready', course: 'Baby Ready', abbr: 'BR', price: 225, hours: '2.5 hours', audience: 'Expecting or new parents · per couple', where: 'in person', host: false, org: true },
    { key: 'season-ready', course: 'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes', abbr: 'SEAR', price: 25, hours: '60 minutes', audience: 'Student athletes', where: 'in person', requiresRN: true, host: false, org: true },
    // First Aid badge: $45 guide price, 60 minutes, RN only. A troop split is
    // entered on the session (family price + organization flat fee), not here.
    { key: 'gs-first-aid', course: 'Girl Scouts — First Aid Badge Workshop', abbr: 'GSFA', price: 45, hours: '1 hour', audience: 'Girl Scout troops', where: 'in person', requiresRN: true, host: false, org: true },
    { key: 'unsure', course: '', abbr: '', price: null, hours: '', audience: '', where: '', placeholder: true, host: true, org: false, label: 'Not sure yet — I would like guidance' },
    { key: 'custom', course: '', abbr: '', price: null, hours: '', audience: '', where: '', placeholder: true, host: false, org: true, label: 'Custom course — we will follow up with pricing' }
  ];

  var BILLING_OPTIONS = [
    {
      key: 'org_full_external',
      label: 'We cover the full cost, and our organization handles registration. Participants sign up through us at no charge. Mindful Beginnings invoices us after the course.'
    },
    {
      key: 'org_full_link',
      label: 'We cover the full cost, and Mindful Beginnings handles registration. Participants use a private Mindful Beginnings link at no charge. Mindful Beginnings invoices us after the course.'
    },
    {
      key: 'individual',
      label: 'Participants register and pay individually on a private Mindful Beginnings link.'
    },
    {
      key: 'split',
      label: 'We cover a portion. Participants pay a reduced rate at registration, and we are invoiced for the rest after the course.'
    }
  ];

  var CHECK_KEYS = ['received', 'session_created', 'draft_ready', 'email_sent', 'instructor_claimed', 'done', 'archived'];
  var TOGGLE_KEYS = ['session_created', 'draft_ready', 'email_sent', 'instructor_claimed', 'done', 'archived'];

  var MONTHS = {
    jan: 1, january: 1, feb: 2, february: 2, mar: 3, march: 3, apr: 4, april: 4,
    may: 5, jun: 6, june: 6, jul: 7, july: 7, aug: 8, august: 8,
    sep: 9, sept: 9, september: 9, oct: 10, october: 10, nov: 11, november: 11, dec: 12, december: 12
  };

  function courseByKey(key) {
    var k = String(key || '').trim();
    for (var i = 0; i < COURSES.length; i++) if (COURSES[i].key === k) return COURSES[i];
    return null;
  }

  function coursesFor(kind) {
    return COURSES.filter(function (c) { return kind === 'organization' ? c.org : c.host; });
  }

  function courseOptionLabel(c) {
    if (c.label) return c.label;
    var bits = [];
    if (c.audience) bits.push(c.audience);
    if (c.hours) bits.push(c.hours);
    if (c.where) bits.push(c.where);
    var detail = bits.join(', ');
    var price = c.price == null ? '' : ' ($' + c.price + ')';
    return c.course + (detail ? ' — ' + detail : '') + price;
  }

  function blankChecklist() {
    return {
      received: true,
      session_created: false,
      draft_ready: false,
      email_sent: false,
      instructor_claimed: false,
      done: false,
      archived: false
    };
  }

  function statusFromChecklist(c) {
    c = c || {};
    if (c.archived) return 'archived';
    if (c.done) return 'done';
    if (!c.session_created) return 'received';
    if (!c.draft_ready) return 'session_created';
    if (!c.email_sent) return 'draft_ready';
    if (!c.instructor_claimed) return 'instructor_open';
    return 'instructor_claimed';
  }

  var STATUS_LABELS = {
    received: 'Received',
    session_created: 'Session created',
    draft_ready: 'Draft ready',
    email_sent: 'Email sent',
    instructor_open: 'Instructor open',
    instructor_claimed: 'Instructor claimed',
    done: 'Done',
    archived: 'Archived'
  };

  function applyChecklistUpdate(current, patch) {
    var next = blankChecklist();
    CHECK_KEYS.forEach(function (k) {
      if (current && current[k]) next[k] = true;
    });
    next.received = true;
    patch = patch || {};
    Object.keys(patch).forEach(function (k) {
      if (TOGGLE_KEYS.indexOf(k) < 0) return;
      next[k] = !!patch[k];
    });
    next.received = true;
    return { checklist: next, status: statusFromChecklist(next) };
  }

  function clip(value, max) {
    var s = String(value == null ? '' : value).replace(/\u0000/g, '').trim();
    if (s.length > max) s = s.slice(0, max);
    return s;
  }

  function money(n) {
    var x = Number(n);
    if (!isFinite(x)) return null;
    return Math.round(x * 100) / 100;
  }

  function isoDate(value) {
    var s = String(value || '').trim();
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (!m) return '';
    var y = Number(m[1]), mo = Number(m[2]), d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return '';
    return m[1] + '-' + m[2] + '-' + m[3];
  }

  function pad(n) { return String(n).padStart(2, '0'); }

  function ymd(y, m, d) {
    if (!y || m < 1 || m > 12 || d < 1 || d > 31) return '';
    return String(y) + '-' + pad(m) + '-' + pad(d);
  }

  function clockParts(h, min, ap) {
    h = Number(h);
    min = min == null || min === '' ? 0 : Number(min);
    if (!isFinite(h) || h > 24 || min > 59) return null;
    var meridiem = String(ap || '').toLowerCase();
    if (meridiem) {
      if (h < 1 || h > 12) return null;
      if (h === 12) h = 0;
      if (meridiem.charAt(0) === 'p') h += 12;
    } else if (h === 24) {
      h = 0;
    }
    var displayH = h % 12;
    if (displayH === 0) displayH = 12;
    return { h: h, h12: displayH, min: pad(min), ap: h >= 12 ? 'PM' : 'AM' };
  }

  function formatClock(parts, withAp) {
    if (!parts) return '';
    return parts.h12 + ':' + parts.min + (withAp ? ' ' + parts.ap : '');
  }

  function formatSpanFromParts(start, end) {
    if (!start) return '';
    if (!end) return formatClock(start, true);
    if (start.ap === end.ap) return formatClock(start, false) + ' to ' + formatClock(end, true);
    return formatClock(start, true) + ' to ' + formatClock(end, true);
  }

  function formatSpan(startHHMM, endHHMM) {
    function fromInput(v) {
      var m = String(v || '').trim().match(/^(\d{1,2}):(\d{2})$/);
      if (!m) return null;
      return clockParts(Number(m[1]), m[2], '');
    }
    return formatSpanFromParts(fromInput(startHHMM), fromInput(endHHMM));
  }

  function parseTimeRange(text) {
    var src = String(text || '')
      .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, ' ')
      .replace(/\b\d{1,2}\/\d{1,2}\/(?:\d{2}|20\d{2})\b/g, ' ')
      .replace(/[–—]/g, '-');
    var range = src.match(/(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?\s*(?:to|-|through)\s*(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)?/i);
    if (range && (range[2] || range[3] || range[5] || range[6])) {
      var endAp = range[6] || '';
      var startAp = range[3] || endAp;
      var start = clockParts(range[1], range[2] || '00', startAp);
      var end = clockParts(range[4], range[5] || '00', endAp || startAp);
      var span = formatSpanFromParts(start, end);
      if (span) return span;
    }
    var one = src.match(/\b(\d{1,2})(?::(\d{2}))?\s*(a\.?m\.?|p\.?m\.?)\b/i);
    if (!one) return '';
    return formatClock(clockParts(one[1], one[2] || '00', one[3]), true);
  }

  function findYear(text) {
    var m = String(text || '').match(/\b(20\d{2})\b/);
    return m ? Number(m[1]) : null;
  }

  function pushDate(list, y, m, d) {
    var iso = ymd(y, m, d);
    if (iso && list.indexOf(iso) < 0) list.push(iso);
  }

  function extractDates(text, fallbackYear) {
    var src = String(text || '');
    var year = findYear(src) || fallbackYear || null;
    var found = [];
    var iso = /\b(20\d{2})-(\d{2})-(\d{2})\b/g;
    var m;
    while ((m = iso.exec(src))) pushDate(found, Number(m[1]), Number(m[2]), Number(m[3]));
    var num = /\b(\d{1,2})\/(\d{1,2})\/(\d{2}|20\d{2})\b/g;
    while ((m = num.exec(src))) {
      var y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
      pushDate(found, y, Number(m[1]), Number(m[2]));
    }
    var named = /\b(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\.?\s+(\d{1,2})(?:\s*(?:-|and|&)\s*(\d{1,2}))?(?:,?\s*(20\d{2}))?/ig;
    while ((m = named.exec(src))) {
      var mo = MONTHS[m[1].toLowerCase()];
      var y2 = m[4] ? Number(m[4]) : year;
      if (!y2) continue;
      pushDate(found, y2, mo, Number(m[2]));
      if (m[3]) pushDate(found, y2, mo, Number(m[3]));
    }
    return found;
  }

  function parseDaysFromText(text) {
    var src = String(text || '').replace(/\u2013|\u2014/g, '-').trim();
    if (!src) return [];
    var year = findYear(src);
    var lines = src.split(/\n+|;\s*/).map(function (s) { return s.trim(); }).filter(Boolean);
    var days = [];
    function addLine(line) {
      var time = parseTimeRange(line);
      extractDates(line, year).forEach(function (date) {
        days.push({ date: date, time: time });
      });
    }
    lines.forEach(addLine);
    if (!days.length) addLine(src);
    var sharedTime = '';
    days.forEach(function (d) { if (d.time) sharedTime = d.time; });
    if (sharedTime) {
      days.forEach(function (d) { if (!d.time) d.time = sharedTime; });
    }
    var byDate = {};
    days.forEach(function (d) {
      if (!byDate[d.date] || (!byDate[d.date].time && d.time)) byDate[d.date] = d;
    });
    return Object.keys(byDate).sort().map(function (k) { return byDate[k]; });
  }

  function normalizeDay(raw) {
    raw = raw || {};
    var date = isoDate(raw.date);
    var time = clip(raw.time, 80);
    if (!time) time = formatSpan(raw.start, raw.end);
    if (!time && raw.start) time = formatSpan(raw.start, '');
    return { date: date, time: time };
  }

  function parseUsAddress(raw) {
    var text = clip(raw, 1000);
    if (!text) return { location: '', hostAddress: '', city: '', state: '', zip: '', isVirtual: false, raw: '' };
    if (/^virtual\b/i.test(text) && text.length < 80) {
      return { location: 'Virtual', hostAddress: '', city: '', state: '', zip: '', isVirtual: true, raw: text };
    }
    var m = text.match(/^(.*?)(?:,|\n)\s*([^,\n]+?),\s*([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)?\s*$/);
    if (m) {
      return {
        location: m[1].trim(),
        hostAddress: m[1].trim(),
        city: m[2].trim(),
        state: m[3].toUpperCase(),
        zip: m[4] || '',
        isVirtual: false,
        raw: text
      };
    }
    var tail = text.match(/^(.*?)[,\s]+([A-Za-z]{2})\s+(\d{5}(?:-\d{4})?)\s*$/);
    if (tail && tail[1].trim()) {
      return {
        location: tail[1].trim(),
        hostAddress: tail[1].trim(),
        city: '',
        state: tail[2].toUpperCase(),
        zip: tail[3] || '',
        isVirtual: false,
        raw: text
      };
    }
    return { location: text, hostAddress: text, city: '', state: '', zip: '', isVirtual: false, raw: text };
  }

  function splitPrices(catalog, orgRaw) {
    var org = money(orgRaw);
    if (org == null) return null;
    var family = money(catalog - org);
    if (family == null || family <= 0 || org <= 0) return null;
    var familyInt = Math.round(family);
    if (familyInt <= 0 || familyInt >= catalog) return null;
    return { familyPrice: familyInt, orgPortion: money(catalog - familyInt) };
  }

  function parsePortion(text, catalog) {
    var t = String(text || '').trim();
    if (!t || catalog == null) return null;
    var pct = t.match(/(\d+(?:\.\d+)?)\s*%/);
    if (pct || /\bpercent\b/i.test(t)) {
      var p = pct ? Number(pct[1]) : NaN;
      if (!(p > 0 && p < 100)) return null;
      return splitPrices(catalog, catalog * (p / 100));
    }
    var dol = t.match(/\$?\s*(\d+(?:\.\d+)?)/);
    if (!dol) return null;
    return splitPrices(catalog, Number(dol[1]));
  }

  function mapBilling(input) {
    input = input || {};
    var catalog = input.catalogPrice;
    var orgName = clip(input.orgName, 200);
    var count = parseInt(input.expectedCount, 10);
    var headcount = isFinite(count) && count > 0 ? count : null;
    if (input.kind === 'host') {
      return {
        resolved: true,
        mode: 'host_families',
        priceOverride: null,
        billToOrg: null,
        orgPortion: null,
        billedHeadcount: null,
        hasHost: true,
        isPrivate: true
      };
    }
    var mode = String(input.billing || '').trim();
    if (mode === 'org_full_external' || mode === 'org_full_link') {
      if (!orgName || catalog == null) return { resolved: false, mode: mode, reason: 'billing' };
      return {
        resolved: true,
        mode: mode,
        priceOverride: 0,
        billToOrg: orgName,
        orgPortion: catalog,
        billedHeadcount: headcount,
        hasHost: false,
        isPrivate: true
      };
    }
    if (mode === 'individual') {
      return {
        resolved: true,
        mode: mode,
        priceOverride: null,
        billToOrg: null,
        orgPortion: null,
        billedHeadcount: null,
        hasHost: false,
        isPrivate: true
      };
    }
    if (mode === 'split') {
      var split = parsePortion(input.portionText, catalog);
      if (!orgName || !split) return { resolved: false, mode: mode, reason: 'billing' };
      return {
        resolved: true,
        mode: mode,
        priceOverride: split.familyPrice,
        billToOrg: orgName,
        orgPortion: split.orgPortion,
        billedHeadcount: headcount,
        hasHost: false,
        isPrivate: true
      };
    }
    return { resolved: false, mode: mode, reason: 'billing' };
  }

  function collectDays(body) {
    var days = [];
    if (Array.isArray(body.days)) {
      body.days.forEach(function (d) {
        var n = normalizeDay(d);
        if (n.date) days.push(n);
      });
    }
    if (!days.length && body.datesText) days = parseDaysFromText(body.datesText);
    if (!days.length && body.date) {
      var one = normalizeDay({ date: body.date, time: body.time, start: body.startTime, end: body.endTime });
      if (one.date) days.push(one);
    }
    var byDate = {};
    days.forEach(function (d) {
      if (!byDate[d.date] || (!byDate[d.date].time && d.time)) byDate[d.date] = d;
    });
    return Object.keys(byDate).sort().map(function (k) { return byDate[k]; });
  }

  function normalizeSubmission(body) {
    body = body || {};
    var kind = body.kind === 'organization' ? 'organization' : (body.kind === 'host' ? 'host' : '');
    var course = courseByKey(body.courseKey);
    var place = parseUsAddress(body.address || body.location || '');
    if (course && course.virtual) place.isVirtual = true;
    if (body.format === 'virtual') place.isVirtual = true;
    if (place.isVirtual) {
      if (!place.location || /^virtual$/i.test(place.location)) place.location = 'Virtual';
    }
    var days = collectDays(body);
    var catalog = course && course.price != null ? course.price : null;
    var billing = mapBilling({
      kind: kind,
      billing: body.billing,
      orgName: body.organizationName,
      portionText: body.portionText,
      catalogPrice: catalog,
      expectedCount: body.expectedCount
    });
    return {
      kind: kind,
      honeypot: clip(body.companyWebsite || body.company_website, 200),
      forOrganization: !!body.forOrganization,
      course: course,
      courseKey: course ? course.key : clip(body.courseKey, 80),
      days: days,
      place: place,
      isVirtual: !!place.isVirtual,
      billing: billing,
      name: clip(body.name, 200),
      email: clip(body.email, 200),
      phone: clip(body.phone, 40),
      organizationName: clip(body.organizationName, 200),
      referral: clip(body.referral, 300),
      expectedCount: clip(body.expectedCount, 20),
      checklistAnswer: clip(body.checklistAnswer, 80),
      checklistQuestions: clip(body.checklistQuestions, 2000),
      food: clip(body.food, 40),
      specialInstructions: clip(body.specialInstructions, 4000),
      badge: clip(body.badge, 300),
      instructorRequest: clip(body.instructorRequest, 200),
      parking: clip(body.parking, 2000),
      arrival: clip(body.arrival, 4000),
      participantInfo: clip(body.participantInfo, 4000),
      customRequest: clip(body.customRequest, 4000),
      portionText: clip(body.portionText, 200),
      av: Array.isArray(body.av) ? body.av.map(function (x) { return clip(x, 80); }).filter(Boolean).slice(0, 8) : [],
      datesText: clip(body.datesText, 4000)
    };
  }

  function validEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  function validate(n) {
    var errors = [];
    function add(field, message) { errors.push({ field: field, message: message }); }
    if (n.honeypot) return [{ field: 'companyWebsite', message: 'spam' }];
    if (n.kind !== 'host' && n.kind !== 'organization') add('kind', 'Choose the host form or the organization form.');
    if (n.kind === 'host' && n.forOrganization) {
      return [{ field: 'forOrganization', message: 'Organization requests use the organization form.', redirect: '/organization.html' }];
    }
    if (!n.name) add('name', 'Please add your name.');
    if (!validEmail(n.email)) add('email', 'Please add a valid email address.');
    if ((n.phone.match(/\d/g) || []).length < 7) add('phone', 'Please add a phone number.');
    if (!n.course) add('courseKey', 'Please choose a course.');
    if (n.kind === 'organization' && !n.organizationName) add('organizationName', 'Please add the organization name.');
    if (!n.place.raw && !n.isVirtual) add('address', 'Please add the address or choose virtual.');
    if (n.kind === 'host' && !n.checklistAnswer) add('checklistAnswer', 'Please answer the hosting checklist.');
    if (n.kind === 'organization' && !n.billing.mode) add('billing', 'Please choose how registration and payment should work.');
    if (n.kind === 'organization' && n.billing.mode === 'split' && !n.portionText) {
      add('portionText', 'Please say how much of the cost your organization will cover per participant.');
    }
    return errors;
  }

  function canCreateSession(n) {
    if (!n || !n.course || n.course.placeholder || !n.course.course) return { ok: false, reason: 'course' };
    if (!n.days || !n.days.length || !n.days[0].date) return { ok: false, reason: 'date' };
    if (!n.days[0].time) return { ok: false, reason: 'time' };
    if (!n.isVirtual && !(n.place && (n.place.raw || n.place.location))) return { ok: false, reason: 'location' };
    if (!n.billing || !n.billing.resolved) return { ok: false, reason: 'billing' };
    return { ok: true };
  }

  function datedCode(abbr, dateStr) {
    var p = String(dateStr || '').split('-');
    if (p.length !== 3) return abbr + '-NODATE';
    return abbr + '-' + p[0].slice(-2) + p[1] + p[2];
  }

  function uniqueCode(base, existing) {
    var taken = {};
    (existing || []).forEach(function (c) { if (c) taken[String(c).toUpperCase()] = true; });
    if (!taken[base.toUpperCase()]) return base;
    for (var i = 1; i < 26; i++) {
      var c = base + String.fromCharCode(65 + i);
      if (!taken[c.toUpperCase()]) return c;
    }
    var n = 2;
    var next;
    do { next = base + '-' + (n++); } while (taken[next.toUpperCase()]);
    return next;
  }

  function longDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  }

  function shortDate(iso) {
    if (!iso) return '';
    var d = new Date(iso + 'T12:00:00');
    if (isNaN(d.getTime())) return iso;
    return d.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  }

  function dollars(n) {
    if (n == null || n === '') return '';
    var x = Number(n);
    if (!isFinite(x)) return '';
    if (Math.round(x) === x) return '$' + x;
    return '$' + x.toFixed(2);
  }

  function foodSentence(food) {
    if (food === 'full-meal') return 'I will provide a full meal for participants.';
    if (food === 'snacks') return 'I will provide snacks and drinks only; participants should pack a meal.';
    if (food === 'na') return 'This course does not have a meal time.';
    return '';
  }

  function instructorNotes(n) {
    var lines = [];
    lines.push('From the class request form.');
    if (n.organizationName) lines.push('Organization: ' + n.organizationName);
    if (n.expectedCount) lines.push('Expected participants: ' + n.expectedCount);
    if (n.badge) lines.push('Girl Scout badge: ' + n.badge);
    if (n.instructorRequest) lines.push('Instructor request: ' + n.instructorRequest);
    if (n.billing && n.billing.mode) lines.push('Billing: ' + billingSentence(n));
    var meal = foodSentence(n.food);
    if (meal) lines.push('Food: ' + meal);
    if (n.checklistAnswer === 'questions' && n.checklistQuestions) lines.push('Host checklist questions: ' + n.checklistQuestions);
    else if (n.checklistAnswer === 'yes') lines.push('Host confirmed the home can meet the hosting checklist.');
    else if (n.checklistAnswer === 'virtual-na') lines.push('Virtual class — home hosting checklist marked N/A.');
    if (n.av && n.av.length) lines.push('AV on site: ' + n.av.join(', '));
    if (n.parking) lines.push('Parking: ' + n.parking);
    if (n.arrival) lines.push('Arrival and access: ' + n.arrival);
    if (n.participantInfo) lines.push('For participants: ' + n.participantInfo);
    if (n.specialInstructions) lines.push('Special instructions: ' + n.specialInstructions);
    if (n.customRequest) lines.push('Custom request: ' + n.customRequest);
    return lines.join('\n').slice(0, 4000);
  }

  function billingSentence(n) {
    var b = n.billing || {};
    var price = n.course && n.course.price != null ? n.course.price : null;
    if (b.mode === 'host_families') return 'Families pay the regular price. The home host receives one free registration.';
    if (b.mode === 'org_full_external') return 'Organization covers the full cost (' + dollars(price) + ' per participant) and handles registration. Invoice the organization. Family checkout is $0.';
    if (b.mode === 'org_full_link') return 'Organization covers the full cost (' + dollars(price) + ' per participant). Participants use the private Mindful Beginnings link at no charge. Invoice the organization.';
    if (b.mode === 'individual') return 'Participants pay individually on the private link' + (price != null ? ' (' + dollars(price) + ' each)' : '') + '.';
    if (b.mode === 'split') return 'Split billing. Families pay ' + dollars(b.priceOverride) + '. Organization is invoiced ' + dollars(b.orgPortion) + ' per participant.';
    return 'Billing still needs a decision before a session can be created.';
  }

  function adminNotes(n, requestId) {
    var lines = [];
    if (requestId) lines.push('Class request ' + requestId);
    if (n.referral) lines.push('Referral: ' + n.referral);
    lines.push(billingSentence(n));
    if (n.datesText) lines.push('Dates as written: ' + n.datesText);
    return lines.join('\n').slice(0, 4000);
  }

  function buildSessionRow(n, existingCodes, ids) {
    var gate = canCreateSession(n);
    if (!gate.ok) return { created: false, reason: gate.reason };
    ids = ids || {};
    var days = n.days.slice().sort(function (a, b) { return a.date < b.date ? -1 : a.date > b.date ? 1 : 0; });
    var first = days[0];
    var extra = days.slice(1);
    var base = datedCode(n.course.abbr, first.date);
    var code = uniqueCode(base, existingCodes);
    var place = n.place || {};
    var location = place.location || (n.isVirtual ? 'Virtual' : null);
    if (n.kind === 'host' && !n.isVirtual) location = place.city || 'Host home';
    var hostAddress = n.isVirtual ? null : (place.hostAddress || place.raw || null);
    var id = ids.id || null;
    var row = {
      id: id,
      code: code,
      course: n.course.course,
      date: first.date,
      time: first.time,
      location: location,
      host_address: hostAddress,
      city: place.city || null,
      state: place.state || null,
      zip: place.zip || null,
      contact_name: n.name || null,
      host_phone: n.phone || null,
      contact_day: n.kind === 'organization' ? (n.name + (n.phone ? ', ' + n.phone : '')) : null,
      owner_taught: false,
      host_taken: false,
      has_host: !!n.billing.hasHost,
      instructor_id: null,
      notes: instructorNotes(n),
      additional_costs: [],
      created_at: ids.createdAt || Date.now(),
      wifi_info: null,
      price_override: n.billing.priceOverride == null ? null : n.billing.priceOverride,
      is_virtual: !!n.isVirtual,
      zoom_link: null,
      is_custom_job: false,
      is_hold: false,
      is_private: true,
      allow_waitlist: true,
      is_cancelled: false,
      bill_to_org: n.billing.billToOrg || null,
      billed_headcount: n.billing.billedHeadcount == null ? null : n.billing.billedHeadcount,
      org_portion: n.billing.orgPortion == null ? null : n.billing.orgPortion,
      extra_dates: extra.map(function (d) { return d.date; }),
      extra_days: extra.map(function (d) { return { date: d.date, time: d.time || '' }; }),
      requires_rn: !!n.course.requiresRN,
      requires_safe_sitter: !!n.course.requiresSS,
      admin_private_notes: adminNotes(n, ids.requestId),
      instructor_info: n.instructorRequest ? ('Requested instructor: ' + n.instructorRequest) : null,
      max_students_override: null
    };
    return { created: true, row: row };
  }

  function firstName(full) {
    var t = String(full || '').trim();
    if (!t) return '';
    return t.split(/\s+/)[0].replace(/,$/, '');
  }

  function dateSummary(days) {
    if (!days || !days.length) return { long: 'To be confirmed', short: 'the date we confirm', time: 'To be confirmed' };
    var longs = days.map(function (d) {
      return longDate(d.date) + (d.time ? ', ' + d.time : '');
    });
    var times = days.map(function (d) { return d.time || ''; }).filter(Boolean);
    var sameTime = times.length && times.every(function (t) { return t === times[0]; });
    return {
      long: days.map(function (d) { return longDate(d.date); }).join('; '),
      detail: longs.join('\n'),
      short: shortDate(days[0].date),
      time: sameTime ? times[0] : (times.length ? 'See each date' : 'To be confirmed')
    };
  }

  function regLink(code) {
    if (!code) return PUBLIC_ORIGIN + '/register.html';
    return PUBLIC_ORIGIN + '/register.html?code=' + encodeURIComponent(code);
  }

  function opsApi() {
    if (root && root.MBOpsEmails) return root.MBOpsEmails;
    if (typeof require === 'function') {
      try { return require('./admin-ops-emails.js'); } catch (e) { return null; }
    }
    return null;
  }

  function paymentParagraph(n, code) {
    var b = n.billing || {};
    var price = n.course && n.course.price != null ? dollars(n.course.price) : 'the course price';
    var link = regLink(code);
    if (b.mode === 'org_full_external') {
      return 'Payment: your organization is covering the full cost (' + price + ' per participant) and handling registration. Participants sign up through you at no charge. I will invoice the organization after the course. There is no family payment link for this class.';
    }
    if (b.mode === 'org_full_link') {
      return 'Payment: your organization is covering the full cost (' + price + ' per participant). Participants register on this private link at no charge, and I will invoice the organization after the course.\nRegistration link: ' + link;
    }
    if (b.mode === 'individual') {
      return 'Payment: each participant registers and pays on this private link (' + price + ' per participant).\nRegistration link: ' + link;
    }
    if (b.mode === 'split') {
      return 'Payment: each participant pays ' + dollars(b.priceOverride) + ' at registration. I will invoice the organization ' + dollars(b.orgPortion) + ' per participant after the course.\nRegistration link: ' + link;
    }
    return 'Payment: I still need to confirm the billing arrangement before I send a registration link.';
  }

  function buildDraft(n, session) {
    var code = session && session.code ? session.code : '';
    var when = dateSummary(n.days);
    var to = n.email || '';
    var place = n.isVirtual ? 'Virtual' : ((n.place && (n.place.raw || n.place.location)) || 'To be confirmed');
    if (n.kind === 'host') {
      var ops = opsApi();
      var price = n.course && n.course.price != null ? dollars(n.course.price) : '';
      var info = {
        course: (n.course && n.course.course) || 'your Mindful Beginnings course',
        dateLong: when.long,
        dateShort: when.short,
        time: when.time,
        address: place,
        instructor: n.instructorRequest || '',
        code: code || 'To be confirmed',
        hostFirst: firstName(n.name) || 'there',
        mealText: foodSentence(n.food),
        priceText: price,
        regLink: code ? regLink(code) : PUBLIC_ORIGIN + '/register.html',
        hasHostSpot: true
      };
      var letter = ops ? ops.draft('hostLetter', info) : { subject: 'Hosting your course', body: '' };
      var body = letter.body || '';
      var extras = [];
      if (n.days.length > 1) {
        extras.push('Additional dates:\n' + n.days.slice(1).map(function (d) {
          return longDate(d.date) + (d.time ? ', ' + d.time : '');
        }).join('\n'));
      }
      if (n.checklistQuestions) extras.push('Your checklist questions: ' + n.checklistQuestions);
      if (n.specialInstructions) extras.push('Notes you sent: ' + n.specialInstructions);
      if (extras.length && body.indexOf("Please don't hesitate") >= 0) {
        body = body.replace("Please don't hesitate", extras.join('\n\n') + "\n\nPlease don't hesitate");
      } else if (extras.length) {
        body += '\n\n' + extras.join('\n\n');
      }
      if (!code) {
        body += '\n\nI will send the registration link as soon as the date is confirmed.';
      }
      return {
        to: to,
        subject: letter.subject || ('Hosting your ' + info.course + ' course'),
        body: body,
        field: 'to'
      };
    }
    var who = firstName(n.name) || 'there';
    var org = n.organizationName || 'your organization';
    var courseName = (n.course && n.course.course) || (n.course && n.course.label) || 'your course';
    var lines = [];
    lines.push('Hi ' + who + ',');
    lines.push('');
    lines.push('Thank you for sending the site information for ' + org + '. I have the details for ' + courseName + ' and I am glad we get to bring this class to your group.');
    lines.push('');
    lines.push('Course: ' + courseName);
    if (n.badge) lines.push('Girl Scout badge: ' + n.badge);
    lines.push('Dates: ' + when.long);
    if (n.days.length > 1) lines.push(when.detail);
    lines.push('Time: ' + when.time);
    lines.push('Location: ' + place);
    if (n.expectedCount) lines.push('Participants expected: ' + n.expectedCount);
    if (code) lines.push('Session code: ' + code);
    lines.push(paymentParagraph(n, code));
    if (n.instructorRequest) lines.push('Instructor request: ' + n.instructorRequest + ' — I will confirm who is teaching as we get closer.');
    else lines.push('I will share your instructor\'s name as we get closer to the date.');
    var notes = [];
    if (n.parking) notes.push('Parking: ' + n.parking);
    if (n.arrival) notes.push('Arrival: ' + n.arrival);
    if (n.participantInfo) notes.push('For participants: ' + n.participantInfo);
    if (n.av && n.av.length) notes.push('AV you have on site: ' + n.av.join(', '));
    if (n.customRequest) notes.push('Custom request: ' + n.customRequest);
    if (notes.length) {
      lines.push('');
      lines.push('What I have on file:');
      notes.forEach(function (line) { lines.push(line); });
    }
    lines.push('');
    lines.push('Please reply if the room, the headcount, or a date changes. I am always happy to help and want this to be a wonderful experience for everyone.');
    lines.push('');
    lines.push('Warmly,');
    lines.push('Lindsay');
    lines.push('Mindful Beginnings');
    return {
      to: to,
      subject: courseName + ' at ' + org,
      body: lines.join('\n'),
      field: 'to'
    };
  }

  function checklistAfterSubmit(sessionCreated, draftReady) {
    return applyChecklistUpdate(blankChecklist(), {
      session_created: !!sessionCreated,
      draft_ready: !!draftReady
    });
  }

  function openRequestCount(rows) {
    return (rows || []).filter(function (r) {
      var c = r.checklist || r;
      return !c.archived && !c.done;
    }).length;
  }

  var api = {
    PUBLIC_ORIGIN: PUBLIC_ORIGIN,
    LINDSAY_EMAIL: LINDSAY_EMAIL,
    COURSES: COURSES,
    BILLING_OPTIONS: BILLING_OPTIONS,
    courseByKey: courseByKey,
    coursesFor: coursesFor,
    courseOptionLabel: courseOptionLabel,
    blankChecklist: blankChecklist,
    statusFromChecklist: statusFromChecklist,
    STATUS_LABELS: STATUS_LABELS,
    applyChecklistUpdate: applyChecklistUpdate,
    parseDaysFromText: parseDaysFromText,
    parseTimeRange: parseTimeRange,
    formatSpan: formatSpan,
    parseUsAddress: parseUsAddress,
    parsePortion: parsePortion,
    mapBilling: mapBilling,
    normalizeSubmission: normalizeSubmission,
    validate: validate,
    canCreateSession: canCreateSession,
    datedCode: datedCode,
    uniqueCode: uniqueCode,
    buildSessionRow: buildSessionRow,
    buildDraft: buildDraft,
    checklistAfterSubmit: checklistAfterSubmit,
    billingSentence: billingSentence,
    longDate: longDate,
    regLink: regLink,
    openRequestCount: openRequestCount,
    firstName: firstName
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBClassRequests = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
