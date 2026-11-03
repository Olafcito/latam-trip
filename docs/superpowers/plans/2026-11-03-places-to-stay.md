# Places to Stay Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Places to stay are only the ones Simon or Claude add on purpose, with photos, rooms and prices for the trip's nights, chosen per stop for all or part of its nights and locked in when booked.

**Architecture:** Three owner only tables (`lodgings`, `lodging_rooms`, `lodging_prices`) read live by the planner like trips and bookings, written by the connector through a nested `add_lodging`. A trip stop holds its planned stays as `place.stays = [{lodging_id, room_id, nights}]` in the trip body, so they version with the trip, and their dates are worked out from the schedule by pure helpers in `planner/src/lib/stays.ts`. The old research hostels stop rendering everywhere, their rows stay.

**Tech Stack:** Postgres (SQL migrations), Python 3 (unittest), React 19, TypeScript, Zustand, supabase-js, Vitest.

**Spec:** `docs/superpowers/specs/2026-11-03-bookings-stays-ways-design.md`, section 5, with the booked stays of section 4. This plan runs after the bookings plan (`docs/superpowers/plans/2026-11-03-bookings.md`) and uses its `Booking` type, `stayOn` and the "Stays" line in `CostStrip`.

## Global Constraints

- Plain sentences in docs, comments, commits and UI. No semicolons as separators, no em or en dashes. No question marks in UI text. Prices in Danish kroner through the app's existing price formatter, times are local clock times.
- One checkout at `C:\Users\Simon\Documents\github\latam-trip`, work on `main`, never a worktree. Commit with `git -c user.name=Claude -c user.email=noreply@anthropic.com commit`, message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push to `origin main` after each task.
- Before every commit that touches an app: `cd web && npm run typecheck && npm test` and `cd planner && npm run typecheck && npm test`. Before a commit that touches Python: `python -I -X utf8 -m unittest discover -s plugin/scripts -p "test_*.py"` and `python -I -X utf8 -m unittest discover -s latam_trip_mcp -p "test_*.py"` from the repo root.
- `plugin/skills/**` and `plugin/agents/**` are the source. After changing them run `python -I plugin/scripts/sync_claude_dir.py --root .` and commit the `.claude/` copy with it.
- New shared data goes in Supabase with owner only row level security, read live by the planner through supabase-js with realtime. It never goes into a built file. The public web map built from files shows no lodgings.
- Never print or commit secrets. `.env` holds `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY` and `SUPABASE_PASSWORD`.
- Frontend tasks go through the project skills in this order: `emil-design-eng`, then `impeccable`, the 21st.dev MCP (`mcp__21st__search`, `get_component`) for the photo carousel, the cards and the segmented controls, `apple-design` and `mobile-native`, and `web-design-guidelines` before the commit. Adapt 21st code to the planner's tokens in `planner/src/styles`, never paste it as is. Claude Design visuals are not a reference.
- Anti goal from the spec: "Research hostels creeping back. Nothing Simon did not add, or ask Claude to add, shows as a place to stay."
- Copy fixed by the spec: "Where to stay", "Add a place", "Ask Claude for these dates", a nearest price reads like "1,240 kr for 9 to 14 Dec", distances like "1.2 km to centre" and "on the beach".

## Review Focus

1. A stop with one planned part and no `nights`. When a leg before it moves, the part follows and still covers every night of the stop, and its price is looked up for the new dates.
2. Two parts where the first part's `nights` is more than the stop now has. The first part is cut to the stop, the second gets 0 nights and is shown as not fitting, nothing throws.
3. A price whose range covers only some of the nights is not a match. The nearest observed price then shows with its own dates.
4. Taking a night off a stop that cuts into a booked stay works, and the warning names the booking and its last free cancel day.
5. A saved trip from before this plan, with no `stays` on any place, opens and saves unchanged, and a trip saved with `stays` keeps them across a reload and a new version.

---

### Task 1: The lodging tables and their schemas

**Files:**
- Create: `supabase/migrations/0014_lodgings.sql`
- Modify: `plugin/scripts/tripdb.py` (`LODGING`, `LODGING_ROOM`, `LODGING_PRICE` beside `BOOKING`, and `"stays": "list|null"` on `TRIP_PLACE` L168)
- Test: `plugin/scripts/test_lodgings_schema.py`

