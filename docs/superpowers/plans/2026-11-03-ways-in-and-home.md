# Ways in and home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every dated long haul option reaches the planner, and the way in and the way home of an open trip can be changed by day, by flight and by city from the trip itself, with a home airport control in the new trip picker.

**Architecture:** `inout.py` keeps one option per day pair instead of one per city pair, through a small pure module that the script calls. The planner gets pure helpers in a new `planner/src/lib/ways.ts` (ways per day, choosing a way and its partner, changing a trip's ends) and two store actions. The Story's two Copenhagen legs get the same day picker as other legs and a new `WaySheet`, and `PickScreen` gains a mode that changes the open trip and a home airport pill.

**Tech Stack:** Python 3 (unittest), React 19, TypeScript, Zustand, Vitest (node environment).

**Spec:** `docs/superpowers/specs/2026-11-03-bookings-stays-ways-design.md`, section 3.

## Global Constraints

- Plain sentences in docs, comments, commits and UI. No semicolons as separators, no em or en dashes. No question marks in UI text. Prices in Danish kroner through the app's existing price formatter, times are local clock times.
- One checkout at `C:\Users\Simon\Documents\github\latam-trip`, work on `main`, never a worktree. Commit with `git -c user.name=Claude -c user.email=noreply@anthropic.com commit`, message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Push to `origin main` after each task.
- Before every commit that touches an app: `cd web && npm run typecheck && npm test` and `cd planner && npm run typecheck && npm test`. Before a commit that touches Python: `python -I -X utf8 -m unittest discover -s plugin/scripts -p "test_*.py"` and `python -I -X utf8 -m unittest discover -s latam_trip_mcp -p "test_*.py"` from the repo root.
- `plugin/skills/**` is the source. After changing it run `python -I plugin/scripts/sync_claude_dir.py --root .` and commit the `.claude/` copy with it.
- Frontend tasks go through the project skills in this order: `emil-design-eng`, then `impeccable` for shaping and its polish pass, the 21st.dev MCP (`mcp__21st__search`, `get_component`) before hand building a common component, `apple-design` and `mobile-native` for sheets and touch, and `web-design-guidelines` before the commit. Adapt 21st code to the planner's tokens in `planner/src/styles`, never paste it as is. Claude Design visuals are not a reference.
- Never print or commit secrets. `.env` holds `SUPABASE_URL` and `SUPABASE_SECRET_KEY`.
- Copy fixed by the spec: the foot button is "Change start and end", the change mode title is "Change start and end of {trip name}", a ticket pick note reads "One ticket. This also sets the way home on {day}" (or "the way in" for the other direction).

## Review Focus

1. A saved trip whose ways are its own row ways (`{tripId}:in`, from `withTripWays`) and not in the built options. The day picker and way sheet must still find ways for its two cities and show its current way as picked.
2. Picking a one way while the other direction is half of a return ticket. The other direction must become a one way too, never a lone ticket half (that makes `mixWays` throw), and the sheet says what changed.
3. Changing the ends where the new arrival city is already the first stop, or the new home city is already the last stop. No stop is duplicated.
4. A trip with a pinned leg dated before the new way in arrives. The change goes through and the existing clash warning shows on that leg.
5. Old trips that store `optionId` `CTG-GUA-ticket`. The best option of each city pair keeps that id, so they still resolve.

---

### Task 1: One option per day pair in inout.py

**Files:**
- Create: `plugin/skills/flight-crawl-orchestrator/scripts/inout_pick.py`
- Modify: `plugin/skills/flight-crawl-orchestrator/scripts/inout.py:297-302` (the `best_opt` block) and the markdown pick near L405
- Test: `plugin/scripts/test_inout_pick.py` (puts the skill's `scripts` folder on `sys.path`, the way other tests there reach skill scripts)
- Modify: `web/src/dash.test.ts` (or wherever `airportsOf` is tested) to add one case

**Interfaces:**
- Produces: `pick_options(opts: list[dict], ways: dict[str, dict]) -> list[dict]` in `inout_pick.py`. Input options have the shape `option()` returns today, with `id` like `CTG-GUA-ticket`. Output is sorted as today, `(-rating.total, price_dkk)`.

- [ ] **Step 1: Write the failing tests**

```python
class PickOptionsTest(unittest.TestCase):
    def test_keeps_one_option_per_day_pair(self):
        # two CTG-GUA-ticket options, out 2 Dec home 3 Feb (8235 kr) and out 3 Dec home 3 Feb (7900 kr, rated higher)
        out = pick_options([dec2, dec3], ways)
        self.assertEqual({o["id"] for o in out}, {"CTG-GUA-ticket", "CTG-GUA-ticket-1202-0203"})
    def test_the_best_of_a_city_pair_keeps_the_old_id(self):
        self.assertEqual(by_id(out)["CTG-GUA-ticket"]["way_in"], dec3["way_in"])
    def test_same_day_pair_keeps_the_better_one(self):
        # two options with the same days, the higher rating total wins, then the lower price
    def test_ids_are_unique(self):
```

Days come from `ways[o["way_in"]]["depart"][:10]` and `ways[o["way_home"]]["depart"][:10]`, written `MMDD`.

- [ ] **Step 2: Run** `python -I -X utf8 -m unittest plugin.scripts.test_inout_pick` from the repo root (or discover with `-p "test_inout_pick.py"`). Expected: FAIL, module not found.

- [ ] **Step 3: Implement `pick_options`.** Group by old id, inside a group keep the best per `(day out, day home)` by `(rating.total, -price_dkk)`. The best of the group keeps the old id, the rest get `-{MMDD}-{MMDD}`. Replace the `best_opt` block in `inout.py` with `opts = pick_options(all_opts, WAYS)` (use the script's own name for the ways dict). The markdown pick near L405 dedups by id and needs no change beyond using the new list.

- [ ] **Step 4: Add to the `airportsOf` test:** `expect(airportsOf('CTG-GUA-ticket-1202-0203')).toEqual(['CTG', 'GUA'])`. Run `cd web && npm test`. Expected: PASS (the parser takes the first two parts). If it fails, fix `airportsOf`.

- [ ] **Step 5: Check the other consumers** keep working with more options per city pair: `infra/worker/steps.py` `replace_derived` (dedups by id, ids are unique now), `dashboard_data.py`, `itineraries.py`, `planner/src/screens/PickScreen.tsx` `Matrix` (best per entry and exit, unchanged) and `OptionsView` (lists every option of the pair, each row shows its days). Run all four check suites. Expected: PASS.

- [ ] **Step 6: Sync and commit**

```bash
python -I plugin/scripts/sync_claude_dir.py --root .
git add plugin/skills/flight-crawl-orchestrator/scripts plugin/scripts/test_inout_pick.py .claude web/src
git commit -m "Keep one long haul option per day pair, the best of each city pair keeps its id"
```

### Task 2: Ways per day and choosing a way

**Files:**
- Create: `planner/src/lib/ways.ts`
- Test: `planner/src/lib/ways.test.ts` (fixtures with an inline `way({...})` helper like `logic.test.ts` L16-24)

**Interfaces:**
- Consumes: `InOut`, `Way` from `planner/src/data/types.ts`.
- Produces:
  - `dayOf(w: Way): string` is the local day `w.depart.slice(0, 10)`.
  - `waysOn(inout: InOut, like: Way): Record<string, Way[]>` gives ways with the same `direction`, `from` and `to` as `like`, by day, each day sorted same `type` as `like` first, then `price_dkk`. `like` itself is included even when it is not in `inout.ways` (a trip's own way).
  - `dayFares(inout: InOut, like: Way): Record<string, number>` is the first way's `price_dkk` per day, the shape `WhenPicker` takes.
  - `interface WayChoice { wayIn: Way; wayHome: Way; note: string | null }`
  - `chooseWay(inout: InOut, picked: Way, current: { wayIn: Way; wayHome: Way }): WayChoice`

- [ ] **Step 1: Write the failing tests**

```ts
it('lists ways by day with the same kind first', () => {
  expect(waysOn(inout, ticketIn)['2026-12-02'].map((w) => w.id)).toEqual(['I_ticket_1202', 'I_oneway_1202'])
})
it('keeps a trip way that is not in the built ways', () => {
  expect(waysOn(inout, tripOwnIn)['2026-12-03'][0].id).toBe('t1:in')
})
it('day fares are the price of the first way that day', () => {
  expect(dayFares(inout, ticketIn)['2026-12-02']).toBe(8235)
})
it('a ticket way sets both ways', () => {
  const c = chooseWay(inout, ticketIn1202, { wayIn: oneIn, wayHome: oneHome })
  expect(c.wayHome.id).toBe(ticketIn1202.paired_with)
  expect(c.note).toBe('One ticket. This also sets the way home on Wed 3 Feb')
})
it('a one way next to a ticket half turns the other into a one way', () => {
  const c = chooseWay(inout, oneIn1202, { wayIn: ticketIn, wayHome: ticketHome })
  expect(c.wayHome.type).toBe('oneways')
  expect(dayOf(c.wayHome)).toBe(dayOf(ticketHome))
  expect(() => mixWays(inout, c.wayIn, c.wayHome)).not.toThrow()
})
it('a one way next to a one way sets only that way', () => {
  expect(chooseWay(inout, oneIn1202, { wayIn: oneIn, wayHome: oneHome }).note).toBeNull()
})
```

- [ ] **Step 2: Run** `cd planner && npx vitest run src/lib/ways.test.ts`. Expected: FAIL, module not found.

- [ ] **Step 3: Implement.** For a one way next to a ticket half, the other direction becomes the cheapest `oneways` way between its two cities on its day, else on the nearest day, and the note reads "Your way home is now a one way on {day}" (or "way in"). If no one way exists at all, keep the ticket and its partner from the picked side's ticket instead and say so. Use the app's existing day label helper for `{day}`.

- [ ] **Step 4: Run** the test file. Expected: PASS.

- [ ] **Step 5: Commit** `planner/src/lib/ways.ts` and its test, "Find long haul ways by day and choose a way with its partner".

### Task 3: Changing a trip's ways and ends in the store

**Files:**
- Modify: `planner/src/lib/ways.ts` (add `withEnds`)
- Modify: `planner/src/store.ts` (two actions next to `setHopFlight` L332)
- Test: `planner/src/lib/ways.test.ts`, `planner/src/store.test.ts`

**Interfaces:**
- Consumes: `hopBetween(map, from, to, mode, facts?)` from `planner/src/lib/mapTrips.ts:87`, `nodeForAirport(inout, code)` from `journey.ts:56`, `WayChoice` from Task 2.
- Produces:
  - `withEnds(j: Journey, inout: InOut, map: MapData, wayIn: Way, wayHome: Way): Journey` sets `wayIn`, `wayHome` and `optionId` (the option whose `way_in` and `way_home` match, else null). When the arrival node differs from the first stop's node, a new first stop `{ node, hop: null }` comes in and the old first stop gets `hopBetween(map, newNode, oldNode, null)`. When the home node differs from the last stop's node, a stop for it is appended with `hopBetween` from the old last stop. A node already at that end is never added twice.
  - Store `setWays(choice: WayChoice): void` applies `withEnds` to the open journey (same city pair, so places are unchanged) and saves it as a draft the way `setHopFlight` does.
  - Store `changeEnds(wayIn: Way, wayHome: Way): void` applies `withEnds` and returns to the trip view (`go('trips', ...)` as `PickScreen`'s back button does, but to the open trip).
  - Store `pickFor: string | null`, set by `changeEndsOf(tripId: string)` which opens `go('trips', 'pick')`, cleared by `changeEnds` and by leaving the picker.

- [ ] **Step 1: Write the failing tests**

```ts
it('a new arrival city comes in before the old first stop', () => {
  const j2 = withEnds(j, inout, map, wayInBOG, wayHomeGUA)
  expect(j2.places.map((p) => p.node)).toEqual(['BOG', 'CTG', 'SMR', 'GUA'])
  expect(j2.places[1].hop?.from).toBe('BOG')
})
it('the same arrival city adds no stop', () => {
  expect(withEnds(j, inout, map, wayInCTG1202, wayHomeGUA).places).toHaveLength(j.places.length)
})
it('a new home city adds a last leg to it', () => {
  expect(withEnds(j, inout, map, wayInCTG, wayHomeSAL).places.at(-1)!.node).toBe('SAL')
})
it('keeps the option id when the pair is an option', () => {
  expect(withEnds(j, inout, map, optIn, optHome).optionId).toBe('CTG-GUA-ticket-1202-0203')
})
it('a pinned leg before the new arrival shows a clash, nothing is blocked', () => {
  // store test: changeEnds then schedule(...).warnings has a 'leaves before you get there' on that leg
})
```

- [ ] **Step 2: Run** them. Expected: FAIL.
- [ ] **Step 3: Implement** `withEnds` and the store actions.
- [ ] **Step 4: Run** `cd planner && npm run typecheck && npm test`. Expected: PASS.
- [ ] **Step 5: Commit** "Change a trip's ways and its start and end cities".

### Task 4: The day picker and the way sheet on the Copenhagen legs

**Files:**
- Create: `planner/src/components/story/WaySheet.tsx`
- Modify: `planner/src/components/story/Story.tsx` (Leg `key="in"` L282-288 and `key="home"` L385-391)
- Modify: `planner/src/styles/story.css` (or the flight sheet's stylesheet, beside `.fl-md`)

**Interfaces:**
- Consumes: `waysOn`, `dayFares`, `chooseWay`, `dayOf` (Task 2), store `setWays`, `changeEndsOf` (Task 3), `WhenPicker` props (`WhenPicker.tsx:43`), `WayTrack`, `FlightLinks`, `wayLinks(way, inout, other)`, `momondoUrl`.
- Produces: `WaySheet({ dir, way, other, data, onPick, onChangeEnds, close }: { dir: 'in' | 'home'; way: Way; other: Way; data: AppData; onPick: (c: WayChoice) => void; onChangeEnds: () => void; close: () => void })`.

- [ ] **Step 1: Design pass.** Load `emil-design-eng`, then `impeccable`. Read `FlightSheet.tsx` and its CSS first, the way sheet must read as its sibling: the strip of days with a price each at the top (same component or markup as FlightSheet's days), then the ways of the looked at day as ticket rows (airline, times, stops, hub nights, bags, price, Pick), the current way marked picked. Picking shows the `note` from `chooseWay` inline for a moment before the sheet closes, or keeps the sheet open with the note, whichever `emil-design-eng` argues for. Foot: the Momondo link as `FlightLinks` does today, and beside it a second button "Change start and end".
- [ ] **Step 2: Wire it.** The two Copenhagen legs get `picker={<WhenPicker ... fares={dayFares(...)} onSet={(d) => setWays(chooseWay(data.inout, waysOn(...)[d][0], current))} />}` and `sheet={(close) => <WaySheet ... />}`. Keep `card` for the popover fallback. `WhenPicker`'s `min`, `max` and `days` come from the days `waysOn` returns.
- [ ] **Step 3: Check in the running app** (dev server on port 5198 is already running, do not start another) at 375, 768 and 1440 wide on `/?trip=ctg-sal-xmas-cbb`: the day opens the calendar with prices per day, the plane and time open the way sheet, picking a ticket sets both and says so, "Change start and end" opens the picker. Signing in locally: see the controller's notes, ask the controller if the app shows the sign in page.
- [ ] **Step 4: Run `web-design-guidelines`** on the sheet and fix what it finds. Run both app checks. Expected: PASS.
- [ ] **Step 5: Commit** "Open the way in and the way home like any other leg, by day and by flight".

### Task 5: Change start and end, and the home airport pill

**Files:**
- Modify: `planner/src/screens/PickScreen.tsx` (header L76-85, `Expanded` L414, `MixView` L443)
- Create: `planner/src/components/HomePill.tsx`
- Modify: `planner/src/store.ts` (`home: string`, default `'CPH'`, persisted in the existing filters key `latam-planner.filters`)
- Create: `planner/src/lib/homes.ts` with `HOMES: { code: string; city: string; country: string }[] = [{ code: 'CPH', city: 'Copenhagen', country: 'DK' }]`
- Test: `planner/src/store.test.ts`

**Interfaces:**
- Consumes: store `pickFor`, `changeEnds` (Task 3).
- Produces: `HomePill({ value, onChange }: { value: string; onChange: (code: string) => void })`.

- [ ] **Step 1: Failing store tests.** `home` defaults to `'CPH'` and survives a reload of the filters key. With `pickFor` set, choosing an option calls `changeEnds` and leaves `journeys` length unchanged.
- [ ] **Step 2: Implement.** With `pickFor` set the title reads "Change start and end of {name}", and `Expanded` and `MixView` call `changeEnds(wi, wh)` instead of `startOnMap`. The rows are filtered to ways whose `from` (in) and `to` (home) is `home`.
- [ ] **Step 3: The pill.** Search 21st (`mcp__21st__search` for a country or flag select with a scrolling list), adapt it: a rounded pill with the Danish flag (the app's `Flag` component), "Copenhagen" and a chevron, opening a short scrolling list of flag and city rows with Copenhagen, Denmark checked. Keyboard and screen reader friendly, and a full width sheet on a phone per `mobile-native`.
- [ ] **Step 4: Check** in the app at 375, 768 and 1440 from an open trip's "Change start and end" and from "New trip". Run `web-design-guidelines`, then both app checks. Expected: PASS.
- [ ] **Step 5: Commit** "Change start and end of an open trip, home airport pill in the trip picker".

### Task 6: Ship the pipeline change (controller)

- [ ] **Step 1:** `AWS_PROFILE=the-deploy-profile bash infra/deploy.sh --enable-schedules`, then start a build the way `tripdb status` and `infra/` docs describe, and wait for it to finish.
- [ ] **Step 2:** In the app, open "New trip", pair "Cartagena in, Guatemala City home". Expected: a row out Wed 2 Dec with the KLM ticket at 8,235 kr beside the 3 Dec row.
- [ ] **Step 3:** In `ctg-sal-xmas-cbb`, open the way in, pick the 2 Dec KLM ticket. Expected: both ways set, the note shows, totals update, saving works and a reload keeps it.
