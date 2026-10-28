# In and out pane: long-haul tickets

Design for picking where to fly in and where to fly home from. Every trip starts and ends in Copenhagen.
`in-out-prototype.dc.html` beside this file is the clickable prototype, running on a snapshot of `data/crawl.db` (28 Oct, `ok = 1`, cheapest effective cost per pattern).

## Layout

- **Left: heat matrix.** Rows are "fly in to", columns are "fly home from", grouped by region.
  - Each tile is the best journey for that pair, shaded on a 5-step ramp: brighter means cheaper (Price) or better (Ranked).
  - Round tiles are returns to the same airport.
  - Small coloured dots in a tile mean a Spain-based option exists for that pair (via Madrid, via Alicante, home via Madrid).
  - Faint dot: pair not searched. Dark tile: hidden by a filter.
  - Hovering a tile highlights its row and column and fills a readout line with every option for the pair and its total.
- **Right top: journey card.**
  - Route and total from Copenhagen, with the breakdown (ticket + Copenhagen flights).
  - Score ring (placeholder).
  - A switch between the ways to book the same pair (CPH ticket, via Madrid, via Alicante).
  - Flags, and Add to journey.
- **Right middle: map.**
  - Natural Earth projection (d3-geo) with country outlines; the entry and exit countries are tinted.
  - Great-circle arcs for every flight: out in amber, home in teal, the Copenhagen to Spain legs in grey.
  - Moving dots along each direction.
  - Markers with the landing time at the entry, the departure time home, and the wait at every stop. Night waits are marked.
  - The view zooms to fit the selected journey.
- **Right bottom: two timelines (Out, Home).**
  - Flight blocks sized by duration.
  - Wait blocks labelled with the airport and local arrival and departure clock times. Night waits are in violet; long stays (such as a night in Madrid) are compressed.
  - Door-to-door time and number of stops.
  - Hovering a block highlights that flight or stop on the map.

## Controls

- Sort and colour by: **Price** (total from Copenhagen) or **Ranked** (calculated score, placeholder until the backend provides it).
- Filters: no US transit, legs up to 23h, no nights at stops and no late landing home.

## Backend: everything is Copenhagen to Copenhagen

Madrid and Alicante are no longer origins in the UI. A ticket that starts in Spain becomes a Copenhagen journey with extra legs.

| Gateway | Long-haul ticket | Added legs (crawled 28 Oct) | Added price |
|---|---|---|---|
| `cph` | CPH to X, Y to CPH | none | 0 |
| `mad` | MAD to X, Y to MAD | CPH to MAD the day before (Iberia 15:30 to 18:55), MAD to CPH after landing (Norwegian 12:55 to 16:10) | 985 |
| `alc` | ALC to X, Y to ALC | CPH to ALC the day before (Ryanair 16:10 to 19:35), ALC to CPH after landing (Norwegian 16:10 to 19:25) | 492 |
| `cph_home_mad` | CPH to X, Y to MAD | MAD to CPH after landing | 364 |

The prototype assumes the Copenhagen flights run at the same times every day. The backend should price and time them for the real dates instead.

### `data/web/journeys.json`

One row per bookable journey:

```
id
entry, exit                         // IATA
gateway: "cph" | "mad" | "alc" | "cph_home_mad"
total_dkk                           // ticket + added legs
ticket: { pattern_id, price_dkk, eff_cost, n_quotes, source, observed_at, tickets, flags: [], link }
score: number | null                // calculated by the backend; null until then
out:  [segment]                     // in order, from CPH to the entry
home: [segment]                     // in order, from the exit to CPH
```

Each segment is one flight or one wait:

```
{ kind: "flight", from, to, dep_utc, arr_utc, carrier, flight_no, added_leg: bool }
{ kind: "wait", at, start_utc, end_utc, night: bool, added_leg: bool }
```

Store UTC and let the frontend show local time from an airport time-zone table (`airports.json`: iata, name, lat, lon, tz). The raw crawl JSON already has local `dep` and `arr` per leg plus `layover_h`. Per-segment times need the flight numbers or a flight duration estimate. The prototype splits flying time by great-circle distance.

## Data gaps seen

- `P:MAD>SAL/VVI>MAD` (the cheapest Spain-based option, 42 quotes) has no vias or carriers in its best row.
- Per-segment flight times are not stored; the timeline estimates them from the distance flown.
- Checked bags are not in the totals yet; `bag_rules.json` could add them per carrier.