**Interfaces:**
- Produces: tables with the fields of spec 5.2. `lodgings.id`, `lodging_rooms.id`, `lodging_prices.id` are `text primary key default gen_random_uuid()::text`. `lodging_rooms.lodging_id` references `lodgings(id) on delete cascade`, `lodging_prices.room_id` references `lodging_rooms(id) on delete cascade`. `hidden boolean default false`, `photos`, `links` jsonb default `'[]'`, `tags text[] default '{}'`, `observed_at timestamptz default now()`. Check constraints for `kind`, `added_by`, `bathroom` and the `links` site values are left to the tripdb schema.
- Produces: `tripdb.LODGING`, `tripdb.LODGING_ROOM`, `tripdb.LODGING_PRICE` schemas, and `TRIP_PLACE` accepting `stays`.

- [ ] **Step 1: Write the failing tests** like `test_bookings_schema.py`: a full lodging passes, `kind: "castle"` is refused, a room without `lodging_id` is refused, a price without `check_in` is refused, a trip place with `stays: [{"lodging_id": "a", "room_id": "b"}]` passes. A second test reads the migration and asserts row level security, `owner_all` and `revoke all ... from anon` on all three tables and each in `supabase_realtime`.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Write the migration** in the pattern of `0013_bookings.sql`, and the schemas.
- [ ] **Step 4: Run** both Python suites. Expected: PASS. Do not apply the migration, the controller does.
- [ ] **Step 5: Commit** "Add owner only tables for places to stay, their rooms and prices".

### Task 2: Lodgings in the connector

**Files:**
- Modify: `latam_trip_mcp/core.py`, `docs/connector.md`
- Test: `latam_trip_mcp/test_core.py`

**Interfaces:**
- Consumes: the three schemas (Task 1), the `booking` type of the bookings plan as the pattern for a type backed by `store.rest`.
- Produces: type `lodging` with `add_lodging` taking rooms nested under each lodging and prices nested under each room, written lodging first, then rooms, then prices, and refused whole when any part fails its schema. `get_lodging` returns the lodging with its rooms and their prices. `list_lodging` where takes `place` and leaves out hidden ones unless `hidden` is given. `update_lodging` patches the lodging only. `delete_lodging` sets `hidden`. A separate tool `add_lodging_price(rows)` for prices of rooms that exist, refused for an unknown `room_id`.
- The `lodging` note, close to verbatim from spec 5.6: add only places Simon asked for, with photos, rating, distances and rooms, and fill prices for the trip's dates when known.

- [ ] **Step 1: Write the failing tests:** nested add makes one lodging, two rooms and three prices, `get_lodging` returns them nested, a bad price refuses the whole lodging and writes nothing, `delete_lodging` hides it and `list_lodging` by place leaves it out, `add_lodging_price` for a missing room is refused. Update the TYPES set and the tool count to `5 * len(TYPES) + 5`.
- [ ] **Step 2: Run** the connector suite. Expected: FAIL.
- [ ] **Step 3: Implement** and add the tool names to `docs/connector.md`.
- [ ] **Step 4: Run** both Python suites. Expected: PASS.
- [ ] **Step 5: Commit** "Places to stay in the connector, with rooms and prices nested".

### Task 3: Stay price tasks write only prices

**Files:**
- Modify: `plugin/scripts/tripdb.py` (`cmd_add_stays` L494 refuses), `plugin/skills/trip-checklist/scripts/stays_ingest.py` (refuses the same way), `plugin/skills/trip-checklist/scripts/tasks.py` (the `stay_prices` entry L17), `plugin/skills/trip-checklist/SKILL.md` L21, `plugin/agents/stay-price-worker.md` L27 to 35, `docs/claude-tasks.md`
- Test: `plugin/scripts/test_tripdb.py`

**Interfaces:**
- Produces: `tripdb add-stays` exits non zero with "The stays table is closed. Add prices for places that exist with the connector's add_lodging_price." `stay_prices` task data is `{lodging_id, room_ids, check_in, check_out}`. The skill and agent text say Claude writes only `lodging_prices` rows for lodgings and rooms that exist, never creates a lodging from a price task, and never writes `stays`.

- [ ] **Step 1: Write the failing test:** `add-stays` with a valid file exits non zero, prints the message and writes nothing.
- [ ] **Step 2: Run** it. Expected: FAIL.
- [ ] **Step 3: Implement** the refusals and the text changes. Sync `.claude/`.
- [ ] **Step 4: Run** both Python suites. Expected: PASS.
- [ ] **Step 5: Commit** "Stay price tasks write prices for places that exist, the old stays table is closed".

### Task 4: The research hostels stop showing

