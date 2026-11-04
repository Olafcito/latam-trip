# The way picker, plan

Spec: `docs/superpowers/specs/2026-11-03-way-picker-design.md`. Worktree `way-picker`, planner dev server on port 5202.

The pure helpers in `planner/src/lib/pairs.ts` already exist with their tests (`allIn`, `pointsLost` as the spec's `wayMarks`, `scoreParts`, `pairRows`, `cheapestKey`, `typeTiles`, `cityChoices`, `homeChoices`, `oneWaysFor`, `mixOption`, `ticketsOf`, `pickedOf`, `flagChip`). What is left is the lock rule, the store state and the screen.

Every task is its own commit. Checks before each commit: `cd planner && npm run typecheck && npm test`.

## Batch A, logic and store (Sonnet)

Files: `planner/src/lib/pairs.ts`, `planner/src/lib/pairs.test.ts`, `planner/src/store.ts`, `planner/src/store.test.ts`.

1. **Held sides.** Add `heldSides(bookings, data, journey, wi, wh, unlocked)` to `pairs.ts`. It returns `{ in: boolean; home: boolean }`, true on a side whose booked way the pick would replace, built on `wayHeld` from `lib/booked.ts`. No journey gives both false. Tests for none, one side and both sides.
2. **A pick never half applies.** `changeEnds` in `store.ts` returns `boolean`. When `keptWays` keeps a booked side it changes nothing and returns false, as `setWays` already does. `pickWays` returns the same boolean (true for a new trip). Update the existing `changeEnds` tests and add one for the refusal.
3. **Picker state.** Replace `pickMode`, `setPickMode`, `expanded` and `toggleExpanded` with `pairSort: PairSort`, `setPairSort`, `chosen: string | null` (the option id picked inside the open pair) and `setChosen`. `setPair` clears `chosen`, `mixIn` and `mixHome`. `setHome` clears `pair`, `chosen`, `mixIn` and `mixHome`. `pairSort` is kept with the filters in local storage. The stored `maxPrice`, `minRating`, `maxHours` and `type` stay readable but the picker ignores them.

## Batch B, the screen (Opus)

Files: `planner/src/screens/PickScreen.tsx`, `planner/src/components/PillSelect.tsx` (new), `planner/src/components/HomePill.tsx` (removed or a thin wrapper), `planner/src/components/icons.tsx`, `planner/src/styles/pick.css`.

4. **PillSelect and icons.** Grow `HomePill` into a general `PillSelect` listbox: a pill with a leading icon or flag, rows with a flag, a label, an optional price on the right and an off state with a No fares chip, optional group headers. Keyboard and phone sheet behaviour as `HomePill` has now. Add the icons the rows need to `icons.tsx` in its style: two ticket halves for two one ways, a lock, a US chip if it is not text. `Home`, `Ticket`, `Hop`, `Moon`, `Transfer`, `Clock` exist.
5. **Head and controls row.** Back to the trip on the left. The trip name small above a title that is the answer: home flag, In city, an arrow, Home city, of the open pair or else the trip. One wrapping controls row: home pill with prices from `homeChoices`, Fly in and Fly home pills from `cityChoices` grouped by region, Best or Cheapest sort, a No US chip, a hub nights pill (Any, None, 1 at most, 2 at most), Clear only when a filter is on. The Rated pairs and Mix one ways toggle, the matrix, the old filter fields and every prose line go.
6. **The list.** `pairRows` top 10 by the sort, then "Show all N pairs". A row is a button: rank (amber on rank 1), the two cities with flags, the type icons, the marks from `pointsLost` on both ways (moon with hub nights, US chip, transfer, clock), the option count when more than one, the all in price large and the score small. Tag on the cheapest pair from `cheapestKey`, a check on the trip's own pair. Rows press to 0.98.
7. **The pair.** Opens from a row. Type tiles from `typeTiles` with the cheapest all in price and the difference in kr, a tile filters the options to its type. Options as radio cards: out and home dates and local times, stops, airline, all in price, the chosen one filled. With two one ways chosen, two short lists from `oneWaysFor` swap the way in and home, priced live through `pickedOf` and `mixOption`. Legs: a card per way, the clock times once at the ends, `WayTrack` under them, airline and flight numbers, total time, time in the air only when it differs. Cost: flights, cabin bags, checked bags, hub stays, all in, unknown as not known. Score meter in three parts from `scoreParts` with the marks under the part they hit. Tickets from `ticketsOf`: source and date seen, fare, legs, price, bag text, flag chips from `flagChip`, one link, notes behind a disclosure.
8. **Apply and layout.** Apply pinned at the bottom of the pair: "Start {in}, end {home}". On the trip's own option it reads In the trip with a check and is off. With a held side from `heldSides` it shows a lock on that side and reads that side as booked, off. A refused `pickWays` changes nothing. Desktop: the pair is a sticky column beside the list and cross fades in 180ms on change. Phone: the pair opens in place under its row with the shared disclosure height. Reduced motion keeps the fades only. `pick.css` is rewritten for the new screen, using the tokens in `planner/src/styles/tokens.css`.

## Review, roast, record, merge

9. Code review of both batches commit by commit with `feature-dev:code-reviewer`. One fix round, checked against the diff by the main session.
10. Roast loop n=1: `after.png`, `roast-after.md`, one fix round with a fresh implementer, `final.png`.
11. Record accepted outcomes only. Update the docs the change touches.
12. Merge alone: fetch, rebase on `origin/main`, typecheck and tests, fast forward `main`, push, remove the worktree.
