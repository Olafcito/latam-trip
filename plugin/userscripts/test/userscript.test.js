'use strict';
// The generated userscript: no drift from its sources, a valid header, and a run in a
// fake browser (vm) that presses Save trip with and without a token.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const vm = require('vm');
const build = require('../build.js');
const { crawler, fixture, OPEN_JAW_URL } = require('./helpers');

const SRC = () => fs.readFileSync(build.OUT, 'utf8').replace(/\r\n/g, '\n');

test('momondo-save.user.js is up to date with the crawler and its sources (run node plugin/userscripts/build.js)', () => {
  assert.ok(build.isCurrent(), 'momondo-save.user.js is out of date: run node plugin/userscripts/build.js');
});

test('the userscript embeds the crawler file verbatim and its version', () => {
  const crawlerSrc = fs.readFileSync(build.CRAWLER, 'utf8').replace(/\r\n/g, '\n').replace(/\n*$/, '\n');
  assert.ok(SRC().includes(crawlerSrc));
  assert.match(SRC(), new RegExp('// @version +1\\.1\\.' + crawler.PARSER_VERSION.replace('.', '\\.') + '\\n'));
});

test('header: matches the flight search, grants and connects what the script uses', () => {
  const head = SRC().split('// ==/UserScript==')[0];
  assert.match(head, /@match +https:\/\/www\.momondo\.dk\/flight-search\/\*/);
  assert.match(head, /@connect +api\.github\.com/);
  for (const g of ['GM_getValue', 'GM_setValue', 'GM_deleteValue', 'GM_registerMenuCommand', 'GM_xmlhttpRequest', 'GM_setClipboard', 'GM_openInTab']) {
    assert.match(head, new RegExp('@grant +' + g + '\\n'));
  }
  assert.match(head, /@updateURL +https:\/\/raw\.githubusercontent\.com\/Olafcito\/latam-trip\/main\/plugin\/userscripts\/momondo-save\.user\.js/);
});

function fakeElement() {
  const listeners = {};
  return {
    style: {}, dataset: {}, textContent: '', disabled: false,
    addEventListener: (ev, fn) => { listeners[ev] = fn; },
    click: () => listeners.click && listeners.click()
  };
}

function browser({ dialogText, token, promptAnswer, putStatus = 201, issueStatus = 403, url = OPEN_JAW_URL, card }) {
  const els = { p: fakeElement(), t: fakeElement(), s: fakeElement(), k: fakeElement() };
  const calls = { menu: [], requests: [], opened: [], clipboard: null };
  const store = token ? { github_token: token } : {};
  const opened = { className: 'dlg', innerText: dialogText, querySelectorAll: () => [] };
  // a card opens its dialog when it is pressed, the Save trip tests start with it open
  const dlg = dialogText == null || card ? [] : [opened];
  const group = card && {
    innerText: card, added: null,
    getAttribute: () => 'Resultat nr. 0',
    scrollIntoView: () => {},
    querySelector: () => group.added,
    querySelectorAll: () => [choose]
  };
  const choose = card && {
    innerText: 'V\u00e6lg',
    click: () => { dlg.splice(0, 1, opened); },
    parentElement: { insertBefore: (host) => { group.added = host; } }
  };
  const document = {
    body: { innerText: '', appendChild: () => {}, contains: () => false },
    getElementById: () => null,
    createElement: () => ({ style: {}, setAttribute: () => {}, attachShadow: () => ({ set innerHTML(v) {}, getElementById: (id) => els[id] }) }),
    querySelectorAll: (sel) => (sel === '[role="dialog"]' ? dlg : sel.startsWith('[role="group"]') && group ? [group] : []),
    querySelector: () => null
  };
  const window = { prompt: () => promptAnswer, scrollY: 0, scrollTo: () => {} };
  const session = {};
  const ctx = {
    document, window, location: new URL(url), history: { back: () => { dlg.length = 0; } },
    URL, TextEncoder, btoa, setTimeout, Promise, console,
    MutationObserver: function () { this.observe = () => {}; },
    sessionStorage: { getItem: (k) => session[k] ?? null, setItem: (k, v) => { session[k] = v; } },
    GM_getValue: (k, d) => (k in store ? store[k] : d),
    GM_setValue: (k, v) => { store[k] = v; },
    GM_deleteValue: (k) => { delete store[k]; },
    GM_registerMenuCommand: (name) => calls.menu.push(name),
    GM_setClipboard: (t) => { calls.clipboard = t; },
    GM_openInTab: (url) => calls.opened.push(url),
    GM_xmlhttpRequest: (spec) => {
      calls.requests.push(spec);
      const status = spec.method === 'PUT' ? putStatus : issueStatus;
      setTimeout(() => spec.onload({ status, responseText: status === 201 ? '{"number": 7}' : '{}' }), 0);
    }
  };
  vm.createContext(ctx);
  vm.runInContext(SRC(), ctx, { filename: 'momondo-save.user.js' });
  return { els, calls, store };
}

async function pressTrip(b) {
  b.els.t.click();
  for (let i = 0; i < 200 && (b.els.t.disabled || !b.els.s.textContent || /^Reading/.test(b.els.s.textContent)); i++) {
    await new Promise((r) => setTimeout(r, 20));
  }
  return b.els.s.textContent;
}

const ONE_WAY_URL = 'https://www.momondo.dk/flight-search/BOG-VVI/2027-01-14?sort=price_a#latam=seed-1';

