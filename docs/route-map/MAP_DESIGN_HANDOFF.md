# Route map module: design handoff

Handoff from the design prototype (Claude canvas, "Route Atlas") to the real build in the repo.
The prototype file `route-map-prototype.dc.html` sits next to this file as an interaction reference. Read its CSS and the `renderVals()` logic for timings, colours and behaviour. Do not port its rendering approach (see "Why the prototype got slow").

## 1. What it is

A self-contained, embeddable map component (`<RouteMap />`). It fills whatever box the host page gives it. Everything lives inside the map frame: panels, tooltips, controls. Nothing renders outside its bounds.

Scope for v1: Tab 1 (Map) only. Scenarios/journey builder come later.

## 2. Stack

- **MapLibre GL JS** (free, open source, WebGL). It handles fast pan/zoom, label collision (fixes the bunched-up country names) and zoom-dependent styling.
- **Base map:** OpenFreeMap (free, no API key) with a muted dark custom style. Optional terrain/hillshade from MapTiler's free tier so the Andes and volcanoes read.
- **Routes:** MapLibre `line` layers from GeoJSON. Flights as great-circle or bezier arcs generated client-side. deck.gl `ArcLayer` is an option if we want 3D arcs later; not needed for v1.
- **Panels/tooltips:** plain React/HTML overlays positioned inside the map container.
- Hover state via MapLibre `feature-state` (no React re-render on hover).

## 3. Why the prototype got slow (avoid this)

- Every pointer move and wheel tick re-rendered the whole React tree: ~25 SVGs, ~80 positioned DOM labels, all counter-scaled.
- Infinite CSS dash animations on many paths at once, plus blur filters and CSS `d` path transitions.
- One big scaled SVG image as the base map.

MapLibre fixes all of this by drawing on the GPU and only touching React when selection changes.

## 4. Visual spec

Colours (dark theme):

| Token | Hex | Use |
|---|---|---|
| ground | #0B1720 | sea / background |
| land | #14252E | land fill |
| coast | #3A5866 | coastline |
| border | #2E4855 | country borders, dashed |
| text | #EAF0F2 | primary labels |
| muted | #93A7B2 | secondary labels |
| bus | #6FD3B8 | bus/shuttle lines and dots |
| flight | #F2B544 | flight arcs and dots, selected city |
| panel | #F3EFE6 | panel/tooltip background |
| ink | #13202A | panel text |

Fonts: Bricolage Grotesque (UI), IBM Plex Mono (numbers, tabular).

Lines (fix from feedback: they got too fat and too colourful when zoomed):
- Width in screen px, interpolated by zoom and kept thin: default 1.2 to 1.8 px, hovered/selected 2.5 px max.
- Bus: solid. Flight: dotted arc. Both modes on one pair: two thin parallel lines (bus + flight), offset 2 px.
- Overview (nothing selected): all routes at ~25% opacity.
- City selected: only its routes, full opacity. Everything else hidden.
- Only the hovered/selected route gets the moving dot or flow animation. Never animate all routes at once.

Labels:
- Country names: small caps, wide tracking, muted. Use symbol collision and `text-variable-anchor` so they never overlap.
- Destination cities: always shown, with collision priority by popularity.
- Towns and stop-only places: fade in from zoom ~6, names from ~7.

## 5. Interaction spec

| Action | Result |
|---|---|
| Hover city (nothing selected) | Preview its routes; small tooltip: name, country, "why", number of connections |
| Click city | Select it; `fitBounds` to city + all connected cities, leaving room for the panel; panel opens |
| Click selected city again | Deselect, close panel, ease back out to the full region |
| Click empty map | Same as above (deselect, close panel, zoom out) |
| Hover connected city or route | Highlight that route; reveal its middle stops at their real coordinates; tooltip with bus AND flight time + price + "via" |
| Click connected city or route | Panel switches to route view |
| Scroll / pinch | Zoom toward cursor |
| Drag, or hold space + drag | Pan (space works even when starting on a city) |
| Esc | Back one panel level, then deselect |

Tooltip placement: never on top of the things it describes. Compute the screen bounding box of both cities and all stops, then try right, left, below, above; pick the first that fits inside the map and outside the panel.

