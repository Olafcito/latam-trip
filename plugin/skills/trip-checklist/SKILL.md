---
name: trip-checklist
description: Work through the trip app's checklist, the open claude-task issues in Olafcito/latam-trip (flight prices and self-built itineraries, hostel and hotel prices, experience and place research, saved-list changes, refresh of stale prices), with the flight-crawler plugin's Sonnet workers, then write results back into the repo data and close each issue. Use when Simon says "check the checklist", or pastes a single task JSON from the app.
---

# Trip checklist

The app writes tasks; you do them. Contract and task types: `docs/claude-tasks.md` (read it first). Data lives in the repo:
`data/crawl.db` (flights), `data/network/experiences.jsonl`, `experience_categories.json`, `lists.json`, `stays.jsonl`, `task_log.jsonl`, and the map files built by `src/build_map.py`.

## Rules (Simon's, always)
- Never book, reserve, pay, sign in, enter personal data, accept consent or solve a bot check. Search and read only.
- Browser work goes to Sonnet subagents only (never Haiku), at most 2 browser workers at once. Momondo is the main flight engine.
- Long-haul is never searched one-way alone: any leg touching Europe is searched as one combined ticket from and back to Copenhagen (CPH), with the rest of the trip as fixed in `trip.json`. More than 30 h in one direction is unacceptable.
- Results always give local departure and arrival clock times, one fact per cell, kroner (DKK). No em or en dashes. No route suggestions unless the task asks.

## Steps
1. `python3 -I src/tasks.py list` (or use the pasted task JSON). Run `show N` for each. Group tasks of the same kind so one worker batch covers several (about 8 searches per worker).
2. Per type:
   - `flight_prices`: follow the `flight-crawl-orchestrator` skill. Write a task list for `agents/momondo-worker.md` (one search per task, legs and dates from the task, each leg's `flex_days` as neighbouring dates). A self-built itinerary is searched three ways (see `docs/claude-tasks.md`): legs touching Europe as one combined ticket, regional legs as one-ways, and the whole as one multi-city search if it has 6 legs or fewer. After the RESULT: `python3 -I src/ingest.py`, then the chains/inout/itineraries/dashboard scripts the orchestrator lists.
   - `stay_prices`: dispatch `agents/stay-price-worker.md` with the place name and country (from `data/network/map.json`), dates, kinds and room. Then `python3 -I src/stays_ingest.py data/raw/stays-<agent>.jsonl`.
   - `experience_research`: research it yourself with WebSearch and WebFetch (prices, season, Dec/Jan conditions, requirements, how to book, 2 to 4 sources). Update or add the row in `data/network/experiences.jsonl` (schema below), set `researched: true` and `checked_at`. New experiences get a category from `experience_categories.json`.
   - `place_research`: dispatch `agents/network-researcher.md` and `agents/place-profiler.md` for the new place, then `python3 -I src/build_map.py`.
   - `lists_update`: edit `data/network/lists.json` (add or remove items; set `added` to today; keep notes).
   - `question`: answer in the issue comment.
   - `refresh`: list what is in scope and older than `older_than_days` (flights: `observed_at` in `data/crawl.db` for the top 10 trips in `data/web/dash_trips.json`, their long-haul tickets and regional pairs, and every `flight_prices` itinerary in `task_log.jsonl`; stays: the latest `check_in`/`check_out` per place in `stays.jsonl`; experiences: `checked_at` of researched rows). Re-run those as the tasks above would, in as few worker batches as possible. Tell Simon the size first if it is more than 4 worker jobs.
3. Write a short result (markdown table: what was found, prices, local times, sources) to a file and run `python3 -I src/tasks.py done N <file> --outputs <files changed>`. That comments, closes the issue and logs it in `data/network/task_log.jsonl`.
4. Rebuild and publish on `main` (the only branch): `python3 -I src/build_map.py`, then `python3 -I src/build_web_data.py`; commit and push. If you changed anything in `plugin/`, run `python3 -I src/sync_claude_dir.py` too.
5. Tell Simon in a few lines what was done, with the key prices, and anything blocked.

## Experience row (data/network/experiences.jsonl, one JSON per line)
`{"kind": "experience", "id": "kebab-id", "name": "...", "category": "<category id>", "tags": [], "places": ["<map ids>"], "area": "<name when no map place>", "country": "XX", "lat": 0.0, "lon": 0.0, "summary": "...", "season": "...", "dec_jan": "...", "price": "as published", "price_dkk": 0, "duration": "...", "requirements": "...", "details": {}, "researched": true, "checked_at": "YYYY-MM-DD", "sources": ["..."]}`
Category-specific facts go in `details` (diving: water, animals, shark_chance, depth, cert, logged_dives_min). Images: an `experience_image` row in `data/network/exp-img-*.jsonl` (`{"kind": "experience_image", "id": ..., "image": {url, page, credit, license, w, h}}`), Wikimedia Commons, free licence, no identifiable people.
