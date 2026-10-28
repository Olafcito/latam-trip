---
name: gflights-search
description: How to search Google Flights from the built-in browser without the form, by building tfs URLs for any multi-city itinerary, reading the result rows and the two cheapest second legs, and decoding flight numbers. Use inside a Google Flights worker job or when debugging one.
---

# Google Flights search

The worker procedure is in `agents/gflights-worker.md`.

- `scripts/gf_tfs.py`: `tfs([(date, from, to), ...])` builds the protobuf tfs parameter for any number of legs (multi-city). URL: `https://www.google.com/travel/flights/search?tfs=<tfs>&hl=en&curr=DKK`.
- `scripts/gf_extract.js`: stored as `localStorage.r`; waits for rows, settles 6 s, expands "View more flights", lists the top first-leg rows, then opens the cheapest and the cheapest other-airline pick to read leg 2 and the booking page.
- `scripts/gf_dec.py`: decodes flight numbers from the booking tfs.
- `references/howto.md`: full notes (consent page, aria-label format, pitfalls).

Facts: the first-leg price is the whole-trip total with the cheapest second leg; trust the booking-page price; Boliviana (BoA) is never listed; absurd rows (50k+) appear and are ignored.
