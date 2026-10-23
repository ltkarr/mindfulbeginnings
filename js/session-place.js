/* ════════════════════════════════════════════════════════════════════════
   Where a class happens, for admin and the instructor portal.

   Private host sessions often store a generic sessions.location such as
   "Host home". The street is host_address, with city / state / zip beside it.
   These helpers show that street instead of the generic label, and keep a
   real venue name when there is one (library, troop house, camp).

   The public registration page does not load this file. Parent-facing copy
   stays on the stored location string.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  function field(s, camel, snake) {
    if (!s) return '';
    var v = s[camel];
    if (v == null || String(v).trim() === '') v = s[snake];
    return String(v == null ? '' : v).trim();
  }

  function isGenericHostLabel(label) {
    var n = String(label || '')
      .replace(/['’]/g, '')
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    return n === 'host home' || n === 'hosts home' || n === 'host house'
      || n === 'private home' || n === 'private host' || n === 'home host';
  }

  function regionLine(s) {
    var city = field(s, 'city', 'city');
    var state = field(s, 'state', 'state');
    var zip = field(s, 'zip', 'zip');
    var cityState = [city, state].filter(Boolean).join(', ');
    return (cityState + (zip ? ' ' + zip : '')).trim();
  }

  function describe(session) {
    var s = session || {};
    var virtual = !!(s.isVirtual || s.is_virtual);
    var zoom = field(s, 'zoomLink', 'zoom_link');
    if (virtual) {
      return {
        virtual: true,
        generic: false,
        primary: 'Virtual (Zoom)',
        secondary: zoom,
        plain: 'Virtual (Zoom)',
        mapsUrl: '',
        venue: '',
        street: ''
      };
    }

    var location = field(s, 'location', 'location');
    var street = field(s, 'hostAddress', 'host_address');
    var city = field(s, 'city', 'city');
    var region = regionLine(s);
    var generic = isGenericHostLabel(location);
    var locationIsCity = !!(location && city && location.toLowerCase() === city.toLowerCase());
    var hideLocation = generic || (locationIsCity && !!street);
    var venue = hideLocation ? '' : location;
    var address = [street, region].filter(Boolean).join(', ');
    var primary = '';
    var secondary = '';

    if (venue && address && address.toLowerCase().indexOf(venue.toLowerCase()) === -1 && venue.toLowerCase() !== street.toLowerCase()) {
      primary = venue;
      secondary = address;
    } else if (street || address) {
      primary = address || street;
      secondary = '';
    } else if (venue && region && venue.toLowerCase().indexOf(city.toLowerCase()) === -1) {
      primary = venue;
      secondary = region;
    } else {
      primary = [venue, region].filter(Boolean).join(', ');
      secondary = '';
    }

    var parts = [];
    if (venue && !(city && venue.toLowerCase() === city.toLowerCase() && region)) parts.push(venue);
    if (street && parts.join(', ').toLowerCase().indexOf(street.toLowerCase()) === -1) parts.push(street);
    if (region && parts.join(', ').toLowerCase().indexOf(region.toLowerCase()) === -1) parts.push(region);
    var plain = parts.join(', ');

    var mapsQuery = '';
    if (street) mapsQuery = [street, region].filter(Boolean).join(', ');
    else if (venue && /\d/.test(venue)) mapsQuery = [venue, region].filter(Boolean).join(', ');
    else if (venue && city && !generic && venue.toLowerCase() !== city.toLowerCase()) {
      mapsQuery = [venue, region].filter(Boolean).join(', ');
    }
    var mapsUrl = mapsQuery
      ? ('https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapsQuery))
      : '';

    return {
      virtual: false,
      generic: generic,
      primary: primary,
      secondary: secondary,
      plain: plain,
      mapsUrl: mapsUrl,
      venue: venue,
      street: street
    };
  }

  function plain(session) {
    var d = describe(session);
    if (d.virtual) return 'Virtual (Zoom)';
    return d.plain;
  }

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function html(session, opts) {
    opts = opts || {};
    var d = describe(session);
    if (d.virtual) return escapeHtml('Virtual');
    var text = d.plain;
    if (!text) return opts.empty || '';
    if (opts.link && d.mapsUrl) {
      var cls = opts.linkClass || opts.className || 'loc-map';
      return '<a class="' + escapeHtml(cls) + '" href="' + escapeHtml(d.mapsUrl) + '" target="_blank" rel="noopener noreferrer">' + escapeHtml(text) + '</a>';
    }
    return escapeHtml(text);
  }

  function mapsUrl(session) {
    return describe(session).mapsUrl;
  }

  var api = {
    isGenericHostLabel: isGenericHostLabel,
    describe: describe,
    plain: plain,
    html: html,
    mapsUrl: mapsUrl
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBSessionPlace = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
