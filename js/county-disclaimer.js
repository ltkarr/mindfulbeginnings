/* Montgomery County disclaimer on public registration.
   The line shows only when the session is explicitly set to show.
   An unset flag stays hidden, including the old school and Edgemoor rule. */
(function (root) {
  'use strict';

  var TEXT = 'This activity is not sponsored, associated with, or endorsed by Montgomery County Government';

  function shows(session) {
    if (!session) return false;
    return session.countyDisclaimer === true || session.county_disclaimer === true;
  }

  function html() {
    return '<p class="county-disclaimer">' + TEXT + '</p>';
  }

  var api = {
    TEXT: TEXT,
    shows: shows,
    html: html
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBCountyDisclaimer = api;
})(typeof window !== 'undefined' ? window : globalThis);
