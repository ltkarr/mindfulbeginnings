'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');

const root = path.join(__dirname, '..');
const srf = require(path.join(root, 'js/srf-grant.js'));
const api = fs.readFileSync(path.join(root, 'api/evaluations/submit.js'), 'utf8');
const migration = fs.readFileSync(path.join(root, 'migrations/20261103_srf_grant_responses.sql'), 'utf8');
const register = fs.readFileSync(path.join(root, 'register.html'), 'utf8');
const instructor = fs.readFileSync(path.join(root, 'instructor.html'), 'utf8');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');
const classPage = fs.readFileSync(path.join(root, 'grant-class-survey.html'), 'utf8');
const followPage = fs.readFileSync(path.join(root, 'grant-followup.html'), 'utf8');
const pageJs = fs.readFileSync(path.join(root, 'js/srf-grant-page.js'), 'utf8');

const grantCopy = [
  fs.readFileSync(path.join(root, 'js/srf-grant.js'), 'utf8'),
  pageJs, classPage, followPage, migration,
  api.slice(api.indexOf('async function handleSrfGrant')),
  fs.readFileSync(path.join(root, 'srf-grant.css'), 'utf8')
].join('\n');

function fakeForm(map) {
  return {
    querySelectorAll(sel) {
      const m = String(sel).match(/name="([^"]+)"/);
      const name = m && m[1];
      const vals = map[name];
      if (vals == null) return [];
      const arr = Array.isArray(vals) ? vals : [vals];
      return arr.filter(function (v) { return v != null && v !== ''; }).map(function (v) { return { value: String(v) }; });
    },
    querySelector(sel) {
      const checked = String(sel).indexOf(':checked') >= 0;
      const m = String(sel).match(/name="([^"]+)"/);
      const name = m && m[1];
      if (checked) {
        const all = this.querySelectorAll(sel);
        return all[0] || null;
      }
      if (map[name] == null || Array.isArray(map[name])) return { value: '' };
      return { value: String(map[name]) };
    }
  };
}

