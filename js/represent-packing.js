/* Printable materials list for in-person representation events.
   Items come from the event notes. Suggestions are labeled as suggestions.
   Nothing here is a teaching checklist, and a teaching custom job is not
   treated as a booth.
*/
(function (root) {
  'use strict';

  function escapeHtml(t) {
    return String(t == null ? '' : t).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function isRepresentSession(s) {
    if (!s || s.isVirtual) return false;
    var code = String(s.code || '').trim().toUpperCase();
    var name = String(s.course || '').toLowerCase();
    if (code.indexOf('RUA-') === 0) return true;
    if (/represent us/.test(name)) return true;
    if (s.isCustomJob && /\b(vendor|booth|fair|fest|expo)\b|welcome event|shopping event|market booth/.test(name)) return true;
    return false;
  }

  function printableNotes(text) {
    return String(text || '').split(/(?<=[.!])\s+|\n+/).map(function (line) {
      var bit = line.trim();
      if (!bit) return '';
      if (/lock\s*code|door code|gate code|alarm code|keycode/i.test(bit)) return '';
      if (/\bparking\b/i.test(bit) && /\$|pay|fee|garage/i.test(bit)) return '';
      if (/\b(hourly|venmo|zelle|paycheck|pay is|paid at)\b/i.test(bit)) return '';
      if (/\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/.test(bit)) return '';
      return bit;
    }).filter(Boolean).join(' ');
  }

  function sentences(text) {
    return String(text || '').split(/(?<=[.!])\s+|\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function has(text, re) { return re.test(String(text || '')); }

  function add(list, label) {
    if (!label) return;
    if (list.some(function (x) { return x.toLowerCase() === label.toLowerCase(); })) return;
    list.push(label);
  }

  function build(session) {
    if (!isRepresentSession(session)) return null;
    var notes = printableNotes(session.notes || session.instructorInfo || '');
    var text = notes;
    var pack = [];
    var own = [];
    var provided = [];
    var wear = [];
    var during = [];
    var after = [];
    var restrict = [];
    var suggest = [];
    var check = [];

    var ownTable = /instructor brings[^.]{0,80}table|brings (?:their |her |his |your )?own[^.]{0,40}table|table[^.]{0,60}(?:own|must fit)/i.test(text);
    var packOurTable = /pick\s*-?\s*up[^.]{0,120}(?:our )?folding table|our folding table/i.test(text);
    var vendorsBringTable = /vendors bring[^.]{0,40}tables?/i.test(text);

    if (packOurTable) add(pack, 'Our folding table (pick up from storage)');
    else if (ownTable) add(own, 'Folding table (instructor\'s own, not from storage)');
    else if (vendorsBringTable) add(provided, 'Tables: vendors bring their own. Do not pack one unless the notes name our table.');

    if (/vendors bring[^.]{0,40}chairs/i.test(text) && !/pick\s*-?\s*up[^.]{0,80}chairs/i.test(text)) {
      add(provided, 'Chairs: vendors bring their own. Not packed from storage.');
    }

    if (/giveaways?/.test(text)) add(pack, 'Giveaways');
    if (/\bsigns?\b|signage/.test(text)) add(pack, 'Signs');
    if (/tablecloth/.test(text)) {
      var cloth = /navy tablecloth/i.test(text) ? 'Navy tablecloth' : 'Tablecloth';
      add(pack, cloth);
    }
    if (/\bbanner\b/.test(text)) add(pack, 'Mindful Beginnings banner');
    if (/flyers?|qr registration|registration sign/i.test(text)) add(pack, 'Flyers or a QR registration sign');
    if (/signup materials|sign-up materials/i.test(text)) add(pack, 'Signup materials');
    if (/first aid kits?/i.test(text)) add(pack, 'First aid kits (listed with the giveaways)');
    if (/postcards?/i.test(text)) add(pack, 'Postcards');
    if (/\bpens?\b/.test(text) && /pick\s*-?\s*up|bring|giveaways/i.test(text)) add(pack, 'Pens');
    if (/business cards/i.test(text)) add(pack, 'Business cards');

    if (/shirt|sweatshirt/i.test(text)) add(wear, 'Mindful Beginnings shirt or sweatshirt');
    if (/\bbadge\b/i.test(text)) add(wear, 'Badge');

    if (/no food|no candy|do not (?:bring |pack )?food|without food/i.test(text)) add(restrict, 'No food or candy');
    if (/do not use[^.]{0,40}(?:name|logo)|no [^.]{0,20}logo/i.test(text)) add(restrict, 'Do not put the host organization\'s name or logo on signage');
    if (/health(?: and |\/)safety information only|health\/safety info only/i.test(text)) add(restrict, 'Health and safety information only');

    if (/return leftovers|return any leftovers|return unused/i.test(text)) add(after, 'Return leftovers');
    if (/quick report|send a report|report after/i.test(text)) add(after, 'Send a short report after the event');

    sentences(text).forEach(function (s) {
      if (/lock\s*code|door code|\$\d|parking/i.test(s)) return;
      if (/set up by|arrive|vendor setup|cleanup|pack by/i.test(s)) add(during, s.replace(/\s+/g, ' '));
      else if (/tell people|encourage everyone|share (?:all )?classes|hand out|capture email|point (?:people )?to registration|represent us at the event/i.test(s)) add(during, s.replace(/\s+/g, ' '));
    });

    var mentionedCards = /business cards/i.test(text);
    var mentionedPens = /\bpens?\b/i.test(text);
    var mentionedQr = /qr|registration sign|flyers?/i.test(text);
    var sparse = pack.length > 0 && pack.length <= 2 && !ownTable && !packOurTable && !/tablecloth|banner/i.test(text);
    if (sparse && /course|safe sitter|host a/i.test(text)) {
      add(suggest, 'A short Safe Sitter hosting note for families');
      if (!mentionedCards) add(suggest, 'Business cards');
      if (!mentionedQr) add(suggest, 'A QR code or registration link');
      add(suggest, 'A sheet to write names of people who want to host');
      if (!mentionedPens) add(suggest, 'Pens');
    }
    if (!/tablecloth|folding table|\btable\b/i.test(text)) {
      add(check, 'A table and tablecloth are not in the notes. Confirm who provides the table before packing one.');
    }

    if (!pack.length && !own.length && !provided.length) {
      add(check, 'The notes do not list materials to pick up.');
    }

    return {
      title: String(session.course || 'Representation event'),
      sections: [
        { title: 'Pack from storage', items: pack, kind: 'required' },
        { title: 'Instructor brings (do not pack)', items: own, kind: 'own' },
        { title: 'At the event, not from our storage', items: provided, kind: 'provided' },
        { title: 'Wear', items: wear, kind: 'wear' },
        { title: 'At the event', items: during, kind: 'during' },
        { title: 'After', items: after, kind: 'after' },
        { title: 'Do not', items: restrict, kind: 'restrict' },
        { title: 'Suggestions, not in the notes', items: suggest, kind: 'suggest' },
        { title: 'Confirm before you pack', items: check, kind: 'check' }
      ].filter(function (sec) { return sec.items.length; })
    };
  }

  function sectionIntro(kind) {
    if (kind === 'suggest') return 'These are ideas because the notes are short. They are not requirements.';
    if (kind === 'check') return 'Not confirmed in the notes.';
    if (kind === 'own') return 'The instructor brings this. It is not something to pull from storage.';
    return '';
  }

  function printHtml(model, meta) {
    if (!model) return '';
    meta = meta || {};
    var lines = [];
    if (meta.instructor) lines.push('Instructor: ' + meta.instructor);
    else lines.push('Instructor: Unassigned');
    var when = [meta.dateLabel || meta.date || '', meta.time || ''].filter(Boolean).join(' ');
    if (when) lines.push(when);
    if (meta.place) lines.push(meta.place);
    if (meta.code) lines.push('Code ' + meta.code);
    var sections = model.sections.map(function (sec) {
      var intro = sectionIntro(sec.kind);
      var items = sec.items.map(function (item) {
        return '<li class="teach-item"><span class="teach-box" aria-hidden="true"></span><span>' + escapeHtml(item) + '</span></li>';
      }).join('');
      return '<section class="teach-pdf-section"><h2>' + escapeHtml(sec.title) + '</h2>' +
        (intro ? '<p class="teach-pdf-note">' + escapeHtml(intro) + '</p>' : '') +
        '<ul class="teach-items">' + items + '</ul></section>';
    }).join('');
    return '<div class="teach-pdf"><header class="teach-pdf-head"><div class="teach-pdf-brand">Mindful Beginnings</div><div class="teach-pdf-rule"></div><p class="teach-pdf-kicker">Materials packing list</p><h1>' +
      escapeHtml(model.title) + '</h1><p class="teach-pdf-meta">' + lines.map(escapeHtml).join('<br>') + '</p></header>' + sections + '</div>';
  }

  var api = {
    isRepresentSession: isRepresentSession,
    build: build,
    printHtml: printHtml,
    printableNotes: printableNotes
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBRepresentPacking = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
