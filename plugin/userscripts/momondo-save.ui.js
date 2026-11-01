// Browser side of the Momondo save userscript: the two buttons, Pick on each result, reading the page
// with the crawler (CR.parseDlg and CR.crawl), and writing to Supabase. build.js puts it into momondo-save.user.js.
/* global CR, MomondoSave, MutationObserver, sessionStorage, GM_getValue, GM_setValue, GM_deleteValue, GM_registerMenuCommand, GM_xmlhttpRequest, GM_setClipboard, GM_openInTab */
var MomondoSaveUI = (function () {
  'use strict';
  var M = MomondoSave;
  var KEYS = { url: 'supabase_url', key: 'supabase_key', token: 'inbox_token' };
  var TRIP_KEY = 'latam-trip';
  var MAX_CARDS = 40;
  var busy = false;
  var ui = { picks: [] };
  var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };

  function status(text, kind) {
    ui.status.textContent = text;
    ui.status.dataset.kind = kind || '';
  }

  function panel() {
    var host = document.createElement('div');
    host.id = 'latam-momondo-save';
    host.style.cssText = 'position:fixed;left:12px;bottom:12px;z-index:2147483000;';
    var root = host.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<style>' +
      '.box{font:12px/1.35 system-ui,sans-serif;background:#fff;color:#1d1d1f;border:1px solid #d0d0d6;border-radius:10px;padding:8px;box-shadow:0 4px 16px rgba(0,0,0,.12);max-width:260px}' +
      '.row{display:flex;gap:6px}' +
      'button{font:inherit;font-weight:600;border:1px solid #c4c4cc;background:#f6f6f8;border-radius:7px;padding:5px 9px;cursor:pointer}' +
      'button:hover{background:#ececf1}button:disabled{opacity:.5;cursor:default}' +
      '.st{margin-top:6px;min-height:1em}.st:empty{display:none}' +
      '.st[data-kind=ok]{color:#1a7f37}.st[data-kind=bad]{color:#b42318}' +
      '</style>' +
      '<div class="box"><div class="row"><button id="p" title="Save every result in the Billigst and Bedst lists">Save prices</button>' +
      '<button id="t" title="Save the opened result as a named trip">Save trip</button></div><div class="st" id="s"></div></div>';
    document.body.appendChild(host);
    ui.prices = root.getElementById('p');
    ui.trip = root.getElementById('t');
    ui.status = root.getElementById('s');
    ui.prices.addEventListener('click', function () { guard(savePrices); });
    ui.trip.addEventListener('click', function () { guard(saveTrip); });
  }

  function lock(on) {
    ui.prices.disabled = ui.trip.disabled = on;
    ui.picks = ui.picks.filter(function (b) { return b.isConnected !== false; });
    ui.picks.forEach(function (b) { b.disabled = on; });
  }

  async function guard(fn, failed) {
    if (busy) return;
    busy = true;
    lock(true);
    try { await fn(); }
    catch (e) { status((failed || 'Not saved') + ': ' + (e && e.message ? e.message : e), 'bad'); }
    finally { busy = false; lock(false); }
  }

  function request(spec) {
    return new Promise(function (resolve) {
      GM_xmlhttpRequest(Object.assign({}, spec, {
        onload: function (r) { resolve({ status: r.status, text: r.responseText || '' }); },
        onerror: function () { resolve({ status: 0, text: 'network error' }); },
        ontimeout: function () { resolve({ status: 0, text: 'timeout' }); },
        timeout: 30000
      }));
    });
  }

  function settings() {
    return { url: GM_getValue(KEYS.url, ''), key: GM_getValue(KEYS.key, ''), token: GM_getValue(KEYS.token, '') };
  }

  function context() {
    var s = M.parseSearchUrl(location.href);
    if (!s) throw new Error('this page is not a Momondo flight search');
    var now = new Date();
    return {
      legs: s.legs, structure: s.structure, link: s.link, page: location.href, sort: s.sort,
      observedAt: M.isoNow(now), now: now, taskId: 'manual-' + M.stamp(now), agent: 'manual',
      parserVersion: CR.PARSER_VERSION
    };
  }

  function currentView(sort) {
    if (M.VIEWS[sort]) return M.VIEWS[sort];
    var sel = Array.from(document.querySelectorAll('[aria-selected="true"],[aria-checked="true"],[aria-pressed="true"]'))
      .map(function (e) { return (e.innerText || '').trim().split('\n')[0].trim(); })
      .find(function (t) { return t === 'Billigst' || t === 'Bedst' || t === 'Hurtigst'; });
    return sel || 'Bedst';
  }

  // The crawler's test for a result dialog first. If Momondo changed its text, any dialog
  // with clock times still counts, so the self-check can report it instead of "open a result first".
  function dialog() {
    var ds = Array.from(document.querySelectorAll('[role="dialog"]')).filter(function (x) { return !/drawer/i.test(String(x.className)); });
    return ds.find(function (x) { return /(Fly \d+|Afrejse|Udrejse|Hjemrejse) •|\d\d:\d\d - \d\d:\d\d\(/.test(x.innerText); }) ||
      ds.find(function (x) { return /\d{1,2}:\d\d/.test(x.innerText); });
  }

  function segCount(d) { return (d.innerText.match(/\d\d:\d\d - \d\d:\d\d(?:\+\d)?\(/g) || []).length; }
  function legCount(d) { return (d.innerText.match(/(Fly \d+|Afrejse|Udrejse|Hjemrejse) •/g) || []).length; }

  // Opens every leg of the dialog, the same header class the crawler clicks.
  async function expand(d) {
    var before = segCount(d);
    var hs = Array.from(d.querySelectorAll('.E69K-leg-dropdown-header[role="button"]'));
    var closed = hs.filter(function (b) { return b.getAttribute('aria-expanded') === 'false'; });
    var known = hs.some(function (b) { return b.hasAttribute('aria-expanded'); });
    if (closed.length) closed.forEach(function (b) { b.click(); });
    else if (!known && before < hs.length) hs.forEach(function (b) { b.click(); });
    else return;
    for (var w = 0; w < 10; w++) {
      await sleep(400);
      if (segCount(d) >= Math.max(legCount(d), 1)) break;
    }
    if (segCount(d) < before) hs.forEach(function (b) { b.click(); });
    await sleep(300);
  }

  function cardNumbers() {
    return Array.from(document.querySelectorAll('[role="group"]'))
      .map(function (e) { return (/^Resultat nr\. (\d+)$/.exec(e.getAttribute('aria-label') || '') || [])[1]; })
      .filter(function (x) { return x != null; }).map(Number).sort(function (a, b) { return a - b; });
  }

  async function waitDone(maxMs) {
    for (var t = 0; t < maxMs; t += 1000) {
      if (/Færdig/.test(document.body.innerText) && cardNumbers().length > 3) return true;
      await sleep(1000);
    }
    return false;
  }

  async function closeDialog() {
    if (location.hash === '#dialog' && dialog()) { history.back(); await sleep(900); }
  }

  function viewTab(name) {
    var c = Array.from(document.querySelectorAll('[role="tab"],[role="radio"],button,a')).filter(function (e) {
      var t = (e.innerText || '').trim();
      return t.split('\n')[0].trim() === name && t.length < 80 && e.offsetParent !== null;
    });
    c.sort(function (a, b) { return a.innerText.length - b.innerText.length; });
    return c[0] || null;
  }

  async function switchView(name) {
    var tab = viewTab(name);
    if (!tab) return false;
    var first = function () {
      var g = document.querySelector('[role="group"][aria-label^="Resultat nr."]');
      return g ? g.innerText : '';
    };
    var was = first();
    tab.click();
    for (var w = 0; w < 20; w++) {
      await sleep(500);
      if (first() !== was || currentView(new URL(location.href).searchParams.get('sort') || '') === name) break;
    }
    await waitDone(30000);
    await sleep(1500);
    return true;
  }

  // Opens each result of the current list with the crawler, one card at a time for progress.
  async function readView(view, dates) {
    var n = Math.min(cardNumbers().length, MAX_CARDS);
    var items = [], texts = [];
    for (var i = 0; i < n; i++) {
      status('Reading ' + view + ' ' + (i + 1) + ' of ' + n);
      CR.__dlg0 = null;
      var r = (await CR.crawl(i, i + 1, dates))[0] || { err: 'nocard' };
      items.push(r);
      texts.push(CR.__dlg0 || '');
    }
    return { view: view, items: items, texts: texts };
  }

  function firstCardText() {
    var g = document.querySelector('[role="group"][aria-label^="Resultat nr."]');
    return g ? 'No dialog could be read. Text of the first result card:\n' + g.innerText : 'No result cards found on the page.';
  }

  // Finds the dialog text that best shows what went wrong.
  function failingText(results, ctx) {
    for (var v = 0; v < results.length; v++) {
      var r = results[v];
      for (var i = 0; i < r.items.length; i++) {
        if (!M.usable(r.items[i])) continue;
        var row = M.buildRow(r.items[i], Object.assign({}, ctx, { view: r.view }));
        if (!M.selfCheck([row], ctx.legs.length).ok) return r.texts[i] || '';
      }
    }
    for (var w = 0; w < results.length; w++) {
      var t = results[w].texts.find(Boolean);
      if (t) return t;
    }
    return firstCardText();
  }

  async function reportFix(ctx, action, view, reason, text) {
    var task = M.fixTask({
      reason: reason, legs: ctx.legs, page: ctx.page, view: view, action: action,
      parserVersion: ctx.parserVersion, dialogText: text
    });
    var cfg = settings();
    if (M.configured(cfg)) {
      var res = await request(M.taskRequest(cfg, task));
      if (res.status === 200) {
        var id = (/(\d+)/.exec(res.text) || [])[1];
        return 'A fix_parser task was filed' + (id ? ' (#' + id + ')' : '') + '.';
      }
      GM_setClipboard(JSON.stringify(task), 'text');
      return M.answerText(res.status) + '. The fix_parser task is on the clipboard.';
    }
    GM_setClipboard(JSON.stringify(task), 'text');
    return 'Supabase is not set up in the Tampermonkey menu. The fix_parser task is on the clipboard.';
  }

  async function write(rows, ctx, what) {
    var cfg = settings();
    var content = M.inboxContent(rows);
    var failed = 'Supabase is not set up in the Tampermonkey menu';
    if (M.configured(cfg)) {
      var res = await request(M.inboxRequest(cfg, M.inboxFile(ctx.now), rows));
      if (res.status === 200) return { ok: true, text: 'Saved ' + what };
      failed = M.answerText(res.status);
    }
    GM_setClipboard(content, 'text');
    return { ok: false, text: 'Not saved: ' + failed + '. The rows are on the clipboard.' };
  }

  async function savePrices() {
    var ctx = context();
    var dates = ctx.legs.map(function (l) { return l.date; });
    await closeDialog();
    status('Waiting for the search to finish');
    await waitDone(30000);
    var start = currentView(ctx.sort);
    var order = start === 'Billigst' ? ['Billigst', 'Bedst'] : start === 'Bedst' ? ['Bedst', 'Billigst'] : [start, 'Billigst', 'Bedst'];
    var results = [], skipped = [];
    for (var i = 0; i < order.length; i++) {
      if (i > 0) {
        status('Switching to ' + order[i]);
        if (!(await switchView(order[i]))) { skipped.push(order[i]); continue; }
      }
      results.push(await readView(order[i], dates));
    }
    if (results.length > 1) await switchView(start);
    var rows = M.buildPriceRows(results, ctx);
    var check = M.selfCheck(rows, ctx.legs.length);
    if (!check.ok) {
      var fix = await reportFix(ctx, 'save_prices', results.map(function (r) { return r.view; }).join('+'), check.reason, failingText(results, ctx));
      status('Not saved: ' + check.reason + '. ' + fix, 'bad');
      return;
    }
    var what = rows.length + (rows.length === 1 ? ' price' : ' prices');
    var res = await write(rows, ctx, what);
    status(res.text + (skipped.length ? ' (no ' + skipped.join(' or ') + ' tab found)' : ''), res.ok ? 'ok' : 'bad');
  }

  async function saveTrip() {
    var ctx = context();
    var d = dialog();
    if (!d) { status('Not saved: open a result first, then press Save trip', 'bad'); return; }
    var name = window.prompt('Name for this trip');
    if (name == null || !name.trim()) { status('Not saved: no name given', 'bad'); return; }
    ctx.tripName = name.trim();
    status('Reading the opened result');
    await expand(d);
    var text = d.innerText;
    var p = CR.parseDlg(text, ctx.legs.map(function (l) { return l.date; }));
    p.rank = null;
    var view = currentView(ctx.sort);
    var row = M.buildRow(p, Object.assign({}, ctx, { view: view }));
    var check = M.selfCheck([row], ctx.legs.length);
    if (!check.ok) {
      var fix = await reportFix(ctx, 'save_trip', view, check.reason, text);
      status('Not saved: ' + check.reason + '. ' + fix, 'bad');
      return;
    }
    var res = await write([row], ctx, 'trip "' + ctx.tripName + '"');
    status(res.text, res.ok ? 'ok' : 'bad');
  }

  // Momondo can drop the address's #latam=<trip> while it works, so it is kept for the tab.
  function rememberTrip() {
    var trip = M.tripOf(location.hash);
    try {
      if (trip) sessionStorage.setItem(TRIP_KEY, trip);
      return trip || sessionStorage.getItem(TRIP_KEY);
    } catch (e) { return trip; }
  }

  async function pick(card, button) {
    var ctx = context();
    var num = Number((/\d+$/.exec(card.getAttribute('aria-label')) || [])[0]);
    var at = cardNumbers().indexOf(num);
    if (at < 0) { status('Not picked: the list changed, press Pick again', 'bad'); return; }
    var was = card.innerText, y = window.scrollY;
    button.textContent = 'Reading';
    status('Reading the flight');
    await closeDialog();
    CR.__dlg0 = null;
    var r = (await CR.crawl(at, at + 1, [ctx.legs[0].date]))[0] || { err: 'nocard' };
    window.scrollTo(0, y);
    button.textContent = 'Pick';
    if (!M.usable(r)) { status('Not picked: this result could not be opened', 'bad'); return; }
    var view = currentView(ctx.sort);
    var row = M.buildRow(r, Object.assign({}, ctx, { view: view }));
    var check = M.selfCheck([row], 1);
    if (!check.ok) {
      var fix = await reportFix(ctx, 'pick', view, check.reason, CR.__dlg0 || firstCardText());
      status('Not picked: ' + check.reason + '. ' + fix, 'bad');
      return;
    }
    var flight = M.pickOf(row, r);
    if (!M.pickMatches(was, flight)) { status('Not picked: another result opened, press Pick again', 'bad'); return; }
    GM_openInTab(M.pickUrl(flight, ui.tripId), { active: true });
    // a leg has one flight, so the last Pick is the only one lit
    ui.picks.forEach(function (b) { b.textContent = 'Pick'; delete b.dataset.done; });
    button.textContent = 'Picked';
    button.dataset.done = 'true';
    status('Picked ' + flight.dep.slice(11, 16) + ', opening the planner', 'ok');
  }

  function pickButton(card) {
    var host = document.createElement('span');
    host.setAttribute('data-latam-pick', '');
    var root = host.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<style>' +
      ':host{display:block;margin-top:6px}' +
      'button{display:block;width:100%;height:36px;border:0;border-radius:6px;background:#f2b544;color:#13202a;font:inherit;font-size:14px;font-weight:700;cursor:pointer;transition:transform 120ms ease-out,background 120ms ease-out}' +
      'button:hover{background:#f7c766}button:active{transform:scale(.97)}' +
      'button:focus-visible{outline:2px solid #f2b544;outline-offset:2px}' +
      'button:disabled{opacity:.5;cursor:default}' +
      'button[data-done]{background:#58d68d}' +
      '@media (prefers-reduced-motion:reduce){button{transition:none}button:active{transform:none}}' +
      '</style>' +
      '<button id="k" type="button" title="Use this flight for the leg in the planner">Pick</button>';
    var button = root.getElementById('k');
    button.disabled = busy;
    button.addEventListener('click', function (e) {
      // the press is for this button and not for the card under it
      if (e) { e.preventDefault(); e.stopPropagation(); }
      guard(function () { return pick(card, button); }, 'Not picked');
    });
    ui.picks.push(button);
    return host;
  }

  // A Pick under each Vælg. The planner's Momondo links are one way, so other searches have none.
  function decorate() {
    var s = M.parseSearchUrl(location.href);
    if (!s || s.legs.length !== 1) return;
    Array.from(document.querySelectorAll('[role="group"][aria-label^="Resultat nr."]')).forEach(function (card) {
      if (card.querySelector('[data-latam-pick]')) return;
      var choose = Array.from(card.querySelectorAll('button,a,[role="button"]')).find(function (b) { return /^Vælg$/.test((b.innerText || '').trim()); });
      if (choose && choose.parentElement) choose.parentElement.insertBefore(pickButton(card), choose.nextSibling);
    });
  }

  // Results load in and the list is redrawn when it is sorted or filtered.
  function watch() {
    var wait = null;
    decorate();
    new MutationObserver(function () {
      if (wait) return;
      wait = setTimeout(function () { wait = null; decorate(); }, 250);
    }).observe(document.body, { childList: true, subtree: true });
  }

  function menu() {
    function ask(label, id, current) {
      var v = window.prompt(label, current);
      if (v == null) return null;
      return v.trim();
    }
    GM_registerMenuCommand('Set Supabase project', function () {
      var cur = settings();
      var u = ask('Supabase project URL, like https://abcd.supabase.co', KEYS.url, cur.url);
      if (u == null) return;
      var k = ask('Supabase publishable key', KEYS.key, '');
      if (k == null) return;
      if (u) GM_setValue(KEYS.url, u); else GM_deleteValue(KEYS.url);
      if (k) GM_setValue(KEYS.key, k);
      status(M.configured(settings()) ? 'Project saved.' : 'Project saved, the token is still missing.', 'ok');
    });
    GM_registerMenuCommand('Set inbox token', function () {
      var t = ask('Paste the inbox token from tripdb inbox-token. Leave empty to remove it.', KEYS.token, '');
      if (t == null) return;
      if (!t) { GM_deleteValue(KEYS.token); status('Token removed. Saves go to the clipboard.'); return; }
      GM_setValue(KEYS.token, t);
      status('Token saved.', 'ok');
    });
    GM_registerMenuCommand('Check inbox token', function () {
      var cfg = settings();
      if (!M.configured(cfg)) { status('Set the project and the token first.'); return; }
      request(M.inboxRequest(cfg, 'check', []))
        .then(function (r) { status(r.status === 200 ? 'Token works.' : 'Token failed: ' + M.answerText(r.status) + '.', r.status === 200 ? 'ok' : 'bad'); });
    });
    GM_registerMenuCommand('Remove inbox token', function () {
      GM_deleteValue(KEYS.token);
      status('Token removed. Saves go to the clipboard.');
    });
  }

  function start() {
    if (document.getElementById('latam-momondo-save')) return;
    ui.tripId = rememberTrip();
    panel();
    menu();
    watch();
  }

  return { start: start };
})();
MomondoSaveUI.start();
