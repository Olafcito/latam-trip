# latam-trip

Simon's Latin America trip (Dec 2026 to Feb 2027): a crawled flight and ground-transport dataset, the crawler plugin that produces it, and the brief for an interactive map + scenario builder.

- `DESIGN_HANDOFF.md`: what the app should look like and do (Map tab, Scenarios tab with recommended trips, journey builder and raw data).
- `MAP_BRIEF.md`: the map spec.
- `data/`: `network/map.json` (places, connections, profiles), `quotes.csv` / `crawl.db` (all flight quotes), `scenario_results.json` (evaluated trips), `bag_rules.json`.
- `plugin/`: the flight-crawler Claude plugin (agents, skills, scripts). `src/` holds copies of the scripts for running in place.
- `trip.json`: trip parameters and scoring weights.

Refresh derived data: `python3 -I src/ingest.py && python3 -I src/build_map.py && python3 -I src/evaluate.py`
