'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const emails = require('../js/admin-ops-emails.js');
const overviews = require('../js/course-overviews.js');
const postCourse = require('../js/post-course-emails.js');
globalThis.postCourseDraftFor = postCourse.postCourseDraftFor;

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

function sample(over) {
  return Object.assign({
    course: 'Safe Sitter®',
    dateLong: 'Saturday, October 10, 2026',
    dateShort: 'October 10',
    time: '9:00 a.m. – 3:00 p.m.',
    address: '123 Maple St, Bethesda, MD 20814',
    instructor: 'Priya Shah',
    code: 'SS-1010',
    countPhrase: '8 students registered',
    hostFirst: 'Lindsay',
    mealText: '',
    specialNotes: '',
    wifi: '',
    priceText: '$185',
    regLink: 'https://register.mindfulbeginnings.org/register.html?code=SS-1010',
    hasHostSpot: true
  }, over || {});
}

test('post-course email is per-course with embedded links', () => {
  const draft = emails.draft('postCourse', sample());
  assert.equal(draft.field, 'bcc');
  assert.equal(draft.subject, 'Thank you for a great Safe Sitter® class');
  assert.match(draft.body, /Safety Signal/);
  assert.match(draft.body, /certified Safe Sitter®!/);
  assert.doesNotMatch(draft.body, /Two quick asks/);
  assert.doesNotMatch(draft.body, /forms\.gle/);
  assert.doesNotMatch(draft.body + draft.bodyHtml, /Warmly|Lindsay Karr/);
  assert.match(draft.bodyHtml, /<a href="https:\/\/mindfulbeginnings\.org\/course-evaluation\.html">program evaluation<\/a>/);
  assert.match(draft.bodyHtml, /<a href="https:\/\/g\.page\/r\/Ca2jsWW-MkfvEAE\/review">Google review<\/a>/);
  assert.doesNotMatch(draft.subject + draft.body + draft.bodyHtml, /\u2014/);
  assert.doesNotMatch(draft.subject + draft.body + draft.bodyHtml, /Safe Sitter®®/);
});

test('post-course email picks the right draft per course', () => {
  const cpr = emails.draft('postCourse', sample({ course: 'Adult & Pediatric First Aid/CPR/AED Certification' }));
  assert.equal(cpr.subject, "You're certified");
  assert.match(cpr.body, /valid for two years/);
  assert.match(cpr.body, /Two quick asks/);
  assert.doesNotMatch(cpr.body, /Warmly/);
  const gs = emails.draft('postCourse', sample({ course: 'Girl Scouts \u2014 First Aid Badge Workshop' }));
  assert.equal(gs.subject, 'Badge work, well done');
  const virtual = emails.draft('postCourse', sample({ course: 'Safe@Home \u2014 Virtual' }));
  assert.equal(virtual.subject, 'Your child is Safe@Home ready');
});

test('host reminder fills the checklist and leaves a meal placeholder', () => {
  const draft = emails.draft('hostReminder', sample());
  assert.equal(draft.field, 'to');
  assert.equal(draft.subject, 'Reminder: Safe Sitter® class on October 10 — hosting checklist');
  assert.match(draft.body, /^Hi Lindsay,/);
  assert.match(draft.body, /Your Safe Sitter® class is one week away!/);
  assert.match(draft.body, /Date: Saturday, October 10, 2026/);
  assert.match(draft.body, /Time: 9:00 a\.m\. – 3:00 p\.m\./);
  assert.match(draft.body, /Location: 123 Maple St, Bethesda, MD 20814/);
  assert.match(draft.body, /Instructor: Priya Shah/);
  assert.match(draft.body, /Session code: SS-1010/);
  assert.match(draft.body, /Registration count: 8 students registered/);
  assert.match(draft.body, /HOSTING CHECKLIST \(from our host form\)/);
  assert.match(draft.body, /Edit before sending/);
  assert.doesNotMatch(draft.body, /SPECIAL NOTES/);
});

test('host reminder uses a stored meal plan and special notes', () => {
  const draft = emails.draft('hostReminder', sample({
    mealText: 'You are providing a full meal for participants.',
    specialNotes: 'Park in the driveway.',
    wifi: 'HomeWifi / sesame'
  }));
  assert.match(draft.body, /YOUR MEAL PLAN FOR THIS CLASS\nYou are providing a full meal for participants\./);
  assert.match(draft.body, /SPECIAL NOTES\nPark in the driveway\.\nWi-Fi on file: HomeWifi \/ sesame/);
});

