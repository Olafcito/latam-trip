# latam-trip

Simon's Latin America trip (Dec 2026 to Feb 2027): a crawled flight and ground-transport dataset, the crawler plugin that produces it, and the brief for an interactive map + scenario builder.

- `DESIGN_HANDOFF.md`: what the app should look like and do (Map tab, Scenarios tab with recommended trips, journey builder and raw data).
- `MAP_BRIEF.md`: the map spec.
- `data/`: `network/map.json` (places, connections, profiles), `quotes.csv` / `crawl.db` (all flight quotes), `scenario_results.json` (evaluated trips), `bag_rules.json`.
- `plugin/`: the flight-crawler Claude plugin (agents, skills, scripts). `src/` holds copies of the scripts for running in place.
- `trip.json`: trip parameters and scoring weights.

Refresh derived data: `python3 -I plugin/skills/flight-crawl-orchestrator/scripts/ingest.py && python3 -I plugin/skills/flight-crawl-orchestrator/scripts/build_map.py && python3 -I plugin/skills/flight-crawl-orchestrator/scripts/evaluate.py`

## Route map

The map tab lives in `web/` (React, Vite and MapLibre on OpenFreeMap tiles). The design is in `docs/route-map/MAP_DESIGN_HANDOFF.md`, and `docs/route-map/route-map-prototype.dc.html` is the clickable prototype it was built from.

The app reads three files in `data/web/`. Rebuild them after any change to the network or the quotes:

    python3 -I plugin/skills/flight-crawl-orchestrator/scripts/build_web_data.py

For crawled flights the exporter also reads `data/crawl.db` and keeps the cheapest fare per departure date and direction, with the real departure time. A search for one date returns flights on the days around it, so these dates can differ from the date that was searched. Flights that were only researched have no dates. Regional return quotes are listed one by one with both legs.

The map shows only quotes the crawler accepted (`ok = 1`). Ad offers, incomplete results and trips over 30 hours stay in the DB but off the map. If an accepted regional quote has no flight edge in `data/network/map.json`, the exporter prints a warning, so anything missing on the map is missing from the data.

Add `--fetch-elevation` to look up altitudes for new places. The result is cached in `data/network/elevation.json`.

### Options pane

The Options button in the top bar opens a third pane beside the map with the flight option tables: whole trips, long-haul tickets, regional flights and a note on how the ratings work. Clicking a whole trip or a long-haul ticket rings its arrival and home airports on the map. The pane reads three more files in `data/web/`, `dash_trips.json`, `dash_journeys.json` and `dash_flights.json`, and shows them as they are. Nothing is recomputed in the browser. If one file is missing, that tab says so and the others keep working. Rebuild them from the repo root with:

    python3 plugin/skills/flight-crawl-orchestrator/scripts/inout.py --root . && python3 plugin/skills/flight-crawl-orchestrator/scripts/itineraries.py --root . && python3 plugin/skills/flight-crawl-orchestrator/scripts/dashboard_data.py --root .

The same tables are in `data/web/dash_index.html`, a standalone page that the pane was built from.

Run the app locally:

    cd web
    npm install
    npm run dev

The dev server reads `data/web/` straight from the repo, so a rerun of the exporter shows up on reload. A production build reads its data from `VITE_DATA_BASE`, for example `https://raw.githubusercontent.com/Olafcito/latam-trip/main/data`. Checks are `npm run typecheck` and `npm test`.

Known data gaps the map shows as they are:

- Ground routes have no middle stops yet, so bus lines are drawn straight.
- `airport_transfer_min` is empty everywhere.
- Puno, Cusco and Lima have no tagline or summary, so their panel is thin and they get no "More about" page.
- Some flights have neither a nonstop flag nor vias, which shows as "No stop data" and Routing "?".
- Connections to Mexico City are left out, because it is only a layover airport on the map and has no panel.
