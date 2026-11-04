# The way picker

Which pane this is: the picker of the way in and the way home, `planner/src/screens/PickScreen.tsx`, opened with Change from the trip pane of the Map tab. It holds the ranked pairs, the one ways that mix, the home airport pill (`HomePill.tsx`) and the flight options of one pair. Styles live in `planner/src/styles/pick.css`. The roast is `.superpowers/sdd/2026-11-03-ui-roast/roast-waypicker-1.md`.

## Journey

1. Simon has not settled where the trip starts and ends. He opens the picker to choose the pair of way in and way home.
2. He wants the best pairs ranked so the cheapest sensible pair is obvious, and he can see what each pair costs together and why it ranks where it does.
3. He compares a return ticket against mixing two one ways.
4. He can change his home airport (Copenhagen, or a nearby airport) and see the prices change.
5. He opens one pair to see its actual flight options (dates, times, stops, airline) and picks one.
6. He closes the picker and his trip now starts and ends where he chose.

## Goals

- One ranked list of pairs is the spine. A row is one pair: rank, the two cities with flags, the ticket types it comes in, the marks that cost it points, the all in price large and the score small. The first row is the best pair. The cheapest pair carries its own mark wherever it ranks.
- The price on a row is the all in price the data already holds (`total_dkk`): flights, cabin bags and hub stays. The score is the project's own score, and its parts show as a meter of price, way home and way in with the marks that cost points.
- Return against one ways is answered inside each pair: a tile per ticket type with its cheapest all in price and the difference in kr. Picking Two one ways opens the one ways of those two cities to mix, with the total live.
- The home airport is a pill with Copenhagen and the airports near it. Each row shows its best pair price, or a No fares chip when the data has none from there.
- A pair opens to its options as cards with dates, local times, stops, airline and price. One option is chosen at a time, and one button pinned to the bottom applies it with the result as its label: "Start Cartagena, end Guatemala City".
- On a desktop the pair sits in a sticky column beside the list. On a phone the pair opens in place under its row.
- A booked way that the pick would replace shows a lock on that side, and the apply button stays off with the reason. A pick never half applies.
- Everything the data holds for a pair shows: every option, every ticket with source, date seen, fare, legs, bags, flags, notes and its link.

## Anti goals

- No ranked list of pairs. The grid of pairs is the main stage (brought back on 11-04 after the list lost the whole picture), with the pair pane and the apply button beside it. Each cell is the score or the all in price in thousands as the sort says, with the key in the controls row.
- No separate Mix mode. Mixing lives in the pair.
- No prose lines that explain the screen.
- No new database fields and no change to `types.ts`. `total_dkk` and `on_total` are read through a local type.
- No change to the trip pane that opens the picker, the trip page, the flight sheets, the way sheets, the trips list, the city sheet or the route map window. `WayTrack` and `waycard.css` stay as they are, the trip page uses them.
- No filters that hide rows without showing it. Max price, min rating, max hours and type leave the screen, and the stored values for them are ignored.

## Design

### Data

`inout.json` holds 53 airports, 503 tickets, 918 ways and 342 options over 209 pairs. Every option carries `total_dkk` and every rating carries `on_total`. 140 pairs have one option and the most is 7. 65 pairs come in more than one ticket type. The only home in the data is CPH. Every way score follows the rule in `inout.rating.way_score`: 5, less a point per hub night, a change between separate tickets, US transit, more than 20 hours flying and more than 23 hours flying. So the marks on a row are derived from the way, not guessed. 720 of 918 ways carry the same figure in `total_hours` and `flying_hours`, because their single flight item holds the connections. Time in the air shows only where it differs.

### Pure helpers, `planner/src/lib/pairs.ts`

Tested in `pairs.test.ts`:

- `allIn(option)`: `total_dkk`, else flights plus cabin bags plus hub stay.
- `wayMarks(way)`: hub nights, change between tickets, US transit, long flight (1 or 2), each with the points it costs.
- `pairRows(inout, home, filters, sort)`: options of the home grouped by pair, each with its best option for the sort, its cheapest, its types and its options in order. Sort Best is the score high to low and then the price, sort Cheapest is the all in price low to high and then the score.
- `typeTiles(options)`: the cheapest option of each type with its difference to the cheapest of the pair.
- `cityChoices(rows, side)`: each city a pair flies in to or home from, with its best price, grouped by region.
- `homeChoices(inout, homes)`: each home airport with its best pair price or null.
- `oneWaysFor(inout, home, pair)`: the one ways that mix for the pair's two cities, sorted.
- `scoreParts(option)`: points from price (out of 5), way home (out of 3) and way in (out of 2).

