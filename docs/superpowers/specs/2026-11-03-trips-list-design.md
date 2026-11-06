# The trips list

Status: rejected on 2026-11-06. Simon saw the build of this spec (the nights bars in each row and the docked compare panel) and turned it down. The branch was deleted unmerged. Do not build it again. The Trips list on `main` stays as it is.

Which pane this is: the home of the Trips tab, the list of whole trip options (`Timetable` in `planner/src/screens/TripsScreen.tsx`), the compare view (`planner/src/components/CompareTray.tsx`) and the sign in screen (`planner/src/components/SignIn.tsx`). The roast is `.superpowers/sdd/2026-11-03-ui-roast/roast-trips-1.md`.

## Journey

1. Simon opens the app. If signed out, he signs in in one obvious step.
2. He sees the trip options he and Claude have drafted: each one a different route and start and end city. He wants to tell them apart at a glance: route, length, total cost, and which one is his current plan.
3. He picks two or three to compare and sees side by side where they differ: cost, nights per country, flights, what is booked.
4. He opens the one he wants to work on.

## Goals

- The current plan is the first and strongest thing on the list. It sits pinned above the sortable rows with the accent edge and a Current chip, and the sort never moves it.
- Every row tells its trip apart without reading: a nights timeline on one shared axis for all rows, the start city and day under its left end, the end city and day under its right end, a nights chip, the travel total and the booked chip.
- A price never lies. No "from", no "all in" over a number that leaves stays out, no unknown shown as 0 kr. A total with gaps carries a hollow coin mark and the count of unpriced parts.
- Compare leads with difference: the totals with signed deltas, the timelines stacked on the same axis, nights per country, flights and booked as icon plus number, the stops that differ. Rows that match in every trip fold behind one Same in all line.
- Compare never covers the list on a wide screen and never scrolls sideways on a phone.
- Opening a trip is one obvious tap: the whole row with a chevron, and an Open button on every compare column.
- Sign in is one centred card with the LatAm mark, a field that is ready to type into, a button that lights up when the address is valid and a sent state that says where the link went.

## Anti goals

- No summary sentence on a row or in compare. Facts are marks on the timeline, chips and numbers.
- No change to the trip page, the flight sheets, the booking views, the city sheet, the route map window or the Map tab. `RouteLine` stays as it is for the trip hero.
- No new trip fields and no Supabase migration. The current plan is one owner only document.
- No guessed current plan. With none chosen, nothing is marked.
- No swipe to delete, no passkey and no Google sign in.

## Design

### Data

- **Current plan.** A document `current_plan` in the `documents` table holding `{ "id": "<trip id>" }`. The owner already writes `documents` under the `owner_all` policy, as the planner does for `unresolved_journeys`, so there is no migration. Without Supabase it lives in localStorage. `src/lib/plan.ts` holds the parser (`planOf`), a small zustand store with `load` and `set`, and the fallback. `store.ts` does not change. A plan id that matches no trip marks nothing.
- **Timeline.** A pure helper `src/lib/tripTimeline.ts`. From a schedule it builds country segments: each stop runs from its `inDay` for its `days`, neighbours in the same country merge and keep their stop names, a stop passed through adds its name and no width. The free nights before the flight home that no stop holds become a hatched segment in the last country, so a spare day always shows. A boundary reached by a flight gets a plane tick. `axisOf` spans the earliest landing to the latest flight home over every trip shown, and `monthTicks` gives the first of each month inside it.
- **Compare.** A pure helper `src/lib/tripCompare.ts`: signed deltas against the cheapest known total, `sameAll` for a line, the nights per country grid in first visit order, and for each trip the stops that some other trip lacks.
- **Sort.** `tripsort` sorts by rank, price and length. Air time leaves the sort, it shows in compare.

### The list

- **Bar.** The sort as a segmented control (rank, price, length), the trip count, and New trip as a secondary button on the right. On a phone New trip is a plus icon with an accessible name.
- **Current plan card.** When a plan is set it sits above the bar in its own section, a full row with an accent left edge, a Current chip with a star, and the same content as any row. It stays in its slot whatever the sort.
- **Row.** One button wide target that opens the trip, with a trailing chevron and a pressed state. Inside, top to bottom:
  - the name, wrapped to two lines and never cut, then marks: a star with the rank when ranked (tooltip "Rank 2 among the planned trips"), not saved for the draft, the version menu when versioned, the booked chip.
  - the timeline, every row on the same axis with faint month lines. A segment is coloured by its country with the ISO code inside when it fits and a tooltip with the country, nights and stops.
  - under the timeline the start city and day in the start green at the left end of the bar, and the end city and day in the end orange at the right end.
  - on the right, the nights chip with a moon and the travel total. A partial total has the hollow coin mark with the unpriced count beside it and a tooltip that names what the total holds.
