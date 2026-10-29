// Browser side of the Momondo save userscript: the two buttons, reading the page with the
// crawler (CR.parseDlg and CR.crawl), and writing to GitHub. build.js puts it into momondo-save.user.js.
/* global CR, MomondoSave, GM_getValue, GM_setValue, GM_deleteValue, GM_registerMenuCommand, GM_xmlhttpRequest, GM_setClipboard, GM_openInTab */
var MomondoSaveUI = (function () {
  'use strict';
  var M = MomondoSave;
  var TOKEN_KEY = 'github_token';
  var MAX_CARDS = 40;
  var busy = false;
  var ui = {};
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

  async function guard(fn) {
    if (busy) return;
    busy = true;
    ui.prices.disabled = ui.trip.disabled = true;
    try { await fn(); }
    catch (e) { status('Not saved: ' + (e && e.message ? e.message : e), 'bad'); }
    finally { busy = false; ui.prices.disabled = ui.trip.disabled = false; }
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

  function openIssue(issue) {
    if (issue.clipboard) GM_setClipboard(issue.clipboard, 'text');
    GM_openInTab(issue.url, { active: true });
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
    var issue = M.fixIssue({
      reason: reason, legs: ctx.legs, page: ctx.page, view: view, action: action,
      parserVersion: ctx.parserVersion, dialogText: text
    });
    var token = GM_getValue(TOKEN_KEY, '');
    if (token) {
      var res = await request(M.issueRequest(issue, token));
      if (res.status === 201) {
        var num = (/"number":\s*(\d+)/.exec(res.text) || [])[1];
        return 'A fix_parser issue was filed' + (num ? ' (#' + num + ')' : '') + '.';
      }
    }
    openIssue(issue);
    return 'A fix_parser issue is open in a new tab, press Submit there' + (issue.clipboard ? ' after pasting the clipboard over the text.' : '.');
  }

  async function write(rows, ctx, what) {
    var token = GM_getValue(TOKEN_KEY, '');
    var failed = '';
    if (token) {
      var content = M.inboxContent(rows);
      var path = M.inboxPath(ctx.now);
      var msg = 'Momondo manual save: ' + what + ', ' + ctx.legs.map(function (l) { return l.from + ' to ' + l.to; }).join(', ');
      var res = await request(M.contentsRequest(path, content, token, msg));
      if (res.status === 422) res = await request(M.contentsRequest(path.replace(/\.jsonl$/, '-2.jsonl'), content, token, msg));
      if (res.status === 201 || res.status === 200) return { ok: true, text: 'Saved ' + what };
      failed = 'GitHub answered ' + (res.status || 'nothing') + (res.status === 401 || res.status === 403 || res.status === 404 ? ', check the token in the Tampermonkey menu' : '');
    }
    var issue = M.importIssue(rows, ctx);
    openIssue(issue);
    var verb = rows.length === 1 ? ' is' : ' are';
    var paste = issue.clipboard ? ' Paste the clipboard over its text, then press Submit.' : ' Press Submit there.';
    if (failed) return { ok: false, text: 'Not saved: ' + failed + '. The ' + what + verb + ' in a new GitHub issue instead.' + paste };
    return { ok: true, text: 'Ready: ' + what + verb + ' in a new GitHub issue.' + paste };
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

  function menu() {
    GM_registerMenuCommand('Set GitHub token', function () {
      var t = window.prompt('Paste a fine-grained GitHub token for Olafcito/latam-trip with Contents read and write. Leave empty to remove the saved token.');
      if (t == null) return;
      t = t.trim();
      if (!t) { GM_deleteValue(TOKEN_KEY); status('Token removed. Saves open a GitHub issue instead.'); return; }
      GM_setValue(TOKEN_KEY, t);
      status('Token saved. Saves now go straight to the repo.', 'ok');
    });
    GM_registerMenuCommand('Check GitHub token', function () {
      var t = GM_getValue(TOKEN_KEY, '');
      if (!t) { status('No token saved. Saves open a GitHub issue instead.'); return; }
      request({ method: 'GET', url: 'https://api.github.com/repos/' + M.REPO, headers: { 'Authorization': 'Bearer ' + t, 'Accept': 'application/vnd.github+json' } })
        .then(function (r) { status(r.status === 200 ? 'Token works for ' + M.REPO + '.' : 'Token failed: GitHub answered ' + (r.status || 'nothing') + '.', r.status === 200 ? 'ok' : 'bad'); });
    });
    GM_registerMenuCommand('Remove GitHub token', function () {
      GM_deleteValue(TOKEN_KEY);
      status('Token removed. Saves open a GitHub issue instead.');
    });
  }

  function start() {
    if (document.getElementById('latam-momondo-save')) return;
    panel();
    menu();
  }

  return { start: start };
})();
MomondoSaveUI.start();
