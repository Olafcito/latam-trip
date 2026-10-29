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
  assert.match(SRC(), new RegExp('// @version +1\\.0\\.' + crawler.PARSER_VERSION.replace('.', '\\.') + '\\n'));
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

function browser({ dialogText, token, promptAnswer, putStatus = 201, issueStatus = 403 }) {
  const els = { p: fakeElement(), t: fakeElement(), s: fakeElement() };
  const calls = { menu: [], requests: [], opened: [], clipboard: null };
  const store = token ? { github_token: token } : {};
  const dlg = dialogText == null ? [] : [{ className: 'dlg', innerText: dialogText, querySelectorAll: () => [] }];
  const document = {
    body: { innerText: '', appendChild: () => {} },
    getElementById: () => null,
    createElement: () => ({ style: {}, attachShadow: () => ({ set innerHTML(v) {}, getElementById: (id) => els[id] }) }),
    querySelectorAll: (sel) => (sel === '[role="dialog"]' ? dlg : []),
    querySelector: () => null
  };
  const window = { prompt: () => promptAnswer };
  const ctx = {
    document, window, location: new URL(OPEN_JAW_URL), history: { back: () => {} },
    URL, TextEncoder, btoa, setTimeout, Promise, console,
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