- **Row actions.** A Compare chip that fills when picked (`aria-pressed`) and a more button opening a small menu: Make it my plan (or Current plan, checked), Build on the map, Delete. Delete confirms in the menu and names the bookings it would leave without a trip when there are any. Every target is at least `--hit`. The menu works the same on both sizes and is a bottom sheet under 560px, like the version menu.
- **Gone trip.** A trip whose flights left the data keeps its row, dimmed, with its name and a warn mark. It cannot open, it can still be deleted.

### Compare

- **Wide, 900px and up.** A panel docked on the right, 440px, the full height under the header. The list makes room for it, so a third trip is one tap away. A close button in its head clears the selection.
- **Phone.** A bar at the foot shows the picked trips as swatches and the count. A tap opens a full height sheet with a grabber, a scrim, drag down to dismiss and Escape to close. Nothing inside scrolls sideways.
- **Content, in order.**
  1. A legend, sticky, one column per trip: its swatch, its name clamped to two lines, the travel total large, the signed delta against the cheapest (the cheapest shows a check), the unpriced mark, and Open.
  2. The timelines, one per trip, on one axis, the swatch at the start of each.
  3. Nights per country: a row per country with its colour dot and each trip's nights. A country one trip skips shows a dash, never 0.
  4. Flights with air time, and booked, as icon and number per trip.
  5. The stops that differ, as chips under each trip.
  6. Costs: long haul, regional flights, ground, hub stays, cabin bags, checked bags, stays booked and planned and unpriced. The lowest in a row is bold. An unknown is a hollow coin with its count, never 0 kr.
  7. Same in all: a disclosure listing every line that matches in every trip, closed by default.
- Each trip keeps one swatch colour through the whole view, in the order picked.

### Sign in

- The card is centred optically, a little above the middle, with the LatAm mark and the trip dates above it.
- The field autofocuses, uses the email keyboard (`type="email"`, `inputmode="email"`, `autocomplete="email"`) and has a placeholder. The button is muted until the address is a valid shape, then full accent.
- Sent swaps the card to a check, the address, an Open Gmail link when it is a Gmail address and Use another address. An error shows under the field in the error tint.

### Header

The visible build line goes. The data fact stays as the brand's tooltip. The freshness mark belongs to the shared map data and stays.

### 21st.dev references

Partition Bar (8starlabs) for the nights timeline, Drawer (wensity) for the phone sheet, Menubar Compact (uiable) for the more menu with a destructive Delete. All three are rebuilt on the app's tokens, not imported.

## Roast rulings

1. No current plan marker. **Take.** A pinned card with the accent edge and a Current chip, set from each row's more menu and stored as one document.
2. Length and dates missing. **Take.** A nights chip, and the start and end days sit under the ends of the timeline instead of a date span line.
3. Prices lie by omission. **Change.** Drop "from" and "all in" and show the unpriced count with a hollow coin. Reject the booked versus estimated bar, the totals do not keep paid money apart and the booked chip already shows what is bought.
4. The route strip does not tell trips apart. **Take.** A timeline scaled to nights on one shared axis, country colours, ISO codes, plane ticks, start and end labels kept.
5. Compare shows sameness. **Take.** Totals with deltas first, then timelines, nights, flights and booked, stops that differ, and Same in all folds the rest. The lowest is bold and the dot goes.
6. Compare on a phone is unusable. **Take.** A full height sheet with a grabber, columns that fit without a label column, no sideways scroll.
7. No visible way to open a trip. **Take.** The row is one target with a chevron and a pressed state, and every compare column has Open.
8. Row actions are anonymous. **Change.** A Compare chip and a more menu with delete that names the bookings. No swipe, the same menu serves both sizes and is easier to find.
9. Names truncate. **Change.** Names wrap to two lines and are never cut. Names are data that Simon and Claude choose, so the planner does not rename them. The misspelt Colombia goes to the report.
10. Ranks and versions mixed. **Change.** The v1 tag goes, the version menu stays for versioned trips, rank shows as a star mark with a tooltip. Gaps in rank are real data from the trips table.
11. Developer chrome. **Change.** The build line goes. Freshness belongs to the shared map data and stays for its own owner.
12. Sign in anonymous. **Change.** Centred card with the mark, autofocus, the email keyboard, an accent button once valid, a sent state with Open Gmail. Reject passkey and Google, no provider is set up and a magic link signs a device in once for good.
13. New trip loudest. **Take.** A secondary button, an icon on the phone. The accent goes to the current plan.
14. Tray covers rows. **Take.** A docked side panel on wide screens, a thin bar that opens a sheet on the phone.
