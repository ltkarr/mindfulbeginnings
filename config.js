/* ════════════════════════════════════════════════════════════════════════
   MINDFUL BEGINNINGS — SHARED CONFIG (config.js)
   Updated August 2026 · program-guide pricing + Safe@Home — Series
   Aug 17 2026 · Safe Sitter® and Grandparents caps raised 8 → 16 to match admin.html
   Sep  6 2026 · Added My First Babysitters Club — Single Session, Ready. Period.,
                 and Season Ready; corrected My First Babysitters Club matCost to $30
   Oct  5 2026 · Added Social Ready ($35, 1 hour, cap 20, $100 flat fee, virtual)
   Oct  7 2026 · Added Girl Scouts — First Aid Badge Workshop ($45, 1 hour, cap 15, RN)
   Oct  8 2026 · Classes page prices for NEW sessions (LATER_PRICE_CHANGES, from Oct 9):
                 Social Ready $45, Stay Ready $85, Grandparents $195, Care Ready $195,
                 Baby Ready $195. Existing sessions keep their current prices.
   Oct 13 2026 · Baby Ready is $195 per person on sessions created before
                 Oct 14 2026 midnight ET, including ones created before Oct 9.
                 A couple registration on those sessions is two people and
                 costs $390. A session price override is still the checkout total.
   Oct 14 2026 · New sessions created from midnight ET: Adult & Pediatric
                 First Aid/CPR/AED Certification $125 (4 hours, bookable) and
                 Baby Ready $185 per person ($300 per couple). Length is 3 hours as of Oct 19.
                 Red Cross Babysitter's Training stays $295 and is offered now.
                 Stored session and registration prices are not rewritten.
   Oct 13 2026 · Added Safe Sitter® Babysitting Essentials ($185, 4 hours).
                 Safe Sitter®, the 5-hour course with the CPR module, stays $225.
   Oct 13 2026 · Added Baby Ready + CPR Certification. $275 per person.
                 A couple registration is two people and costs $495 (couplePrice),
                 not $550. It is not RN-only. Same people-cap and couple counting
                 as Baby Ready. The $275 is this course's Program Guide price.
                 It is not a My First Babysitter's Club price.
   Oct 19 2026 · Program Guide alignment. Baby Ready is 3 hours. Adult and
                 Pediatric First Aid/CPR/AED is 4.25 hours. All Kids Welcome is
                 60 minutes and still virtual. Safe@Home caps are 20. New
                 sessions of My First Babysitter's Club are $200 for the 8-week
                 series and $165 for the 2.5-hour workshop. Girl Scout jobs are
                 custom-scheduled; 16 is only the typical maximum.
   Oct 22 2026 · One registration is one person. Couple checkout ($300, $390,
                 $495) is retired. Stored pricePaid amounts are not rewritten.
                 Girl Scout workshops created on/after Oct 22 2026 midnight ET
                 are a custom quote; earlier ones stay at the legacy $45 unless
                 the session has its own price. Safe@Home stays $85 in person
                 (90 min) and $40 virtual (60 min). Online + Classroom stays $125.
   Oct  8 2026 · Added two American Red Cross courses (redCross + requiresLeadTeacher).
                 New-session prices, same Oct 9 list as the other classes-page prices:
                 Babysitter's Training $295 / 7 hours, Adult & Pediatric First Aid/CPR/AED
                 $185. The in-person length is 4.25 hours as of Oct 19 2026. This file
                 does not rewrite a price already stored on a session or registration.
   ════════════════════════════════════════════════════════════════════════

   Loaded by register.html and instructor.html. This file is the single
   source of truth for course info, prices, class caps, promo codes, and
   instructor pay constants — edit prices HERE, not in the pages.
   (admin.html keeps its own matching copy of COURSES inside the file;
   if you change a price here, make the same change there.)

   ⚠️ ONE THING TO DO BEFORE DEPLOYING ⚠️
   Copy your current PROMO_CODES array from the config.js that is live on
   your site into the PROMO_CODES section near the bottom. This file ships
   with an EMPTY list, so discount codes stay off until you paste yours in.
   ──────────────────────────────────────────────────────────────────────── */


