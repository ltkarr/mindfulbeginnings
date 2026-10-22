/* Referral-partner commissions.
   Partners are data: a name, the referral-source values that belong to them,
   and the partner's share of what is left after overhead. Mary Parks is the
   first one. "Vanessa in Vienna" is her source. This is not the liaison
   program. A family who picks "Mary Parks" on the form stays on the Liaisons
   tab. A family, host, or organization who picks "Vanessa in Vienna" is hers
   here.

   Overhead (subtracted before the split) is the per-session cost basis the
   admin already uses, switched on by rules so it can be changed without
   rewriting the math:

     instructorPay        — instructor pay the dashboard already subtracts
                            (frozen paid fee when a slot is marked paid,
                            otherwise the same estimate; owner-taught primary
                            slot is $0; a cancelled class keeps only pay that
                            was actually marked paid), including an instructor
                            referral bonus
     materialAllowance    — course matCost times live non-host registrations.
                            Company class profit does not deduct this, because
                            bulk handbook orders sit on the yearly expense
                            list. This report does, so commission is not paid
                            on the money that buys that participant's materials.
                            Cancelled classes skip it.
     sessionExpenses      — unresolved costs typed on the session, plus
                            one-time expenses linked to that session. Repeating
                            company expenses are not included. Per-student
                            handbook lines typed on the session are not
                            included, because the allowance already covers
                            them. A cancelled class keeps only lines with a
                            date paid, plus linked expenses.
     netOfProcessingFees  — collected revenue is net of the card fee, the same
                            way the dashboard splits Collected and Expected.
                            The fee is not subtracted again inside overhead.

   Not overhead: insurance, software, the website, and other expenses that
   are not linked to the session. Liaison commission is a different program
   and is not deducted here.

   Collected vs expected follows sessionCashSplit. Paid family registrations
   are collected, after the processing fee. The organization bill or custom-job
   fee is expected until it is marked received. Unpaid family seats are not
   expected revenue. A comped or free host registration is $0.

   Commission owed is the partner's share of collected net, and only when that
   net is above zero. Expected is shown beside it and is not owed yet.
   Lindsay's share is the rest. A loss pays the partner nothing.
*/
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.MBReferralCommissions = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  var DEFAULT_OVERHEAD_RULES = {
    instructorPay: true,
    materialAllowance: true,
    sessionExpenses: true,
    netOfProcessingFees: true
  };

  var OVERHEAD_SUMMARY = [
    'Overhead comes off attributed revenue before the split.',
    'Instructor pay uses the dashboard figure: the frozen amount when a slot is marked paid, otherwise the same estimate, including a second instructor and any instructor referral bonus. An owner-taught class does not pay the owner. A cancelled class keeps only instructor pay that was marked paid.',
    'Participant materials are the course material allowance times each live registration that is not a comped host seat. Company class profit leaves this on the yearly expense list. This report deducts it so the split is not taken on the cost of that participant\'s materials. Cancelled classes skip the allowance.',
    'Session expenses are unresolved costs entered on the session and one-time expenses linked to that session. Repeating company expenses (insurance, software, the website) are not included. Handbook lines typed per student are not included again, because the material allowance already covers them.',
    'Collected revenue is net of the card-processing fee on paid family registrations, the same way the dashboard splits Collected and Expected. That fee is not subtracted a second time. Organization invoices have no processing fee. Expected is the organization or custom-job amount that is not marked received. Unpaid family seats are not expected revenue.',
    'A comped or free host registration is $0. The partner\'s percentage applies to what is left of collected revenue after overhead, and only when that amount is above zero. Expected is shown and is not owed until it is collected. A loss pays the partner nothing. Lindsay keeps the rest.'
  ].join(' ');

  function round2(n) {
    return Math.round((Number(n) || 0) * 100) / 100;
  }

  function normalizeSplit(value) {
    var n = Number(value);
    if (!isFinite(n) || n < 0) n = 0;
    if (n > 1) n = n / 100;
    if (n > 1) n = 1;
    return Math.round(n * 10000) / 10000;
  }

  function normalizeRules(rules) {
    var src = rules || {};
    return {
      instructorPay: src.instructorPay !== false,
      materialAllowance: src.materialAllowance !== false,
      sessionExpenses: src.sessionExpenses !== false,
      netOfProcessingFees: src.netOfProcessingFees !== false
    };
  }

  function normalizeReferral(value) {
    return String(value == null ? '' : value).toLowerCase().replace(/\s+/g, ' ').trim();
  }

  function referralCandidates(raw) {
    var text = String(raw == null ? '' : raw).trim();
    if (!text) return [];
    var out = [text];
    var prefixed = /^(?:other(?:\/referral)?)\s*:\s*(.+)$/i.exec(text);
    if (prefixed && prefixed[1].trim()) out.push(prefixed[1].trim());
    var note = /\[how they heard about us:\s*([^\]]+)\]/i.exec(text);
    if (note && note[1].trim()) out.push(note[1].trim());
    return out;
  }

  // True when a stored referral answer belongs to one configured source.
  // Exact text, an "Other:" answer, a note the registration form folded in,
  // a longer answer that contains the source, or a slight rewording that
  // still uses the source's distinctive words ("Vanessa from Vienna").
  function referralSourceMatches(raw, sourceValue) {
    var source = normalizeReferral(sourceValue);
    if (!source) return false;
    var candidates = referralCandidates(raw);
    if (!candidates.length) return false;
    if (candidates.some(function (c) { return normalizeReferral(c) === source; })) return true;
    var blob = normalizeReferral(candidates.join(' \n '));
    if (blob.indexOf(source) >= 0) return true;
    var words = source.split(' ').filter(function (w) { return w.length > 2; });
    if (words.length < 2) return false;
    return words.every(function (w) { return blob.indexOf(w) >= 0; });
  }

  function partnerForText(partners, raw) {
    var best = null;
    var bestLen = -1;
    (partners || []).forEach(function (p) {
      (p.sources || []).forEach(function (src) {
        if (!referralSourceMatches(raw, src)) return;
        var len = normalizeReferral(src).length;
        if (len > bestLen) {
          best = p;
          bestLen = len;
        }
      });
    });
    return best;
  }

  function partnerById(partners, id) {
    if (!id) return null;
    return (partners || []).find(function (p) { return p.id === id; }) || null;
  }

  function labeledReferralText(raw) {
    return String(raw == null ? '' : raw).split('\n').map(function (line) {
      var m = /^\s*referral\s*:\s*(.*)$/i.exec(line);
      return m ? m[1].trim() : '';
    }).filter(Boolean).join('\n');
  }

  function ymd(value) {
    if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) return value.slice(0, 10);
    var n = typeof value === 'number' ? value : (typeof value === 'string' ? Date.parse(value) : NaN);
    if (!isFinite(n)) return '';
    var d = new Date(n);
    if (isNaN(d.getTime())) return '';
    var m = String(d.getMonth() + 1);
    var day = String(d.getDate());
    if (m.length < 2) m = '0' + m;
    if (day.length < 2) day = '0' + day;
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function zeroMoney() {
    return { grossCollected: 0, grossExpected: 0, collected: 0, expected: 0 };
  }

  // Comped host seats, free comps, in-kind seats, and anything not paid are $0.
  // Paid money is the charged price. Collected is that price minus the
  // processing fee when rules say to follow the dashboard.
  function registrationMoney(reg, price, processingFeeAmount, rules) {
    var status = String(reg && (reg.payStatus != null ? reg.payStatus : reg.pay_status) || '').toLowerCase().trim();
    if (status === 'host' || status === 'comp' || status === 'comped' || status === 'free' || status === 'in_kind' || status === 'cancelled' || status === 'canceled' || status === 'waitlist' || status === 'refunded') {
      return zeroMoney();
    }
    if (status !== 'paid') return zeroMoney();
    var gross = round2(price);
    if (!(gross > 0)) return zeroMoney();
    var useNet = !rules || rules.netOfProcessingFees !== false;
    var fee = useNet ? round2(processingFeeAmount) : 0;
    if (fee < 0) fee = 0;
    if (fee > gross) fee = gross;
    return {
      grossCollected: gross,
      grossExpected: 0,
      collected: round2(gross - fee),
      expected: 0
    };
  }

  function splitRemainder(net, splitPct) {
    var n = round2(net);
    if (n <= 0) return { partner: 0, owner: n };
    var rate = normalizeSplit(splitPct);
    var partner = round2(n * rate);
    return { partner: partner, owner: round2(n - partner) };
  }

  function allocShare(total, part, whole) {
    var t = Number(total) || 0;
    var p = Number(part) || 0;
    var w = Number(whole) || 0;
    if (!(t && p && w)) return 0;
    return round2(t * (p / w));
  }

  function moneyLine(base) {
    var collected = round2(base.collected);
    var expected = round2(base.expected);
    var grossCollected = round2(base.grossCollected);
    var grossExpected = round2(base.grossExpected);
    var overhead = round2(base.overhead);
    var pool = collected + expected;
    var overheadCollected;
    var overheadExpected;
    if (pool > 0) {
      overheadCollected = allocShare(overhead, collected, pool);
      overheadExpected = round2(overhead - overheadCollected);
    } else {
      overheadCollected = overhead;
      overheadExpected = 0;
    }
    var netCollected = round2(collected - overheadCollected);
    var netExpected = round2(expected - overheadExpected);
    var collectedSplit = splitRemainder(netCollected, base.splitPct);
    var expectedSplit = splitRemainder(netExpected, base.splitPct);
    return {
      partnerId: base.partnerId,
      partnerName: base.partnerName,
      splitPct: normalizeSplit(base.splitPct),
      lineKey: base.lineKey,
      grain: base.grain,
      recordId: base.recordId,
      sessionId: base.sessionId || '',
      date: base.date || '',
      source: base.source || '',
      label: base.label || '',
      kindLabel: base.kindLabel || '',
      grossCollected: grossCollected,
      grossExpected: grossExpected,
      collected: collected,
      expected: expected,
      overhead: overhead,
      overheadCollected: overheadCollected,
      overheadExpected: overheadExpected,
      netCollected: netCollected,
      netExpected: netExpected,
      partnerCollected: collectedSplit.partner,
      ownerCollected: collectedSplit.owner,
      partnerExpected: expectedSplit.partner,
      ownerExpected: expectedSplit.owner
    };
  }

  function matchedSource(raw, partner) {
    var found = '';
    var foundLen = -1;
    (partner && partner.sources || []).forEach(function (src) {
      if (!referralSourceMatches(raw, src)) return;
      var len = normalizeReferral(src).length;
      if (len > foundLen) {
        found = src;
        foundLen = len;
      }
    });
    return found;
  }

  function sessionLabel(session) {
    var course = session && session.course ? session.course : 'Class';
    var code = session && session.code ? (' · ' + session.code) : '';
    return course + code;
  }

  function registrationLabel(reg, session, audience) {
    var course = sessionLabel(session);
    if (audience === 'partner') return 'Registration · ' + course;
    var who = reg && reg.studentName ? reg.studentName : 'Registration';
    return who + ' · ' + course;
  }

  function inRange(date, from, to) {
    var d = String(date || '').slice(0, 10);
    if (!from && !to) return true;
    if (!d) return false;
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }

  function activePartners(list) {
    return (list || []).filter(function (p) { return p && p.active !== false && p.id; });
  }

  // Build one row per attributed session, registration, host site, or organization.
  // A session-level referral (the host site or the organization that asked for
  // the class, or a Referral line saved on the session) takes the session's
  // revenue once. A registration on that same session for the same partner is
  // not listed again. A registration for a different partner keeps its own
  // dollars, and those dollars come off the session row.
  function buildReferralLines(input) {
    input = input || {};
    var partners = activePartners(input.partners);
    var sessions = input.sessions || [];
    var regs = input.registrations || [];
    var requests = input.requests || [];
    var audience = input.audience === 'partner' ? 'partner' : 'admin';
    var sessionById = {};
    sessions.forEach(function (s) { if (s && s.id) sessionById[s.id] = s; });

    var sessionPartner = {};
    var sessionSource = {};
    sessions.forEach(function (s) {
      if (!s || !s.id) return;
      var labeled = labeledReferralText(s.adminPrivateNotes);
      var byText = partnerForText(partners, labeled);
      var byId = partnerById(partners, s.referralPartnerId);
      var p = byId || byText;
      if (!p) return;
      sessionPartner[s.id] = p;
      sessionSource[s.id] = matchedSource(labeled, p) || (byId ? ((p.sources || [])[0] || '') : '');
    });
    requests.forEach(function (req) {
      if (!req || !req.sessionId || !sessionById[req.sessionId]) return;
      if (sessionPartner[req.sessionId]) return;
      var p = partnerById(partners, req.referralPartnerId) || partnerForText(partners, req.referralText);
      if (!p) return;
      sessionPartner[req.sessionId] = p;
      sessionSource[req.sessionId] = matchedSource(req.referralText, p) || ((p.sources || [])[0] || '');
    });

    var regClaims = [];
    regs.forEach(function (r) {
      if (!r || !r.id) return;
      var text = r.referralText || '';
      var p = partnerById(partners, r.referralPartnerId) || partnerForText(partners, text);
      if (!p) return;
      var whole = sessionPartner[r.sessionId];
      if (whole && whole.id === p.id) return;
      regClaims.push({ partner: p, reg: r, session: sessionById[r.sessionId] || null, text: text });
    });

    var lines = [];
    Object.keys(sessionPartner).forEach(function (sid) {
      var s = sessionById[sid];
      var p = sessionPartner[sid];
      if (!s || !p) return;
      var fin = s.finance || zeroMoney();
      var collected = Number(fin.collected) || 0;
      var expected = Number(fin.expected) || 0;
      var grossCollected = Number(fin.grossCollected) || 0;
      var grossExpected = Number(fin.grossExpected) || 0;
      var overhead = Number(fin.overhead) || 0;
      var pool0 = collected + expected;
      regClaims.forEach(function (c) {
        if (!c.session || c.session.id !== sid || c.partner.id === p.id) return;
        var m = c.reg.money || zeroMoney();
        collected -= Number(m.collected) || 0;
        expected -= Number(m.expected) || 0;
        grossCollected -= Number(m.grossCollected) || 0;
        grossExpected -= Number(m.grossExpected) || 0;
      });
      collected = round2(Math.max(0, collected));
      expected = round2(Math.max(0, expected));
      grossCollected = round2(Math.max(0, grossCollected));
      grossExpected = round2(Math.max(0, grossExpected));
      var pool1 = collected + expected;
      var overheadLeft = pool0 > 0 ? round2(overhead * (pool1 / pool0)) : round2(overhead);
      lines.push(moneyLine({
        partnerId: p.id,
        partnerName: p.name,
        splitPct: p.splitPct,
        lineKey: 'session:' + sid,
        grain: 'session',
        recordId: sid,
        sessionId: sid,
        date: ymd(s.date),
        source: sessionSource[sid] || '',
        label: sessionLabel(s),
        kindLabel: 'Session',
        collected: collected,
        expected: expected,
        grossCollected: grossCollected,
        grossExpected: grossExpected,
        overhead: overheadLeft
      }));
    });

    regClaims.forEach(function (c) {
      var s = c.session;
      var m = c.reg.money || zeroMoney();
      var fin = (s && s.finance) || zeroMoney();
      var part = (Number(m.collected) || 0) + (Number(m.expected) || 0);
      var whole = (Number(fin.collected) || 0) + (Number(fin.expected) || 0);
      var overhead = allocShare(fin.overhead, part, whole);
      lines.push(moneyLine({
        partnerId: c.partner.id,
        partnerName: c.partner.name,
        splitPct: c.partner.splitPct,
        lineKey: 'registration:' + c.reg.id,
        grain: 'registration',
        recordId: c.reg.id,
        sessionId: c.reg.sessionId || '',
        date: (s && ymd(s.date)) || ymd(c.reg.createdAt),
        source: matchedSource(c.text, c.partner) || ((c.partner.sources || [])[0] || ''),
        label: registrationLabel(c.reg, s, audience),
        kindLabel: 'Registration',
        collected: m.collected,
        expected: m.expected,
        grossCollected: m.grossCollected,
        grossExpected: m.grossExpected,
        overhead: overhead
      }));
    });

    requests.forEach(function (req) {
      if (!req || !req.id) return;
      if (req.sessionId && sessionById[req.sessionId]) return;
      var p = partnerById(partners, req.referralPartnerId) || partnerForText(partners, req.referralText);
      if (!p) return;
      var who = audience === 'partner' ? '' : String(req.who || '').trim();
      var kind = req.kind === 'organization' ? 'Organization' : 'Host site';
      lines.push(moneyLine({
        partnerId: p.id,
        partnerName: p.name,
        splitPct: p.splitPct,
        lineKey: 'request:' + req.id,
        grain: req.kind === 'organization' ? 'organization' : 'host',
        recordId: req.id,
        sessionId: '',
        date: ymd(req.createdAt),
        source: matchedSource(req.referralText, p) || ((p.sources || [])[0] || ''),
        label: kind + (who ? (': ' + who) : ''),
        kindLabel: kind,
        collected: 0,
        expected: 0,
        grossCollected: 0,
        grossExpected: 0,
        overhead: 0
      }));
    });

    var payouts = input.payouts || [];
    lines.forEach(function (line) {
      var paid = payouts.find(function (x) {
        return x && x.partnerId === line.partnerId && x.lineKey === line.lineKey && x.paidAt;
      });
      line.payoutStatus = line.partnerCollected > 0 ? (paid ? 'paid' : 'owed') : (paid ? 'paid' : 'none');
      line.paidAt = paid && paid.paidAt ? String(paid.paidAt) : '';
    });

    var from = input.from || '';
    var to = input.to || '';
    var filtered = lines.filter(function (line) { return inRange(line.date, from, to); });
    filtered.sort(function (a, b) {
      var d = String(a.date).localeCompare(String(b.date));
      if (d) return d;
      return String(a.label).localeCompare(String(b.label));
    });
    return filtered;
  }

  function summarizeReferralLines(lines) {
    var totals = {
      count: (lines || []).length,
      grossCollected: 0,
      grossExpected: 0,
      overhead: 0,
      netCollected: 0,
      netExpected: 0,
      partnerCollected: 0,
      ownerCollected: 0,
      partnerExpected: 0,
      ownerExpected: 0,
      owed: 0,
      paid: 0
    };
    (lines || []).forEach(function (line) {
      totals.grossCollected = round2(totals.grossCollected + line.grossCollected);
      totals.grossExpected = round2(totals.grossExpected + line.grossExpected);
      totals.overhead = round2(totals.overhead + line.overhead);
      totals.netCollected = round2(totals.netCollected + line.netCollected);
      totals.netExpected = round2(totals.netExpected + line.netExpected);
      totals.partnerCollected = round2(totals.partnerCollected + line.partnerCollected);
      totals.ownerCollected = round2(totals.ownerCollected + line.ownerCollected);
      totals.partnerExpected = round2(totals.partnerExpected + line.partnerExpected);
      totals.ownerExpected = round2(totals.ownerExpected + line.ownerExpected);
      if (line.payoutStatus === 'paid') totals.paid = round2(totals.paid + line.partnerCollected);
      else if (line.payoutStatus === 'owed') totals.owed = round2(totals.owed + line.partnerCollected);
    });
    return totals;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function money(n) {
    var v = round2(n);
    var sign = v < 0 ? '-' : '';
    var abs = Math.abs(v);
    var body = abs.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return sign + '$' + body;
  }

  function partnerSnapshot(lines) {
    return (lines || []).map(function (line) {
      return {
        partnerId: line.partnerId,
        partnerName: line.partnerName,
        splitPct: line.splitPct,
        lineKey: line.lineKey,
        grain: line.grain,
        recordId: line.recordId,
        sessionId: line.sessionId,
        date: line.date,
        source: line.source,
        label: line.label,
        kindLabel: line.kindLabel,
        grossCollected: line.grossCollected,
        grossExpected: line.grossExpected,
        collected: line.collected,
        expected: line.expected,
        overhead: line.overhead,
        overheadCollected: line.overheadCollected,
        overheadExpected: line.overheadExpected,
        netCollected: line.netCollected,
        netExpected: line.netExpected,
        partnerCollected: line.partnerCollected,
        ownerCollected: line.ownerCollected,
        partnerExpected: line.partnerExpected,
        ownerExpected: line.ownerExpected,
        payoutStatus: line.payoutStatus,
        paidAt: line.paidAt
      };
    });
  }

  function reportHtml(lines, options) {
    options = options || {};
    var readOnly = !!options.readOnly;
    var totals = summarizeReferralLines(lines);
    var rate = lines && lines.length ? Math.round(normalizeSplit(lines[0].splitPct) * 100) : Math.round(normalizeSplit(options.splitPct == null ? 0.4 : options.splitPct) * 100);
    var ownerRate = 100 - rate;
    var rows = (lines || []).map(function (line) {
      var status = line.payoutStatus === 'paid'
        ? 'Paid'
        : (line.payoutStatus === 'owed' ? 'Owed' : '—');
      var action = '';
      if (!readOnly && line.partnerCollected > 0) {
        var pid = escapeHtml(line.partnerId);
        var key = escapeHtml(line.lineKey);
        if (line.payoutStatus === 'paid') {
          action = '<button type="button" class="btn sm no-print" onclick="markReferralLine(\'' + pid + '\',\'' + key + '\',false)">Undo paid</button>';
        } else {
          action = '<button type="button" class="btn sm primary no-print" onclick="markReferralLine(\'' + pid + '\',\'' + key + '\',true)">Mark paid</button>';
        }
      }
      return '<tr>' +
        '<td>' + escapeHtml(line.date || '—') + '</td>' +
        '<td>' + escapeHtml(line.kindLabel) + '</td>' +
        '<td>' + escapeHtml(line.label) + '</td>' +
        '<td>' + escapeHtml(line.source) + '</td>' +
        '<td class="num">' + money(line.grossCollected) + '</td>' +
        '<td class="num">' + money(line.grossExpected) + '</td>' +
        '<td class="num">' + money(line.overhead) + '</td>' +
        '<td class="num">' + money(line.netCollected) + '</td>' +
        '<td class="num">' + money(line.netExpected) + '</td>' +
        '<td class="num">' + money(line.partnerCollected) + '</td>' +
        '<td class="num">' + money(line.ownerCollected) + '</td>' +
        '<td class="num">' + money(line.partnerExpected) + '</td>' +
        '<td>' + status + (action ? '<div class="no-print" style="margin-top:4px">' + action + '</div>' : '') + '</td>' +
        '</tr>';
    }).join('');
    if (!rows) {
      rows = '<tr class="empty-row"><td colspan="13">No attributed host sites, sessions, registrations, or organizations in this date range.</td></tr>';
    }
    var totalRow = '<tr class="referral-total">' +
      '<td colspan="4">Total</td>' +
      '<td class="num">' + money(totals.grossCollected) + '</td>' +
      '<td class="num">' + money(totals.grossExpected) + '</td>' +
      '<td class="num">' + money(totals.overhead) + '</td>' +
      '<td class="num">' + money(totals.netCollected) + '</td>' +
      '<td class="num">' + money(totals.netExpected) + '</td>' +
      '<td class="num">' + money(totals.partnerCollected) + '</td>' +
      '<td class="num">' + money(totals.ownerCollected) + '</td>' +
      '<td class="num">' + money(totals.partnerExpected) + '</td>' +
      '<td>Owed ' + money(totals.owed) + ' · Paid ' + money(totals.paid) + '</td>' +
      '</tr>';
    return '<div class="referral-print-sheet">' +
      '<table class="referral-report">' +
      '<thead><tr>' +
      '<th>Date</th><th>Kind</th><th>Item</th><th>Source</th>' +
      '<th>Gross collected</th><th>Gross expected</th><th>Overhead</th>' +
      '<th>Net collected</th><th>Net expected</th>' +
      '<th>Partner ' + rate + '%</th><th>Owner ' + ownerRate + '%</th>' +
      '<th>Partner if expected lands</th><th>Payout</th>' +
      '</tr></thead><tbody>' + rows + totalRow + '</tbody></table></div>';
  }

  return {
    DEFAULT_OVERHEAD_RULES: DEFAULT_OVERHEAD_RULES,
    OVERHEAD_SUMMARY: OVERHEAD_SUMMARY,
    round2: round2,
    normalizeSplit: normalizeSplit,
    normalizeRules: normalizeRules,
    referralSourceMatches: referralSourceMatches,
    labeledReferralText: labeledReferralText,
    registrationMoney: registrationMoney,
    buildReferralLines: buildReferralLines,
    summarizeReferralLines: summarizeReferralLines,
    partnerSnapshot: partnerSnapshot,
    reportHtml: reportHtml,
    escapeHtml: escapeHtml,
    money: money
  };
});