test('grant questions use the survey set wording and no em dash', () => {
  const reg = srf.registrationHtml();
  const day = srf.classSurveyHtml({ date: '2027-01-23' });
  const later = srf.followupHtml();
  const added = [
    register.slice(register.indexOf('function syncSrfGrant'), register.indexOf('// Sitter referral list opt-in')),
    instructor.slice(instructor.indexOf('function srfGrantSurveyHTML'), instructor.indexOf('function safeAtHomeClassChecklistHTML')),
    admin.slice(admin.indexOf('id="screen-grant"'), admin.indexOf('id="screen-onboarding"')),
    admin.slice(admin.indexOf('function srfPctText'), admin.indexOf('function renderInvoices'))
  ].join('\n');
  const blob = grantCopy + added + reg + day + later;
  assert.equal(blob.indexOf('\u2014'), -1);
  assert.match(reg, /Which best describes you\? REQUIRED\. Choose one\./);
  assert.match(reg, /Parent or stepparent/);
  assert.match(reg, /Other family caregiver \(aunt, uncle, sibling, foster or kinship caregiver\)/);
  assert.match(reg, /How many children with a disability do you care for\? \(1, 2, 3 or more\)/);
  assert.match(reg, /Age of the child or children you are planning for\. Check all that apply\./);
  assert.match(reg, /Which of these describe your child\? Check all that apply\./);
  assert.match(reg, /Prefer not to say/);
  assert.match(reg, /Do you currently have a written safety plan for your child that another adult could follow\? REQUIRED\./);
  assert.match(reg, /What is the one safety worry you most want this class to address\?/);
  assert.match(reg, new RegExp(srf.CONSENT.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(reg, /Do you need any accommodations to participate \(seating, mobility, language, childcare question\)\?/);
  assert.match(reg, /How did you hear about this class\?/);
  assert.equal(srf.EMAIL_NOTE, 'Email address. REQUIRED. (We will send you your class reminder and two short surveys, one at class and one about two months later.)');
  assert.match(day, /For each statement, choose one number for how you felt BEFORE today, and one for how you feel NOW\. 1 = not at all confident, 5 = very confident\./);
  srf.CONFIDENCE.forEach(function (line) { assert.ok(day.includes(line), line); });
  assert.match(day, /Overall, compared to before today, I feel: \(choose one\)/);
  assert.match(day, /Much more confident/);
  assert.match(day, /Which toolkit sheets did you start or finish in class\? Check all that apply\./);
  assert.match(day, /Which ONE sheet will you finish tonight\?/);
  assert.match(day, /The instructor explained things clearly:/);
  assert.match(day, /The hands-on practice was useful:/);
  assert.match(day, /The class respected my child and my family:/);
  assert.match(day, /The length \(2\.5 hours\) was:/);
  assert.match(day, /I would recommend this class to another family:/);
  assert.match(day, /The most useful part of today was:/);
  assert.match(day, /One thing I wish we had covered:/);
  assert.match(day, /Anything else you want us to know:/);
  assert.match(day, /I am a:/);
  assert.match(day, /I am interested in:/);
  assert.match(later, /Since the class, have you completed a written safety plan for your child\?/);
  assert.match(later, /Yes, both are complete/);
  assert.match(later, /Where does a copy of your About Me Sheet live now\?/);
  assert.match(later, /None of these yet/);
  assert.match(later, /Have you had to use anything from the class in a real situation\?/);
  assert.match(later, /Today, how confident do you feel that you could keep your child safe and respond in an emergency\?/);
  assert.match(later, /Compared to before the class, I feel:/);
  assert.match(later, /No thanks/);
  assert.doesNotMatch(reg + day + later, /¿Qué describe mejor su caso/);
  assert.doesNotMatch(api + pageJs + classPage + followPage, /Two minutes that keep this class free/);
});

test('the three grant outcomes use the survey definitions', () => {
  const rows = [
    { part: 'A', session_code: 'SRF-270123', answers: { role: 'Parent or stepparent' } },
    { part: 'A', session_code: 'SRF-270123', answers: { role: 'Grandparent' } },
    { part: 'A', session_code: 'SRF-270216', answers: { role: 'Other', role_other: 'Neighbor' } },
    { part: 'B', session_code: 'SRF-270123', answers: { overall: 'Much more confident' } },
    { part: 'B', session_code: 'SRF-270123', answers: { overall: 'Somewhat more confident' } },
    { part: 'B', session_code: 'SRF-270123', answers: { overall: 'About the same' } },
    { part: 'B', session_code: 'SRF-270123', answers: {} },
    { part: 'C', session_code: 'SRF-270123', answers: { plan: 'Yes, both are complete' } },
    { part: 'C', session_code: 'SRF-270123', answers: { plan: 'Yes, both are complete' } },
    { part: 'C', session_code: 'SRF-270123', answers: { plan: 'Yes, both are complete' } },
    { part: 'C', session_code: 'SRF-270123', answers: { plan: 'No, I have not started' } },
    { part: 'C', session_code: 'SRF-270123', answers: {} }
  ];
  const summary = srf.report(rows);
  assert.equal(summary.served, 3);
  assert.equal(summary.byRole['Parent or stepparent'], 1);
  assert.equal(summary.byRole['Grandparent'], 1);
  assert.equal(summary.byRole['Other: Neighbor'], 1);
  assert.equal(summary.confidenceResponses, 3);
  assert.equal(summary.moreConfident, 2);
  assert.equal(summary.moreConfidentPct, 66.7);
  assert.equal(summary.planResponses, 4);
  assert.equal(summary.writtenPlan, 3);
  assert.equal(summary.writtenPlanPct, 75);
  const empty = srf.report([]);
  assert.equal(empty.served, 0);
  assert.equal(empty.moreConfidentPct, null);
  assert.equal(empty.writtenPlanPct, null);
  const csv = srf.csv(rows);
  assert.match(csv, /Participants served,3/);
  assert.match(csv, /Percent reporting more confidence,66\.7/);
  assert.match(csv, /Percent completing a written safety plan,75/);
});

test('saved answers stay inside the written choices', () => {
  const bad = srf.accept('A', { role: 'Coach', written_plan: 'Yes, complete', followup_consent: 'Yes' });
  assert.equal(bad.ok, false);
  const scales = srf.CONFIDENCE.map(function () { return { before: 2, now: 4 }; });
  const day = srf.accept('B', {
    email: 'Family@Example.com',
    overall: 'Much more confident',
    statements: scales,
    sheets: ['Wandering Plan', 'Not a sheet'],
    role: 'Invented'
  });
  assert.equal(day.ok, true);
  assert.equal(day.answers.email, 'family@example.com');
  assert.deepEqual(day.answers.sheets, ['Wandering Plan']);
  assert.equal(day.answers.role, '');
  assert.equal(day.answers.statements[0].statement, srf.CONFIDENCE[0]);
  const missing = srf.accept('B', { email: 'a@b.co', overall: 'Much more confident', statements: [] });
  assert.equal(missing.ok, false);
});

test('registration, surveys, instructor link, and admin report are wired', () => {
  assert.match(register, /id="srf-grant"/);
  assert.match(register, /MBSrfGrant\.registrationHtml\(lang\)/);
  assert.match(register, /MBSrfGrant\.EMAIL_NOTE/);
  assert.match(register, /form:'srf-grant'/);
  assert.match(register, /part:'A'/);
  assert.match(register, /Your seat is saved, but the grant questions did not save/);
  assert.match(classPage, /MBSrfGrantPage\.mount\(\{ part: 'B'/);
  assert.match(followPage, /MBSrfGrantPage\.mount\(\{ part: 'C'/);
  assert.match(pageJs, /form: 'srf-grant'/);
  assert.match(instructor, /function srfGrantSurveyHTML\(s\)/);
  assert.match(instructor, /grant-class-survey\.html/);
  assert.match(instructor, /api\.qrserver\.com/);
  assert.match(instructor, /Show this at the end of class/);
  assert.match(admin, /id="screen-grant"/);
  assert.match(admin, /showScreen\('grant',this\)/);
  assert.match(admin, /function renderSrfGrant\(\)/);
  assert.match(admin, /from\('srf_grant_responses'\)/);
  assert.match(admin, /downloadSrfGrantCsv/);
  assert.match(admin, /Copy a link and send it yourself/);
  assert.match(api, /body\.form === 'srf-grant'/);
  assert.match(api, /srf_grant_responses/);
  assert.doesNotMatch(api, /sendEmail|emailjs|resend/i);
  assert.match(migration, /create table if not exists public\.srf_grant_responses/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on table public\.srf_grant_responses from public, anon/);
  assert.match(migration, /to authenticated/);
  assert.equal(srf.surveyUrl('B', 'SRF-270413'), 'https://mindfulbeginnings.org/grant-class-survey.html?code=SRF-270413');
  assert.equal(srf.surveyUrl('C', 'SRF-270413'), 'https://mindfulbeginnings.org/grant-followup.html?code=SRF-270413');
  assert.equal(srf.surveyUrl('B', 'SRF-270413', 'es'), 'https://mindfulbeginnings.org/grant-class-survey.html?code=SRF-270413&lang=es');
  assert.equal(srf.surveyUrl('C', 'SRF-270413', 'es'), 'https://mindfulbeginnings.org/grant-followup.html?code=SRF-270413&lang=es');
});

test('the April Spanish session uses the Spanish survey wording and the same stored answers', () => {
  const esReg = srf.registrationHtml('es');
  const esDay = srf.classSurveyHtml({ date: '2027-04-13' }, 'es');
  const esLater = srf.followupHtml('es');
  const blob = esReg + esDay + esLater;
  assert.equal(blob.indexOf('\u2014'), -1);
  assert.match(esReg, /¿Qué describe mejor su caso\? OBLIGATORIO\. Elija una\./);
  assert.match(esReg, /Padre, madre o padrastro\/madrastra/);
  assert.match(esReg, /value="Parent or stepparent"/);
  assert.match(esReg, /¿A cuántos niños con una discapacidad cuida\?/);
  assert.match(esReg, /Síndrome de Down/);
  assert.match(esReg, /Prefiero no decirlo/);
  assert.match(esReg, new RegExp(srf.CONSENT_ES.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(esDay, /Para cada afirmación, encierre en un círculo un número/);
  assert.match(esDay, /Evitar que mi hijo se escape/);
  assert.match(esDay, /Mucho más seguro\/a/);
  assert.match(esDay, /value="Much more confident"/);
  assert.match(esDay, /Plan si mi hijo se escapa/);
  assert.match(esDay, /value="Wandering Plan"/);
  assert.match(esLater, /Sí, ambos están completos/);
  assert.match(esLater, /value="Yes, both are complete"/);
  assert.match(esLater, /Ninguna de estas todavía/);
  assert.match(esLater, /No, gracias/);
  const scales = srf.CONFIDENCE.map(function () { return { before: 1, now: 5 }; });
  const saved = srf.accept('B', {
    email: 'familia@example.com',
    overall: 'Mucho más seguro/a',
    statements: scales,
    sheets: ['Plan si mi hijo se escapa'],
    lang: 'es'
  }, 'es');
  assert.equal(saved.ok, true);
  assert.equal(saved.answers.overall, 'Much more confident');
  assert.deepEqual(saved.answers.sheets, ['Wandering Plan']);
  assert.equal(saved.answers.lang, 'es');
  const plan = srf.accept('C', {
    email: 'familia@example.com',
    plan: 'Sí, ambos están completos'
  }, 'es');
  assert.equal(plan.answers.plan, 'Yes, both are complete');
  const mixed = srf.report([
    { part: 'B', answers: { overall: 'Much more confident' } },
    { part: 'B', answers: { overall: 'Much more confident', lang: 'es' } }
  ]);
  assert.equal(mixed.confidenceResponses, 2);
  assert.equal(mixed.moreConfidentPct, 100);
});

test('the April 13 public card, registration banner, and instructor job say the class is in Spanish', () => {
  assert.match(register, /In Spanish \/ En español/);
  assert.match(register, /function sessionListedInSpanish/);
  assert.match(register, /spanishSessionBadge\(\)/);
  assert.match(instructor, /In Spanish \/ En español/);
  assert.match(instructor, /function sessionListedInSpanish/);
  const migration = fs.readFileSync(path.join(root, 'migrations/20261103_public_listing_spanish.sql'), 'utf8');
  assert.match(migration, /requires_spanish boolean/);
  assert.match(migration, /coalesce\(s\.requires_spanish, false\)/);
  const added = [
    register.slice(register.indexOf('function sessionListedInSpanish'), register.indexOf('function sessionUsesSpanish')),
    instructor.slice(instructor.indexOf('if(sessionListedInSpanish(s))'), instructor.indexOf('return bits.join')),
    instructor.slice(instructor.indexOf('function sessionListedInSpanish'), instructor.indexOf('// True when a job'))
  ].join('\n') + migration;
  assert.equal(added.indexOf('\u2014'), -1);
});

test('class-day form requires every before and now number', () => {
  const map = {
    'srf-email': 'parent@example.com',
    'srf-overall': 'Somewhat more confident',
    'srf-before-0': '2',
    'srf-now-0': '4'
  };
  const partial = srf.readClassSurvey(fakeForm(map));
  assert.equal(partial.ok, false);
  srf.CONFIDENCE.forEach(function (_, i) {
    map['srf-before-' + i] = '2';
    map['srf-now-' + i] = '5';
  });
  const full = srf.readClassSurvey(fakeForm(map));
  assert.equal(full.ok, true);
  assert.equal(full.answers.statements.length, 7);
  assert.equal(full.answers.overall, 'Somewhat more confident');
});
