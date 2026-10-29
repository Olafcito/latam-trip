---
name: latam-trips
description: Create, optimize and navigate trips in the latam-trip planner (planner/ React app). Use when asked to build a trip, find a cheaper or faster route, compare trips, seed a trip into the app, or drive the planner UI with Playwright.
---

# latam-trips

The planner at planner/ is a two tab React app (Map and Trips) that runs on http://localhost:5173/ with `npm run dev` in planner/. A trip is a journey: one way in from Copenhagen, one way home, and an ordered list of places with the hop that brings you to each one. Nights are never specified. The schedule derives the days per place from the dated flights only.

## Where the data lives

| File | What it is |
|---|---|
| data/inout.json | Long haul ways in and home. `ways` is a map of id to way with direction, from, to, depart, arrive, total_hours, airports, tickets, hub_nights, extras. `options` pairs a way in and a way home with a rating. `airports` maps IATA codes to name and country. |
| data/web/places.json | Map nodes (id, name, country, lat, lon, iata, profile with tagline and hostels). |
| data/web/connections.json | Map edges between nodes with mode, hours, price, operator. |
| data/web/flights.json | Crawled regional one way flights, a list of {from, to, dkk, hours, dep, arr, vias, carriers, notes, shows}. |
| data/saved_trips.json | The seeded trips the app imports on first run. Built by `python src/seed_trips.py` from data/seed_spec.json. |
| data/seed_spec.json | Hand written trip seeds: id, rank, name, option id, order of countries, segments (overland notes and flights by quote_id). |

The app copies data into planner/public with `npm run sync-data` in planner/. Run it after changing anything under data/.

## The journey shape

```json
{
  "id": "j-abc123",
  "name": "Guatemala City in, Bogotá home",
  "wayIn": "I0125",
  "wayHome": "H0042",
  "optionId": "GUA-BOG-ticket",
  "rank": 1,
  "places": [
    { "node": "GUA", "hop": null },
    { "node": "SJO", "hop": { "from": "GUA", "to": "SJO", "mode": "bus", "operator": null, "hours": 20, "price_dkk": 400, "overnight": true, "border": true, "flight": null, "overland": "Overland, your own route" } },
    { "node": "LPB", "hop": { "from": "SJO", "to": "LPB", "mode": "flight", "operator": "LATAM", "hours": 9.1, "price_dkk": 2187, "overnight": true, "border": true,
      "flight": { "quote_id": "Q:8f55e7717892", "depart": "2026-12-06T16:55", "arrive": "2026-12-07T04:00", "hours": 9.08, "price_dkk": 2187, "carriers": ["LATAM"], "via": ["LIM"], "layover_h": [3.42] } } }
  ]
}
```

Rules that keep a journey valid (see planner/src/lib/journey.ts):

- The first place is the node of the way in's arrival airport (`nodeForAirport(inout, wayIn.to)`). The last place must be the node of the way home's departure airport, or the schedule warns.
- `wayIn` and `wayHome` are ids from `inout.ways`. Seeded trips use ids like `seed-1-gua-bog:in` and `seed-1-gua-bog:home` that `withSeedWays` adds at load time.
- Each `hop.flight` is a dated flight. The schedule chains the landing, every dated flight and the flight home, and shares the days evenly between those anchors. A flight that leaves before you arrive, or lands after the flight home, is an error warning.
- There is no `nights` field anywhere. Do not add one.

## Creating a trip

Three ways, from least to most invasive:

1. **In the app.** Trips tab, New trip, pick a way in and a way home (the Pick screen filters by price, hours, hub nights, US transit), then build the route on the map: click a lit city to add it, pick a flight in the city panel, drag the grip to reorder, Save trip in the pane. The Trips tab then opens the dashboard of that trip.
2. **Import a JSON file.** Trips tab, Import trips, with a file holding a journey or a list of journeys in the shape above. Playwright can do it with `setInputFiles` on the hidden file input.
3. **Seed it.** Add a trip to data/seed_spec.json, run `python src/seed_trips.py --root .` then `npm run sync-data` in planner/. The app imports new seeds once (localStorage key `latam-planner.seeded` remembers the file version, clear it to re-import).

With Playwright or the browser console, the saved trips live in localStorage under `latam-planner.journeys` (a list) and the open trip under `latam-planner.current`. Writing those and reloading is the fastest way to put a trip into the UI.

## Optimizing a trip

Everything is pure functions under planner/src/lib, usable from a vitest file or a node script with `npx tsx`:

- `shortestPath(map, from, to, 'hours' | 'price')` in graph.ts finds the fastest or cheapest chain of edges between two nodes.
- `arcsSorted(map, node)` lists every connection from a node, and `crawledFlights(edge)` gives the dated flights on a flight edge with price and hours.
- `schedule(journey, wayIn, wayHome, exitNode, names)` returns the dated arrivals, the days per place and the warnings.
- `totals(data, journey, schedule)` sums long haul tickets, regional flights, ground, bag fees, hub stays, flights, hours in the air and days per country.
- `mixWays(inout, wayIn, wayHome)` rates a pair of long haul ways the way the Pick screen does, and `passesFilters` applies the user's filters.

A typical optimization loop: take the journey, list candidate flights for each flight hop from flights.json or `crawledFlights`, swap the hop and keep the one with the lowest `totals().regional_flights_dkk` that keeps `schedule().warnings` free of errors. Never invent a price. Unknown stays `?`.

## Navigating the app

- Two tabs in the top bar, Map and Trips. The Trips tab remembers its view: the landing with the trip cards, the Pick screen for a new trip, or the dashboard of the open trip.
- Trip card: Open goes to the dashboard, Map opens the trip in build mode on the map, Compare ticks it for the compare table (up to 3).
- Dashboard: hero facts, warnings, the route timeline with every hop and the days per place, the ways in and home, costs, days per country, a mini map. Build on the map goes to the map.
- Map in build mode: the trip pane sits on the right. Click on the map beside it and it folds to a small translucent card at the top right. Click the card to unfold it. The calendar button in the pane header opens the dashboard.
- In build mode the first click on a stop marker moves the cursor to it and the second click opens the city panel with its connections. The In/Out switch in the city panel flips the connection list and the edge animation.

## Verifying

```
cd planner && npx tsc -b && npx vitest run
cd web && npx tsc --noEmit && npx vitest run
```

Screenshots with Playwright at 1440x900 and 390x844. Animations stay pending until a screenshot forces a frame, so take two. The Impeccable detector checks design findings: `C:/Users/Simon/.claude/skills/impeccable/scripts/impeccable detect --json <absolute paths>` from the repo root.
