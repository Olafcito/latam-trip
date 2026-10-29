'use strict';
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..', '..');
const SCRIPTS = path.join(ROOT, 'plugin', 'skills', 'momondo-search', 'scripts');
const FIX = path.join(SCRIPTS, 'fixtures');

const crawler = require(path.join(SCRIPTS, 'momondo_crawler.js'));
const core = require(path.join(__dirname, '..', 'momondo-save.core.js'));

const fixture = (name) => fs.readFileSync(path.join(FIX, name), 'utf8');

const OPEN_JAW_URL = 'https://www.momondo.dk/flight-search/CPH-GUA/2026-12-03/VVI-CPH/2027-02-03?sort=price_a';
const RETURN_URL = 'https://www.momondo.dk/flight-search/CPH-BOG/2026-12-03/2027-02-03?sort=bestflight_a';

function ctxFor(url, extra) {
  const s = core.parseSearchUrl(url);
  const now = new Date(Date.UTC(2026, 9, 29, 14, 30, 12));
  return Object.assign({
    legs: s.legs, structure: s.structure, link: s.link, page: url, sort: s.sort, now,
    observedAt: core.isoNow(now), taskId: 'manual-' + core.stamp(now), agent: 'manual',
    parserVersion: crawler.PARSER_VERSION
  }, extra || {});
}

function parsed(name, url, extra) {
  const s = core.parseSearchUrl(url);
  return Object.assign(crawler.parseDlg(fixture(name), s.legs.map((l) => l.date)), extra || {});
}

module.exports = { ROOT, SCRIPTS, FIX, crawler, core, fixture, ctxFor, parsed, OPEN_JAW_URL, RETURN_URL };