/* ─── PUBLIC REGISTRATION ORIGIN ───────────────────────────────────────
   Family-facing links (register, pay, confirmation emails) use this host.
   Do not point new parent links at *.vercel.app — that hostname permanently
   redirects here (see vercel.json). Keep this value identical to
   PUBLIC_ORIGIN in js/confirmation-email.js and REG_PAGE's origin in
   admin.html.                                                            */
const PUBLIC_ORIGIN='https://register.mindfulbeginnings.org';


/* ─── COURSES ──────────────────────────────────────────────────────────
   Used by instructor.html (hours, flat fees, credential flags) and kept
   as the master reference for every course's numbers.

   Pricing columns:
     price / price2027       → what sessions that ALREADY EXISTED before the
                               Aug 2026 program-guide update charge
                               (2027 column applies to sessions dated 2027+)
     priceNew / priceNew2027 → program-guide prices, charged only by sessions
                               CREATED on/after NEW_PRICING_EFFECTIVE below.
   This split is what lets you publish new prices without re-pricing any
   session that is already on the calendar.

   Credential flags:
     requiresSafeSitter → only Safe Sitter® certified instructors see these jobs
     requiresRN         → only Registered Nurse instructors see these jobs
     redCross           → American Red Cross certification course
     requiresLeadTeacher→ only Lead Teachers (Red Cross instructors) see these jobs */
