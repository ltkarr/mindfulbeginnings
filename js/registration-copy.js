/* ════════════════════════════════════════════════════════════════════════
   Virtual vs in-person registration copy (register.html)

   In-person waivers stay in register.html and still switch on course name.
   A session with is_virtual / isVirtual uses this copy instead: a live
   one-hour Zoom class, no manikin or CPR-practice consent, and no
   classroom-only permissions. Course substance that still applies online
   (Ready. Period. puberty education, Season Ready general education) is kept.
   ════════════════════════════════════════════════════════════════════════ */
(function (root) {
  'use strict';

  var PERIOD = 'Ready. Period.';
  var SEASON = 'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes';
  var CAMPUS = 'Campus Ready: Safety Skills for College Life';
  var STAY = 'Stay Ready: Choking Rescue and CPR';

  var ADULT_COURSES = {
    'Grandparents: Getting Started': true,
    'Care Ready': true,
    'Baby Ready': true
  };

  var IN_PERSON_TERM_IDS = [
    'terms-standard',
    'terms-grandparent',
    'terms-campus-ready',
    'terms-season-ready',
    'terms-ready-period'
  ];

  function sessionIsVirtual(session) {
    if (!session) return false;
    var v = session.isVirtual != null ? session.isVirtual : session.is_virtual;
    return v === true || v === 'true' || v === 1 || v === '1';
  }

  function isAdultCourse(course) {
    var name = String(course || '');
    if (root.MBCourseBooking && typeof root.MBCourseBooking.isAdultCourse === 'function') {
      return !!root.MBCourseBooking.isAdultCourse(name);
    }
    return !!ADULT_COURSES[name];
  }

  function para(title, body) {
    return '<p><strong>' + title + '</strong> ' + body + '</p>';
  }

  function stripTags(html) {
    return String(html || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function instructorPhrase(course) {
    if (course === PERIOD || course === SEASON || course === CAMPUS || course === STAY) {
      return 'taught by a registered nurse';
    }
    return 'taught by a certified teacher or registered nurse';
  }

  function introSentence(course, adult) {
    var who = adult
      ? 'You join from home.'
      : (course === CAMPUS ? 'The participant joins from home.' : 'Your child joins from home.');
    return 'This is a live, one-hour class on Zoom, ' + instructorPhrase(course) + '. ' + who + ' There is no in-person attendance and no hands-on practice.';
  }

  function photoConsentText(course, adult) {
    if (adult || course === CAMPUS) {
      return 'I consent to the use of photos or recordings from this live Zoom class for publicity purposes by Mindful Beginnings.';
    }
    return 'I consent to the use of photos or recordings of my child from this live Zoom class for publicity purposes by Mindful Beginnings.';
  }

  function releaseParagraph(course, adult) {
    if (course === PERIOD) {
      return para('Release and indemnification.', 'In exchange for participation, I, the undersigned parent or legal guardian, release, waive, hold harmless, and indemnify Mindful Beginnings LLC and its owner, instructors, employees, contractors, and agents from any and all claims, demands, liabilities, costs, and causes of action arising out of or related to participation in this workshop, except to the extent caused by gross negligence or willful misconduct.');
    }
    if (course === SEASON) {
      return para('Release and indemnification.', 'In exchange for participation, I, the undersigned (the participant if eighteen years of age or older, or the parent or legal guardian if the participant is under eighteen), release, waive, hold harmless, and indemnify Mindful Beginnings LLC and its owner, instructors, employees, contractors, and agents from any and all claims, demands, liabilities, costs, and causes of action arising out of or related to participation in this workshop or to any later use of or reliance on anything learned in it, except to the extent caused by gross negligence or willful misconduct.');
    }
    if (course === CAMPUS) {
      return para('Release and indemnification.', 'In exchange for participation, I, the undersigned (the participant if eighteen years of age or older, or the parent or legal guardian if the participant is under eighteen), release, waive, hold harmless, and indemnify Mindful Beginnings LLC and its owner, instructors, employees, contractors, and agents from any and all claims, demands, liabilities, costs, and causes of action arising out of or related to participation in this class or to any later use of or reliance on anything learned in it, except to the extent caused by gross negligence or willful misconduct.');
    }
    if (adult) {
      return para('Risk acknowledgment and release of liability.', 'I acknowledge that there may be a risk of injury involved in course activities. I agree to release, hold harmless, and indemnify Safe Sitter, Inc. and Mindful Beginnings and their staff from any and all claims arising from my participation in this program.');
    }
    return para('Risk acknowledgment and release of liability.', 'I acknowledge that there may be a risk of injury involved in course activities. I agree to release, hold harmless, and indemnify Safe Sitter, Inc. and Mindful Beginnings and their staff from any and all claims arising from my child\'s participation.');
  }

  function courseParagraphs(course) {
    var parts = [];
    if (course === PERIOD) {
      parts.push(para('What this workshop is.', 'Ready. Period. is a puberty and period preparation workshop taught by a registered nurse. It is general health education for a group. It is not a medical appointment, it is not a diagnosis or treatment plan, and it is not a substitute for the guidance of the participant\'s own physician. Families should consult the participant\'s own healthcare provider about that participant\'s individual health.'));
      parts.push(para('Course content.', 'I understand that this workshop openly discusses puberty, menstruation, body changes, hygiene, and emotional changes, and that I have chosen to enroll the participant with that understanding.'));
    } else if (course === SEASON) {
      parts.push(para('What this workshop is.', 'Season Ready is a live Zoom class on safety, fueling, and injury prevention for student athletes, taught by a registered nurse. It is general education for a group. It is not a certification course.'));
      parts.push(para('General information, not medical or nutrition advice.', 'The information given about fueling, hydration, sleep, warmups, and injury is general education for a group. It is not individualized medical, nutrition, or athletic-training advice, it is not a diagnosis or treatment plan, and it is not a substitute for the guidance of the participant\'s own physician, dietitian, athletic trainer, or coach. The workshop does not involve calorie counting, weigh-ins, or any assessment of an individual participant\'s body or diet. Families should consult the participant\'s own healthcare provider about that participant\'s individual needs.'));
      parts.push(para('No duty to act.', 'This workshop creates no obligation for the participant to act in any situation. Any decision to help, or to use anything learned in this workshop, in a real emergency is the participant\'s alone and is made voluntarily and at the participant\'s own risk. The participant should always call 911 and defer to professional responders. Mindful Beginnings LLC is not responsible for anything the participant does or does not do, or for any outcome.'));
    } else if (course === CAMPUS) {
      parts.push(para('Educational only.', 'Campus Ready: Safety Skills for College Life is a brief safety class taught by a registered nurse. It is educational only and is designed to build the participant\'s awareness and confidence. It is not a certification course and does not certify, license, or qualify the participant in any medical or emergency procedure. Completing the class does not make the participant a trained, certified, or professional responder.'));
      parts.push(para('No duty to act.', 'This class creates no obligation for the participant to act in any situation. Any decision to help, or to use anything learned in this class, in a real emergency is the participant\'s alone and is made voluntarily and at the participant\'s own risk. The participant should always call 911 and defer to professional responders. Mindful Beginnings LLC is not responsible for anything the participant does or does not do, or for any outcome.'));
    } else if (course === STAY) {
      parts.push(para('Prerequisite confirmation.', 'My child has taken the Safe Sitter® Babysitting Course and/or a CPR and First Aid course previously.'));
    }
    return parts.join('');
  }

  function participationParagraph(course, adult) {
    if (adult) {
      return para('I can participate.', 'I confirm that I am able to participate in this live Zoom class.');
    }
    if (course === CAMPUS || course === SEASON) {
      return para('The participant can take part.', 'I certify that to the best of my knowledge the participant is able to participate in this live Zoom class.');
    }
    return para('My child can participate.', 'I certify that to the best of my knowledge my child is able to participate in this live Zoom class.');
  }

  function virtualRegistrationCopy(session) {
    if (!sessionIsVirtual(session)) return null;
    var course = String(session.course || '');
    var adult = isAdultCourse(course);
    var who = adult ? 'you' : ((course === CAMPUS || course === SEASON) ? 'the participant' : 'your child');
    var waiverHtml = [
      para('What this class is.', introSentence(course, adult)),
      para('Disruptive student policy.', 'A disruptive student can be removed from the Zoom.'),
      courseParagraphs(course),
      releaseParagraph(course, adult),
      participationParagraph(course, adult)
    ].join('');
    return {
      virtual: true,
      course: course,
      adult: adult,
      introHtml: '<strong>Live Zoom class.</strong> ' + introSentence(course, adult),
      accommodationsHtml: 'This is a live Zoom class. Please share anything that will help ' + who + ' take part online. If ' + who + (adult ? ' need' : ' needs') + ' accommodations, let the instructor know as soon as possible.',
      photoConsent: photoConsentText(course, adult),
      waiverHtml: waiverHtml,
      waiverText: stripTags(waiverHtml),
      hidePermissions: true,
      hideHost: true
    };
  }

  function applyRegistrationMode(session, doc) {
    var documentRef = doc || (typeof document !== 'undefined' ? document : null);
    if (!documentRef || typeof documentRef.getElementById !== 'function') return virtualRegistrationCopy(session);
    var copy = virtualRegistrationCopy(session);
    var notice = documentRef.getElementById('virtual-class-notice');
    var terms = documentRef.getElementById('terms-virtual');
    var perm = documentRef.getElementById('permissions-section');
    var emerg = documentRef.getElementById('emerg-perm-item');
    var cprItem = documentRef.getElementById('cpr-perm-item');
    var cprNotice = documentRef.getElementById('waiver-cpr-notice');
    var host = documentRef.getElementById('host-section');
    var accom = documentRef.getElementById('accom-notice');
    var photo = documentRef.getElementById('photo-consent-sub');
    var screen = documentRef.getElementById('screen-info');

    if (!copy) {
      if (notice) notice.style.display = 'none';
      if (terms) { terms.style.display = 'none'; terms.innerHTML = ''; }
      if (perm) perm.style.display = '';
      if (emerg) emerg.style.display = '';
      if (screen && screen.setAttribute) screen.setAttribute('data-registration-mode', 'in-person');
      return null;
    }

    if (notice) { notice.style.display = ''; notice.innerHTML = copy.introHtml; }
    if (terms) { terms.style.display = ''; terms.innerHTML = copy.waiverHtml; }
    IN_PERSON_TERM_IDS.forEach(function (id) {
      var el = documentRef.getElementById(id);
      if (el) el.style.display = 'none';
    });
    if (cprNotice) cprNotice.style.display = 'none';
    if (perm) perm.style.display = 'none';
    if (cprItem) cprItem.style.display = 'none';
    if (emerg) emerg.style.display = 'none';
    if (host) host.style.display = 'none';
    if (accom) accom.innerHTML = copy.accommodationsHtml;
    if (photo) photo.textContent = copy.photoConsent;
    if (screen && screen.setAttribute) screen.setAttribute('data-registration-mode', 'virtual');
    if (typeof documentRef.querySelectorAll === 'function') {
      var radios = documentRef.querySelectorAll('input[name="cpr-perm"], input[name="emerg-perm"]');
      for (var i = 0; i < radios.length; i++) radios[i].checked = false;
    }
    return copy;
  }

  var api = {
    PERIOD: PERIOD,
    SEASON: SEASON,
    CAMPUS: CAMPUS,
    STAY: STAY,
    sessionIsVirtual: sessionIsVirtual,
    virtualRegistrationCopy: virtualRegistrationCopy,
    applyRegistrationMode: applyRegistrationMode
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBRegistrationCopy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