test('family reminder is the before-class pack and meal note', () => {
  const missing = emails.draft('classReminder', sample());
  assert.equal(missing.field, 'bcc');
  assert.equal(missing.subject, 'Reminder: Safe Sitter® class on October 10');
  assert.match(missing.body, /Please review the important details below as you prepare for the class:/);
  assert.match(missing.body, /What to Bring: Please send your child with a water bottle and a snack\./);
  assert.match(missing.body, /Edit before sending: “Your host is providing a meal for participants\.” OR “Please pack a lunch; the host will provide snacks and drinks\.”/);
  assert.match(missing.body, /Your instructor for the day will be Priya Shah\./);
  assert.match(missing.body, /official Safe Sitter® Certificate of Completion/);

  const redCross = emails.draft('classReminder', sample({ course: "Babysitter's Training" }));
  assert.match(redCross.body, /American Red Cross digital certificate/);
  assert.doesNotMatch(redCross.body, /Safe Sitter/);

  const home = emails.draft('classReminder', sample({ course: 'Safe@Home' }));
  assert.doesNotMatch(home.body, /CERTIFICATION/);
  assert.doesNotMatch(home.body, /Safe Sitter/);
  assert.doesNotMatch(home.body, /certificate/i);

  const meal = emails.draft('classReminder', sample({ mealText: 'Host is providing pizza for lunch.' }));
  assert.match(meal.body, /Meal: Your host is providing a meal for participants\./);
  const pack = emails.draft('classReminder', sample({ mealText: 'Please pack a lunch. Snacks and drinks only.' }));
  assert.match(pack.body, /Meal: Please pack a lunch; the host will provide snacks and drinks\./);

  const zoom = emails.draft('classReminder', sample({
    course: 'Safe@Home — Virtual',
    virtual: true,
    zoomLink: 'https://zoom.us/j/84366764411',
    address: 'Virtual (Zoom) — https://zoom.us/j/84366764411'
  }));
  assert.equal(zoom.subject, 'Reminder: Zoom link for Safe@Home — Virtual on October 10');
  assert.match(zoom.body, /Your class is one week away\. Here is the Zoom link so you can join from home\./);
  assert.match(zoom.body, /Zoom link: https:\/\/zoom\.us\/j\/84366764411/);
  assert.doesNotMatch(zoom.body, /What to Bring/);
  assert.doesNotMatch(zoom.body, /What to have ready/);
  assert.doesNotMatch(zoom.body, /one pad/);
  assert.doesNotMatch(zoom.body, /large spoon/);
  assert.doesNotMatch(zoom.body, /Location:/);
  assert.match(zoom.body, /Warmly,/);
  assert.doesNotMatch(zoom.body, /^Best,/m);
});

