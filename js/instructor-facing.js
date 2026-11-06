/* What an instructor portal may keep from a session payload.
   Full directions, street address, and session pay fields are kept only
   when this viewer is the assigned instructor or the second instructor.
   instructor_info and generic notes are never kept. A cancelled session
   or a stale job row is not a current claim. Own pay stays only for the
   instructor who currently holds the job. */
(function (root) {
  'use strict';

  function text(value) {
    return String(value == null ? '' : value).trim();
  }

  function sameId(a, b) {
    var left = text(a);
    var right = text(b);
    return !!left && left === right;
  }

  function assignedTo(session, viewerId) {
    var row = session || {};
    var id = row.instructorId != null ? row.instructorId : row.instructor_id;
    var second = row.secondInstructorId != null ? row.secondInstructorId : row.second_instructor_id;
    return sameId(id, viewerId) || sameId(second, viewerId);
  }

  // Release clears both session instructor ids. A job_data row alone, a
  // waitlist entry, or a cancelled session is not enough.
  function currentClaim(session, viewerId) {
    var row = session || {};
    if (row.isCancelled === true || row.is_cancelled === true) return false;
    return assignedTo(row, viewerId);
  }

  // Mirrors private.is_portal_admin(). The authenticated role is not enough.
  function portalAdmin(actor) {
    var who = actor || {};
    if (who.role === 'service_role') return true;
    if (who.role !== 'authenticated') return false;
    if (who.appRole === 'admin') return true;
    return who.userId === '402193d8-a9b7-4a7b-bdbb-b939c08dbd6d';
  }

  // Only the dedicated directions column. Never instructor_info or notes.
  function directionsText(session) {
    var row = session || {};
    if (row.instructorDirections != null) return text(row.instructorDirections);
    return text(row.instructor_directions);
  }

  function clearPay(session) {
    session.instrPayOverride = null;
    session.teachingHours = null;
    session.paidTravelHours = null;
  }

  // App-side guard for both rollout orders. A wide legacy payload is reduced
  // here. A narrow SQL payload is left narrow.
  function restrictToViewer(session, viewerId) {
    var row = session || {};
    var mine = currentClaim(row, viewerId);
    row.notes = '';
    row.instructorInfo = '';
    row.instructor_info = '';
    if (!mine) {
      row.instructorDirections = '';
      row.instructor_directions = '';
      row.hostAddress = '';
      row.host_address = '';
      clearPay(row);
    }
    [
      'adminPrivateNotes', 'admin_private_notes',
      'priceOverride', 'price_override',
      'orgPortion', 'org_portion',
      'billToOrg', 'bill_to_org',
      'billedHeadcount', 'billed_headcount',
      'feeReceived', 'fee_received',
      'holdPayment', 'hold_payment',
      'additionalCosts', 'additional_costs',
      'originationNote', 'origination_note',
      'grantTag', 'grant_tag'
    ].forEach(function (key) {
      if (Object.prototype.hasOwnProperty.call(row, key)) delete row[key];
    });
    return row;
  }

  // A partner label is a person's name. Anything with a digit, a currency
  // mark, or a billing word is rejected whole. The stored note is not edited.
  function partnerDisplayName(value) {
    var raw = text(value);
    if (!raw) return '';
    if (/[$0-9]/.test(raw)) return '';
    if (/\b(invoice|payment|paid|rate|billing|bill|discount|venmo|zelle|paypal|balance|receipt|subsidy|agreement)\b/i.test(raw)) return '';
    if (/^[A-Za-z]{2,40}$/.test(raw)) return raw;
    if (/^[A-Za-z][A-Za-z .'\u2019-]{0,78}[A-Za-z]$/.test(raw)) return raw;
    return '';
  }

  // Mirrors instructor_cancel_job. A second instructor assigned only in
  // second_instructor_id cannot release; the office removes that assignment.
  // A primary release clears only that caller's own ids and leaves pay fields.
  function releaseAssignment(state, callerId) {
    var session = Object.assign({}, (state && state.session) || {});
    var job = Object.assign({}, (state && state.job) || {});
    var paidFee = job.paidFee;
    var payStatus = job.payStatus;
    var referralBonus = job.referralBonus;
    var primary = session.instructorId || null;
    var second = session.secondInstructorId || null;
    var jobInstructor = job.instructorId || null;
    var secondOnly = second === callerId && primary !== callerId && jobInstructor !== callerId;
    if (!callerId || secondOnly || (jobInstructor !== callerId && primary !== callerId)) {
      return { ok: false, session: session, job: job };
    }
    if (jobInstructor === callerId) job.instructorId = null;
    if (primary === callerId) session.instructorId = null;
    if (second === callerId) session.secondInstructorId = null;
    job.paidFee = paidFee;
    job.payStatus = payStatus;
    job.referralBonus = referralBonus;
    return { ok: true, session: session, job: job };
  }

  var api = {
    assignedTo: assignedTo,
    currentClaim: currentClaim,
    portalAdmin: portalAdmin,
    releaseAssignment: releaseAssignment,
    directionsText: directionsText,
    restrictToViewer: restrictToViewer,
    partnerDisplayName: partnerDisplayName
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBInstructorFacing = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
