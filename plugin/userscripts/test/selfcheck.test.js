'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { core, ctxFor, parsed, OPEN_JAW_URL } = require('./helpers');

const good = () => core.buildRow(parsed('dialog-open-jaw.txt', OPEN_JAW_URL, { rank: 1, cardPrice: 10029 }), ctxFor(OPEN_JAW_URL));

test('good rows pass', () => {
  assert.deepEqual(core.selfCheck([good()], 2), { ok: true, reason: '' });
});

test('zero rows are not saved', () => {
  const c = core.selfCheck([], 2);
  assert.equal(c.ok, false);
  assert.match(c.reason, /no rows/);
});

test('a dialog the parser cannot read gives empty legs and is not saved', () => {
  const row = core.buildRow(parsed('dialog-broken.txt', OPEN_JAW_URL, { rank: 1, cardPrice: 10029 }), ctxFor(OPEN_JAW_URL));
  assert.equal(row.out, null);
  assert.ok(row.flags.includes('incomplete'));
  const c = core.selfCheck([good(), row], 2);
  assert.equal(c.ok, false);
  assert.equal(c.reason, '1 of 2 rows have empty legs');
});

test('a missing home leg or a leg without flights is not saved', () => {
  const r = good();
  r.home = null;
  assert.equal(core.selfCheck([r], 2).ok, false);
  const s = good();
  s.out.flights = [];
  assert.equal(core.selfCheck([s], 2).ok, false);
});

test('a row without a price is not saved', () => {
  const p = parsed('dialog-open-jaw.txt', OPEN_JAW_URL, { rank: 1 });
  p.price = null;
  const row = core.buildRow(p, ctxFor(OPEN_JAW_URL));
  assert.equal(row.price_dkk, null);
  const c = core.selfCheck([row], 2);
  assert.equal(c.ok, false);
  assert.match(c.reason, /no price/);
});
