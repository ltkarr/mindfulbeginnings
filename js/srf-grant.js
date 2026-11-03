/* Safe & Ready Families grant questions and the three reporting counts.
   Wording matches the Evaluation and Follow-Up Survey Set. No email is sent
   from here. */
(function (root) {
  'use strict';

  var COURSE = 'Safe & Ready Families';
  var ORIGIN = 'https://mindfulbeginnings.org';

  var ROLES = [
    'Parent or stepparent',
    'Grandparent',
    'Other family caregiver (aunt, uncle, sibling, foster or kinship caregiver)',
    'Paid caregiver (nanny, respite worker, direct support professional)',
    'Teacher, therapist, or other professional',
    'Other'
  ];
  var CHILD_COUNTS = ['1', '2', '3 or more'];
  var CHILD_AGES = ['Under 3', '3 to 5', '6 to 10', '11 to 14', '15 to 18', '18 and over'];
  var CHILD_NEEDS = [
    'Autism',
    'Intellectual or developmental disability',
    'Down syndrome',
    'Cerebral palsy',
    'Epilepsy or seizure disorder',
    'Feeding or swallowing differences',
    'Uses a wheelchair or mobility device',
    'Nonspeaking or limited speech',
    'Other',
    'Prefer not to say'
  ];
  var PLAN_NOW = [
    'Yes, complete',
    'Partly, some pieces written down',
    'No, it is in my head'
  ];
  var HEAR = [
    'School or PTA',
    'Therapy practice',
    'Parent group or support group',
    'Social media',
    'Friend',
    'Other'
  ];
  var CONFIDENCE = [
    'Keep my child from wandering, and know what to do in the first five minutes if they do',
    'Keep my child safe around water at home and away from home',
    'Recognize choking in my child and respond, including any changes for my child\'s needs',
    'Start CPR on my child if they stopped breathing',
    'Use a picture routine or social story to teach my child a safety skill',
    'Give a first responder what they need to know about my child in thirty seconds',
    'Brief a babysitter or respite worker so I can leave with confidence'
  ];
  var OVERALL = [
    'Much more confident',
    'Somewhat more confident',
    'About the same',
    'Less confident'
  ];
  var SHEETS = [
    'Wandering Plan',
    'Water Safety Checklist',
    'Choking and CPR Quick Card',
    'Picture Routine',
    'Social Story',
    'About Me Sheet',
    'Babysitter and Respite Brief'
  ];
  var LIKERT = ['Strongly agree', 'Agree', 'Neutral', 'Disagree', 'Strongly disagree'];
  var LENGTHS = ['Too short', 'About right', 'Too long'];
  var CLASS_ROLES = [
    'Parent',
    'Grandparent',
    'Other family caregiver',
    'Paid caregiver',
    'Professional',
    'Other'
  ];
  var INTERESTS = [
    'Red Cross CPR/AED and First Aid certification',
    'Classes for my child',
    'Hosting a class for my group'
  ];
  var PLAN_LATER = [
    'Yes, both are complete',
    'Partly, one of the two is complete',
    'I started but have not finished either',
    'No, I have not started'
  ];
  var PLACES = [
    'Refrigerator',
    'Car',
    'School or bus',
    'A photo in my phone',
    'With my babysitter or respite worker',
    'Not posted yet'
  ];
  var ACTIONS = [
    'Added a door or window alarm, lock, or STOP sign',
    'Started a morning photo habit',
    'Got or updated an ID bracelet, tag, or GPS tracker',
    'Told neighbors about my child',
    'Registered with 911, Smart911, a premise alert, or a police registry',
    'Added a water barrier, alarm, or Water Watcher routine',
    'Asked about or started adaptive swim lessons',
    'Built and used a picture routine or social story',
    'Used the Babysitter and Respite Brief with a sitter, respite worker, or grandparent',
    'Took, or signed up for, a CPR certification class',
    'None of these yet'
  ];
  var MORE = { 'Much more confident': 1, 'Somewhat more confident': 1 };
  var CONSENT = 'I agree to receive a short follow-up survey by email about two months after class. My answers help Mindful Beginnings keep this class free for families.';
  var EMAIL_NOTE = 'Email address. REQUIRED. (We will send you your class reminder and two short surveys, one at class and one about two months later.)';
  var CLASS_DATE_Q = 'Which class date are you registering for? REQUIRED.';

  function isCourse(name) {
    return String(name || '').trim() === COURSE;
  }

  function surveyUrl(part, code) {
    var page = part === 'C' ? '/grant-followup.html' : '/grant-class-survey.html';
    var url = ORIGIN + page;
    var c = String(code || '').trim();
    if (c) url += '?code=' + encodeURIComponent(c);
    return url;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function radios(name, options, required) {
    return '<div class="choice-list"' + (required ? ' data-required="1"' : '') + '>' +
      options.map(function (opt, i) {
        return '<label class="choice-line"><input type="radio" name="' + name + '" value="' + esc(opt) + '"' +
          (required && i === 0 ? ' required' : '') + '> <span>' + esc(opt) + '</span></label>';
      }).join('') + '</div>';
  }

  function checks(name, options) {
    return '<div class="check-group">' + options.map(function (opt) {
      return '<label class="check-line"><input type="checkbox" name="' + name + '" value="' + esc(opt) + '"> <span>' + esc(opt) + '</span></label>';
    }).join('') + '</div>';
  }

  function scale(name) {
    var bits = '';
    for (var n = 1; n <= 5; n++) {
      bits += '<label><input type="radio" name="' + name + '" value="' + n + '"><span class="rate">' + n + '</span></label>';
    }
    return '<div class="rate-group">' + bits + '</div>';
  }

  function field(label, inner) {
    return '<div class="eval-field"><label class="eval-legend">' + label + '</label>' + inner + '</div>';
  }

  function textInput(name, placeholder) {
    return '<input type="text" name="' + name + '" placeholder="' + esc(placeholder || '') + '">';
  }

  function registrationHtml() {
    return '<h2>Grant registration questions</h2>' +
      '<p class="eval-note">Your name, email, mobile phone, and class date are the fields above.</p>' +
      '<p class="eval-note" id="srf-class-date">' + esc(CLASS_DATE_Q) + '</p>' +
      field('Which best describes you? REQUIRED. Choose one.', radios('srf-role', ROLES, true) + textInput('srf-role-other', 'Other')) +
      field('How many children with a disability do you care for? (1, 2, 3 or more)', radios('srf-count', CHILD_COUNTS, false)) +
      field('Age of the child or children you are planning for. Check all that apply.', checks('srf-ages', CHILD_AGES)) +
      field('Which of these describe your child? Check all that apply.', checks('srf-needs', CHILD_NEEDS) + textInput('srf-needs-other', 'Other')) +
      field('Do you currently have a written safety plan for your child that another adult could follow? REQUIRED.', radios('srf-plan', PLAN_NOW, true)) +
      field('What is the one safety worry you most want this class to address? (Short answer.)', '<textarea name="srf-worry"></textarea>') +
      field('Consent. REQUIRED. "' + esc(CONSENT) + '"', radios('srf-consent', ['Yes', 'No'], true)) +
      field('Do you need any accommodations to participate (seating, mobility, language, childcare question)? (Short answer.)', '<textarea name="srf-access"></textarea>') +
      field('How did you hear about this class?', radios('srf-hear', HEAR, false) + textInput('srf-hear-other', 'Other'));
  }

  function classSurveyHtml(session) {
    var when = session && session.date ? session.date : '';
    var rows = CONFIDENCE.map(function (line, i) {
      return '<div class="conf-row"><p>' + esc(line) + '</p>' +
        '<div><span class="conf-label">Before today</span>' + scale('srf-before-' + i) + '</div>' +
        '<div><span class="conf-label">Now</span>' + scale('srf-now-' + i) + '</div></div>';
    }).join('');
    return '<p class="eval-note">For each statement, choose one number for how you felt BEFORE today, and one for how you feel NOW. 1 = not at all confident, 5 = very confident.</p>' +
      field('Your email (so we can match this with your follow-up)', '<input type="email" name="srf-email" required>') +
      field('Class date', '<input type="date" name="srf-date" value="' + esc(when) + '">') +
      field('Instructor', textInput('srf-instructor', '')) +
      '<h2>Section 1 · Confidence, before and now</h2>' +
      '<p class="eval-note">I feel confident that I can...</p>' + rows +
      field('Overall, compared to before today, I feel: (choose one)', radios('srf-overall', OVERALL, true)) +
      '<h2>Section 2 · What you did today</h2>' +
      field('Which toolkit sheets did you start or finish in class? Check all that apply.', checks('srf-sheets', SHEETS)) +
      field('Which ONE sheet will you finish tonight?', textInput('srf-tonight', '')) +
      '<h2>Section 3 · The class</h2>' +
      field('The instructor explained things clearly:', radios('srf-clear', LIKERT, false)) +
      field('The hands-on practice was useful:', radios('srf-hands', LIKERT, false)) +
      field('The class respected my child and my family:', radios('srf-respect', LIKERT, false)) +
      field('The length (2.5 hours) was:', radios('srf-length', LENGTHS, false)) +
      field('I would recommend this class to another family:', radios('srf-recommend', ['Yes', 'No'], false)) +
      field('The most useful part of today was:', '<textarea name="srf-useful"></textarea>') +
      field('One thing I wish we had covered:', '<textarea name="srf-wish"></textarea>') +
      field('Anything else you want us to know:', '<textarea name="srf-else"></textarea>') +
      '<h2>Section 4 · About you (for reporting only)</h2>' +
      field('I am a:', radios('srf-who', CLASS_ROLES, false)) +
      field('I am interested in:', checks('srf-interest', INTERESTS)) +
      '<p class="eval-note">Thank you. Watch your email in about two months for a two-minute follow-up. Your answer to that survey is what keeps this class free.</p>';
  }

  function followupHtml() {
    return field('Your email', '<input type="email" name="srf-email" required>') +
      field('Which class date did you attend?', '<input type="date" name="srf-date">') +
      '<h2>Section 1 · Your written safety plan</h2>' +
      field('Since the class, have you completed a written safety plan for your child? By "written plan" we mean at least the About Me Sheet and the Wandering Plan filled in on paper or on your phone, where another adult could find and follow them. REQUIRED.', radios('srf-plan', PLAN_LATER, true)) +
      field('Which toolkit sheets are now complete? Check all that apply.', checks('srf-sheets', SHEETS)) +
      field('Where does a copy of your About Me Sheet live now? Check all that apply.', checks('srf-places', PLACES)) +
      field('If you have not finished, what got in the way? (Short answer, optional.)', '<textarea name="srf-barrier"></textarea>') +
      '<h2>Section 2 · What changed at home</h2>' +
      field('Since the class, which of these have you done? Check all that apply.', checks('srf-actions', ACTIONS)) +
      field('Have you had to use anything from the class in a real situation?', radios('srf-used', ['Yes', 'No'], false) +
        '<textarea name="srf-used-detail" placeholder="If yes, tell us what happened, in as much or as little detail as you want."></textarea>') +
      '<h2>Section 3 · Confidence today</h2>' +
      field('Today, how confident do you feel that you could keep your child safe and respond in an emergency? (1 = not at all confident, 5 = very confident)', scale('srf-confidence')) +
      field('Compared to before the class, I feel:', radios('srf-compared', OVERALL, false)) +
      '<h2>Section 4 · One more thing</h2>' +
      field('Would you be willing to share a sentence or two we can use, anonymously, to help keep this class free for other families?',
        radios('srf-quote', ['Yes', 'No thanks'], false) + '<textarea name="srf-quote-text" placeholder="Yes, here it is"></textarea>') +
      field('Would you like to be contacted about a follow-up class, a CPR certification class, or a class for your child?', radios('srf-contact', ['Yes', 'No'], false)) +
      '<p class="eval-note">Thank you. Your two minutes count toward the report that funds this class.</p>';
  }

  function checked(form, name) {
    return Array.prototype.map.call(form.querySelectorAll('input[name="' + name + '"]:checked'), function (el) {
      return el.value;
    });
  }

  function one(form, name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }

  function val(form, name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? String(el.value || '').trim() : '';
  }

  function readRegistration(form) {
    var role = one(form, 'srf-role');
    var plan = one(form, 'srf-plan');
    var consent = one(form, 'srf-consent');
    if (!role) return { ok: false, error: 'Please choose which best describes you.' };
    if (role === 'Other' && !val(form, 'srf-role-other')) return { ok: false, error: 'Please tell us the other way that describes you.' };
    if (!plan) return { ok: false, error: 'Please answer whether you have a written safety plan.' };
    if (consent !== 'Yes' && consent !== 'No') return { ok: false, error: 'Please answer the follow-up survey consent question.' };
    return {
      ok: true,
      answers: {
        role: role,
        role_other: val(form, 'srf-role-other'),
        child_count: one(form, 'srf-count'),
        child_ages: checked(form, 'srf-ages'),
        child_needs: checked(form, 'srf-needs'),
        child_needs_other: val(form, 'srf-needs-other'),
        written_plan: plan,
        safety_worry: val(form, 'srf-worry'),
        followup_consent: consent,
        accommodations: val(form, 'srf-access'),
        hear_about: one(form, 'srf-hear'),
        hear_about_other: val(form, 'srf-hear-other')
      }
    };
  }

  function readScales(form, prefix) {
    var out = [];
    for (var i = 0; i < CONFIDENCE.length; i++) {
      var n = Number(one(form, prefix + i));
      out.push(n >= 1 && n <= 5 ? n : null);
    }
    return out;
  }

  function readClassSurvey(form) {
    var email = val(form, 'srf-email').toLowerCase();
    var overall = one(form, 'srf-overall');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Please enter the email you used to register.' };
    if (!overall) return { ok: false, error: 'Please answer how you feel compared to before today.' };
    var before = readScales(form, 'srf-before-');
    var now = readScales(form, 'srf-now-');
    for (var i = 0; i < CONFIDENCE.length; i++) {
      if (before[i] == null || now[i] == null) {
        return { ok: false, error: 'Please choose a before and a now number for every statement.' };
      }
    }
    return {
      ok: true,
      answers: {
        email: email,
        class_date: val(form, 'srf-date'),
        instructor: val(form, 'srf-instructor'),
        statements: CONFIDENCE.map(function (line, i) {
          return { statement: line, before: before[i], now: now[i] };
        }),
        overall: overall,
        sheets: checked(form, 'srf-sheets'),
        sheet_tonight: val(form, 'srf-tonight'),
        instructor_clear: one(form, 'srf-clear'),
        hands_on: one(form, 'srf-hands'),
        respected: one(form, 'srf-respect'),
        length: one(form, 'srf-length'),
        recommend: one(form, 'srf-recommend'),
        most_useful: val(form, 'srf-useful'),
        wish_covered: val(form, 'srf-wish'),
        anything_else: val(form, 'srf-else'),
        role: one(form, 'srf-who'),
        interested: checked(form, 'srf-interest')
      }
    };
  }

  function readFollowup(form) {
    var email = val(form, 'srf-email').toLowerCase();
    var plan = one(form, 'srf-plan');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, error: 'Please enter the email you used to register.' };
    if (!plan) return { ok: false, error: 'Please answer whether you completed a written safety plan.' };
    var conf = Number(one(form, 'srf-confidence'));
    return {
      ok: true,
      answers: {
        email: email,
        class_date: val(form, 'srf-date'),
        plan: plan,
        sheets: checked(form, 'srf-sheets'),
        about_me_places: checked(form, 'srf-places'),
        barrier: val(form, 'srf-barrier'),
        actions: checked(form, 'srf-actions'),
        used_real: one(form, 'srf-used'),
        used_real_detail: val(form, 'srf-used-detail'),
        confidence: conf >= 1 && conf <= 5 ? conf : null,
        compared: one(form, 'srf-compared'),
        share_quote: one(form, 'srf-quote'),
        quote: val(form, 'srf-quote-text'),
        contact_ok: one(form, 'srf-contact')
      }
    };
  }

  function asText(raw, max) {
    var s = String(raw == null ? '' : raw).replace(/\u0000/g, '').trim();
    return s.length > max ? s.slice(0, max) : s;
  }

  function asOne(raw, allowed) {
    var s = asText(raw, 300);
    return allowed.indexOf(s) >= 0 ? s : '';
  }

  function asList(raw, allowed) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    raw.forEach(function (v) {
      var s = asOne(v, allowed);
      if (s && out.indexOf(s) < 0) out.push(s);
    });
    return out;
  }

  function asEmail(raw) {
    var s = asText(raw, 160).toLowerCase();
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : '';
  }

  function asScale(raw) {
    var n = Number(raw);
    return n >= 1 && n <= 5 && n === Math.floor(n) ? n : null;
  }

  function accept(part, raw) {
    raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    if (part === 'A') {
      var role = asOne(raw.role, ROLES);
      var plan = asOne(raw.written_plan, PLAN_NOW);
      var consent = asOne(raw.followup_consent, ['Yes', 'No']);
      var roleOther = asText(raw.role_other, 160);
      if (!role) return { ok: false, error: 'Please choose which best describes you.' };
      if (role === 'Other' && !roleOther) return { ok: false, error: 'Please tell us the other way that describes you.' };
      if (!plan) return { ok: false, error: 'Please answer whether you have a written safety plan.' };
      if (!consent) return { ok: false, error: 'Please answer the follow-up survey consent question.' };
      return {
        ok: true,
        answers: {
          role: role,
          role_other: role === 'Other' ? roleOther : '',
          child_count: asOne(raw.child_count, CHILD_COUNTS),
          child_ages: asList(raw.child_ages, CHILD_AGES),
          child_needs: asList(raw.child_needs, CHILD_NEEDS),
          child_needs_other: asText(raw.child_needs_other, 160),
          written_plan: plan,
          safety_worry: asText(raw.safety_worry, 2000),
          followup_consent: consent,
          accommodations: asText(raw.accommodations, 2000),
          hear_about: asOne(raw.hear_about, HEAR),
          hear_about_other: asText(raw.hear_about_other, 160)
        }
      };
    }
    if (part === 'B') {
      var email = asEmail(raw.email);
      var overall = asOne(raw.overall, OVERALL);
      if (!email) return { ok: false, error: 'Please enter the email you used to register.' };
      if (!overall) return { ok: false, error: 'Please answer how you feel compared to before today.' };
      var given = Array.isArray(raw.statements) ? raw.statements : [];
      var missingScale = false;
      var statements = CONFIDENCE.map(function (line, i) {
        var src = given[i] || {};
        var before = asScale(src.before);
        var now = asScale(src.now);
        if (before == null || now == null) missingScale = true;
        return { statement: line, before: before, now: now };
      });
      if (missingScale) return { ok: false, error: 'Please choose a before and a now number for every statement.' };
      return {
        ok: true,
        answers: {
          email: email,
          class_date: asText(raw.class_date, 10),
          instructor: asText(raw.instructor, 160),
          statements: statements,
          overall: overall,
          sheets: asList(raw.sheets, SHEETS),
          sheet_tonight: asText(raw.sheet_tonight, 160),
          instructor_clear: asOne(raw.instructor_clear, LIKERT),
          hands_on: asOne(raw.hands_on, LIKERT),
          respected: asOne(raw.respected, LIKERT),
          length: asOne(raw.length, LENGTHS),
          recommend: asOne(raw.recommend, ['Yes', 'No']),
          most_useful: asText(raw.most_useful, 2000),
          wish_covered: asText(raw.wish_covered, 2000),
          anything_else: asText(raw.anything_else, 2000),
          role: asOne(raw.role, CLASS_ROLES),
          interested: asList(raw.interested, INTERESTS)
        }
      };
    }
    if (part === 'C') {
      var followEmail = asEmail(raw.email);
      var later = asOne(raw.plan, PLAN_LATER);
      if (!followEmail) return { ok: false, error: 'Please enter the email you used to register.' };
      if (!later) return { ok: false, error: 'Please answer whether you completed a written safety plan.' };
      return {
        ok: true,
        answers: {
          email: followEmail,
          class_date: asText(raw.class_date, 10),
          plan: later,
          sheets: asList(raw.sheets, SHEETS),
          about_me_places: asList(raw.about_me_places, PLACES),
          barrier: asText(raw.barrier, 2000),
          actions: asList(raw.actions, ACTIONS),
          used_real: asOne(raw.used_real, ['Yes', 'No']),
          used_real_detail: asText(raw.used_real_detail, 2000),
          confidence: asScale(raw.confidence),
          compared: asOne(raw.compared, OVERALL),
          share_quote: asOne(raw.share_quote, ['Yes', 'No thanks']),
          quote: asText(raw.quote, 2000),
          contact_ok: asOne(raw.contact_ok, ['Yes', 'No'])
        }
      };
    }
    return { ok: false, error: 'Unknown survey.' };
  }

  function pct(part, whole) {
    if (!whole) return null;
    return Math.round((part / whole) * 1000) / 10;
  }

  function report(rows) {
    var list = rows || [];
    var a = list.filter(function (r) { return r && r.part === 'A'; });
    var b = list.filter(function (r) { return r && r.part === 'B' && r.answers && r.answers.overall; });
    var c = list.filter(function (r) { return r && r.part === 'C' && r.answers && r.answers.plan; });
    var byRole = {};
    a.forEach(function (r) {
      var role = (r.answers && r.answers.role) || 'Not answered';
      if (role === 'Other' && r.answers && r.answers.role_other) role = 'Other: ' + r.answers.role_other;
      byRole[role] = (byRole[role] || 0) + 1;
    });
    var more = b.filter(function (r) { return MORE[r.answers.overall]; }).length;
    var plans = c.filter(function (r) { return r.answers.plan === 'Yes, both are complete'; }).length;
    return {
      served: a.length,
      byRole: byRole,
      confidenceResponses: b.length,
      moreConfident: more,
      moreConfidentPct: pct(more, b.length),
      planResponses: c.length,
      writtenPlan: plans,
      writtenPlanPct: pct(plans, c.length)
    };
  }

  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function csv(rows) {
    var summary = report(rows);
    var lines = [
      ['metric', 'value'].map(csvCell).join(','),
      ['Participants served', summary.served].map(csvCell).join(',')
    ];
    Object.keys(summary.byRole).sort().forEach(function (role) {
      lines.push(['Participants served: ' + role, summary.byRole[role]].map(csvCell).join(','));
    });
    lines.push(['Percent reporting more confidence', summary.moreConfidentPct == null ? '' : summary.moreConfidentPct].map(csvCell).join(','));
    lines.push(['More confident responses', summary.moreConfident].map(csvCell).join(','));
    lines.push(['Class-day responses', summary.confidenceResponses].map(csvCell).join(','));
    lines.push(['Percent completing a written safety plan', summary.writtenPlanPct == null ? '' : summary.writtenPlanPct].map(csvCell).join(','));
    lines.push(['Written plans complete', summary.writtenPlan].map(csvCell).join(','));
    lines.push(['Follow-up responses', summary.planResponses].map(csvCell).join(','));
    lines.push('');
    lines.push(['part', 'session_code', 'session_date', 'email', 'role', 'followup_consent', 'overall', 'plan'].map(csvCell).join(','));
    (rows || []).forEach(function (r) {
      var ans = r.answers || {};
      lines.push([
        r.part, r.session_code, r.session_date, r.email || ans.email,
        ans.role, ans.followup_consent, ans.overall || ans.compared, ans.plan || ans.written_plan
      ].map(csvCell).join(','));
    });
    return lines.join('\n');
  }

  var api = {
    COURSE: COURSE,
    CONSENT: CONSENT,
    EMAIL_NOTE: EMAIL_NOTE,
    CLASS_DATE_Q: CLASS_DATE_Q,
    ROLES: ROLES,
    CONFIDENCE: CONFIDENCE,
    OVERALL: OVERALL,
    PLAN_LATER: PLAN_LATER,
    isCourse: isCourse,
    surveyUrl: surveyUrl,
    registrationHtml: registrationHtml,
    classSurveyHtml: classSurveyHtml,
    followupHtml: followupHtml,
    readRegistration: readRegistration,
    readClassSurvey: readClassSurvey,
    readFollowup: readFollowup,
    accept: accept,
    report: report,
    csv: csv
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBSrfGrant = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
