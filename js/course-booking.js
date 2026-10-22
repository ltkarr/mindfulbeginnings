/* ════════════════════════════════════════════════════════════════════════
   Course booking rules shared by register.html, admin.html, and
   instructor.html.

   seatsPerRegistration is how many people one saved registration holds.
   Capacity (maxStudents, overrides, remaining seats) is always in people.
   register_student() in the database still counts registration rows, so
   the register page passes the people cap as p_max. One registration is
   one person.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var ADULT_COURSES = {
    'Grandparents: Getting Started': true,
    'Safe Sitter® Grandparents: Getting Started': true,
    'Care Ready': true,
    'Baby Ready': true,
    'Baby Ready + CPR Certification': true,
    'Babysitting Grandkids Workshop': true,
    'Adult First Aid/CPR/AED Certification': true,
    'Basic Life Support (BLS) Certification': true,
    'Group CPR Certification for Workplaces': true
  };

  function courseConfig(course, courses) {
    var name = String(course || '');
    var cfg = courses || (typeof root.COURSES === 'object' ? root.COURSES : null);
    return (cfg && cfg[name]) || null;
  }

  function isAdultCourse(course, courses) {
    var name = String(course || '');
    var cfg = courseConfig(name, courses);
    if (cfg && cfg.adult) return true;
    return !!ADULT_COURSES[name];
  }

  function seatsPerRegistration(course, courses) {
    var name = String(course || '');
    var cfg = courseConfig(name, courses);
    var n = cfg && Number(cfg.seatsPerRegistration);
    if (isFinite(n) && n >= 1) return Math.floor(n);
    return 1;
  }

  function seatsUsed(regCount, course, courses) {
    var n = Number(regCount);
    if (!isFinite(n) || n < 0) n = 0;
    return n * seatsPerRegistration(course, courses);
  }

  function seatsRemaining(peopleCap, regCount, course, courses) {
    var cap = Number(peopleCap);
    if (!isFinite(cap)) return null;
    return Math.max(0, cap - seatsUsed(regCount, course, courses));
  }

  // True when one more registration of this course still fits in the people cap.
  function bookingFits(peopleCap, regCount, course, courses) {
    var left = seatsRemaining(peopleCap, regCount, course, courses);
    if (left == null) return true;
    return left >= seatsPerRegistration(course, courses);
  }

  // register_student compares a row count to p_max. A couple course passes a
  // smaller max so each row consumes seatsPerRegistration people.
  function registrationRowCap(peopleCap, course, courses) {
    var cap = Number(peopleCap);
    var per = seatsPerRegistration(course, courses);
    if (!isFinite(cap)) return cap;
    if (per <= 1) return cap;
    return Math.max(0, Math.floor(cap / per));
  }

  function partnerNameOf(reg) {
    if (!reg) return '';
    var direct = reg.partnerName || reg.partner_name || '';
    if (String(direct).trim()) return String(direct).trim();
    var m = String(reg.notes || '').match(/\[Partner:\s*([^\]]+)\]/i);
    return m ? m[1].trim() : '';
  }

  function participantNames(reg) {
    var primary = String((reg && (reg.studentName || reg.student_name)) || '').trim();
    var partner = partnerNameOf(reg);
    var out = [];
    if (primary) out.push(primary);
    if (partner && partner.toLowerCase() !== primary.toLowerCase()) out.push(partner);
    return out;
  }

  // One saved registration is one person. A partner name stored on an older
  // row is still shown on the roster, and it does not take a second seat.
  function peopleCount(regs, course, courses) {
    var list = regs || [];
    return list.length;
  }

  function notesWithoutPartner(notes) {
    return String(notes || '').replace(/\[Partner:\s*[^\]]*\]\s*/gi, '').trim();
  }

  function notesWithPartner(notes, partner) {
    var base = notesWithoutPartner(notes);
    var name = String(partner || '').trim();
    if (!name) return base;
    return ('[Partner: ' + name + ']' + (base ? ' ' + base : '')).trim();
  }

  var api = {
    ADULT_COURSES: ADULT_COURSES,
    isAdultCourse: isAdultCourse,
    seatsPerRegistration: seatsPerRegistration,
    seatsUsed: seatsUsed,
    seatsRemaining: seatsRemaining,
    bookingFits: bookingFits,
    registrationRowCap: registrationRowCap,
    partnerNameOf: partnerNameOf,
    participantNames: participantNames,
    peopleCount: peopleCount,
    notesWithoutPartner: notesWithoutPartner,
    notesWithPartner: notesWithPartner
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBCourseBooking = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
