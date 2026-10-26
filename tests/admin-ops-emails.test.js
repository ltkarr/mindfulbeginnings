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
  assert.equal(draft.subject, 'Thank you for a great Safe Sitter class');
  assert.match(draft.body, /Safety Signal/);
  assert.match(draft.body, /mindfulbeginnings\.org\/course-evaluation\.html/);
  assert.doesNotMatch(draft.body, /forms\.gle/);
  assert.match(draft.bodyHtml, /<a href="https:\/\/mindfulbeginnings\.org\/course-evaluation\.html">program evaluation<\/a>/);
  assert.match(draft.bodyHtml, /<a href="https:\/\/g\.page\/r\/Ca2jsWW-MkfvEAE\/review">Google review<\/a>/);
  assert.doesNotMatch(draft.subject + draft.body, /\u2014/);
});

test('post-course email picks the right draft per course', () => {
  const cpr = emails.draft('postCourse', sample({ course: 'Adult & Pediatric First Aid/CPR/AED Certification' }));
  assert.equal(cpr.subject, "You're certified");
  assert.match(cpr.body, /valid for two years/);
  const gs = emails.draft('postCourse', sample({ course: 'Girl Scouts \u2014 First Aid Badge Workshop' }));
  assert.equal(gs.subject, 'Badge work, well done');
  const virtual = emails.draft('postCourse', sample({ course: 'Safe@Home \u2014 Virtual' }));
  assert.equal(virtual.subject, 'Your child is Safe@Home ready');
});

test('host reminder matches the one-week host letter wording', () => {
  const draft = emails.draft('hostReminder', {
    course: 'Safe@Home',
    dateLong: 'Monday, November 2, 2026',
    dateShort: 'November 2',
    time: '11:00 AM',
    address: '6104 Roseland Drive, Rockville, MD 20852',
    instructor: 'Ashira Lavine',
    code: 'SAH-261102B',
    countPhrase: '5 students registered',
    hostFirst: 'Alix',
    mealText: 'I will provide a full meal for participants.',
    specialNotes: 'Park in the driveway.',
    wifi: 'HomeWifi / sesame'
  });
  assert.equal(draft.field, 'to');
  assert.equal(draft.subject, 'Reminder: Safe@Home class on November 2 - hosting checklist');
  assert.equal(draft.body, [
    'Hi Alix,',
    '',
    'Your Safe@Home class is one week away! Here is everything you need to remember as the host, plus the session details.',
    '',
    'SESSION DETAILS',
    'Course: Safe@Home',
    'Date: Monday, November 2, 2026',
    'Time: 11:00 AM',
    'Location: 6104 Roseland Drive, Rockville, MD 20852',
    'Instructor: Ashira Lavine',
    'Session code: SAH-261102B',
    'Registration count: 5 students registered (roster attached)',
    '',
    'HOSTING CHECKLIST',
    'Please make sure the following are in place before the instructor and participants arrive:',
    '',
    '• Space & seating: A clean floor area for hands-on practice, plus a comfortable seat for every participant.',
    '• Work surface: A dining table is preferred. If you don\'t have one available, no worries. The instructor will bring clipboards.',
    '• Tech & projection: A large, blank wall is needed to project videos. We supply the laptop, speakers, and projector.',
    '• Wi-Fi: Reliable internet access is required. Please share the login credentials with the instructor upon arrival.',
    '• Refreshments: As the host, please provide light snacks and drinks. Participants usually pack their own meals unless you chose to provide a meal (see your meal plan below).',
    '• Safety & environment:',
    '  – An adult must be present for the duration of the course.',
    '  – Secure entry, access to restrooms, a working phone, and adequate lighting.',
    '  – Please keep pets in a separate area, away from the teaching space.',
    '',
    'YOUR MEAL PLAN FOR THIS CLASS',
    'Food: I will provide a full meal for participants.',
    '',
    'Thank you!'
  ].join('\n'));
  assert.doesNotMatch(draft.subject + '\n' + draft.body, /\u2014/);
  assert.doesNotMatch(draft.body, /Please print the attached class roster/);
  assert.doesNotMatch(draft.body, /from our host form/);
  assert.doesNotMatch(draft.body, /SPECIAL NOTES/);
  assert.doesNotMatch(draft.body, /Park in the driveway/);
  assert.doesNotMatch(draft.body, /HomeWifi/);
  assert.doesNotMatch(draft.body, /Warmly/);
  assert.doesNotMatch(draft.body, /Edit before sending/);
});

test('host reminder keeps a Food line when the meal plan is missing and does not double the label', () => {
  const missing = emails.draft('hostReminder', sample());
  assert.equal(missing.subject, 'Reminder: Safe Sitter® class on October 10 - hosting checklist');
  assert.match(missing.body, /Registration count: 8 students registered \(roster attached\)/);
  assert.match(missing.body, /^HOSTING CHECKLIST$/m);
  assert.doesNotMatch(missing.body, /HOSTING CHECKLIST \(from our host form\)/);
  assert.match(missing.body, /YOUR MEAL PLAN FOR THIS CLASS\nFood:\n/);
  assert.doesNotMatch(missing.body, /Edit before sending/);
  assert.doesNotMatch(missing.body, /\u2014/);

  const prefixed = emails.draft('hostReminder', sample({
    mealText: 'Food: I will provide snacks and drinks only; participants should pack a meal.'
  }));
  assert.match(prefixed.body, /Food: I will provide snacks and drinks only; participants should pack a meal\./);
  assert.doesNotMatch(prefixed.body, /Food: Food:/);
});

test('family reminder is the before-class pack and meal note', () => {
  const missing = emails.draft('classReminder', sample());
  assert.equal(missing.field, 'bcc');
  assert.equal(missing.subject, 'Reminder: Safe Sitter® class on October 10');
  assert.match(missing.body, /Please review the important details below as you prepare for the class:/);
  assert.match(missing.body, /What to Bring: Please send your child with a water bottle and a snack\./);
  assert.match(missing.body, /Edit before sending: “Your host is providing a meal for participants\.” OR “Please pack a lunch; the host will provide snacks and drinks\.”/);
  assert.match(missing.body, /Your instructor for the day will be Priya Shah\./);

  const meal = emails.draft('classReminder', sample({ mealText: 'Host is providing pizza for lunch.' }));
  assert.match(meal.body, /Meal: Your host is providing a meal for participants\./);
  const pack = emails.draft('classReminder', sample({ mealText: 'Please pack a lunch. Snacks and drinks only.' }));
  assert.match(pack.body, /Meal: Please pack a lunch; the host will provide snacks and drinks\./);
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
