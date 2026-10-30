'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const { core, crawler, ctxFor, parsed, SCRIPTS, OPEN_JAW_URL, RETURN_URL } = require('./helpers');

// The keys and their order in a worker row, as momondo_lines.py prints them.
const WORKER_KEYS = ['agent', 'task_id', 'source', 'observed_at', 'structure', 'legs_requested', 'rank', 'price', 'currency',
  'price_dkk', 'tickets', 'self_transfer', 'fare_brand', 'cabin_bag', 'checked_bag', 'out', 'home', 'mid', 'us_transit',
  'changeable', 'link', 'flags', 'notes'];
const LEG_KEYS = ['dep', 'arr', 'hours', 'stops', 'via', 'layover_h', 'carriers', 'flights', 'overnight_layover'];

test('page URL gives legs, structure and link for every search form', () => {
  const oj = core.parseSearchUrl(OPEN_JAW_URL);
  assert.deepEqual(oj.legs, [{ from: 'CPH', to: 'GUA', date: '2026-12-03' }, { from: 'VVI', to: 'CPH', date: '2027-02-03' }]);
  assert.equal(oj.structure, 'open_jaw');
  assert.equal(oj.view, 'Billigst');
  assert.equal(oj.link, 'https://www.momondo.dk/flight-search/CPH-GUA/2026-12-03/VVI-CPH/2027-02-03');

  const rt = core.parseSearchUrl(RETURN_URL);
  assert.deepEqual(rt.legs, [{ from: 'CPH', to: 'BOG', date: '2026-12-03' }, { from: 'BOG', to: 'CPH', date: '2027-02-03' }]);
  assert.equal(rt.structure, 'return');
  assert.equal(rt.view, 'Bedst');
  assert.equal(rt.link, 'https://www.momondo.dk/flight-search/CPH-BOG/2026-12-03/2027-02-03');

  const ow = core.parseSearchUrl('https://www.momondo.dk/flight-search/BOG-VVI/2027-01-28?sort=price_a');
  assert.equal(ow.structure, 'one_way');
  assert.equal(ow.legs.length, 1);

  const mc = core.parseSearchUrl('https://www.momondo.dk/flight-search/CPH-PTY/2026-12-03/PTY-SAL/2026-12-07/VVI-CPH/2027-02-03?sort=price_a');
  assert.equal(mc.structure, 'multi_city');
  assert.deepEqual(mc.legs.map((l) => l.from + l.to + l.date), ['CPHPTY2026-12-03', 'PTYSAL2026-12-07', 'VVICPH2027-02-03']);

  const flex = core.parseSearchUrl('https://www.momondo.dk/flight-search/CPH-GUA/2026-12-03-flexible-3days/VVI-CPH/2027-02-03?sort=price_a');
  assert.equal(flex.legs[0].date, '2026-12-03');

  assert.equal(core.parseSearchUrl('https://www.momondo.dk/'), null);
});

test('a planner link names its trip in the hash, and a broken one names none', () => {
  assert.equal(core.tripOf('#latam=seed-1-gua-bog'), 'seed-1-gua-bog');
  assert.equal(core.tripOf('#dialog&latam=a%20b'), 'a b');
  assert.equal(core.tripOf('#dialog'), null);
  assert.equal(core.tripOf(''), null);
  assert.equal(core.tripOf('#latam=%E0%A4%A'), null);
});

test('the pick link carries the trip only when there is one', () => {
  const pick = { from: 'VVI', to: 'CBB' };
  assert.equal(new URL(core.pickUrl(pick, null)).searchParams.has('trip'), false);
  const u = new URL(core.pickUrl(pick, 'a b'));
  assert.equal(u.searchParams.get('trip'), 'a b');
  assert.deepEqual(JSON.parse(u.searchParams.get('pick')), pick);
});

