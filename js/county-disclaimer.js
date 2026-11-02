/* Montgomery County disclaimer on public registration.
   Schools (School, Elementary, Middle, High, MCPS) and any Edgemoor
   venue or address show the line. A session can force it on or off. */
(function (root) {
  'use strict';

  var TEXT = 'This activity is not sponsored, associated with, or endorsed by Montgomery County Government';
  var SCHOOL = /\b(school|elementary|middle|high|mcps)\b/i;
  var EDGEMOOR = /edgemoor/i;

  function venueText(session) {
    if (!session) return '';
    return [session.location, session.hostAddress, session.host_address, session.city]
      .map(function (part) { return String(part || '').trim(); })
      .filter(Boolean)
      .join(' ');
  }

  function venueMatches(session) {
    var text = venueText(session);
    return SCHOOL.test(text) || EDGEMOOR.test(text);
  }

  // true = always show, false = hide, null = follow the venue rule.
  function overrideFlag(session) {
    if (!session) return null;
    if (session.countyDisclaimer === true || session.countyDisclaimer === false) return session.countyDisclaimer;
    if (session.county_disclaimer === true || session.county_disclaimer === false) return session.county_disclaimer;
    return null;
  }

  function shows(session) {
    var flag = overrideFlag(session);
    if (flag === true) return true;
    if (flag === false) return false;
    return venueMatches(session);
  }

  function html() {
    return '<p class="county-disclaimer">' + TEXT + '</p>';
  }

  var api = {
    TEXT: TEXT,
    venueText: venueText,
    venueMatches: venueMatches,
    shows: shows,
    html: html
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBCountyDisclaimer = api;
})(typeof window !== 'undefined' ? window : globalThis);