const COURSES={
  'Safe Sitter®':{price:185,price2027:225,priceNew:225,priceNew2027:225,matCost:20.35,hours:5,maxStudents:16,requiresSafeSitter:true,audience:'Ages 11 to 14'},
  // 4-hour babysitting course without the CPR module, $185 per person.
  // Every price column is $185, and this name is not in LATER_PRICE_CHANGES,
  // so it never picks up the $225 that belongs to Safe Sitter® (5 hours, CPR module).
  'Safe Sitter® Babysitting Essentials':{price:185,price2027:185,priceNew:185,priceNew2027:185,matCost:20.35,hours:4,maxStudents:16,requiresSafeSitter:true,audience:'Ages 11 to 14'},
  'Intro to Babysitting':{price:40,price2027:50,priceNew:40,priceNew2027:50,matCost:10,hours:1,maxStudents:20,audience:'Ages 10 to 12'},
  'Safe@Home':{price:65,price2027:85,priceNew:65,priceNew2027:85,matCost:10,hours:1.5,maxStudents:20,audience:'Ages 8 to 10'},
  // Program guide (Aug 2026): Safe@Home is $65 as a 90-minute single session,
  // $125 as a multi-week series. Schedule a series under this separate course
  // so the registration page automatically shows the series price.
  'Safe@Home — Series':{price:125,price2027:125,priceNew:125,priceNew2027:125,matCost:10,hours:1,maxStudents:20,audience:'Ages 8 to 10 · multi-week'},
  // Safe@Home — Virtual: the 60-minute online version from the program guide, $40.
  // Schedule it under this course so register.html shows the virtual price automatically.
  // Still tick "Virtual session" on the session itself so families get the Zoom link.
  'Safe@Home — Virtual':{price:40,price2027:40,priceNew:40,priceNew2027:40,matCost:10,hours:1,instrFlatFee:75,maxStudents:20,virtual:true,audience:'Ages 8 to 10 · Virtual'},
  // Stored name matches the public card. The previous key
  // "Grandparents: Getting Started" is aliased below so existing sessions match.
  'Safe Sitter® Grandparents: Getting Started':{price:150,price2027:185,priceNew:155,priceNew2027:185,matCost:15,hours:3,maxStudents:16,requiresSafeSitter:true,adult:true,audience:'Grandparents and caregivers'},
  // Care Ready (new Sep 2026): 2.5-hour course for nannies and au pairs, $185.
  // Any instructor may teach it; it uses CPR manikins, so the registration form
  // treats it as an adult course (no grade, no parent/guardian fields).
  'Care Ready':{price:185,price2027:185,priceNew:185,priceNew2027:185,matCost:0,hours:2.5,maxStudents:16,adult:true,audience:'Nannies and au pairs'},
  // Baby Ready: published length is 3 hours. Capacity is people (12).
  // Each registration is one person. Sessions created before Oct 14 2026
  // midnight ET stay $195 per person. Sessions created on/after that moment
  // charge $185 per person. Price columns stay $195 so a session with no
  // creation time does not jump to $185. There is no couple price. This
  // file does not rewrite a price already stored on a session or registration.
  'Baby Ready':{price:195,price2027:195,priceNew:195,priceNew2027:195,matCost:0,hours:3,maxStudents:12,adult:true,audience:'Expecting and new parents'},
  // Baby Ready plus Pediatric First Aid/CPR certification. $275 per person.
  // One registration is one person. Not RN-only. 5 hours, cap 12.
  'Baby Ready + CPR Certification':{price:275,price2027:275,priceNew:275,priceNew2027:275,matCost:0,hours:5,maxStudents:12,adult:true,audience:'Expecting and new parents'},
  'All Kids Welcome':{price:25,price2027:25,priceNew:25,priceNew2027:25,matCost:0,hours:1,instrFlatFee:75,maxStudents:20,virtual:true,audience:'Experienced sitters'},
  // Stored name matches the public card. The previous key
  // "Stay Ready: Choking Rescue and CPR" is aliased below so existing sessions match.
  // 75 minutes. hours is 1.25 so instructor pay matches the published length.
  'Stay Ready™: Choking Rescue, CPR, and Seizure Response':{price:75,price2027:75,priceNew:75,priceNew2027:75,matCost:0,hours:1.25,maxStudents:12,requiresRN:true,audience:'Ages 11 and up'},
  'Campus Ready: Safety Skills for College Life':{price:75,price2027:75,priceNew:75,priceNew2027:75,matCost:0,hours:1,instrFlatFee:100,maxStudents:12,requiresRN:true,audience:'Teens and college-bound'},
  // Steady and Ready stays $65 on purpose — the Aug 2026 program guide printed
  // $50, which Lindsay confirmed is a typo in the guide, not a price change.
  // Published length is 60 minutes.
  'Steady and Ready':{price:65,price2027:65,priceNew:65,priceNew2027:65,matCost:10,hours:1,maxStudents:8,audience:'Ages 8 to 12'},
  // My First Babysitters Club: the 8-week series is $200 per participant for
  // sessions created on/after Oct 19 2026 (see LATER_PRICE_CHANGES). Earlier
  // sessions stay at the price they were booked at ($165 after Aug 26 2026).
  // There is no 10-week series.
  // Material allowance is $30/student — an 8-week series consumes far more supplies
  // than a one-off class, so it does not share the $10 handbook allowance of the
  // short courses. (Corrected from $10, Aug 30 2026, to match admin.html.)
  // Company class profit does not subtract matCost. Handbook orders are overhead
  // expenses in admin. The rate is only the partner-share allowance there.
  'My First Babysitters Club':{price:40,price2027:50,priceNew:165,priceNew2027:165,matCost:30,hours:1,maxStudents:16,minStudents:6,audience:'Grades 4 to 5 · 8-week series'},
  // My First Babysitters Club — Single Session: the 2.5-hour workshop, $165
  // for sessions created on/after Oct 19 2026. priceNew stays $95 so sessions
  // created before that cutover do not reprice. Separate from the 8-week series
  // so the series keeps its own price and $30 material rate.
  'My First Babysitters Club — Single Session':{price:95,price2027:95,priceNew:95,priceNew2027:95,matCost:10,hours:2.5,maxStudents:16,minStudents:6,audience:'Grades 4 to 5 · 2.5-hour workshop'},
  // Ready. Period. — 90-minute puberty-prep workshop, $75/participant, up to 18.
  // RN instructors only. No flat fee, so the instructor is paid 1.5 teaching
  // hours + 1 travel hour + the standard extra 30 minutes.
  'Ready. Period.':{price:75,price2027:75,priceNew:75,priceNew2027:75,matCost:0,hours:1.5,maxStudents:18,requiresRN:true,audience:'Girls ages 10 to 12'},
  // Season Ready — 60-minute safety, fueling, and injury-prevention workshop for
  // middle and high school athletes, $25/participant, up to 20 in a class.
  // RN instructors only (hands-only CPR, AED trainers, heat-illness and concussion
  // response). No flat fee, so the instructor is paid 1 teaching hour + 1 travel
  // hour + the standard extra 30 minutes.
  // Stored name matches the public card. The previous long key is aliased
  // below so existing sessions match.
  'Season Ready™: Safety Skills for Student Athletes':{price:25,price2027:25,priceNew:25,priceNew2027:25,matCost:0,hours:1,maxStudents:20,requiresRN:true,audience:'Student athletes'},
  // Social Ready: ages 8 to 14, 60 minutes, in person or virtual, up to 20.
  // Any instructor may teach it. virtual:true so Zoom pay has no travel hour.
  // A session can still be taught in person. There is no separate Girl Scout
  // virtual cap.
  'Social Ready':{price:35,price2027:35,priceNew:35,priceNew2027:35,matCost:0,hours:1,instrFlatFee:100,maxStudents:20,virtual:true,audience:'Ages 8 to 14'},
  // Girl Scout badge workshops are custom-quoted per troop. There is no
  // fixed checkout price. legacyPrice is only for sessions created before
  // CUSTOM_QUOTE_FROM (and for a session with no creation time), so a troop
  // price already in use is not replaced by a blank. A session price override
  // still wins, including GS-H4782 ($15 family / $30 organization) and
  // GSFA-270303. hours:1 is the pay default when a session has no class-length
  // override. maxStudents 16 is the typical maximum, not a fixed cap.
  'Girl Scouts — First Aid Badge Workshop':{customPrice:true,legacyPrice:45,matCost:0,hours:1,maxStudents:16,audience:'Girl Scout troops, custom schedule'},
  // Girl Scout Badge Class: a troop badge workshop that is not a Safe Sitter
  // class. Same custom quote and typical maximum as the First Aid workshop.
  'Girl Scout Badge Class':{customPrice:true,legacyPrice:45,matCost:0,hours:1,maxStudents:16,audience:'Girl Scout troops, custom schedule'},
  // American Red Cross. The public card is "Red Cross Babysitter's Training +
  // Pediatric First Aid/CPR/AED", $295, 7 hours, ages 11–14. Students earn
  // American Red Cross Babysitter's Training and Pediatric First Aid/CPR/AED
  // certifications. The classes page does not publish a class size; 12 matches
  // the other hands-on CPR workshops and can be overridden on a session.
  // Lead Teachers only. Their pay is $75/hour, applied in the pay math.
  // $295 is the new-session price (LATER_PRICE_CHANGES, from Oct 9 2026).
  // The catalog columns match it because no session of this course exists yet.
  'Red Cross Babysitter\'s Training + Pediatric First Aid/CPR/AED':{price:295,price2027:295,priceNew:295,priceNew2027:295,matCost:0,hours:7,maxStudents:12,redCross:true,requiresLeadTeacher:true,audience:'Ages 11-14'},
  // In-person length is 4.25 hours (Program Guide). Lead Teachers only
  // (redCross + requiresLeadTeacher). The Oct 9 list is $185. Sessions
  // created from Oct 14 2026 midnight ET charge $125. Price columns stay
  // $185 so a session with no creation time does not jump to $125. This
  // file does not rewrite a price stored on a session or registration.
  // Online + Classroom is a separate offering: about 2 hours online, then
  // a 2-hour skills session, $125. It is not its own course key.
  'Adult & Pediatric First Aid/CPR/AED Certification':{price:185,price2027:185,priceNew:185,priceNew2027:185,matCost:0,hours:3.75,maxStudents:12,redCross:true,requiresLeadTeacher:true,audience:'Ages 11 and up'},
  // Standalone American Red Cross Babysitter's Training. $185, 4.25 hours,
  // ages 11 to 15, cap 12. Separate from the 7-hour certification combo.
  // Every price column is $185. This name is not in LATER_PRICE_CHANGES.
  'Babysitter\'s Training':{price:185,price2027:185,priceNew:185,priceNew2027:185,matCost:0,hours:4.25,maxStudents:12,redCross:true,requiresLeadTeacher:true,audience:'Ages 11 to 15'},
  // Adult skills only. $125, 3.25 hours, adults, cap 12. Lead Teachers.
  'Adult First Aid/CPR/AED Certification':{price:125,price2027:125,priceNew:125,priceNew2027:125,matCost:0,hours:3.25,maxStudents:12,redCross:true,requiresLeadTeacher:true,adult:true,audience:'Adults'},
  // Professional course for healthcare providers. $125, 4 hours, cap 12.
  'Basic Life Support (BLS) Certification':{price:125,price2027:125,priceNew:125,priceNew2027:125,matCost:0,hours:4,maxStudents:12,redCross:true,requiresLeadTeacher:true,adult:true,audience:'Healthcare providers'},
  // Workplace group class. Custom quote: no fixed price and no fixed group
  // size. 4 hours is the teaching-length default. Like a custom job, the
  // price and the headcount are set on the session.
  'Group CPR Certification for Workplaces':{customPrice:true,customSize:true,matCost:0,hours:4,redCross:true,requiresLeadTeacher:true,adult:true,audience:'Workplaces, custom quote'},
  // 60-minute in-person workshop. $45. Grandparents of kids from infancy to
  // about age 10. Cap 20, minimum 8.
  'Babysitting Grandkids Workshop':{price:45,price2027:45,priceNew:45,priceNew2027:45,matCost:0,hours:1,maxStudents:20,minStudents:8,adult:true,audience:'Grandparents of kids from infancy to about age 10'},
  // After-school clubs. $200 per participant for an 8-week series, 1 hour a
  // week. 8 weeks is standard and can be customized for schools. Cap 16,
  // minimum 6. My First Babysitters Club is the same series price (above).
  'Little Medics':{price:200,price2027:200,priceNew:200,priceNew2027:200,matCost:10,hours:1,maxStudents:16,minStudents:6,audience:'Ages 5 to 8 · 8-week series'},
  'Pet Sitter\'s Club':{price:200,price2027:200,priceNew:200,priceNew2027:200,matCost:10,hours:1,maxStudents:16,minStudents:6,audience:'Ages 8 to 11 · 8-week series'},
  'Snack Squad':{price:200,price2027:200,priceNew:200,priceNew2027:200,matCost:10,hours:1,maxStudents:16,minStudents:6,audience:'Ages 7 to 11 · 8-week series'},
  'Kid Boss Club':{price:200,price2027:200,priceNew:200,priceNew2027:200,matCost:10,hours:1,maxStudents:16,minStudents:6,audience:'Ages 9 to 11 · 8-week series'},
  'Middle School, Here I Come':{price:200,price2027:200,priceNew:200,priceNew2027:200,matCost:10,hours:1,maxStudents:16,minStudents:6,audience:'Ages 10 to 11 · 8-week series'},
  'Big Sibling Club':{price:200,price2027:200,priceNew:200,priceNew2027:200,matCost:10,hours:1,maxStudents:16,minStudents:6,audience:'Ages 5 to 9 · 8-week series'},
  'My First Phone':{price:200,price2027:200,priceNew:200,priceNew2027:200,matCost:10,hours:1,maxStudents:16,minStudents:6,audience:'Ages 9 to 11 · 8-week series'},
  'Walk and Roll Ready':{price:200,price2027:200,priceNew:200,priceNew2027:200,matCost:10,hours:1,maxStudents:16,minStudents:6,audience:'Ages 7 to 11 · 8-week series'},
  'Calm and Ready':{price:200,price2027:200,priceNew:200,priceNew2027:200,matCost:10,hours:1,maxStudents:16,minStudents:6,audience:'Ages 5 to 11 · 8-week series'}
};

