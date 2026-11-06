/* One-page teaching checklist for the admin dashboard.
   Course steps and supplies come from the draft Google Doc
   "Mindful Beginnings Teaching Checklists" and from the kit rules
   already in admin (handbooks, manikins, AV). The browser print
   dialog is the same path as the packing list. This file does not
   read or write session prices, pay, or the database.

   A booth, fair, or other non-class job gets a packing sheet with
   no teaching steps. */
(function (root) {
  'use strict';

  var ROOM = 'Leave the room as you found it. Clear food and drinks, push in chairs, and take every material with you.';
  var KIT_BACK = 'Return the kit after class. It is due back 7 days after the class unless you are keeping it for another session.';
  // What one AV kit contains. Same pieces named in the instructor loss schedule
  // (laptop, case, and speakers; projector, case, and remote; power strip or cord)
  // and in the instructor guide (USB-C to HDMI adapter). The host provides the wall or screen.
  var AV_PARTS = [
    'Laptop, case, and speakers (Mindful Beginnings)',
    'Projector, case, and remote (Mindful Beginnings). The host provides the wall or screen.',
    'USB-C to HDMI adapter (in the AV kit)',
    'Power strip or cord (in the AV kit)'
  ];
  // Courses whose session kit includes AV (admin MAT_NEEDS av:1) or whose teaching
  // checklist names a digital presentation. Virtual sessions never get this list.
  var AV_COURSE_IDS = {
    'safe-sitter': true,
    'safe-sitter-essentials': true,
    'intro-to-babysitting': true,
    'safe-at-home': true,
    'safe-at-home-series': true,
    'stay-ready': true,
    'season-ready': true,
    'campus-ready': true,
    'all-kids-welcome': true,
    'girl-scout-first-aid': true,
    'grandparents-started': true,
    'baby-ready': true,
    'baby-ready-cpr': true,
    'care-ready': true,
    'red-cross': true
  };

  function norm(value) {
    return String(value == null ? '' : value)
      .toLowerCase()
      .replace(/[®™]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9@+]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function homeName(name) {
    return /safe\s*@\s*home|safe at home|safeathome/.test(name);
  }

  function arcLengthNote(name) {
    if (name.indexOf('hybrid') >= 0 || name.indexOf('online') >= 0) {
      return 'The online portion is already done. This visit is the classroom skills session.';
    }
    return '';
  }

  function arcHandbook(name) {
    return name.indexOf('babysitter') >= 0 && name.indexOf('training') >= 0;
  }

  var COURSES = [
    {
      id: 'safe-sitter-essentials',
      label: 'Safe Sitter Babysitting Essentials',
      match: function (ctx) {
        return ctx.name.indexOf('babysitting essentials') >= 0 && ctx.name.indexOf('safe sitter') >= 0;
      },
      supplies: [
        'Instructor Manual for Babysitting Essentials',
        'Name tags and a marker',
        'Student evaluation forms',
        'Game pouch, raffle tickets, bingo prizes, tape, and a fake cell phone',
        'Soft-bodied dolls and disposable diapers',
        'CPR face shield protectors, 1 per participant, if the manual uses them'
      ],
      steps: [
        '4 hours, grades 6 to 9. This is Babysitting Essentials, not the 5-hour course with the CPR certification module.',
        'Follow the Essentials instructor manual. Speaker notes are a guide only.',
        'Caring for children: ages and stages, holding, feeding, and diapering, behavior, and keeping kids busy and safe.',
        'Running a babysitting business: interviewing, rates, house rules, and when to say no.',
        'Hand out student evaluation forms before the end of class.'
      ],
      after: [
        'Safe Sitter certificate of completion for every student. No CPR card is issued for this course.',
        'Put student evaluations in the labeled pouch.',
        ROOM,
        KIT_BACK
      ]
    },
    {
      id: 'intro-to-babysitting',
      label: 'Intro to Safe Babysitting',
      match: function (ctx) {
        return ctx.name.indexOf('intro to babysitting') >= 0 || ctx.name.indexOf('intro to safe babysitting') >= 0;
      },
      supplies: [
        'Instructor Manual or Facilitator Guide',
        'Name tags and a marker',
        'Pen or pencil, 1 per student',
        'Diapers and soft-bodied dolls for diapering practice',
        'Laptop, speaker, and a projector if the site needs one'
      ],
      steps: [
        '60 minutes, grades 6 to 8. Follow the scripted guided discussion.',
        'Ages and stages.',
        'Child care essentials: BEST routines, safe sleep, choking hazards, diapering demonstration and practice, handwashing, and games.',
        'Behavior: four rules, six tips, and when to call a backup adult or 9-1-1.',
        'Preventing injuries: think like a bodyguard.',
        'End-of-class review quiz.'
      ],
      after: [
        'Safe Sitter Child Care Skills patch for every student. This course does not issue a Safe Sitter certificate.',
        'Collect student evaluations.',
        'Return unused booklets, supplies, and the AV kit.',
        ROOM,
        KIT_BACK
      ]
    },
    {
      id: 'safe-at-home-series',
      label: 'Safe@Home 8-week series',
      match: function (ctx) {
        return homeName(ctx.name) && (ctx.name.indexOf('series') >= 0 || ctx.name.indexOf('8 week') >= 0);
      },
      supplies: [
        'Every week: Facilitator Guide (8-week), student booklets (1 per participant), name tents or tags, group expectations poster or whiteboard',
        'Week props: door (1), password and outdoor cards (2), High Five and permission cards (3), travel and Safety Signal cards plus phone props (4)',
        'Week props continued: 9-1-1 scripts (5), room scenes and hazard cards (6), scenario stations (7), quizzes, completion cards, and parent pages (8)'
      ],
      steps: [
        'Week 1: Am I ready to be home alone? Door-knock role play.',
        'Week 2: Outdoor and online safety. Strong password challenge.',
        'Week 3: Personal safety and the High Five. Permission role play.',
        'Week 4: Travel safely and the Safety Signal.',
        'Week 5: Handling emergencies. Mock 9-1-1 calls.',
        'Week 6: Preventing injuries. Hazard hunt.',
        'Week 7: Injury management and the First Aid Chart. Scenario stations.',
        'Week 8: Review, quiz and readiness check, parent pages, and completion cards.',
        'Have students complete the Safe@Home student evaluation.'
      ],
      after: [
        'Completion cards at week 8.',
        'Send parent pages home.',
        ROOM,
        KIT_BACK
      ]
    },
    {
      id: 'safe-at-home-virtual',
      label: 'Safe@Home virtual',
      thin: true,
      thinNote: 'Zoom setup is below. The minute-by-minute virtual agenda is in the 60-minute facilitator guide.',
      match: function (ctx) {
        return ctx.isVirtual && homeName(ctx.name);
      },
      supplies: [
        'Facilitator Guide (60-minute virtual), on a second screen or printed',
        'Slide deck in presenter view. Share that window only.',
        'Quiz answer key',
        'Plan for mailing or emailing completion cards'
      ],
      steps: [
        'Chat on for everyone, reactions enabled.',
        'Follow the 60-minute virtual facilitator guide for the lesson order.',
        'Have students complete the Safe@Home student evaluation.'
      ],
      after: [
        'Mail or email completion cards.',
        'Collect student evaluations.'
      ]
    },
    {
      id: 'safe-at-home',
      label: 'Safe@Home (90 minutes)',
      match: function (ctx) { return homeName(ctx.name); },
      supplies: [
        'Instructor Manual or Safe@Home Facilitator Guide',
        'Name tags and a marker',
        'Pencils or pens, 1 per participant',
        'Laptop, speaker, and a projector if the site needs one'
      ],
      steps: [
        'About 90 minutes. Put the digital presentation in full screen. Page numbers in the script tell you which slide to show.',
        'Welcome and guided discussion.',
        'Safe habits.',
        'Handling emergencies.',
        'Preventing injuries.',
        'Injury management and the Safe@Home First Aid Chart.',
        'Quiz, readiness check, and parent pages.',
        'Have students complete the Safe@Home student evaluation.'
      ],
      after: [
        'Safe@Home completion certificate for each participant.',
        'Collect student evaluations.',
        'Return extra booklets, supplies, and the AV kit.',
        ROOM,
        KIT_BACK
      ]
    },
    {
      id: 'stay-ready',
      label: 'Stay Ready',
      match: function (ctx) {
        return ctx.name.indexOf('stay ready') >= 0 || ctx.name.indexOf('choking rescue') >= 0;
      },
      supplies: [
        'Facilitator Guide and the 14-slide deck',
        'Name tags and a marker',
        'Printed takeaway sheets, 1 per seat',
        'Timer and music or a metronome at 110 bpm',
        'Replacement lungs or face shields at each station, plus cleaning supplies',
        'Mats or clear floor space for seizure practice',
        'Up to 12 students. Plan 1 facilitator per 6 students when you can.'
      ],
      steps: [
        '0:00 to 0:07 Welcome and why we practice (slides 1 to 3).',
        '0:07 to 0:12 Demo: choking rescue (slides 4 to 6).',
        '0:12 to 0:27 Practice: choking stations in pairs (slide 7).',
        '0:27 to 0:32 Demo: CPR (slides 8 to 9).',
        '0:32 to 0:50 CPR stations. Rotate infant, child, and adult. 2 minutes of 30:2 each (slide 10).',
        '0:50 to 0:57 Rapid-fire scenarios (slide 11).',
        '0:57 to 1:12 Seizure response demo, then practice in pairs (slides 12 to 14).',
        '1:12 to 1:15 Close face to face and hand out remaining takeaway sheets.',
        '2025 updates: child choking is 5 back blows and 5 abdominal thrusts. Infant chest thrusts use the heel of one hand. Do not teach two-finger infant CPR.'
      ],
      after: [
        'Certificate of participation. This is not a certified CPR card.',
        'Wipe manikin faces and restock unused lungs and face shields.',
        ROOM,
        KIT_BACK
      ]
    },
    {
      id: 'season-ready',
      label: 'Season Ready',
      match: function (ctx) { return ctx.name.indexOf('season ready') >= 0; },
      supplies: [
        'Facilitator Guide, name tags, and a marker',
        'Printed scenario cards and take-home phone cards, 1 per student',
        'Hydration color chart',
        'Empty packaging or photos for Label Detective, plus Fuel the Day, Sort the Pain, and Spot the Signs cards',
        'AED trainer with pads',
        'Towel and tarp for the cooling demo',
        'Up to 20 participants'
      ],
      steps: [
        '0:00 Welcome and why this matters (3 min).',
        '0:03 Part 1 Fuel (12 min).',
        '0:15 Part 2 Recover (7 min).',
        '0:22 Part 3 Prevent: warm-up, overuse, and reporting pain (8 min).',
        '0:30 Part 4 Recognize: concussion, heat illness, and cardiac arrest (11 min).',
        '0:41 Part 5 Act: CPR and AED, cooling, and sideline response (10 min).',
        '0:51 Part 6 Practice scenarios (7 min).',
        '0:58 Wrap and save the phone card (2 min).',
        'On a short virtual class, do not cut Parts 4 and 5. Keep CPR on the Beat, AED Run-Through, and Sideline Scan.'
      ],
      after: [
        'Certificate of participation. This is not a certified CPR or AED course.',
        'Return the manikin, AED trainer, tarp, cards, and the AV kit.',
        ROOM,
        KIT_BACK
      ]
    },
    {
      id: 'campus-ready',
      label: 'Campus Ready',
      match: function (ctx) { return ctx.name.indexOf('campus ready') >= 0; },
      supplies: [
        'Facilitator Guide, name tags, and a marker',
        'Narcan (naloxone) training devices',
        'Campus Ready phone card for students to save',
        'Laptop, speaker, and a projector if the site needs one'
      ],
      steps: [
        'Part 1 Recognize the emergency (10 min): alcohol poisoning, opioids, and fentanyl.',
        'Part 2 Decide what to do (7 min): handle it, get help, or call 911. Cover medical amnesty.',
        'Part 3 Act (25 min): recovery position, hands-only CPR, and the naloxone trainer.',
        'Part 4 Prevent: getting home safe (6 min) and the first-week checklist.',
        'Part 5 Practice scenarios (8 min).'
      ],
      after: [
        'This is not a certification course. No CPR card is issued.',
        'Return the adult manikin, unused Narcan trainers, and the AV kit.',
        ROOM,
        KIT_BACK
      ]
    },
    {
      id: 'all-kids-welcome',
      label: 'All Kids Welcome',
      match: function (ctx) { return ctx.name.indexOf('all kids welcome') >= 0; },
      supplies: [
        'Instructor Guide and the scenario answer key (instructor use)',
        'Name tags, a marker, and a pen or pencil per participant',
        'All Kids Welcome takeaway sheets, 1 per participant',
        'Laptop, speaker, and a projector if the site needs one'
      ],
      steps: [
        '60 minutes. Students should already have Safe Sitter or the Mindful Beginnings babysitting course.',
        'Part 1 Words that matter.',
        'Part 2 What you might see.',
        'Part 3 Before the job: talking to parents.',
        'Part 4 While you are babysitting.',
        'Part 5 Practice scenarios (5 scenarios).',
        'Part 6 Quick reference checklist.'
      ],
      after: [
        'Certificate of completion for every student.',
        'Return takeaway sheets, the AV kit, and the borrowed guide and answer key.',
        ROOM,
        KIT_BACK
      ]
    },
    {
      id: 'girl-scout-first-aid',
      label: 'Girl Scouts First Aid Badge Workshop',
      match: function (ctx) {
        var scout = ctx.name.indexOf('girl scout') >= 0;
        var firstAid = ctx.name.indexOf('first aid') >= 0;
        return (scout && firstAid) || (ctx.name.indexOf('first aid badge') >= 0);
      },
      supplies: [
        'Facilitator Guide, name tags or table tents, and a marker',
        '911 call-script cards (1 per scout or pair) and student handouts (1 per scout plus spares)',
        'Sign-in sheet if you have one, MB table sign, and business cards',
        'Nitrile gloves (2 or more pairs per scout), bandages, gauze, roller gauze, tape, and triangular bandages',
        'Antiseptic or saline wipes, 1 or 2 instant cold packs, staged-wound supplies, and the first aid demo tote',
        'Hand sanitizer and a trash bag',
        'Level add-ons from the facilitator guide for this troop (kit cards, scenario cards, or splint supplies)',
        'A CPR manikin only if this booking is the 2-hour cardiac add-on'
      ],
      steps: [
        'Above about 12 scouts, plan a second instructor for the hands-on blocks.',
        '0:00 Welcome and why first aid matters (3 min).',
        '0:03 Check-Call-Care (8 min).',
        '0:11 When to call 911 and the call script (7 min).',
        '0:18 First aid kit tour or build stations (8 min).',
        '0:26 Treat minor injuries, hands on (12 min).',
        '0:38 Outdoor or urgent add-on for this level (8 min).',
        '0:46 Scenario station with a staged injury (10 min).',
        '0:56 Wrap, badge-step summary for the troop leader, and questions (4 min).'
      ],
      after: [
        'Give the badge-step summary to the troop leader. Mindful Beginnings does not issue the badge.',
        'Throw away used gloves and wipes. Wipe staged-wound props and restock bandages.',
        ROOM,
        KIT_BACK
      ]
    },
    {
      id: 'girl-scout-badge',
      label: 'Girl Scout Badge Class',
      thin: true,
      thinNote: 'A minute-by-minute plan for this badge class is not on this sheet yet. Follow the troop facilitator guide for the badge on the booking.',
      match: function (ctx) {
        return ctx.name.indexOf('girl scout') >= 0 && ctx.name.indexOf('badge') >= 0;
      },
      supplies: [
        'Facilitator guide for the badge named on this booking',
        'Name tags, handouts (1 per scout plus spares), and the MB table sign',
        'Badge-step summary sheet for the troop leader'
      ],
      steps: [
        'Confirm the troop level and which badge steps this visit covers.',
        'Teach the hands-on steps in the facilitator guide for that badge.',
        'End by handing the troop leader the badge-step summary.'
      ],
      after: [
        'Mindful Beginnings does not issue Girl Scout badges. The troop leader does.',
        ROOM,
        KIT_BACK
      ]
    },
    {
      id: 'my-first-club-single',
      label: "My First Babysitter's Club single session",
      thin: true,
      thinNote: 'The 2.5-hour workshop agenda is in the facilitator guide. This sheet lists the skills the series covers, not a minute-by-minute plan.',
      match: function (ctx) {
        var club = ctx.name.indexOf('babysitter') >= 0 && ctx.name.indexOf('club') >= 0;
        return club && (ctx.name.indexOf('single') >= 0 || ctx.name.indexOf('2.5') >= 0 || ctx.name.indexOf('workshop') >= 0);
      },
      supplies: [
        'Facilitator Guide, club handbooks, certificates, and family take-home pages (1 per member)',
        'Name tags, practice dolls, diapers, wipes, and a changing pad',
        'Play phones and the activity cards for this workshop',
        'Basic first aid supplies: bandages, gauze, and gloves'
      ],
      steps: [
        'One 2.5-hour workshop, not the 8-week series.',
        'Cover the club pledge, safe-at-home role play, ages and stages, doll care, and little emergencies as the guide directs.',
        'Close with the review game and certificates.'
      ],
      after: [
        'Certificates and family take-home pages.',
        ROOM,
        KIT_BACK
      ]
    },
    {
      id: 'my-first-club',
      label: "My First Babysitter's Club",
      match: function (ctx) {
        return ctx.name.indexOf('babysitter') >= 0 && ctx.name.indexOf('club') >= 0;
      },
      supplies: [
        'Facilitator Guide, club handbooks, certificates, and family pages (1 per member)',
        'Name tags and a marker. No slides or AV.',
        'Seven posters: Club Pledge, High Five, Four Rules, BEST Care, 10 Diaper Steps, Make Your Call, Happy Kid Toolbox',
        'Card sets from the guide (Safe or Unsafe through Happy Kid Toolbox)',
        'Play phones (at least 4), a door prop, practice dolls, diapers, wipes, and a changing pad',
        'Bandages, gauze, gloves, tote bags, and fabric markers',
        'Up to 16 participants. Print and sign certificates before week 8.'
      ],
      steps: [
        'Week 1 Welcome to the Club: pledge, name tags, Safe or Unsafe scavenger hunt.',
        'Week 2 Safe at Home: door and phone role play.',
        'Week 3 My Safety Team: High Five and Safety Signal.',
        'Week 4 Ages and Stages: matching game and Who Am I?',
        'Week 5 BEST Care and doll practice, including the 10-step diaper change.',
        'Week 6 Keeping Kids Happy: four rules, and start the activity kits.',
        'Week 7 Little Emergencies: Make Your Call, first aid, and a mock 9-1-1.',
        'Week 8 Helper Business and Graduation: interviews, review game, and certificates.'
      ],
      after: [
        'Graduation certificates in week 8, plus family take-home pages.',
        'Return dolls, posters, cards, props, and extra handbooks.',
        ROOM,
        KIT_BACK
      ]
    },
    {
      id: 'little-medics',
      label: 'Little Medics',
      match: function (ctx) { return ctx.name.indexOf('little medic') >= 0; },
      supplies: [
        'Student handbook (1 per member) and the facilitator guide',
        'Name badges, weekly badge stickers, and certificates signed in advance',
        'Attendance and badge tracker',
        'Stuffed-animal patients, a real first aid kit with safe items only (no scissors, no medicine)',
        'Adhesive bandages, gauze, tape, child-size non-latex gloves, and cold packs',
        'Play phones, crayons, and a mat for Stop, Drop, and Roll',
        'Up to 12 members per instructor. Print one extra of each member item.'
      ],
      steps: [
        'Every meeting: check-in circle, story with a stuffed-animal patient, big steps with a chant, practice stations, a movement game, and badge time.',
        'Week 1 Welcome, Little Medics.',
        'Week 2 Tell It! Calm bodies, clear words.',
        'Week 3 9-1-1 Heroes.',
        'Week 4 Boo-Boo Basics.',
        'Week 5 Bumps, bruises, and nosebleeds.',
        'Week 6 Hot stuff: burns and fire safety.',
        'Week 7 Choking and safe eating.',
        'Graduation: challenge day and certificates. A 10-week club adds bites, stings, and weather.'
      ],
      after: [
        'Certificate and badge for every member at graduation.',
        'Update the attendance and badge tracker.',
        ROOM
      ]
    },
    {
      id: 'ready-period-virtual',
      label: 'Ready. Period. virtual',
      thin: true,
      thinNote: 'Zoom setup is below. The minute-by-minute virtual run of show is in the virtual facilitator guide.',
      match: function (ctx) {
        return ctx.name.indexOf('ready') >= 0 && ctx.name.indexOf('period') >= 0 && ctx.isVirtual;
      },
      supplies: [
        'Facilitator Guide (virtual) and the slide deck',
        '1 of each demo product plus a spare: pad, liner, tampon with applicator, period underwear, menstrual cup',
        '2 to 3 tablespoons of tinted water sealed in a clear jar, a tray or towel, and a sample packed pouch',
        'Roster and the troop leader cell number. Blank note for pasting questions.'
      ],
      steps: [
        '60 minutes, solo nurse. Waiting room on. Admit only roster names. Recording off.',
        'Chat set to host only. Participant sharing off. Mute on entry. No breakouts.',
        'Log in 15 minutes early. Cover slide up before you admit anyone.',
        'Ask families ahead of time: first name on screen, one pad, a glass of water, a big spoon, and a towel.'
      ],
      after: [
        'Send the virtual letter home to families.',
        'Note unanswered questions for Lindsay.',
        'Return demo products, the jar, and the sample pouch to the locked storage box.'
      ]
    },
    {
      id: 'ready-period',
      label: 'Ready. Period.',
      match: function (ctx) {
        return ctx.name.indexOf('ready') >= 0 && ctx.name.indexOf('period') >= 0;
      },
      supplies: [
        'Facilitator Guide. Nurse plus a craft facilitator. No posters or slides at seats.',
        'Question box, slips, and a pencil at every seat. Parent letters, 1 per girl. Silent timer.',
        'Blank zip pouches (1 per girl plus 3) and the craft supplies from the guide',
        'Kit per girl: 2 pads, 2 pantyliners, 2 tampons, a pocket tracker card, and an encouragement card',
        'Product table: pad, liner, and tampon to open, plus a clear cup of tinted water',
        '6 to 18 participants. Need a restroom and a sink.'
      ],
      steps: [
        '0:00 to 0:05 Doors and three rules. Everyone drops a question slip.',
        '0:05 to 0:20 Table talk (parts 1 and 2).',
        '0:20 to 0:35 The product table (part 3).',
        '0:35 to 0:42 The pouch check (part 4).',
        '0:42 to 0:52 The question box.',
        '0:52 to 0:58 Straight talk: moods and the doctor list (part 5).',
        '0:58 to 1:00 Closing. Parent letters at the door.'
      ],
      after: [
        'Hand out parent letters. No certificate for this workshop.',
        'Return pouches, craft supplies, products, and the question box.',
        ROOM,
        KIT_BACK
      ]
    },
    {
      id: 'social-ready',
      label: 'Social Ready',
      match: function (ctx) { return ctx.name.indexOf('social ready') >= 0; },
      supplies: [
        'Facilitator Guide and the 41-slide deck, plus a backup',
        'Family Tech Agreement, 1 per student plus extras',
        'Pencils, a silent timer, POST and PASS signs',
        '1 red card and 1 green card per student',
        'Travel toothpaste, a paper plate, and a toothpick for the Toothpaste Test'
      ],
      steps: [
        'Host adult stays the full hour. Phones stay put away. Chairs in a horseshoe if you are in a room.',
        '0:00 Welcome, ground rules, and the six words (4 min).',
        '0:04 Part 1 Post: Toothpaste Test and Post or Pass (9 min).',
        '0:13 Part 2 Protect: Photo Detective (9 min).',
        '0:22 Part 3 Verify: Red Flag, Green Flag (10 min).',
        '0:32 Part 4 Respect: Group Chat Rescue (9 min).',
        '0:41 Part 5 Balance: Spot the Hook (8 min).',
        '0:49 Part 6 Speak Up, then the six-word check and the Family Tech Agreement (11 min).'
      ],
      virtualSteps: [
        'Waiting room on, recording off, participant sharing off, chat open. A parent should be on the call.',
        '0:00 Welcome, ground rules, and the six words (4 min).',
        '0:04 Part 1 Post (9 min), Part 2 Protect (9 min), Part 3 Verify (10 min).',
        '0:32 Part 4 Respect (9 min), Part 5 Balance (8 min), Part 6 Speak Up (8 min).',
        '0:57 Six-word check, Family Tech Agreement, and close (3 min).'
      ],
      after: [
        'Students take home the Family Tech Agreement. No certificate for this workshop.',
        'Return agreements, signs, and cards. Discard used toothpaste.',
        ROOM,
        KIT_BACK
      ]
    },
    {
      id: 'grandparents-started',
      label: 'Grandparents: Getting Started',
      match: function (ctx) { return ctx.name.indexOf('grandparent') >= 0 && ctx.name.indexOf('grandkid') < 0 && ctx.name.indexOf('caregiving for') < 0; },
      supplies: [
        'Instructor Manual, name tags, and a marker',
        'Pen or pencil, 1 per participant',
        'Soft-bodied dolls and diapers',
        'Evaluation forms',
        'CPR and choking rescue update handouts'
      ],
      steps: [
        '3 hours, including a break. The Safe Sitter instructor login has the digital presentation.',
        'Safety and emergencies: choking rescue and CPR for infants and children, and first aid.',
        'Caring for grandchildren: safe sleep, ages and stages, feeding, and diapering.',
        'Managing behavior.',
        'Preventing injuries, room by room.',
        'Communication and expectations.'
      ],
      after: [
        'Safe Sitter certificate of completion. No CPR card is issued.',
        'Collect evaluations.',
        'Return manikins, dolls, diapers, booklets, and the AV kit.',
        ROOM,
        KIT_BACK
      ]
    },
    {
      id: 'grandkids-workshop',
      label: 'Babysitting Grandkids Workshop',
      thin: true,
      thinNote: 'Slide dividers are below. The minute-by-minute agenda is in the 60-minute facilitator guide.',
      match: function (ctx) {
        return ctx.name.indexOf('grandkid') >= 0 || ctx.name.indexOf('caregiving for') >= 0;
      },
      supplies: [
        'Facilitator Guide (60-minute workshop)',
        '32-slide deck on the laptop, plus a backup, and a projector or large screen',
        'Babysitting Your Grandkids takeaway sheets, 1 per participant, including large print'
      ],
      steps: [
        '60 minutes. Confirm the back row can read the slides. Speak slowly and repeat key numbers.',
        'Advance through the deck once before class. Part dividers are slides 4, 13, 19, and 26.',
        'Follow the 60-minute facilitator guide for the four parts.'
      ],
      after: [
        'Return leftover takeaway sheets (standard and large print) and the AV kit.',
        ROOM,
        KIT_BACK
      ]
    },
    {
      id: 'baby-ready-cpr',
      label: 'Baby Ready + CPR',
      thin: true,
      thinNote: 'Use the Baby Ready care blocks, then the pediatric CPR certification section in the certification materials. A combined minute-by-minute plan is not on this sheet yet.',
      match: function (ctx) {
        return ctx.name.indexOf('baby ready') >= 0 && ctx.name.indexOf('cpr') >= 0;
      },
      supplies: [
        'Baby Ready takeaway sheet, 1 per participant',
        'Newborn practice dolls, diapers, wipes, receiving blankets, a sleep sack, and a baby bottle',
        'Music or a metronome at 110 bpm',
        'Cleaning supplies for every station'
      ],
      steps: [
        'About 5 hours. 6 to 12 participants per nurse.',
        'Teach the Baby Ready care blocks: feeding, diaper and swaddle, safe sleep, crying, and when to call.',
        'Then teach the pediatric CPR certification skills for this add-on.',
        'Close with car seat, home, and the takeaway sheet.'
      ],
      after: [
        'Baby Ready + CPR certification card for each participant who completes the skills.',
        'Clean manikins and dolls before they go back in the bag.',
        'Send attendance to Lindsay within 24 hours.',
        ROOM,
        KIT_BACK
      ]
    },
    {
      id: 'baby-ready',
      label: 'Baby Ready',
      match: function (ctx) { return ctx.name.indexOf('baby ready') >= 0; },
      supplies: [
        'Facilitator Guide and the 21-slide deck',
        'Baby Ready takeaway sheet, 1 per participant (two-sided)',
        'Music or a metronome at 110 bpm',
        'Newborn practice dolls, diapers, and wipes',
        'Receiving blankets, a sleep sack, and a baby bottle',
        'Digital thermometer for the rectal demo on a doll',
        'Cleaning supplies and wipes for every station',
        '6 to 12 participants per nurse'
      ],
      steps: [
        'Set the room 30 minutes ahead: U or semicircle, one practice station per pair on a sturdy table.',
        '0:00 to 0:15 Welcome.',
        '0:15 to 1:00 Feeding, then everyday care practice (diaper and swaddle).',
        '1:00 to 1:20 Safe sleep and Spot the Hazard.',
        '1:20 to 1:30 Break. Wipe manikins.',
        '1:30 to 2:10 Crying and soothing, then when to call, the 100.4 F rule, and scenarios.',
        '2:10 to 2:45 Practice: choking rescue and CPR.',
        '2:45 to 3:00 Car seat, home, and you. Hand out takeaway sheets.'
      ],
      after: [
        'Clean and disinfect manikins and dolls before packing.',
        'Send attendance and any incident notes to Lindsay within 24 hours.',
        ROOM,
        KIT_BACK
      ]
    },
    {
      id: 'care-ready',
      label: 'Care Ready',
      match: function (ctx) { return ctx.name.indexOf('care ready') >= 0; },
      supplies: [
        'Facilitator Guide, name tents, and a marker',
        'Care Ready handbook, 1 per participant plus 2 spares, and completion certificates',
        'Sign-in sheet, pens, and the scenario card deck (behavior, triage, choking)',
        'Sample first aid kit, opened. Blue painter tape. MB table sign and business cards.',
        'Sanitizing wipes, a lined trash bag, and replacement lungs or face shields',
        'Infant doll, 2 diapers, wipes, and a changing pad',
        '6 to 16 participants. Above 12, plan a second instructor for hands-on blocks.'
      ],
      steps: [
        'Download the course videos to the instructor phone. Do not stream them.',
        '0:00 Professional caregiver role and four agreements (15 min).',
        '0:15 Ages and stages (15). 0:30 Behavior without punishment (17). 0:47 Daily care (20).',
        '1:07 Break (10 min).',
        '1:17 Injury prevention and safety sweep (15). 1:32 Triage and first aid (16).',
        '1:48 Choking rescue, hands on (20). 2:08 Infant and child CPR, hands on (20).',
        '2:28 Emergency plan and closing (2 min).'
      ],
      after: [
        'Certificate of completion. This is not a CPR card.',
        'Wipe manikins and restock lungs and face shields.',
        ROOM,
        KIT_BACK
      ]
    },
    {
      id: 'steady-and-ready',
      label: 'Steady and Ready',
      match: function (ctx) { return ctx.name.indexOf('steady and ready') >= 0; },
      supplies: [
        'Facilitator Guide and the slide deck',
        'Printed agenda per learner',
        'My Safety Plan worksheets, pencils, and clipboards',
        'Certificates of completion',
        'Borrowable fidgets and noise-reducing headphones',
        'Practice cards, and a toy or unplugged phone for 911 practice'
      ],
      steps: [
        'Read family intake notes before class: what helps calm, sensory needs, communication, and safety concerns.',
        '0:00 Title and the plan (4 min). 0:04 How we work (5). 0:09 Getting calm (9).',
        '0:18 Safe at home (10). 0:28 Brain break (4).',
        '0:32 When something goes wrong, 911 script (14).',
        '0:46 My safety plan (5). 0:51 Practice (4). 0:55 Recap (3).',
        '0:58 Close and certificates (2).'
      ],
      after: [
        'Hand out certificates.',
        'Email families the worksheet and certificate.',
        'Return fidgets, headphones, worksheets, and the AV kit.',
        ROOM
      ]
    },
    {
      id: 'safe-sitter',
      label: 'Safe Sitter Babysitting Course',
      match: function (ctx) {
        if (ctx.name.indexOf('grandparent') >= 0) return false;
        if (ctx.name.indexOf('instructor') >= 0) return false;
        return ctx.name.indexOf('safesitter') >= 0 || ctx.name.indexOf('safe sitter') >= 0;
      },
      supplies: [
        'Instructor Manual. It is the primary teaching resource. Speaker notes are only a guide.',
        'Name tags and a marker',
        'Safe Sitter badges when this class is a Girl Scout troop',
        'Student evaluation forms',
        'Game pouch (blue zipper), raffle ticket pouch, bingo prizes, tape, and a fake cell phone',
        'Soft-bodied dolls and disposable diapers',
        'CPR face shield protectors, 1 per participant',
        'Backup videos for choking, CPR, and diapering saved on the laptop in case Wi-Fi is weak'
      ],
      steps: [
        '5 hours with snack breaks and a meal break. Grades 6 to 9.',
        'Set up and test the digital presentation before students arrive.',
        'Safety and emergencies: recognizing an emergency, choking rescue, and CPR for infants and children.',
        'Rescue breathing and compressions, basic first aid, and when to call for help.',
        'Caring for children: ages and stages, holding, feeding, and diapering, behavior, and keeping kids busy and safe.',
        'Running a babysitting business: interviewing, rates, house rules, and when to say no.',
        'Hand out student evaluation forms before the end of class.'
      ],
      after: [
        'Safe Sitter certificate of completion for every student. No CPR card is issued.',
        'Put student evaluations in the labeled pouch. Parents also receive an evaluation.',
        'Wipe manikins and return unused face protectors, dolls, extra diapers, and the AV kit.',
        ROOM,
        KIT_BACK
      ]
    },
    {
      id: 'red-cross',
      label: 'American Red Cross certification',
      thin: true,
      thinNote: 'The Red Cross lesson plan is in the instructor manual, not on this sheet.',
      match: function (ctx) {
        var n = ctx.name;
        if (n.indexOf('red cross') >= 0) return true;
        if (n.indexOf('basic life support') >= 0 || n.indexOf('bls') >= 0) return true;
        if (n.indexOf('group cpr') >= 0) return true;
        if (n.indexOf('babysitter') >= 0 && n.indexOf('training') >= 0) return true;
        return n.indexOf('first aid') >= 0 && n.indexOf('cpr') >= 0 && n.indexOf('aed') >= 0;
      },
      supplies: [
        'Red Cross instructor manual for this certification',
        'Manikins and AED trainers so everyone can practice. Class cap is 12.',
        'Babysitter Training handbook, 1 per participant, when this is Babysitter Training'
      ],
      steps: [
        'Follow the Red Cross instructor manual for this certification from start to finish.',
        'Confirm the roster against the class cap of 12 before you start skills practice.'
      ],
      after: [
        'Official Red Cross digital certificate after successful completion.',
        'Babysitter Training certificates are the 10-year babysitting credential. FA, CPR, and AED cards are 2-year certifications.',
        'Clean manikins before they go back in the bag.',
        ROOM,
        KIT_BACK
      ]
    },
    {
      id: 'pet-sitters-club',
      label: "Pet Sitter's Club",
      thin: true,
      thinNote: 'Teaching steps for this club are not on this sheet yet. Follow the club facilitator guide.',
      match: function (ctx) { return ctx.name.indexOf('pet sitter') >= 0; },
      supplies: ['Club handbook and the take-home items named in the after-school club description'],
      steps: [],
      after: [ROOM]
    },
    {
      id: 'snack-squad',
      label: 'Snack Squad',
      thin: true,
      thinNote: 'Teaching steps for this club are not on this sheet yet. Follow the club facilitator guide.',
      match: function (ctx) { return ctx.name.indexOf('snack squad') >= 0; },
      supplies: ['Club handbook and the take-home items named in the after-school club description'],
      steps: [],
      after: [ROOM]
    },
    {
      id: 'kid-boss',
      label: 'Kid Boss Club',
      thin: true,
      thinNote: 'Teaching steps for this club are not on this sheet yet. Follow the club facilitator guide.',
      match: function (ctx) { return ctx.name.indexOf('kid boss') >= 0; },
      supplies: ['Club handbook and the take-home items named in the after-school club description'],
      steps: [],
      after: [ROOM]
    },
    {
      id: 'middle-school-here',
      label: 'Middle School, Here I Come',
      thin: true,
      thinNote: 'Teaching steps for this club are not on this sheet yet. Follow the club facilitator guide.',
      match: function (ctx) { return ctx.name.indexOf('middle school here i come') >= 0 || ctx.name.indexOf('here i come') >= 0; },
      supplies: ['Club handbook and the take-home items named in the after-school club description'],
      steps: [],
      after: [ROOM]
    },
    {
      id: 'big-sibling',
      label: 'Big Sibling Club',
      thin: true,
      thinNote: 'Teaching steps for this club are not on this sheet yet. Follow the club facilitator guide.',
      match: function (ctx) { return ctx.name.indexOf('big sibling') >= 0; },
      supplies: ['Club handbook and the take-home items named in the after-school club description'],
      steps: [],
      after: [ROOM]
    },
    {
      id: 'my-first-phone',
      label: 'My First Phone',
      thin: true,
      thinNote: 'Teaching steps for this club are not on this sheet yet. Follow the club facilitator guide.',
      match: function (ctx) { return ctx.name.indexOf('my first phone') >= 0 || ctx.name.indexOf('first phone') >= 0; },
      supplies: ['Club handbook and the take-home items named in the after-school club description'],
      steps: [],
      after: [ROOM]
    },
    {
      id: 'walk-and-roll',
      label: 'Walk and Roll Ready',
      thin: true,
      thinNote: 'Teaching steps for this club are not on this sheet yet. Follow the club facilitator guide.',
      match: function (ctx) { return ctx.name.indexOf('walk and roll') >= 0; },
      supplies: ['Club handbook and the take-home items named in the after-school club description'],
      steps: [],
      after: [ROOM]
    },
    {
      id: 'calm-and-ready',
      label: 'Calm and Ready',
      thin: true,
      thinNote: 'Teaching steps for this club are not on this sheet yet. Follow the club facilitator guide.',
      match: function (ctx) { return ctx.name.indexOf('calm and ready') >= 0; },
      supplies: ['Club handbook and the take-home items named in the after-school club description'],
      steps: [],
      after: [ROOM]
    },
    {
      id: 'middle-school-ready',
      label: 'Middle School Ready',
      thin: true,
      thinNote: 'Teaching steps for Middle School Ready are not on this sheet yet. Follow the facilitator guide.',
      match: function (ctx) { return ctx.name.indexOf('middle school ready') >= 0; },
      supplies: ['Facilitator guide and student take-home pages, 1 per student'],
      steps: [],
      after: [ROOM]
    },
    {
      id: 'screen-ready',
      label: 'Screen Ready',
      thin: true,
      thinNote: 'Teaching steps for Screen Ready are not on this sheet yet. Follow the facilitator guide.',
      match: function (ctx) { return ctx.name.indexOf('screen ready') >= 0; },
      supplies: ['Facilitator guide and student take-home pages, 1 per student'],
      steps: [],
      after: [ROOM]
    },
    {
      id: 'lunchroom',
      label: 'Lunchroom Lifesaver',
      thin: true,
      thinNote: 'Teaching steps for Lunchroom Lifesaver are not on this sheet yet. Follow the facilitator guide.',
      match: function (ctx) { return ctx.name.indexOf('lunchroom') >= 0; },
      supplies: ['Facilitator guide and the practice supplies named in that guide'],
      steps: [],
      after: [ROOM]
    },
    {
      id: 'safe-ready-families',
      label: 'Safe and Ready Families',
      thin: true,
      thinNote: 'Teaching steps for Safe and Ready Families are not on this sheet yet. Follow the facilitator guide.',
      match: function (ctx) { return ctx.name.indexOf('safe') >= 0 && ctx.name.indexOf('ready families') >= 0; },
      supplies: ['Facilitator guide and adult take-home pages, 1 per participant'],
      steps: [],
      after: [ROOM]
    }
  ];

  function looksLikeEvent(session) {
    if (!session) return false;
    if (session.isVendorFair) return true;
    var code = String(session.code || '').trim().toUpperCase();
    if (code.indexOf('RUA-') === 0) return true;
    var name = norm(session.course);
    return /represent us|\bvendor\b|\bbooth\b|\btable\b|\bfair\b|\bfest\b|welcome event|\bexpo\b|shopping event|market booth/.test(name);
  }

  function sheetKind(session) {
    if (!session) return 'event';
    if (looksLikeEvent(session)) return 'event';
    if (findCourse(session.course, session)) return 'class';
    if (session.isCustomJob) return 'event';
    return 'class';
  }

  function findCourse(name, input) {
    var ctx = {
      name: norm(name),
      isVirtual: !!(input && input.isVirtual) || norm(name).indexOf('virtual') >= 0
    };
    for (var i = 0; i < COURSES.length; i++) {
      if (COURSES[i].match(ctx)) return COURSES[i];
    }
    return null;
  }

  function buttonLabel(kind) {
    return kind === 'event' ? 'Print packing sheet (PDF)' : 'Print checklist (PDF)';
  }

  function esc(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (ch) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch];
    });
  }

  function formatWhen(date, time) {
    var ymd = String(date || '');
    var dt = new Date(ymd + 'T12:00:00');
    var day = ymd && !isNaN(dt.getTime())
      ? dt.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' })
      : (ymd || 'Date not set');
    var clock = String(time || '').trim();
    return clock ? (day + ' at ' + clock) : (day + '. Time not set');
  }

  function headcount(registered, expected) {
    var reg = Math.max(0, Math.floor(Number(registered) || 0));
    var expNum = Number(expected);
    var exp = isFinite(expNum) && expNum > 0 ? Math.floor(expNum) : null;
    var packFor = exp == null ? reg : Math.max(reg, exp);
    var people = reg + (reg === 1 ? ' participant registered' : ' participants registered');
    if (exp != null) people += '. Participants expected: ' + exp;
    var pack = packFor > 0
      ? ('Pack for ' + packFor + '.')
      : 'Headcount is not set yet. Use the standard kit until a count is in.';
    return { registered: reg, expected: exp, packFor: packFor, people: people, pack: pack };
  }

  function kitText(lines) {
    return (lines || []).join(' ').toLowerCase();
  }

  function alreadyPacked(line, packed) {
    var n = norm(line);
    if (!n) return true;
    function has(word) { return packed.indexOf(word) >= 0; }
    if (has('handbook') && n.indexOf('handbook') >= 0) return true;
    if (has('booklet') && n.indexOf('booklet') >= 0) return true;
    if (has('notebook') && n.indexOf('notebook') >= 0) return true;
    if (has('certificate') && n.indexOf('certificate') >= 0 && n.indexOf('completion') >= 0) return true;
    if (has('infant manikin') && n.indexOf('infant manikin') >= 0) return true;
    if (has('child manikin') && n.indexOf('child manikin') >= 0) return true;
    if (has('adult manikin') && n.indexOf('adult manikin') >= 0) return true;
    if (has('batter') && n.indexOf('batter') >= 0) return true;
    return false;
  }

  function isGenericAvLine(line) {
    return /^\d+ av kits?$/.test(norm(line));
  }

  function isAvSupplyLine(line) {
    var n = norm(line);
    if (isGenericAvLine(line)) return true;
    if (n.indexOf('hdmi') >= 0 || n.indexOf('power strip') >= 0) return true;
    if (n.indexOf('laptop') >= 0 && (n.indexOf('speaker') >= 0 || n.indexOf('projector') >= 0)) return true;
    if (n.indexOf('projector') >= 0 && n.indexOf('host provides the wall') >= 0) return true;
    return false;
  }

  function sessionNeedsAvParts(course, input, kit) {
    if (input && input.isVirtual) return false;
    if ((kit || []).some(isGenericAvLine)) return true;
    return !!(course && AV_COURSE_IDS[course.id]);
  }

  function supplyList(course, input) {
    var kit = (input.kitLines || []).map(function (line) { return String(line || '').trim(); }).filter(Boolean);
    var packed = kitText(kit);
    var extra = course ? (course.supplies || []).slice() : [];
    if (course && course.id === 'safe-sitter' && input.girlScout) {
      extra = extra.map(function (line) {
        if (line.indexOf('Safe Sitter badges') === 0) return 'Safe Sitter troop badges, 1 per scout';
        return line;
      });
    }
    if (course && course.id === 'red-cross') {
      extra = extra.filter(function (line) {
        if (line.indexOf('Babysitter Training handbook') >= 0) return arcHandbook(norm(input.course));
        return true;
      });
    }
    if (input.isVirtual) {
      kit = kit.filter(function (line) { return !isAvSupplyLine(line); });
      packed = kitText(kit);
      extra = extra.filter(function (line) {
        var n = norm(line);
        if (isAvSupplyLine(line)) return false;
        if (n.indexOf('manikin') >= 0) return false;
        if (n.indexOf('projector') >= 0) return false;
        return true;
      });
    } else if (sessionNeedsAvParts(course, input, kit)) {
      extra = extra.filter(function (line) {
        var n = norm(line);
        return !(n.indexOf('laptop') >= 0 && n.indexOf('projector') >= 0 && n.indexOf('if the site') >= 0);
      });
      AV_PARTS.forEach(function (line) {
        if (extra.indexOf(line) < 0) extra.push(line);
      });
    }
    var merged = kit.slice();
    extra.forEach(function (line) {
      if (!alreadyPacked(line, packed)) merged.push(line);
    });
    if (!merged.length) {
      merged.push(input && sheetKind(input) === 'event'
        ? 'No course kit is listed. Pack what the session notes say to bring.'
        : 'No extra kit is listed for this course. Pack what the facilitator guide names.');
    }
    return merged;
  }

  function stepList(course, input) {
    if (!course) return [];
    if (input.isVirtual && course.virtualSteps && course.virtualSteps.length) return course.virtualSteps.slice();
    var steps = (course.steps || []).slice();
    if (input.isVirtual && course.id !== 'safe-at-home-virtual' && course.id !== 'ready-period-virtual') {
      steps.unshift('This session is on Zoom. Test the link, slides, and sound before anyone joins.');
    }
    if (course.id === 'red-cross') {
      var note = arcLengthNote(norm(input.course));
      if (note) steps.unshift(note);
    }
    return steps;
  }

  function taskList(input) {
    return (input.tasks || []).map(function (task) {
      if (!task) return null;
      if (typeof task === 'string') return { label: task, done: false };
      return { label: String(task.label || ''), done: !!task.done };
    }).filter(function (task) { return task && task.label; });
  }

  function buildSheet(input) {
    input = input || {};
    var kind = sheetKind(input);
    var course = kind === 'class' ? findCourse(input.course, input) : null;
    var counts = headcount(input.registered, input.expected);
    var whereLabel = input.isVirtual ? 'Zoom' : 'Where';
    var where = input.isVirtual
      ? (String(input.zoom || '').trim() || 'Zoom link not set')
      : (String(input.place || '').trim() || 'Location not set');
    var status = [];
    if (input.isHold) status.push('On hold');
    if (input.isCancelled) status.push('Cancelled');
    var thinNote = '';
    var steps = [];
    var after = [];
    if (kind === 'class') {
      if (!course) {
        thinNote = 'Teaching steps for this course are not on this sheet yet. Follow the facilitator guide.';
      } else if (course.thin) {
        thinNote = course.thinNote || 'Teaching steps for this course are not on this sheet yet. Follow the facilitator guide.';
      }
      steps = stepList(course, input);
      after = course ? (course.after || []).slice() : [];
    }
    return {
      kind: kind,
      courseId: course ? course.id : '',
      title: kind === 'event' ? 'Packing sheet' : 'Teaching checklist',
      course: String(input.course || '').trim() || (kind === 'event' ? 'Session' : 'Class'),
      when: formatWhen(input.date, input.time),
      whereLabel: whereLabel,
      where: where,
      instructor: String(input.instructor || '').trim() || 'No instructor',
      hostLabel: String(input.hostLabel || '').trim() || 'Host',
      host: String(input.host || '').trim() || 'No host',
      code: String(input.code || '').trim() || 'not set',
      troop: String(input.troop || '').trim(),
      status: status.join('. '),
      people: counts.people,
      pack: counts.pack,
      tasks: taskList(input),
      supplies: supplyList(course, input).map(function (label) { return { label: label, done: false }; }),
      steps: steps,
      after: after.map(function (label) { return { label: label, done: false }; }),
      thinNote: thinNote,
      eventNote: kind === 'event' ? 'This is not a taught class. No teaching steps.' : ''
    };
  }

  function checkItem(item) {
    var mark = item.done ? '&#9745;' : '&#9744;';
    var cls = item.done ? ' class="is-done"' : '';
    return '<li' + cls + '><span class="mark" aria-hidden="true">' + mark + '</span> ' + esc(item.label) + '</li>';
  }

  function sheetHtml(model) {
    var sheet = model && model.title ? model : buildSheet(model || {});
    var tasks = sheet.tasks.length
      ? sheet.tasks.map(checkItem).join('')
      : '<li class="is-done"><span class="mark" aria-hidden="true">&#9744;</span> No pre-class boxes on the dashboard for this session.</li>';
    var supplies = sheet.supplies.map(checkItem).join('');
    var steps = '';
    if (sheet.kind === 'class') {
      var body = sheet.steps.length
        ? '<ol>' + sheet.steps.map(function (step) { return '<li>' + esc(step) + '</li>'; }).join('') + '</ol>'
        : '';
      var note = sheet.thinNote ? '<p class="thin">' + esc(sheet.thinNote) + '</p>' : '';
      steps = '<section><h2>Teaching steps</h2>' + note + body + '</section>';
    }
    var after = sheet.after.length
      ? '<section><h2>After class</h2><ul class="checks">' + sheet.after.map(checkItem).join('') + '</ul></section>'
      : '';
    var event = sheet.eventNote ? '<p class="event-note">' + esc(sheet.eventNote) + '</p>' : '';
    var troop = sheet.troop ? '<div>' + esc(sheet.troop) + '</div>' : '';
    var status = sheet.status ? '<div class="status">' + esc(sheet.status) + '</div>' : '';
    return '<article class="teach-sheet" data-kind="' + esc(sheet.kind) + '" data-course="' + esc(sheet.courseId) + '">'
      + '<header class="teach-head"><div class="teach-brand">Mindful Beginnings</div>'
      + '<h1>' + esc(sheet.title) + '</h1>'
      + '<p class="teach-course">' + esc(sheet.course) + '</p>'
      + status
      + '<p class="teach-meta">' + esc(sheet.when) + '</p>'
      + '<p class="teach-meta">' + esc(sheet.whereLabel) + ': ' + esc(sheet.where) + '</p>'
      + '<p class="teach-meta">Instructor: ' + esc(sheet.instructor) + '. ' + esc(sheet.hostLabel) + ': ' + esc(sheet.host) + '</p>'
      + '<p class="teach-meta">Code: ' + esc(sheet.code) + '. ' + esc(sheet.people) + '</p>'
      + troop
      + event
      + '</header>'
      + '<section><h2>Before class</h2><ul class="checks">' + tasks + '</ul></section>'
      + '<div class="teach-cols"><section><h2>Supplies</h2><p class="pack-for">' + esc(sheet.pack) + ' Boxes start blank.</p><ul class="checks">' + supplies + '</ul></section>'
      + steps
      + '</div>'
      + after
      + '</article>';
  }

  var api = {
    norm: norm,
    courses: function () {
      return COURSES.map(function (course) {
        return { id: course.id, label: course.label, thin: !!course.thin };
      });
    },
    findCourse: findCourse,
    sheetKind: sheetKind,
    buttonLabel: buttonLabel,
    buildSheet: buildSheet,
    sheetHtml: sheetHtml
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBTeachingChecklist = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
