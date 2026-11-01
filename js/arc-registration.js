/* American Red Cross registration copy for register.html.
   Mindful Beginnings policy is ages 13 and up for Adult & Pediatric
   First Aid/CPR/AED. The Red Cross does not set a national minimum age
   for standard First Aid/CPR/AED; the participant must be able to perform
   the skills. https://www.redcross.org/take-a-class/resources/articles/what-to-expect-wear-bring-red-cross-cpr-aed-class
   User-facing strings in this file do not use em dashes. */
(function (root) {
  'use strict';

  var MIN_AGE = 13;
  var SIGNATURE_LABEL = 'Participant full name (electronic signature), or parent/guardian if participant is under 18 *';
  var CEUS_URL = 'https://www.redcross.org/take-a-class/certificates-ceus';

  function courseName(course) {
    return String(course || '');
  }

  function isArcAdultPediatricCourse(course) {
    return /adult\s*&\s*pediatric first aid\/cpr\/aed/i.test(courseName(course));
  }

  function isArcAdultOnlyCourse(course) {
    var name = courseName(course);
    return /adult first aid\/cpr\/aed/i.test(name) && !isArcAdultPediatricCourse(name);
  }

  function isArcBlsCourse(course) {
    return /basic life support|\(bls\)/i.test(courseName(course));
  }

  function isArcWaiverCourse(course) {
    return isArcAdultPediatricCourse(course) || isArcAdultOnlyCourse(course) || isArcBlsCourse(course);
  }

  function isArcBlendedCourse(course) {
    return isArcWaiverCourse(course) && /\(online \+ classroom\)|\(hybrid\)/i.test(courseName(course));
  }

  function showsCertificationLine(course, courses) {
    var name = courseName(course);
    var table = courses || (typeof root.COURSES === 'object' ? root.COURSES : null);
    var cfg = table && table[name];
    if (cfg && cfg.redCross) return true;
    if (isArcWaiverCourse(name)) return true;
    if (/red cross babysitter/i.test(name)) return true;
    if (/^babysitter's training$/i.test(name)) return true;
    return false;
  }

  function parseISODate(value) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(value || '').trim());
    if (!m) return null;
    var y = Number(m[1]);
    var mo = Number(m[2]);
    var d = Number(m[3]);
    if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
    var dt = new Date(Date.UTC(y, mo - 1, d));
    if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return null;
    return { y: y, m: mo, d: d };
  }

  function todayISO(now) {
    var d = now ? new Date(now) : new Date();
    if (isNaN(d.getTime())) d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function ageOnDate(dob, onDate) {
    var born = parseISODate(dob);
    var on = parseISODate(onDate);
    if (!born || !on) return null;
    var age = on.y - born.y;
    if (on.m < born.m || (on.m === born.m && on.d < born.d)) age -= 1;
    return age;
  }

  function ageCheck(dob, sessionDate) {
    var raw = String(dob || '').trim();
    if (!raw) return { ok: false, age: null, message: "Enter the participant's date of birth." };
    if (!parseISODate(raw)) return { ok: false, age: null, message: 'Enter a valid date of birth.' };
    var on = parseISODate(sessionDate) ? String(sessionDate).trim() : todayISO();
    var age = ageOnDate(raw, on);
    if (age == null || age < 0 || age > 120) return { ok: false, age: age, message: 'Enter a valid date of birth.' };
    if (age < MIN_AGE) {
      return {
        ok: false,
        age: age,
        message: 'Participants must be at least 13 years old on the session date. Mindful Beginnings does not enroll anyone younger in this course.'
      };
    }
    return { ok: true, age: age, message: '' };
  }

  function p(text) {
    return '<p>' + text + '</p>';
  }

  // Official Adult and Pediatric First Aid/CPR/AED blended learning description.
  var BL_DESCRIPTION = 'The American Red Cross Adult and Pediatric First Aid/CPR/AED blended learning course equips students to recognize and care for a variety of first aid, breathing, and cardiac emergencies involving adults, children, and infants. It is designed for students who need a certification that satisfies OSHA workplace or other regulatory requirements. This class is taught in a blended learning format and the online portion (accessed via mobile, desktop, or tablet) must be completed prior to attending the instructor-led skills session. Upon successful completion, a valid 2-year digital certificate for Adult and Pediatric First Aid/CPR/AED is issued.';
  var DIGITAL_CERTIFICATION = 'Red Cross courses offer Digital Certification, an online version of a Red Cross certificate, which provides anytime, anywhere access to student training history and course certificates. Digital certificates can be viewed, printed or shared online and can be accessed anytime through your Red Cross Account. Each certificate includes a unique ID and a QR code which meets employment requirements and allows employers to easily confirm your certificate is valid. There is no need to carry your printed certificate around anymore!';
  var CEUS_LINE = 'For more information about continuing education and CEUs, please visit';
  var EMAIL_LINE = 'After you register, Mindful Beginnings will email the Red Cross online portion link.';

  function digitalCertificationParagraph() {
    return p(DIGITAL_CERTIFICATION);
  }

  function blendedList() {
    return '<p><strong>Online + Classroom</strong></p><ul>' +
      '<li>Combines the flexibility of online training with instructor-led skills check</li>' +
      '<li>Start taking your online portion immediately</li>' +
      '<li>Convenient locations and times</li>' +
      '</ul>';
  }

  function courseNoticeHtml(course, opts) {
    var name = courseName(course);
    var blended = isArcBlendedCourse(name);
    var parts = [];
    if (isArcAdultPediatricCourse(name) && blended) {
      parts.push(p('2 hours online self-paced plus 2 hours in person. ' + BL_DESCRIPTION));
    } else if (isArcAdultPediatricCourse(name)) {
      parts.push(p('This American Red Cross course prepares participants to recognize and care for a variety of first aid, breathing, and cardiac emergencies involving adults, children, and infants. It satisfies OSHA workplace or other regulatory requirements. Upon successful completion, a valid 2-year digital certificate for Adult and Pediatric First Aid/CPR/AED is issued.'));
    } else if (isArcAdultOnlyCourse(name) && blended) {
      parts.push(p('2 hours online self-paced plus 2 hours in person. The American Red Cross Adult First Aid/CPR/AED blended learning course equips students to recognize and care for a variety of first aid, breathing, and cardiac emergencies. It is designed for students who need a certification that satisfies OSHA workplace or other regulatory requirements. This class is taught in a blended learning format and the online portion (accessed via mobile, desktop, or tablet) must be completed prior to attending the instructor-led skills session. Upon successful completion, a valid 2-year digital certificate for Adult First Aid/CPR/AED is issued.'));
    } else if (isArcAdultOnlyCourse(name)) {
      parts.push(p('This American Red Cross course prepares participants to recognize and care for a variety of first aid, breathing, and cardiac emergencies. It satisfies OSHA workplace or other regulatory requirements. Upon successful completion, a valid 2-year digital certificate for Adult First Aid/CPR/AED is issued.'));
    } else if (isArcBlsCourse(name) && blended) {
      parts.push(p('2 hours online self-paced plus 2 hours in person. This American Red Cross Basic Life Support (BLS) course is taught in a blended learning format and the online portion must be completed prior to attending the instructor-led skills session. Upon successful completion, a valid 2-year digital certificate is issued.'));
    } else if (isArcBlsCourse(name)) {
      parts.push(p('This American Red Cross Basic Life Support (BLS) course is for healthcare providers. Upon successful completion, a valid 2-year digital certificate is issued.'));
    }
    if (blended) parts.push(blendedList());
    parts.push(digitalCertificationParagraph());
    parts.push('<p>' + CEUS_LINE + ' <a href="' + CEUS_URL + '" target="_blank" rel="noopener noreferrer">' + CEUS_URL + '</a>.</p>');
    if (blended) parts.push(p(EMAIL_LINE));
    if (isArcWaiverCourse(name)) {
      parts.push(p('Mindful Beginnings sessions for this course are for participants ages 13 and up.'));
    }
    var cap = opts && Number(opts.maxStudents);
    if (isFinite(cap) && cap > 0 && cap < 1000) {
      parts.push(p('This session is limited to ' + cap + ' participants.'));
    }
    return parts.join('');
  }

  function liabilityHtml() {
    return '<p><strong>Liability acknowledgment.</strong> I (the participant if 18 or older, or the parent or legal guardian if the participant is under 18) understand that hands-on skills practice carries a risk of injury. I voluntarily accept those risks, whether known or unknown. In exchange for participation, I release, waive, hold harmless, and indemnify Mindful Beginnings LLC and its owner, instructors, employees, contractors, and agents from claims arising out of or related to participation in this course or later use of skills learned, except to the extent caused by gross negligence or willful misconduct.</p>';
  }

  var api = {
    MIN_AGE: MIN_AGE,
    SIGNATURE_LABEL: SIGNATURE_LABEL,
    CEUS_URL: CEUS_URL,
    isArcAdultPediatricCourse: isArcAdultPediatricCourse,
    isArcAdultOnlyCourse: isArcAdultOnlyCourse,
    isArcBlsCourse: isArcBlsCourse,
    isArcWaiverCourse: isArcWaiverCourse,
    isArcBlendedCourse: isArcBlendedCourse,
    showsCertificationLine: showsCertificationLine,
    parseISODate: parseISODate,
    ageOnDate: ageOnDate,
    ageCheck: ageCheck,
    courseNoticeHtml: courseNoticeHtml,
    liabilityHtml: liabilityHtml
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBArcRegistration = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