// Previous stored names. Existing sessions keep these strings. Lookups use
// the same course record as the display name, so nothing is orphaned and no
// row is rewritten.
const COURSE_NAME_ALIASES={
  'Grandparents: Getting Started':'Safe Sitter® Grandparents: Getting Started',
  'Stay Ready: Choking Rescue and CPR':'Stay Ready™: Choking Rescue, CPR, and Seizure Response',
  'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes':'Season Ready™: Safety Skills for Student Athletes'
};
Object.keys(COURSE_NAME_ALIASES).forEach(function(oldName){
  const display=COURSE_NAME_ALIASES[oldName];
  if(COURSES[oldName]&&COURSES[display]==null)COURSES[display]=COURSES[oldName];
  else if(COURSES[display]&&COURSES[oldName]==null)COURSES[oldName]=COURSES[display];
});
function coursePriceNames(course){
  const n=String(course||'');
  const names=[n];
  if(COURSE_NAME_ALIASES[n])names.push(COURSE_NAME_ALIASES[n]);
  Object.keys(COURSE_NAME_ALIASES).forEach(function(oldName){
    if(COURSE_NAME_ALIASES[oldName]===n&&names.indexOf(oldName)<0)names.push(oldName);
  });
  return names;
}


/* ─── PROGRAM-GUIDE PRICING CUTOVER (August 2026) ──────────────────────
   Sessions created on/after this moment use the new program-guide prices;
   sessions that already existed keep the prices they were advertised at.
   Keep this value identical to NEW_PRICING_EFFECTIVE in admin.html.        */
