/* How many supplies to pack for one in-person class.

   Counts use the same seat rule as the packing list: a registration counts
   unless it is waitlist, cancelled, or refunded. Host and comped seats count.
   Per-person quantities come from the teaching checklist wording. Durable
   manikin counts follow the course kit rules, not enrollment times a kit.
   Red Cross classes stay at 2 adult, 2 child, and 2 infant manikins.
   Safe Sitter and Essentials stay at 1 infant and 1 child through 8
   students, and 2 of each above 8. Every other tangible supply is in
   the same plan: a number when the checklist states one, confirmation
   when it does not, instructor-owned when the instructor brings it,
   or conditional when it depends on the troop or the site.
*/
(function (root) {
  'use strict';

  var NICK = { kathryn: 'katy', katherine: 'katy', kate: 'katy', kathy: 'katy', katy: 'katy' };

  function countsTowardSeats(r) {
    var st = String(r && r.payStatus || '').toLowerCase();
    return !!r && st !== 'waitlist' && st !== 'cancelled' && st !== 'canceled' && st !== 'refunded';
  }

  function nameParts(name) {
    var raw = String(name || '').toLowerCase();
    var nick = [];
    var found = raw.match(/\(([^)]+)\)/);
    if (found) nick = found[1].split(/[^a-z]+/).filter(Boolean);
    var base = raw.replace(/\([^)]*\)/g, ' ').replace(/[^a-z]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    return { first: base[0] || '', last: base.length ? base[base.length - 1] : '', nick: nick };
  }

  function canon(word) { return NICK[word] || word; }

  function namesMatch(a, b) {
    var A = nameParts(a);
    var B = nameParts(b);
    if (!A.last || !B.last || A.last !== B.last) return false;
    var fa = canon(A.first);
    var fb = canon(B.first);
    if (fa && fa === fb) return true;
    var extraA = A.nick.map(canon);
    var extraB = B.nick.map(canon);
    if (extraA.indexOf(fb) >= 0 || extraB.indexOf(fa) >= 0) return true;
    return extraA.some(function (n) { return extraB.indexOf(n) >= 0; });
  }

  function personMatches(person, names) {
    return (names || []).some(function (n) { return namesMatch(person, n); });
  }

  // Same last name with a different first name is not a match. Do not subtract that kit.
  function personAmbiguous(person, names) {
    if (personMatches(person, names)) return false;
    var P = nameParts(person);
    return (names || []).some(function (n) {
      var N = nameParts(n);
      return !!(P.last && N.last && P.last === N.last);
    });
  }

  function kindOf(name) {
    var n = String(name || '');
    if (/infant/i.test(n)) return 'infant';
    if (/child/i.test(n)) return 'child';
    if (/adult/i.test(n)) return 'adult';
    if (/\bav\b|laptop|projector/i.test(n)) return 'av';
    return '';
  }

  function line(id, label, required, extra) {
    extra = extra || {};
    var role = extra.role || 'pack';
    var out = {
      id: id,
      label: label,
      required: required,
      consumable: extra.consumable !== false,
      already: 0,
      packNow: required,
      alreadyNote: '',
      role: role,
      note: extra.note || '',
      covers: extra.covers || []
    };
    if (role !== 'pack') out.packNow = null;
    return out;
  }

  function confirm(label, note, id, covers) {
    return {
      id: id || '',
      label: label,
      confirm: true,
      note: note || '',
      consumable: true,
      role: 'pack',
      required: null,
      packNow: null,
      already: 0,
      alreadyNote: '',
      covers: covers || []
    };
  }

  function own(id, label, covers, note) {
    return line(id, label, 1, {
      role: 'instructor',
      consumable: false,
      covers: covers,
      note: note || 'Instructor brings this. Not packed from storage.'
    });
  }

  function only(id, label, note, covers) {
    return line(id, label, null, { role: 'conditional', covers: covers, note: note });
  }

  function fixed(id, label, qty, covers, note) {
    return line(id, label, qty, { covers: covers, note: note || '' });
  }

  function unnamed(id, label, note, covers) {
    return confirm(label, note, id, covers);
  }

  function per(count, n) {
    if (count == null) return null;
    return Math.max(0, Number(count) || 0) * n;
  }

  // Teaching checklist: 1 infant and 1 child through 8 students, 2 of each above 8.
  // admin.html applySafeSitterExtraManikins adds 2 onto the baseline of 1 for
  // equipment reservations (3 total). These pack counts follow the checklist.
  function safeSitterGear(count) {
    var big = Number(count) > 8;
    return [
      line('infant', 'Infant manikins', big ? 2 : 1, { consumable: false }),
      line('child', 'Child manikins', big ? 2 : 1, { consumable: false }),
      line('av', 'AV kit', 1, { consumable: false })
    ];
  }

  function rcGear() {
    return [
      line('adult', 'Adult manikins', 2, { consumable: false }),
      line('child', 'Child manikins', 2, { consumable: false }),
      line('infant', 'Infant manikins', 2, { consumable: false }),
      line('av', 'AV kit', 1, { consumable: false })
    ];
  }

  function peopleLines(count, instructorCount, rows) {
    if (count == null) {
      return rows.map(function (row) {
        return confirm(row.label, row.blankNote || 'Attendance is not confirmed, so this count is blank.', row.id, row.covers);
      });
    }
    return rows.map(function (row) {
      var n = row.each * count + (row.plusInstructors ? (Number(instructorCount) || 0) : 0) + (row.extra || 0);
      return line(row.id, row.label, n, { consumable: row.consumable !== false, note: row.note, covers: row.covers });
    });
  }

  function copies(instructorCount, id, label, covers, note) {
    var n = Number(instructorCount);
    if (!isFinite(n) || n < 1) n = 1;
    return line(id, label, n, {
      role: 'instructor',
      consumable: false,
      covers: covers,
      note: note || 'One per instructor. The instructor brings this. Not packed from storage.'
    });
  }

  function whenCount(count, id, label, qtyFn, covers, note) {
    if (count == null) return confirm(label, 'Attendance is not confirmed, so this count is blank.', id, covers);
    return line(id, label, qtyFn(count), { covers: covers, note: note || '' });
  }

  var ASK = 'The checklist names this and does not state how many.';
  var SITE_AV = 'Only if the site requires a projector. Do not pack one unless the site needs it.';

  function addSpec(out, count, instructors, s) {
    var covers = s.c;
    if (s.t === 'own') out.push(own(s.id, s.l, covers, s.n));
    else if (s.t === 'copies') out.push(copies(instructors, s.id, s.l, covers, s.n));
    else if (s.t === 'only') out.push(only(s.id, s.l, s.n, covers));
    else if (s.t === 'ask') out.push(unnamed(s.id, s.l, s.n || ASK, covers));
    else if (s.t === 'one') out.push(line(s.id, s.l, s.q || 1, { consumable: !s.hard, covers: covers, note: s.n || '' }));
    else if (s.t === 'each') {
      out.push(peopleLines(count, instructors, [{
        id: s.id,
        label: s.l,
        each: s.each == null ? 1 : s.each,
        plusInstructors: !!s.plus,
        extra: s.extra || 0,
        covers: covers,
        note: s.n,
        consumable: !s.hard
      }])[0]);
    } else if (s.t === 'hard') {
      if (count == null) out.push(confirm(s.l, s.blank || 'Attendance is not confirmed, so this count is blank.', s.id, covers));
      else out.push(line(s.id, s.l, s.q(count), { consumable: false, covers: covers, note: s.n || '' }));
    }
  }

  function fromSpecs(count, instructors, specs) {
    var out = [];
    specs.forEach(function (s) { addSpec(out, count, instructors, s); });
    return out;
  }

  var SS_TAGS = 'Name tags for each participant and instructor (cardstock for table tents if preferred), and a marker';
  var SS_MAN = 'Infant manikin and child manikin (1 each for 8 or fewer students, 2 each above 8)';
  var SS_TOOLS = 'Batteries and screwdriver';
  var SS_POUCH = 'Game pouch (blue zippered) and raffle ticket pouch';
  var SS_BINGO = 'Bingo prizes, tape, and a fake cell phone';
  var SS_DOLLS = 'Soft-bodied dolls and disposable diapers';
  var SS_SETUP = 'Set up and test the digital presentation (laptop, speaker, projector if the site requires). Download it from the Safe Sitter presentation page. Instructor login is required.';
  var SS_MANUAL_NOTE = 'Your Instructor Manual is the primary teaching resource. Speaker notes are a general guide only.';
  var ESS_MAN = 'Infant manikin and child manikin for choking-rescue practice (1 each for 8 or fewer students, 2 each above 8)';
  var ESS_AV = 'Laptop, speaker, and projector if the site requires';
  var ESS_TAGS = 'Name tags for each participant and instructor, and a marker';
  var INTRO_TAGS = 'Name tags (cardstock for table tents if preferred), and a marker';
  var INTRO_DOLLS = 'Diapers and soft-bodied dolls for diapering practice';
  var INTRO_HOME = 'Students may bring a soft-bodied doll from home. The facilitator provides diapers.';
  var INTRO_AV = 'Digital presentation (laptop, speaker, projector if the site requires)';
  var SAH_TAGS = 'Name tags and a marker';
  var SAH_AV = 'Digital presentation (laptop, speaker, projector if the site requires)';
  var SERIES = 'Every week: Facilitator Guide (8-week), student booklets 1 per participant, name tents or tags, and a group expectations poster or whiteboard';
  var W1 = 'Week 1: door prop or classroom door';
  var W2 = 'Week 2: sample weak passwords, and outdoor scenario cards';
  var W3 = 'Week 3: High Five poster, and permission role-play cards';
  var W4 = 'Week 4: travel scenario cards, Safety Signal cards, and phone props';
  var W5 = 'Week 5: phone props (1 per pair), 911 dispatcher scripts, and emergency scenario cards';
  var W6 = 'Week 6: illustrated room scenes (1 set per team), and hazard category cards';
  var W7 = 'Week 7: scenario station cards, station signs, and props';
  var W8 = 'Week 8: showcase scenario cards, course quizzes, completion cards, and parent pages';
  var GP_MAN = 'Infant and child CPR manikins with mouth shields (1 each for 8 or fewer, 2 each above 8)';
  var GP_BOOK = 'Grandparents: Getting Started handbook and completion certificate, 1 per participant';
  var GP_DOLLS = 'Soft-bodied dolls and diapers';
  var RC_MANUAL = 'Red Cross Instructor Manual and Instructor Guide for this course';
  var RC_AV = 'Red Cross course videos and presentation (AV kit: laptop, speaker, projector if the site requires). Set up and test before participants arrive.';
  var RC_TAGS = 'Name tags for each participant and instructor';
  var RC_MARKER = 'Marker for printing names on name tags';
  var RC_ROSTER = 'Printed roster / sign-in sheet';
  var RC_SKILLS = 'Red Cross skills checklists (one per participant)';
  var RC_PENS = 'Pens';
  var RC_AED = 'AED trainers (as needed)';
  var RC_BATT = 'Batteries and screwdriver';
  var RC_LUNGS = 'Manikin face shields and replacement lungs (as needed, stocked at each station)';
  var RC_BARRIER = 'CPR breathing barriers / face shields (one per participant)';
  var RC_GLOVES = 'Disposable gloves (assorted sizes, as needed)';
  var RC_FA = 'First aid practice supplies: bandages, gauze, roller bandages, triangular bandages, tape (as needed)';
  var RC_KIT = 'First aid kit';
  var RC_MATS = 'Mats for child and adult manikin floor stations';
  var RC_WIPES = 'Cleaning / sanitizing wipes and hand sanitizer';
  var MAN_BLANK = 'The kit is 1 of each through 8 students and 2 of each above 8. Attendance is not confirmed.';
  var LM_EXTRA = 'Print everything before the first meeting (quantities for up to 12 members, plus 1 extra of each member item)';
  var LM_CARDS = 'Kit or Not? cards, 1 set. Ouch Meter face cards, 1 set per 4 members. Emergency or Not?, 2 sets. Hot or Not?, 1 set. Safe Snack Sort, 1 set per 4 members. Leaves of Three? and weather cards, 1 set (10-week clubs). Challenge station cards, 1 set.';
  var LM_BADGES = 'Name badges (1 page per 8 members) with holders or pins';
  var LM_BAND = 'Adhesive bandages (10 per member), gauze squares, tape, and a spray bottle';
  var LM_COLD = '4 gel or instant cold packs, and clean cloths';
  var LM_MISC = 'Tissues, play phones (4), crayons, painter\'s tape, and 2 hoops or bins';
  var LM_DOG = 'Stuffed dog, weather gear props, and a music speaker';
  var MFC_POST = '7 posters: Club Pledge, High Five, Four Rules, BEST Care, 10 Diaper Steps, Make Your Call, Happy Kid Toolbox';
  var MFC_CARDS = 'Cards: Safe or Unsafe, Password Challenge, Safety Signal, Ages and Stages (1 set per small group), trait cards (24), Who Am I? clue cards (12), Calm It Down, Hazard Hunt, Make Your Call signs (3) and scenario cards (18), Interview Questions, Lightning Review, and Happy Kid Toolbox (1 set per small group)';
  var MFC_PHONES = 'Play phones (at least 4) and a door prop';
  var MFC_DOLLS = 'Practice dolls, diapers, wipes, and changing pads';
  var MFC_AID = 'Basic first aid supplies: bandages, gauze, and gloves';
  var MFC_TOTE = 'Tote bags, fabric markers, and activity bag supplies';
  var RP_BOX = 'Question box with a slot. Slips of paper and a pencil at every seat.';
  var RP_CRAFT = 'Rhinestones, gems, sequins, and pearls. Fabric glue, tacky glue, and glue dots. Patches, letter beads, and stickers. Puffy paint and fabric markers. Ribbon, tassels, charms, and keychain clips.';
  var RP_TABLE = 'Small trays or paper plates per seat. Table covering, paper towels, wet wipes, and a small trash bin per table.';
  var RP_KIT = 'Kit per girl: 2 pads (different absorbencies), 2 pantyliners, 2 tampons, a pocket tracker card, and an encouragement card';
  var RP_DEMO = 'Product table: 1 pad, a liner, and a tampon with applicator to open. A clear cup of tinted water and a measuring spoon. 2 to 3 tablespoons of tinted water in a small clear jar.';
  var CR_TAGS = 'Name tents or tags, and a marker';
  var CR_TAPE = 'Blue painter\'s tape and a marker, plus the Mindful Beginnings table sign and business cards';
  var CR_TOOLS = 'Batteries and screwdriver, sanitizing wipes, a lined trash bag, and replacement lungs and face shields';
  var CR_DOLL = 'Infant doll, 2 diapers, wipes, and a changing pad';
  var CR_AV = 'Return manikins, supplies, the doll, first aid kit, card deck, handbooks, certificates, and the AV kit';
  var CR_LAPTOP = 'Load the deck on the laptop plus a backup drive. Bring an HDMI cable and adapter.';
  var BR_MAN = 'Infant CPR manikins, 1 per 2 participants, plus replacement lungs or face shields';
  var BR_DOLLS = 'Newborn practice dolls, diapers, and wipes';
  var BR_BED = 'Receiving blankets and a sleep sack, and a baby bottle';
  var GS_GLOVES = 'Nitrile gloves, multiple sizes (2 or more pairs per scout)';
  var GS_BAND = 'Adhesive bandages, gauze pads, roller bandages, medical tape, and triangular bandages or cravats (enough for partner bandaging practice)';
  var GS_COLD = 'Instant cold packs (demo, plus 1 or 2 that can activate)';
  var GS_TOTE = 'First aid kit demo tote with labeled contents, plus level extras (whistle, foil blanket, hike items)';
  var GS_911 = '911 call-script cards (one per scout or pair)';
  var GS_HAND = 'Student handouts, name tags or table tents, and a marker';
  var GS_TRASH = 'Hand sanitizer and a trash bag for glove disposal';
  var GS_SIGN = 'Mindful Beginnings table sign and business cards';
  var GS_BJ = 'Brownie / Junior: kit pouches and item cards, outdoor picture cards, and minor vs. urgent vs. 911 sort cards';
  var GS_CAD = 'Cadette: Red Cross choking steps cue card, and seizure and heat/cold cue cards';
  var GS_SEN = 'Senior: magazine, scarf, and tape for splints, and a neck/spine cue card';
  var GS_AMB = 'Ambassador: summon-help-remotely cue cards, and a home vs. travel or wilderness kit list';
  var STAY_MAN = 'Infant, child, and adult manikins (1 per 2 to 3 students)';
  var STAY_TOOLS = 'Batteries and screwdriver';
  var STAY_LUNGS = 'Replacement lungs and face shields at each station, and cleaning supplies';
  var STAY_TIME = 'Timer, and music or a metronome at 110 bpm';
  var SEASON_TOWEL = 'Towel and tarp for the cooling demo (cooler or tub if space allows)';
  var SOCIAL_DECK = '41-slide deck on the laptop, plus a backup, and a screen or projector';
  var SOCIAL_AGREE = 'Family Tech Agreement, 1 per student plus extras';
  var SOCIAL_PENCILS = 'Pencils and a silent timer';
  var SOCIAL_SIGNS = 'POST and PASS signs';
  var SOCIAL_CARDS = '1 red card and 1 green card per student';
  var SOCIAL_TOOTH = 'Travel toothpaste, a paper plate, and a toothpick (Toothpaste Test)';
  var STEADY_DECK = 'Steady and Ready slide deck, plus a laptop, speaker, and projector (in person)';
  var STEADY_PLAN = 'My Safety Plan worksheets, pencils, and clipboards';
  var STEADY_FIDGET = 'Borrowable fidgets and noise-reducing headphones';
  var GK_DECK = 'Caregiving for Grandparents Workshop slide deck (32 slides) on the laptop, plus a backup';
  var GK_SHEET = 'Babysitting Your Grandkids takeaway sheets, 1 per participant, including large-print versions';

  function ssGear(manikinLine, avLine) {
    return [
      { t: 'hard', id: 'infant', l: 'Infant manikins', c: [manikinLine], q: function (n) { return n > 8 ? 2 : 1; }, blank: MAN_BLANK },
      { t: 'hard', id: 'child', l: 'Child manikins', c: [manikinLine], q: function (n) { return n > 8 ? 2 : 1; }, blank: MAN_BLANK },
      { t: 'one', id: 'av', l: 'AV kit', hard: true, c: [avLine], n: 'Laptop and speaker kit.' },
      { t: 'only', id: 'projector', l: 'Projector', n: SITE_AV, c: [avLine] },
      { t: 'ask', id: 'batteries', l: 'Batteries', c: [SS_TOOLS] },
      { t: 'one', id: 'screwdriver', l: 'Screwdriver', c: [SS_TOOLS], n: 'The checklist names a screwdriver.' }
    ];
  }

  function rcHands() {
    return [
      { t: 'own', id: 'rcManual', l: 'Red Cross Instructor Manual', c: [RC_MANUAL] },
      { t: 'own', id: 'rcGuide', l: 'Red Cross Instructor Guide', c: [RC_MANUAL] },
      { t: 'one', id: 'av', l: 'AV kit', hard: true, c: [RC_AV], n: 'Laptop and speaker.' },
      { t: 'only', id: 'projector', l: 'Projector', n: SITE_AV, c: [RC_AV] },
      { t: 'each', id: 'nameTag', l: 'Name tags', plus: true, c: [RC_TAGS] },
      { t: 'one', id: 'marker', l: 'Marker', c: [RC_MARKER], n: 'The checklist names a marker.' },
      { t: 'one', id: 'roster', l: 'Printed roster / sign-in sheet', c: [RC_ROSTER], n: 'The checklist names the roster.' },
      { t: 'each', id: 'rcSkills', l: 'Red Cross skills checklists', c: [RC_SKILLS] },
      { t: 'ask', id: 'pens', l: 'Pens', c: [RC_PENS] },
      { t: 'one', id: 'adult', l: 'Adult manikins', q: 2, hard: true, c: ['2 adult manikins'] },
      { t: 'one', id: 'child', l: 'Child manikins', q: 2, hard: true, c: ['2 child / pediatric manikins'] },
      { t: 'one', id: 'infant', l: 'Infant manikins', q: 2, hard: true, c: ['2 infant manikins'] },
      { t: 'ask', id: 'aed', l: 'AED trainers', n: 'The checklist says as needed and does not state how many.', c: [RC_AED] },
      { t: 'ask', id: 'batteries', l: 'Batteries', c: [RC_BATT] },
      { t: 'one', id: 'screwdriver', l: 'Screwdriver', c: [RC_BATT], n: 'The checklist names a screwdriver.' },
      { t: 'ask', id: 'lungs', l: 'Manikin face shields and replacement lungs', n: 'The checklist says as needed, stocked at each station, and does not state how many.', c: [RC_LUNGS] },
      { t: 'each', id: 'barrier', l: 'CPR breathing barriers', c: [RC_BARRIER] },
      { t: 'ask', id: 'gloves', l: 'Disposable gloves', n: 'The checklist says assorted sizes, as needed, and does not state how many.', c: [RC_GLOVES] },
      { t: 'ask', id: 'bandages', l: 'Bandages', n: 'The checklist says as needed and does not state how many.', c: [RC_FA] },
      { t: 'ask', id: 'gauze', l: 'Gauze', n: 'The checklist says as needed and does not state how many.', c: [RC_FA] },
      { t: 'ask', id: 'roller', l: 'Roller bandages', n: 'The checklist says as needed and does not state how many.', c: [RC_FA] },
      { t: 'ask', id: 'triangular', l: 'Triangular bandages', n: 'The checklist says as needed and does not state how many.', c: [RC_FA] },
      { t: 'ask', id: 'tape', l: 'Tape', n: 'The checklist says as needed and does not state how many.', c: [RC_FA] },
      { t: 'one', id: 'firstAidKit', l: 'First aid kit', c: [RC_KIT], n: 'The checklist names a first aid kit.' },
      { t: 'ask', id: 'mats', l: 'Mats for floor stations', c: [RC_MATS] },
      { t: 'ask', id: 'wipes', l: 'Cleaning / sanitizing wipes', c: [RC_WIPES] },
      { t: 'ask', id: 'sanitizer', l: 'Hand sanitizer', c: [RC_WIPES] }
    ];
  }

  var COURSE_SPECS = {
    'safe-sitter': [
      { t: 'own', id: 'ssManual', l: 'Instructor Manual', c: ['Instructor Manual', SS_MANUAL_NOTE] },
      { t: 'each', id: 'ssHandbook', l: 'Safe Sitter Student Handbooks', c: ['Safe Sitter Student Handbook, 1 per student'] },
      { t: 'each', id: 'ssNotebook', l: 'Safe Sitter Important Information note pads', c: ['Safe Sitter Important Information Note Pad, 1 per student'] },
      { t: 'each', id: 'nameTag', l: 'Name tags', plus: true, c: [SS_TAGS] },
      { t: 'one', id: 'marker', l: 'Marker', c: [SS_TAGS], n: 'The checklist names a marker.' },
      { t: 'only', id: 'cardstock', l: 'Cardstock for table tents', n: 'Only if you use table tents. The checklist does not say how many.', c: [SS_TAGS] },
      { t: 'only', id: 'ssBadges', l: 'Safe Sitter badges', n: 'Only for a Girl Scout or Boy Scout troop. Troop status is not assumed, so these are not packed from this sheet.', c: ['Safe Sitter badges (Girl Scout and Boy Scout troops only)'] },
      { t: 'ask', id: 'ssEval', l: 'Student evaluation forms', n: 'The checklist lists the forms and does not state how many.', c: ['Student Evaluation Forms'] },
      { t: 'one', id: 'gamePouch', l: 'Game pouch (blue zippered)', c: [SS_POUCH], n: 'The checklist names this pouch.' },
      { t: 'one', id: 'rafflePouch', l: 'Raffle ticket pouch', c: [SS_POUCH], n: 'The checklist names this pouch.' },
      { t: 'ask', id: 'bingoPrizes', l: 'Bingo prizes', c: [SS_BINGO] },
      { t: 'ask', id: 'tape', l: 'Tape', c: [SS_BINGO] },
      { t: 'one', id: 'fakePhone', l: 'Fake cell phone', c: [SS_BINGO], n: 'The checklist names a fake cell phone.' },
      { t: 'ask', id: 'dolls', l: 'Soft-bodied dolls', c: [SS_DOLLS] },
      { t: 'ask', id: 'diapers', l: 'Disposable diapers', c: [SS_DOLLS] },
      { t: 'each', id: 'faceShield', l: 'CPR face shield protectors', c: ['CPR face shield protectors, 1 per participant'] }
    ].concat(ssGear(SS_MAN, SS_SETUP)),
    'ss-essentials': [
      { t: 'own', id: 'ssGuide', l: 'Facilitator guide', c: ['Facilitator guide'] },
      { t: 'each', id: 'ssHandbook', l: 'Safe Sitter Student Handbooks', c: ['Safe Sitter Student Handbook, 1 per student'] },
      { t: 'each', id: 'ssNotebook', l: 'Safe Sitter Important Information note pads', c: ['Safe Sitter Important Information Note Pad, 1 per student'] },
      { t: 'each', id: 'nameTag', l: 'Name tags', plus: true, c: [ESS_TAGS] },
      { t: 'one', id: 'marker', l: 'Marker', c: [ESS_TAGS], n: 'The checklist names a marker.' },
      { t: 'ask', id: 'ssEval', l: 'Student evaluation forms', n: 'The checklist lists the forms and does not state how many.', c: ['Student Evaluation Forms'] },
      { t: 'ask', id: 'dolls', l: 'Soft-bodied dolls', c: [SS_DOLLS] },
      { t: 'ask', id: 'diapers', l: 'Disposable diapers', c: [SS_DOLLS] },
      { t: 'each', id: 'faceShield', l: 'CPR face shield protectors', c: ['CPR face shield protectors, 1 per participant'] }
    ].concat(ssGear(ESS_MAN, ESS_AV)),
    'intro-babysitting': [
      { t: 'own', id: 'itbManual', l: 'Instructor Manual / Facilitator Guide', c: ['Instructor Manual / Facilitator Guide'] },
      { t: 'each', id: 'itbHandbook', l: 'Intro to Babysitting handbooks', c: ['Intro to Babysitting handbook, 1 per student'] },
      { t: 'each', id: 'pen', l: 'Pens or pencils', c: ['Pen or pencil, 1 per student'] },
      { t: 'each', id: 'nameTag', l: 'Name tags', c: [INTRO_TAGS] },
      { t: 'one', id: 'marker', l: 'Marker', c: [INTRO_TAGS], n: 'The checklist names a marker.' },
      { t: 'only', id: 'cardstock', l: 'Cardstock for table tents', n: 'Only if you use table tents. The checklist does not say how many.', c: [INTRO_TAGS] },
      { t: 'only', id: 'dolls', l: 'Soft-bodied dolls', n: 'Students may bring a doll from home. Do not pack a doll for every student.', c: [INTRO_DOLLS, INTRO_HOME] },
      { t: 'ask', id: 'diapers', l: 'Diapers', n: 'The facilitator provides diapers. The checklist does not state how many.', c: [INTRO_DOLLS, INTRO_HOME] },
      { t: 'one', id: 'av', l: 'AV kit', hard: true, c: [INTRO_AV], n: 'Laptop and speaker.' },
      { t: 'only', id: 'projector', l: 'Projector', n: SITE_AV, c: [INTRO_AV] }
    ],
    'safe-at-home': [
      { t: 'own', id: 'sahManual', l: 'Instructor Manual / Safe@Home Facilitator Guide', c: ['Instructor Manual / Safe@Home Facilitator Guide'] },
      { t: 'each', id: 'sahHandbook', l: 'Safe@Home student handbooks', c: ['Safe@Home student handbooks, 1 per student'] },
      { t: 'each', id: 'sahCertificate', l: 'Safe@Home completion certificates', c: ['Safe@Home completion certificates, 1 per student'] },
      { t: 'each', id: 'pen', l: 'Pencils or pens', c: ['Pencils or pens, 1 per participant'] },
      { t: 'each', id: 'nameTag', l: 'Name tags', c: [SAH_TAGS] },
      { t: 'one', id: 'marker', l: 'Marker', c: [SAH_TAGS], n: 'The checklist names a marker.' },
      { t: 'one', id: 'av', l: 'AV kit', hard: true, c: [SAH_AV], n: 'Laptop and speaker.' },
      { t: 'only', id: 'projector', l: 'Projector', n: SITE_AV, c: [SAH_AV] }
    ],
    'safe-at-home-series': [
      { t: 'own', id: 'sahGuide', l: 'Facilitator Guide (8-week)', c: [SERIES] },
      { t: 'each', id: 'sahHandbook', l: 'Safe@Home student booklets', c: [SERIES] },
      { t: 'each', id: 'nameTag', l: 'Name tents or tags', c: [SERIES] },
      { t: 'one', id: 'poster', l: 'Group expectations poster or whiteboard', c: [SERIES], n: 'The checklist names one poster or a whiteboard.' },
      { t: 'only', id: 'door', l: 'Door prop', n: 'Use the classroom door when the room has one. Pack a door prop only if it does not.', c: [W1] },
      { t: 'ask', id: 'passwords', l: 'Sample weak passwords', c: [W2] },
      { t: 'ask', id: 'outdoorCards', l: 'Outdoor scenario cards', c: [W2] },
      { t: 'one', id: 'highFive', l: 'High Five poster', c: [W3], n: 'The checklist names the High Five poster.' },
      { t: 'ask', id: 'permissionCards', l: 'Permission role-play cards', c: [W3] },
      { t: 'ask', id: 'travelCards', l: 'Travel scenario cards', c: [W4] },
      { t: 'ask', id: 'signalCards', l: 'Safety Signal cards', c: [W4] },
      { t: 'hard', id: 'phones', l: 'Phone props', c: [W4, W5], n: 'Week 5 says 1 per pair. Week 4 names the same props.', blank: 'Attendance is not confirmed, so the 1-per-pair phone props are blank.', q: function (n) { return Math.ceil(n / 2); } },
      { t: 'ask', id: 'dispatchScripts', l: '911 dispatcher scripts', c: [W5] },
      { t: 'ask', id: 'emergencyCards', l: 'Emergency scenario cards', c: [W5] },
      { t: 'ask', id: 'roomScenes', l: 'Illustrated room scenes', n: 'The checklist says 1 set per team and does not say how many teams.', c: [W6] },
      { t: 'ask', id: 'hazardCards', l: 'Hazard category cards', c: [W6] },
      { t: 'ask', id: 'stationCards', l: 'Scenario station cards', c: [W7] },
      { t: 'ask', id: 'stationSigns', l: 'Station signs', c: [W7] },
      { t: 'ask', id: 'props', l: 'Station props', c: [W7] },
      { t: 'ask', id: 'showcaseCards', l: 'Showcase scenario cards', c: [W8] },
      { t: 'ask', id: 'quizzes', l: 'Course quizzes', c: [W8] },
      { t: 'ask', id: 'completionCards', l: 'Completion cards', c: [W8] },
      { t: 'ask', id: 'parentPages', l: 'Parent pages', c: [W8] }
    ],
    'grandparents': [
      { t: 'own', id: 'gpManual', l: 'Instructor Manual', c: ['Instructor Manual'] },
      { t: 'each', id: 'nameTag', l: 'Name tags', c: ['Name tags and a marker'] },
      { t: 'one', id: 'marker', l: 'Marker', c: ['Name tags and a marker'], n: 'The checklist names a marker.' },
      { t: 'each', id: 'gpHandbook', l: 'Grandparents handbooks', c: [GP_BOOK] },
      { t: 'each', id: 'gpCertificate', l: 'Grandparents completion certificates', c: [GP_BOOK] },
      { t: 'each', id: 'pen', l: 'Pens or pencils', c: ['Pen or pencil, 1 per participant'] },
      { t: 'hard', id: 'infant', l: 'Infant manikins', c: [GP_MAN], blank: 'The checklist says 1 of each through 8 participants and 2 of each above 8. Attendance is not confirmed.', q: function (n) { return n > 8 ? 2 : 1; } },
      { t: 'hard', id: 'child', l: 'Child manikins', c: [GP_MAN], blank: 'The checklist says 1 of each through 8 participants and 2 of each above 8. Attendance is not confirmed.', q: function (n) { return n > 8 ? 2 : 1; } },
      { t: 'ask', id: 'mouthShields', l: 'Mouth shields', n: 'The checklist says manikins with mouth shields and does not state a separate shield count.', c: [GP_MAN] },
      { t: 'ask', id: 'dolls', l: 'Soft-bodied dolls', c: [GP_DOLLS] },
      { t: 'ask', id: 'diapers', l: 'Diapers', c: [GP_DOLLS] },
      { t: 'ask', id: 'gpEval', l: 'Evaluation forms', n: 'The checklist lists the forms and does not state how many.', c: ['Evaluation forms'] },
      { t: 'ask', id: 'gpHandout', l: 'CPR and choking rescue updates handouts', c: ['CPR and choking rescue updates handouts'] }
    ],
    'stay-ready': [
      { t: 'own', id: 'stayGuide', l: 'Facilitator Guide', c: ['Facilitator Guide'] },
      { t: 'ask', id: 'nameTag', l: 'Name tags', n: 'The checklist names name tags and does not say how many per student.', c: [SAH_TAGS] },
      { t: 'one', id: 'marker', l: 'Marker', c: [SAH_TAGS], n: 'The checklist names a marker.' },
      { t: 'each', id: 'takeaway', l: 'Printed takeaway sheets', c: ['Printed takeaway sheets, 1 per seat'] },
      { t: 'one', id: 'timer', l: 'Timer', c: [STAY_TIME], n: 'The checklist names a timer.' },
      { t: 'one', id: 'metronome', l: 'Music or a metronome', c: [STAY_TIME], n: 'The checklist names music or a metronome, one or the other.' },
      { t: 'ask', id: 'infant', l: 'Infant manikins', n: 'The checklist says 1 per 2 to 3 students and does not pick one ratio.', c: [STAY_MAN] },
      { t: 'ask', id: 'child', l: 'Child manikins', n: 'The checklist says 1 per 2 to 3 students and does not pick one ratio.', c: [STAY_MAN] },
      { t: 'ask', id: 'adult', l: 'Adult manikins', n: 'The checklist says 1 per 2 to 3 students and does not pick one ratio.', c: [STAY_MAN] },
      { t: 'ask', id: 'batteries', l: 'Batteries', c: [STAY_TOOLS] },
      { t: 'one', id: 'screwdriver', l: 'Screwdriver', c: [STAY_TOOLS], n: 'The checklist names a screwdriver.' },
      { t: 'ask', id: 'lungs', l: 'Replacement lungs and face shields', n: 'The checklist says these go at each station and does not state how many.', c: [STAY_LUNGS] },
      { t: 'ask', id: 'cleaning', l: 'Cleaning supplies', c: [STAY_LUNGS] },
      { t: 'only', id: 'mats', l: 'Mats', n: 'Use clear floor space when the room has it. Pack mats only if the floor is not usable.', c: ['Mats or clear floor space for seizure practice'] }
    ],
    'season-ready': [
      { t: 'own', id: 'seasonGuide', l: 'Facilitator Guide', c: ['Facilitator Guide'] },
      { t: 'ask', id: 'nameTag', l: 'Name tags', n: 'The checklist names name tags and does not say how many per student.', c: [SAH_TAGS] },
      { t: 'one', id: 'marker', l: 'Marker', c: [SAH_TAGS], n: 'The checklist names a marker.' },
      { t: 'ask', id: 'scenarioCards', l: 'Printed scenario cards', c: ['Printed scenario cards'] },
      { t: 'each', id: 'phoneCards', l: 'Take-home phone cards', c: ['Take-home phone cards, 1 per student'] },
      { t: 'one', id: 'hydration', l: 'Hydration color chart', c: ['Hydration color chart (laminated or projected)'], n: 'The checklist names the chart.' },
      { t: 'ask', id: 'packaging', l: 'Empty packaging or photos', c: ['Empty packaging or photos of sports drinks, energy drinks, and supplements (Label Detective)'] },
      { t: 'ask', id: 'fuelCards', l: 'Fuel the Day index cards', n: 'The checklist says 1 set per team and does not say how many teams.', c: ['Fuel the Day index cards, 1 set per team'] },
      { t: 'ask', id: 'painCards', l: 'Sort the Pain statement cards', n: 'The checklist says 1 set per team and does not say how many teams.', c: ['Sort the Pain statement cards, 1 set per team'] },
      { t: 'ask', id: 'concussionCards', l: 'Concussion sign cards', c: ['Concussion sign cards (Spot the Signs)'] },
      { t: 'ask', id: 'adult', l: 'Adult CPR manikins', n: 'The checklist says one or more and does not state how many.', c: ['One or more adult CPR manikins'] },
      { t: 'one', id: 'aed', l: 'AED trainer with pads', hard: true, c: ['AED trainer with pads'], n: 'The checklist names one AED trainer.' },
      { t: 'ask', id: 'towel', l: 'Towel', c: [SEASON_TOWEL] },
      { t: 'ask', id: 'tarp', l: 'Tarp', c: [SEASON_TOWEL] },
      { t: 'only', id: 'cooler', l: 'Cooler or tub', n: 'Only if the space allows. The checklist does not say to pack one otherwise.', c: [SEASON_TOWEL] }
    ],
    'campus-ready': [
      { t: 'own', id: 'campusGuide', l: 'Facilitator Guide', c: ['Facilitator Guide'] },
      { t: 'ask', id: 'nameTag', l: 'Name tags', n: 'The checklist names name tags and does not say how many per student.', c: [SAH_TAGS] },
      { t: 'one', id: 'marker', l: 'Marker', c: [SAH_TAGS], n: 'The checklist names a marker.' },
      { t: 'one', id: 'adult', l: 'Adult CPR manikin', hard: true, c: ['Adult CPR manikin for hands-only practice'], n: 'The checklist names one adult manikin.' },
      { t: 'ask', id: 'narcan', l: 'Narcan (naloxone) training devices', c: ['Narcan (naloxone) training devices'] },
      { t: 'one', id: 'phoneCard', l: 'Campus Ready phone card', c: ['Campus Ready phone card (students save it to a phone)'], n: 'The checklist names the phone card students save to a phone.' },
      { t: 'one', id: 'av', l: 'AV kit', hard: true, c: [SAH_AV], n: 'Laptop and speaker.' },
      { t: 'only', id: 'projector', l: 'Projector', n: SITE_AV, c: [SAH_AV] }
    ],
    'all-kids-welcome': [
      { t: 'own', id: 'akwGuide', l: 'Instructor Guide', c: ['Instructor Guide'] },
      { t: 'own', id: 'akwKey', l: 'Scenario Answer Key', c: ['Scenario Answer Key (instructor use)'], n: 'Instructor use. Not packed as a student supply.' },
      { t: 'ask', id: 'nameTag', l: 'Name tags', n: 'The checklist names name tags and does not say how many per student.', c: [SAH_TAGS] },
      { t: 'one', id: 'marker', l: 'Marker', c: [SAH_TAGS], n: 'The checklist names a marker.' },
      { t: 'each', id: 'pen', l: 'Pens or pencils', c: ['Pen or pencil, 1 per participant'] },
      { t: 'each', id: 'takeaway', l: 'All Kids Welcome takeaway sheets', c: ['All Kids Welcome takeaway sheets, 1 per participant'] },
      { t: 'one', id: 'av', l: 'AV kit', hard: true, c: [SAH_AV], n: 'Laptop and speaker.' },
      { t: 'only', id: 'projector', l: 'Projector', n: SITE_AV, c: [SAH_AV] }
    ],
    'grandkids': [
      { t: 'own', id: 'gkGuide', l: 'Facilitator Guide', c: ['Facilitator Guide (60-minute workshop)'] },
      { t: 'one', id: 'av', l: 'Laptop', hard: true, c: [GK_DECK], n: 'The slide deck is on the laptop.' },
      { t: 'one', id: 'backup', l: 'Backup of the slide deck', c: [GK_DECK], n: 'The checklist says plus a backup.' },
      { t: 'only', id: 'projector', l: 'Projector or a large screen', n: 'Pack one only if the room does not already have a screen.', c: ['Projector or a large screen'] },
      { t: 'each', id: 'takeaway', l: 'Babysitting Your Grandkids takeaway sheets', c: [GK_SHEET] },
      { t: 'only', id: 'largePrint', l: 'Large-print takeaway sheets', n: 'Only for participants who need large print. The checklist does not say how many.', c: [GK_SHEET] }
    ],
    'baby-ready': [
      { t: 'own', id: 'brGuide', l: 'Facilitator Guide', c: ['Facilitator Guide'] },
      { t: 'each', id: 'takeaway', l: 'Baby Ready takeaway sheets', c: ['Baby Ready takeaway sheet, 1 per participant (two-sided)'] },
      { t: 'one', id: 'metronome', l: 'Music or a metronome', c: ['Music or a metronome at 110 bpm'], n: 'The checklist names music or a metronome.' },
      { t: 'hard', id: 'infant', l: 'Infant CPR manikins', c: [BR_MAN], blank: 'The checklist says 1 per 2 participants. Attendance is not confirmed.', q: function (n) { return Math.ceil(n / 2); } },
      { t: 'ask', id: 'lungs', l: 'Replacement lungs or face shields', c: [BR_MAN] },
      { t: 'ask', id: 'dolls', l: 'Newborn practice dolls', c: [BR_DOLLS] },
      { t: 'ask', id: 'diapers', l: 'Diapers', c: [BR_DOLLS] },
      { t: 'ask', id: 'wipes', l: 'Wipes', c: [BR_DOLLS] },
      { t: 'ask', id: 'blankets', l: 'Receiving blankets', c: [BR_BED] },
      { t: 'one', id: 'sleepSack', l: 'Sleep sack', c: [BR_BED], n: 'The checklist names a sleep sack.' },
      { t: 'one', id: 'bottle', l: 'Baby bottle', c: [BR_BED], n: 'The checklist names a baby bottle.' },
      { t: 'one', id: 'thermometer', l: 'Digital thermometer', c: ['Digital thermometer (rectal demo on a doll)'], n: 'The checklist names a digital thermometer.' },
      { t: 'ask', id: 'cleaning', l: 'Cleaning supplies and wipes', n: 'The checklist says wipes for every station and does not say how many per station.', c: ['Cleaning supplies and wipes for every station'] }
    ],
    'care-ready': [
      { t: 'own', id: 'careGuide', l: 'Facilitator Guide', c: ['Facilitator Guide'] },
      { t: 'each', id: 'nameTag', l: 'Name tents or tags', c: [CR_TAGS] },
      { t: 'one', id: 'marker', l: 'Marker', c: [CR_TAGS, CR_TAPE], n: 'The checklist names a marker.' },
      { t: 'each', id: 'careHandbook', l: 'Care Ready handbooks', extra: 2, n: 'Includes 2 spares, as the checklist says.', c: ['Care Ready handbook, 1 per participant plus 2 spares'] },
      { t: 'ask', id: 'careCertificate', l: 'Completion certificates', n: 'The checklist says to pre-print completion certificates and does not state how many.', c: ['Completion certificates'] },
      { t: 'one', id: 'signIn', l: 'Sign-in sheet', c: ['Sign-in sheet and printed roster'], n: 'The checklist names a sign-in sheet.' },
      { t: 'one', id: 'roster', l: 'Printed roster', c: ['Sign-in sheet and printed roster'], n: 'The checklist names a printed roster.' },
      { t: 'each', id: 'pen', l: 'Pens', extra: 10, n: 'Includes 10 spares, as the checklist says.', c: ['Pens, 1 per participant plus 10 spares'] },
      { t: 'one', id: 'cardDeck', l: 'Scenario card deck', c: ['Scenario card deck (behavior, triage, choking)'], n: 'The checklist names the deck.' },
      { t: 'one', id: 'sampleKit', l: 'Sample first aid kit', c: ['Sample first aid kit, opened'], n: 'The checklist names the opened sample kit.' },
      { t: 'ask', id: 'painterTape', l: 'Blue painter\'s tape', c: [CR_TAPE] },
      { t: 'one', id: 'tableSign', l: 'Mindful Beginnings table sign', c: [CR_TAPE], n: 'The checklist names the table sign.' },
      { t: 'ask', id: 'cards', l: 'Business cards', c: [CR_TAPE] },
      { t: 'hard', id: 'infant', l: 'Infant manikins', c: ['Infant manikins, 1 per participant'], blank: 'The checklist says 1 per participant. Attendance is not confirmed.', q: function (n) { return n; } },
      { t: 'hard', id: 'child', l: 'Child manikins', c: ['Child manikins, 1 per 2 participants'], blank: 'The checklist says 1 per 2 participants. Attendance is not confirmed.', q: function (n) { return Math.ceil(n / 2); } },
      { t: 'ask', id: 'batteries', l: 'Batteries', c: [CR_TOOLS] },
      { t: 'one', id: 'screwdriver', l: 'Screwdriver', c: [CR_TOOLS], n: 'The checklist names a screwdriver.' },
      { t: 'ask', id: 'wipes', l: 'Sanitizing wipes', c: [CR_TOOLS] },
      { t: 'one', id: 'trashBag', l: 'Lined trash bag', c: [CR_TOOLS], n: 'The checklist names a lined trash bag.' },
      { t: 'ask', id: 'lungs', l: 'Replacement lungs and face shields', c: [CR_TOOLS] },
      { t: 'one', id: 'doll', l: 'Infant doll', c: [CR_DOLL], n: 'The checklist names an infant doll.' },
      { t: 'one', id: 'diapers', l: 'Diapers', q: 2, c: [CR_DOLL], n: 'The checklist says 2 diapers.' },
      { t: 'ask', id: 'dollWipes', l: 'Wipes', c: [CR_DOLL] },
      { t: 'one', id: 'changingPad', l: 'Changing pad', c: [CR_DOLL], n: 'The checklist names a changing pad.' },
      { t: 'one', id: 'av', l: 'AV kit', hard: true, c: [CR_AV, CR_LAPTOP], n: 'Laptop and speaker.' },
      { t: 'one', id: 'backup', l: 'Backup drive', c: [CR_LAPTOP], n: 'The checklist says a backup drive.' },
      { t: 'one', id: 'hdmi', l: 'HDMI cable', c: [CR_LAPTOP], n: 'The checklist says to bring an HDMI cable.' },
      { t: 'one', id: 'adapter', l: 'Adapter', c: [CR_LAPTOP], n: 'The checklist says to bring an adapter.' }
    ],
    'steady-and-ready': [
      { t: 'own', id: 'steadyGuide', l: 'Facilitator Guide', c: ['Facilitator Guide'] },
      { t: 'one', id: 'av', l: 'AV kit', hard: true, c: [STEADY_DECK], n: 'Laptop and speaker for the in-person class.' },
      { t: 'one', id: 'projector', l: 'Projector', c: [STEADY_DECK], n: 'The checklist names a projector for the in-person class.' },
      { t: 'each', id: 'agenda', l: 'Printed agendas', c: ['Printed agenda per learner'] },
      { t: 'ask', id: 'worksheets', l: 'My Safety Plan worksheets', c: [STEADY_PLAN] },
      { t: 'ask', id: 'pencils', l: 'Pencils', c: [STEADY_PLAN] },
      { t: 'ask', id: 'clipboards', l: 'Clipboards', c: [STEADY_PLAN] },
      { t: 'ask', id: 'certificates', l: 'Certificates of completion', c: ['Certificates of completion'] },
      { t: 'ask', id: 'fidgets', l: 'Borrowable fidgets', c: [STEADY_FIDGET] },
      { t: 'ask', id: 'headphones', l: 'Noise-reducing headphones', c: [STEADY_FIDGET] },
      { t: 'ask', id: 'practiceCards', l: 'Practice cards', c: ['Practice cards'] },
      { t: 'only', id: 'practicePhone', l: 'Toy or unplugged phone', n: 'Optional. Pack one only if you want the 911 prop.', c: ['Toy or unplugged phone for 911 practice (optional)'] }
    ],
    'gs-first-aid': [
      { t: 'ask', id: 'gloves', l: 'Nitrile gloves', n: 'The checklist says 2 or more pairs per scout and does not fix the number.', c: [GS_GLOVES] },
      { t: 'ask', id: 'bandages', l: 'Adhesive bandages', n: 'The checklist says enough for partner practice and does not state how many.', c: [GS_BAND] },
      { t: 'ask', id: 'gauze', l: 'Gauze pads', n: 'The checklist says enough for partner practice and does not state how many.', c: [GS_BAND] },
      { t: 'ask', id: 'roller', l: 'Roller bandages', n: 'The checklist says enough for partner practice and does not state how many.', c: [GS_BAND] },
      { t: 'ask', id: 'medTape', l: 'Medical tape', n: 'The checklist says enough for partner practice and does not state how many.', c: [GS_BAND] },
      { t: 'ask', id: 'triangular', l: 'Triangular bandages or cravats', n: 'The checklist says enough for partner practice and does not state how many.', c: [GS_BAND] },
      { t: 'ask', id: 'wipes', l: 'Antiseptic or saline wipe packs', c: ['Antiseptic or saline wipe packs'] },
      { t: 'ask', id: 'coldPacks', l: 'Instant cold packs', n: 'The checklist says a demo plus 1 or 2 that can activate.', c: [GS_COLD] },
      { t: 'one', id: 'demoTote', l: 'First aid kit demo tote', c: [GS_TOTE], n: 'The checklist names the demo tote.' },
      { t: 'only', id: 'levelExtras', l: 'Level extras (whistle, foil blanket, hike items)', n: 'Only for the troop level that uses them. This sheet does not choose the level, and the checklist does not state how many.', c: [GS_TOTE] },
      { t: 'ask', id: 'scriptCards', l: '911 call-script cards', n: 'The checklist says one per scout or pair and does not pick one ratio.', c: [GS_911] },
      { t: 'ask', id: 'scenarioCards', l: 'Printed scenario cards', c: ['Printed scenario cards (injury described in words only)'] },
      { t: 'ask', id: 'handouts', l: 'Student handouts', c: [GS_HAND] },
      { t: 'ask', id: 'nameTag', l: 'Name tags or table tents', c: [GS_HAND] },
      { t: 'one', id: 'marker', l: 'Marker', c: [GS_HAND], n: 'The checklist names a marker.' },
      { t: 'ask', id: 'sanitizer', l: 'Hand sanitizer', c: [GS_TRASH] },
      { t: 'one', id: 'trashBag', l: 'Trash bag', c: [GS_TRASH], n: 'The checklist names a trash bag.' },
      { t: 'one', id: 'tableSign', l: 'Mindful Beginnings table sign', c: [GS_SIGN], n: 'The checklist names the table sign.' },
      { t: 'ask', id: 'bizCards', l: 'Business cards', c: [GS_SIGN] },
      { t: 'only', id: 'bjPouches', l: 'Brownie / Junior kit pouches and item cards', n: 'Only for a Brownie or Junior troop. Troop level is not assumed, and the checklist does not state how many.', c: [GS_BJ] },
      { t: 'only', id: 'bjOutdoor', l: 'Brownie / Junior outdoor picture cards', n: 'Only for a Brownie or Junior troop. Troop level is not assumed, and the checklist does not state how many.', c: [GS_BJ] },
      { t: 'only', id: 'bjSort', l: 'Brownie / Junior sort cards', n: 'Only for a Brownie or Junior troop. Troop level is not assumed, and the checklist does not state how many.', c: [GS_BJ] },
      { t: 'only', id: 'cadChoke', l: 'Cadette choking steps cue card', n: 'Only for a Cadette troop. If this troop is Cadette, the checklist names one cue card. Troop level is not assumed.', c: [GS_CAD] },
      { t: 'only', id: 'cadCues', l: 'Cadette seizure and heat/cold cue cards', n: 'Only for a Cadette troop. Troop level is not assumed, and the checklist does not state how many.', c: [GS_CAD] },
      { t: 'only', id: 'senMag', l: 'Senior magazine', n: 'Only for a Senior troop. If this troop is Senior, pack 1 magazine. Troop level is not assumed.', c: [GS_SEN] },
      { t: 'only', id: 'senScarf', l: 'Senior scarf', n: 'Only for a Senior troop. If this troop is Senior, pack 1 scarf. Troop level is not assumed.', c: [GS_SEN] },
      { t: 'only', id: 'senTape', l: 'Senior splint tape', n: 'Only for a Senior troop. Troop level is not assumed, and the checklist does not state how much tape.', c: [GS_SEN] },
      { t: 'only', id: 'senCue', l: 'Senior neck/spine cue card', n: 'Only for a Senior troop. If this troop is Senior, the checklist names one cue card. Troop level is not assumed.', c: [GS_SEN] },
      { t: 'only', id: 'ambCues', l: 'Ambassador summon-help cue cards', n: 'Only for an Ambassador troop. Troop level is not assumed, and the checklist does not state how many.', c: [GS_AMB] },
      { t: 'only', id: 'ambList', l: 'Ambassador home vs. travel or wilderness kit list', n: 'Only for an Ambassador troop. Troop level is not assumed, and the checklist does not state how many copies.', c: [GS_AMB] }
    ]
  };

  COURSE_SPECS['baby-ready-cpr'] = COURSE_SPECS['baby-ready'].concat([
    { t: 'one', id: 'child', l: 'Child manikin', hard: true, c: ['Child manikin for the CPR certification block'], n: 'The checklist names one child manikin for the certification block.' },
    { t: 'each', id: 'cprCard', l: 'Baby Ready + CPR certification cards', c: ['Baby Ready + CPR certification card, 1 per participant'] }
  ]);

  COURSE_SPECS['rc-bt-peds'] = rcHands().concat([
    { t: 'each', id: 'rcHandbook', l: 'Red Cross Babysitter\'s Training participant handbooks', c: ['Red Cross Babysitter\'s Training participant handbooks (one per participant)'] },
    { t: 'ask', id: 'dolls', l: 'Baby dolls', n: 'The checklist says as needed and does not state how many.', c: ['Baby dolls for diapering and holding practice (as needed)'] },
    { t: 'ask', id: 'diaperSupplies', l: 'Diapering practice supplies', n: 'The checklist says as needed and does not state how many.', c: ['Diapering practice supplies (as needed)'] }
  ]);

  COURSE_SPECS['rc-adult-peds'] = rcHands().concat([
    { t: 'each', id: 'rcHandout', l: 'Red Cross participant handouts', n: 'One per participant when this course uses the handout.', c: ['Red Cross participant handouts / ready reference cards (one per participant, if applicable)'] }
  ]);

  COURSE_SPECS['rc-workplace'] = COURSE_SPECS['rc-adult-peds'];

  (function () {
    var posters = ['Club Pledge', 'High Five', 'Four Rules', 'BEST Care', '10 Diaper Steps', 'Make Your Call', 'Happy Kid Toolbox'];
    var posterSpecs = posters.map(function (name, i) {
      return { t: 'one', id: 'poster' + i, l: name + ' poster', c: [MFC_POST], n: 'One of the 7 named posters.' };
    });
    COURSE_SPECS['my-first-club'] = [
      { t: 'own', id: 'mfcGuide', l: 'Facilitator Guide', c: ['Facilitator Guide'] },
      { t: 'each', id: 'mfcHandbook', l: 'Club handbooks', c: ['Club handbooks, 1 per member'] },
      { t: 'each', id: 'mfcCertificate', l: 'Certificates', c: ['Certificates, 1 per member'] },
      { t: 'each', id: 'mfcPages', l: 'Family take-home pages', c: ['Family take-home pages, 1 per member'] },
      { t: 'each', id: 'nameTag', l: 'Name tag supplies', c: ['Name tag supplies, 1 per member, and a marker'] },
      { t: 'one', id: 'marker', l: 'Marker', c: ['Name tag supplies, 1 per member, and a marker'], n: 'The checklist names a marker.' }
    ].concat(posterSpecs).concat([
      { t: 'ask', id: 'safeCards', l: 'Safe or Unsafe cards', c: [MFC_CARDS] },
      { t: 'ask', id: 'passwordCards', l: 'Password Challenge cards', c: [MFC_CARDS] },
      { t: 'ask', id: 'signalCards', l: 'Safety Signal cards', c: [MFC_CARDS] },
      { t: 'ask', id: 'agesCards', l: 'Ages and Stages cards', n: 'The checklist says 1 set per small group and does not say how many groups.', c: [MFC_CARDS] },
      { t: 'one', id: 'traitCards', l: 'Trait cards', q: 24, c: [MFC_CARDS], n: 'The checklist says 24 trait cards.' },
      { t: 'one', id: 'whoCards', l: 'Who Am I? clue cards', q: 12, c: [MFC_CARDS], n: 'The checklist says 12 clue cards.' },
      { t: 'ask', id: 'calmCards', l: 'Calm It Down cards', c: [MFC_CARDS] },
      { t: 'ask', id: 'hazardCards', l: 'Hazard Hunt cards', c: [MFC_CARDS] },
      { t: 'one', id: 'callSigns', l: 'Make Your Call signs', q: 3, c: [MFC_CARDS], n: 'The checklist says 3 signs.' },
      { t: 'one', id: 'callCards', l: 'Make Your Call scenario cards', q: 18, c: [MFC_CARDS], n: 'The checklist says 18 scenario cards.' },
      { t: 'ask', id: 'interviewCards', l: 'Interview Questions cards', c: [MFC_CARDS] },
      { t: 'ask', id: 'reviewCards', l: 'Lightning Review cards', c: [MFC_CARDS] },
      { t: 'ask', id: 'toolboxCards', l: 'Happy Kid Toolbox cards', n: 'The checklist says 1 set per small group and does not say how many groups.', c: [MFC_CARDS] },
      { t: 'ask', id: 'playPhones', l: 'Play phones', n: 'The checklist says at least 4 and does not fix the number.', c: [MFC_PHONES] },
      { t: 'one', id: 'door', l: 'Door prop', c: [MFC_PHONES], n: 'The checklist names a door prop.' },
      { t: 'ask', id: 'dolls', l: 'Practice dolls', c: [MFC_DOLLS] },
      { t: 'ask', id: 'diapers', l: 'Diapers', c: [MFC_DOLLS] },
      { t: 'ask', id: 'wipes', l: 'Wipes', c: [MFC_DOLLS] },
      { t: 'ask', id: 'pads', l: 'Changing pads', c: [MFC_DOLLS] },
      { t: 'ask', id: 'bandages', l: 'Bandages', c: [MFC_AID] },
      { t: 'ask', id: 'gauze', l: 'Gauze', c: [MFC_AID] },
      { t: 'ask', id: 'gloves', l: 'Gloves', c: [MFC_AID] },
      { t: 'ask', id: 'totes', l: 'Tote bags', c: [MFC_TOTE] },
      { t: 'ask', id: 'fabricMarkers', l: 'Fabric markers', c: [MFC_TOTE] },
      { t: 'ask', id: 'bagSupplies', l: 'Activity bag supplies', c: [MFC_TOTE] },
      { t: 'ask', id: 'snackProps', l: 'Snack time and nap time props', c: ['Snack time and nap time props'] }
    ]);
    COURSE_SPECS['my-first-single'] = [
      { t: 'own', id: 'mfsGuide', l: 'Facilitator Guide', c: ['Facilitator Guide'] },
      { t: 'each', id: 'mfcHandbook', l: 'Club handbooks', c: ['Club handbooks, 1 per participant'] },
      { t: 'each', id: 'mfcCertificate', l: 'Certificates', c: ['Certificates, 1 per participant'] },
      { t: 'each', id: 'mfcPages', l: 'Family take-home pages', c: ['Family take-home pages, 1 per participant'] },
      { t: 'ask', id: 'nameTag', l: 'Name tag supplies', n: 'The checklist names name tag supplies and does not say how many.', c: ['Name tag supplies and a marker'] },
      { t: 'one', id: 'marker', l: 'Marker', c: ['Name tag supplies and a marker'], n: 'The checklist names a marker.' },
      { t: 'ask', id: 'dolls', l: 'Practice dolls', c: [MFC_DOLLS] },
      { t: 'ask', id: 'diapers', l: 'Diapers', c: [MFC_DOLLS] },
      { t: 'ask', id: 'wipes', l: 'Wipes', c: [MFC_DOLLS] },
      { t: 'ask', id: 'pads', l: 'Changing pads', c: [MFC_DOLLS] },
      { t: 'ask', id: 'bandages', l: 'Bandages', c: [MFC_AID] },
      { t: 'ask', id: 'gauze', l: 'Gauze', c: [MFC_AID] },
      { t: 'ask', id: 'gloves', l: 'Gloves', c: [MFC_AID] }
    ];
  })();

  COURSE_SPECS['little-medics'] = [
    { t: 'each', id: 'lmHandbook', l: 'Student Handbooks', extra: 1, n: 'Includes 1 extra member item, as the before-class note says.', c: ['Student Handbook, 1 per member', LM_EXTRA] },
    { t: 'copies', id: 'lmGuide', l: 'Facilitator Guide', c: ['Facilitator Guide, 1 per instructor'] },
    { t: 'only', id: 'lmOverview', l: 'Course overview', n: 'Only as needed for the site. The checklist does not say how many.', c: ['Course overview as needed for the site'] },
    { t: 'one', id: 'lmPosters', l: 'Laminated posters', q: 12, c: ['12 posters (printables kit pages 3 to 14), laminated'], n: 'The checklist says 12 posters.' },
    { t: 'one', id: 'kitCards', l: 'Kit or Not? cards', c: [LM_CARDS], n: 'The checklist says 1 set.' },
    { t: 'hard', id: 'ouchCards', l: 'Ouch Meter face cards', c: [LM_CARDS], n: '1 set per 4 members.', blank: 'Attendance is not confirmed, so the 1-set-per-4-members count is blank.', q: function (n) { return Math.ceil(n / 4); } },
    { t: 'one', id: 'emergencyCards', l: 'Emergency or Not? sets', q: 2, c: [LM_CARDS], n: 'The checklist says 2 sets.' },
    { t: 'one', id: 'hotCards', l: 'Hot or Not? cards', c: [LM_CARDS], n: 'The checklist says 1 set.' },
    { t: 'hard', id: 'snackCards', l: 'Safe Snack Sort cards', c: [LM_CARDS], n: '1 set per 4 members.', blank: 'Attendance is not confirmed, so the 1-set-per-4-members count is blank.', q: function (n) { return Math.ceil(n / 4); } },
    { t: 'only', id: 'leafCards', l: 'Leaves of Three? and weather cards', n: 'Only for a 10-week club. This sheet does not decide the club length. If it is a 10-week club, the checklist says 1 set.', c: [LM_CARDS] },
    { t: 'one', id: 'challengeCards', l: 'Challenge station cards', c: [LM_CARDS], n: 'The checklist says 1 set.' },
    { t: 'hard', id: 'badgePages', l: 'Name badge pages', c: [LM_BADGES], n: '1 page per 8 members.', blank: 'Attendance is not confirmed, so the page count is blank.', q: function (n) { return Math.ceil(n / 8); } },
    { t: 'ask', id: 'badgeHolders', l: 'Name badge holders or pins', c: [LM_BADGES] },
    { t: 'each', id: 'stickers', l: 'Weekly badge sticker sheets', extra: 1, n: 'Includes 1 extra member item, as the before-class note says.', c: ['Weekly badge stickers, 1 sheet per member', LM_EXTRA] },
    { t: 'each', id: 'lmCertificate', l: 'Certificates', extra: 1, n: 'Includes 1 extra member item, as the before-class note says.', c: ['Certificates, 1 per member', LM_EXTRA] },
    { t: 'one', id: 'tracker', l: 'Attendance and badge tracker', c: ['Attendance and badge tracker, 1 per club'], n: 'The checklist says 1 per club.' },
    { t: 'one', id: 'patients', l: 'Spare stuffed-animal patients', q: 6, c: ['6 spare stuffed-animal patients'], n: 'The checklist says 6.' },
    { t: 'one', id: 'firstAidKit', l: 'Real first aid kit', c: ['Real first aid kit, safe items only (no scissors, no medicine)'], n: 'The checklist names the kit. No scissors and no medicine.' },
    { t: 'each', id: 'bandages', l: 'Adhesive bandages', each: 10, n: '10 per member, as the checklist says.', c: [LM_BAND] },
    { t: 'ask', id: 'gauze', l: 'Gauze squares', c: [LM_BAND] },
    { t: 'ask', id: 'tape', l: 'Tape', c: [LM_BAND] },
    { t: 'one', id: 'spray', l: 'Spray bottle', c: [LM_BAND], n: 'The checklist names a spray bottle.' },
    { t: 'ask', id: 'gloves', l: 'Child-size non-latex gloves', c: ['Child-size non-latex gloves'] },
    { t: 'one', id: 'coldPacks', l: 'Gel or instant cold packs', q: 4, c: [LM_COLD], n: 'The checklist says 4.' },
    { t: 'ask', id: 'cloths', l: 'Clean cloths', c: [LM_COLD] },
    { t: 'ask', id: 'tissues', l: 'Tissues', c: [LM_MISC] },
    { t: 'one', id: 'playPhones', l: 'Play phones', q: 4, c: [LM_MISC], n: 'The checklist says 4.' },
    { t: 'ask', id: 'crayons', l: 'Crayons', c: [LM_MISC] },
    { t: 'ask', id: 'painterTape', l: 'Painter\'s tape', c: [LM_MISC] },
    { t: 'one', id: 'hoops', l: 'Hoops or bins', q: 2, c: [LM_MISC], n: 'The checklist says 2.' },
    { t: 'one', id: 'dog', l: 'Stuffed dog', c: [LM_DOG], n: 'The checklist names a stuffed dog.' },
    { t: 'ask', id: 'weatherGear', l: 'Weather gear props', c: [LM_DOG] },
    { t: 'one', id: 'speaker', l: 'Music speaker', c: [LM_DOG], n: 'The checklist names a music speaker.' },
    { t: 'one', id: 'mat', l: 'Mat or blanket', c: ['Mat or blanket for Stop, Drop, and Roll'], n: 'The checklist names a mat or a blanket.' }
  ];

  var craftBits = ['Rhinestones', 'Gems', 'Sequins', 'Pearls', 'Fabric glue', 'Tacky glue', 'Glue dots', 'Patches', 'Letter beads', 'Stickers', 'Puffy paint', 'Fabric markers', 'Ribbon', 'Tassels', 'Charms', 'Keychain clips'];
  COURSE_SPECS['ready-period'] = [
    { t: 'own', id: 'rpGuide', l: 'Facilitator Guide', c: ['Facilitator Guide'] },
    { t: 'one', id: 'questionBox', l: 'Question box', c: [RP_BOX], n: 'The checklist names a question box with a slot.' },
    { t: 'ask', id: 'slips', l: 'Slips of paper', n: 'The checklist says slips at every seat and does not say how many slips per seat.', c: [RP_BOX] },
    { t: 'each', id: 'pencil', l: 'Pencils', c: [RP_BOX], n: 'A pencil at every seat.' },
    { t: 'each', id: 'letters', l: 'Parent take-home letters', c: ['Parent take-home letters, 1 per girl'] },
    { t: 'one', id: 'timer', l: 'Silent timer', c: ['Silent timer'], n: 'The checklist names a silent timer.' },
    { t: 'each', id: 'pouches', l: 'Blank zip pouches', extra: 3, n: 'Includes 3 extras, as the checklist says.', c: ['Blank zip pouches (about 6 by 9 inches), 1 per girl plus 3 extras'] }
  ].concat(craftBits.map(function (name, i) {
    return { t: 'ask', id: 'craft' + i, l: name, c: [RP_CRAFT] };
  })).concat([
    { t: 'each', id: 'trays', l: 'Small trays or paper plates', c: [RP_TABLE] },
    { t: 'ask', id: 'tableCover', l: 'Table covering', c: [RP_TABLE] },
    { t: 'ask', id: 'paperTowels', l: 'Paper towels', c: [RP_TABLE] },
    { t: 'ask', id: 'wetWipes', l: 'Wet wipes', c: [RP_TABLE] },
    { t: 'ask', id: 'trashBins', l: 'Small trash bins', n: 'The checklist says 1 per table and does not say how many tables.', c: [RP_TABLE] },
    { t: 'each', id: 'pads', l: 'Pads', each: 2, n: '2 per girl, different absorbencies.', c: [RP_KIT] },
    { t: 'each', id: 'liners', l: 'Pantyliners', each: 2, c: [RP_KIT] },
    { t: 'each', id: 'tampons', l: 'Tampons', each: 2, c: [RP_KIT] },
    { t: 'each', id: 'trackerCard', l: 'Pocket tracker cards', c: [RP_KIT] },
    { t: 'each', id: 'encourage', l: 'Encouragement cards', c: [RP_KIT] },
    { t: 'one', id: 'demoPad', l: 'Demo pad', c: [RP_DEMO], n: 'The product table uses 1 pad.' },
    { t: 'one', id: 'demoLiner', l: 'Demo liner', c: [RP_DEMO], n: 'The product table uses a liner.' },
    { t: 'one', id: 'demoTampon', l: 'Demo tampon with applicator', c: [RP_DEMO], n: 'The product table uses a tampon with applicator.' },
    { t: 'one', id: 'demoCup', l: 'Clear cup of tinted water', c: [RP_DEMO], n: 'The checklist names a clear cup.' },
    { t: 'one', id: 'spoon', l: 'Measuring spoon', c: [RP_DEMO], n: 'The checklist names a measuring spoon.' },
    { t: 'one', id: 'demoJar', l: 'Small clear jar of tinted water', c: [RP_DEMO], n: 'One jar. The checklist says 2 to 3 tablespoons in it, not 2 or 3 jars.' }
  ]);

  COURSE_SPECS['social-ready'] = [
    { t: 'own', id: 'socialGuide', l: 'Facilitator Guide', c: ['Facilitator Guide'] },
    { t: 'one', id: 'av', l: 'Laptop', hard: true, c: [SOCIAL_DECK], n: 'The slide deck is on the laptop.' },
    { t: 'one', id: 'backup', l: 'Backup of the slide deck', c: [SOCIAL_DECK], n: 'The checklist says plus a backup.' },
    { t: 'only', id: 'screen', l: 'Screen or projector', n: 'Pack one only if the room does not already have a screen.', c: [SOCIAL_DECK] },
    { t: 'ask', id: 'agreements', l: 'Family Tech Agreements', n: 'The checklist says 1 per student plus extras and does not say how many extras.', c: [SOCIAL_AGREE] },
    { t: 'one', id: 'roster', l: 'Roster', c: ['Roster with the organizer\'s cell number'], n: 'One roster. The organizer\'s cell number stays off this printed sheet.' },
    { t: 'ask', id: 'pencils', l: 'Pencils', c: [SOCIAL_PENCILS] },
    { t: 'one', id: 'timer', l: 'Silent timer', c: [SOCIAL_PENCILS], n: 'The checklist names a silent timer.' },
    { t: 'one', id: 'postSign', l: 'POST sign', c: [SOCIAL_SIGNS], n: 'The checklist names the POST sign.' },
    { t: 'one', id: 'passSign', l: 'PASS sign', c: [SOCIAL_SIGNS], n: 'The checklist names the PASS sign.' },
    { t: 'each', id: 'redCard', l: 'Red cards', c: [SOCIAL_CARDS] },
    { t: 'each', id: 'greenCard', l: 'Green cards', c: [SOCIAL_CARDS] },
    { t: 'one', id: 'toothpaste', l: 'Travel toothpaste', c: [SOCIAL_TOOTH], n: 'The checklist names travel toothpaste for the Toothpaste Test.' },
    { t: 'one', id: 'plate', l: 'Paper plate', c: [SOCIAL_TOOTH], n: 'The checklist names a paper plate.' },
    { t: 'one', id: 'toothpick', l: 'Toothpick', c: [SOCIAL_TOOTH], n: 'The checklist names a toothpick.' }
  ];

  var RULES = {};
  Object.keys(COURSE_SPECS).forEach(function (id) {
    RULES[id] = function (count, instructors) {
      return fromSpecs(count, instructors, COURSE_SPECS[id]);
    };
  });

  function orgCount(session) {
    if (!session || session.orgHandlesRegistration !== true) return 0;
    if (!String(session.billToOrg || '').trim()) return 0;
    if (session.billedHeadcount == null || session.billedHeadcount === '') return 0;
    var n = Number(session.billedHeadcount);
    if (!isFinite(n) || n <= 0) return 0;
    return Math.floor(n);
  }

  function attendingCount(session, regs, seatsPer) {
    var per = Number(seatsPer);
    if (!isFinite(per) || per < 1) per = 1;
    var rows = (regs || []).filter(function (r) {
      return r && r.sessionId === session.id && countsTowardSeats(r);
    }).length;
    return rows * Math.floor(per);
  }

  function headcount(session, regs, seatsPer) {
    var live = attendingCount(session, regs, seatsPer);
    var billed = orgCount(session);
    if (session && session.orgHandlesRegistration === true) {
      if (billed > 0) {
        return {
          count: Math.max(live, billed),
          external: true,
          missing: false,
          basis: 'The organization registers this class. The count is ' + Math.max(live, billed) + ', the larger of registrations (' + live + ') and the billed headcount (' + billed + '). Waitlist, cancelled, and refunded rows are not included.'
        };
      }
      if (live > 0) {
        return {
          count: live,
          external: true,
          missing: false,
          basis: live + ' people are registered. The organization registers this class and no billed headcount is on file. Waitlist, cancelled, and refunded rows are not included.'
        };
      }
      return {
        count: null,
        external: true,
        missing: true,
        basis: 'The organization registers this class, and no headcount is confirmed. Counts that depend on attendance are left blank instead of printing zero.'
      };
    }
    return {
      count: live,
      external: false,
      missing: false,
      basis: live + (live === 1 ? ' participant is registered.' : ' participants are registered.') + ' Waitlist, cancelled, and refunded registrations are not included.'
    };
  }

  function isFutureReservation(c, today) {
    return !!(c && c.outDate && today && c.outDate > today);
  }

  function heldKinds(checkouts, names, today, sessionId, equipment) {
    var byKind = {};
    var sources = {};
    var ambiguous = [];
    (checkouts || []).forEach(function (c) {
      if (!c || c.returnedDate || c.noEquipment) return;
      if ((c.items || []).some(function (it) { return it && (it.usesExisting || it.noEquipment); }) && !(c.items || []).some(function (it) { return it && Number(it.qty) > 0; })) return;
      if (sessionId && c.sessionId === sessionId) return;
      if (isFutureReservation(c, today)) return;
      if (c.outDate && today && c.outDate > today) return;
      if (personAmbiguous(c.person, names)) {
        if (ambiguous.indexOf(c.person) < 0) ambiguous.push(c.person);
        return;
      }
      if (!personMatches(c.person, names)) return;
      (c.items || []).forEach(function (it) {
        if (!it || it.usesExisting || it.noEquipment || it.consumable) return;
        var qty = Number(it.qty) || 0;
        if (!(qty > 0)) return;
        var eq = (equipment || []).filter(function (e) { return e && e.id === it.equipmentId; })[0];
        var kind = it.kind || kindOf(eq && eq.name) || kindOf(it.name);
        if (!kind) return;
        if (qty > (byKind[kind] || 0)) byKind[kind] = qty;
        sources[kind] = sources[kind] || [];
        var src = c.source || '';
        if (src && sources[kind].indexOf(src) < 0) sources[kind].push(src);
      });
    });
    return { qty: byKind, sources: sources, ambiguous: ambiguous };
  }

  function unconfirmedCarry(checkouts, names, neededKinds) {
    var hits = [];
    (checkouts || []).forEach(function (c) {
      if (!c || !c.returnedDate) return;
      if (!personMatches(c.person, names)) return;
      var auto = /auto-closed/i.test(String(c.notes || '')) || (c.outDate && c.returnedDate < c.outDate);
      if (!auto) return;
      var bits = [];
      (c.items || []).forEach(function (it) {
        if (!it || !(Number(it.qty) > 0)) return;
        var kind = it.kind || '';
        if (neededKinds.length && neededKinds.indexOf(kind) < 0 && kind) return;
        if (kind) bits.push((Number(it.qty)) + ' ' + kind);
      });
      if (!bits.length) return;
      hits.push({ when: c.returnedDate, detail: bits.join(', '), source: c.source || '' });
    });
    return hits;
  }

  function applyCarry(lines, held, remaining) {
    lines.forEach(function (row) {
      if (row.confirm || row.required == null || row.role !== 'pack') return;
      var have = 0;
      var note = '';
      if (row.consumable) {
        if (remaining && remaining[row.id] != null && isFinite(Number(remaining[row.id]))) {
          have = Math.max(0, Number(remaining[row.id]) || 0);
          note = 'Recorded remaining count';
        }
      } else {
        have = Math.max(0, Number(held.qty[row.id]) || 0);
        note = (held.sources[row.id] || []).join('; ');
      }
      var use = Math.min(have, row.required);
      row.already = use;
      row.packNow = Math.max(0, row.required - use);
      row.alreadyNote = use ? note : '';
      if (!row.consumable && have > row.required) {
        row.already = have;
        row.packNow = 0;
        row.holdNote = 'More are already out than this class requires. Do not pack another set.';
      }
    });
  }

  function forChecklist(opts) {
    opts = opts || {};
    var session = opts.session || {};
    var seats = headcount(session, opts.registrations || [], opts.seatsPer);
    var refresh = opts.refresh || { ok: true };
    var refreshNote = refresh.ok
      ? 'Registrations were rechecked just now.'
      : (refresh.message || 'Registrations could not be rechecked. This count is from the list already on screen, and it was not rechecked.');
    if (opts.skipRefresh) refreshNote = '';
    if (opts.blank) {
      seats = {
        count: null,
        external: false,
        missing: true,
        basis: 'No class is selected. Counts that follow the roster are left blank. A single kit, manual, or tool that the checklist names still shows a number.'
      };
    }
    var fn = RULES[opts.checklistId];
    var lines = fn ? fn(seats.count, opts.instructorCount || 0) : [
      confirm('Supplies', 'This course does not have pack quantities on the checklist.')
    ];
    var names = opts.instructorNames || [];
    var held = heldKinds(opts.checkouts, names, opts.today, session.id, opts.equipment);
    var remaining = opts.remaining || null;
    applyCarry(lines, held, remaining);
    var needed = lines.filter(function (row) { return row && !row.consumable && !row.confirm; }).map(function (row) { return row.id; });
    var unverified = unconfirmedCarry(opts.checkouts, names, needed);
    var warning = '';
    if (held.ambiguous && held.ambiguous.length) {
      warning = 'A checkout for ' + held.ambiguous.join(', ') + ' was not subtracted. The name is not an exact match for the assigned instructor, so that equipment is not treated as already out.';
    }
    var durableHeld = needed.some(function (id) { return (held.qty[id] || 0) > 0; });
    if (!durableHeld && unverified.length) {
      var retained = 'Confirm what is still with the instructor before packing another durable kit. A checkout was marked returned by an automatic cleanup (' + unverified.map(function (h) { return h.detail + (h.source ? ' from ' + h.source : ''); }).join('; ') + '). Those items are not counted as already out, and a second full kit is not filled in as packed.';
      warning = warning ? (warning + ' ' + retained) : retained;
      lines.forEach(function (row) {
        if (row.consumable || row.confirm || row.role !== 'pack') return;
        if ((held.qty[row.id] || 0) > 0) return;
        row.packNow = null;
        row.holdNote = 'Confirm before packing another. Not counted as already out.';
      });
    }
    var expected = opts.expected;
    if (expected > 0 && seats.count != null && expected > seats.count) {
      seats.basis += ' Participants expected is ' + expected + ', which is higher. These quantities use registrations.';
    }
    return {
      count: seats.count,
      missing: seats.missing,
      basis: seats.basis,
      refreshNote: refreshNote,
      warning: warning,
      lines: lines
    };
  }

  function packNowText(plan) {
    var pack = [];
    var needs = [];
    var owned = [];
    var maybe = [];
    (plan && plan.lines || []).forEach(function (row) {
      if (!row) return;
      if (row.role === 'instructor') {
        owned.push((row.required != null ? row.required + ' ' : '') + row.label + ': instructor brings this, not packed from storage');
        return;
      }
      if (row.role === 'conditional') {
        maybe.push(row.label + ': not packed unless it applies');
        return;
      }
      if (row.confirm || row.packNow == null) {
        needs.push(row.label + ': quantity needs confirmation');
        return;
      }
      pack.push(row.packNow + ' ' + row.label);
    });
    var parts = [];
    if (pack.length) parts.push('Pack now: ' + pack.join(', '));
    if (needs.length) parts.push(needs.join('. '));
    if (owned.length) parts.push(owned.join('. '));
    if (maybe.length) parts.push(maybe.join('. '));
    return parts.join('. ');
  }

  function phrases(plan) {
    if (!plan || !plan.lines) return null;
    var already = [];
    var pack = [];
    var changed = false;
    plan.lines.forEach(function (row) {
      if (!row || row.confirm || row.required == null) return;
      if ((row.already || 0) > 0) {
        changed = true;
        already.push(row.already + ' ' + row.label);
      }
      if (row.packNow > 0) pack.push(row.packNow + ' ' + row.label);
      else if ((row.already || 0) > 0 && row.packNow === 0) changed = true;
    });
    if (!changed && !plan.warning) return null;
    return {
      changed: changed,
      already: already.length ? ('Already with instructor: ' + already.join(', ')) : '',
      packNow: pack.length ? ('Pack now: ' + pack.join(', ')) : (changed ? 'Pack now: no more of the items already with the instructor' : ''),
      warning: plan.warning || ''
    };
  }

  var api = {
    countsTowardSeats: countsTowardSeats,
    namesMatch: namesMatch,
    attendingCount: attendingCount,
    headcount: headcount,
    forChecklist: forChecklist,
    phrases: phrases,
    packNowText: packNowText,
    safeSitterGear: safeSitterGear,
    rcGear: rcGear
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBPackQuantities = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