**Files:**
- Modify: `planner/src/components/TripHead.tsx` (`Itinerary`, `beds = p?.hostels` and `.tg-beds` L66 to 81), `planner/src/components/FindPopup.tsx` (`HostelPopup` L52), `planner/src/components/PlaceCard.tsx` L51, `web/src/map/Panel.tsx` (`MoreView` L336 to 354, "Hostels · per night"), the `CityCard` in `CardWindow.tsx` and `hostelFacts` in `cardFacts.ts:148`
- Test: the tests of those components and of `hostelFacts`

**Interfaces:**
- Produces: no component reads `profile.hostels`, `places.json` `hostels` or `stay_quotes` for display. Unused code goes with it (`HostelPopup`, `hostelFacts` if nothing else calls them). The built files are not changed in this task.

- [ ] **Step 1: Find every reader** with `rg -n "hostels|hostelFacts|HostelPopup|stay_quote" planner/src web/src` and list them in the report.
- [ ] **Step 2: Update the tests** that expect hostels so they expect none, then remove the rendering and the dead helpers.
- [ ] **Step 3: Run** both app checks. Expected: PASS. Look at a city card and the map city panel in the running app (dev server on port 5198, never start another) at 375 and 1440: no hostels, no empty gap where they were.
- [ ] **Step 4: Commit** "Stop showing the research hostels, places to stay come only from what was added".

### Task 5: Lodgings live and planned stays in the trip

**Files:**
- Create: `planner/src/lib/lodgings.ts` (data access), `planner/src/lib/stays.ts` (pure)
- Modify: `planner/src/data/types.ts` (`Lodging`, `LodgingRoom`, `LodgingPrice`), `planner/src/lib/journey.ts` (`Place` L30 gains `stays?: PlannedStay[]`), `planner/src/lib/tripRow.ts` (`rowPlace` L144 and the row to journey path carry `stays`), `planner/src/store.ts` (`lodgings`, `setStays(placeIndex, stays)`), `planner/src/App.tsx` (load and subscribe beside bookings)
- Test: `planner/src/lib/stays.test.ts`, `planner/src/lib/repoTrips.test.ts`

**Interfaces:**
- Consumes: `ScheduledPlace` from `schedule()` (`inDay`, `outDay`, `days`), `stayOn` from `lib/booked.ts`.
- Produces in `lodgings.ts`: `loadLodgings(): Promise<Lodging[]>` (each with `rooms`, each room with `prices`), `subscribeLodgings(cb)`, `saveLodging(l: LodgingDraft)` (nested write, same order as the connector), `hideLodging(id)`.
- Produces in `stays.ts`:
  - `interface PlannedStay { lodging_id: string; room_id: string; nights?: number }`
  - `stayParts(stays: PlannedStay[], sp: ScheduledPlace): { stay: PlannedStay; first: string; last: string; nights: number; fits: boolean }[]` where parts run in order from the stop's first night, a part without `nights` takes what remains, and a part beyond the stop has 0 nights and `fits: false`.
  - `priceFor(room: LodgingRoom, first: string, nights: number): { total: number; exact: true } | { total: number; exact: false; check_in: string; check_out: string } | null`, exact when one price's range equals those nights, else the price whose range is nearest.
  - `plannedStaysDkk(j, sched, lodgings): number` with exact prices and nearest per night times nights otherwise.
- Store `setStays` saves the journey as a draft the way `setHopFlight` does.

- [ ] **Step 1: Write the failing tests** for Review Focus items 1, 2, 3 and 5: a part without nights follows a moved stop, an overlong first part is cut and the second does not fit, a partial cover is not exact, and a row without `stays` round trips unchanged while one with `stays` keeps them.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.**
- [ ] **Step 4: Run** both app checks. Expected: PASS.
- [ ] **Step 5: Commit** "Read places to stay live and plan where to sleep for all or part of a stop".

### Task 6: Planned stays in the totals and booked stays lock nights

**Files:**
- Modify: `planner/src/lib/journey.ts` (`totals`, `schedule` warnings), `planner/src/components/CostStrip.tsx` (the "Stays" line from the bookings plan)
- Test: the `totals` and `schedule` tests

**Interfaces:**
- Consumes: `plannedStaysDkk`, `stayParts` (Task 5), `stayOn` (bookings plan).
- Produces: `Totals.stays_planned_dkk: number`. The "Stays" line shows booked and planned, planned marked as planned. `schedule` adds a warning on a stop whose nights no longer cover a booked stay there, naming the place and its last free cancel day, for example "Cuts into your booking at Casa Azul, free to cancel until 20 Nov".