const NEW_PRICING_EFFECTIVE='2026-08-06T21:00:00Z';


/* ─── LATER PRICE CHANGES ──────────────────────────────────────────────
   Prices raised AFTER the August 6 cutover. Each entry applies only to sessions
   CREATED on/after its `from` moment, so nothing already on the calendar and
   nothing already taught ever re-prices. Only courses whose price actually
   changed need to be listed. To raise a price again later, add a new entry at
   the TOP of this list with a future date — do not edit an old one.
   Oct 13 2026 exception: Baby Ready on the Aug 26 list was $225, which treated
   that figure as a couple total. $195 is per person, so that entry is $195.
   A couple registration is two people, $390. Keep this list identical in
   config.js, register.html, and admin.html.
*/
const LATER_PRICE_CHANGES=[
  // PROGRAM GUIDE ALIGNMENT, Oct 19 2026. My First Babysitter's Club 8-week
  // series is $200. The 2.5-hour workshop is $165. Sessions created before
  // midnight ET on Oct 19 keep the price they were booked at. There is no
  // 10-week series.
  {from:'2026-10-19T04:00:00Z',
   prices:{
     'My First Babysitters Club':200,
     'My First Babysitters Club — Single Session':165
   }},
  // CATALOG PRICES, Oct 14 2026. Only sessions CREATED from midnight ET on
  // Oct 14 2026 charge these. Anything created earlier keeps its price,
  // including Adult & Pediatric at $185 and Baby Ready at $195 per person
  // ($390 per couple). A stored price override and a stored registration
  // amount are never rewritten. Baby Ready's $300 couple total applies only
  // when the per-person rate for that session is $185.
  {from:'2026-10-14T04:00:00Z',   // midnight ET, night of Oct 13 2026
   prices:{
     'Baby Ready':185,
     'Adult & Pediatric First Aid/CPR/AED Certification':125,
     // Corrects the Oct 9 block's $175 (taken from the old site's card):
     // the confirmed Care Ready price is $185, matching the live catalog.
     'Care Ready':185
   }},
  // CLASSES PAGE PRICES, Oct 2026. Taken from mindfulbeginnings.org/classes
  // (prices per participant). Only sessions CREATED from midnight ET on
  // Oct 9 2026 onward charge these. Every session already in the database
  // (newest was created Oct 8 2026) keeps the price it has today, and a
  // per-session price override still wins over all of this.
  {from:'2026-10-09T04:00:00Z',   // midnight ET, night of Oct 8 2026
   prices:{
     'Social Ready':45,
     'Stay Ready: Choking Rescue and CPR':85,
     'Grandparents: Getting Started':185,
     'Care Ready':175,
     'Baby Ready':195,
     'Red Cross Babysitter\'s Training + Pediatric First Aid/CPR/AED':295,
     'Adult & Pediatric First Aid/CPR/AED Certification':185
   }},
  // ── PROGRAM GUIDE CUTOVER · Aug 26 2026 ──────────────────────────────
  // Every price below is taken straight from the published Program & Course
  // Guide. Sessions created from midnight ET tonight onward charge these
  // amounts, flat, no matter what year the class falls in. Everything already
  // on the calendar keeps the price it was advertised at, and a per-session
  // price override set in the admin still wins over all of this.
  {from:'2026-08-27T04:00:00Z',   // midnight ET, night of Aug 26 2026
   prices:{
     'Safe Sitter®':225,
     'Safe@Home':85,
     'Safe@Home — Virtual':40,
     'Safe@Home — Series':125,
     'My First Babysitters Club':165,
     'Grandparents: Getting Started':185,
     'Care Ready':185,
     'Baby Ready':195,
     'All Kids Welcome':25,
     'Intro to Babysitting':40,
     'Steady and Ready':65,
     'Campus Ready: Safety Skills for College Life':75,
     'Stay Ready: Choking Rescue and CPR':75
   }},
  {from:'2026-08-12T04:00:00Z',   // midnight ET, night of Aug 11 2026
   prices:{'Safe@Home':85,'Grandparents: Getting Started':185}}
];
// Sessions created on/after this moment that are customPrice courses have no
// default checkout amount. Anything created earlier keeps legacyPrice (Girl
// Scout workshops: $45) unless the session has its own price override.
const CUSTOM_QUOTE_FROM='2026-10-22T04:00:00Z';
function isNewCustomQuote(course,createdAt){
  const c=COURSES[course];
  if(!c||!c.customPrice)return false;
  if(createdAt==null)return false;
  const t=typeof createdAt==='number'?createdAt:Date.parse(createdAt);
  if(isNaN(t))return false;
  return t>=Date.parse(CUSTOM_QUOTE_FROM);
}
// The price from the newest change that this session was created on/after, or null.
// A renamed course matches the historical key and the display name.
function laterPriceFor(course,createdAt){
  if(createdAt==null)return null;
  const t=typeof createdAt==='number'?createdAt:Date.parse(createdAt);
  if(isNaN(t))return null;
  const names=(typeof coursePriceNames==='function')?coursePriceNames(course):[String(course||'')];
  for(const chg of LATER_PRICE_CHANGES){
    if(t<Date.parse(chg.from))continue;
    for(let i=0;i<names.length;i++){
      if(chg.prices[names[i]]!=null)return chg.prices[names[i]];
    }
  }
  return null;
}