## 6. Panel (inside the map, left)

Fix from feedback: it took ~40% of the screen. Target 300 px wide (360 px for detail views), max height = map height minus margins, collapsible to a slim header.

Views (one panel, animated swap):
1. **City summary:** thumbnail, name, country + altitude, "why" line, 3 category chips, "More about [city]", connections list. Each connection row shows BOTH modes: `bus 9h fra 210 kr` and `flight 1h05 fra 1.040 kr`, sorted by fastest.
2. **More about [city]:** 16:9 image with credit/licence, why, summary, altitude, touristy (5 dots), things to do, hostels (dorm/private DKK, `price_suspect` greyed), full "From here" list with both modes.
3. **Route:** title A to B, comparison cards (bus vs flight: duration, price, via, overnight/border flags), then the selected option's details:
   - **Stops on the way: middle stops only** (fix from feedback: start and end were listed).
   - Operators, note.
   - Flights: one-way and return prices, nonstop or vias, carriers, dates searched, price observed date.
   - Actions: "Search live prices", "Go to [destination]", "Add to journey".

Controls (inside the map):
- Top right: mode toggles (Bus, Flight); zoom in/out; whole map.
- Bottom right: compact legend.
- Hint ("Click a city, scroll to zoom, drag or hold space to pan") only on first load, and positioned so it does not collide with the legend (fix from feedback). Fade out after first interaction.

## 7. Data the component expects

Prices as integer DKK, durations in minutes, coordinates lat/lon. The frontend formats everything (`1h05`, `fra 1.040 kr`, Danish thousands with a period).

### places.json
```
id, name, country, lat, lon
tier: "destination" | "town" | "stop_only"
popularity: 1..5
iata, airport_transfer_min          // e.g. Antigua -> GUA, 60
// destinations only:
why                                 // from nodes.csv, the bold line
summary
categories: []                      // fixed list: Transit hub, Colonial, Beach, Altitude, Nature, Nightlife, Food, Markets, Ruins
things_to_do: []
touristy: 1..5
altitude_m
image: { url, credit, licence }
hostels: [{ name, dorm_dkk, private_dkk, price_suspect, url }]
```

### connections.json
```
id, a, b                            // undirected pair of place ids
options: [{
  mode: "bus" | "shuttle" | "flight"
  operators: []
  duration_min
  price_dkk: { min, typical }
  frequency
  overnight: bool
  stops: [{ place_id, type: "stop"|"change"|"border"|"layover", wait_min }]   // middle stops only, in travel order from a to b
  geometry: [[lon, lat], ...] | null   // optional real road path; else draw through stops
  flight: {
    nonstop: bool, vias: [], carriers: [],
    oneway_dkk: { min, observed_at },
    return_dkk: { min, observed_at } | null,     // from RR: patterns
    dates_searched: []
  } | null
  source: "crawl" | "manual", observed_at
  note, booking_url
}]
```

### countries.json
`code, name, label_lat, label_lon`

Rules for the backend:
1. Every stop references a place in places.json with coordinates.
2. Keep each stop's `type`; it drives the markers and timeline.
3. Prices and durations stay numeric so filters (max hours, max price) work.

## 8. Open questions (decide with real data)

- Real clutter level with 67 places and ~220 connections: does the faint overview still read, or should overview show only routes between popularity 1-2 places?
- Price history: show a sparkline in the route view when a pattern has several `observed_at` values?
- Shuttle vs bus: separate styling or merged as "ground"?
- Where returns live: on the connection (`flight.return_dkk`) or as a separate quotes table joined by pattern id.

## 9. Known prototype issues to fix in the build

- [ ] Slow pan/zoom (solved by MapLibre)
- [ ] Country labels overlapping (solved by symbol collision)
- [ ] Route lines too thick and busy when zoomed
- [ ] Panel too wide; make it 300 px and collapsible
- [ ] Clicking empty map should deselect and zoom out
- [ ] Hint overlaps the legend
- [ ] Route timeline lists start/end; show middle stops only
- [ ] Flights show only "Direct"; add return prices, vias, carriers, dates
