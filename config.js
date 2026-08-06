/* ════════════════════════════════════════════════════════════════════════
   config.js — Mindful Beginnings shared configuration
   ────────────────────────────────────────────────────────────────────────
   SINGLE SOURCE OF TRUTH for course data, pricing, caps, instructor pay,
   and promo codes. Loaded by register.html, instructor.html, and admin.html
   BEFORE their inline <script> blocks.

   To change a price, a cap, instructor pay, or a promo code: edit it HERE,
   once. Do NOT redefine any of these names inside the individual pages, or
   the browser will throw "already declared."

   These are intentionally plain top-level `const`s in a classic script, so
   every page that loads this file shares them automatically.
   ════════════════════════════════════════════════════════════════════════ */

/* ── FAMILY-FACING PRICES ──────────────────────────────────────────────────
   Sessions dated 2027 or later automatically charge the 2027 rates; anything
   earlier uses the 2026 rates. getPriceForSession() picks the right table.

   ⚠️ TODO (Lindsay): the prices for the two NEW courses — Steady and Ready
   and My First Babysitters Club — are PLACEHOLDERS modeled on your similar
   courses. Set the real prices before opening registration. */
const PRICES_2026 = {
  'Safe Sitter®':185,
  'Intro to Babysitting':40,
  'Safe@Home':65,
  'Grandparents: Getting Started':150,
  'All Kids Welcome':25,
  'Stay Ready: Choking Rescue and CPR':75,
  'Campus Ready: Safety Skills for College Life':75,
  'Steady and Ready':65,              // ⚠️ placeholder — confirm
  'My First Babysitters Club':40      // ⚠️ placeholder — confirm
};
const PRICES_2027 = {
  'Safe Sitter®':225,
  'Intro to Babysitting':50,
  'Safe@Home':85,
  'Grandparents: Getting Started':185,
  'All Kids Welcome':25,
  'Stay Ready: Choking Rescue and CPR':75,
  'Campus Ready: Safety Skills for College Life':75,
  'Steady and Ready':65,              // ⚠️ placeholder — confirm
  'My First Babysitters Club':50      // ⚠️ placeholder — confirm
};
const PRICES = PRICES_2026; // legacy alias kept for any older references

function getPriceForSession(course, dateStr){
  const year = dateStr ? parseInt(String(dateStr).split('-')[0], 10) : new Date().getFullYear();
  const table = year >= 2027 ? PRICES_2027 : PRICES_2026;
  return table[course] ?? 0;
}

/* ── CAPACITY ──────────────────────────────────────────────────────────────
   Default max participants per course. A per-session override stored in the
   database still takes precedence over these. */
const MAX_STUDENTS = {
  'Safe Sitter®':8,
  'Intro to Babysitting':16,
  'Safe@Home':16,
  'Grandparents: Getting Started':8,
  'All Kids Welcome':20,
  'Stay Ready: Choking Rescue and CPR':8,
  'Campus Ready: Safety Skills for College Life':10,
  'Steady and Ready':16,              // ⚠️ placeholder — confirm
  'My First Babysitters Club':16      // ⚠️ placeholder — confirm
};

/* ── COURSE ECONOMICS + INSTRUCTOR ELIGIBILITY (instructor portal) ─────────
   hours              billable hours, multiplied by the instructor hourly rate
                      when there is no flat fee
   instrFlatFee       fixed instructor pay for this course; when present it
                      overrides the hourly math
   virtual            true means no travel stipend is added

   ELIGIBILITY — controls which instructors see the job post on their board:
   requiresSafeSitter true = only instructors marked "Safe Sitter® certified"
                      in the admin portal see/accept this course
   requiresRN         true = only instructors marked "Registered Nurse (RN)"
                      see/accept this course
   (no flag)          every instructor sees this course */
const COURSES = {
  'Safe Sitter®':{hours:5, requiresSafeSitter:true},
  'Intro to Babysitting':{hours:1},
  'Safe@Home':{hours:1.5},
  'Grandparents: Getting Started':{hours:3, requiresSafeSitter:true},
  'All Kids Welcome':{hours:1.5, instrFlatFee:75, virtual:true},
  'Stay Ready: Choking Rescue and CPR':{hours:1, instrFlatFee:100, requiresRN:true},
  'Campus Ready: Safety Skills for College Life':{hours:1, instrFlatFee:100, requiresRN:true},
  'Steady and Ready':{hours:1.5},                 // open to all instructors — ⚠️ confirm hours
  'My First Babysitters Club':{hours:1}           // open to all instructors — ⚠️ confirm hours
};
const INSTR_RATE = 50;   // default instructor hourly rate (a profile rate still overrides this)
// Travel is now paid as ONE hour at the instructor's own hourly rate (computed in
// instructor.html and admin.html). This flat constant is no longer used in the pay
// formula; it is kept only so any older reference does not break. Safe to remove once
// you have confirmed nothing else reads it.
const INSTR_TRAVEL = 50;

/* ── PROMO / DISCOUNT CODES ─────────────────────────────────────────────────
   To add a code, add an object below: {code:'UPPERCASE', discount: dollars}
   Optional: courses:[...] restricts a code to specific courses (omit = any).
   When restricting, add eligibilityNote for the message shown on the wrong
   course. */
const PROMO_CODES = [
  {code:'MBGSCN',   discount:10},
  {code:'HOMESCHOOL', discount:10},
  {code:'MILESTONES4KIDS', discount:10},
  {code:'MACARONI', discount:10},
  {code:'GOTRNOVA', discount:10},
  {code:'EASTBETHESDA10', discount:10},
  {code:'JGN25',    discount:25, courses:['Safe Sitter®','Grandparents: Getting Started'],
   eligibilityNote:'the Safe Sitter® Babysitting Course or the Grandparents: Getting Started course'}
];
