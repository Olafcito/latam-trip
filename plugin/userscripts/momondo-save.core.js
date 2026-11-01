// Pure logic of the Momondo save userscript: URL to legs, parsed dialog to rows,
// the self-check, the inbox file, the Supabase requests and the link a Pick opens. No DOM and no GM_* here,
// so Node tests can load it. build.js puts it into momondo-save.user.js.
var MomondoSave = (function () {
  'use strict';

  var SOURCE = 'momondo-manual';
  var MAX_DIALOG = 200000;     // a fix_parser task carries at most this much dialog text
  var US = ['MIA', 'JFK', 'EWR', 'ATL', 'IAH', 'DFW', 'ORD', 'LAX', 'FLL', 'MCO', 'IAD', 'BOS', 'CLT', 'PHL'];
  var VIEWS = { price_a: 'Billigst', bestflight_a: 'Bedst', duration_a: 'Hurtigst' };
  var PLANNER = 'http://localhost:5198/';

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

  // The trip a planner link names: ...?sort=price_a#latam=<trip id>
  function tripOf(hash) {
    var m = /[#&]latam=([^&]*)/.exec(hash || '');
    if (!m) return null;
    try { return decodeURIComponent(m[1]) || null; } catch (e) { return null; }
  }

  // The flight of a one-way row as the planner reads it. p is what the row was built from.
  function pickOf(row, p) {
    var l = row.out, q = row.legs_requested[0];
    return {
      from: q.from, to: q.to, dep: l.dep, arr: l.arr, hours: l.hours, stops: l.stops,
      via: l.via, layover_h: l.layover_h, carriers: l.carriers, overnight: l.overnight_layover,
      price: row.price_dkk, site: p.site || null, seen: row.observed_at, self_transfer: row.self_transfer,
      airport_change: row.flags.indexOf('airport_change') >= 0,
      fare_brand: row.fare_brand, cabin_bag: row.cabin_bag, checked_bag: row.checked_bag
    };
  }

  // Whether the dialog that opened was the card that was pressed: the card shows the departure time.
  function pickMatches(cardText, pick) {
    return (cardText || '').indexOf(pick.dep.slice(11, 16)) >= 0;
  }

  function pickUrl(pick, trip) {
    return PLANNER + '?' + (trip ? 'trip=' + encodeURIComponent(trip) + '&' : '') + 'pick=' + encodeURIComponent(JSON.stringify(pick));
  }

  function inboxFile(d) {
    return 'manual-' + stamp(d) + '.jsonl';
  }

  function inboxContent(rows) {
    return rows.map(function (r) { return JSON.stringify(r); }).join(String.fromCharCode(10)) + String.fromCharCode(10);
  }

  // cfg: {url, key, token}. The key is the publishable key, which only lets the two functions be called.
  function rpcRequest(cfg, name, body) {
    return {
      method: 'POST',
      url: String(cfg.url).replace(/\/+$/, '') + '/rest/v1/rpc/' + name,
      headers: { 'apikey': cfg.key, 'Content-Type': 'application/json' },
      data: JSON.stringify(body)
    };
  }

  function inboxRequest(cfg, file, rows) {
    return rpcRequest(cfg, 'submit_inbox', { token: cfg.token, file: file, rows: rows });
  }

  function taskRequest(cfg, task) {
    return rpcRequest(cfg, 'submit_task', { token: cfg.token, task: task });
  }

  // True when the three settings are there. A host that is not a Supabase address is refused, as @connect only allows those.
  function configured(cfg) {
    return !!(cfg && cfg.token && cfg.key && /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(String(cfg.url || '')));
  }

  // What a failed answer means to the person pressing the button.
  function answerText(status) {
    if (status === 401 || status === 403 || status === 400) return 'Supabase answered ' + status + ', check the token and the project in the Tampermonkey menu';
    return 'Supabase answered ' + (status || 'nothing');
  }

  // ctx: {reason, legs, page, view, action, parserVersion, dialogText}. The task JSON of docs/claude-tasks.md, with a title for the table.
  function fixTask(ctx) {
    var full = String(ctx.dialogText || '');
    var task = {
      type: 'fix_parser', title: '[fix_parser] Momondo dialog not parsed (parser ' + ctx.parserVersion + ')',
      parser_version: ctx.parserVersion, reason: ctx.reason, action: ctx.action,
      view: ctx.view || null, page: ctx.page, legs: ctx.legs || [], dialog_chars: full.length,
      dialog_text: full.length > MAX_DIALOG ? full.slice(0, MAX_DIALOG) : full, from: 'userscript'
    };
    if (full.length > MAX_DIALOG) task.dialog_cut = true;
    task.note = 'The Momondo save button could not read this page: ' + ctx.reason +
      '. Reproduce with the dialog text, fix parseDlg in momondo_crawler.js, bump PARSER_VERSION and report in the result.';
    return task;
  }

  return {
    SOURCE: SOURCE, VIEWS: VIEWS,
    parseSearchUrl: parseSearchUrl, structureOf: structureOf, linkOf: linkOf, isoNow: isoNow, stamp: stamp,
    buildRow: buildRow, buildPriceRows: buildPriceRows, usable: usable, selfCheck: selfCheck,
    inboxFile: inboxFile, inboxContent: inboxContent, rpcRequest: rpcRequest, inboxRequest: inboxRequest, taskRequest: taskRequest,
    configured: configured, answerText: answerText, fixTask: fixTask,
    tripOf: tripOf, pickOf: pickOf, pickMatches: pickMatches, pickUrl: pickUrl
  };
})();
if (typeof module !== 'undefined' && module.exports) module.exports = MomondoSave;
