# Interactive trip map: build brief (for Claude Code)

Goal: an interactive map of the trip region (Central America, Colombia, Bolivia, Guadalajara) drawn from data/network/map.json.

## Data (contract)
- data/network/map.json: {"nodes": [...], "edges": [...], "missing_nodes": [...]}; schema in plugin/skills/flight-crawl-orchestrator/references/map-schema.md
  - node: id, name, country, lat, lon, type, iata, popularity (1 = top), profile {image {url, credit, license, page}, tagline, summary, things_to_do[], touristy 1-5, hostels[{name, dorm_dkk, private_dkk, rating, price_suspect?}]}
  - edge (ground/boat/researched flight): from, to, mode (bus|shuttle|boat|flight|chicken_bus|colectivo|train), operator, duration_h, duration_range, price_dkk, frequency, overnight, border, both, source, source_year, notes
  - edge (crawled flight, source "crawl"): from, to, oneway_min_dkk, oneway_min_hours, fastest_hours, fastest_price_dkk, nonstop, vias[], carriers[], dates[], return_min_dkk, quotes
- data/network/nodes.csv, edges.csv: the same as flat tables.
- data/quotes.csv / data/crawl.db: the full long table of main-ticket and regional flight quotes (scored: eff_cost, ok).
- Regenerate map.json after new crawl data: python3 -I plugin/skills/flight-crawl-orchestrator/scripts/build_map.py --root .

## What the map must do (Simon's spec)
- Nodes as markers sized by popularity; edges as lines styled by mode (bus solid, boat dashed, flight arc/dotted), border crossings marked.
- Hover a node: small card with image (credit + licence line), tagline, summary, things to do, touristy, hostels with price per night. No safety, weather, budget or days.
- Click a node: "From here": its edges sorted by duration with mode, operator, duration, price, frequency, overnight, border.
- Hover an edge: mode, duration, price, frequency, source; crawled flights also show one-way min, return min, nonstop, vias, dates searched.
- Filters: mode, max duration.
- Later: overlay of main tickets (entry/exit airports from quotes.csv) and route totals.

## Notes
- Images are Wikimedia Commons (free licences); show the credit.
- Prices are DKK; ranges and source years are in the data. price_suspect hostels should be shown greyed.
