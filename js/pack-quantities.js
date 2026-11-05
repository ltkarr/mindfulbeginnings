/* How many supplies to pack for one in-person class.

   Counts use the same seat rule as the packing list: a registration counts
   unless it is waitlist, cancelled, or refunded. Host and comped seats count.
   Per-person quantities come from the teaching checklist wording. Durable
   manikin counts follow the course kit rules, not enrollment times a kit.
   Red Cross classes stay at 2 adult, 2 child, and 2 infant manikins.
   Safe Sitter and Essentials stay at 1 infant and 1 child through 8
   students, and 3 of each when more than 8 are registered.
*/
(function (root) {
  'use strict';

  var NICK = { kathryn: 'katy', katherine: 'katy', kate: 'katy', kathy: 'katy', katy: 'katy' };

  function countsTowardSeats(r) {
    var st = String(r && r.payStatus || '').toLowerCase();
    return !!r && st !== 'waitlist' && st !== 'cancelled' && st !== 'canceled' && st !== 'refunded';
  }

  function nameParts(name) {
    var raw = String(name || '').toLowerCase();
    var nick = [];
    var found = raw.match(/\(([^)]+)\)/);
    if (found) nick = found[1].split(/[^a-z]+/).filter(Boolean);
    var base = raw.replace(/\([^)]*\)/g, ' ').replace(/[^a-z]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    return { first: base[0] || '', last: base.length ? base[base.length - 1] : '', nick: nick };
  }

  function canon(word) { return NICK[word] || word; }

  function namesMatch(a, b) {
    var A = nameParts(a);
    var B = nameParts(b);
    if (!A.last || !B.last || A.last !== B.last) return false;
    var fa = canon(A.first);
    var fb = canon(B.first);
    if (fa && fa === fb) return true;
    var extraA = A.nick.map(canon);
    var extraB = B.nick.map(canon);
    if (extraA.indexOf(fb) >= 0 || extraB.indexOf(fa) >= 0) return true;
    return extraA.some(function (n) { return extraB.indexOf(n) >= 0; });
  }

  function personMatches(person, names) {
    return (names || []).some(function (n) { return namesMatch(person, n); });
  }

  function kindOf(name) {
    var n = String(name || '');
    if (/infant/i.test(n)) return 'infant';
    if (/child/i.test(n)) return 'child';
    if (/adult/i.test(n)) return 'adult';
    if (/\bav\b|laptop|projector/i.test(n)) return 'av';
    return '';
  }

  function line(id, label, required, extra) {
    var out = { id: id, label: label, required: required, consumable: !extra || extra.consumable !== false, already: 0, packNow: required, alreadyNote: '' };
    if (extra && extra.consumable === false) out.consumable = false;
    if (extra && extra.note) out.note = extra.note;
    return out;
  }

  function confirm(label, note, id) {
    return { id: id || '', label: label, confirm: true, note: note, consumable: true };
  }

  function per(count, n) {
    if (count == null) return null;
    return Math.max(0, Number(count) || 0) * n;
  }

  function safeSitterGear(count) {
    var big = Number(count) > 8;
    return [
      line('infant', 'Infant manikins', big ? 3 : 1, { consumable: false }),
      line('child', 'Child manikins', big ? 3 : 1, { consumable: false }),
      line('av', 'AV kit', 1, { consumable: false })
    ];
  }

  function rcGear() {
    return [
      line('adult', 'Adult manikins', 2, { consumable: false }),
      line('child', 'Child manikins', 2, { consumable: false }),
      line('infant', 'Infant manikins', 2, { consumable: false }),
      line('av', 'AV kit', 1, { consumable: false })
    ];
  }

  function peopleLines(count, instructorCount, rows) {
    if (count == null) {
      return rows.map(function (row) {
        return confirm(row.label, 'Attendance is not confirmed, so this count is blank.', row.id);
      });
    }
    return rows.map(function (row) {
      var n = row.each * count + (row.plusInstructors ? (Number(instructorCount) || 0) : 0) + (row.extra || 0);
      return line(row.id, row.label, n, { consumable: row.consumable !== false, note: row.note });
    });
  }

  var RULES = {
    'safe-sitter': function (count, instructors) {
      return peopleLines(count, instructors, [
        { id: 'ssHandbook', label: 'Safe Sitter Student Handbooks', each: 1 },
        { id: 'ssNotebook', label: 'Safe Sitter Important Information note pads', each: 1 },
        { id: 'nameTag', label: 'Name tags', each: 1, plusInstructors: true },
        { id: 'faceShield', label: 'CPR face shield protectors', each: 1 }
      ]).concat(count == null ? [confirm('Infant and child manikins', 'The kit is 1 of each through 8 students and 3 of each above 8. Attendance is not confirmed.')] : safeSitterGear(count)).concat([
        confirm('Student evaluation forms', 'The checklist lists the forms and does not state how many.')
      ]);
    },
    'ss-essentials': function (count, instructors) {
      return RULES['safe-sitter'](count, instructors);
    },
    'intro-babysitting': function (count) {
      return peopleLines(count, 0, [
        { id: 'itbHandbook', label: 'Intro to Babysitting handbooks', each: 1 },
        { id: 'pen', label: 'Pens or pencils', each: 1 },
        { id: 'nameTag', label: 'Name tags', each: 1 }
      ]);
    },
    'safe-at-home': function (count) {
      return peopleLines(count, 0, [
        { id: 'sahHandbook', label: 'Safe@Home student handbooks', each: 1 },
        { id: 'sahCertificate', label: 'Safe@Home completion certificates', each: 1 },
        { id: 'pen', label: 'Pencils or pens', each: 1 },
        { id: 'nameTag', label: 'Name tags', each: 1 }
      ]).concat([line('av', 'AV kit', 1, { consumable: false })]);
    },
    'safe-at-home-series': function (count) {
      return peopleLines(count, 0, [
        { id: 'sahHandbook', label: 'Safe@Home student booklets', each: 1 },
        { id: 'nameTag', label: 'Name tents or tags', each: 1 }
      ]);
    },
    'grandparents': function (count) {
      var gear = count == null ? [] : [
        line('infant', 'Infant manikins', Number(count) > 8 ? 2 : 1, { consumable: false }),
        line('child', 'Child manikins', Number(count) > 8 ? 2 : 1, { consumable: false })
      ];
      if (count == null) gear = [confirm('Infant and child manikins', 'The checklist says 1 of each through 8 participants and 2 of each above 8. Attendance is not confirmed.')];
      return peopleLines(count, 0, [
        { id: 'gpHandbook', label: 'Grandparents handbooks and completion certificates', each: 1 },
        { id: 'pen', label: 'Pens or pencils', each: 1 },
        { id: 'nameTag', label: 'Name tags', each: 1 }
      ]).concat(gear);
    },
    'rc-bt-peds': function (count, instructors) {
      return rcGear().concat(peopleLines(count, instructors, [
        { id: 'rcHandbook', label: 'Red Cross Babysitter\'s Training participant handbooks', each: 1 },
        { id: 'rcSkills', label: 'Red Cross skills checklists', each: 1 },
        { id: 'barrier', label: 'CPR breathing barriers', each: 1 },
        { id: 'nameTag', label: 'Name tags', each: 1, plusInstructors: true }
      ]));
    },
    'rc-adult-peds': function (count, instructors) {
      return rcGear().concat(peopleLines(count, instructors, [
        { id: 'rcHandout', label: 'Red Cross participant handouts', each: 1 },
        { id: 'rcSkills', label: 'Red Cross skills checklists', each: 1 },
        { id: 'barrier', label: 'CPR breathing barriers', each: 1 },
        { id: 'nameTag', label: 'Name tags', each: 1, plusInstructors: true }
      ]));
    },
    'rc-workplace': function (count, instructors) {
      return RULES['rc-adult-peds'](count, instructors);
    },
    'care-ready': function (count) {
      var gear = count == null ? [
        confirm('Infant manikins', 'The checklist says 1 per participant. Attendance is not confirmed.'),
        confirm('Child manikins', 'The checklist says 1 per 2 participants. Attendance is not confirmed.')
      ] : [
        line('infant', 'Infant manikins', count, { consumable: false }),
        line('child', 'Child manikins', Math.ceil(count / 2), { consumable: false }),
        line('av', 'AV kit', 1, { consumable: false })
      ];
      return peopleLines(count, 0, [
        { id: 'careHandbook', label: 'Care Ready handbooks', each: 1, extra: 2 },
        { id: 'pen', label: 'Pens', each: 1, extra: 10 },
        { id: 'nameTag', label: 'Name tents or tags', each: 1 }
      ]).concat(gear);
    },
    'baby-ready': function (count) {
      var gear = count == null ? [confirm('Infant CPR manikins', 'The checklist says 1 per 2 participants. Attendance is not confirmed.')] : [
        line('infant', 'Infant CPR manikins', Math.ceil(count / 2), { consumable: false })
      ];
      return peopleLines(count, 0, [
        { id: 'takeaway', label: 'Baby Ready takeaway sheets', each: 1 }
      ]).concat(gear);
    },
    'baby-ready-cpr': function (count) {
      return RULES['baby-ready'](count).concat(peopleLines(count, 0, [
        { id: 'cprCard', label: 'Baby Ready + CPR certification cards', each: 1 }
      ]));
    }
  };

  function orgCount(session) {
    if (!session || session.orgHandlesRegistration !== true) return 0;
    if (!String(session.billToOrg || '').trim()) return 0;
    if (session.billedHeadcount == null || session.billedHeadcount === '') return 0;
    var n = Number(session.billedHeadcount);
    if (!isFinite(n) || n <= 0) return 0;
    return Math.floor(n);
  }

  function attendingCount(session, regs, seatsPer) {
    var per = Number(seatsPer);
    if (!isFinite(per) || per < 1) per = 1;
    var rows = (regs || []).filter(function (r) {
      return r && r.sessionId === session.id && countsTowardSeats(r);
    }).length;
    return rows * Math.floor(per);
  }

  function headcount(session, regs, seatsPer) {
    var live = attendingCount(session, regs, seatsPer);
    var billed = orgCount(session);
    if (session && session.orgHandlesRegistration === true) {
      if (billed > 0) {
        return {
          count: Math.max(live, billed),
          external: true,
          missing: false,
          basis: 'The organization registers this class. The count is ' + Math.max(live, billed) + ', the larger of registrations (' + live + ') and the billed headcount (' + billed + '). Waitlist, cancelled, and refunded rows are not included.'
        };
      }
      if (live > 0) {
        return {
          count: live,
          external: true,
          missing: false,
          basis: live + ' people are registered. The organization registers this class and no billed headcount is on file. Waitlist, cancelled, and refunded rows are not included.'
        };
      }
      return {
        count: null,
        external: true,
        missing: true,
        basis: 'The organization registers this class, and no headcount is confirmed. Counts that depend on attendance are left blank instead of printing zero.'
      };
    }
    return {
      count: live,
      external: false,
      missing: false,
      basis: live + (live === 1 ? ' participant is registered.' : ' participants are registered.') + ' Waitlist, cancelled, and refunded registrations are not included.'
    };
  }

  function isFutureReservation(c, today) {
    return !!(c && c.outDate && today && c.outDate > today);
  }

  function heldKinds(checkouts, names, today, sessionId, equipment) {
    var byKind = {};
    var sources = {};
    (checkouts || []).forEach(function (c) {
      if (!c || c.returnedDate || c.noEquipment) return;
      if ((c.items || []).some(function (it) { return it && (it.usesExisting || it.noEquipment); }) && !(c.items || []).some(function (it) { return it && Number(it.qty) > 0; })) return;
      if (sessionId && c.sessionId === sessionId) return;
      if (isFutureReservation(c, today)) return;
      if (c.outDate && today && c.outDate > today) return;
      if (!personMatches(c.person, names)) return;
      (c.items || []).forEach(function (it) {
        if (!it || it.usesExisting || it.noEquipment || it.consumable) return;
        var qty = Number(it.qty) || 0;
        if (!(qty > 0)) return;
        var eq = (equipment || []).filter(function (e) { return e && e.id === it.equipmentId; })[0];
        var kind = it.kind || kindOf(eq && eq.name) || kindOf(it.name);
        if (!kind) return;
        if (qty > (byKind[kind] || 0)) byKind[kind] = qty;
        sources[kind] = sources[kind] || [];
        var src = c.source || '';
        if (src && sources[kind].indexOf(src) < 0) sources[kind].push(src);
      });
    });
    return { qty: byKind, sources: sources };
  }

  function unconfirmedCarry(checkouts, names, neededKinds) {
    var hits = [];
    (checkouts || []).forEach(function (c) {
      if (!c || !c.returnedDate) return;
      if (!personMatches(c.person, names)) return;
      var auto = /auto-closed/i.test(String(c.notes || '')) || (c.outDate && c.returnedDate < c.outDate);
      if (!auto) return;
      var bits = [];
      (c.items || []).forEach(function (it) {
        if (!it || !(Number(it.qty) > 0)) return;
        var kind = it.kind || '';
        if (neededKinds.length && neededKinds.indexOf(kind) < 0 && kind) return;
        if (kind) bits.push((Number(it.qty)) + ' ' + kind);
      });
      if (!bits.length) return;
      hits.push({ when: c.returnedDate, detail: bits.join(', '), source: c.source || '' });
    });
    return hits;
  }

  function applyCarry(lines, held, remaining) {
    lines.forEach(function (row) {
      if (row.confirm || row.required == null) return;
      var have = 0;
      var note = '';
      if (row.consumable) {
        if (remaining && remaining[row.id] != null && isFinite(Number(remaining[row.id]))) {
          have = Math.max(0, Number(remaining[row.id]) || 0);
          note = 'Recorded remaining count';
        }
      } else {
        have = Math.max(0, Number(held.qty[row.id]) || 0);
        note = (held.sources[row.id] || []).join('; ');
      }
      var use = Math.min(have, row.required);
      row.already = use;
      row.packNow = Math.max(0, row.required - use);
      row.alreadyNote = use ? note : '';
      if (!row.consumable && have > row.required) {
        row.already = have;
        row.packNow = 0;
        row.holdNote = 'More are already out than this class requires. Do not pack another set.';
      }
    });
  }

  function forChecklist(opts) {
    opts = opts || {};
    var session = opts.session || {};
    var seats = headcount(session, opts.registrations || [], opts.seatsPer);
    var refresh = opts.refresh || { ok: true };
    var refreshNote = refresh.ok
      ? 'Registrations were rechecked just now.'
      : (refresh.message || 'Registrations could not be rechecked. This count is from the list already on screen, and it was not rechecked.');
    if (opts.skipRefresh) refreshNote = '';
    var fn = RULES[opts.checklistId];
    var lines = fn ? fn(seats.count, opts.instructorCount || 0) : [
      confirm('Supplies', 'This course does not have pack quantities on the checklist.')
    ];
    var names = opts.instructorNames || [];
    var held = heldKinds(opts.checkouts, names, opts.today, session.id, opts.equipment);
    var remaining = opts.remaining || null;
    applyCarry(lines, held, remaining);
    var needed = lines.filter(function (row) { return row && !row.consumable && !row.confirm; }).map(function (row) { return row.id; });
    var unverified = unconfirmedCarry(opts.checkouts, names, needed);
    var warning = '';
    var durableHeld = needed.some(function (id) { return (held.qty[id] || 0) > 0; });
    if (!durableHeld && unverified.length) {
      warning = 'Confirm what is still with the instructor before packing another durable kit. A checkout was marked returned by an automatic cleanup (' + unverified.map(function (h) { return h.detail + (h.source ? ' from ' + h.source : ''); }).join('; ') + '). Those items are not counted as already out, and a second full kit is not filled in as packed.';
      lines.forEach(function (row) {
        if (row.consumable || row.confirm) return;
        if ((held.qty[row.id] || 0) > 0) return;
        row.packNow = null;
        row.holdNote = 'Confirm before packing another. Not counted as already out.';
      });
    }
    var expected = opts.expected;
    if (expected > 0 && seats.count != null && expected > seats.count) {
      seats.basis += ' Participants expected is ' + expected + ', which is higher. These quantities use registrations.';
    }
    return {
      count: seats.count,
      missing: seats.missing,
      basis: seats.basis,
      refreshNote: refreshNote,
      warning: warning,
      lines: lines
    };
  }

  function packNowText(plan) {
    var parts = [];
    (plan && plan.lines || []).forEach(function (row) {
      if (!row) return;
      if (row.confirm || row.packNow == null) parts.push(row.label + ': quantity needs confirmation');
      else parts.push(row.packNow + ' ' + row.label);
    });
    return parts.length ? ('Pack now: ' + parts.join(', ')) : '';
  }

  function phrases(plan) {
    if (!plan || !plan.lines) return null;
    var already = [];
    var pack = [];
    var changed = false;
    plan.lines.forEach(function (row) {
      if (!row || row.confirm || row.required == null) return;
      if ((row.already || 0) > 0) {
        changed = true;
        already.push(row.already + ' ' + row.label);
      }
      if (row.packNow > 0) pack.push(row.packNow + ' ' + row.label);
      else if ((row.already || 0) > 0 && row.packNow === 0) changed = true;
    });
    if (!changed && !plan.warning) return null;
    return {
      changed: changed,
      already: already.length ? ('Already with instructor: ' + already.join(', ')) : '',
      packNow: pack.length ? ('Pack now: ' + pack.join(', ')) : (changed ? 'Pack now: no more of the items already with the instructor' : ''),
      warning: plan.warning || ''
    };
  }

  var api = {
    countsTowardSeats: countsTowardSeats,
    namesMatch: namesMatch,
    attendingCount: attendingCount,
    headcount: headcount,
    forChecklist: forChecklist,
    phrases: phrases,
    packNowText: packNowText,
    safeSitterGear: safeSitterGear,
    rcGear: rcGear
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MBPackQuantities = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
