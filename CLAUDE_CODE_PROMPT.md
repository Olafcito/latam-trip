# Prompt for Claude Code: LatAm trip planner

Build a web app where I pick how I fly in and out of Latin America and then build my itinerary between those two
points. The data comes from a flight crawler that keeps updating a public GitHub repo, so read everything at runtime and
hardcode nothing.

## The trip
- Solo backpacking trip, Copenhagen (CPH) to Latin America and back, leaving about 1 to 4 Dec 2026, home about 3 to 5 Feb 2027.
- Countries: Nicaragua, Honduras, El Salvador, Colombia, Bolivia (friends in La Paz, Cochabamba, Santa Cruz). Costa Rica,
  Guatemala and Mexico (Cancún, Mexico City, Guadalajara) are optional.
- Every journey starts and ends in Copenhagen. A **way in** is CPH → an airport in Latin America; a **way home** is an
  airport → CPH. The details are what differ: hubs, a night in Madrid, separate tickets, times.

## Data (public repo Olafcito/latam-trip, branch main)
Fetch from raw.githubusercontent.com at runtime, and also keep a copy in `public/data/` (a `npm run sync-data` script
that downloads them) so the app works offline.
- `data/inout.json`: airports, tickets, ways (in and home, each with a timeline) and rated options. Schema:
  `plugin/skills/flight-crawl-orchestrator/references/inout-schema.md`. Read the schema first and generate TypeScript types from it.
- `data/network/map.json`: places (nodes with lat/lon, popularity, a hover profile with image, tagline, things to do,
  touristy 1-5, hostels with prices) and connections (edges: bus, shuttle, boat, flight, with duration, price, operator,
  frequency, overnight, border). Crawled flight edges (`source: "crawl"`) have `flights`: up to 6 real one-ways with
  local depart/arrive, hours, price, carriers, via, fare and bags. Schema: `plugin/skills/flight-crawl-orchestrator/references/map-schema.md`.
- `data/quotes.csv`: every raw quote (for a "raw data" view and links from tickets/flights by `quote_id`).
- `data/bag_rules.json`: bag fees per airline (some are estimates, show "est.").
- `trip.json`: trip parameters (dates, regions, scoring weights).

## Screens

### 1. Pick in and out (start screen)
- A table of `options` from inout.json, sorted by `rating.total`. Columns: arrival city, departure city, type
  (One ticket / Madrid ticket + own hops / Separate one-ways), flights price, cabin-bag fees, rating, leaves CPH,
  lands, flying hours out, departs home, home in CPH, flying hours home, hub nights. One fact per cell.
- Filters: arrival city, departure city, type, max price, min rating, max hours per direction, no US transit,
  max hub nights. Remember filters per browser (localStorage, wrapped in try/catch).
- Expanding a row shows both ways as timelines: each flight (from → to, local times, hours, carriers, flight numbers,
  connections with layover hours) and each stop as its own row (connection / self-transfer / day stop / night, hours on
  the ground, nights, estimated stay). A small map draws the two ways as arcs from Copenhagen.
- A mode "Mix one-ways": pick any way in and any way home of type `oneways` separately (they are separate tickets),
  with the same timeline preview. A `ticket` or `madrid` way always comes with its `paired_with` way.
- "Build trip from this" opens screen 2.

### 2. Journey builder
- The journey is: way in (fixed at the top) → stops and hops I add → way home (fixed at the bottom). It must start at
  the option's `entry` airport and end at its `exit` airport.
- Dates: the way-in arrival fixes day 1 on the ground; the way-home departure fixes the last day. I set nights per
  place; the app computes dates, shows the slack (days left or days over) and warns when a hop would arrive after the
  flight home leaves.
- Adding a hop: from the current place, list the connections from map.json sorted by duration (mode icon, destination,
  operator, duration, price, frequency, overnight and border icons). For crawled flights let me pick one of `flights`
  (show "price seen for <date>" because the date may differ from mine). I can also add a place from the map.
- A "route to exit" helper that I trigger myself: shortest path by hours or by price from the current place to the
  exit airport over map.json edges. Never auto-fill the itinerary.
- Hub nights are part of the journey: show them as stops in the timeline and in the extras, never inside the flight price.

### 3. Totals and comparison
- Totals panel: flight tickets (a shared ticket counted once), then separately: cabin-bag fees, checked-bag fees,
  hub nights and their estimated stay, ground transport, number of flights, hours in the air, days per country.
- Save and name journeys (localStorage with try/catch, plus JSON export and import). Compare up to 3 side by side.

## Visualizations
- Map (MapLibre GL with free tiles such as OpenFreeMap, or Leaflet with OSM): muted base map; ways in and home as
  great-circle arcs from Europe; hub stops as markers sized by hours on the ground, a moon for nights, a split-ticket
  icon for self-transfers; the journey path coloured by mode (bus solid, shuttle thin, boat dashed blue, flight dotted arc).
- Timeline: a horizontal calendar from 1 Dec to 5 Feb with bars for flights, hub stops and stays per place, coloured by
  country. Hovering shows times.
- Place hover card from map.json profiles (image with credit, tagline, things to do, touristy dots, hostels with prices).

## Rules
- Times are local at each airport; show the day with the time ("3 Dec 06:00") and mark next-day arrivals. Use
  `airports[code].utc_offset` for door-to-door hours.
- Numbers Danish style: 6.494 kr. No em or en dashes in UI text.
- Show `observed_at` on prices; prices are snapshots. Flag arrivals at exactly 23:59 as "time uncertain".
- Null fields (layover_h, checked-bag fee) show as "?" with a tooltip, never 0.
- Booking, payments and accounts are out of scope.

## Tech and delivery
- Vite + React + TypeScript, no backend. State in a small store (Zustand or React context).
- Unit tests for: date chaining and slack, price totals with a shared ticket, mixing one-way ways, shortest path.
- A README with how to run, how to sync data, and how to deploy to GitHub Pages.
- Start by reading the two schema files and printing a summary of inout.json (counts of ways, options, airports) so we
  agree on the data before building UI.