test('a saved price row has the worker schema, source momondo-manual and observed_at in UTC', () => {
  const ctx = ctxFor(OPEN_JAW_URL);
  const row = core.buildRow(parsed('dialog-open-jaw.txt', OPEN_JAW_URL, { rank: 1, cardPrice: 10029 }), Object.assign({}, ctx, { view: 'Billigst' }));
  assert.deepEqual(Object.keys(row), WORKER_KEYS);
  assert.deepEqual(Object.keys(row.out), LEG_KEYS);
  assert.deepEqual(Object.keys(row.home), LEG_KEYS);
  assert.equal(row.source, 'momondo-manual');
  assert.equal(row.agent, 'manual');
  assert.equal(row.task_id, 'manual-20261029T143012Z');
  assert.equal(row.observed_at, '2026-10-29T14:30:12Z');
  assert.match(row.observed_at, /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/);
  assert.equal(row.structure, 'open_jaw');
  assert.equal(row.price_dkk, 10029);
  assert.equal(row.currency, 'DKK');
  assert.equal(row.fare_brand, 'Light');
  assert.equal(row.cabin_bag, '1 x håndbagage');
  assert.equal(row.checked_bag, 'paid');
  assert.equal(row.changeable, 'fee');
  assert.deepEqual(row.out.carriers, ['Copa Airlines', 'KLM']);
  assert.deepEqual(row.mid, []);
  assert.deepEqual(row.flags, []);
  assert.match(row.notes, /^site=Expedia; other=KLM 10412 \/ Annonce 10980; protection=0; view=Billigst; parser=/);
  assert.equal('trip_name' in row, false);
});

test('a saved trip row carries trip_name and the self-transfer fields', () => {
  const ctx = ctxFor(RETURN_URL, { tripName: 'Bogotá via Madrid' });
  const row = core.buildRow(parsed('dialog-return-selftransfer.txt', RETURN_URL, { rank: null }), ctx);
  assert.equal(row.trip_name, 'Bogotá via Madrid');
  assert.equal(row.rank, null);
  assert.equal(row.structure, 'return');
  assert.equal(row.self_transfer, true);
  assert.equal(row.tickets, 2);
  assert.equal(row.price_dkk, 6494);
  assert.equal(row.cabin_bag, 'fee');
  assert.deepEqual(row.flags, ['basic_fare', 'self_transfer']);
  assert.match(row.notes, /protection=1/);
  assert.equal(row.home.dep, '2027-02-03T19:55');
});

test('price rows from Billigst and Bedst: ads, failed cards and repeats are left out', () => {
  const ctx = ctxFor(OPEN_JAW_URL);
  const a = parsed('dialog-open-jaw.txt', OPEN_JAW_URL, { rank: 1, cardPrice: 10029 });
  const b = parsed('dialog-return-selftransfer.txt', OPEN_JAW_URL, { rank: 2, cardPrice: 6494 });
  const ad = Object.assign({}, a, { rank: 3, site: 'Sponsoreret' });
  const rows = core.buildPriceRows([
    { view: 'Billigst', items: [a, b, ad, { rank: 4, err: 'nodialog' }] },
    { view: 'Bedst', items: [Object.assign({}, a, { rank: 1 })] }
  ], ctx);
  assert.equal(rows.length, 2);
  assert.match(rows[0].notes, /view=Billigst\+Bedst/);
  assert.match(rows[1].notes, /view=Billigst;/);
});

test('rows match what momondo_lines.py makes from the crawler lines', { skip: !hasPython() && 'python not found' }, () => {
  const url = OPEN_JAW_URL;
  const p = parsed('dialog-open-jaw.txt', url, { rank: 1, cardPrice: 10029 });
  const text = 'count=1 done=true title=x\n' + crawler.lines([p], 8, 2) + '\n';
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'momsave-'));
  const inf = path.join(dir, 'out.txt');
  fs.writeFileSync(inf, text, 'utf8');
  const r = spawnSync(pythonCmd(), ['-I', path.join(SCRIPTS, 'momondo_lines.py'), 'manual', 't1', '--legs', 'CPH-GUA@2026-12-03,VVI-CPH@2027-02-03', inf],
    { encoding: 'utf8', env: Object.assign({}, process.env, { PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }) });
  assert.equal(r.status, 0, r.stderr);
  const py = JSON.parse(r.stdout.trim().split('\n')[0]);
  const js = core.buildRow(p, ctxFor(url));
  for (const k of ['structure', 'legs_requested', 'rank', 'price', 'price_dkk', 'tickets', 'self_transfer', 'fare_brand',
    'cabin_bag', 'checked_bag', 'out', 'home', 'mid', 'us_transit', 'changeable', 'link', 'flags']) {
    assert.deepEqual(js[k], py[k], k);
  }
  assert.ok(js.notes.startsWith(py.notes), 'notes');
});

var PY;
function pythonCmd() {
  if (PY !== undefined) return PY;
  PY = null;
  for (const c of ['python3', 'python']) {
    const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
    if (r.status === 0) { PY = c; break; }
  }
  return PY;
}
function hasPython() { return !!pythonCmd(); }
