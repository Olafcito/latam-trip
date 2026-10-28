# flight-crawler

A Claude plugin that searches flights like a crawler instead of like a person. An orchestrator expands a route tree (returns, open jaws, multi-city, hub stopovers, alternative origins, neighbouring dates), cheap Sonnet browser workers run batches of about 8 searches on Momondo and Google Flights, and every quote lands in one long table scored on price, hours and conditions.

Built for one real trip (Copenhagen to Latin America, Dec 2026 to Feb 2027) and written so the trip-specific parts live in `trip.json` and `briefs/scenarios.md`.

## What you need
- Claude with the built-in browser (desktop app pane) or a cloud session linked to a computer with it.
- Python 3 and Node in the workspace.

## Start a crawl
1. Make a folder (ROOT) with `data/raw/`, copy `templates/trip.example.json` to `ROOT/trip.json` and fill it in: home airports, alternative origins, main dates, the hard limit on hours, scoring weights, the region visited last.
2. Write `ROOT/briefs/scenarios.md`: the 2 to 4 shapes the trip could take.
3. Ask Claude to run the `flight-crawl-orchestrator` skill. It dispatches `momondo-worker` and `gflights-worker` jobs, then:
   - `python3 -I skills/flight-crawl-orchestrator/scripts/ingest.py --root ROOT` builds `data/crawl.db` and `data/quotes.csv`
   - `python3 -I skills/flight-crawl-orchestrator/scripts/scenarios.py --root ROOT` prints scenario totals and the regional legs still missing.

## Contents
- `agents/`: worker definitions (Sonnet). Each is the complete brief a worker needs.
- `skills/flight-crawl-orchestrator/`: the method, scoring, schema, lessons, ingest and scenario scripts.
- `skills/momondo-search/`, `skills/gflights-search/`: page crawlers, URL builders, converters.

## Safety
Workers only search and read. They never book, pay, enter personal data, accept consent banners, or create scheduled tasks.
