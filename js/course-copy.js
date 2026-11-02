/* Course-family copy for the family registration page and reminder emails.
   Safe Sitter courses keep the Safe Sitter wording. American Red Cross
   courses get Red Cross wording and never mention Safe Sitter. Every other
   course gets generic Mindful Beginnings wording: no other brand, and no
   certification claim. User-facing strings do not use em dashes. */
(function (root) {
  'use strict';

  var SAFE_SITTER_ACCOMMODATIONS = 'A great deal of information is presented in a short period of time during the Safe Sitter® course. We want every child to succeed, and we will work with you to make alternate plans if your child has difficulty keeping up. Please let us know if there is anything we should know to help your child succeed. If your child needs accommodations, please let the Instructor or Site Coordinator know as soon as possible. <strong>Please note:</strong> Safe Sitter® does not provide CPR certification, release the names of graduates, or act as a referral source of babysitters.';

  var RED_CROSS_ACCOMMODATIONS = 'A great deal of information is presented in a short period of time during this American Red Cross course. We want every participant to succeed and will work with you on alternate plans if your child has difficulty keeping up. Please let us know anything that will help your child succeed, and tell the Instructor or Site Coordinator about any accommodations as soon as possible. Participants who successfully complete the course receive an American Red Cross digital certificate (including CPR/First Aid when part of the course).';

  var GENERIC_ACCOMMODATIONS = 'A great deal of information is presented in a short period of time during this course. We want every participant to succeed, and we will work with you to make alternate plans if your child has difficulty keeping up. Please let us know if there is anything we should know to help your child succeed. If your child needs accommodations, please let the Instructor or Site Coordinator know as soon as possible.';

  var SS_CHILD_RELEASE = 'I acknowledge that there may be a risk of injury involved in course activities. I agree to release, hold harmless, and indemnify Safe Sitter, Inc. and Mindful Beginnings and their staff from any and all claims arising from my child\'s participation.';
  var SS_ADULT_RELEASE = 'I acknowledge that there may be a risk of injury involved in course activities. I agree to release, hold harmless, and indemnify Safe Sitter, Inc. and Mindful Beginnings and their staff from any and all claims arising from my participation in this program.';
  var MB_CHILD_RELEASE = 'I acknowledge that there may be a risk of injury involved in course activities. I agree to release, hold harmless, and indemnify Mindful Beginnings and their staff from any and all claims arising from my child\'s participation.';
  var MB_ADULT_RELEASE = 'I acknowledge that there may be a risk of injury involved in course activities. I agree to release, hold harmless, and indemnify Mindful Beginnings and their staff from any and all claims arising from my participation in this program.';

  var SS_CERT = 'This course provides a Safe Sitter® certificate of completion. Formal CPR certification is not included.';
  var RC_CERT = 'Participants who successfully complete the course receive an American Red Cross digital certificate (including CPR/First Aid when part of the course).';
  var SS_REMINDER_CERT = 'Upon successful completion of the course, each participant will receive an official Safe Sitter® Certificate of Completion.';

  var SS_CPR_NOTICE = '<strong>📋 Please note:</strong> Your child will practice CPR and rescue skills on manikins during this course. <strong>This course does not provide CPR certification.</strong> Upon successful completion, your child will receive a Safe Sitter® certificate of completion.';
  var RC_CPR_NOTICE = '<strong>📋 Please note:</strong> Participants who successfully complete this American Red Cross course receive an American Red Cross digital certificate (including CPR/First Aid when part of the course).';
  var GENERIC_CPR_NOTICE = '<strong>📋 Please note:</strong> Please tell the Instructor or Site Coordinator about anything that will help your child take part.';

  var SS_MANIKIN = 'Safe Sitter® includes practice of rescue skills on CPR manikins. Manikins require strict standards for controlling infection. Do you give permission for your child to practice on the manikins?';
  var GENERIC_MANIKIN = 'This course includes practice of rescue skills on CPR manikins. Manikins require strict standards for controlling infection. Do you give permission for your child to practice on the manikins?';

  function courseName(course) {
    return String(course || '').trim();
  }

  function courseTable(courses) {
    if (courses && typeof courses === 'object') return courses;
    if (typeof root.COURSES === 'object' && root.COURSES) return root.COURSES;
    return null;
  }

  function courseConfig(course, courses) {
    var table = courseTable(courses);
    var name = courseName(course);
    if (!table || !name) return null;
    return table[name] || null;
  }

  function isIntroBabysitting(name) {
    return name === 'Intro to Babysitting'
      || name.indexOf('Intro to Babysitting ') === 0
      || name.indexOf('Intro to Babysitting—') === 0
      || name.indexOf('Intro to Babysitting-') === 0;
  }

  function isRedCrossCourse(course, courses) {
    var name = courseName(course);
    var cfg = courseConfig(name, courses);
    if (cfg && cfg.redCross) return true;
    if (/red cross/i.test(name)) return true;
    if (/babysitter['’]s training/i.test(name)) return true;
    if (/adult\s*&\s*pediatric first aid\/cpr\/aed/i.test(name)) return true;
    if (/adult first aid\/cpr\/aed/i.test(name)) return true;
    if (/basic life support|\(bls\)/i.test(name)) return true;
    if (/group cpr certification/i.test(name)) return true;
    return false;
  }

  function isSafeSitterCourse(course, courses) {
    var name = courseName(course);
    if (!name || isRedCrossCourse(name, courses)) return false;
    var cfg = courseConfig(name, courses);
    if (cfg && cfg.requiresSafeSitter) return true;
    if (name === 'Grandparents: Getting Started') return true;
    if (/safe\s*sitter/i.test(name)) return true;
    if (isIntroBabysitting(name)) return true;
    return false;
  }

  function family(course, courses) {
    if (isRedCrossCourse(course, courses)) return 'red-cross';
    if (isSafeSitterCourse(course, courses)) return 'safe-sitter';
    return 'other';
  }

  function accommodationsHtml(course, courses) {
    var kind = family(course, courses);
    if (kind === 'safe-sitter') return SAFE_SITTER_ACCOMMODATIONS;
    if (kind === 'red-cross') return RED_CROSS_ACCOMMODATIONS;
    return GENERIC_ACCOMMODATIONS;
  }

  function releaseText(course, adult, courses) {
    var sitter = family(course, courses) === 'safe-sitter';
    if (adult) return sitter ? SS_ADULT_RELEASE : MB_ADULT_RELEASE;
    return sitter ? SS_CHILD_RELEASE : MB_CHILD_RELEASE;
  }

  function certificationText(course, courses) {
    var kind = family(course, courses);
    if (kind === 'safe-sitter') return SS_CERT;
    if (kind === 'red-cross') return RC_CERT;
    return '';
  }

  function cprNoticeHtml(course, courses) {
    var kind = family(course, courses);
    if (kind === 'safe-sitter') return SS_CPR_NOTICE;
    if (kind === 'red-cross') return RC_CPR_NOTICE;
    return GENERIC_CPR_NOTICE;
  }

  function manikinPermissionText(course, courses) {
    if (family(course, courses) === 'safe-sitter') return SS_MANIKIN;
    return GENERIC_MANIKIN;
  }

  function reminderCertificationLine(course, courses) {
    var kind = family(course, courses);
    if (kind === 'safe-sitter') return SS_REMINDER_CERT;
    if (kind === 'red-cross') return RC_CERT;
    return '';
  }

  var api = {
    SAFE_SITTER_ACCOMMODATIONS: SAFE_SITTER_ACCOMMODATIONS,
    RED_CROSS_ACCOMMODATIONS: RED_CROSS_ACCOMMODATIONS,
    GENERIC_ACCOMMODATIONS: GENERIC_ACCOMMODATIONS,
    family: family,
    isRedCrossCourse: isRedCrossCourse,
    isSafeSitterCourse: isSafeSitterCourse,
    accommodationsHtml: accommodationsHtml,
    releaseText: releaseText,
    certificationText: certificationText,
    cprNoticeHtml: cprNoticeHtml,
    manikinPermissionText: manikinPermissionText,
    reminderCertificationLine: reminderCertificationLine
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBCourseCopy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
