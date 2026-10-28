# Design handoff: LatAm trip planner (map + scenario builder)

Owner: Simon. Data producer: the flight-crawler plugin in this repo (keeps updating `data/`). The app reads data files at runtime; nothing is hardcoded.

## 1. Tabs

### Tab 1: Map
The regional web: places (nodes) and connections (edges). Full spec in `MAP_BRIEF.md`. Summary:
- Muted base map with subtle hillshade; data on top.
- Nodes sized by popularity, coloured by country; airports get a plane glyph.
- Edges by mode: bus solid, shuttle thin, boat dashed, flight dotted arc (flights behind a toggle). Overnight = moon marker, border crossing = dot.
- Hover node: small card (image with credit line, tagline, 2-line summary, things-to-do chips, touristy 1-5 dots, 2-3 hostels with dorm/private price per night).
- Click node: side panel "From here", connections sorted by duration (mode, operator, duration, price, frequency, overnight/border icons).
- Hover edge: mode, operator, duration, price, frequency; crawled flights also show one-way min, return min, nonstop/vias, dates searched.
- Filters: mode, max duration, price.
- "Add to journey" on a node or edge sends it to the Scenario builder.

### Tab 2: Scenarios
Three sections, left to right or stacked on mobile:

**a) Recommended trips** (from `data/scenario_results.json`)
- Cards ranked by effective cost. Each card: name, one-line story, total DKK with cabin bag only, total with checked bag, hours in the air, number of flights, number of tickets, airline badges, flags (self-transfer, US transit, overnight, tight connection) as warning chips.
- Expand a card: the components in order (positioning, long-haul out, regional hops, inside Bolivia, long-haul home), each with price, date, hours, carriers, flights, tickets, bag add-on, and a link to the raw quote.
- Mini route map on the card (entry, hops, exit).
- Actions: Save (star), Duplicate into builder, Compare (pick 2-3 cards for a side-by-side table).

**b) Journey builder**
- An ordered list of legs the user builds: pick start (CPH / MAD / ALC), long-haul ticket (filtered list of main tickets: entry and exit airport, date, price, hours, carriers), then add stops/hops by clicking nodes on a small map or picking from a list; for each leg show the options available in the data (flights from `quotes`, ground from `map.json` edges), choose one.
- Live totals at the top: price (cabin / checked), hours, flights, tickets, airlines, flags; days per stop are optional inputs (date chain).
- Save as a named journey; saved journeys appear next to the recommended ones and can be compared.
- Persistence: browser storage for v1 (wrap in try/catch); export/import as JSON so journeys can be shared and later written back to the repo (`data/saved_journeys.json`).

**c) Raw data**
- Table of all quotes (`data/quotes.csv`, about 1,100 rows and growing): columns pattern, structure, dates, price, eff_cost, out/home hours, vias, carriers, tickets, self-transfer, flags, source, observed_at, link.
- Filters: origin, entry, exit, structure (return / open jaw / multi-city / one-way / regional), max hours, acceptable only (ok = 1), source, date; sort by any column; "add to journey".
- A price-history sparkline per pattern when the same search was re-checked over time.

## 2. Data files (contract)
| File | What | Key fields |
|---|---|---|
| `data/network/map.json` | nodes + edges + profiles | see `plugin/skills/flight-crawl-orchestrator/references/map-schema.md` |
| `data/scenario_results.json` | evaluated whole trips | id, name, story, ok, price, bag, hours, flights, tickets, eff, flags[], airlines[], lines[] (components; a structured `components[]` array will be added) |
| `data/quotes.csv` | the long table of quotes | quote_id, agent, task_id, source, observed_at, structure, pattern_id, variant, out_date, home_date, n_legs, rank, price_dkk, tickets, self_transfer, fare_brand, checked_bag, out_hours, home_hours, mid_hours, max_leg_hours, out_via, home_via, out_carriers, home_carriers, flags, ok, eff_cost, link |
| `data/bag_rules.json` | checked/cabin bag add-ons per airline | match, checked_dkk, cabin_dkk, note |
| `trip.json` | trip parameters (dates, origins, scoring weights, region sequence) | used for labels and the builder's defaults |

Pattern ids: `P:CPH>SAL/VVI>CPH` open jaw, `P:CPH>BOG/BOG>CPH` return, `M:a>b+c>d+e>f` multi-city, `R:BOG>LPB` regional one-way, `RR:` regional return.
Effective cost = price + 150 DKK per travel hour + penalties (overnight, self-transfer, US transit, tight connection, extra hours beyond 23 h); `ok = 0` means a leg over 30 h (hidden by default).

## 3. Visual direction
- Calm and data-first, like a good travel tool: one accent colour per transport mode, country colours muted.
- Numbers in tabular figures; DKK with thousands separator "." (Danish), e.g. 6.494 kr.
- Warnings as small chips, never red walls.
- Works on a laptop first, then phone (bottom sheets, cards stack).

## 4. Out of scope for v1
Booking, live prices from airline APIs, accounts. Prices are snapshots with dates (observed_at).
