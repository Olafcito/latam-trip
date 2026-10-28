---
name: momondo-search
description: How to search momondo.dk reliably from the built-in browser (one-way, return, open jaw, multi-city up to 6 legs), crawl the result dialogs with the stored JavaScript crawler, and convert them to crawl-schema JSONL. Use inside a Momondo worker job or when debugging one.
---

# Momondo search

The worker procedure is in `agents/momondo-worker.md`. This skill holds the tools it uses.

- `scripts/momondo_crawler.js`: defines `parseDlg`, `crawl`, `lines`, `run` in the page. Install once per job into `localStorage.crawlsrc` (origin momondo.dk survives navigations). `run(nCards, legDates[], maxRows)` waits for "Færdig", opens the first nCards result dialogs, expands every leg, and returns `count=... done=...` plus one line per distinct itinerary:
  `rank;price;site;selfTransfer;fareBrand;cabinBag;checkedBag;changeable;otherOffers;protection ~ LEG ~ LEG ...`
  `LEG = depMM-DDTHH:MM,arrMM-DDTHH:MM,hours,stops,via,layoverHours,flights(+),overnight,airportChange`
- `scripts/momondo_lines.py`: converts those lines to schema rows, flags (over_30h, self_transfer, airport_change, us_transit, basic_fare, mix_match, incomplete) and drops near-duplicates. Call with `--legs FROM-TO@DATE,...`.
- `references/howto-r1.md`: the first worker's detailed notes on the page structure (dialog text, labels, pitfalls).

Known page facts (Danish UI, Oct 2026): results are `div[role=group][aria-label="Resultat nr. N"]`; a click opens a `[role=dialog]` (URL `#dialog`); legs expand via `.E69K-leg-dropdown-header[role=button]` (class may change: re-inspect if legs come back empty); booking offers follow "Bookingmuligheder". `parseDlg` assumes Jan/Feb dates are 2027 and other months 2026: change that line for other trips.