/* The price a session's course charges per participant, given the session's
   date (YYYY-MM-DD) and its creation timestamp. register.html calls this for
   every session a family looks up. A per-session price override, when set in
   the admin, is applied by the pages on top of this base price.             */
function getSessionBasePrice(course,dateStr,createdAt){
  const c=COURSES[course];if(!c)return 0;
  if(isNewCustomQuote(course,createdAt))return null;
  const later=laterPriceFor(course,createdAt);if(later!=null)return later;
  if(c.customPrice)return c.legacyPrice!=null?c.legacyPrice:null;
  const year=dateStr?parseInt(String(dateStr).split('-')[0],10):new Date().getFullYear();
  let isNew=false;
  if(createdAt!=null){
    const t=typeof createdAt==='number'?createdAt:Date.parse(createdAt);
    isNew=!isNaN(t)&&t>=Date.parse(NEW_PRICING_EFFECTIVE);
  }
  if(isNew)return year>=2027?(c.priceNew2027??c.priceNew??c.price2027??c.price):(c.priceNew??c.price);
  return year>=2027?(c.price2027||c.price):c.price;
}

/* LEGACY — kept only so an old cached copy of register.html (from before the
   Aug 2026 update) keeps working until every browser has the new page. It has
   no creation-date information, so it returns the OLD advertised prices,
   which is the safe answer for the sessions those cached pages can see.
   The updated pages never call this; safe to delete in a few months.        */
