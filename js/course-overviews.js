/* Per-course overview copy for family-facing drafts.
   Keyed by the course name in config.js / admin.html COURSES.
   A session title that starts with a known course still matches, so a
   troop-specific custom title can use the same overview.
   Nothing here sends email. ADMIN asks for the text when it builds a draft.
   urlFor() maps a course to its public overview page (the hidden
   course-overviews pages built from the Drive overview docs), so the
   family reminder, the host letter, and the host-forward draft can each
   carry the course's own overview link. Courses with no overview page
   return '' and the drafts simply leave the line out. */
(function (root) {
  'use strict';

  var OVERVIEWS = {
    // Source: "First Aid Badge Workshop - Course Overview" (Drive).
    // The 60-minute workshop is the default. The $45 figure is the guide
    // price; a troop split is entered on the session, not here.
    'Girl Scouts — First Aid Badge Workshop': {
      audience: 'Girl Scout Brownies through Ambassadors (First Aid badge at each level)',
      length: '60-minute hands-on workshop',
      taughtBy: 'a registered nurse',
      learn: [
        'Check–Call–Care, and how to use it when someone is hurt',
        'When and how to call 911, including a call script and naming one person to make the call',
        'How to build or pack a first aid kit',
        'How to treat minor injuries with real supplies: scrapes, nosebleeds, burns, bee stings, and basic sprains',
        'One outdoor or urgent skill matched to their badge level',
        'A staged-injury scenario, from the first check through care'
      ],
      included: [
        'All supplies for the hands-on practice',
        'A student handout for every scout',
        'A written badge-step completion summary for the troop leader after class'
      ],
      notCertification: 'This is educational, hands-on practice. It is not a CPR or First Aid certification course, and it does not issue a certification card.',
      badgeCredit: 'The troop leader confirms which badge steps were completed and buys the badges. Mindful Beginnings does not issue Girl Scout badges and does not claim Girl Scouts of the USA (GSUSA) endorsement.'
    }
  };

  function overviewFor(course) {
    var name = String(course || '').trim();
    if (!name) return null;
    if (OVERVIEWS[name]) return OVERVIEWS[name];
    var keys = Object.keys(OVERVIEWS);
    var i;
    for (i = 0; i < keys.length; i++) {
      if (name.indexOf(keys[i]) === 0) return OVERVIEWS[keys[i]];
    }
    return null;
  }

  function textFor(course) {
    var o = overviewFor(course);
    if (!o) return '';
    var lines = [];
    lines.push('Who it is for: ' + o.audience);
    var length = o.length || '';
    if (o.taughtBy) length += (length ? ', taught by ' : 'Taught by ') + o.taughtBy;
    if (length) lines.push('Length: ' + length);
    lines.push('');
    lines.push('What scouts will learn and do:');
    (o.learn || []).forEach(function (item) { lines.push('• ' + item); });
    lines.push('');
    lines.push('What is included:');
    (o.included || []).forEach(function (item) { lines.push('• ' + item); });
    if (o.notCertification) {
      lines.push('');
      lines.push(o.notCertification);
    }
    if (o.badgeCredit) {
      lines.push('');
      lines.push('Badge credit: ' + o.badgeCredit);
    }
    return lines.join('\n');
  }

  var OVERVIEW_BASE = 'https://mindfulbeginnings.org/course-overviews/';
  var OVERVIEW_URLS = {
    'Safe Sitter® Grandparents': 'grandparents-getting-started',
    'Safe Sitter® Babysitting': 'safe-sitter-babysitting',
    'Safe Sitter®': 'safe-sitter-babysitting',
    'Intro to Babysitting': 'intro-to-safe-babysitting',
    'Introduction to Safe Babysitting': 'intro-to-safe-babysitting',
    'Safe@Home': 'safe-at-home',
    'Social Ready': 'social-ready',
    'Stay Ready': 'stay-ready',
    'Steady and Ready': 'steady-and-ready',
    'Safe & Ready Families': 'safe-and-ready-families',
    'All Kids Welcome': 'all-kids-welcome',
    'Season Ready': 'season-ready',
    'Ready. Period.': 'ready-period',
    'Baby Ready': 'baby-ready',
    'Care Ready': 'care-ready',
    'My First Babysitters Club': 'my-first-babysitters-club',
    'Little Medics': 'little-medics',
    'Girl Scouts — First Aid Badge Workshop': 'first-aid-badge-workshop'
  };

  function normName(s) {
    return String(s || '').toLowerCase()
      .replace(/[®™'’]/g, '')
      .replace(/\s+/g, ' ')
      .trim();
  }

  var URL_KEYS = Object.keys(OVERVIEW_URLS).sort(function (a, b) {
    return normName(b).length - normName(a).length;
  });

  var SPANISH_OVERVIEW = {
    'safe & ready families': 'safe-and-ready-families-es'
  };

  function urlForLang(course, lang) {
    var name = normName(course);
    if (lang === 'es' && SPANISH_OVERVIEW[name]) return OVERVIEW_BASE + SPANISH_OVERVIEW[name];
    return urlFor(course);
  }

  function urlFor(course) {
    var name = normName(course);
    if (!name) return '';
    // The club overview describes the multi-week series. The single-session
    // workshop version has no overview page.
    if (name.indexOf('my first babysitters club') === 0
        && /single session|workshop/.test(name)) return '';
    if (name.indexOf('first aid badge') !== -1) {
      return OVERVIEW_BASE + 'first-aid-badge-workshop';
    }
    for (var i = 0; i < URL_KEYS.length; i++) {
      var key = normName(URL_KEYS[i]);
      if (name === key || name.indexOf(key) === 0) {
        return OVERVIEW_BASE + OVERVIEW_URLS[URL_KEYS[i]];
      }
    }
    return '';
  }

  var api = {
    OVERVIEWS: OVERVIEWS,
    OVERVIEW_URLS: OVERVIEW_URLS,
    overviewFor: overviewFor,
    textFor: textFor,
    urlFor: urlFor,
    urlForLang: urlForLang
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBCourseOverviews = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
