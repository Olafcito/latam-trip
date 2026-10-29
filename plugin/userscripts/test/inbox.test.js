'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { core, ctxFor, parsed, fixture, OPEN_JAW_URL } = require('./helpers');

const row = () => core.buildRow(parsed('dialog-open-jaw.txt', OPEN_JAW_URL, { rank: 1, cardPrice: 10029 }), ctxFor(OPEN_JAW_URL));

function jsonBlocks(body) {
  return [...body.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1]));
}

test('inbox path is data/sources/inbox/manual-<UTC timestamp>.jsonl', () => {
  assert.equal(core.inboxPath(new Date(Date.UTC(2026, 9, 29, 14, 30, 12))), 'data/sources/inbox/manual-20261029T143012Z.jsonl');
});

test('inbox content is one JSON row per line with a final newline', () => {
  const rows = [row(), row()];
  const text = core.inboxContent(rows);
  assert.ok(text.endsWith('\n'));
  const lines = text.trimEnd().split('\n');
  assert.equal(lines.length, 2);
  assert.deepEqual(JSON.parse(lines[0]), rows[0]);
});

test('GitHub contents request: PUT on main with base64 UTF-8 content', () => {
  const content = core.inboxContent([row()]);
  const spec = core.contentsRequest('data/sources/inbox/manual-x.jsonl', content, 'TOKEN', 'msg');
  assert.equal(spec.method, 'PUT');
  assert.equal(spec.url, 'https://api.github.com/repos/Olafcito/latam-trip/contents/data/sources/inbox/manual-x.jsonl');
  assert.equal(spec.headers.Authorization, 'Bearer TOKEN');
  const data = JSON.parse(spec.data);
  assert.equal(data.branch, 'main');
  assert.equal(data.message, 'msg');
  assert.equal(Buffer.from(data.content, 'base64').toString('utf8'), content);
  assert.match(content, /håndbagage/);
});

test('base64 without Buffer gives the same bytes', () => {
  const s = 'Ændring 6.494 kr. håndbagage';
  const saved = global.Buffer;
  let b64;
  try { global.Buffer = undefined; b64 = core.base64Utf8(s); } finally { global.Buffer = saved; }
  assert.equal(Buffer.from(b64, 'base64').toString('utf8'), s);
});

test('import_quotes issue: claude-task label, [type] title, one human line and one json block', () => {
  const rows = [row()];
  const issue = core.importIssue(rows, ctxFor(OPEN_JAW_URL));
  assert.equal(issue.clipboard, null);
  assert.ok(issue.url.startsWith('https://github.com/Olafcito/latam-trip/issues/new?labels=claude-task&title='));
  assert.ok(issue.url.length <= core.MAX_URL);
  assert.equal(issue.title, '[import_quotes] 1 Momondo price, CPH to GUA, VVI to CPH');
  const u = new URL(issue.url);
  assert.equal(u.searchParams.get('title'), issue.title);
  assert.equal(u.searchParams.get('body'), issue.body);
  const [first] = issue.body.split('\n');
  assert.ok(first.length > 10 && !first.startsWith('```'));
  const blocks = jsonBlocks(issue.body);
  assert.equal(blocks.length, 1);
  assert.equal(blocks[0].type, 'import_quotes');
  assert.deepEqual(blocks[0].rows, rows);
});

test('import_quotes for a trip names the trip', () => {
  const ctx = ctxFor(OPEN_JAW_URL, { tripName: 'Panama stopover' });
  const issue = core.importIssue([core.buildRow(parsed('dialog-open-jaw.txt', OPEN_JAW_URL), ctx)], ctx);
  assert.match(issue.title, /^\[import_quotes\] Momondo trip "Panama stopover"/);
  assert.equal(jsonBlocks(issue.body)[0].trip_name, 'Panama stopover');
});

test('too many rows for a link: rows go to the clipboard and the issue says so', () => {
  const rows = Array.from({ length: 14 }, row);
  const issue = core.importIssue(rows, ctxFor(OPEN_JAW_URL));
  assert.ok(issue.url.length <= core.MAX_URL);
  assert.match(issue.body, /clipboard/);
  const short = jsonBlocks(issue.body)[0];
  assert.equal(short.rows_on_clipboard, 14);
  assert.deepEqual(short.rows, []);
  const full = jsonBlocks(issue.clipboard);
  assert.equal(full.length, 1);
  assert.equal(full[0].rows.length, 14);
});

test('fix_parser issue carries the parser version and a cut dialog text that fits the link', () => {
  const text = fixture('dialog-open-jaw.txt').repeat(8);
  const issue = core.fixIssue({ reason: '3 of 14 rows have empty legs', legs: ctxFor(OPEN_JAW_URL).legs, page: OPEN_JAW_URL,
    view: 'Billigst', action: 'save_prices', parserVersion: '4.2', dialogText: text });
  assert.equal(issue.title, '[fix_parser] Momondo dialog not parsed (parser 4.2)');
  assert.ok(issue.url.length <= core.MAX_URL, String(issue.url.length));
  const [task] = jsonBlocks(issue.body);
  assert.equal(task.type, 'fix_parser');
  assert.equal(task.parser_version, '4.2');
  assert.equal(task.dialog_cut, true);
  assert.equal(task.dialog_chars, text.length);
  assert.match(task.dialog_text, /^Tilbage/);
  assert.match(task.dialog_text, /characters cut/);
  assert.match(task.dialog_text, /Bookingmuligheder/);
  const [full] = jsonBlocks(issue.clipboard);
  assert.equal(full.dialog_text, text);
});

test('short dialog text fits the fix_parser link whole', () => {
  const text = fixture('dialog-broken.txt');
  const issue = core.fixIssue({ reason: 'no rows', legs: [], page: OPEN_JAW_URL, action: 'save_trip', parserVersion: '4.2', dialogText: text });
  assert.equal(issue.clipboard, null);
  assert.equal(jsonBlocks(issue.body)[0].dialog_text, text);
});