function getPriceForSession(course,dateStr){
  const c=COURSES[course];if(!c)return 0;
  const year=dateStr?parseInt(String(dateStr).split('-')[0],10):new Date().getFullYear();
  return year>=2027?(c.price2027||c.price):c.price;
}


/* ─── CLASS-SIZE CAPS ──────────────────────────────────────────────────
   Per-course registration caps used by register.html (a per-session
   max-students override, set in the admin, wins over these).               */
const MAX_STUDENTS={
  'Safe Sitter®':16,
  'Safe Sitter® Babysitting Essentials':16,
  'Intro to Babysitting':20,
  'Safe@Home':20,
  'Safe@Home — Virtual':20,
  'Safe@Home — Series':20,
  'Grandparents: Getting Started':16,
  'Safe Sitter® Grandparents: Getting Started':16,
  'Care Ready':16,
  'Baby Ready':12,
  'Baby Ready + CPR Certification':12,
  'Babysitting Grandkids Workshop':20,
  'All Kids Welcome':20,
  'Stay Ready: Choking Rescue and CPR':12,
  'Stay Ready™: Choking Rescue, CPR, and Seizure Response':12,
  'Campus Ready: Safety Skills for College Life':12,
  'Steady and Ready':8,
  'My First Babysitters Club':16,
  'My First Babysitters Club — Single Session':16,
  'Little Medics':16,
  'Pet Sitter\'s Club':16,
  'Snack Squad':16,
  'Kid Boss Club':16,
  'Middle School, Here I Come':16,
  'Big Sibling Club':16,
  'My First Phone':16,
  'Walk and Roll Ready':16,
  'Calm and Ready':16,
  'Ready. Period.':18,
  'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes':20,
  'Season Ready™: Safety Skills for Student Athletes':20,
  'Social Ready':20,
  'Girl Scouts — First Aid Badge Workshop':16,
  'Girl Scout Badge Class':16,
  'Babysitter\'s Training':12,
  'Red Cross Babysitter\'s Training + Pediatric First Aid/CPR/AED':12,
  'Adult & Pediatric First Aid/CPR/AED Certification':12,
  'Adult First Aid/CPR/AED Certification':12,
  'Basic Life Support (BLS) Certification':12
};


