# Prompt for the designer / builder

You are designing and building a web app: a trip planner for Simon's backpacking trip through Latin America (Central America, Colombia, Bolivia, optionally Guadalajara) from early December 2026 to early February 2027. The data comes from a crawler that keeps adding to the files in `data/`, so read everything at runtime and hardcode nothing.

Read these first: `MAP_BRIEF.md`, `plugin/skills/flight-crawl-orchestrator/references/map-schema.md`, `data/network/map.json`, `data/scenario_results.json`, the header of `data/quotes.csv`, and `trip.json`.

## Build two tabs

### Tab 1: Map
Show the regional web of places and connections from `data/network/map.json` (67 places, about 220 connections).
- Use a muted, low-contrast base map with subtle hillshade, so the Andes, volcanoes and coasts read and the data stands out.
- Draw places as circles sized by popularity (1 is the top) and coloured by country. Give airports a small plane glyph. Show labels for popularity-1 places when zoomed out and for all places when zoomed in.
- Style connections by mode: bus as a solid line, shuttle as a thin line, boat as a dashed blue line, flight as a dotted arc in a warmer colour. Put a small moon on overnight legs and a dot where a connection crosses a border. Keep flights behind a toggle that is off by default.
- On hovering a place, show a card of about 320 px: the image (16:9) with a tiny credit and licence line, the tagline in bold, a 2-line summary, things to do as 3 to 5 chips (these carry the vibe), touristy as 5 dots, and 2 to 3 hostels with dorm and private price per night in DKK, greying out any marked `price_suspect`. Leave out safety, weather, budget and days.
- On clicking a place, open a side panel titled "From here" that lists its connections sorted by duration: mode icon, destination, operator, duration, price, frequency, and overnight and border icons. Hovering a row highlights the line; clicking it flies to the destination.
- On hovering a connection, show mode, operator, duration, price, frequency and source. Crawled flights (`source: "crawl"`) also show the cheapest one-way, the cheapest return, nonstop or vias, carriers, and the dates searched.
- Add filters for mode, maximum duration and maximum price.
- Every place and connection gets an "Add to journey" action that sends it to Tab 2.

### Tab 2: Scenarios
Lay out three sections side by side on a laptop and stacked on a phone.

1. **Recommended trips**, read from `data/scenario_results.json`.
   - Show one card per trip, ranked by `eff` (effective cost, lower is better).
   - Each card shows the name, the story line, the total in DKK with cabin bag, the total with a checked bag (price + bag), hours in the air, number of flights, number of tickets and airline badges. Show warning chips for flags (self-transfer, US transit, overnight layover, tight connection, basic fare).
   - Expanding a card shows its components in travel order (positioning, long-haul out, regional hops, flights inside Bolivia, long-haul home), each with price, date, hours, carriers, number of flights and tickets, and bag add-on. Each component links to its raw quote.
   - Add a mini route map on the card.
   - Card actions: Save (star), Compare (pick 2 or 3 for a side-by-side table), and Open in builder.
2. **Journey builder.**
   - The user picks a start (Copenhagen, Madrid or Alicante) and then a long-haul ticket from a filtered list of main tickets in `quotes.csv` (entry and exit airport, date, price, hours, carriers, flags).
   - The user then adds hops in order, by clicking places on a small map or picking from a list. For each hop, offer the options the data has: crawled flights from `quotes.csv` (patterns starting `R:` for one-ways and `RR:` for returns) and ground connections from `map.json`. The user chooses one.
   - Show live totals at the top: price with cabin bag, price with checked bag, hours, flights, tickets, airlines and flags. Days per stop are an optional input, so a date chain can be shown.
   - Journeys can be saved and named, and saved journeys show up next to the recommended trips so they can be compared. For v1, store them in browser storage (wrap every read and write in try/catch) and offer JSON export and import. Later they will be written back to `data/saved_journeys.json`.
3. **Raw data.**
   - Show the full table of quotes from `data/quotes.csv` (about 1,200 rows and growing).
   - Filters: origin, entry, exit, structure (return, open jaw, multi-city, one-way, regional), maximum hours, acceptable only (`ok = 1`, which is the default; `ok = 0` means a leg over 30 hours), source, and date.
   - Every column is sortable, and each row has an "Add to journey" action.
   - Show a price-history sparkline for a pattern when the same search has been re-checked over time (`observed_at`).

## Data notes
- Pattern ids:
  - `P:CPH>SAL/VVI>CPH` is an open jaw.
  - `P:CPH>BOG/BOG>CPH` is a return.
  - `M:a>b+c>d+e>f` is a multi-city ticket.
  - `R:BOG>LPB` is a regional one-way.
  - `RR:` is a regional return.
- Effective cost = price + 150 DKK per travel hour + penalties (overnight layover, self-transfer, US transit, tight connection, and hours beyond 23 on a long-haul leg).
- Bag add-ons per airline are in `data/bag_rules.json` (`cabin_dkk` and `checked_dkk`, long-haul vs regional). Several are marked ESTIMATE; show them with a small "est." label.
- Prices are DKK snapshots with the date they were seen. Write numbers Danish style, e.g. 6.494 kr, using tabular figures.
- Images come from Wikimedia Commons under free licences; always show the credit.

## Visual direction
Calm and data-first. Give each transport mode one accent colour and keep the country colours muted. Warnings are small chips, never red walls. Design laptop first, then phone, where panels become bottom sheets and hover becomes tap.

## Out of scope for v1
Booking, live prices from airline APIs, and user accounts.
