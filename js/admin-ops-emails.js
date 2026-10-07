/* Session-filled copies of Lindsay's four ops emails.
   ADMIN shows the result in a copy window. Nothing here sends mail. */
(function (root) {
  'use strict';

  var MEAL = /\b(meal|meals|lunch|lunches|dinner|snack|snacks|refreshment|refreshments|pizza|potluck)\b/i;
  var TOPIC = /\b(park|parking|pet|pets|dog|dogs|cat|cats|allerg|allergy|allergies|access|entrance|door code|gate|stairs|elevator|wheelchair|drop-off|drop off|pickup|pick-up|pick up)\b/i;

  function firstName(full) {
    var t = String(full || '').trim();
    if (!t) return '';
    return t.split(/\s+/)[0].replace(/,$/, '');
  }

  function uniquePush(list, text) {
    var p = String(text || '').trim();
    if (!p) return;
    if (list.some(function (x) { return x.toLowerCase() === p.toLowerCase(); })) return;
    list.push(p);
  }

  function eachLine(chunks, fn) {
    (chunks || []).forEach(function (chunk) {
      String(chunk || '').split(/\n+/).forEach(function (line) {
        var trimmed = line.trim();
        if (trimmed) fn(trimmed);
      });
    });
  }

  function mealText(chunks) {
    var hits = [];
    eachLine(chunks, function (line) {
      line.split(/(?<=[.!?])\s+/).forEach(function (part) {
        if (MEAL.test(part)) uniquePush(hits, part);
      });
    });
    return hits.join(' ');
  }

  function specialNotes(chunks) {
    var hits = [];
    eachLine(chunks, function (line) {
      if (TOPIC.test(line)) uniquePush(hits, line);
    });
    return hits.join('\n');
  }

  function familyMealLine(meal) {
    var t = String(meal || '').trim();
    var placeholder = '[Edit before sending: \u201cYour host is providing a meal for participants.\u201d OR \u201cPlease pack a lunch; the host will provide snacks and drinks.\u201d]';
    if (!t) return placeholder;
    var pack = /\b(pack|bring)\b/i.test(t) && /\b(lunch|meal)\b/i.test(t);
    var snacksOnly = /\bsnacks?\b/i.test(t) && /\b(only|drinks?)\b/i.test(t) && !/\b(full meal|providing a meal|provide a meal|provides a meal|meal provided|lunch provided)\b/i.test(t);
    var providesMeal = /\b(full meal|providing a meal|provide a meal|provides a meal|providing lunch|provide lunch|provides lunch|lunch provided|meal provided|pizza|potluck)\b/i.test(t)
      || (/\bprovid\w*\b/i.test(t) && /\b(meal|lunch|dinner)\b/i.test(t));
    if (providesMeal && !pack && !snacksOnly) return 'Your host is providing a meal for participants.';
    if (pack || snacksOnly) return 'Please pack a lunch; the host will provide snacks and drinks.';
    return t;
  }

  function hostMealLine(meal) {
    var t = String(meal || '').trim();
    if (!t) return '[Edit before sending \u2014 e.g. \u201cYou are providing a full meal for participants.\u201d or \u201cYou are providing snacks and drinks only; participants should pack a meal.\u201d]';
    return t;
  }

  function val(info, key, fallback) {
    var v = info && info[key];
    v = v == null ? '' : String(v).trim();
    return v || fallback;
  }

  function draft(kind, info) {
    info = info || {};
    var course = val(info, 'course', 'Safe Sitter\u00ae');
    var dateLong = val(info, 'dateLong', 'To be confirmed');
    var dateShort = val(info, 'dateShort', 'the scheduled date');
    var time = val(info, 'time', 'To be confirmed');
    var address = val(info, 'address', 'To be confirmed');
    var instructor = val(info, 'instructor', '');
    var code = val(info, 'code', '');
    var countPhrase = val(info, 'countPhrase', '0 students registered');
    var host = val(info, 'hostFirst', '[Host first name]');
    var mealRaw = val(info, 'mealText', '');
    var special = val(info, 'specialNotes', '');
    var wifi = val(info, 'wifi', '');
    var lines = [];

    if (kind === 'hostReminder') {
      lines.push('Hi ' + host + ',');
      lines.push('');
      lines.push('Your ' + course + ' class is one week away! Here is everything you need to remember as the host, plus the session details. Please print the attached class roster and have it ready for the instructor.');
      lines.push('');
      lines.push('SESSION DETAILS');
      lines.push('Course: ' + course);
      lines.push('Date: ' + dateLong);
      lines.push('Time: ' + time);
      lines.push('Location: ' + address);
      lines.push('Instructor: ' + (instructor || 'To be confirmed'));
      lines.push('Session code: ' + code);
      lines.push('Registration count: ' + countPhrase);
      lines.push('');
      lines.push('HOSTING CHECKLIST (from our host form)');
      lines.push('Please make sure the following are in place before the instructor and participants arrive:');
      lines.push('');
      lines.push('\u2022 Space & seating: A clean floor area for hands-on practice, plus a comfortable seat for every participant.');
      lines.push('\u2022 Work surface: A dining table is preferred. If you don\u2019t have one available, no worries \u2014 the instructor will bring clipboards.');
      lines.push('\u2022 Tech & projection: A large, blank wall is needed to project videos. We supply the laptop, speakers, and projector.');
      lines.push('\u2022 Wi-Fi: Reliable internet access is required. Please share the login credentials with the instructor upon arrival.');
      lines.push('\u2022 Refreshments: As the host, please provide light snacks and drinks. Participants usually pack their own meals unless you chose to provide a meal (see your meal plan below).');
      lines.push('\u2022 Safety & environment:');
      lines.push('  \u2013 An adult must be present for the duration of the course.');
      lines.push('  \u2013 Secure entry, access to restrooms, a working phone, and adequate lighting.');
      lines.push('  \u2013 Please keep pets in a separate area, away from the teaching space.');
      lines.push('');
      lines.push('YOUR MEAL PLAN FOR THIS CLASS');
      lines.push(hostMealLine(mealRaw));
      var notes = [];
      if (special) notes.push(special);
      if (wifi) notes.push('Wi-Fi on file: ' + wifi);
      if (notes.length) {
        lines.push('');
        lines.push('SPECIAL NOTES');
        lines.push(notes.join('\n'));
      }
      lines.push('');
      lines.push('Please don\u2019t hesitate to reach out with any questions. Thank you again for hosting \u2014 we are so grateful!');
      lines.push('');
      lines.push('Warmly,');
      lines.push('Lindsay');
      lines.push('Mindful Beginnings');
      return {
        field: 'to',
        subject: 'Reminder: ' + course + ' class on ' + dateShort + ' \u2014 hosting checklist',
        body: lines.join('\n')
      };
    }

    if (kind === 'classReminder') {
      lines.push('Hi everyone,');
      lines.push('');
      lines.push('Please review the important details below as you prepare for the class:');
      lines.push('');
      lines.push('CLASS LOGISTICS');
      lines.push('\u2022 Date and Time: ' + dateLong + ', ' + time);
      lines.push('\u2022 Location: ' + address);
      lines.push('\u2022 What to Bring: Please send your child with a water bottle and a snack.');
      lines.push('\u2022 Meal: ' + familyMealLine(mealRaw));
      lines.push('');
      lines.push('CLASS DETAILS');
      lines.push('\u2022 Instructor: Your instructor for the day will be ' + (instructor || 'To be confirmed') + '. You can learn more about our full team here: https://mindfulbeginnings.org/our-team');
      lines.push('\u2022 Course Overview: https://docs.google.com/document/d/1YYHVQHr0p_wCUp8BPlyCJc73p5bvkx_PEMewWwDOQRs/edit?usp=sharing');
      lines.push('');
      lines.push('CERTIFICATION');
      lines.push('Upon successful completion of the course, each participant will receive an official Safe Sitter\u00ae Certificate of Completion.');
      lines.push('');
      lines.push('Please let us know if you have any questions in the meantime. We can\u2019t wait for a great day of learning!');
      lines.push('');
      lines.push('Warmly,');
      lines.push('Lindsay');
      lines.push('Mindful Beginnings');
      return {
        field: 'bcc',
        subject: 'Reminder: ' + course + ' class on ' + dateShort,
        body: lines.join('\n')
      };
    }

    if (kind === 'postCourse') {
      lines.push('Thank you for trusting Mindful Beginnings with your child. We hope they came home feeling confident, capable, and proud of everything they accomplished.');
      lines.push('');
      lines.push('The most important thing your child learned today is the Safety Signal. If you ever receive a text or call that says, "I\'m ready to be picked up now," that is their signal that they feel unsafe. Please go immediately, do not ask questions, and let them explain once they are in the car. This signal works in any situation, not only babysitting.');
      lines.push('');
      lines.push('The course is a meaningful achievement, but it does not automatically mean your child is ready to babysit or stay home alone, so please assess their readiness based on their individual maturity. We ask students to take jobs only with friends, neighbors, and others you or they know personally, and never to advertise online. And a quick conversation after each job gives your child helpful guidance while keeping you informed about what they are experiencing.');
      lines.push('');
      lines.push('If you have a moment, two small things would mean a great deal to us. A Google review (https://g.page/r/Ca2jsWW-MkfvEAE/review) helps other families find us! And our short program evaluation (https://forms.gle/3YkNJiaJyavjvSu49) helps us improve every session.');
      lines.push('');
      lines.push('Thank you again for being part of the Mindful Beginnings community. We are so glad your child is now a certified Safe Sitter!');
      return {
        field: 'bcc',
        subject: 'After Safe Sitter\u00ae \u2014 Safety Signal & next steps',
        body: lines.join('\n')
      };
    }

    if (kind === 'familyForward') {
      var hostName = val(info, 'hostFirst', 'there');
      var familyPay = val(info, 'familyPayLine', '[Family price at registration is not entered yet.]');
      var orgCover = val(info, 'orgCoverLine', '[What the organization covers is not entered yet.]');
      var overview = val(info, 'overviewText', '');
      var link = val(info, 'regLink', 'https://register.mindfulbeginnings.org/register.html');
      lines.push('Hi ' + hostName + ',');
      lines.push('');
      lines.push('Please forward the message below to your families. It has the date, what each family pays, the private registration link, and what the organization covers. This is a draft for you to send. Nothing is emailed from here.');
      lines.push('');
      lines.push('—— Forward to families ——');
      lines.push('');
      lines.push('Hello,');
      lines.push('');
      lines.push('Here are the details for our ' + course + ' with Mindful Beginnings.');
      lines.push('');
      lines.push('Date: ' + dateLong);
      lines.push('Time: ' + time);
      lines.push('Location: ' + address);
      lines.push('');
      lines.push(familyPay);
      lines.push('Register on this private link (this class is not on the public class list):');
      lines.push(link);
      if (code) lines.push('Session code: ' + code);
      lines.push('');
      lines.push(orgCover);
      if (overview) {
        lines.push('');
        lines.push(overview);
      } else {
        lines.push('');
        lines.push('[Course overview is not on file for this course yet.]');
      }
      lines.push('');
      lines.push('Warmly,');
      lines.push('Lindsay');
      lines.push('Mindful Beginnings');
      return {
        field: 'to',
        subject: 'Please forward: ' + course + (dateShort && dateShort !== 'the scheduled date' ? ' — ' + dateShort : ''),
        body: lines.join('\n')
      };
    }

    if (kind === 'hostLetter') {
      var cost = val(info, 'priceText', '');
      if (!cost || cost === '$0') cost = '[Cost]';
      var regLink = val(info, 'regLink', 'https://register.mindfulbeginnings.org/register.html');
      var instrLine = instructor || 'TBD \u2014 as we get closer to the date, I will share your instructor\'s name, cell phone number, and a short bio!';
      lines.push('Hi ' + host + ',');
      lines.push('');
      lines.push('Thank you so much for hosting an upcoming Mindful Beginnings course! We are so excited to bring this experience to your group.');
      lines.push('');
      lines.push('Here are the details to share with participants:');
      lines.push('');
      lines.push('Course: ' + course);
      lines.push('Date: ' + dateLong);
      lines.push('Time: ' + time);
      lines.push('Address: ' + address);
      lines.push('Cost: ' + cost + ' per participant');
      lines.push('Registration link: ' + regLink);
      lines.push('Session code: ' + code);
      lines.push('Instructor: ' + instrLine);
      if (mealRaw) lines.push(mealRaw);
      if (info.hasHostSpot !== false) {
        lines.push('');
        lines.push('As our host, your child\'s registration is completely free when that policy applies. Please register using the link above and check the box that says "I am the host for this session." Your spot will be marked as complimentary!');
      }
      lines.push('');
      lines.push('Please don\'t hesitate to reach out with any questions. I am always happy to help and want this to be a wonderful experience for everyone!');
      lines.push('');
      lines.push('Warmly,');
      lines.push('Lindsay');
      lines.push('Mindful Beginnings');
      return {
        field: 'to',
        subject: 'Hosting your ' + course + ' course',
        body: lines.join('\n')
      };
    }

    return { field: 'bcc', subject: '', body: '' };
  }

  var api = {
    firstName: firstName,
    mealText: mealText,
    specialNotes: specialNotes,
    familyMealLine: familyMealLine,
    hostMealLine: hostMealLine,
    draft: draft
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBOpsEmails = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