/* ─── PROMO / DISCOUNT CODES ───────────────────────────────────────────
   ⚠️ PASTE YOUR CURRENT LIST HERE (from the config.js live on your site).
   This file ships with an empty list, which means no discount codes work
   until you do. Each entry looks like:

     {code:'MBGSCN', discount:10},                                  // $10 off, any course
     {code:'JGN25', discount:25,
      courses:['Safe Sitter®'],                                     // valid only on these courses
      eligibilityNote:'the Safe Sitter® Babysitting course'},       // shown if used elsewhere

   Codes must be UPPERCASE (the entry box uppercases what families type).   */
const PROMO_CODES=[
  // ← paste your live promo codes here
];


/* ─── INSTRUCTOR PAY CONSTANTS ─────────────────────────────────────────
   Defaults used by instructor.html and the job boards. An individual
   instructor's own hourly rate (set in the admin) wins over INSTR_RATE.
     INSTR_RATE        → default hourly teaching rate ($/hour)
     INSTR_TRAVEL      → flat travel pay added to hourly jobs ($)
     INSTR_EXTRA_HOURS → extra paid time on every job, in hours
                         (0.5 = 30 minutes at the instructor's rate)        */
const INSTR_RATE=50;
const INSTR_TRAVEL=50;
const INSTR_EXTRA_HOURS=0.5;
