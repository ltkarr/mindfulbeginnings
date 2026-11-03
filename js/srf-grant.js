/* Safe & Ready Families grant questions and the three reporting counts.
   Wording matches the Evaluation and Follow-Up Survey Set. No email is sent
   from here. */
(function (root) {
  'use strict';

  var COURSE = 'Safe & Ready Families';
  var ORIGIN = 'https://mindfulbeginnings.org';

  var ROLES = [
    'Parent or stepparent',
    'Grandparent',
    'Other family caregiver (aunt, uncle, sibling, foster or kinship caregiver)',
    'Paid caregiver (nanny, respite worker, direct support professional)',
    'Teacher, therapist, or other professional',
    'Other'
  ];
  var CHILD_COUNTS = ['1', '2', '3 or more'];
  var CHILD_AGES = ['Under 3', '3 to 5', '6 to 10', '11 to 14', '15 to 18', '18 and over'];
  var CHILD_NEEDS = [
    'Autism',
    'Intellectual or developmental disability',
    'Down syndrome',
    'Cerebral palsy',
    'Epilepsy or seizure disorder',
    'Feeding or swallowing differences',
    'Uses a wheelchair or mobility device',
    'Nonspeaking or limited speech',
    'Other',
    'Prefer not to say'
  ];
  var PLAN_NOW = [
    'Yes, complete',
    'Partly, some pieces written down',
    'No, it is in my head'
  ];
  var HEAR = [
    'School or PTA',
    'Therapy practice',
    'Parent group or support group',
    'Social media',
    'Friend',
    'Other'
  ];
  var CONFIDENCE = [
    'Keep my child from wandering, and know what to do in the first five minutes if they do',
    'Keep my child safe around water at home and away from home',
    'Recognize choking in my child and respond, including any changes for my child\'s needs',
    'Start CPR on my child if they stopped breathing',
    'Use a picture routine or social story to teach my child a safety skill',
    'Give a first responder what they need to know about my child in thirty seconds',
    'Brief a babysitter or respite worker so I can leave with confidence'
  ];
  var OVERALL = [
    'Much more confident',
    'Somewhat more confident',
    'About the same',
    'Less confident'
  ];
  var SHEETS = [
    'Wandering Plan',
    'Water Safety Checklist',
    'Choking and CPR Quick Card',
    'Picture Routine',
    'Social Story',
    'About Me Sheet',
    'Babysitter and Respite Brief'
  ];
  var LIKERT = ['Strongly agree', 'Agree', 'Neutral', 'Disagree', 'Strongly disagree'];
  var LENGTHS = ['Too short', 'About right', 'Too long'];
  var CLASS_ROLES = [
    'Parent',
    'Grandparent',
    'Other family caregiver',
    'Paid caregiver',
    'Professional',
    'Other'
  ];
  var INTERESTS = [
    'Red Cross CPR/AED and First Aid certification',
    'Classes for my child',
    'Hosting a class for my group'
  ];
  var PLAN_LATER = [
    'Yes, both are complete',
    'Partly, one of the two is complete',
    'I started but have not finished either',
    'No, I have not started'
  ];
  var PLACES = [
    'Refrigerator',
    'Car',
    'School or bus',
    'A photo in my phone',
    'With my babysitter or respite worker',
    'Not posted yet'
  ];
  var ACTIONS = [
    'Added a door or window alarm, lock, or STOP sign',
    'Started a morning photo habit',
    'Got or updated an ID bracelet, tag, or GPS tracker',
    'Told neighbors about my child',
    'Registered with 911, Smart911, a premise alert, or a police registry',
    'Added a water barrier, alarm, or Water Watcher routine',
    'Asked about or started adaptive swim lessons',
    'Built and used a picture routine or social story',
    'Used the Babysitter and Respite Brief with a sitter, respite worker, or grandparent',
    'Took, or signed up for, a CPR certification class',
    'None of these yet'
  ];
  var MORE = { 'Much more confident': 1, 'Somewhat more confident': 1 };
  var CONSENT = 'I agree to receive a short follow-up survey by email about two months after class. My answers help Mindful Beginnings keep this class free for families.';
  var EMAIL_NOTE = 'Email address. REQUIRED. (We will send you your class reminder and two short surveys, one at class and one about two months later.)';
  var CLASS_DATE_Q = 'Which class date are you registering for? REQUIRED.';

  function isCourse(name) {
    return String(name || '').trim() === COURSE;
  }

  var ROLES_ES = [
    'Padre, madre o padrastro/madrastra',
    'Abuelo o abuela',
    'Otro cuidador familiar (tía, tío, hermano/a, cuidador de acogida o por parentesco)',
    'Cuidador pagado (niñera, cuidador de relevo, profesional de apoyo directo)',
    'Maestro/a, terapeuta u otro profesional',
    'Otro'
  ];
  var CHILD_COUNTS_ES = ['1', '2', '3 o más'];
  var CHILD_AGES_ES = ['Menos de 3', 'De 3 a 5', 'De 6 a 10', 'De 11 a 14', 'De 15 a 18', '18 o más'];
  var CHILD_NEEDS_ES = [
    'Autismo',
    'Discapacidad intelectual o del desarrollo',
    'Síndrome de Down',
    'Parálisis cerebral',
    'Epilepsia o trastorno de convulsiones',
    'Diferencias para alimentarse o tragar',
    'Usa silla de ruedas o un dispositivo de movilidad',
    'No habla o habla poco',
    'Otro',
    'Prefiero no decirlo'
  ];
  var PLAN_NOW_ES = ['Sí, completo', 'En parte, algunas piezas por escrito', 'No, está en mi cabeza'];
  var HEAR_ES = ['Escuela o PTA', 'Consultorio de terapias', 'Grupo de padres o grupo de apoyo', 'Redes sociales', 'Un amigo', 'Otro'];
  var CONFIDENCE_ES = [
    'Evitar que mi hijo se escape, y saber qué hacer en los primeros cinco minutos si se escapa',
    'Mantener a mi hijo seguro cerca del agua, en casa y fuera de casa',
    'Reconocer el atragantamiento en mi hijo y responder, incluidos los cambios para las necesidades de mi hijo',
    'Empezar la RCP en mi hijo si dejara de respirar',
    'Usar una rutina con imágenes o un cuento social para enseñar a mi hijo una habilidad de seguridad',
    'Dar a una persona de emergencias lo que necesita saber sobre mi hijo en treinta segundos',
    'Dar instrucciones a una niñera o cuidador de relevo para poder irme con confianza'
  ];
  var OVERALL_ES = ['Mucho más seguro/a', 'Algo más seguro/a', 'Casi igual', 'Menos seguro/a'];
  var SHEETS_ES = [
    'Plan si mi hijo se escapa',
    'Lista de seguridad en el agua',
    'Tarjeta rápida de atragantamiento y RCP',
    'Rutina con imágenes',
    'Cuento social',
    'Hoja «Todo sobre mí»',
    'Guía para niñeras y cuidadores de relevo'
  ];
  var LIKERT_ES = ['Totalmente de acuerdo', 'De acuerdo', 'Neutral', 'En desacuerdo', 'Totalmente en desacuerdo'];
  var LENGTHS_ES = ['Muy corta', 'Adecuada', 'Muy larga'];
  var CLASS_ROLES_ES = ['Padre/madre', 'Abuelo/a', 'Otro cuidador familiar', 'Cuidador pagado', 'Profesional', 'Otro'];
  var INTERESTS_ES = [
    'Certificación de RCP/AED y Primeros Auxilios de la Cruz Roja',
    'Clases para mi hijo',
    'Organizar una clase para mi grupo'
  ];
  var PLAN_LATER_ES = [
    'Sí, ambos están completos',
    'En parte, uno de los dos está completo',
    'Empecé pero no he terminado ninguno',
    'No, no he empezado'
  ];
  var PLACES_ES = [
    'Refrigerador',
    'Automóvil',
    'Escuela o autobús escolar',
    'Una foto en mi teléfono',
    'Con mi niñera o cuidador de relevo',
    'Todavía no está colocada'
  ];
  var ACTIONS_ES = [
    'Agregué una alarma, una cerradura o un letrero de ALTO (STOP) en una puerta o ventana',
    'Empecé el hábito de la foto cada mañana',
    'Conseguí o actualicé una pulsera de identificación, una etiqueta o un rastreador GPS',
    'Conté a los vecinos sobre mi hijo',
    'Me registré en 911, Smart911, una alerta de domicilio o un registro de la policía',
    'Agregué una barrera para el agua, una alarma o una rutina de Vigilante del Agua',
    'Pregunté por las clases de natación adaptadas o las empecé',
    'Creé y usé una rutina con imágenes o un cuento social',
    'Usé la Guía para niñeras y cuidadores de relevo con una niñera, un cuidador de relevo o un abuelo',
    'Tomé una clase de certificación de RCP, o me inscribí en una',
    'Ninguna de estas todavía'
  ];
  var YES_NO_ES = ['Sí', 'No'];
  var CONSENT_ES = 'Acepto recibir por correo electrónico una breve encuesta de seguimiento unos dos meses después de la clase. Mis respuestas ayudan a Mindful Beginnings a mantener esta clase gratuita para las familias.';
  var EMAIL_NOTE_ES = 'Correo electrónico. OBLIGATORIO. (Le enviaremos el recordatorio de su clase y dos encuestas breves, una en la clase y otra unos dos meses después.)';
  var CLASS_DATE_ES = '¿Para qué fecha de clase se está registrando? OBLIGATORIO.';
  var TO_EN = { 'Sí': 'Yes', 'No, gracias': 'No thanks' };
  function remember(values, labels) {
    labels.forEach(function (label, i) { TO_EN[label] = values[i]; });
  }
  remember(ROLES, ROLES_ES);
  remember(CHILD_COUNTS, CHILD_COUNTS_ES);
  remember(CHILD_AGES, CHILD_AGES_ES);
  remember(CHILD_NEEDS, CHILD_NEEDS_ES);
  remember(PLAN_NOW, PLAN_NOW_ES);
  remember(HEAR, HEAR_ES);
  remember(OVERALL, OVERALL_ES);
  remember(SHEETS, SHEETS_ES);
  remember(LIKERT, LIKERT_ES);
  remember(LENGTHS, LENGTHS_ES);
  remember(CLASS_ROLES, CLASS_ROLES_ES);
  remember(INTERESTS, INTERESTS_ES);
  remember(PLAN_LATER, PLAN_LATER_ES);
  remember(PLACES, PLACES_ES);
  remember(ACTIONS, ACTIONS_ES);
  TO_EN['Sí, aquí está'] = 'Yes';

  function isLang(lang) { return lang === 'es' ? 'es' : 'en'; }

  function pairs(values, labels) {
    return values.map(function (v, i) { return { value: v, label: labels ? labels[i] : v }; });
  }

  function surveyUrl(part, code, lang) {
    var page = part === 'C' ? '/grant-followup.html' : '/grant-class-survey.html';
    var url = ORIGIN + page;
    var c = String(code || '').trim();
    var q = [];
    if (c) q.push('code=' + encodeURIComponent(c));
    if (isLang(lang) === 'es') q.push('lang=es');
    if (q.length) url += '?' + q.join('&');
    return url;
  }

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function optValue(opt) { return opt && typeof opt === 'object' ? opt.value : opt; }
  function optLabel(opt) { return opt && typeof opt === 'object' ? opt.label : opt; }

  function radios(name, options, required) {
    return '<div class="choice-list"' + (required ? ' data-required="1"' : '') + '>' +
      options.map(function (opt, i) {
        return '<label class="choice-line"><input type="radio" name="' + name + '" value="' + esc(optValue(opt)) + '"' +
          (required && i === 0 ? ' required' : '') + '> <span>' + esc(optLabel(opt)) + '</span></label>';
      }).join('') + '</div>';
  }

  function checks(name, options) {
    return '<div class="check-group">' + options.map(function (opt) {
      return '<label class="check-line"><input type="checkbox" name="' + name + '" value="' + esc(optValue(opt)) + '"> <span>' + esc(optLabel(opt)) + '</span></label>';
    }).join('') + '</div>';
  }

  function scale(name) {
    var bits = '';
    for (var n = 1; n <= 5; n++) {
      bits += '<label><input type="radio" name="' + name + '" value="' + n + '"><span class="rate">' + n + '</span></label>';
    }
    return '<div class="rate-group">' + bits + '</div>';
  }

  function field(label, inner) {
    return '<div class="eval-field"><label class="eval-legend">' + label + '</label>' + inner + '</div>';
  }

  function textInput(name, placeholder) {
    return '<input type="text" name="' + name + '" placeholder="' + esc(placeholder || '') + '">';
  }

  function registrationHtml(lang) {
    var es = isLang(lang) === 'es';
    return '<h2>' + (es ? 'Preguntas de registro' : 'Grant registration questions') + '</h2>' +
      '<p class="eval-note">' + (es
        ? 'Su nombre, correo electrónico, teléfono móvil y la fecha de la clase son los campos de arriba.'
        : 'Your name, email, mobile phone, and class date are the fields above.') + '</p>' +
      '<p class="eval-note" id="srf-class-date">' + esc(es ? CLASS_DATE_ES : CLASS_DATE_Q) + '</p>' +
      field(es ? '¿Qué describe mejor su caso? OBLIGATORIO. Elija una.' : 'Which best describes you? REQUIRED. Choose one.', radios('srf-role', pairs(ROLES, es ? ROLES_ES : null), true) + textInput('srf-role-other', es ? 'Otro' : 'Other')) +
      field(es ? '¿A cuántos niños con una discapacidad cuida? (1, 2, 3 o más)' : 'How many children with a disability do you care for? (1, 2, 3 or more)', radios('srf-count', pairs(CHILD_COUNTS, es ? CHILD_COUNTS_ES : null), false)) +
      field(es ? 'Edad del niño o los niños para quienes está planificando. Marque todo lo que aplica.' : 'Age of the child or children you are planning for. Check all that apply.', checks('srf-ages', pairs(CHILD_AGES, es ? CHILD_AGES_ES : null))) +
      field(es ? '¿Cuáles de estas describen a su hijo? Marque todo lo que aplica.' : 'Which of these describe your child? Check all that apply.', checks('srf-needs', pairs(CHILD_NEEDS, es ? CHILD_NEEDS_ES : null)) + textInput('srf-needs-other', es ? 'Otro' : 'Other')) +
      field(es ? '¿Tiene actualmente un plan de seguridad por escrito para su hijo que otro adulto podría seguir? OBLIGATORIO.' : 'Do you currently have a written safety plan for your child that another adult could follow? REQUIRED.', radios('srf-plan', pairs(PLAN_NOW, es ? PLAN_NOW_ES : null), true)) +
      field(es ? '¿Cuál es la única preocupación de seguridad que más quiere que esta clase atienda? (Respuesta breve.)' : 'What is the one safety worry you most want this class to address? (Short answer.)', '<textarea name="srf-worry"></textarea>') +
      field((es ? 'Consentimiento. OBLIGATORIO. «' : 'Consent. REQUIRED. "') + esc(es ? CONSENT_ES : CONSENT) + (es ? '»' : '"'), radios('srf-consent', pairs(['Yes', 'No'], es ? YES_NO_ES : null), true)) +
      field(es ? '¿Necesita alguna adaptación para participar (asiento, movilidad, idioma, una pregunta sobre el cuidado de niños)? (Respuesta breve.)' : 'Do you need any accommodations to participate (seating, mobility, language, childcare question)? (Short answer.)', '<textarea name="srf-access"></textarea>') +
      field(es ? '¿Cómo se enteró de esta clase?' : 'How did you hear about this class?', radios('srf-hear', pairs(HEAR, es ? HEAR_ES : null), false) + textInput('srf-hear-other', es ? 'Otro' : 'Other'));
  }

  function classSurveyHtml(session, lang) {
    var es = isLang(lang) === 'es';
    var when = session && session.date ? session.date : '';
    var lines = es ? CONFIDENCE_ES : CONFIDENCE;
    var rows = lines.map(function (line, i) {
      return '<div class="conf-row"><p>' + esc(line) + '</p>' +
        '<div><span class="conf-label">' + (es ? 'Antes de hoy' : 'Before today') + '</span>' + scale('srf-before-' + i) + '</div>' +
        '<div><span class="conf-label">' + (es ? 'Ahora' : 'Now') + '</span>' + scale('srf-now-' + i) + '</div></div>';
    }).join('');
    return '<p class="eval-note">' + (es
      ? 'Para cada afirmación, encierre en un círculo un número de cómo se sentía ANTES de hoy, y uno de cómo se siente AHORA. 1 = nada seguro/a, 5 = muy seguro/a.'
      : 'For each statement, choose one number for how you felt BEFORE today, and one for how you feel NOW. 1 = not at all confident, 5 = very confident.') + '</p>' +
      field(es ? 'Su correo electrónico (para unirlo con su seguimiento)' : 'Your email (so we can match this with your follow-up)', '<input type="email" name="srf-email" required>') +
      field(es ? 'Fecha de la clase' : 'Class date', '<input type="date" name="srf-date" value="' + esc(when) + '">') +
      field(es ? 'Instructor/a' : 'Instructor', textInput('srf-instructor', '')) +
      '<h2>' + (es ? 'Sección 1 · Confianza, antes y ahora' : 'Section 1 · Confidence, before and now') + '</h2>' +
      '<p class="eval-note">' + (es ? 'Me siento seguro/a de que puedo…' : 'I feel confident that I can...') + '</p>' + rows +
      field(es ? 'En general, comparado con antes de hoy, me siento: (encierre una opción)' : 'Overall, compared to before today, I feel: (choose one)', radios('srf-overall', pairs(OVERALL, es ? OVERALL_ES : null), true)) +
      '<h2>' + (es ? 'Sección 2 · Lo que hizo hoy' : 'Section 2 · What you did today') + '</h2>' +
      field(es ? '¿Qué hojas del kit empezó o terminó en clase? Marque todo lo que aplica.' : 'Which toolkit sheets did you start or finish in class? Check all that apply.', checks('srf-sheets', pairs(SHEETS, es ? SHEETS_ES : null))) +
      field(es ? '¿Cuál UNA hoja terminará esta noche?' : 'Which ONE sheet will you finish tonight?', textInput('srf-tonight', '')) +
      '<h2>' + (es ? 'Sección 3 · La clase' : 'Section 3 · The class') + '</h2>' +
      field(es ? 'El instructor o la instructora explicó las cosas con claridad:' : 'The instructor explained things clearly:', radios('srf-clear', pairs(LIKERT, es ? LIKERT_ES : null), false)) +
      field(es ? 'La práctica práctica fue útil:' : 'The hands-on practice was useful:', radios('srf-hands', pairs(LIKERT, es ? LIKERT_ES : null), false)) +
      field(es ? 'La clase respetó a mi hijo y a mi familia:' : 'The class respected my child and my family:', radios('srf-respect', pairs(LIKERT, es ? LIKERT_ES : null), false)) +
      field(es ? 'La duración (2.5 horas) fue:' : 'The length (2.5 hours) was:', radios('srf-length', pairs(LENGTHS, es ? LENGTHS_ES : null), false)) +
      field(es ? 'Recomendaría esta clase a otra familia:' : 'I would recommend this class to another family:', radios('srf-recommend', pairs(['Yes', 'No'], es ? YES_NO_ES : null), false)) +
      field(es ? 'La parte más útil de hoy fue:' : 'The most useful part of today was:', '<textarea name="srf-useful"></textarea>') +
      field(es ? 'Una cosa que desearía que hubiéramos cubierto:' : 'One thing I wish we had covered:', '<textarea name="srf-wish"></textarea>') +
      field(es ? 'Algo más que quiera que sepamos:' : 'Anything else you want us to know:', '<textarea name="srf-else"></textarea>') +
      '<h2>' + (es ? 'Sección 4 · Sobre usted (solo para el informe)' : 'Section 4 · About you (for reporting only)') + '</h2>' +
      field(es ? 'Soy:' : 'I am a:', radios('srf-who', pairs(CLASS_ROLES, es ? CLASS_ROLES_ES : null), false)) +
      field(es ? 'Me interesa:' : 'I am interested in:', checks('srf-interest', pairs(INTERESTS, es ? INTERESTS_ES : null))) +
      '<p class="eval-note">' + (es
        ? 'Gracias. Revise su correo en unos dos meses para un seguimiento de dos minutos. Su respuesta a esa encuesta es lo que mantiene esta clase gratuita.'
        : 'Thank you. Watch your email in about two months for a two-minute follow-up. Your answer to that survey is what keeps this class free.') + '</p>';
  }

  function followupHtml(lang) {
    var es = isLang(lang) === 'es';
    return field(es ? 'Su correo electrónico' : 'Your email', '<input type="email" name="srf-email" required>') +
      field(es ? '¿A qué fecha de clase asistió?' : 'Which class date did you attend?', '<input type="date" name="srf-date">') +
      '<h2>' + (es ? 'Sección 1 · Su plan de seguridad por escrito' : 'Section 1 · Your written safety plan') + '</h2>' +
      field(es
        ? 'Desde la clase, ¿ha completado un plan de seguridad por escrito para su hijo? Por «plan por escrito» queremos decir al menos la hoja «Todo sobre mí» y el Plan si mi hijo se escapa, completados en papel o en su teléfono, donde otro adulto podría encontrarlos y seguirlos. OBLIGATORIO.'
        : 'Since the class, have you completed a written safety plan for your child? By "written plan" we mean at least the About Me Sheet and the Wandering Plan filled in on paper or on your phone, where another adult could find and follow them. REQUIRED.',
        radios('srf-plan', pairs(PLAN_LATER, es ? PLAN_LATER_ES : null), true)) +
      field(es ? '¿Qué hojas del kit están ahora completas? Marque todo lo que aplica.' : 'Which toolkit sheets are now complete? Check all that apply.', checks('srf-sheets', pairs(SHEETS, es ? SHEETS_ES : null))) +
      field(es ? '¿Dónde vive ahora una copia de su hoja «Todo sobre mí»? Marque todo lo que aplica.' : 'Where does a copy of your About Me Sheet live now? Check all that apply.', checks('srf-places', pairs(PLACES, es ? PLACES_ES : null))) +
      field(es ? 'Si no ha terminado, ¿qué se lo impidió? (Respuesta breve, opcional.)' : 'If you have not finished, what got in the way? (Short answer, optional.)', '<textarea name="srf-barrier"></textarea>') +
      '<h2>' + (es ? 'Sección 2 · Lo que cambió en casa' : 'Section 2 · What changed at home') + '</h2>' +
      field(es ? 'Desde la clase, ¿cuáles de estas cosas ha hecho? Marque todo lo que aplica.' : 'Since the class, which of these have you done? Check all that apply.', checks('srf-actions', pairs(ACTIONS, es ? ACTIONS_ES : null))) +
      field(es ? '¿Ha tenido que usar algo de la clase en una situación real?' : 'Have you had to use anything from the class in a real situation?', radios('srf-used', pairs(['Yes', 'No'], es ? YES_NO_ES : null), false) +
        '<textarea name="srf-used-detail" placeholder="' + esc(es ? 'Si es así, cuéntenos qué pasó, con tanto o tan poco detalle como quiera.' : 'If yes, tell us what happened, in as much or as little detail as you want.') + '"></textarea>') +
      '<h2>' + (es ? 'Sección 3 · Su confianza hoy' : 'Section 3 · Confidence today') + '</h2>' +
      field(es ? 'Hoy, ¿qué tan seguro/a se siente de poder mantener a su hijo a salvo y responder en una emergencia? (1 = nada seguro/a, 5 = muy seguro/a)' : 'Today, how confident do you feel that you could keep your child safe and respond in an emergency? (1 = not at all confident, 5 = very confident)', scale('srf-confidence')) +
      field(es ? 'Comparado con antes de la clase, me siento:' : 'Compared to before the class, I feel:', radios('srf-compared', pairs(OVERALL, es ? OVERALL_ES : null), false)) +
      '<h2>' + (es ? 'Sección 4 · Una cosa más' : 'Section 4 · One more thing') + '</h2>' +
      field(es ? '¿Estaría dispuesto/a a compartir una o dos frases que podamos usar, de forma anónima, para ayudar a mantener esta clase gratuita para otras familias?' : 'Would you be willing to share a sentence or two we can use, anonymously, to help keep this class free for other families?',
        radios('srf-quote', pairs(['Yes', 'No thanks'], es ? ['Sí, aquí está', 'No, gracias'] : null), false) + '<textarea name="srf-quote-text" placeholder="' + esc(es ? 'Sí, aquí está' : 'Yes, here it is') + '"></textarea>') +
      field(es ? '¿Quiere que le contactemos sobre una clase de seguimiento, una clase de certificación de RCP o una clase para su hijo?' : 'Would you like to be contacted about a follow-up class, a CPR certification class, or a class for your child?', radios('srf-contact', pairs(['Yes', 'No'], es ? YES_NO_ES : null), false)) +
      '<p class="eval-note">' + (es
        ? 'Gracias. Sus dos minutos cuentan para el informe que financia esta clase.'
        : 'Thank you. Your two minutes count toward the report that funds this class.') + '</p>';
  }

  function checked(form, name) {
    return Array.prototype.map.call(form.querySelectorAll('input[name="' + name + '"]:checked'), function (el) {
      return el.value;
    });
  }

  function one(form, name) {
    var el = form.querySelector('input[name="' + name + '"]:checked');
    return el ? el.value : '';
  }

  function val(form, name) {
    var el = form.querySelector('[name="' + name + '"]');
    return el ? String(el.value || '').trim() : '';
  }

  function formLang(form) {
    if (!form) return 'en';
    if (form.getAttribute && form.getAttribute('data-lang') === 'es') return 'es';
    if (form.closest) {
      var box = form.closest('[data-lang]');
      if (box && box.getAttribute('data-lang') === 'es') return 'es';
    }
    return 'en';
  }

  function say(form, en, es) {
    return { ok: false, error: formLang(form) === 'es' ? es : en };
  }

  function readRegistration(form) {
    var role = one(form, 'srf-role');
    var plan = one(form, 'srf-plan');
    var consent = one(form, 'srf-consent');
    if (!role) return say(form, 'Please choose which best describes you.', 'Elija qué describe mejor su caso.');
    if (role === 'Other' && !val(form, 'srf-role-other')) return say(form, 'Please tell us the other way that describes you.', 'Escriba la otra forma que lo describe.');
    if (!plan) return say(form, 'Please answer whether you have a written safety plan.', 'Responda si tiene un plan de seguridad por escrito.');
    if (consent !== 'Yes' && consent !== 'No') return say(form, 'Please answer the follow-up survey consent question.', 'Responda la pregunta de consentimiento para la encuesta de seguimiento.');
    return {
      ok: true,
      answers: {
        role: role,
        role_other: val(form, 'srf-role-other'),
        child_count: one(form, 'srf-count'),
        child_ages: checked(form, 'srf-ages'),
        child_needs: checked(form, 'srf-needs'),
        child_needs_other: val(form, 'srf-needs-other'),
        written_plan: plan,
        safety_worry: val(form, 'srf-worry'),
        followup_consent: consent,
        accommodations: val(form, 'srf-access'),
        hear_about: one(form, 'srf-hear'),
        hear_about_other: val(form, 'srf-hear-other'),
        lang: formLang(form)
      }
    };
  }

  function readScales(form, prefix) {
    var out = [];
    for (var i = 0; i < CONFIDENCE.length; i++) {
      var n = Number(one(form, prefix + i));
      out.push(n >= 1 && n <= 5 ? n : null);
    }
    return out;
  }

  function readClassSurvey(form) {
    var email = val(form, 'srf-email').toLowerCase();
    var overall = one(form, 'srf-overall');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return say(form, 'Please enter the email you used to register.', 'Escriba el correo electrónico que usó para inscribirse.');
    if (!overall) return say(form, 'Please answer how you feel compared to before today.', 'Responda cómo se siente comparado con antes de hoy.');
    var before = readScales(form, 'srf-before-');
    var now = readScales(form, 'srf-now-');
    for (var i = 0; i < CONFIDENCE.length; i++) {
      if (before[i] == null || now[i] == null) {
        return say(form, 'Please choose a before and a now number for every statement.', 'Elija un número de antes y uno de ahora para cada afirmación.');
      }
    }
    return {
      ok: true,
      answers: {
        email: email,
        class_date: val(form, 'srf-date'),
        instructor: val(form, 'srf-instructor'),
        statements: CONFIDENCE.map(function (line, i) {
          return { statement: line, before: before[i], now: now[i] };
        }),
        overall: overall,
        sheets: checked(form, 'srf-sheets'),
        sheet_tonight: val(form, 'srf-tonight'),
        instructor_clear: one(form, 'srf-clear'),
        hands_on: one(form, 'srf-hands'),
        respected: one(form, 'srf-respect'),
        length: one(form, 'srf-length'),
        recommend: one(form, 'srf-recommend'),
        most_useful: val(form, 'srf-useful'),
        wish_covered: val(form, 'srf-wish'),
        anything_else: val(form, 'srf-else'),
        role: one(form, 'srf-who'),
        interested: checked(form, 'srf-interest'),
        lang: formLang(form)
      }
    };
  }

  function readFollowup(form) {
    var email = val(form, 'srf-email').toLowerCase();
    var plan = one(form, 'srf-plan');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return say(form, 'Please enter the email you used to register.', 'Escriba el correo electrónico que usó para inscribirse.');
    if (!plan) return say(form, 'Please answer whether you completed a written safety plan.', 'Responda si completó un plan de seguridad por escrito.');
    var conf = Number(one(form, 'srf-confidence'));
    return {
      ok: true,
      answers: {
        email: email,
        class_date: val(form, 'srf-date'),
        plan: plan,
        sheets: checked(form, 'srf-sheets'),
        about_me_places: checked(form, 'srf-places'),
        barrier: val(form, 'srf-barrier'),
        actions: checked(form, 'srf-actions'),
        used_real: one(form, 'srf-used'),
        used_real_detail: val(form, 'srf-used-detail'),
        confidence: conf >= 1 && conf <= 5 ? conf : null,
        compared: one(form, 'srf-compared'),
        share_quote: one(form, 'srf-quote'),
        quote: val(form, 'srf-quote-text'),
        contact_ok: one(form, 'srf-contact'),
        lang: formLang(form)
      }
    };
  }

  function asText(raw, max) {
    var s = String(raw == null ? '' : raw).replace(/\u0000/g, '').trim();
    return s.length > max ? s.slice(0, max) : s;
  }

  function asOne(raw, allowed) {
    var s = asText(raw, 400);
    if (allowed.indexOf(s) >= 0) return s;
    if (TO_EN[s] && allowed.indexOf(TO_EN[s]) >= 0) return TO_EN[s];
    return '';
  }

  function asList(raw, allowed) {
    if (!Array.isArray(raw)) return [];
    var out = [];
    raw.forEach(function (v) {
      var s = asOne(v, allowed);
      if (s && out.indexOf(s) < 0) out.push(s);
    });
    return out;
  }

  function asEmail(raw) {
    var s = asText(raw, 160).toLowerCase();
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(s) ? s : '';
  }

  function asScale(raw) {
    var n = Number(raw);
    return n >= 1 && n <= 5 && n === Math.floor(n) ? n : null;
  }

  function accept(part, raw, lang) {
    raw = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw : {};
    var es = isLang(lang) === 'es' || raw.lang === 'es';
    function fail(en, sp) { return { ok: false, error: es ? sp : en }; }
    if (part === 'A') {
      var role = asOne(raw.role, ROLES);
      var plan = asOne(raw.written_plan, PLAN_NOW);
      var consent = asOne(raw.followup_consent, ['Yes', 'No']);
      var roleOther = asText(raw.role_other, 160);
      if (!role) return fail('Please choose which best describes you.', 'Elija qué describe mejor su caso.');
      if (role === 'Other' && !roleOther) return fail('Please tell us the other way that describes you.', 'Escriba la otra forma que lo describe.');
      if (!plan) return fail('Please answer whether you have a written safety plan.', 'Responda si tiene un plan de seguridad por escrito.');
      if (!consent) return fail('Please answer the follow-up survey consent question.', 'Responda la pregunta de consentimiento para la encuesta de seguimiento.');
      return {
        ok: true,
        answers: {
          role: role,
          role_other: role === 'Other' ? roleOther : '',
          child_count: asOne(raw.child_count, CHILD_COUNTS),
          child_ages: asList(raw.child_ages, CHILD_AGES),
          child_needs: asList(raw.child_needs, CHILD_NEEDS),
          child_needs_other: asText(raw.child_needs_other, 160),
          written_plan: plan,
          safety_worry: asText(raw.safety_worry, 2000),
          followup_consent: consent,
          accommodations: asText(raw.accommodations, 2000),
          hear_about: asOne(raw.hear_about, HEAR),
          hear_about_other: asText(raw.hear_about_other, 160),
          lang: es ? 'es' : 'en'
        }
      };
    }
    if (part === 'B') {
      var email = asEmail(raw.email);
      var overall = asOne(raw.overall, OVERALL);
      if (!email) return fail('Please enter the email you used to register.', 'Escriba el correo electrónico que usó para inscribirse.');
      if (!overall) return fail('Please answer how you feel compared to before today.', 'Responda cómo se siente comparado con antes de hoy.');
      var given = Array.isArray(raw.statements) ? raw.statements : [];
      var missingScale = false;
      var statements = CONFIDENCE.map(function (line, i) {
        var src = given[i] || {};
        var before = asScale(src.before);
        var now = asScale(src.now);
        if (before == null || now == null) missingScale = true;
        return { statement: line, before: before, now: now };
      });
      if (missingScale) return fail('Please choose a before and a now number for every statement.', 'Elija un número de antes y uno de ahora para cada afirmación.');
      return {
        ok: true,
        answers: {
          email: email,
          class_date: asText(raw.class_date, 10),
          instructor: asText(raw.instructor, 160),
          statements: statements,
          overall: overall,
          sheets: asList(raw.sheets, SHEETS),
          sheet_tonight: asText(raw.sheet_tonight, 160),
          instructor_clear: asOne(raw.instructor_clear, LIKERT),
          hands_on: asOne(raw.hands_on, LIKERT),
          respected: asOne(raw.respected, LIKERT),
          length: asOne(raw.length, LENGTHS),
          recommend: asOne(raw.recommend, ['Yes', 'No']),
          most_useful: asText(raw.most_useful, 2000),
          wish_covered: asText(raw.wish_covered, 2000),
          anything_else: asText(raw.anything_else, 2000),
          role: asOne(raw.role, CLASS_ROLES),
          interested: asList(raw.interested, INTERESTS),
          lang: es ? 'es' : 'en'
        }
      };
    }
    if (part === 'C') {
      var followEmail = asEmail(raw.email);
      var later = asOne(raw.plan, PLAN_LATER);
      if (!followEmail) return fail('Please enter the email you used to register.', 'Escriba el correo electrónico que usó para inscribirse.');
      if (!later) return fail('Please answer whether you completed a written safety plan.', 'Responda si completó un plan de seguridad por escrito.');
      return {
        ok: true,
        answers: {
          email: followEmail,
          class_date: asText(raw.class_date, 10),
          plan: later,
          sheets: asList(raw.sheets, SHEETS),
          about_me_places: asList(raw.about_me_places, PLACES),
          barrier: asText(raw.barrier, 2000),
          actions: asList(raw.actions, ACTIONS),
          used_real: asOne(raw.used_real, ['Yes', 'No']),
          used_real_detail: asText(raw.used_real_detail, 2000),
          confidence: asScale(raw.confidence),
          compared: asOne(raw.compared, OVERALL),
          share_quote: asOne(raw.share_quote, ['Yes', 'No thanks']),
          quote: asText(raw.quote, 2000),
        contact_ok: asOne(raw.contact_ok, ['Yes', 'No']),
        lang: es ? 'es' : 'en'
      }
    };
  }
    return fail('Unknown survey.', 'Encuesta desconocida.');
  }

  function pct(part, whole) {
    if (!whole) return null;
    return Math.round((part / whole) * 1000) / 10;
  }

  function report(rows) {
    var list = rows || [];
    var a = list.filter(function (r) { return r && r.part === 'A'; });
    var b = list.filter(function (r) { return r && r.part === 'B' && r.answers && r.answers.overall; });
    var c = list.filter(function (r) { return r && r.part === 'C' && r.answers && r.answers.plan; });
    var byRole = {};
    a.forEach(function (r) {
      var role = (r.answers && r.answers.role) || 'Not answered';
      if (role === 'Other' && r.answers && r.answers.role_other) role = 'Other: ' + r.answers.role_other;
      byRole[role] = (byRole[role] || 0) + 1;
    });
    var more = b.filter(function (r) { return MORE[r.answers.overall]; }).length;
    var plans = c.filter(function (r) { return r.answers.plan === 'Yes, both are complete'; }).length;
    return {
      served: a.length,
      byRole: byRole,
      confidenceResponses: b.length,
      moreConfident: more,
      moreConfidentPct: pct(more, b.length),
      planResponses: c.length,
      writtenPlan: plans,
      writtenPlanPct: pct(plans, c.length)
    };
  }

  function csvCell(v) {
    var s = v == null ? '' : String(v);
    if (/[",\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  function csv(rows) {
    var summary = report(rows);
    var lines = [
      ['metric', 'value'].map(csvCell).join(','),
      ['Participants served', summary.served].map(csvCell).join(',')
    ];
    Object.keys(summary.byRole).sort().forEach(function (role) {
      lines.push(['Participants served: ' + role, summary.byRole[role]].map(csvCell).join(','));
    });
    lines.push(['Percent reporting more confidence', summary.moreConfidentPct == null ? '' : summary.moreConfidentPct].map(csvCell).join(','));
    lines.push(['More confident responses', summary.moreConfident].map(csvCell).join(','));
    lines.push(['Class-day responses', summary.confidenceResponses].map(csvCell).join(','));
    lines.push(['Percent completing a written safety plan', summary.writtenPlanPct == null ? '' : summary.writtenPlanPct].map(csvCell).join(','));
    lines.push(['Written plans complete', summary.writtenPlan].map(csvCell).join(','));
    lines.push(['Follow-up responses', summary.planResponses].map(csvCell).join(','));
    lines.push('');
    lines.push(['part', 'session_code', 'session_date', 'email', 'role', 'followup_consent', 'overall', 'plan'].map(csvCell).join(','));
    (rows || []).forEach(function (r) {
      var ans = r.answers || {};
      lines.push([
        r.part, r.session_code, r.session_date, r.email || ans.email,
        ans.role, ans.followup_consent, ans.overall || ans.compared, ans.plan || ans.written_plan
      ].map(csvCell).join(','));
    });
    return lines.join('\n');
  }

  function keep(el, attr, current) {
    if (!el) return '';
    if (!el.hasAttribute(attr)) el.setAttribute(attr, current());
    return el.getAttribute(attr);
  }

  function putText(el, es, spanish) {
    if (!el) return;
    var original = keep(el, 'data-srf-en', function () { return el.textContent; });
    el.textContent = es ? spanish : original;
  }

  function putHtml(el, es, spanish) {
    if (!el) return;
    var original = keep(el, 'data-srf-en', function () { return el.innerHTML; });
    el.innerHTML = es ? spanish : original;
  }

  function applyPage(doc, lang) {
    var es = isLang(lang) === 'es';
    if (doc.documentElement) doc.documentElement.lang = es ? 'es' : 'en';
    putText(doc.querySelector('.hero h1'), es, 'Inscripción');
    putText(doc.getElementById('step2') && doc.getElementById('step2').querySelector('.step-label'), es, 'Sus datos');
    putText(doc.getElementById('step3') && doc.getElementById('step3').querySelector('.step-label'), es, 'Pago');
    putText(doc.getElementById('step4') && doc.getElementById('step4').querySelector('.step-label'), es, 'Confirmado');
    putText(doc.querySelector('#trust-box .trust-title'), es, 'Antes de continuar');
    var trustPs = doc.querySelectorAll('#trust-box p');
    putHtml(trustPs[0], es, '<strong>Privacidad.</strong> Usamos su información solo para organizar esta clase y comunicarnos con usted sobre ella. No vendemos sus datos.');
    putHtml(trustPs[1], es, '<strong>Pago.</strong> Después de reservar, puede pagar con tarjeta o PayPal, Venmo o Zelle. El monto exacto se muestra antes de pagar.');
    putHtml(trustPs[2], es, '<strong>Reembolsos y cancelaciones.</strong> Las ventas son finales, pero puede transferir su lugar a otra persona. Si cancelamos por baja inscripción, recibe un reembolso completo con al menos cinco días de aviso. Los términos completos están en el acuerdo de abajo.');
    putText(doc.getElementById('student-section-title'), es, 'Su información');
    putText(doc.getElementById('fname-label'), es, 'Nombre *');
    putText(doc.getElementById('lname-label'), es, 'Apellido *');
    putText(doc.getElementById('guardian-title'), es, 'Su información de contacto');
    putText(doc.getElementById('guardian-name-label'), es, 'Nombre completo *');
    var emailLabel = doc.querySelector('label[for="p-email"]') || doc.querySelector('#p-email') && doc.querySelector('#p-email').previousElementSibling;
    putText(emailLabel, es, 'Correo electrónico *');
    var phoneLabel = doc.querySelector('#p-phone') && doc.querySelector('#p-phone').previousElementSibling;
    putText(phoneLabel, es, 'Teléfono móvil *');
    putText(doc.getElementById('signature-label'), es, 'Su nombre completo (firma electrónica) *');
    putHtml(doc.getElementById('terms-grandparent'), es, '<p><strong>Asistencia y puntualidad.</strong> Entiendo la importancia de asistir a todas las sesiones y llegar a tiempo.</p><p><strong>Reconocimiento de riesgo y exención de responsabilidad.</strong> Reconozco que puede haber un riesgo de lesión en las actividades del curso. Acepto eximir de responsabilidad e indemnizar a Safe Sitter, Inc. y a Mindful Beginnings y a su personal de toda reclamación que surja de mi participación en este programa.</p><p><strong>Puedo participar de forma segura.</strong> Confirmo que puedo participar de forma segura en el programa.</p>');
    putHtml(doc.getElementById('terms-refund'), es, '<strong>Política de reembolso y transferencia.</strong> Todas las ventas son finales. Si un participante no puede asistir, puede transferir la inscripción a otro estudiante. Escriba a lindsay@mindfulbeginnings.org con el nombre del nuevo participante. Cualquier arreglo de pago por el lugar debe hacerse directamente entre las partes.');
    putHtml(doc.getElementById('terms-cancel'), es, '<strong>Cancelaciones del curso.</strong> Mindful Beginnings se reserva el derecho de cancelar cualquier curso que no alcance su inscripción mínima. Si un curso se cancela por baja inscripción, las familias inscritas serán avisadas al menos cinco (5) días antes de la fecha y recibirán un reembolso completo.');
    putHtml(doc.getElementById('waiver-cpr-notice'), es, '<strong>Tenga en cuenta:</strong> Cuéntele al instructor o a la coordinadora del lugar cualquier cosa que ayude a su hijo a participar.');
    var perm = doc.getElementById('permissions-section');
    if (perm) {
      putText(perm.querySelector('.perm-title'), es, 'Práctica con maniquí de RCP');
      var titles = perm.querySelectorAll('.perm-title');
      putText(titles[1], es, 'Atención médica de emergencia');
      var descs = perm.querySelectorAll('.perm-desc');
      putText(descs[0], es, 'Este curso incluye práctica de habilidades de rescate en maniquíes de RCP. Los maniquíes requieren normas estrictas para controlar infecciones. ¿Da permiso para que su hijo practique en los maniquíes?');
      putText(descs[1], es, 'En caso de una emergencia de salud, ¿autoriza al instructor a buscar atención de emergencia para su hijo?');
      var choices = perm.querySelectorAll('.radio-lbl');
      [ [' Sí, doy permiso', ' Yes, I give permission'],
        [' No, no doy permiso', ' No, I do not give permission'],
        [' Sí, autorizo atención de emergencia', ' Yes, I authorize emergency care'],
        [' No, no autorizo', ' No, I do not authorize']
      ].forEach(function (pair, i) {
        var label = choices[i];
        if (!label || !label.childNodes[1]) return;
        var node = label.childNodes[1];
        if (!label.getAttribute('data-srf-en')) label.setAttribute('data-srf-en', node.textContent);
        node.textContent = es ? pair[0] : label.getAttribute('data-srf-en');
      });
    }
    var agree = doc.querySelector('#agree-all-box .chk-title');
    putText(agree, es, 'He leído y acepto todos los términos de arriba *');
    var agreeSub = doc.querySelector('#agree-all-box .chk-sub');
    putText(agreeSub, es, 'Obligatorio para continuar. Su firma escrita abajo confirma este acuerdo.');
    var photoTitle = doc.querySelector('#photo-consent-box .chk-title');
    putText(photoTitle, es, 'Consentimiento de fotos y grabación (opcional)');
    putText(doc.getElementById('photo-consent-sub'), es, 'Doy mi consentimiento para el uso de fotos o grabaciones tomadas durante el programa con fines de difusión por Mindful Beginnings.');
    var reserve = doc.querySelector('#screen-info .btn-p');
    putText(reserve, es, 'Reservar mi lugar →');
    var back = doc.querySelector('#screen-info .btn-o');
    putText(back, es, '← Atrás');
    var referral = doc.getElementById('referral-section');
    if (referral) referral.hidden = es;
    var county = doc.getElementById('county-disclaimer-before-reserve');
    putText(county, es, 'Esta actividad no está patrocinada, asociada ni respaldada por el gobierno del condado de Montgomery');
    putText(doc.querySelector('#screen-pay .ptitle'), es, 'Resumen');
    var freeBtn = doc.getElementById('host-confirm-btn');
    if (freeBtn) {
      if (!freeBtn.getAttribute('data-srf-en')) freeBtn.setAttribute('data-srf-en', freeBtn.textContent);
      freeBtn.textContent = es ? 'Confirmar inscripción, sin cargo' : freeBtn.getAttribute('data-srf-en');
    }
    var ov = doc.getElementById('overview-link');
    putText(ov, es, 'Ver la descripción del curso');
    var ovNote = doc.querySelector('#overview-link-wrap p');
    putText(ovNote, es, 'Qué cubre la clase, qué traer y quién la imparte.');
    putText(doc.getElementById('cal-btn'), es, 'Agregar a mi calendario');
  }

  var api = {
    COURSE: COURSE,
    CONSENT: CONSENT,
    EMAIL_NOTE: EMAIL_NOTE,
    EMAIL_NOTE_ES: EMAIL_NOTE_ES,
    CLASS_DATE_Q: CLASS_DATE_Q,
    CLASS_DATE_ES: CLASS_DATE_ES,
    CONSENT_ES: CONSENT_ES,
    ROLES: ROLES,
    CONFIDENCE: CONFIDENCE,
    OVERALL: OVERALL,
    PLAN_LATER: PLAN_LATER,
    isCourse: isCourse,
    surveyUrl: surveyUrl,
    registrationHtml: registrationHtml,
    classSurveyHtml: classSurveyHtml,
    followupHtml: followupHtml,
    readRegistration: readRegistration,
    readClassSurvey: readClassSurvey,
    readFollowup: readFollowup,
    accept: accept,
    report: report,
    csv: csv,
    applyPage: applyPage
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBSrfGrant = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
