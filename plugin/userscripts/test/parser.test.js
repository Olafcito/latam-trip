'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const path = require('path');
const { crawler, fixture, SCRIPTS, FIX } = require('./helpers');

test('crawler exposes PARSER_VERSION and parseDlg to Node', () => {
  assert.match(crawler.PARSER_VERSION, /^\d+\.\d+/);
  assert.equal(typeof crawler.parseDlg, 'function');
});

test('open jaw dialog: legs, times, hours, stops, carriers, prices', () => {
  const p = crawler.parseDlg(fixture('dialog-open-jaw.txt'), ['2026-12-03', '2027-02-03']);
  assert.equal(p.legs.length, 2);
  const [out, home] = p.legs;
  assert.equal(out.dep, '2026-12-03T06:00');
  assert.equal(out.arr, '2026-12-03T19:40');
  assert.equal(out.hours, 20.67);
  assert.equal(out.stops, 2);
  assert.deepEqual(out.via, ['AMS', 'PTY']);
  assert.deepEqual(out.layover_h, [3.83, 2.08]);
  assert.deepEqual(out.carriers, ['KLM', 'Copa Airlines']);
  assert.deepEqual(out.flights, ['KLM 1266', 'KLM 757', 'Copa Airlines 391']);
  assert.equal(home.dep, '2027-02-03T11:55');
  assert.equal(home.arr, '2027-02-04T14:10');
  assert.equal(home.hours, 21.25);
  assert.deepEqual(home.via, ['PTY', 'AMS']);
  assert.equal(p.price, 10029);
  assert.deepEqual(p.allPrices, [10029, 10412, 10980]);
  assert.equal(p.site, 'Expedia');
  assert.equal(p.brand, 'Light');
  assert.equal(p.alt, 'KLM 10412 / Annonce 10980');
  assert.equal(p.selfNote, false);
});

test('return dialog with self transfer: Afrejse and Hjemrejse legs, overnight layover, operated-by line', () => {
  const p = crawler.parseDlg(fixture('dialog-return-selftransfer.txt'), ['2026-12-03', '2027-02-03']);
  assert.equal(p.legs.length, 2);
  const [out, home] = p.legs;
  assert.equal(out.arr, '2026-12-04T05:15');
  assert.equal(out.hours, 29.08);
  assert.equal(out.stops, 1);
  assert.equal(out.overnight_layover, true);
  assert.deepEqual(out.layover_h, [15.75]);
  assert.equal(out._self, true);
  assert.deepEqual(home.flights, ['Iberia 6586', 'Iberia 3254']);
  assert.deepEqual(home.carriers, ['Iberia']);
  assert.equal(p.selfNote, true);
  assert.equal(p.prot, true);
  assert.equal(p.price, 6494);
  assert.equal(p.site, 'Kiwi.com');
  assert.equal(p.brand, 'Basic + Economy');
});

test('v5 layout, one way: offers first, legs after, ads skipped, cheapest real offer wins', () => {
  const p = crawler.parseDlg(fixture('dialog-v5-oneway.txt'), ['2027-01-14']);
  assert.equal(p.legs.length, 1);
  const [l] = p.legs;
  assert.equal(l.dep, '2027-01-14T05:25');
  assert.equal(l.arr, '2027-01-14T13:10');
  assert.equal(l.hours, 6.75);
  assert.equal(l.stops, 1);
  assert.deepEqual(l.via, ['SAL']);
  assert.deepEqual(l.layover_h, [3.25]);
  assert.deepEqual(l.flights, ['Avianca 314', 'Avianca 369']);
  assert.equal(p.price, 1745);
  assert.equal(p.site, 'Travellink.dk');
  assert.equal(p.brand, 'Light');
  assert.equal(p.alt, 'Opodo 1811 / Avianca 1842 / Travellink.dk 1938');
  assert.match(p.bagSeg, /1 x håndbagage/);
  assert.equal(p.selfNote, false);
});

test('v5 layout, open jaw with self transfers: Afgang after the time line, airport change, +2 days', () => {
  const p = crawler.parseDlg(fixture('dialog-v5-open-jaw.txt'), ['2026-12-03', '2027-02-03']);
  assert.equal(p.legs.length, 2);
  const [out, home] = p.legs;
  assert.equal(out.arr, '2026-12-05T17:53');
  assert.equal(out.hours, 59.22);
  assert.deepEqual(out.via, ['BVA', 'FRA', 'SJD']);
  assert.equal(out._apt, true);
  assert.equal(out._self, true);
  assert.equal(home.dep, '2027-02-03T03:45');
  assert.equal(home.arr, '2027-02-04T13:25');
  assert.equal(p.price, 6938);
  assert.equal(p.prot, true);
  assert.equal(p.brand, 'Basic + Economy + Economy Zero + Light');
});

test('v6 layout: Fly N header with the date, total time on the summary line, offers after the legs', () => {
  const p = crawler.parseDlg(fixture('dialog-v6-open-jaw-2026-10-29.txt'), ['2026-12-01', '2027-02-01']);
  assert.equal(p.legs.length, 2);
  const [out, home] = p.legs;
  assert.equal(out.dep, '2026-12-02T06:10');
  assert.equal(out.arr, '2026-12-03T10:50');
  assert.equal(out.hours, 35.67);
  assert.deepEqual(out.carriers, ['Ryanair', 'Iberojet', 'Volaris']);
  assert.equal(home.dep, '2027-02-02T03:45');
  assert.equal(home.hours, 28.75);
  assert.equal(p.price, 7800);
  assert.deepEqual(p.allPrices, [7800, 8453, 10878]);
  assert.equal(p.site, 'Kiwi.com');
  assert.equal(p.brand, 'Basic + Economy + Light');
  assert.equal(p.prot, true);
  assert.match(p.alt, /Mytrip 8453/);
  assert.doesNotMatch(p.bagSeg, /Mytrip/);
});

test('an unknown line between the time line and the airports never becomes the flight', () => {
  const txt = fixture('dialog-v5-oneway.txt').replace(/\r\n/g, '\n').replace('09:35 - 13:10(2 t. 35 min.)\n', '09:35 - 13:10(2 t. 35 min.)\nAfgang 14. jan.\nNy linje fra Momondo\n');
  const [l] = crawler.parseDlg(txt, ['2027-01-14']).legs;
  assert.deepEqual(l.flights, ['Avianca 314', 'Avianca 369']);
  assert.deepEqual(l.carriers, ['Avianca']);
  assert.equal(l._apt, false);
});

test('a leg line without a flight number is never a carrier', () => {
  const txt = fixture('dialog-v5-oneway.txt').replace(/\r\n/g, '\n').replace('Avianca 369\n', '');
  const [l] = crawler.parseDlg(txt, ['2027-01-14']).legs;
  for (const c of l.carriers) assert.doesNotMatch(c, /\([A-Z]{3}\)| - /);
});

test('dialog in an unknown layout gives no legs and no price', () => {
  const p = crawler.parseDlg(fixture('dialog-broken.txt'), ['2026-12-03', '2027-02-03']);
  assert.equal(p.legs.length, 0);
  assert.equal(p.price, null);
});

test('canary passes on the saved fixture and fails on a broken one', () => {
  const canary = path.join(SCRIPTS, 'canary.js');
  const ok = spawnSync(process.execPath, [canary], { encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stdout + ok.stderr);
  assert.match(ok.stdout, /^PASS/);
  const bad = spawnSync(process.execPath, [canary, path.join(FIX, 'dialog-broken.txt'), path.join(FIX, 'dialog-open-jaw.expected.json')], { encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /^FAIL/);
});
