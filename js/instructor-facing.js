/* Instructor-facing session text.
   Directions and the older instructor_info column are the only note text
   an instructor may see. Session notes, private notes, and client billing
   stay out of this string. This file does not read or write the database. */
(function (root) {
  'use strict';

  var PRIVATE_MARKERS = [
    'notes',
    'admin_private_notes',
    'adminPrivateNotes',
    'price_override',
    'priceOverride',
    'org_portion',
    'orgPortion',
    'bill_to_org',
    'billToOrg',
    'billed_headcount',
    'billedHeadcount',
    'fee_received',
    'feeReceived',
    'additional_costs',
    'additionalCosts',
    'hold_payment',
    'holdPayment',
    'grant_tag',
    'grantTag',
    'discount_code',
    'price_paid',
    'pricePaid',
    'payment_method',
    'payment_ref',
    'payment_detail',
    'paypal_tx_id'
  ];

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function pushUnique(list, value) {
    var t = text(value);
    if (!t) return;
    if (list.some(function (item) { return item === t; })) return;
    list.push(t);
  }

  // Verified instructor directions only. Generic session notes are not included.
  function directionsText(session) {
    var parts = [];
    var row = session || {};
    pushUnique(parts, row.instructorDirections != null ? row.instructorDirections : row.instructor_directions);
    pushUnique(parts, row.instructorInfo != null ? row.instructorInfo : row.instructor_info);
    return parts.join('\n\n');
  }

  // Structured class-request fields that are logistics, not a free-text note.
  function directionsFromRequest(request) {
    var n = request || {};
    var lines = [];
    if (n.parking) lines.push('Parking: ' + n.parking);
    if (n.arrival) lines.push('Arrival and access: ' + n.arrival);
    if (n.av && n.av.length) lines.push('AV on site: ' + n.av.join(', '));
    if (n.foodText) lines.push('Food: ' + n.foodText);
    return lines.join('\n').slice(0, 20000);
  }

  function containsPrivateMarker(value, markers) {
    var hay = text(value).toLowerCase();
    if (!hay) return false;
    return (markers || []).some(function (marker) {
      return hay.indexOf(String(marker).toLowerCase()) !== -1;
    });
  }

  var api = {
    PRIVATE_MARKERS: PRIVATE_MARKERS,
    directionsText: directionsText,
    directionsFromRequest: directionsFromRequest,
    containsPrivateMarker: containsPrivateMarker
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBInstructorFacing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
