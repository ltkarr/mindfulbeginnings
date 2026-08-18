/* ════════════════════════════════════════════════════════════════════════
   MINDFUL BEGINNINGS — SHARED CONFIG (config.js)
   Updated August 2026 · program-guide pricing + Safe@Home — Series
   Aug 17 2026 · Safe Sitter® and Grandparents caps raised 8 → 16 to match admin.html
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
     requiresRN         → only Registered Nurse instructors see these jobs   */
const COURSES={
  'Safe Sitter®':{price:185,price2027:225,priceNew:225,priceNew2027:225,matCost:20.35,hours:5,maxStudents:16,requiresSafeSitter:true},
  'Intro to Babysitting':{price:40,price2027:50,priceNew:40,priceNew2027:50,matCost:10,hours:1,maxStudents:20},
  'Safe@Home':{price:65,price2027:85,priceNew:65,priceNew2027:85,matCost:10,hours:1.5,maxStudents:16},
  // Program guide (Aug 2026): Safe@Home is $65 as a 90-minute single session,
  // $125 as a multi-week series. Schedule a series under this separate course
  // so the registration page automatically shows the series price.
  'Safe@Home — Series':{price:125,price2027:125,priceNew:125,priceNew2027:125,matCost:10,hours:1,maxStudents:16},
  // Safe@Home — Virtual: the 60-minute online version from the program guide, $40.
  // Schedule it under this course so register.html shows the virtual price automatically.
  // Still tick "Virtual session" on the session itself so families get the Zoom link.
  'Safe@Home — Virtual':{price:40,price2027:40,priceNew:40,priceNew2027:40,matCost:10,hours:1,instrFlatFee:75,maxStudents:16,virtual:true},
  'Grandparents: Getting Started':{price:150,price2027:185,priceNew:155,priceNew2027:185,matCost:15,hours:3,maxStudents:16,requiresSafeSitter:true},
  'All Kids Welcome':{price:25,price2027:25,priceNew:25,priceNew2027:25,matCost:0,hours:1.5,instrFlatFee:75,maxStudents:20,virtual:true},
  'Stay Ready: Choking Rescue and CPR':{price:75,price2027:75,priceNew:75,priceNew2027:75,matCost:0,hours:1.5,maxStudents:12,requiresRN:true},
  'Campus Ready: Safety Skills for College Life':{price:75,price2027:75,priceNew:75,priceNew2027:75,matCost:0,hours:1,instrFlatFee:100,maxStudents:12,requiresRN:true},
  // Steady and Ready stays $65 on purpose — the Aug 2026 program guide printed
  // $50, which Lindsay confirmed is a typo in the guide, not a price change.
  'Steady and Ready':{price:65,price2027:65,priceNew:65,priceNew2027:65,matCost:10,hours:1.5,maxStudents:8},
  // My First Babysitters Club: old $40/$50 values were placeholders; the Aug
  // 2026 program guide confirmed $165 for the 8-week series.
  'My First Babysitters Club':{price:40,price2027:50,priceNew:165,priceNew2027:165,matCost:10,hours:1,maxStudents:12}
};


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
   Keep this list identical in config.js, register.html, and admin.html.
*/
const LATER_PRICE_CHANGES=[
  {from:'2026-08-12T04:00:00Z',   // midnight ET, night of Aug 11 2026
   prices:{'Safe@Home':85,'Grandparents: Getting Started':185}}
];
// The price from the newest change that this session was created on/after, or null.
function laterPriceFor(course,createdAt){
  if(createdAt==null)return null;
  const t=typeof createdAt==='number'?createdAt:Date.parse(createdAt);
  if(isNaN(t))return null;
  for(const chg of LATER_PRICE_CHANGES){
    if(t>=Date.parse(chg.from)&&chg.prices[course]!=null)return chg.prices[course];
  }
  return null;
}

/* The price a session's course charges per participant, given the session's
   date (YYYY-MM-DD) and its creation timestamp. register.html calls this for
   every session a family looks up. A per-session price override, when set in
   the admin, is applied by the pages on top of this base price.             */
function getSessionBasePrice(course,dateStr,createdAt){
  const c=COURSES[course];if(!c)return 0;
  const later=laterPriceFor(course,createdAt);if(later!=null)return later;
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
  'Intro to Babysitting':20,
  'Safe@Home':16,
  'Safe@Home — Virtual':16,
  'Safe@Home — Series':16,
  'Grandparents: Getting Started':16,
  'All Kids Welcome':20,
  'Stay Ready: Choking Rescue and CPR':12,
  'Campus Ready: Safety Skills for College Life':12,
  'Steady and Ready':8,
  'My First Babysitters Club':12
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
