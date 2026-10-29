#!/usr/bin/env node
// Canary for the Momondo dialog parser: runs parseDlg on a saved dialog text and checks
// the fields we rely on. Prints PASS or FAIL and exits 0 or 1.
//   node plugin/skills/momondo-search/scripts/canary.js
//   node plugin/skills/momondo-search/scripts/canary.js <dialog.txt> <expected.json>
// The live version for the browser is canary_live.js next to this file.
'use strict';
const fs = require('fs');
const path = require('path');
const { parseDlg, PARSER_VERSION } = require('./momondo_crawler.js');

const here = (f) => path.join(__dirname, 'fixtures', f);
const [txtPath, expPath] = process.argv.length > 3
  ? [process.argv[2], process.argv[3]]
  : [here('dialog-v5-open-jaw.txt'), here('dialog-v5-open-jaw.expected.json')];

function check() {
  const txt = fs.readFileSync(txtPath, 'utf8');
  const exp = JSON.parse(fs.readFileSync(expPath, 'utf8'));
  const got = parseDlg(txt, exp.leg_dates);
  const bad = [];
  const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  for (const k of ['price', 'allPrices', 'site', 'brand', 'selfNote']) {
    if (k in exp && !same(got[k], exp[k])) bad.push(k + ': expected ' + JSON.stringify(exp[k]) + ', got ' + JSON.stringify(got[k]));
  }
  if (!got.legs || got.legs.length !== exp.legs.length) {
    bad.push('legs: expected ' + exp.legs.length + ', got ' + (got.legs ? got.legs.length : 0));
  } else {
    exp.legs.forEach((el, i) => {
      for (const k of Object.keys(el)) {
        if (!same(got.legs[i][k], el[k])) bad.push('leg ' + (i + 1) + ' ' + k + ': expected ' + JSON.stringify(el[k]) + ', got ' + JSON.stringify(got.legs[i][k]));
      }
    });
  }
  return { bad, got };
}

let result;
try { result = check(); } catch (e) { result = { bad: ['error: ' + e.message], got: {} }; }
const name = path.basename(txtPath);
if (result.bad.length) {
  console.log('FAIL canary parser ' + PARSER_VERSION + ' on ' + name);
  result.bad.forEach((b) => console.log('  ' + b));
  process.exit(1);
}
console.log('PASS canary parser ' + PARSER_VERSION + ' on ' + name + ': ' + result.got.legs.length + ' legs, price ' + result.got.price);
