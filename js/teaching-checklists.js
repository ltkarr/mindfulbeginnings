/* Printable teaching checklists for the admin dashboard.

   The site did not store checklist text. These sheets are the current
   Drive checklists, not the ARCHIVE copies:

   - Mindful Beginnings Teaching Checklists (DRAFT), updated 2026-11-02
   - Girl Scouts First Aid Badge Workshop Teaching Checklist, 2026-10-29
     (replaces the Girl Scouts section in the draft, which still listed
     staged-wound supplies)
   - Red Cross Babysitter's Training + Pediatric First Aid/CPR/AED
   - Adult & Pediatric First Aid/CPR/AED Certification
   - Workplace Red Cross CPR, AED, and First Aid

   Lines that only said the item was not in Drive are omitted.
   Safe Sitter Babysitting Essentials has no checklist of its own in Drive.
   That sheet uses the shared Safe Sitter pack list and the published
   4-hour course, which does not include the CPR module.
   Baby Ready + CPR uses the Baby Ready sheet plus the certification
   lines the draft did record.
*/
(function (root) {
  'use strict';

  var ROOM = 'Return the room to its original condition: clear food and drinks, push in chairs, and take all materials.';
  var LOCKBOX = 'Return all materials within 24 hours unless teaching another course. Return them to the locked storage box.';

  function sec(title, items) {
    return { title: title, items: items };
  }

  function sheet(id, title, sections, extra) {
    var out = { id: id, title: title, sections: sections };
    extra = extra || {};
    if (extra.note) out.note = extra.note;
    if (extra.foot) out.foot = extra.foot;
    return out;
  }

  var RC_NOTE = 'Rosters are emailed to instructors before class starts. American Red Cross certified class.';
  var RC_HANDS = [
    '2 adult manikins',
    '2 child / pediatric manikins',
    '2 infant manikins',
    'AED trainers (as needed)',
    'Batteries and screwdriver',
    'Manikin face shields and replacement lungs (as needed, stocked at each station)',
    'CPR breathing barriers / face shields (one per participant)',
    'Disposable gloves (assorted sizes, as needed)',
    'First aid practice supplies: bandages, gauze, roller bandages, triangular bandages, tape (as needed)',
    'First aid kit',
    'Mats for child and adult manikin floor stations',
    'Cleaning / sanitizing wipes and hand sanitizer'
  ];
  var RC_CLEAN = [
    ROOM,
    'Wipe manikin faces and AED trainer pads between users. Replace used lungs and face shields.',
    'Record each participant\'s skills and written test results on the roster'
  ];
  var RC_AFTER = [
    'Enter course results in the Red Cross Learning Center within 24 hours so digital certificates issue to participants',
    'Give the signed roster, sign-in sheet, and skills checklists to Mindful Beginnings'
  ];
  var RC_RETURN = [
    '2 adult, 2 child / pediatric, and 2 infant manikins',
    'AED trainers, batteries, and screwdriver',
    'Unused lungs and face shields, breathing barriers, gloves, and cleaning supplies',
    'First aid kit and unused bandage practice supplies',
    'Laptop, speakers, and projector, if applicable',
    'All extra and unused materials and supplies',
    'Return all materials to the locked storage box'
  ];

  function rcSheet(id, title, materials) {
    return sheet(id, title, [
      sec('Course materials', materials),
      sec('Hands-on practice', RC_HANDS),
      sec('Clean up', RC_CLEAN),
      sec('After class', RC_AFTER),
      sec('Return items', RC_RETURN)
    ], { note: RC_NOTE });
  }

  var RC_COMMON_MATERIALS = [
    'Red Cross Instructor Manual and Instructor Guide for this course',
    'Red Cross course videos and presentation (AV kit: laptop, speaker, projector if the site requires). Set up and test before participants arrive.',
    'Name tags for each participant and instructor',
    'Marker for printing names on name tags',
    'Printed roster / sign-in sheet',
    'Red Cross skills checklists (one per participant)',
    'Pens'
  ];

  var BABY_READY_SECTIONS = [
    sec('Before class', [
      'Review the roster emailed before class starts',
      '3 hours with a 10-minute break. 6 to 12 participants per nurse.',
      'Test the 21-slide deck, screen, and sound',
      'Room setup 30 minutes before: U or semicircle seating, one practice station per pair on sturdy tables, chairs so no one kneels',
      'Takeaway sheet at each seat. Locate restrooms and exits.'
    ]),
    sec('Supplies and equipment', [
      'Facilitator Guide',
      'Baby Ready takeaway sheet, 1 per participant (two-sided)',
      'Music or a metronome at 110 bpm',
      'Infant CPR manikins, 1 per 2 participants, plus replacement lungs or face shields',
      'Newborn practice dolls, diapers, and wipes',
      'Receiving blankets and a sleep sack, and a baby bottle',
      'Digital thermometer (rectal demo on a doll)',
      'Cleaning supplies and wipes for every station'
    ]),
    sec('Teaching steps', [
      '0:00 to 0:15 Welcome',
      '0:15 to 0:40 Feeding',
      '0:40 to 1:00 Practice: everyday care (diaper, swaddle)',
      '1:00 to 1:20 Safe sleep, Spot the Hazard',
      '1:20 to 1:30 Break (wipe manikins)',
      '1:30 to 1:50 Crying and soothing',
      '1:50 to 2:10 When to call, the 100.4 F rule, scenarios',
      '2:10 to 2:45 Practice: choking rescue and CPR',
      '2:45 to 2:55 Car seat, home, and you',
      '2:55 to 3:00 Close, and hand out takeaway sheets'
    ]),
    sec('After class', [
      'Clean and disinfect all manikins and dolls before packing',
      'Submit attendance and incident notes to Lindsay within 24 hours',
      'Return manikins, dolls, care supplies, extra sheets, and the AV kit',
      ROOM
    ])
  ];

  var CHECKS = [
    sheet('safe-sitter', 'Safe Sitter Babysitting Course', [
      sec('Before class', [
        'Review the roster emailed before class starts',
        'Set up and test the digital presentation (laptop, speaker, projector if the site requires). Download it from the Safe Sitter presentation page. Instructor login is required.',
        'Your Instructor Manual is the primary teaching resource. Speaker notes are a general guide only.',
        'Save backup videos (choking, CPR, diapering, and similar clips) to the laptop in case Wi-Fi is weak'
      ]),
      sec('Supplies and equipment', [
        'Instructor Manual',
        'Name tags for each participant and instructor (cardstock for table tents if preferred), and a marker',
        'Safe Sitter Student Handbook, 1 per student',
        'Safe Sitter Important Information Note Pad, 1 per student',
        'Safe Sitter badges (Girl Scout and Boy Scout troops only)',
        'Student Evaluation Forms',
        'Game pouch (blue zippered) and raffle ticket pouch',
        'Bingo prizes, tape, and a fake cell phone',
        'Soft-bodied dolls and disposable diapers',
        'Infant manikin and child manikin (1 each for 8 or fewer students, 2 each above 8)',
        'Batteries and screwdriver',
        'CPR face shield protectors, 1 per participant'
      ]),
      sec('Teaching steps', [
        'Course is 5 hours with snack breaks and a meal break. Grades 6 to 9.',
        'Safety and emergencies: recognizing an emergency, choking rescue and CPR for infants and children, rescue breathing and compressions, basic first aid, and when to call for help',
        'Caring for children: ages and stages, holding, feeding, and diapering an infant, managing behavior, and keeping kids busy and safe',
        'Running a babysitting business: interviewing, rates, house rules, and when to say no',
        'Distribute Student Evaluation Forms before the end of class'
      ]),
      sec('After class', [
        'Safe Sitter certificate of completion for every student (no CPR card is issued)',
        'Put Student Evaluations in the labeled pouch. Parents also receive an evaluation.',
        'Return infant and child manikins, unused face protectors, dolls, extra diapers, and the AV kit',
        ROOM,
        LOCKBOX
      ])
    ], { note: 'Rosters are emailed to instructors before class starts.' }),

    sheet('ss-essentials', 'Safe Sitter Babysitting Essentials', [
      sec('Before class', [
        'Review the roster emailed before class starts',
        'Set up and test the digital presentation (laptop, speaker, projector if the site requires). Instructor login is required.',
        'The Babysitting Essentials facilitator guide is the class script. This 4-hour course does not include the CPR module.'
      ]),
      sec('Supplies and equipment', [
        'Facilitator guide',
        'Name tags for each participant and instructor, and a marker',
        'Safe Sitter Student Handbook, 1 per student',
        'Safe Sitter Important Information Note Pad, 1 per student',
        'Student Evaluation Forms',
        'Soft-bodied dolls and disposable diapers',
        'Infant manikin and child manikin for choking-rescue practice (1 each for 8 or fewer students, 2 each above 8)',
        'Batteries and screwdriver',
        'CPR face shield protectors, 1 per participant',
        'Laptop, speaker, and projector if the site requires'
      ]),
      sec('Teaching steps', [
        '4 hours. Ages 11 to 14.',
        'Safety, child care basics, and behavior management',
        'Choking rescue, with hands-on practice',
        'Follow the Babysitting Essentials facilitator guide. Do not teach the CPR module.',
        'Hand out the completion card. No CPR card is issued.'
      ]),
      sec('After class', [
        'Safe Sitter completion card for every student',
        'Collect Student Evaluations',
        'Return manikins, unused face protectors, dolls, extra diapers, and the AV kit',
        ROOM,
        LOCKBOX
      ])
    ], { note: 'Rosters are emailed to instructors before class starts. 4-hour course. No CPR certification.' }),

    sheet('intro-babysitting', 'Intro to Safe Babysitting', [
      sec('Before class', [
        'Review the roster emailed before class starts',
        'Set up and test the digital presentation',
        'Students may bring a soft-bodied doll from home. The facilitator provides diapers.'
      ]),
      sec('Supplies and equipment', [
        'Instructor Manual / Facilitator Guide',
        'Name tags (cardstock for table tents if preferred), and a marker',
        'Intro to Babysitting handbook, 1 per student',
        'Pen or pencil, 1 per student',
        'Diapers and soft-bodied dolls for diapering practice',
        'Digital presentation (laptop, speaker, projector if the site requires)'
      ]),
      sec('Teaching steps', [
        '60 minutes, grades 6 to 8. Follow the scripted guided discussion.',
        'Ages and stages',
        'Child care essentials: BEST routines, safe sleep, choking hazards, diapering demonstration and practice, handwashing, and games',
        'Behavior management: four rules, six tips, and when to call a backup adult or 911',
        'Preventing injuries: think like a bodyguard',
        'End-of-class review quiz'
      ]),
      sec('After class', [
        'Safe Sitter Child Care Skills patch for every student (no Safe Sitter certificate)',
        'Collect Student Evaluations',
        'Return unused booklets, supplies, and the AV kit',
        ROOM,
        LOCKBOX
      ])
    ]),

    sheet('safe-at-home', 'Safe@Home (90 minutes)', [
      sec('Before class', [
        'Review the roster emailed before class starts',
        'Set up the digital presentation (PDF, full screen). Page numbers in the script tell you which slide to show.',
        'The Instructor Manual / Facilitator Guide is the primary resource'
      ]),
      sec('Supplies and equipment', [
        'Instructor Manual / Safe@Home Facilitator Guide',
        'Name tags and a marker',
        'Safe@Home student handbooks, 1 per student',
        'Safe@Home completion certificates, 1 per student',
        'Pencils or pens, 1 per participant',
        'Digital presentation (laptop, speaker, projector if the site requires)'
      ]),
      sec('Teaching steps', [
        'Welcome and guided discussion',
        'Safe habits',
        'Handling emergencies',
        'Preventing injuries',
        'Injury management and the Safe@Home First Aid Chart',
        'Quiz and readiness check',
        'Parent pages',
        'Have students complete the Safe@Home student evaluation'
      ]),
      sec('After class', [
        'Safe@Home completion certificate for each participant',
        'Collect student evaluations',
        'Return extra booklets, supplies, and the AV kit',
        ROOM,
        LOCKBOX
      ])
    ]),

    sheet('safe-at-home-series', 'Safe@Home 8-week series', [
      sec('Before class', [
        'Review the roster emailed before class starts',
        'Pack each week\'s materials before that meeting'
      ]),
      sec('Supplies and equipment', [
        'Every week: Facilitator Guide (8-week), student booklets 1 per participant, name tents or tags, and a group expectations poster or whiteboard',
        'Week 1: door prop or classroom door',
        'Week 2: sample weak passwords, and outdoor scenario cards',
        'Week 3: High Five poster, and permission role-play cards',
        'Week 4: travel scenario cards, Safety Signal cards, and phone props',
        'Week 5: phone props (1 per pair), 911 dispatcher scripts, and emergency scenario cards',
        'Week 6: illustrated room scenes (1 set per team), and hazard category cards',
        'Week 7: scenario station cards, station signs, and props',
        'Week 8: showcase scenario cards, course quizzes, completion cards, and parent pages'
      ]),
      sec('Teaching steps', [
        'Week 1: Am I Ready to Be Home Alone? Door-knock role play',
        'Week 2: Outdoor and Online Safety. Strong password challenge',
        'Week 3: Personal Safety and the High Five. Permission role play',
        'Week 4: Travel Safely and the Safety Signal. Safety Signal role play',
        'Week 5: Handling Emergencies. Mock 911 calls',
        'Week 6: Preventing Injuries. Hazard hunt',
        'Week 7: Injury Management and the First Aid Chart. Scenario stations',
        'Week 8: Review, quiz and readiness check, parent pages, and completion cards',
        'Have students complete the Safe@Home student evaluation'
      ]),
      sec('After class', [
        'Completion cards at week 8',
        'Send parent pages home',
        'Return unused booklets, completion cards, parent pages, scenario cards, posters, station signs, phone props, and the AV kit',
        ROOM,
        LOCKBOX
      ])
    ]),

    sheet('safe-at-home-virtual', 'Safe@Home virtual (60 minutes)', [
      sec('Before class', [
        'Review the roster emailed before class starts',
        'Facilitator Guide (60-minute virtual) on a second screen or printed',
        'Deck in presenter view. Share that window only.',
        'Chat on for everyone, and reactions enabled',
        'Quiz answer key handy',
        'Plan for mailing or emailing completion cards'
      ]),
      sec('Teaching steps', [
        'Have students complete the Safe@Home student evaluation',
        'Follow the 60-minute virtual facilitator guide for the class script'
      ]),
      sec('After class', [
        'Mail or email completion cards',
        'Send parent pages home'
      ])
    ]),

    sheet('stay-ready', 'Stay Ready', [
      sec('Before class', [
        'Review the roster emailed before class starts',
        'Room setup 15 minutes before: infant manikins on tables, child and adult manikins on mats on the floor, one station per 2 to 3 students, open mat space for seizure practice',
        'Clean and check every manikin. Stock wipes and replacement lungs and face shields at each station.',
        'Load the 14-slide deck. Cue music or a metronome at 110 bpm.',
        'Takeaway sheet at each seat',
        'Review the 2025 guideline updates: child choking is 5 back blows and 5 abdominal thrusts, infant chest thrusts use the heel of one hand, and there is no two-finger infant CPR'
      ]),
      sec('Supplies and equipment', [
        'Facilitator Guide',
        'Name tags and a marker',
        'Printed takeaway sheets, 1 per seat',
        'Timer, and music or a metronome at 110 bpm',
        'Infant, child, and adult manikins (1 per 2 to 3 students)',
        'Batteries and screwdriver',
        'Replacement lungs and face shields at each station, and cleaning supplies',
        'Mats or clear floor space for seizure practice',
        'Up to 12 students. 1 facilitator per 6 students is recommended.'
      ]),
      sec('Teaching steps', [
        '0:00 to 0:07 Welcome and why we practice (slides 1 to 3)',
        '0:07 to 0:12 Demo: choking rescue (slides 4 to 6)',
        '0:12 to 0:27 Practice: choking stations in pairs (slide 7)',
        '0:27 to 0:32 Demo: CPR (slides 8 to 9)',
        '0:32 to 0:50 Practice: CPR stations. Rotate every 6 minutes through infant, child, and adult. 2 minutes of 30:2 each (slide 10).',
        '0:50 to 0:57 Rapid-fire scenarios (slide 11)',
        '0:57 to 1:00 Demo: seizure response (slides 12 to 13)',
        '1:00 to 1:12 Practice: seizure stations in pairs (slide 14)',
        '1:12 to 1:15 Close face to face, and hand out remaining takeaway sheets'
      ]),
      sec('After class', [
        'Wipe manikin faces between users. Restock unused lungs and face shields.',
        'Return manikins, lungs and face shields, cleaning supplies, extra takeaway sheets, and the AV kit',
        ROOM,
        LOCKBOX
      ])
    ]),

    sheet('season-ready', 'Season Ready', [
      sec('Before class', [
        'Review the roster emailed before class starts',
        'Set up and test the digital presentation',
        'Prepare activity card sets per team'
      ]),
      sec('Supplies and equipment', [
        'Facilitator Guide',
        'Name tags and a marker',
        'Printed scenario cards',
        'Take-home phone cards, 1 per student',
        'Hydration color chart (laminated or projected)',
        'Empty packaging or photos of sports drinks, energy drinks, and supplements (Label Detective)',
        'Fuel the Day index cards, 1 set per team',
        'Sort the Pain statement cards, 1 set per team',
        'Concussion sign cards (Spot the Signs)',
        'One or more adult CPR manikins',
        'AED trainer with pads',
        'Towel and tarp for the cooling demo (cooler or tub if space allows)',
        'Up to 20 participants'
      ]),
      sec('Teaching steps', [
        '0:00 Welcome and why this matters (3 min)',
        '0:03 Part 1 Fuel (12 min)',
        '0:15 Part 2 Recover (7 min)',
        '0:22 Part 3 Prevent: warm-up, overuse, and reporting pain (8 min)',
        '0:30 Part 4 Recognize: concussion, heat illness, and cardiac arrest (11 min)',
        '0:41 Part 5 Act: CPR and AED, cooling, and sideline response (10 min)',
        '0:51 Part 6 Practice scenarios (7 min)',
        '0:58 Wrap and save the phone card (2 min)',
        'Virtual: Parts 4 and 5 should never be cut. Must-keep activities are CPR on the Beat, AED Run-Through, and Sideline Scan.'
      ]),
      sec('After class', [
        'This is not a certified CPR/AED course',
        'Return adult manikins, the AED trainer, tarp, towels, cooling supplies, activity cards, hydration chart, packaging, extra phone cards, and the AV kit',
        ROOM,
        LOCKBOX
      ])
    ]),

    sheet('campus-ready', 'Campus Ready', [
      sec('Before class', [
        'Review the roster emailed before class starts',
        'Set up and test the digital presentation'
      ]),
      sec('Supplies and equipment', [
        'Facilitator Guide',
        'Name tags and a marker',
        'Adult CPR manikin for hands-only practice',
        'Narcan (naloxone) training devices',
        'Campus Ready phone card (students save it to a phone)',
        'Digital presentation (laptop, speaker, projector if the site requires)'
      ]),
      sec('Teaching steps', [
        'Part 1 Recognize the Emergency (10 min): alcohol poisoning signs, opioids, and fentanyl',
        'Part 2 Decide What to Do (7 min): Handle it, Get help, or Call 911, and medical amnesty',
        'Part 3 Act: hands-on skills (25 min): recovery position, hands-only CPR, and naloxone trainer',
        'Part 4 Prevent: Getting Home Safe (6 min) and the first-week checklist',
        'Part 5 Practice scenarios (8 min)'
      ]),
      sec('After class', [
        'This is not a certification course',
        'Return the adult manikin, unused Narcan trainers, and the AV kit',
        ROOM,
        LOCKBOX
      ])
    ]),

    sheet('all-kids-welcome', 'All Kids Welcome', [
      sec('Before class', [
        'Review the roster emailed before class starts',
        'Set up and test the digital presentation',
        'Prerequisite: Safe Sitter Babysitting or the Mindful Beginnings comprehensive babysitting course'
      ]),
      sec('Supplies and equipment', [
        'Instructor Guide',
        'Scenario Answer Key (instructor use)',
        'Name tags and a marker',
        'Pen or pencil, 1 per participant',
        'All Kids Welcome takeaway sheets, 1 per participant',
        'Digital presentation (laptop, speaker, projector if the site requires)'
      ]),
      sec('Teaching steps', [
        '60 minutes',
        'Part 1 Words That Matter',
        'Part 2 What You Might See',
        'Part 3 Before the Job: Talking to Parents',
        'Part 4 While You\'re Babysitting',
        'Part 5 Practice scenarios (5 scenarios)',
        'Part 6 Quick Reference Checklist'
      ]),
      sec('After class', [
        'Certificate of completion for every student',
        'Return takeaway sheets, the AV kit, and any borrowed Instructor Guide and Answer Key',
        ROOM,
        LOCKBOX
      ])
    ]),

    sheet('gs-first-aid', 'Girl Scouts First Aid Badge Workshop', [
      sec('Before class: prep', [
        'Review the roster emailed before class. Note troop level or levels, and pick the one Slide 16 level block.',
        'Confirm the room, AED location, exits, and troop leader emergency contacts',
        'Ask the leader about latex allergies',
        'Load the slide deck on the laptop and test the projector or HDMI adapter',
        'Print the facilitator guide and one badge-step completion summary per troop'
      ]),
      sec('Before class: materials', [
        'Nitrile gloves, multiple sizes (2 or more pairs per scout)',
        'Adhesive bandages, gauze pads, roller bandages, medical tape, and triangular bandages or cravats (enough for partner bandaging practice)',
        'Antiseptic or saline wipe packs',
        'Instant cold packs (demo, plus 1 or 2 that can activate)',
        'First aid kit demo tote with labeled contents, plus level extras (whistle, foil blanket, hike items)',
        '911 call-script cards (one per scout or pair)',
        'Printed scenario cards (injury described in words only)',
        'Student handouts, name tags or table tents, and a marker',
        'Hand sanitizer and a trash bag for glove disposal',
        'Mindful Beginnings table sign and business cards',
        'Brownie / Junior: kit pouches and item cards, outdoor picture cards, and minor vs. urgent vs. 911 sort cards',
        'Cadette: Red Cross choking steps cue card, and seizure and heat/cold cue cards',
        'Senior: magazine, scarf, and tape for splints, and a neck/spine cue card',
        'Ambassador: summon-help-remotely cue cards, and a home vs. travel or wilderness kit list'
      ]),
      sec('Welcome (slides 1 to 4, about 3 min)', [
        'Slide 1: title up as scouts arrive. Introduce yourself as a registered nurse.',
        'Slide 2: say the disclaimer aloud (badge practice, not certification, not Red Cross or AHA). A serious emergency means call 911 and get an adult.',
        'Slide 3: why first aid matters (calm, gloves, and a plan)',
        'Slide 4: walk through Today\'s Hour. Point out exits and bathrooms.'
      ]),
      sec('Check-Call-Care (slides 5 to 8, about 8 min)', [
        'Slide 5: introduce the three-word frame',
        'Slide 6: Check (scene safe for you, what you see, awake, breathing normally)',
        'Slide 7: Call (911, a nearby adult, or a tiny problem). Point at a specific person by name.',
        'Slide 8: Care (gloves first, treat what you are trained to treat, stay, and reassure)'
      ]),
      sec('When to call 911 (slides 9 to 10, about 7 min)', [
        'Slide 9: review the six reasons to call 911',
        'Slide 10: 911 call script practice in pairs with script cards. Switch roles.'
      ]),
      sec('First aid kit (slides 11 to 13, about 8 min)', [
        'Slides 11 to 12: tour the demo tote and name each kit item',
        'Slide 13: build or pack a kit by level'
      ]),
      sec('Treat minor injuries (slides 14 to 15, about 12 min)', [
        'Slide 14: gloves on, real supplies, your turn',
        'Slide 15: gloves on and off practice',
        'Slide 15: scrape or cut (rinse, wipe around the wound, cover)',
        'Partner bandaging: clean gauze pad and roller bandage on a partner\'s forearm or hand. Check that fingers are warm, pink, and can wiggle. Switch.',
        'Slide 15: nosebleed, minor burn, bee sting, and sprain (RICE with a compression wrap on a partner)'
      ]),
      sec('Outdoor and urgent level focus (slide 16, about 8 min)', [
        'Run one block for this troop (Brownie, Junior, Cadette, Senior, or Ambassador)',
        'If Cadette choking: Red Cross steps (5 back blows, 5 abdominal thrusts). Partner practice is positioning only, with no actual blows or thrusts.'
      ]),
      sec('Scenario station (slides 17 to 19, about 10 min)', [
        'Slide 17: read a scenario card aloud. No fake blood, makeup, or stick-on wounds.',
        'Slide 18: assign roles (Helper, Caller, Runner, Observer). Rotate if time allows.',
        'Slide 19: reminders (check before bandaging, gloves before touching, point when you call)',
        'Care ends with bandaging the partner\'s clean arm or hand'
      ]),
      sec('Wrap-up', [
        'Slide 20: recap Check-Call-Care, point when you call, and gloves before care',
        'Slide 21: hand the completed badge-step summary to the troop leader. Badges come from the Girl Scout Shop unless the host arranged otherwise.',
        'Slide 22: thank you, questions, and contact info',
        'Collect used gloves and wipes into the trash bag. Wipe shared surfaces.',
        'Restock unused bandages and gauze into the supply tote',
        ROOM,
        'Return the laptop, demo tote, cue cards, script cards, and leftover handouts to the locked storage box within 24 hours unless teaching another course',
        'Note any incidents or supplies that need restocking, and follow up with Lindsay if needed'
      ])
    ], {
      note: 'No fake blood, moulage, makeup wounds, or simulated injuries. Scenarios are described in words. Bandaging is practiced with clean gauze and bandages on a partner\'s uninjured arm or hand. Choking is taught the Red Cross way and simulated on a partner with no actual back blows or thrusts.',
      foot: 'Not a Red Cross or AHA certification course. Badges are confirmed by the troop leader through the Girl Scout Shop. Not an official GSUSA endorsement.'
    }),

    sheet('my-first-club', 'My First Babysitter\'s Club', [
      sec('Before class', [
        'Review the roster emailed before class starts',
        'No slides or AV',
        'Print and sign certificates in advance',
        'Print Ages and Stages cards two-sided on card stock'
      ]),
      sec('Supplies and equipment', [
        'Facilitator Guide',
        'Club handbooks, 1 per member',
        'Certificates, 1 per member',
        'Family take-home pages, 1 per member',
        'Name tag supplies, 1 per member, and a marker',
        '7 posters: Club Pledge, High Five, Four Rules, BEST Care, 10 Diaper Steps, Make Your Call, Happy Kid Toolbox',
        'Cards: Safe or Unsafe, Password Challenge, Safety Signal, Ages and Stages (1 set per small group), trait cards (24), Who Am I? clue cards (12), Calm It Down, Hazard Hunt, Make Your Call signs (3) and scenario cards (18), Interview Questions, Lightning Review, and Happy Kid Toolbox (1 set per small group)',
        'Play phones (at least 4) and a door prop',
        'Practice dolls, diapers, wipes, and changing pads',
        'Basic first aid supplies: bandages, gauze, and gloves',
        'Tote bags, fabric markers, and activity bag supplies',
        'Snack time and nap time props',
        'Up to 16 participants'
      ]),
      sec('Teaching steps', [
        'Week 1 Welcome to the Club: pledge, name tags, Safe or Unsafe scavenger hunt',
        'Week 2 Safe at Home: door and phone role play',
        'Week 3 My Safety Team: High Five, Safety Signal',
        'Week 4 Ages and Stages: matching game, Who Am I?',
        'Week 5 BEST Care and doll practice: 10-step diaper change, handwashing',
        'Week 6 Keeping Kids Happy: four rules, begin activity kits',
        'Week 7 Little Emergencies: Make Your Call, first aid, mock 911',
        'Week 8 Helper Business and Graduation: interviews, review game, certificates'
      ]),
      sec('After class', [
        'Graduation certificates (week 8) and family take-home pages',
        'Return dolls, diapering supplies, posters, cards, props, craft and first aid leftovers, and extra handbooks, certificates, and pages',
        ROOM,
        LOCKBOX
      ])
    ]),

    sheet('my-first-single', 'My First Babysitter\'s Club, single session', [
      sec('Before class', [
        'Review the roster emailed before class starts',
        'No slides or AV',
        'Print and sign certificates in advance',
        'The 2.5-hour workshop is in the Facilitator Guide'
      ]),
      sec('Supplies and equipment', [
        'Facilitator Guide',
        'Club handbooks, 1 per participant',
        'Certificates, 1 per participant',
        'Family take-home pages, 1 per participant',
        'Name tag supplies and a marker',
        'Practice dolls, diapers, wipes, and changing pads',
        'Basic first aid supplies: bandages, gauze, and gloves'
      ]),
      sec('Teaching steps', [
        'Follow the 2.5-hour workshop in the Facilitator Guide',
        'This is one workshop, not the 8-week series'
      ]),
      sec('After class', [
        'Hand out certificates and family take-home pages',
        'Return dolls, diapering supplies, first aid leftovers, and extra handbooks, certificates, and pages',
        ROOM,
        LOCKBOX
      ])
    ]),

    sheet('little-medics', 'Little Medics', [
      sec('Before class', [
        'Print everything before the first meeting (quantities for up to 12 members, plus 1 extra of each member item)',
        'Sign certificates in advance',
        'Send the welcome letter home 1 week before the club starts',
        'Up to 12 members per instructor. A larger group adds a second instructor.'
      ]),
      sec('Supplies and equipment', [
        'Student Handbook, 1 per member',
        'Facilitator Guide, 1 per instructor',
        'Course overview as needed for the site',
        '12 posters (printables kit pages 3 to 14), laminated',
        'Kit or Not? cards, 1 set. Ouch Meter face cards, 1 set per 4 members. Emergency or Not?, 2 sets. Hot or Not?, 1 set. Safe Snack Sort, 1 set per 4 members. Leaves of Three? and weather cards, 1 set (10-week clubs). Challenge station cards, 1 set.',
        'Name badges (1 page per 8 members) with holders or pins',
        'Weekly badge stickers, 1 sheet per member',
        'Certificates, 1 per member',
        'Attendance and badge tracker, 1 per club',
        '6 spare stuffed-animal patients',
        'Real first aid kit, safe items only (no scissors, no medicine)',
        'Adhesive bandages (10 per member), gauze squares, tape, and a spray bottle',
        'Child-size non-latex gloves',
        '4 gel or instant cold packs, and clean cloths',
        'Tissues, play phones (4), crayons, painter\'s tape, and 2 hoops or bins',
        'Stuffed dog, weather gear props, and a music speaker',
        'Mat or blanket for Stop, Drop, and Roll'
      ]),
      sec('Teaching steps', [
        'Every meeting: check-in circle, story with a stuffed-animal patient, big steps with a chant and hand motions, practice stations, movement game, and badge time',
        'Week 1 Welcome, Little Medics',
        'Week 2 Tell It: calm bodies, clear words',
        'Week 3 911 Heroes',
        'Week 4 Boo-Boo Basics',
        'Week 5 Bumps, Bruises, and Nosebleeds',
        'Week 6 Hot Stuff: burns and fire safety',
        'Week 7 Choking and Safe Eating',
        'Bonus for 10-week clubs: Bites, Stings, and Itchy Things, and Weather Ready',
        'Graduation: Challenge Day and certificates'
      ]),
      sec('After class', [
        'Certificate and badge for every member at graduation',
        'Update the attendance and badge tracker'
      ])
    ]),

    sheet('ready-period', 'Ready. Period.', [
      sec('Before class', [
        'Review the roster emailed before class starts',
        'Nurse plus a craft facilitator. No posters, slides, or handouts at seats.',
        'Enter transition times into the silent timer',
        'Need restroom and sink access'
      ]),
      sec('Supplies and equipment', [
        'Facilitator Guide',
        'Question box with a slot. Slips of paper and a pencil at every seat.',
        'Parent take-home letters, 1 per girl',
        'Silent timer',
        'Blank zip pouches (about 6 by 9 inches), 1 per girl plus 3 extras',
        'Rhinestones, gems, sequins, and pearls. Fabric glue, tacky glue, and glue dots. Patches, letter beads, and stickers. Puffy paint and fabric markers. Ribbon, tassels, charms, and keychain clips.',
        'Small trays or paper plates per seat. Table covering, paper towels, wet wipes, and a small trash bin per table.',
        'Kit per girl: 2 pads (different absorbencies), 2 pantyliners, 2 tampons, a pocket tracker card, and an encouragement card',
        'Product table: 1 pad, a liner, and a tampon with applicator to open. A clear cup of tinted water and a measuring spoon. 2 to 3 tablespoons of tinted water in a small clear jar.',
        '6 to 18 participants'
      ]),
      sec('Teaching steps', [
        '0:00 to 0:05 Doors and three rules. Everyone drops a question slip.',
        '0:05 to 0:20 Table talk (parts one and two)',
        '0:20 to 0:35 The product table (part three)',
        '0:35 to 0:42 The pouch check (part four)',
        '0:42 to 0:52 The question box',
        '0:52 to 0:58 Straight talk: moods and the doctor list (part five)',
        '0:58 to 1:00 Closing. Parent letters at the door.'
      ]),
      sec('After class', [
        'Hand out parent letters',
        'Return pouches, craft supplies, kit products, demo items, the question box, slips, pencils, and extra letters',
        ROOM,
        LOCKBOX
      ])
    ]),

    sheet('ready-period-virtual', 'Ready. Period. (virtual)', [
      sec('Before class', [
        'Review the roster emailed before class starts',
        'Zoom, 60 minutes, solo nurse. Chat set to host only (the question box). Test it.',
        'Waiting room on. Admit only roster names. Recording off. Participant sharing off, mute on entry, no breakouts.',
        'Log in 15 minutes early. Check framing and the front light. Cover slide up before admitting.',
        'Confirm with families: the girl joins with a first name, and has one pad, a glass of water, a large spoon, and a towel ready before class'
      ]),
      sec('Supplies and equipment', [
        'Facilitator Guide (virtual)',
        'Slide deck ready to share',
        '1 of each product plus a spare: pad, liner, tampon with applicator, period underwear, and menstrual cup',
        '2 to 3 tablespoons of tinted water sealed in a clear jar, and a tray or towel',
        'Sample packed pouch',
        'Blank note for pasting questions, and a silent timer',
        'Roster and the troop leader\'s cell number'
      ]),
      sec('Teaching steps', [
        'Follow the virtual facilitator guide for the run of show'
      ]),
      sec('After class', [
        'Send the virtual letter home to families',
        'Note unanswered questions for Lindsay',
        'Return demo products, the jar, and the sample pouch to the locked storage box'
      ])
    ]),

    sheet('social-ready', 'Social Ready', [
      sec('Before class', [
        'Review the roster emailed before class starts',
        'Host adult or organizer stays the full hour',
        'Chairs in a horseshoe facing the screen, with open floor for Post or Pass. Phones stay put away.',
        'Virtual: waiting room on, recording off, participant sharing off, chat open, and a parent is on the call'
      ]),
      sec('Supplies and equipment', [
        'Facilitator Guide',
        '41-slide deck on the laptop, plus a backup, and a screen or projector',
        'Family Tech Agreement, 1 per student plus extras',
        'Roster with the organizer\'s cell number',
        'Pencils and a silent timer',
        'POST and PASS signs',
        '1 red card and 1 green card per student',
        'Travel toothpaste, a paper plate, and a toothpick (Toothpaste Test)'
      ]),
      sec('Teaching steps', [
        '0:00 Welcome, ground rules, and the six words (4 min)',
        '0:04 Part 1 Post (9 min): Toothpaste Test, Post or Pass',
        '0:13 Part 2 Protect (9 min): Photo Detective',
        '0:22 Part 3 Verify (10 min): Red Flag, Green Flag',
        '0:32 Part 4 Respect (9 min): Group Chat Rescue',
        '0:41 Part 5 Balance (8 min): Spot the Hook',
        '0:49 Part 6 Speak Up (8 min): My Three, Say It Out Loud, scenarios',
        '0:57 Six word check, Family Tech Agreement, and close (3 min)'
      ]),
      sec('After class', [
        'Students take home the Family Tech Agreement',
        'Return agreements, signs, and cards. Discard used toothpaste.',
        ROOM,
        LOCKBOX
      ])
    ]),

    sheet('grandparents', 'Grandparents: Getting Started', [
      sec('Before class', [
        'Review the roster emailed before class starts',
        'Set up and test the digital presentation. Safe Sitter instructor login is required.'
      ]),
      sec('Supplies and equipment', [
        'Instructor Manual',
        'Name tags and a marker',
        'Grandparents: Getting Started handbook and completion certificate, 1 per participant',
        'Pen or pencil, 1 per participant',
        'Infant and child CPR manikins with mouth shields (1 each for 8 or fewer, 2 each above 8)',
        'Soft-bodied dolls and diapers',
        'Evaluation forms',
        'CPR and choking rescue updates handouts'
      ]),
      sec('Teaching steps', [
        '3 hours, including a break',
        'Safety and emergencies: choking rescue and CPR for infants and children, and first aid',
        'Caring for grandchildren: safe sleep, ages and stages, feeding, and diapering',
        'Managing behavior',
        'Preventing injuries room by room',
        'Communication and expectations'
      ]),
      sec('After class', [
        'Safe Sitter certificate of completion (no CPR card)',
        'Collect evaluations',
        'Return manikins, unused lung and airway bags, dolls, diapers, booklets, and the AV kit',
        ROOM,
        LOCKBOX
      ])
    ]),

    sheet('grandkids', 'Babysitting Grandkids Workshop', [
      sec('Before class', [
        'Review the roster emailed before class starts',
        'Confirm the back row can read the slides. Check seating, lighting, and accessibility.',
        'Advance through the 32-slide deck once. Part dividers are slides 4, 13, 19, and 26.',
        'Speak slowly and repeat key numbers aloud'
      ]),
      sec('Supplies and equipment', [
        'Facilitator Guide (60-minute workshop)',
        'Caregiving for Grandparents Workshop slide deck (32 slides) on the laptop, plus a backup',
        'Projector or a large screen',
        'Babysitting Your Grandkids takeaway sheets, 1 per participant, including large-print versions'
      ]),
      sec('Teaching steps', [
        'Teach from the 60-minute workshop facilitator guide',
        'Part dividers in the deck: slides 4, 13, 19, and 26'
      ]),
      sec('After class', [
        'Return takeaway sheets (standard and large print) and the AV kit',
        ROOM,
        LOCKBOX
      ])
    ]),

    sheet('baby-ready', 'Baby Ready', BABY_READY_SECTIONS),

    sheet('baby-ready-cpr', 'Baby Ready + CPR Certification', [
      sec('Before class', [
        'Review the roster emailed before class starts',
        '5 hours: Baby Ready care plus pediatric CPR certification. 6 to 12 participants per nurse.',
        'Test the 21-slide deck, screen, and sound',
        'Room setup 30 minutes before: U or semicircle seating, one practice station per pair on sturdy tables, chairs so no one kneels',
        'Takeaway sheet at each seat. Locate restrooms and exits.'
      ]),
      sec('Supplies and equipment', BABY_READY_SECTIONS[1].items.concat([
        'Child manikin for the CPR certification block',
        'Baby Ready + CPR certification card, 1 per participant'
      ])),
      sec('Teaching steps', BABY_READY_SECTIONS[2].items.concat([
        'This class is 5 hours: the Baby Ready care portion above, plus pediatric CPR certification',
        'Run the certification skills check and issue the CPR certification card'
      ])),
      BABY_READY_SECTIONS[3]
    ], { note: 'Rosters are emailed to instructors before class starts. The care portion follows the Baby Ready run of show. The extra time is the CPR certification.' }),

    sheet('care-ready', 'Care Ready', [
      sec('Before class', [
        'Review the roster emailed before class starts',
        '150 minutes. 6 to 16 participants. Above 12, plan a second instructor for hands-on blocks.',
        'Load the deck on the laptop plus a backup drive. Bring an HDMI cable and adapter.',
        'Download course videos to the instructor phone. Do not stream them.',
        'Pre-print completion certificates'
      ]),
      sec('Supplies and equipment', [
        'Facilitator Guide',
        'Name tents or tags, and a marker',
        'Care Ready handbook, 1 per participant plus 2 spares',
        'Completion certificates',
        'Sign-in sheet and printed roster',
        'Pens, 1 per participant plus 10 spares',
        'Scenario card deck (behavior, triage, choking)',
        'Sample first aid kit, opened',
        'Blue painter\'s tape and a marker, plus the Mindful Beginnings table sign and business cards',
        'Infant manikins, 1 per participant',
        'Child manikins, 1 per 2 participants',
        'Batteries and screwdriver, sanitizing wipes, a lined trash bag, and replacement lungs and face shields',
        'Infant doll, 2 diapers, wipes, and a changing pad'
      ]),
      sec('Teaching steps', [
        '0:00 Professional caregiver role and four agreements (15 min)',
        '0:15 Ages and stages (15 min)',
        '0:30 Behavior without punishment (17 min)',
        '0:47 Daily care (20 min)',
        '1:07 Break (10 min)',
        '1:17 Injury prevention and safety sweep (15 min)',
        '1:32 Triage and first aid (16 min)',
        '1:48 Choking rescue, hands-on (20 min)',
        '2:08 Infant and child CPR, hands-on (20 min)',
        '2:28 Emergency plan and closing (2 min)'
      ]),
      sec('After class', [
        'Certificate of completion (not a CPR card)',
        'Wipe manikins. Restock lungs and face shields.',
        'Return manikins, supplies, the doll, first aid kit, card deck, handbooks, certificates, and the AV kit',
        ROOM,
        LOCKBOX
      ])
    ]),

    sheet('steady-and-ready', 'Steady and Ready', [
      sec('Before class', [
        'Review the roster emailed before class starts',
        'Gather family intake responses before class (what helps them calm, sensory needs, communication, and safety concerns)',
        'Load and test the slide deck',
        'Print an agenda for each learner (in person)'
      ]),
      sec('Supplies and equipment', [
        'Facilitator Guide',
        'Steady and Ready slide deck, plus a laptop, speaker, and projector (in person)',
        'Printed agenda per learner',
        'My Safety Plan worksheets, pencils, and clipboards',
        'Certificates of completion',
        'Borrowable fidgets and noise-reducing headphones',
        'Practice cards',
        'Toy or unplugged phone for 911 practice (optional)'
      ]),
      sec('Teaching steps', [
        '0:00 Title (2 min)',
        '0:02 Our plan (2 min)',
        '0:04 How we work (5 min)',
        '0:09 Getting calm (9 min)',
        '0:18 Safe at home (10 min)',
        '0:28 Brain break (4 min)',
        '0:32 When something goes wrong, 911 script (14 min)',
        '0:46 My safety plan (5 min)',
        '0:51 Practice (4 min)',
        '0:55 Recap (3 min)',
        '0:58 Close and certificates (2 min)'
      ]),
      sec('After class', [
        'Hand out certificates',
        'Email families the completed worksheet and certificate with a note of encouragement',
        'Share follow-up resources, and send feedback to Mindful Beginnings',
        'Return fidgets, headphones, worksheets, agendas, certificates, cards, clipboards, and the AV kit',
        ROOM
      ])
    ]),

    rcSheet('rc-bt-peds', 'Red Cross Babysitter\'s Training + Pediatric First Aid/CPR/AED', RC_COMMON_MATERIALS.concat([
      'Red Cross Babysitter\'s Training participant handbooks (one per participant)',
      'Baby dolls for diapering and holding practice (as needed)',
      'Diapering practice supplies (as needed)'
    ])),

    rcSheet('rc-adult-peds', 'Adult and Pediatric First Aid/CPR/AED Certification', RC_COMMON_MATERIALS.concat([
      'Red Cross participant handouts / ready reference cards (one per participant, if applicable)'
    ])),

    rcSheet('rc-workplace', 'Workplace Red Cross CPR, AED, and First Aid', RC_COMMON_MATERIALS.concat([
      'Red Cross participant handouts / ready reference cards (one per participant, if applicable)',
      'Confirm room setup, participant count, and the site AED location with the workplace contact'
    ]))
  ];

  var MATCH = [
    { id: 'gs-first-aid', test: function (n) { return (/girl scout/.test(n) && /first aid/.test(n)) || /first aid badge/.test(n); } },
    { id: 'rc-bt-peds', test: function (n) { return /pediatric/.test(n) && /babysitter/.test(n) && (/red cross/.test(n) || /babysitters training/.test(n)); } },
    { id: 'rc-workplace', test: function (n) { return /group cpr/.test(n) || (/workplace/.test(n) && /cpr|first aid|red cross/.test(n)); } },
    { id: 'rc-adult-peds', test: function (n) { return /\badult\b/.test(n) && /pediatric/.test(n) && /cpr|aed|first aid/.test(n); } },
    { id: 'ss-essentials', test: function (n) { return /essentials/.test(n) && /sitter|babysit/.test(n); } },
    { id: 'grandparents', test: function (n) { return /grandparent/.test(n) && /getting started/.test(n); } },
    { id: 'grandkids', test: function (n) { return /babysitting grandkids/.test(n) || /caregiving for grandparents/.test(n); } },
    { id: 'safe-sitter', test: function (n) { return (/safesitter/.test(n) || /\bsafe sitter\b/.test(n)) && !/instructor/.test(n); } },
    { id: 'intro-babysitting', test: function (n) { return /intro to babysitting/.test(n) || /introduction to safe babysitting/.test(n); } },
    { id: 'safe-at-home-series', test: function (n) { return /safe@home|safe at home|safeathome/.test(n) && /series/.test(n); } },
    { id: 'safe-at-home-virtual', test: function (n) { return /safe@home|safe at home|safeathome/.test(n) && /virtual/.test(n); } },
    { id: 'safe-at-home', test: function (n) { return /safe@home|safe at home|safeathome/.test(n); } },
    { id: 'stay-ready', test: function (n) { return /stay ready/.test(n) || /choking rescue/.test(n); } },
    { id: 'season-ready', test: function (n) { return /season ready/.test(n); } },
    { id: 'campus-ready', test: function (n) { return /campus ready/.test(n); } },
    { id: 'all-kids-welcome', test: function (n) { return /all kids welcome/.test(n); } },
    { id: 'my-first-single', test: function (n) { return /my first babysitter/.test(n) && /single|workshop/.test(n); } },
    { id: 'my-first-club', test: function (n) { return /my first babysitter/.test(n); } },
    { id: 'little-medics', test: function (n) { return /little medic/.test(n); } },
    { id: 'ready-period-virtual', test: function (n) { return /ready period/.test(n) && /virtual/.test(n); } },
    { id: 'ready-period', test: function (n) { return /ready period/.test(n); } },
    { id: 'social-ready', test: function (n) { return /social ready/.test(n); } },
    { id: 'baby-ready-cpr', test: function (n) { return /baby ready/.test(n) && /cpr/.test(n); } },
    { id: 'baby-ready', test: function (n) { return /baby ready/.test(n); } },
    { id: 'care-ready', test: function (n) { return /care ready/.test(n); } },
    { id: 'steady-and-ready', test: function (n) { return /steady and ready/.test(n); } }
  ];

  function normCourse(name) {
    return String(name || '')
      .toLowerCase()
      .replace(/[®™'’]/g, '')
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9@]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function byId(id) {
    var i;
    for (i = 0; i < CHECKS.length; i++) {
      if (CHECKS[i].id === id) return CHECKS[i];
    }
    return null;
  }

  function forCourse(course) {
    var n = normCourse(course);
    var i;
    if (!n) return null;
    for (i = 0; i < MATCH.length; i++) {
      if (MATCH[i].test(n)) return byId(MATCH[i].id);
    }
    return null;
  }

  function forSession(s) {
    var sheetFor;
    if (!s) return null;
    sheetFor = forCourse(s.course);
    if (s.isVirtual && sheetFor && sheetFor.id === 'safe-at-home') return byId('safe-at-home-virtual');
    if (s.isVirtual && sheetFor && sheetFor.id === 'ready-period') return byId('ready-period-virtual');
    return sheetFor;
  }

  function list() {
    return CHECKS.slice().sort(function (a, b) {
      return a.title.localeCompare(b.title);
    });
  }

  function addDays(iso, days) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ''));
    var dt;
    if (!m) return '';
    dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    dt.setUTCDate(dt.getUTCDate() + days);
    return dt.toISOString().slice(0, 10);
  }

  function timeKey(t) {
    var m = /(\d{1,2}):(\d{2})\s*([ap]m)?/i.exec(String(t || ''));
    var h, min, ap;
    if (!m) return '9999';
    h = Number(m[1]);
    min = Number(m[2]);
    ap = (m[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12;
    if (ap === 'am' && h === 12) h = 0;
    return (h < 10 ? '0' : '') + h + (min < 10 ? '0' : '') + min;
  }

  function upcoming(listIn, today, days) {
    var start = String(today || '').slice(0, 10);
    var windowDays = days == null ? 60 : Number(days);
    var end;
    if (!isFinite(windowDays) || windowDays < 0) windowDays = 60;
    end = addDays(start, windowDays);
    return (listIn || []).filter(function (s) {
      var d;
      if (!s || s.isCancelled || s.isHold || !s.date) return false;
      d = String(s.date).slice(0, 10);
      if (!d || d < start || (end && d > end)) return false;
      return !!forSession(s);
    }).sort(function (a, b) {
      return String(a.date).localeCompare(String(b.date))
        || timeKey(a.time).localeCompare(timeKey(b.time))
        || String(a.course || '').localeCompare(String(b.course || ''))
        || String(a.id || '').localeCompare(String(b.id || ''));
    });
  }

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

  function formatDate(iso) {
    var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || '').slice(0, 10));
    var dt;
    if (!m) return '';
    dt = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
    return WEEKDAYS[dt.getUTCDay()] + ', ' + MONTHS[+m[2] - 1] + ' ' + Number(m[3]) + ', ' + m[1];
  }

  function escapeHtml(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function printHtml(checklist, meta) {
    var sections, note, foot, lines, when, sessionTitle, bits;
    if (!checklist) return '';
    meta = meta || {};
    sections = (checklist.sections || []).map(function (section) {
      var items = (section.items || []).map(function (item) {
        return '<li class="teach-item"><span class="teach-box" aria-hidden="true"></span><span>' + escapeHtml(item) + '</span></li>';
      }).join('');
      return '<section class="teach-pdf-section"><h2>' + escapeHtml(section.title) + '</h2><ul class="teach-items">' + items + '</ul></section>';
    }).join('');
    note = checklist.note ? '<p class="teach-pdf-note">' + escapeHtml(checklist.note) + '</p>' : '';
    foot = checklist.foot ? '<p class="teach-pdf-foot">' + escapeHtml(checklist.foot) + '</p>' : '';
    lines = [];
    when = [formatDate(meta.date), String(meta.time || '').trim()].filter(Boolean).join(' · ');
    if (when) lines.push(when);
    if (String(meta.place || '').trim()) lines.push(String(meta.place).trim());
    if (String(meta.code || '').trim()) lines.push('Code ' + String(meta.code).trim());
    sessionTitle = String(meta.sessionTitle || '').trim();
    bits = '<div class="teach-pdf"><header class="teach-pdf-head"><div class="teach-pdf-brand">Mindful Beginnings</div><div class="teach-pdf-rule"></div><p class="teach-pdf-kicker">Teaching checklist</p><h1>' + escapeHtml(checklist.title) + '</h1>';
    if (sessionTitle && sessionTitle !== checklist.title) bits += '<p class="teach-pdf-session">' + escapeHtml(sessionTitle) + '</p>';
    bits += note;
    if (lines.length) bits += '<p class="teach-pdf-meta">' + lines.map(escapeHtml).join('<br>') + '</p>';
    bits += '</header>' + sections + foot + '</div>';
    return bits;
  }

  function visibleText() {
    var chunks = [];
    CHECKS.forEach(function (c) {
      chunks.push(c.title, c.note || '', c.foot || '');
      (c.sections || []).forEach(function (section) {
        chunks.push(section.title);
        (section.items || []).forEach(function (item) { chunks.push(item); });
      });
    });
    return chunks.join('\n');
  }

  var api = {
    list: list,
    byId: byId,
    forCourse: forCourse,
    forSession: forSession,
    upcoming: upcoming,
    formatDate: formatDate,
    printHtml: printHtml,
    visibleText: visibleText
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBTeachingChecklists = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