async function pressPick(b) {
  b.els.k.click();
  for (let i = 0; i < 400 && !/^(Picked|Not picked)/.test(b.els.s.textContent); i++) await new Promise((r) => setTimeout(r, 20));
  return b.els.s.textContent;
}

test('Pick on a one-way search opens the planner with that flight for the trip of the link', async () => {
  const b = browser({ dialogText: fixture('dialog-v5-oneway.txt'), url: ONE_WAY_URL, card: '05:25 \u2013 13:10\nAvianca\n1.745 kr.\nV\u00e6lg' });
  assert.equal(await pressPick(b), 'Picked 05:25, opening the planner');
  assert.equal(b.els.k.textContent, 'Picked');
  assert.equal(b.calls.opened.length, 1);
  const url = new URL(b.calls.opened[0]);
  assert.equal(url.origin, 'http://localhost:5198');
  assert.equal(url.searchParams.get('trip'), 'seed-1');
  const pick = JSON.parse(url.searchParams.get('pick'));
  assert.equal(pick.from, 'BOG');
  assert.equal(pick.to, 'VVI');
  assert.equal(pick.dep, '2027-01-14T05:25');
  assert.equal(pick.arr, '2027-01-14T13:10');
  assert.equal(pick.price, 1745);
  assert.deepEqual(pick.via, ['SAL']);
  assert.equal(pick.site, 'Travellink.dk');
});

test('Pick does not trust a dialog that does not show the time of the pressed card', async () => {
  const b = browser({ dialogText: fixture('dialog-v5-oneway.txt'), url: ONE_WAY_URL, card: '17:50 \u2013 18:35\n1.745 kr.\nV\u00e6lg' });
  assert.equal(await pressPick(b), 'Not picked: another result opened, press Pick again');
  assert.equal(b.calls.opened.length, 0);
});

test('a search with more than one leg has no Pick', () => {
  const b = browser({ dialogText: fixture('dialog-v5-oneway.txt'), url: OPEN_JAW_URL, card: '05:25\nV\u00e6lg' });
  b.els.k.click();
  assert.equal(b.els.s.textContent, '');
});

test('starts with two buttons and three menu entries', () => {
  const b = browser({});
  assert.deepEqual(b.calls.menu, ['Set GitHub token', 'Check GitHub token', 'Remove GitHub token']);
});

test('Save trip without an opened result says so', async () => {
  const b = browser({});
  assert.equal(await pressTrip(b), 'Not saved: open a result first, then press Save trip');
});

test('Save trip with a token commits one row with trip_name to the inbox', async () => {
  const b = browser({ dialogText: fixture('dialog-open-jaw.txt'), token: 'github_pat_x', promptAnswer: 'Panama stopover' });
  assert.equal(await pressTrip(b), 'Saved trip "Panama stopover"');
  assert.equal(b.calls.requests.length, 1);
  const put = b.calls.requests[0];
  assert.equal(put.method, 'PUT');
  assert.match(put.url, /\/contents\/data\/sources\/inbox\/manual-\d{8}T\d{6}Z\.jsonl$/);
  const rows = Buffer.from(JSON.parse(put.data).content, 'base64').toString('utf8').trim().split('\n').map(JSON.parse);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].trip_name, 'Panama stopover');
  assert.equal(rows[0].source, 'momondo-manual');
  assert.equal(rows[0].price_dkk, 10029);
  assert.equal(b.calls.opened.length, 0);
});

test('Save trip without a token opens a prefilled import_quotes issue', async () => {
  const b = browser({ dialogText: fixture('dialog-open-jaw.txt'), promptAnswer: 'Panama stopover' });
  const st = await pressTrip(b);
  assert.match(st, /^Ready: trip "Panama stopover" is in a new GitHub issue/);
  assert.equal(b.calls.requests.length, 0);
  assert.equal(b.calls.opened.length, 1);
  assert.match(new URL(b.calls.opened[0]).searchParams.get('title'), /^\[import_quotes\]/);
});

test('a bad token falls back to the issue and says Not saved', async () => {
  const b = browser({ dialogText: fixture('dialog-open-jaw.txt'), token: 'bad', promptAnswer: 'x', putStatus: 401 });
  assert.match(await pressTrip(b), /^Not saved: GitHub answered 401, check the token/);
  assert.equal(b.calls.opened.length, 1);
});

test('an unreadable dialog is not saved and opens a fix_parser issue with the text', async () => {
  const b = browser({ dialogText: fixture('dialog-broken.txt'), token: 'github_pat_x', promptAnswer: 'x' });
  const st = await pressTrip(b);
  assert.match(st, /^Not saved: 1 of 1 rows have empty legs\. A fix_parser issue is open in a new tab/);
  assert.equal(b.calls.requests.length, 1);
  assert.equal(b.calls.requests[0].method, 'POST');
  const url = new URL(b.calls.opened[0]);
  assert.match(url.searchParams.get('title'), /^\[fix_parser\]/);
  assert.match(url.searchParams.get('body'), /Booking options/);
});

test('with a token that may write issues the fix_parser issue is filed directly', async () => {
  const b = browser({ dialogText: fixture('dialog-broken.txt'), token: 'github_pat_x', promptAnswer: 'x', issueStatus: 201 });
  assert.match(await pressTrip(b), /A fix_parser issue was filed \(#7\)\./);
  assert.equal(b.calls.opened.length, 0);
});
