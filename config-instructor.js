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
     requiresRN / requiresSafeSitter / requiresLeadTeacher / redCross / virtual
                            → who may see the job
   If you change any of those in config.js or admin.html, change them here too.
   If this file is ever missing, instructor.html falls back to its own built-in
   copy and keeps working.
   ──────────────────────────────────────────────────────────────────────── */
const COURSES={
  "Safe Sitter®":{hours:5,maxStudents:16,requiresSafeSitter:true},
  "Safe Sitter® Babysitting Essentials":{hours:4,maxStudents:16,requiresSafeSitter:true},
  "Intro to Babysitting":{hours:1,maxStudents:20},
  "Safe@Home":{hours:1.5,maxStudents:20},
  "Safe@Home — Series":{hours:1,maxStudents:20},
  "Safe@Home — Virtual":{hours:1,maxStudents:20,instrFlatFee:75,virtual:true},
  "Grandparents: Getting Started":{hours:3,maxStudents:16,requiresSafeSitter:true,adult:true},
  "Safe Sitter® Grandparents: Getting Started":{hours:3,maxStudents:16,requiresSafeSitter:true,adult:true},
  "Care Ready":{hours:2.5,maxStudents:16,adult:true},
  "Baby Ready":{hours:3,maxStudents:12,adult:true},
  "Baby Ready + CPR Certification":{hours:5,maxStudents:12,adult:true},
  "Babysitting Grandkids Workshop":{hours:1,maxStudents:20,adult:true},
  "All Kids Welcome":{hours:1,maxStudents:20,instrFlatFee:75,virtual:true},
  "Stay Ready: Choking Rescue and CPR":{hours:1.25,maxStudents:12,requiresRN:true},
  "Stay Ready™: Choking Rescue, CPR, and Seizure Response":{hours:1.25,maxStudents:12,requiresRN:true},
  "Campus Ready: Safety Skills for College Life":{hours:1,maxStudents:12,instrFlatFee:100,requiresRN:true},
  "Steady and Ready":{hours:1,maxStudents:8},
  "My First Babysitters Club":{hours:1,maxStudents:16},
  "My First Babysitters Club — Single Session":{hours:2.5,maxStudents:16},
  "Little Medics":{hours:1,maxStudents:16},
  "Pet Sitter's Club":{hours:1,maxStudents:16},
  "Snack Squad":{hours:1,maxStudents:16},
  "Kid Boss Club":{hours:1,maxStudents:16},
  "Middle School, Here I Come":{hours:1,maxStudents:16},
  "Big Sibling Club":{hours:1,maxStudents:16},
  "My First Phone":{hours:1,maxStudents:16},
  "Walk and Roll Ready":{hours:1,maxStudents:16},
  "Calm and Ready":{hours:1,maxStudents:16},
  "Ready. Period.":{hours:1.5,maxStudents:18,requiresRN:true},
  "Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes":{hours:1,maxStudents:20,requiresRN:true},
  "Season Ready™: Safety Skills for Student Athletes":{hours:1,maxStudents:20,requiresRN:true},
  "Social Ready":{hours:1,maxStudents:20,instrFlatFee:100,virtual:true},
  "Girl Scouts — First Aid Badge Workshop":{hours:1,maxStudents:16},
  "Girl Scout Badge Class":{hours:1,maxStudents:16},
  "Babysitter's Training":{hours:4.25,maxStudents:12,redCross:true,requiresLeadTeacher:true},
  "Red Cross Babysitter's Training + Pediatric First Aid/CPR/AED":{hours:7,maxStudents:12,redCross:true,requiresLeadTeacher:true},
  "Adult & Pediatric First Aid/CPR/AED Certification":{hours:3.75,maxStudents:12,redCross:true,requiresLeadTeacher:true},
  "Adult First Aid/CPR/AED Certification":{hours:3.25,maxStudents:12,redCross:true,requiresLeadTeacher:true},
  "Basic Life Support (BLS) Certification":{hours:4,maxStudents:12,redCross:true,requiresLeadTeacher:true},
  "Adult & Pediatric First Aid/CPR/AED Certification (Hybrid)":{hours:4,maxStudents:12,redCross:true,requiresLeadTeacher:true},
  "Basic Life Support (BLS) Certification (Hybrid)":{hours:4,maxStudents:12,redCross:true,requiresLeadTeacher:true},
  "Group CPR Certification for Workplaces":{hours:4,redCross:true,requiresLeadTeacher:true,adult:true,customSize:true}
};

/* Instructor pay constants (an instructor's own hourly rate, set in the admin,
   wins over INSTR_RATE). */
const INSTR_RATE=50;
const INSTR_TRAVEL=50;
const INSTR_EXTRA_HOURS=0.5;
