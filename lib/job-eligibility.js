'use strict';

// Server-side mirror of the instructor portal's job-eligibility rules.
//
// Which open jobs an instructor may see and accept is decided in the portal by
// canTeachSession() (instructor.html). The job-alert job must email each
// instructor ONLY about jobs they could actually claim, so this module
// re-implements the same rules for Node. `session` is a row from the sessions
// table (snake_case columns); `instr` is a row from the instructors table.
//
// KEEP IN SYNC with:
//   - instructor.html: canTeachSession(), canTeach(), sessionRequiresRN(),
//     sessionRequiresSafeSitter(), sessionRequiresSpanish(), isSafeSitterCertified(),
//     and the COURSES "SAFETY PATCH" name-pattern block.
//   - admin.html: sessionRequiresLeadTeacher() / courseRequiresLeadTeacher()
//     (Red Cross / Lead Teacher-only courses).
// If you change credential rules in any of those places, update this file and
// tests/job-eligibility.test.js, which cross-checks this module against the
// portal's own functions.

// Explicit per-course flags for courses whose names do not follow the
// patterns above. MUST match config-instructor.js and the instructor.html
// COURSES fallback. The cross-check test enforces this.
const EXPLICIT_COURSE_FLAGS = {
  "Babysitter's Training": { requiresLeadTeacher: true, redCross: true },
  "Adult First Aid/CPR/AED Certification": { requiresLeadTeacher: true, redCross: true },
  "Basic Life Support (BLS) Certification": { requiresLeadTeacher: true, redCross: true },
  "Group CPR Certification for Workplaces": { requiresLeadTeacher: true, redCross: true },
  "Adult & Pediatric First Aid/CPR/AED Certification (Hybrid)": { requiresLeadTeacher: true, redCross: true },
  "Basic Life Support (BLS) Certification (Hybrid)": { requiresLeadTeacher: true, redCross: true },
};

// Course-level credential flags, mirroring the COURSES safety-patch in
// instructor.html (same patterns, same order, same overrides).
function courseFlags(courseName) {
  const c = String(courseName || '');
  const explicit = EXPLICIT_COURSE_FLAGS[c];
  if (explicit) {
    return {
      requiresRN: false,
      requiresSafeSitter: false,
      requiresLeadTeacher: !!explicit.requiresLeadTeacher,
      redCross: !!explicit.redCross,
    };
  }
  const girlScoutBadge = /girl scouts?/i.test(c) && /badge/i.test(c);
  const flags = { requiresRN: false, requiresSafeSitter: false, requiresLeadTeacher: false, redCross: false };
  if (!girlScoutBadge && /stay ready|campus ready|ready\. ?period|season ready|first aid/i.test(c)) flags.requiresRN = true;
  if (/safe sitter|grandparent/i.test(c)) flags.requiresSafeSitter = true;
  if (girlScoutBadge) { flags.requiresRN = false; flags.requiresSafeSitter = false; }
  // American Red Cross courses are Lead Teacher-only (overrides the RN flag the
  // "first aid" pattern would otherwise set). Matches the portal's redCross
  // config flag plus its name-pattern fallback.
  if (/red cross|first aid\/cpr\/aed/i.test(c)) {
    flags.redCross = true;
    flags.requiresLeadTeacher = true;
    flags.requiresRN = false;
    flags.requiresSafeSitter = false;
  }
  // Baby Ready + CPR Certification includes "CPR" but is neither RN-only nor
  // a Red Cross Lead Teacher course.
  if (c === 'Baby Ready + CPR Certification') {
    flags.requiresRN = false;
    flags.requiresLeadTeacher = false;
    flags.redCross = false;
    flags.requiresSafeSitter = false;
  }
  return flags;
}

function isSafeSitterCertified(instr) {
  if (!instr) return false;
  if (instr.safe_sitter_certified === true) return true;
  if (instr.safe_sitter_certified === false) return false;
  // Column predates the explicit flag — fall back to a training date on file,
  // exactly like the portal's isSafeSitterCertified().
  return !!instr.safe_sitter_training_date;
}

// A job can be RN-only two ways: its course is RN-only, or the per-job
// "RN instructors only" box was ticked in admin. Same for Safe Sitter.
function sessionRequiresRN(session, flags) {
  if (!session) return false;
  if (session.requires_rn) return true;
  return !!flags.requiresRN;
}

function sessionRequiresSafeSitter(session, flags) {
  if (!session) return false;
  const course = session.course || '';
  if (/girl scouts?/i.test(course) && /badge/i.test(course)) return false;
  if (session.requires_safe_sitter) return true;
  return !!flags.requiresSafeSitter;
}

function sessionRequiresSpanish(session) {
  return !!(session && session.requires_spanish);
}

function sessionRequiresLeadTeacher(session, flags) {
  return !!(flags.requiresLeadTeacher || flags.redCross);
}

// Mirrors canTeachSession() in instructor.html: the single gate for whether
// this instructor may see and accept this job.
// NOTE: the portal also fail-closes custom jobs when the restriction columns
// could not be read (RN_RESTRICTION_KNOWN). The alert job always reads through
// the service role with an explicit column list, so the flags are always known
// and that branch never applies here.
function canTeachSession(session, instr) {
  if (!session || !instr) return false;
  const flags = courseFlags(session.course);
  if (sessionRequiresLeadTeacher(session, flags) && !instr.is_lead_teacher) return false;
  if (sessionRequiresRN(session, flags) && !instr.is_rn) return false;
  if (sessionRequiresSafeSitter(session, flags) && !isSafeSitterCertified(instr)) return false;
  if (sessionRequiresSpanish(session) && !instr.speaks_spanish) return false;
  return true;
}

// Mirrors the openJobs() board filter in instructor.html, minus the
// per-instructor "already holds it" check (alerts only go out for unclaimed
// jobs, so there is nothing the recipient already holds).
// todayStr is 'YYYY-MM-DD' in America/New_York; claimedIds holds session ids
// with a non-null instructor_id in job_data.
function isOpenSession(session, todayStr, claimedIds) {
  if (!session) return false;
  if (session.owner_taught || session.is_hold || session.is_cancelled) return false;
  if (!session.date || String(session.date) < todayStr) return false;
  if (claimedIds && claimedIds.has(session.id)) return false;
  return true;
}

// 'YYYY-MM-DD' for "today" in the business timezone (America/New_York).
function todayET(date) {
  const d = date || new Date();
  return d.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
}

module.exports = {
  courseFlags,
  isSafeSitterCertified,
  sessionRequiresRN,
  sessionRequiresSafeSitter,
  sessionRequiresSpanish,
  sessionRequiresLeadTeacher,
  canTeachSession,
  isOpenSession,
  todayET,
};
