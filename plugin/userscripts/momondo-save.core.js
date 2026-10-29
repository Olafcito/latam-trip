// Pure logic of the Momondo save userscript: URL to legs, parsed dialog to rows,
// the self-check, the inbox file and the GitHub issue links. No DOM and no GM_* here,
// so Node tests can load it. build.js puts it into momondo-save.user.js.
var MomondoSave = (function () {
  'use strict';

  var REPO = 'Olafcito/latam-trip';
  var BRANCH = 'main';
  var INBOX_DIR = 'data/sources/inbox';
  var SOURCE = 'momondo-manual';
  var MAX_URL = 7500;          // GitHub refuses new-issue links much longer than about 8 KB
  var MAX_BODY = 60000;        // GitHub issue bodies stop at 65536 characters
  var US = ['MIA', 'JFK', 'EWR', 'ATL', 'IAH', 'DFW', 'ORD', 'LAX', 'FLL', 'MCO', 'IAD', 'BOS', 'CLT', 'PHL'];
  var VIEWS = { price_a: 'Billigst', bestflight_a: 'Bedst', duration_a: 'Hurtigst' };

  // https://www.momondo.dk/flight-search/CPH-GUA/2026-12-03/VVI-CPH/2027-02-03?sort=price_a
  function parseSearchUrl(href) {
    var u = new URL(href);
    var parts = u.pathname.split('/').filter(Boolean);
    var i0 = parts.indexOf('flight-search');
    if (i0 < 0) return null;
    var legs = [], route = null;
    parts.slice(i0 + 1).forEach(function (tok) {
      var r = /^([A-Za-z]{3})-([A-Za-z]{3})$/.exec(tok);
      if (r) { route = { from: r[1].toUpperCase(), to: r[2].toUpperCase() }; return; }
      var d = /^(\d{4}-\d{2}-\d{2})/.exec(tok);
      if (!d) return;
      if (route) { legs.push({ from: route.from, to: route.to, date: d[1] }); route = null; }
      else if (legs.length === 1) {
        // a second date right after the first one is the way home of a return search
        legs.push({ from: legs[0].to, to: legs[0].from, date: d[1] });
      }
    });
    if (!legs.length) return null;
    var sort = u.searchParams.get('sort') || '';
    return { legs: legs, sort: sort, view: VIEWS[sort] || null, structure: structureOf(legs), link: linkOf(legs) };
  }

  // Same rules as momondo_lines.py
  function structureOf(L) {
    if (L.length === 1) return 'one_way';
    if (L.length === 2 && L[0].from === L[1].to && L[0].to === L[1].from) return 'return';
    if (L.length === 2) return 'open_jaw';
    return 'multi_city';
  }

  function linkOf(L) {
    if (structureOf(L) === 'return') {
      return 'https://www.momondo.dk/flight-search/' + L[0].from + '-' + L[0].to + '/' + L[0].date + '/' + L[1].date;
    }
    return 'https://www.momondo.dk/flight-search/' + L.map(function (l) { return l.from + '-' + l.to + '/' + l.date; }).join('/');
  }

  function isoNow(d) {
    return (d || new Date()).toISOString().slice(0, 19) + 'Z';
  }

  function stamp(d) {
    return isoNow(d).replace(/[-:]/g, '');      // 20261029T143012Z
  }

  function carrierOf(f) {
    var i = f.lastIndexOf(' ');
    return i > 0 ? f.slice(0, i) : f;
  }

  // A leg as momondo_lines.py writes it, or null when the parser found nothing usable.
  function legRow(l) {
    if (!l || !l.dep || /undefined/.test(l.dep) || /undefined/.test(l.arr || '')) return null;
    var flights = (l.flights || []).filter(Boolean);
    var carriers = Array.from(new Set(flights.map(carrierOf))).sort();
    return {
      dep: l.dep, arr: l.arr, hours: +l.hours || 0, stops: +l.stops || 0,
      via: (l.via || []).slice(), layover_h: (l.layover_h || []).slice(),
      carriers: carriers, flights: flights, overnight_layover: !!l.overnight_layover
    };
  }

  // p: parseDlg result plus rank and cardPrice. ctx: {legs, structure, link, view, observedAt, agent, taskId, tripName, parserVersion}
  function buildRow(p, ctx) {
    var n = ctx.legs.length;
    var bag = p.bagSeg || '';
    var cab = ((/(\d) x håndbagage/.exec(bag) || [])[0]) || (/Gebyr for håndbagage/.test(bag) ? 'fee' : '');
    var chk = /Gebyr for indtjekket/.test(bag) ? 'paid' : (/(\d) x indtjekket/.test(bag) ? 'incl' : '');
    var changeable = /Ændring af billet mod gebyr/.test(bag) ? 'fee' : 'unknown';
    var price = p.cardPrice || p.price || 0;
    var st = !!p.selfNote;
    var parsed = p.legs || [];
    var legs = [];
    var flags = [];
    for (var i = 0; i < n; i++) legs.push(legRow(parsed[i]));
    if (st) flags.push('self_transfer');
    legs.forEach(function (d, i) {
      if (!d) { flags.push('incomplete'); return; }
      if (d.hours > 30) flags.push('over_30h');
      if (parsed[i] && parsed[i]._apt) flags.push('airport_change');
    });
    if (legs.some(function (d) { return d && d.via.some(function (v) { return US.indexOf(v) >= 0; }); })) flags.push('us_transit');
    if (p.brand && /basic/i.test(p.brand)) flags.push('basic_fare');
    if (/mix/i.test(p.site || '') || /mix & match/i.test([p.site, p.brand, p.alt, bag].join(' '))) flags.push('mix_match');
    flags = Array.from(new Set(flags)).sort();
    var other = (p.alt || '') + (p.cardPrice && p.price && p.price !== p.cardPrice ? ' | offerprice ' + p.price : '');
    var notes = 'site=' + (p.site || '') + '; other=' + other + '; protection=' + (p.prot ? 1 : 0);
    if (ctx.view) notes += '; view=' + ctx.view;
    notes += '; parser=' + ctx.parserVersion;
    var row = {
      agent: ctx.agent || 'manual', task_id: ctx.taskId, source: SOURCE, observed_at: ctx.observedAt,
      structure: ctx.structure, legs_requested: ctx.legs.map(function (l) { return { from: l.from, to: l.to, date: l.date }; }),
      rank: p.rank == null ? null : +p.rank, price: price, currency: 'DKK', price_dkk: price || null,
      tickets: st ? 2 : null, self_transfer: st, fare_brand: p.brand || null, cabin_bag: cab || null, checked_bag: chk || null,
      out: legs[0], home: n > 1 ? legs[n - 1] : null, mid: n > 2 ? legs.slice(1, -1) : [],
      us_transit: flags.indexOf('us_transit') >= 0, changeable: changeable, link: ctx.link, flags: flags, notes: notes
    };
    if (ctx.tripName) row.trip_name = ctx.tripName;
    return row;
  }

  // Skips what lines() in the crawler skips: cards that failed to open, duplicates and ad-only cards.
  function usable(p) {
    return p && !p.err && !p.dup && p.site !== 'Sponsoreret' && p.site !== 'Annonce';
  }

  function signature(p) {
    return (p.legs || []).map(function (l) { return (l.flights || []).join('+') + l.dep; }).join('/') + '#' + (p.cardPrice || p.price);
  }

  // results: [{view, items: [parsed results]}]. Duplicates across views are kept once.
  function buildPriceRows(results, ctx) {
    var rows = [], seen = {};
    results.forEach(function (r) {
      r.items.filter(usable).forEach(function (p) {
        var sig = signature(p);
        if (seen[sig]) {
          if (r.view && seen[sig].notes.indexOf('view=' + r.view) < 0) seen[sig].notes = seen[sig].notes.replace(/; view=([^;]*)/, '; view=$1+' + r.view);
          return;
        }
        var row = buildRow(p, Object.assign({}, ctx, { view: r.view }));
        seen[sig] = row;
        rows.push(row);
      });
    });
    return rows;
  }

  function emptyLeg(l) {
    return !l || !l.dep || !l.flights || !l.flights.length;
  }

  // The rule behind "Not saved": nothing found, or a row with an empty leg or no price.
  function selfCheck(rows, nLegs) {
    if (!rows || !rows.length) return { ok: false, reason: 'no rows were read from the page' };
    var noLegs = rows.filter(function (r) {
      var legs = [r.out].concat(r.mid || []);
      if (nLegs > 1) legs.push(r.home);
      return legs.some(emptyLeg);
    }).length;
    if (noLegs) return { ok: false, reason: noLegs + ' of ' + rows.length + ' rows have empty legs' };
    var noPrice = rows.filter(function (r) { return !r.price_dkk; }).length;
    if (noPrice) return { ok: false, reason: noPrice + ' of ' + rows.length + ' rows have no price' };
    return { ok: true, reason: '' };
  }

  function inboxPath(d) {
    return INBOX_DIR + '/manual-' + stamp(d) + '.jsonl';
  }

  function inboxContent(rows) {
    return rows.map(function (r) { return JSON.stringify(r); }).join('\n') + '\n';
  }

  function base64Utf8(s) {
    if (typeof Buffer !== 'undefined') return Buffer.from(s, 'utf8').toString('base64');
    var bytes = new TextEncoder().encode(s), bin = '';
    for (var i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
    return btoa(bin);
  }

  function apiHeaders(token) {
    return {
      'Authorization': 'Bearer ' + token,
      'Accept': 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      'Content-Type': 'application/json'
    };
  }

  function contentsRequest(path, content, token, message) {
    return {
      method: 'PUT',
      url: 'https://api.github.com/repos/' + REPO + '/contents/' + path,
      headers: apiHeaders(token),
      data: JSON.stringify({ message: message, content: base64Utf8(content), branch: BRANCH })
    };
  }

  function issueRequest(issue, token) {
    return {
      method: 'POST',
      url: 'https://api.github.com/repos/' + REPO + '/issues',
      headers: apiHeaders(token),
      data: JSON.stringify({ title: issue.title, body: issue.body, labels: ['claude-task'] })
    };
  }

  // Same format as docs/claude-tasks.md: one human line, then exactly one fenced json block.
  function issueBody(line, task) {
    return line + '\n\n```json\n' + JSON.stringify(task) + '\n```\n';
  }

  function issueUrl(title, body) {
    return 'https://github.com/' + REPO + '/issues/new?labels=claude-task&title=' +
      encodeURIComponent(title) + '&body=' + encodeURIComponent(body);
  }

  function routeText(legs) {
    return legs.map(function (l) { return l.from + ' to ' + l.to + ' ' + l.date; }).join(', ');
  }

  function shortRoute(legs) {
    return legs.map(function (l) { return l.from + ' to ' + l.to; }).join(', ');
  }

  // {title, body, url, clipboard}. clipboard is null when the whole body fits in the link.
  function importIssue(rows, ctx) {
    var trip = ctx.tripName;
    var title = '[import_quotes] ' + (trip ? 'Momondo trip "' + trip + '", ' + shortRoute(ctx.legs)
      : rows.length + (rows.length === 1 ? ' Momondo price, ' : ' Momondo prices, ') + shortRoute(ctx.legs));
    var line = (trip ? 'Trip "' + trip + '" saved' : rows.length + ' prices saved') +
      ' from Momondo (' + routeText(ctx.legs) + '). Put the rows in the inbox and run tripdb build.';
    var task = { type: 'import_quotes', source: SOURCE, count: rows.length, legs: ctx.legs, page: ctx.page, rows: rows, from: 'userscript' };
    if (trip) task.trip_name = trip;
    var body = issueBody(line, task);
    var url = issueUrl(title, body);
    if (url.length <= MAX_URL) return { title: title, body: body, url: url, clipboard: null };
    var shortTask = Object.assign({}, task, { rows: [], rows_on_clipboard: rows.length });
    var shortBody = issueBody(line + ' The rows were too long for a link and are on your clipboard: select all of this text and paste over it before you press Submit.', shortTask);
    return { title: title, body: shortBody, url: issueUrl(title, shortBody), clipboard: body };
  }

  // Keeps the start of the legs and the start of the booking offers, cuts the middle.
  function cutText(text, max) {
    if (text.length <= max) return text;
    var k = text.indexOf('Bookingmuligheder');
    var marker = function (n) { return '\n[... ' + n + ' characters cut ...]\n'; };
    if (k > 0 && k < text.length - 1) {
      var tailLen = Math.min(text.length - k, Math.floor(max * 0.3));
      var headLen = Math.max(0, max - tailLen - 40);
      var head = text.slice(0, Math.min(headLen, k));
      var tail = text.slice(k, k + tailLen);
      return head + marker(text.length - head.length - tail.length) + tail;
    }
    var h = text.slice(0, Math.max(0, max - 40));
    return h + marker(text.length - h.length);
  }

  // ctx: {reason, legs, page, view, action, parserVersion, dialogText}
  function fixIssue(ctx) {
    var title = '[fix_parser] Momondo dialog not parsed (parser ' + ctx.parserVersion + ')';
    var line = 'The Momondo save button could not read this page: ' + ctx.reason +
      '. Reproduce with the dialog text below, fix parseDlg in momondo_crawler.js, bump PARSER_VERSION and report here.';
    var full = String(ctx.dialogText || '');
    var mk = function (text, cut) {
      var task = {
        type: 'fix_parser', parser_version: ctx.parserVersion, reason: ctx.reason, action: ctx.action,
        view: ctx.view || null, page: ctx.page, legs: ctx.legs || [], dialog_chars: full.length,
        dialog_text: text, from: 'userscript'
      };
      if (cut) task.dialog_cut = true;
      return task;
    };
    var fullBody = issueBody(line, mk(cutText(full, MAX_BODY - 3000), full.length > MAX_BODY - 3000));
    var url = issueUrl(title, fullBody);
    if (url.length <= MAX_URL) return { title: title, body: fullBody, url: url, clipboard: null };
    var max = 4000, body;
    do {
      body = issueBody(line + ' The dialog text was cut to fit the link. The full text is on your clipboard: select all of this text and paste over it to attach all of it.', mk(cutText(full, max), true));
      url = issueUrl(title, body);
      max = Math.floor(max * 0.8);
    } while (url.length > MAX_URL && max > 100);
    return { title: title, body: body, url: url, clipboard: fullBody };
  }

  return {
    REPO: REPO, BRANCH: BRANCH, SOURCE: SOURCE, MAX_URL: MAX_URL, VIEWS: VIEWS,
    parseSearchUrl: parseSearchUrl, structureOf: structureOf, linkOf: linkOf, isoNow: isoNow, stamp: stamp,
    buildRow: buildRow, buildPriceRows: buildPriceRows, usable: usable, selfCheck: selfCheck,
    inboxPath: inboxPath, inboxContent: inboxContent, base64Utf8: base64Utf8,
    contentsRequest: contentsRequest, issueRequest: issueRequest, issueBody: issueBody, issueUrl: issueUrl,
    importIssue: importIssue, fixIssue: fixIssue, cutText: cutText
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MomondoSave;
