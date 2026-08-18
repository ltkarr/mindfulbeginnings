/* ════════════════════════════════════════════════════════════════════════
   MINDFUL BEGINNINGS — INSTRUCTOR PORTAL CONFIG (config-instructor.js)
   ════════════════════════════════════════════════════════════════════════

   Loaded ONLY by instructor.html. It deliberately contains NO business data:
   no course prices, no material costs, no promo codes, no partner or
   invoicing information. Instructors can view any file their portal loads,
   so anything confidential must never be placed in here.

   Business data lives in config.js (register.html) and in admin.html.

   KEEPING IT IN SYNC
   Only three kinds of value live here, and all change rarely:
     hours / maxStudents        → teaching length and class cap
     instrFlatFee               → flat instructor fee, where a course has one
     requiresRN / requiresSafeSitter / virtual  → who may see the job
   If you change any of those in config.js or admin.html, change them here too.
   If this file is ever missing, instructor.html falls back to its own built-in
   copy and keeps working.
   ──────────────────────────────────────────────────────────────────────── */
const COURSES={
  "Safe Sitter®":{hours:5,maxStudents:16,requiresSafeSitter:true},
  "Intro to Babysitting":{hours:1,maxStudents:20},
  "Safe@Home":{hours:1.5,maxStudents:16},
  "Safe@Home — Series":{hours:1,maxStudents:16},
  "Safe@Home — Virtual":{hours:1,maxStudents:16,instrFlatFee:75,virtual:true},
  "Grandparents: Getting Started":{hours:3,maxStudents:16,requiresSafeSitter:true},
  "All Kids Welcome":{hours:1.5,maxStudents:20,instrFlatFee:75,virtual:true},
  "Stay Ready: Choking Rescue and CPR":{hours:1.5,maxStudents:12,requiresRN:true},
  "Campus Ready: Safety Skills for College Life":{hours:1,maxStudents:12,instrFlatFee:100,requiresRN:true},
  "Steady and Ready":{hours:1.5,maxStudents:8},
  "My First Babysitters Club":{hours:1,maxStudents:12}
};

/* Instructor pay constants (an instructor's own hourly rate, set in the admin,
   wins over INSTR_RATE). */
const INSTR_RATE=50;
const INSTR_TRAVEL=50;
const INSTR_EXTRA_HOURS=0.5;