test('Ready. Period. virtual family reminder lists the four at-home items and other virtual reminders do not', () => {
  const period = emails.draft('classReminder', sample({
    course: 'Ready. Period.',
    virtual: true,
    zoomLink: 'https://zoom.us/j/87287606991',
    address: 'Virtual (Zoom)'
  }));
  assert.equal(period.field, 'bcc');
  assert.equal(period.subject, 'Reminder: Zoom link for Ready. Period. on October 10');
  assert.match(period.body, /Your class is one week away\. Here is the Zoom link so you can join from home\./);
  assert.match(period.body, /Zoom link: https:\/\/zoom\.us\/j\/87287606991/);
  assert.match(period.body, /What to have ready: For Ready\. Period\., please have one pad, a glass of water, a large spoon, and a towel ready before class\./);
  assert.match(period.body, /Can't wait for a great class!/);
  assert.match(period.body, /^Best,$/m);
  assert.doesNotMatch(period.body, /Warmly,/);
  assert.doesNotMatch(period.body, /What to Bring: Please send your child/);
  assert.doesNotMatch(period.body, /period pouch/i);
  assert.doesNotMatch(period.body, /product table/i);
  assert.doesNotMatch(period.body, /\u2014/);
  assert.match(period.body, /course-overviews\/ready-period\?format=virtual/);

  const inPerson = emails.draft('classReminder', sample({ course: 'Ready. Period.', virtual: false }));
  assert.doesNotMatch(inPerson.body, /one pad/);
  assert.doesNotMatch(inPerson.body, /large spoon/);
  assert.match(inPerson.body, /What to Bring: Please send your child with a water bottle and a snack\./);
  assert.match(inPerson.body, /Warmly,/);

  ['Safe@Home — Virtual', 'Stay Ready: Choking Rescue and CPR', 'Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes', 'Social Ready'].forEach(function (course) {
    const draft = emails.draft('classReminder', sample({
      course: course,
      virtual: true,
      zoomLink: 'https://zoom.us/j/111'
    }));
    assert.doesNotMatch(draft.body, /one pad/, course);
    assert.doesNotMatch(draft.body, /glass of water/, course);
    assert.doesNotMatch(draft.body, /large spoon/, course);
    assert.doesNotMatch(draft.body, /towel/, course);
    assert.doesNotMatch(draft.body, /What to have ready/, course);
    assert.match(draft.body, /Warmly,/, course);
    assert.doesNotMatch(draft.body, /^Best,$/m, course);
  });
});

test('zoom instructor drafts are a week-before Zoom link plus roster and a day-before final roster', () => {
  const info = sample({
    course: 'Safe@Home — Virtual',
    instructor: 'Priya Shah',
    virtual: true,
    zoomLink: 'https://zoom.us/j/84366764411',
    countPhrase: '6 students registered'
  });
  const week = emails.draft('instructorZoomReminder', info);
  assert.equal(week.field, 'to');
  assert.equal(week.subject, 'Zoom link and roster: Safe@Home — Virtual on October 10');
  assert.match(week.body, /^Hi Priya,/);
  assert.match(week.body, /one week away/);
  assert.match(week.body, /Zoom link and the current roster/);
  assert.match(week.body, /Zoom link: https:\/\/zoom\.us\/j\/84366764411/);
  assert.match(week.body, /final roster again the day before class/);
  assert.match(week.body, /6 students registered/);
  assert.doesNotMatch(week.body, /Location:/);
  assert.doesNotMatch(week.body, /mailto:/);

  const day = emails.draft('instructorFinalRoster', info);
  assert.equal(day.field, 'to');
  assert.equal(day.subject, 'Final roster: Safe@Home — Virtual on October 10');
  assert.match(day.body, /^Hi Priya,/);
  assert.match(day.body, /Class is tomorrow/);
  assert.match(day.body, /final roster/i);
  assert.match(day.body, /replaces the roster from last week/);
  assert.match(day.body, /Zoom link: https:\/\/zoom\.us\/j\/84366764411/);
  assert.doesNotMatch(day.body, /one week away/);
  assert.doesNotMatch(day.body, /mailto:/);

  const missing = emails.draft('instructorFinalRoster', sample({
    course: 'Safe@Home — Virtual',
    instructor: '',
    zoomLink: ''
  }));
  assert.match(missing.body, /^Hi there,/);
  assert.match(missing.body, /\[Add the Zoom link before sending\]/);
});

test('host letter is the initial confirm and drops the free spot when there is no host seat', () => {
  const draft = emails.draft('hostLetter', sample({ instructor: '' }));
  assert.equal(draft.field, 'to');
  assert.equal(draft.subject, 'Hosting your Safe Sitter® course');
  assert.match(draft.body, /Thank you so much for hosting an upcoming Mindful Beginnings course!/);
  assert.match(draft.body, /Price: \$185 per participant\./);
  assert.doesNotMatch(draft.body, /Estimated total/);
  assert.match(draft.body, /Registration link: https:\/\/register\.mindfulbeginnings\.org\/register\.html\?code=SS-1010/);
  assert.match(draft.body, /Session code: SS-1010/);
  assert.match(draft.body, /TBD\. As we get closer to the date, I will share your instructor's name/);
  assert.match(draft.body, /I am the host for this session/);

  const named = emails.draft('hostLetter', sample({ mealText: 'I will provide a meal.' }));
  assert.match(named.body, /Instructor: Priya Shah/);
  assert.match(named.body, /I will provide a meal\./);

  const venue = emails.draft('hostLetter', sample({ hasHostSpot: false }));
  assert.doesNotMatch(venue.body, /completely free/);
  assert.doesNotMatch(venue.body, /I am the host for this session/);

  const orgPaid = emails.draft('hostLetter', sample({
    priceText: '$45',
    expectedCount: 11,
    hasHostSpot: false,
    course: 'Girl Scouts — First Aid Badge Workshop'
  }));
  assert.match(orgPaid.body, /Price: \$45 per participant\. Estimated total for 11 participants: \$495, final invoice based on attendance/);
  assert.doesNotMatch(orgPaid.body, /Price:.*\u2014/);
});

test('a troop family-forward draft includes the private link, both prices, and the course overview', () => {
  const course = 'Girl Scouts — First Aid Badge Workshop';
  const overview = overviews.textFor(course);
  assert.match(overview, /Brownies through Ambassadors/);
  assert.match(overview, /60-minute hands-on workshop, taught by a registered nurse/);
  assert.match(overview, /Check–Call–Care/);
  assert.match(overview, /call 911/);
  assert.match(overview, /first aid kit/);
  assert.match(overview, /scrapes, nosebleeds, burns, bee stings, and basic sprains/);
  assert.match(overview, /staged-injury scenario/);
  assert.match(overview, /student handout/);
  assert.match(overview, /badge-step completion summary/);
  assert.match(overview, /not a CPR or First Aid certification/);
  assert.match(overview, /troop leader confirms which badge steps/);
  assert.match(overview, /does not claim Girl Scouts of the USA \(GSUSA\) endorsement/);
  assert.equal(overviews.textFor(course + ' (Troop 34182)'), overview);
  assert.equal(overviews.textFor('Safe Sitter®'), '');

  const draft = emails.draft('familyForward', {
    course: course,
    dateLong: 'Tuesday, December 8, 2026',
    dateShort: 'December 8',
    time: '6:30–7:30pm',
    address: 'Takoma Presbyterian Church — 310 Tulip Ave, Takoma Park, MD 20912',
    hostFirst: 'Mary',
    code: 'GS-H4782',
    regLink: 'https://register.mindfulbeginnings.org/register.html?code=GS-H4782',
    familyPayLine: 'Price: $15 per registration. Each family pays this at checkout on the private link. The organization amount is not added to that charge.',
    orgCoverLine: 'Price: $30 per participant. Estimated total for 15 participants: $450, final invoice based on attendance. Girl Scout Troop 34182 (Mary Polacek) is invoiced this amount. Families are not charged this at checkout.',
    overviewText: overview
  });
  assert.equal(draft.field, 'to');
  assert.equal(draft.subject, 'Please forward: Girl Scouts — First Aid Badge Workshop — December 8');
  assert.match(draft.body, /^Hi Mary,/);
  assert.match(draft.body, /Please forward the message below to your families/);
  assert.match(draft.body, /Nothing is emailed from here/);
  assert.match(draft.body, /Date: Tuesday, December 8, 2026/);
  assert.match(draft.body, /Time: 6:30–7:30pm/);
  assert.match(draft.body, /Takoma Presbyterian Church/);
  assert.match(draft.body, /\$15 per registration/);
  assert.match(draft.body, /https:\/\/register\.mindfulbeginnings\.org\/register\.html\?code=GS-H4782/);
  assert.match(draft.body, /not on the public class list/);
  assert.match(draft.body, /Price: \$30 per participant\. Estimated total for 15 participants: \$450, final invoice based on attendance/);
  assert.match(draft.body, /Girl Scout Troop 34182/);
  assert.match(draft.body, /\$450/);
  assert.match(draft.body, /not a CPR or First Aid certification/);
  assert.doesNotMatch(draft.body, /mailto:/);
});

test('admin offers the family-forward draft from the session menu and does not send it', () => {
  assert.match(admin, /src="\/js\/course-overviews\.js"/);
  assert.match(admin, /Email for families \(host forwards\)/);
  assert.match(admin, /function openFamilyForward\(sessId\)/);
  assert.match(admin, /draft\('familyForward'/);
  assert.match(admin, /Nothing is sent from this screen/);
  const fn = admin.slice(admin.indexOf('function openFamilyForward'), admin.indexOf('function openHostLetter'));
  assert.match(fn, /hostEmailsForSession/);
  assert.match(fn, /openDocEmail/);
  assert.doesNotMatch(fn, /outlook\.office|mail\.google|mailto:/);
});

test('meal and special-note pickers read session text and skip unrelated lines', () => {
  const chunks = ['Park in the back lot.\nHost is providing a full meal for participants.\nWeek 2 is a review.'];
  assert.equal(emails.mealText(chunks), 'Host is providing a full meal for participants.');
  assert.equal(emails.specialNotes(chunks), 'Park in the back lot.');
  assert.equal(emails.firstName('Lindsay Host'), 'Lindsay');
  assert.equal(emails.familyMealLine(''), emails.familyMealLine('   '));
});

test('ADMIN copy window is the send path and does not put a body in a mail link', () => {
  assert.match(admin, /<script src="\/js\/admin-ops-emails\.js"><\/script>/);
  assert.match(admin, /function copyBody\(\)/);
  assert.match(admin, /function copyList\(\)/);
  assert.match(admin, /uniq\.join\(';'\)/);
  assert.match(admin, /join\('; '\)/);
  assert.doesNotMatch(admin, /&body=/);
  assert.doesNotMatch(admin, /three small things/);
  assert.doesNotMatch(admin, /gmail\.com\/mail\/\?view=cm&fs=1&bcc=[^'"]*&body=/);
});

test('overview page urls map courses to their overview pages', () => {
  const base = 'https://mindfulbeginnings.org/course-overviews/';
  assert.equal(overviews.urlFor('Safe Sitter®'), base + 'safe-sitter-babysitting');
  assert.equal(overviews.urlFor('Safe Sitter® Babysitting Essentials'), base + 'safe-sitter-babysitting');
  assert.equal(overviews.urlFor('Safe Sitter® Grandparents: Getting Started'), base + 'grandparents-getting-started');
  assert.equal(overviews.urlFor('Intro to Babysitting'), base + 'intro-to-safe-babysitting');
  assert.equal(overviews.urlFor('Safe@Home — Virtual'), base + 'safe-at-home?format=virtual');
  assert.equal(overviews.urlFor('Safe@Home'), base + 'safe-at-home');
  assert.equal(overviews.urlFor('Stay Ready™: Choking Rescue, CPR, and Seizure Response', { virtual: true }), base + 'stay-ready?format=virtual');
  assert.equal(overviews.urlFor('Ready. Period.', { virtual: true }), base + 'ready-period?format=virtual');
  assert.equal(overviews.urlFor('Ready. Period.', { virtual: false }), base + 'ready-period');
  assert.equal(overviews.urlFor('Stay Ready™: Choking Rescue, CPR, and Seizure Response'), base + 'stay-ready');
  assert.equal(overviews.urlFor('Baby Ready + CPR Certification'), base + 'baby-ready');
  assert.equal(overviews.urlFor("My First Babysitter's Club, 8-week series"), base + 'my-first-babysitters-club');
  assert.equal(overviews.urlFor('My First Babysitters Club — Single Session'), '');
  assert.equal(overviews.urlFor('Girl Scouts — First Aid Badge Workshop'), base + 'first-aid-badge-workshop');
  assert.equal(overviews.urlFor('Girl Scout Badge Class'), '');
  assert.equal(overviews.urlFor('Campus Ready: Safety Skills for College Life'), '');
  assert.equal(overviews.urlFor('Screen Ready'), '');
  assert.equal(overviews.urlFor('Safe & Ready Families'), base + 'safe-and-ready-families');
  assert.equal(overviews.urlFor('Adult & Pediatric First Aid/CPR/AED Certification'), '');
  assert.equal(overviews.urlFor(''), '');
});

test('family reminder carries the course overview page, not the old doc link', () => {
  const withPage = emails.draft('classReminder', sample({
    course: 'Safe@Home',
    overviewUrl: overviews.urlFor('Safe@Home')
  }));
  assert.match(withPage.body, /Course Overview: https:\/\/mindfulbeginnings\.org\/course-overviews\/safe-at-home/);
  assert.doesNotMatch(withPage.body, /docs\.google\.com/);

  const noPage = emails.draft('classReminder', sample({
    course: 'Campus Ready: Safety Skills for College Life',
    overviewUrl: overviews.urlFor('Campus Ready: Safety Skills for College Life')
  }));
  assert.doesNotMatch(noPage.body, /Course Overview/);
});

test('host letter and family forward include the overview link', () => {
  const url = overviews.urlFor('Care Ready');
  const letter = emails.draft('hostLetter', sample({ course: 'Care Ready', overviewUrl: url }));
  assert.match(letter.body, /Course overview: https:\/\/mindfulbeginnings\.org\/course-overviews\/care-ready/);

  const forward = emails.draft('familyForward', sample({
    course: 'Care Ready',
    overviewUrl: url,
    overviewText: '',
    familyPayLine: 'Price: $185 per registration.',
    orgCoverLine: 'What the organization covers: the flat fee.'
  }));
  assert.match(forward.body, /Course overview: https:\/\/mindfulbeginnings\.org\/course-overviews\/care-ready/);
  assert.doesNotMatch(forward.body, /not on file/);
});