### Head

Back to the trip on the left. The title is the answer: the home flag, then the In city, an arrow and the Home city of the chosen pair, or of the trip when none is chosen. The trip name sits small above it.

### Controls row

One row, wrapping on a phone: the home pill with a house icon, a Fly in pill and a Fly home pill (any city, or one city with its best price), the Best or Cheapest sort, a No US chip and a hub nights pill (Any, None, 1 at most, 2 at most). The pills share one `PillSelect`, the home pill grown into a general listbox with rows that can carry a price or be off. Clear shows only when a filter is on.

### The list

Top 10 by the sort, then "Show all 209 pairs". A row is a button. Rank 1 has the amber number. The cheapest pair has a tag. The trip's own pair has a check. The type icons are a ticket for one ticket, a ticket with a hop for the Madrid ticket and two halves for two one ways. The marks are a moon with the count of hub nights, a US chip, a transfer icon and a clock for a long flight. The option count shows when more than one.

### The pair

- Type tiles: One ticket, Madrid ticket, Two one ways, each with its cheapest all in price and the difference in kr. Tapping a tile filters the options to that type.
- Options: radio cards with the out and home dates and local times, stops, airline and all in price. The chosen one is filled.
- With a Two one ways option chosen, two short lists let him swap the way in and the way home among the one ways for those cities. The swap is built with `mixWays` and its price shows live.
- Legs: a card per way with the clock times once at the ends, `WayTrack` under them, the airline and flight numbers, the total time and the time in the air only when it differs.
- Cost: flights, cabin bags, checked bags, hub stays and all in. Unknown is "not known".
- Score: a meter in three parts, price out of 5, home out of 3, in out of 2, with the marks that cost points under the part they hit.
- Tickets: one row per ticket with source and date seen, fare, legs, price, bag text, flag chips, one link per ticket and notes behind a disclosure.
- Apply: pinned at the bottom of the pair. "Start {in}, end {home}". On the trip's own option it reads In the trip with a check and is off. With a booked side it reads the side as booked with a lock and is off.

### Motion

Rows press to 0.98 on pointer down. The pair column cross fades in 180ms on change. The phone pair opens with the shared disclosure height. Reduced motion keeps the fades only.

## Roast rulings

1. The grid ranks without price or reason. Changed. The grid goes for a ranked list with the all in price large and the marks that cost points on every row, which answers both.
2. No way to apply. Taken. One pinned apply button labelled with the result, one link per ticket.
3. Return against one ways split in two modes. Taken. One screen, type tiles with the difference in kr, mixing inside the pair on the same scale.
4. Home picker has one option. Taken. Nearby airports listed, off with a No fares chip since the data holds only Copenhagen. The cost of getting to each is left out, the data has none.
5. Phone matrix and table unusable. Taken. Pair rows on the phone with Fly in and Fly home pills, no nested scroll, options as stacked cards.
6. Desktop detail below the fold. Taken. Sticky pair column on the right with one filled selected row.
7. All pairs table repeats rows. Taken. One row per pair with an option count, top 10 then Show all, one count.
8. Three scales and clashing colours. Taken. One score out of 10 with its parts, ticket types as icons, amber only for the best.
9. The heat map marks only the top 30. Rejected. The heat map goes with the grid, a rank number does its job.
10. The title is garbled. Taken. The title is the pair, the trip name small above.
11. Prose lines everywhere. Taken. All removed, icons and an empty pair outline carry them.
12. Flight card details. Changed. Times once, airline and flight numbers shown, Price as the label, total and air time as separate figures only when the data tells them apart. Stop code spacing is inside the shared `WayTrack` and goes to the main session. No airline logos, the data has none.
13. Columns are codes. Rejected. The columns go with the grid, every city shows with its flag and name.
14. Two lookalike segmented controls. Taken. The mode toggle goes, the sort stays in the controls row.
15. Cryptic top bar. Rejected for this pane. The top bar is the shell, flagged to the main session.