- [ ] **Step 1: Write the failing tests:** planned stays add to `stays_planned_dkk` and not to travel, a booked stay is not counted again as planned, Review Focus 4.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement.** The night minus in `Story.tsx` `Stop` (`.st-step`, L113) keeps working, the warning shows in `.st-clash` as other warnings do.
- [ ] **Step 4: Run** both app checks. Expected: PASS.
- [ ] **Step 5: Commit** "Planned stays in the Stays line, and a warning when nights cut into a booked stay".

### Task 7: Place cards and Where to stay

**Files:**
- Create: `planner/src/components/stays/PlaceCard.tsx` (the stay card, not the existing map `PlaceCard.tsx`), `planner/src/components/stays/WhereToStay.tsx`, `planner/src/styles/stays.css`
- Modify: `planner/src/components/CityCard.tsx` (the section at the top), `planner/src/lib/tasks.ts` (`stayPricesTask(lodging, rooms, first, nights)`)

**Interfaces:**
- Consumes: `lodgings`, `setStays`, `stayParts`, `priceFor` (Task 5), `stayOn`, `bookings`, `insertTask`, `taskDraft`, `AskClaude`.
- Produces: `StayCard({ lodging, first, nights, booking, onChoose })` and `WhereToStay({ placeIndex, sp, data })`.

- [ ] **Step 1: Design pass.** Load `emil-design-eng`, `impeccable`, `apple-design` and `mobile-native`. Search 21st for a swipeable photo carousel, a listing card and a segmented control, adapt them. The card: photo strip that swipes (scroll snap, never hijacking the page's vertical scroll), name and kind, the rating as a small badge, distance tags, rooms as rows with the price for the stop's nights or the nearest price with its dates and a quiet "Ask Claude for these dates", link buttons (Booking.com, Hostelworld, own site), notes. Booked shows the same green ring as a booked leg with the reference. Photos load lazily with fixed aspect ratio, and a broken photo URL hides that photo.
- [ ] **Step 2: Implement `WhereToStay`:** the planned or booked parts as a small timeline, then the city's lodgings as cards, then "Add a place". Choosing a room on a card sets it for the whole stop, or for the remaining nights when a part is already planned, and a part can be given a number of nights or removed.
- [ ] **Step 3: Check in the app** at 375, 768 and 1440 with one test lodging added through the connector or `saveLodging`, then hide it again.
- [ ] **Step 4: Run `web-design-guidelines`**, fix what it finds, run both app checks. Expected: PASS.
- [ ] **Step 5: Commit** "Where to stay on a stop, with place cards priced for its nights".

### Task 8: Add a place, and the map city panel

**Files:**
- Create: `planner/src/components/stays/AddPlace.tsx`, `planner/src/lib/lodgingLinks.ts`
- Modify: `web/src/map/Panel.tsx` (an optional slot for the city's stays), the planner's Map tab where it renders the web map
- Test: `planner/src/lib/lodgingLinks.test.ts`

**Interfaces:**
- Produces: `siteOf(url: string): 'booking' | 'hostelworld' | 'airbnb' | 'own'`, `AddPlace({ place, onSaved, close })` and on the web map a prop `stays?: (placeId: string) => ReactNode` rendered at the top of the city panel. The planner passes `WhereToStay` cards priced for the open trip's nights, or unpriced when no trip is open. The standalone web app passes nothing and shows nothing.

- [ ] **Step 1: Write the failing tests** for `siteOf`: a `booking.com/hotel/...` link gives `booking`, a `hostelworld.com/...` link gives `hostelworld`, `airbnb.dk/rooms/...` gives `airbnb`, anything else `own`.
- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement `AddPlace`:** name, kind, links (pasting a link fills its site), photos by URL, rooms with prices for date ranges, tags, notes. Only the name is required. Saves through `saveLodging` with `added_by: 'simon'`.
- [ ] **Step 4: Wire the map panel slot** and check in the app at 375 and 1440, from a city on the map with and without an open trip.
- [ ] **Step 5: Run `web-design-guidelines`**, fix what it finds, run both app checks. Expected: PASS.
- [ ] **Step 6: Commit** "Add a place to stay by hand, and show places in the map's city panel".

### Task 9: Ship it (controller)

- [ ] **Step 1:** Apply `0014_lodgings.sql` with `supabase/migrate.py`.
- [ ] **Step 2:** `bash infra/mcp/deploy.sh` and `bash infra/deploy.sh --enable-schedules` with the deploy profile (tripdb's `TRIP_PLACE` and `add-stays` changed).
- [ ] **Step 3:** Through the connector add one real place Simon named, if he has named one, or a test place that is hidden again after. Open it on a stop at 375, 768 and 1440.
