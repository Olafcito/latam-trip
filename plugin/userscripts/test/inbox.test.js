'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { core, ctxFor, parsed, fixture, OPEN_JAW_URL } = require('./helpers');

const row = () => core.buildRow(parsed('dialog-open-jaw.txt', OPEN_JAW_URL, { rank: 1, cardPrice: 10029 }), ctxFor(OPEN_JAW_URL));
const CFG = { url: 'https://abcd.supabase.co/', key: 'sb_publishable_x', token: 'mmk_x' };

test('inbox file is manual-<UTC timestamp>.jsonl', () => {
  assert.equal(core.inboxFile(new Date(Date.UTC(2026, 9, 29, 14, 30, 12))), 'manual-20261029T143012Z.jsonl');
});

test('inbox content is one JSON row per line with a final newline', () => {
  const rows = [row(), row()];
  const text = core.inboxContent(rows);
  assert.ok(text.endsWith('\n'));
  const lines = text.trimEnd().split('\n');
  assert.equal(lines.length, 2);
  assert.deepEqual(JSON.parse(lines[0]), rows[0]);
});

test('inbox request: one POST to submit_inbox with the key as apikey only', () => {
  const rows = [row()];
  const spec = core.inboxRequest(CFG, 'manual-x.jsonl', rows);
  assert.equal(spec.method, 'POST');
  assert.equal(spec.url, 'https://abcd.supabase.co/rest/v1/rpc/submit_inbox');
  assert.deepEqual(Object.keys(spec.headers).sort(), ['Content-Type', 'apikey']);
  assert.equal(spec.headers.apikey, CFG.key);
  assert.deepEqual(JSON.parse(spec.data), { token: 'mmk_x', file: 'manual-x.jsonl', rows });
  assert.match(spec.data, /håndbagage/);
});

test('task request: a POST to submit_task with the token and the task', () => {
  const spec = core.taskRequest(CFG, { type: 'fix_parser' });
  assert.equal(spec.url, 'https://abcd.supabase.co/rest/v1/rpc/submit_task');
  assert.deepEqual(JSON.parse(spec.data), { token: 'mmk_x', task: { type: 'fix_parser' } });
});

test('configured needs the token, the key and a supabase.co address', () => {
  assert.equal(core.configured(CFG), true);
  assert.equal(core.configured({ ...CFG, token: '' }), false);
  assert.equal(core.configured({ ...CFG, key: '' }), false);
  assert.equal(core.configured({ ...CFG, url: 'https://evil.example.com' }), false);
  assert.equal(core.configured(null), false);
});

test('answerText names the status and points at the menu for a refusal', () => {
  assert.match(core.answerText(401), /^Supabase answered 401, check the token/);
  assert.equal(core.answerText(0), 'Supabase answered nothing');
});

test('fix_parser task carries the parser version and a cut dialog text', () => {
  const text = 'Booking options\n' + 'x'.repeat(300000);
  const task = core.fixTask({ reason: '3 of 14 rows have empty legs', legs: ctxFor(OPEN_JAW_URL).legs, page: OPEN_JAW_URL,
    view: 'Billigst', action: 'save_prices', parserVersion: '4.2', dialogText: text });
  assert.equal(task.type, 'fix_parser');
  assert.equal(task.title, '[fix_parser] Momondo dialog not parsed (parser 4.2)');
  assert.equal(task.parser_version, '4.2');
  assert.equal(task.dialog_chars, text.length);
  assert.equal(task.dialog_cut, true);
  assert.ok(task.dialog_text.length < text.length);
  assert.equal(task.from, 'userscript');
});

test('short dialog text is kept whole', () => {
  const text = fixture('dialog-broken.txt');
  const task = core.fixTask({ reason: 'no rows', legs: [], page: OPEN_JAW_URL, action: 'save_trip', parserVersion: '4.2', dialogText: text });
  assert.equal(task.dialog_text, text);
  assert.equal(task.dialog_cut, undefined);
});
