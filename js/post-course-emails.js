/* Per-course post-course emails for families.
   Keyed by admin session course name. Each draft: subject, greeting,
   paragraphs, and who completes the evaluation ("have your child complete"
   for kid courses, "complete" for adult courses).
   Nothing here sends email. ADMIN builds the draft and Lindsay copies it
   into her own email. Links are embedded in words in the HTML version. */
(function (root) {
  'use strict';

  var REVIEW_URL = 'https://g.page/r/Ca2jsWW-MkfvEAE/review';
  var EVAL_URL = 'https://mindfulbeginnings.org/course-evaluation.html';
  var SIGNOFF = 'Warmly,\nLindsay Karr, M.Ed. | Founder, Mindful Beginnings';

  function asks(taker) {
    return 'Two quick asks: would you leave us a Google review? And please ' + taker +
      ' our short program evaluation. Your feedback keeps our classes strong.';
  }

  var DRAFTS = [
    {
      keys: ['Safe Sitter®'],
      subject: 'Thank you for a great Safe Sitter class',
      greeting: 'Hi there,',
      taker: 'have your child complete',
      paragraphs: [
        'Thank you for trusting Mindful Beginnings with your child\'s Safe Sitter training. Your child practiced the real skills sitters need, from handling emergencies to caring for younger children and making safe choices when no adult is in the room.',
        'Please keep practicing the Safety Signal at home, your family\'s code phrase that means "come pick me up now, no questions asked." And remember that finishing Safe Sitter is a wonderful foundation, but it doesn\'t automatically mean your child is ready to babysit alone. Trust your judgment on timing.',
        'When they\'re ready for the next step, Safe Sitter Babysitting Essentials builds on everything they learned today.'
      ]
    },
    {
      keys: ['Safe Sitter® Babysitting Essentials'],
      subject: 'Your sitter means business',
      greeting: 'Hi there,',
      taker: 'have your child complete',
      paragraphs: [
        'Thank you for choosing Mindful Beginnings for Babysitting Essentials. Your child moved beyond basic safety into the business of babysitting: communicating with parents, setting clear expectations, and leading with confidence from the moment they walk in the door.',
        'They\'re ready to take on sitting jobs and handle whatever the afternoon brings, from fussy toddlers to last-minute changes in the plan. And it\'s great news for you too: a trained sitter in the family makes date nights a lot easier.'
      ]
    },
    {
      keys: ['Intro to Babysitting'],
      subject: 'First steps toward babysitting',
      greeting: 'Hi there,',
      taker: 'have your child complete',
      paragraphs: [
        'Thank you for bringing your child to Intro to Babysitting. They got a first taste of a sitter\'s world: basic child care, safety awareness, and how to stay calm and think clearly when something unexpected happens.',
        'This class plants the seed. When your child turns 11, Safe Sitter is the natural next step, with deeper training in emergencies, rescue skills, and real sitting scenarios. We loved having your child in class and hope they left excited about what\'s ahead.'
      ]
    },
    {
      keys: ['Safe@Home', 'Safe@Home — Virtual', 'Safe@Home — Series'],
      subject: 'Your child is Safe@Home ready',
      greeting: 'Hi there,',
      taker: 'have your child complete',
      paragraphs: [
        'Thank you for choosing Mindful Beginnings for Safe@Home. Your child practiced exactly what to do when home alone: answering the door and phone safely, responding to emergencies, and making smart decisions without an adult in the room.',
        'A great next step is making a family plan together. Talk through who they call, where they go, and what your Safety Signal is, so everyone knows the plan before it\'s ever needed. Many families revisit the key scenarios a week later, once the details are still fresh and the nerves have settled.'
      ]
    },
    {
      keys: ['Grandparents: Getting Started'],
      subject: 'Thank you for joining us, grandparents',
      greeting: 'Hello,',
      taker: 'complete',
      paragraphs: [
        'Thank you for spending time with us in Grandparents: Getting Started. So much has changed since your parenting days: car seats, safe sleep, and feeding guidance all look different now, and you learned today\'s best practices.',
        'Your grandkids are lucky to have a grandparent who shows up prepared. Keep the conversation going with their parents so everyone\'s aligned on routines, rules, and expectations. And don\'t be surprised if the grandkids start quizzing you. They love being the experts.'
      ]
    },
    {
      keys: ['Care Ready'],
      subject: 'You\'re Care Ready',
      greeting: 'Hello,',
      taker: 'complete',
      paragraphs: [
        'Thank you for completing Care Ready with Mindful Beginnings. You trained in the practical safety skills every caregiver needs: preventing injuries, responding to emergencies, and creating a safe environment for the children in your care.',
        'Families can feel the difference when a caregiver is truly prepared. Review what you practiced every few months so it stays second nature. Consider keeping a small first aid kit in your bag, so you\'re ready wherever the day takes you.'
      ]
    },
    {
      keys: ['Baby Ready', 'Baby Ready + CPR Certification'],
      subject: 'You\'re Baby Ready',
      greeting: 'Hello,',
      taker: 'complete',
      paragraphs: [
        'Thank you for joining Baby Ready. You covered what every new parent needs most: safe sleep, soothing a crying baby, feeding basics, and how to get through those overwhelming first weeks.',
        'If grandparents or other caregivers will be lending a hand, our Grandparents: Getting Started class brings them up to speed on everything that\'s changed. You\'ve got this, and the fact that you\'re preparing now says everything about the parent you\'re going to be.'
      ]
    },
    {
      keys: ['All Kids Welcome'],
      subject: 'Thank you for joining All Kids Welcome',
      greeting: 'Hi there,',
      taker: 'have your child complete',
      paragraphs: [
        'Thank you for choosing All Kids Welcome. Your child learned that every kid deserves to feel included and safe, and practiced real skills for welcoming children of all abilities and needs.',
        'The takeaway is simple: kindness plus know-how. Keep the conversation going at home about including others and speaking up for friends who need it. Thank you for raising a child who makes room for everyone.'
      ]
    },
    {
      keys: ['Stay Ready: Choking Rescue and CPR'],
      subject: 'You\'re Stay Ready trained',
      greeting: 'Hello,',
      taker: 'complete',
      paragraphs: [
        'Thank you for joining Stay Ready. In just over an hour you practiced the two skills every adult hopes never to need: choking rescue and CPR, with hands-on time on the manikins.',
        'Skills fade without practice, so review the steps every few months. When you\'re ready for full certification, our American Red Cross First Aid/CPR/AED course is the next step, and it\'s valid for two years. Tell a friend what you learned today. The more adults around a child who know these skills, the safer every kid is.'
      ]
    },
    {
      keys: ['Campus Ready: Safety Skills for College Life'],
      subject: 'Your teen is Campus Ready',
      greeting: 'Hi there,',
      taker: 'have your child complete',
      paragraphs: [
        'Thank you for choosing Campus Ready for your college-bound teen. They covered the safety skills that matter most in independent life: staying aware on campus, making smart decisions, and knowing what to do in an emergency far from home.',
        'Have one more conversation before move-in day about your family\'s expectations and their personal safety plan. It matters more than you think. They\'re heading into an exciting chapter, and now they\'re heading in prepared.'
      ]
    },
    {
      keys: ['Steady and Ready'],
      subject: 'Steady and Ready',
      greeting: 'Hi there,',
      taker: 'have your child complete',
      paragraphs: [
        'Thank you for choosing Steady and Ready. Your child built essential emergency readiness skills in a low-pressure, supportive environment designed for how they learn best.',
        'These skills stick best with gentle repetition. Keep practicing the safety steps together at home, at their pace, and celebrate how far they have come. Thank you for trusting us with your child.'
      ]
    },
    {
      keys: ['My First Babysitters Club', 'My First Babysitters Club — Single Session'],
      subject: 'Club\'s in session',
      greeting: 'Hi there,',
      taker: 'have your child complete',
      paragraphs: [
        'Thank you for joining My First Babysitters Club. Your child started building real babysitting skills early through fun, hands-on activities: safety basics, child care know-how, and the confidence to step up and help.',
        'As they grow, Intro to Babysitting and then Safe Sitter at age 11 keep the journey going. Ask them to show you what they practiced. Kids retain so much more when they get to teach it.'
      ]
    },
    {
      keys: ['Ready. Period.'],
      subject: 'She\'s Ready. Period.',
      greeting: 'Hi there,',
      taker: 'have your child complete',
      paragraphs: [
        'Thank you for trusting us with Ready. Period. Your child learned about periods in a comfortable, straightforward setting: what to expect, how to manage supplies, and that there\'s nothing to be embarrassed about.',
        'Keep the door open at home. Kids handle this transition best when they know they can ask anything. Consider tucking a small period kit into their backpack, so they\'re ready wherever they are.'
      ]
    },
    {
      keys: ['Season Ready: Safety Skills, Fueling, and Injury Prevention for Student Athletes'],
      subject: 'Have a safe, strong season',
      greeting: 'Hi there,',
      taker: 'have your child complete',
      paragraphs: [
        'Thank you for choosing Season Ready. Your athlete covered what keeps them in the game: fueling their body well, preventing common injuries, and staying safe on and off the field.',
        'Remind them that rest and good fuel are part of training, not extras. Wishing them a healthy season. Thanks for investing in the part of sports that never shows up on the scoreboard.'
      ]
    },
    {
      keys: ['Social Ready'],
      subject: 'Socially ready',
      greeting: 'Hi there,',
      taker: 'have your child complete',
      paragraphs: [
        'Thank you for choosing Social Ready. Your child practiced staying safe online: phone safety, digital boundaries, handling group chats, and recognizing red flags before they head online.',
        'The online world moves fast. Keep the conversation going at home about what they are seeing and who they are talking to. Kids who can spot the red flags early are the safest ones in the chat.'
      ]
    },
    {
      keys: ['Girl Scouts — First Aid Badge Workshop', 'Girl Scout Badge Class'],
      subject: 'Badge work, well done',
      greeting: 'Hello,',
      taker: 'complete',
      paragraphs: [
        'Thank you for bringing your troop to our First Aid Badge Workshop. Your scouts earned real skills today: responding in an emergency, treating everyday injuries, and staying calm under pressure.',
        'Scouts who want to keep building on this love Safe Sitter, where first aid meets full babysitting training. And thank you for leading them. Troop leaders like you make these experiences possible.'
      ]
    },
    {
      keys: ['Red Cross Babysitter\'s Training + Pediatric First Aid/CPR/AED'],
      subject: 'Certified and fully trained',
      greeting: 'Hi there,',
      taker: 'have your child complete',
      paragraphs: [
        'Congratulations to your child on completing Red Cross Babysitter\'s Training plus Pediatric First Aid/CPR/AED. That\'s seven hours of serious training, and they now hold American Red Cross certification, valid for two years.',
        'This combination is the gold standard for young sitters. Encourage them to keep practicing their skills and to always trust their instincts on the job.'
      ]
    },
    {
      keys: ['Adult & Pediatric First Aid/CPR/AED Certification'],
      subject: 'You\'re certified',
      greeting: 'Hello,',
      taker: 'complete',
      paragraphs: [
        'Thank you for completing your American Red Cross Adult and Pediatric First Aid/CPR/AED certification with Mindful Beginnings. Your certification is valid for two years.',
        'The skills are in your hands now. A quick review every few months keeps you ready, and we\'ll be here when it\'s time to recertify. If you ever use these skills, we\'d love to hear the story. Our instructors live for those moments.'
      ]
    },
    {
      keys: ['Adult First Aid/CPR/AED'],
      subject: 'You\'re certified',
      greeting: 'Hello,',
      taker: 'complete',
      paragraphs: [
        'Thank you for completing your American Red Cross Adult First Aid/CPR/AED certification with Mindful Beginnings. Your certification is valid for two years.',
        'These skills matter most in the first minutes of an emergency. Give them a refresher now and then so they stay sharp. Workplaces, teams, and families are all safer when someone in the room is trained. Today, that\'s you.'
      ]
    },
    {
      keys: ['Basic Life Support'],
      subject: 'BLS complete',
      greeting: 'Hello,',
      taker: 'complete',
      paragraphs: [
        'Thank you for completing Basic Life Support with Mindful Beginnings. Your American Red Cross BLS certification is valid for two years.',
        'High-quality CPR is a perishable skill, even for professionals. Regular refreshers keep your response fast and confident. Thank you for the work you do. Skilled responders like you are why survival rates keep improving.'
      ]
    },
    {
      keys: ['Red Cross Babysitter\'s Training'],
      subject: 'Red Cross trained sitter',
      greeting: 'Hi there,',
      taker: 'have your child complete',
      paragraphs: [
        'Congratulations to your child on completing Red Cross Babysitter\'s Training. They learned the Red Cross approach to caring for children: strong leadership, smart safety decisions, and how to run a sitting job like a pro.',
        'When they\'re ready to add emergency credentials, Pediatric First Aid/CPR/AED pairs perfectly with this training. Sitters with Red Cross training stand out to families, and your child earned that edge today.'
      ]
    }
  ];

  var GENERIC = {
    subject: 'Thank you for joining us',
    greeting: 'Hi there,',
    taker: 'complete',
    paragraphs: [
      'Thank you for choosing Mindful Beginnings. We hope you or your child came home feeling confident, capable, and proud of everything accomplished.',
      'Keep practicing what you learned, skills stay sharp with use. We loved having you in class.'
    ]
  };

  function draftFor(courseName) {
    var name = String(courseName || '').trim();
    var d = GENERIC;
    for (var i = 0; i < DRAFTS.length; i++) {
      if (DRAFTS[i].keys.indexOf(name) !== -1) { d = DRAFTS[i]; break; }
    }
    // Prefix match for session titles like "Safe Sitter® (Troop 123)"
    if (d === GENERIC) {
      for (var j = 0; j < DRAFTS.length; j++) {
        var hit = false;
        for (var k = 0; k < DRAFTS[j].keys.length; k++) {
          if (name.indexOf(DRAFTS[j].keys[k]) === 0) { hit = true; break; }
        }
        if (hit) { d = DRAFTS[j]; break; }
      }
    }
    var plain = d.greeting + '\n\n' + d.paragraphs.join('\n\n') + '\n\n' +
      'Two quick asks: would you leave us a Google review (' + REVIEW_URL +
      ')? And please ' + d.taker + ' our short program evaluation (' + EVAL_URL +
      '). Your feedback keeps our classes strong.' +
      '\n\n' + SIGNOFF;
    var esc = function (t) {
      return String(t).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    };
    var htmlParas = d.paragraphs.map(function (p) { return '<p>' + esc(p) + '</p>'; }).join('');
    var htmlAsks = '<p>Two quick asks: would you leave us a <a href="' + REVIEW_URL + '">Google review</a>? ' +
      'And please ' + esc(d.taker) + ' our short <a href="' + EVAL_URL + '">program evaluation</a>. ' +
      'Your feedback keeps our classes strong.</p>';
    var htmlSign = '<p>Warmly,<br>Lindsay Karr, M.Ed. | Founder, Mindful Beginnings</p>';
    return {
      subject: d.subject,
      body: plain,
      bodyHtml: '<p>' + esc(d.greeting) + '</p>' + htmlParas + htmlAsks + htmlSign
    };
  }

  root.postCourseDraftFor = draftFor;
})(typeof window !== 'undefined' ? window : this);
