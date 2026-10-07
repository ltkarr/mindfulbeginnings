'use strict';

const fs = require('fs');
const path = require('path');
const test = require('node:test');
const assert = require('node:assert/strict');
const emails = require('../js/admin-ops-emails.js');
const overviews = require('../js/course-overviews.js');

const root = path.join(__dirname, '..');
const admin = fs.readFileSync(path.join(root, 'admin.html'), 'utf8');

const POST_COURSE = [
  'Thank you for trusting Mindful Beginnings with your child. We hope they came home feeling confident, capable, and proud of everything they accomplished.',
  '',
  'The most important thing your child learned today is the Safety Signal. If you ever receive a text or call that says, "I\'m ready to be picked up now," that is their signal that they feel unsafe. Please go immediately, do not ask questions, and let them explain once they are in the car. This signal works in any situation, not only babysitting.',
  '',
  'The course is a meaningful achievement, but it does not automatically mean your child is ready to babysit or stay home alone, so please assess their readiness based on their individual maturity. We ask students to take jobs only with friends, neighbors, and others you or they know personally, and never to advertise online. And a quick conversation after each job gives your child helpful guidance while keeping you informed about what they are experiencing.',
  '',
  'If you have a moment, two small things would mean a great deal to us. A Google review (https://g.page/r/Ca2jsWW-MkfvEAE/review) helps other families find us! And our short program evaluation (https://forms.gle/3YkNJiaJyavjvSu49) helps us improve every session.',
  '',
  'Thank you again for being part of the Mindful Beginnings community. We are so glad your child is now a certified Safe Sitter!'
].join('\n');

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

test('post-course letter uses the updated Safe Sitter body exactly', () => {
  const draft = emails.draft('postCourse', sample());
  assert.equal(draft.field, 'bcc');
  assert.equal(draft.subject, 'After Safe Sitter® — Safety Signal & next steps');
  assert.equal(draft.body, POST_COURSE);
  assert.doesNotMatch(draft.body, /three small things/);
  assert.match(draft.body, /two small things would mean a great deal to us/);
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
  assert.match(draft.body, /Cost: \$185 per participant/);
  assert.match(draft.body, /Registration link: https:\/\/register\.mindfulbeginnings\.org\/register\.html\?code=SS-1010/);
  assert.match(draft.body, /Session code: SS-1010/);
  assert.match(draft.body, /TBD — as we get closer to the date, I will share your instructor's name/);
  assert.match(draft.body, /I am the host for this session/);

  const named = emails.draft('hostLetter', sample({ mealText: 'I will provide a meal.' }));
  assert.match(named.body, /Instructor: Priya Shah/);
  assert.match(named.body, /I will provide a meal\./);

  const venue = emails.draft('hostLetter', sample({ hasHostSpot: false }));
  assert.doesNotMatch(venue.body, /completely free/);
  assert.doesNotMatch(venue.body, /I am the host for this session/);
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
    familyPayLine: 'What each family pays: $15 per registration, at checkout on the private link. The organization amount is not added to that charge.',
    orgCoverLine: 'What the organization covers: Girl Scout Troop 34182 (Mary Polacek) is invoiced $30 per scout. For 15 scouts on the roster, the invoice is $450. Families are not charged this at checkout.',
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
  assert.match(draft.body, /\$30 per scout/);
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
