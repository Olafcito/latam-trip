# Map dashboard implementation plan

> **For agentic workers:** This plan is run under the "Running a build" workflow in CLAUDE.md, in batches, each task its own commit. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the shared map (`web/src/map`, the planner Map tab and the public web map) the trip dashboard FEAT-001 describes: the camera fits what is open, the city panel is sections in a fixed order, layers sit on the trip, the phone uses the one sheet, and a guest gets the same structure with no edit controls.

**Architecture:** Three batches. Batch A adds pure helpers (camera bounds, route scoping) and small wiring with no layout change. Batch B1 rebuilds the city panel as sections and hosts the phone panel in the existing `ModeSheet`. Batch B2 wires the camera and the layer model in `RouteMap.tsx` and `useMapMode.ts`. Nothing new is stored, every section reads the data the screen already loads.

**Tech Stack:** React 18, MapLibre GL, vitest with `renderToStaticMarkup` (node environment, no jsdom), CSS under `@scope (.rmap)` with the `rmap` container query at 719px.

**Spec:** `docs/product/features/FEAT-001-map-dashboard.md`. Earlier rulings in `docs/superpowers/specs/2026-11-03-map-tab-and-atlas-design.md` still hold: one layer open at a time (independent toggles deferred), one layers control, no zoom buttons on a phone, the attribution pinned.

## Global Constraints

- No new Supabase tables or columns, no change to `web/src/data/types.ts`.
- `web/src` imports nothing from `planner/src`, and nothing in `web/src` reads lodgings or bookings. The repo and the `web` bucket are public, so the guest page must not carry those rows (PROD-005).
- Unknown values render the shared hollow mark `Unknown` (`web/src/map/Unknown.tsx`), never zero, never a dash, never the word unknown (DES-013).
- No question marks and no prose recap lines in the UI. Plain sentences in docs, no semicolons as separators, no em or en dashes.
- Stage explicit paths only. Shots go to `docs/design/shots/map-tab/2026-11-04/` (git ignored).
- Commit identity `git -c user.name=Claude -c user.email=noreply@anthropic.com`, messages end `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.
- Web tests run with `npm test` in `web/`, planner tests with `npx vitest run` in `planner/`, typecheck with `npm run typecheck` in both. A task touching `web/src/map` runs both.

## Review Focus

- A trip with one stop: `tripBounds` returns a point box. Test in Task 1 that `fit` padding math leaves a usable zoom (max zoom cap applies, no NaN).
- A connection whose end place is missing from the model: `legBounds` returns null and `showRoute` keeps the camera. Test in Task 1.
- A place with marks but no experiences loaded yet (data race on the web map): the saved places section renders from `markOf` only when the experience row exists. Test in Task 4.
- Phone sheet at the peek detent with a long city name: the peek shows the name on one line, ellipsis, never the grabber alone. Test in Task 5 asserts the title node is outside the scroll body.
- Turning a layer on with no trip open: scope is the whole map and the widen control does not render. Test in Task 7.

---

## Batch A: pure helpers and small wiring (Sonnet)

### Task 1: Camera bounds helpers

**Files:**
- Create: `web/src/map/camera.ts`
- Test: `web/src/map/camera.test.ts`

**Interfaces:**
- Consumes: `boundsOf(points: LonLat[]): Bounds` and `LonLat`, `Bounds` from `web/src/lib/geo.ts`. `Place` has `lon`, `lat`. `Connection` has `from`, `to` ids (see `web/src/data/types.ts`).
- Produces:
  - `tripBounds(stops: string[], byId: Map<string, Place>): Bounds | null` (null when fewer than one stop resolves).
  - `legBounds(conn: Pick<Connection, 'from' | 'to'>, byId: Map<string, Place>): Bounds | null` (null unless both ends resolve).
  - `padBounds(b: Bounds, share: number): Bounds` grows a box by `share` of its own width and height on each side, with a floor of 0.25 degrees on each axis so a single point gets a usable box.

- [ ] **Step 1: Write the failing tests** in `camera.test.ts`
  - `tripBounds` of three stops equals `boundsOf` of their points.
  - `tripBounds` of ids none of which resolve is null.
  - `legBounds` with a missing end is null.
  - `padBounds([[0,0],[0,0]], 0.1)` has width 0.5 and height 0.5 (the floor), `padBounds([[0,0],[10,10]], 0.1)` is `[[-1,-1],[11,11]]`.
- [ ] **Step 2: Run** `cd web && npx vitest run src/map/camera.test.ts`. Expected: FAIL, module not found.
- [ ] **Step 3: Implement** the three functions in `camera.ts`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(map): camera bounds helpers for trip and leg`.

### Task 2: Route scope helper

**Files:**
- Create: `web/src/map/routeScope.ts`
- Test: `web/src/map/routeScope.test.ts`

**Interfaces:**
- Consumes: `km(aLat, aLon, bLat, bLon)` from `web/src/lib/geo.ts`.
- Produces: `alongRoute<T>(rows: T[], at: (row: T) => LonLat | undefined, line: LonLat[], withinKm: number): T[]` keeps rows whose point lies within `withinKm` of any vertex of `line` or of the midpoint of any segment. `ROUTE_KM = 120` exported.

- [ ] **Step 1: Write the failing tests**: a point 50 km from a stop is kept, a point 500 km from every vertex and midpoint is dropped, a row with no point is dropped, an empty line keeps nothing.
- [ ] **Step 2: Run** `cd web && npx vitest run src/map/routeScope.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `alongRoute` and `ROUTE_KM`.
- [ ] **Step 4: Run** the test. Expected: PASS.
- [ ] **Step 5: Commit** `feat(map): scope layer rows along the open route`.

### Task 3: Small wiring, no layout change

**Files:**
- Modify: `web/src/map/Controls.tsx` (the `.zbtns` block, around line 62)
- Modify: `web/src/map/Panel.tsx` `RouteView` (duration and price facts, around lines 540 to 560)
- Create: `web/src/map/guest.test.tsx`
- Create: `web/src/map/privacy.test.ts`

**Interfaces:**
- Consumes: `Unknown({ title })` from `web/src/map/Unknown.tsx`.
- Produces: a `coarse` boolean inside `Controls` from `window.matchMedia?.('(pointer: coarse)').matches` (false when `window` is undefined), used to omit the `.zbtns` div.

- [ ] **Step 1: Write the failing test** `guest.test.tsx`: render `Panel` with `view.panel: 'city'`, `stays` undefined, `onAddLeg` undefined, `trip: null`, fixture place `SAL`, and assert the markup has no `<button` whose text starts with `Add` and no `aria-label` containing `Edit`. Use the fixture setup from `Panel.test.tsx`.
- [ ] **Step 2: Write** `privacy.test.ts`: read every `.ts` and `.tsx` under `web/src` with `node:fs` and assert none matches `/lodging|booking(s)?\b(?!_url)/i` outside `web/src/data/types.ts` and `web/src/map/Panel.tsx` line with `booking_url`. Simpler assertion: no file imports a path containing `lodgings` or `bookings`, and no file contains `from('lodgings')` or `from('bookings')`.
- [ ] **Step 3: Run** both. Expected: `guest` PASS already (records the state), `privacy` PASS. If `guest` fails, the failing control is the finding, fix it in `Panel.tsx`.
- [ ] **Step 4: Implement** the coarse pointer check in `Controls.tsx` and replace the RouteView duration and price fallbacks with `<Unknown title="Duration not known" />` and `<Unknown title="Price not known" />` where the value is null. Check the existing output first with `grep -n "duration\|price" web/src/map/Panel.tsx` in the RouteView range.
- [ ] **Step 5: Run** `cd web && npm run typecheck && npm test` and `cd planner && npm run typecheck && npx vitest run`. Expected: all PASS, quote the summary line.
- [ ] **Step 6: Commit** `feat(map): no zoom buttons on touch, hollow marks in the route view, guest and privacy tests`.

## Batch B1: the panel as sections (Opus, the screen)

### Task 4: CityView as sections in a fixed order

**Files:**
- Modify: `web/src/map/Panel.tsx` `CityView` (lines 212 to 300)
- Modify: `web/src/map/PlaceSections.tsx` (export the `Section` component, add a `savedRows` section)
- Modify: `web/src/map/city.css`
- Test: `web/src/map/Panel.test.tsx`

**Interfaces:**
- Consumes: `api.exps.at(placeId)`, `api.exps.markOf('experience', id)`, `api.gyms.gymsAtPlace`, `capped(rows, open)` from `web/src/data/cardFacts.ts`, `p.stays?.(city.id)` from `PanelProps`.
- Produces: `CityView` renders, in this order and only when non empty, `<section className="mc-sec" aria-label="Overview">`, `"Saved places"`, `"Experiences"`, `"Training"`, `"Connections"`. Each section after Overview has the existing `.sechead` with the title and a mono count, and folds past `SECTION_CAP` behind the existing `mc-more` Show all button. Overview holds the head (thumb, kicker, name, why, head buttons), the stay block from `p.stays`, the trip note and the More about link. Saved places lists experiences and gyms at the place whose `markOf` is set, as `CardRow`s with a `SavedLine`, and is left out when none. Connections holds the In and Out `dirseg` and `ConnList` as today.

- [ ] **Step 1: Write the failing tests** in `Panel.test.tsx`, a `city(sel)` render helper beside `more(sel)` with `panel: 'city'`:
  - `renders the sections in the fixed order`: collect `aria-label` values of `section.mc-sec` in document order for a fixture place that has experiences and connections, assert the filtered list equals the order above restricted to the ones present.
  - `leaves out an empty section`: for a fixture place with no experiences, the markup has no `aria-label="Experiences"` and no `aria-label="Saved places"`.
  - `saved places come from the marks`: for a fixture place with a saved experience in `lists.json`, `aria-label="Saved places"` is present and contains that experience name.
  - `the overview holds the stay block`: with `stays={() => <div data-stay />}`, the `data-stay` node sits inside the Overview section.
- [ ] **Step 2: Run** `cd web && npx vitest run src/map/Panel.test.tsx`. Expected: FAIL on order and labels.
- [ ] **Step 3: Implement**: export `Section` from `PlaceSections.tsx` (keep its signature `{title, flush?, rows, head?, render}`), build the Saved places rows in `PlaceSections.tsx` as `savedAt(api, placeId): SavedRow[]` where `SavedRow = {kind: 'experience' | 'gym', id, name, score?}`, and restructure `CityView` to the five sections. Keep `HeadButtons`, `PlaceSections`, `ConnList` as they are. Style: section headings share one size, the overview has no `.sechead`.
- [ ] **Step 4: Run** `cd web && npm run typecheck && npm test` and the planner typecheck and tests. Expected: PASS.
- [ ] **Step 5: Shoot** the planner Map tab city panel at 1440 by absolute path to `docs/design/shots/map-tab/2026-11-04/b1-panel-1440.png` and report the path.
- [ ] **Step 6: Commit** `feat(map): city panel as sections in a fixed order`.

### Task 5: Phone panel hosted in the one sheet

**Files:**
- Modify: `web/src/map/RouteMap.tsx` (the `<Panel>` render around line 1087 and the `narrow` state)
- Modify: `web/src/map/ModeSheet.tsx` (accept `title` as a `ReactNode` and a `peek` slot)
- Modify: `web/src/map/routeMap.css` (the narrow `.panel` rules at lines 643 to 650 go, the sheet carries them)
- Test: `web/src/map/sheet.test.ts`, `web/src/map/Panel.test.tsx`

**Interfaces:**
- Consumes: `ModeSheet` props `{title, count, narrow, collapsed, cardOpen, panelRef, onCollapse, onClose, detentMemo, scrollMemo, scrollKey, bar?, children}`, `DETENTS`, `SHEET_PEEK` from `sheet.ts`.
- Produces: on `narrow`, `RouteMap` renders `<ModeSheet title={name} ...><Panel ... hosted /></ModeSheet>` for city, more and route views, and the `Panel` gets a new optional prop `hosted?: boolean` that drops its own close button, grabber and sheet chrome. Wide stays as today. The peek detent shows the title row only.

- [ ] **Step 1: Write the failing tests**: in `Panel.test.tsx`, `hosted panel renders no close of its own` (no `aria-label="Close"` in the hosted render, one in the plain render). In `sheet.test.ts`, `peek leaves the control column inside the map` asserts `detentOffsets(724, 780).peek` leaves at least `SHEET_PEEK` of sheet and the half offset equals `MODE_SHEET` share (extends the existing case with the control bottom: `ctlBottom(detent, offsets) = height - offsets[detent] + 10` for peek and half, `10` for full, a pure function added to `sheet.ts`).
- [ ] **Step 2: Run** the two tests. Expected: FAIL.
- [ ] **Step 3: Implement** `hosted` on `Panel`, the `ModeSheet` host in `RouteMap`, `ctlBottom` in `sheet.ts`, and set `--ctl-bottom` inline on `.rmap` from `ctlBottom` so `.ctl-bottom` and `.ctl-tr` use it in the narrow container query instead of the fixed `52%`.
- [ ] **Step 4: Run** typecheck and tests in both packages. Expected: PASS.
- [ ] **Step 5: Shoot** the planner Map tab at 375 wide with a city open at each detent (peek, half, full) by absolute path to `docs/design/shots/map-tab/2026-11-04/b1-phone-{peek,half,full}.png`. Reaching the detents: tap the grabber (`.msheet-handle`) cycles them.
- [ ] **Step 6: Commit** `feat(map): phone city panel in the one sheet`.

## Batch B2: camera and layers (Sonnet, after A)

### Task 6: Camera follows what is open

**Files:**
- Modify: `web/src/map/RouteMap.tsx` (map construction at line 516, `fitTrip` at 353, `showRoute` at 243, the Home button at 1026)
- Test: `web/src/map/camera.test.ts` (extend)

**Interfaces:**
- Consumes: `tripBounds`, `legBounds`, `padBounds` from Task 1. `fit(bounds, panel, zoomMul, margin)` in RouteMap.
- Produces: `initialBounds(trip: Trip | null, model: Model): Bounds` in `camera.ts`, trip bounds padded by 0.15 when the trip has stops, else `model.home`. Map is constructed with `bounds: initialBounds(trip, model)` so no world view renders first. `showRoute(conn)` always calls `fit(legBounds(conn, model.byId), 'route', 6, 90)` when the bounds resolve. The Home button fits the open trip when there is one, else `fit(null, null)`. The `fitTripOnLoad` effect stays for a trip that arrives after the map.

- [ ] **Step 1: Write the failing test**: `initialBounds` returns the padded trip box for a trip with stops and `model.home` for null.
- [ ] **Step 2: Run** `cd web && npx vitest run src/map/camera.test.ts`. Expected: FAIL.
- [ ] **Step 3: Implement** `initialBounds` and the three RouteMap changes. `trip` is read in the construction effect through a ref (`live.current`), the effect's dependency list does not change.
- [ ] **Step 4: Run** typecheck and tests in both packages. Expected: PASS.
- [ ] **Step 5: Shoot** the planner Map tab on open at 1440 (`b2-open-1440.png`) and with a connection open (`b2-route-1440.png`), by absolute path under `docs/design/shots/map-tab/2026-11-04/`. Reach the route: click a city, click a row under Connections.
- [ ] **Step 6: Commit** `feat(map): camera fits the trip, the stop and the leg`.

### Task 7: Layers sit on the trip, scoped along the route

**Files:**
- Modify: `web/src/map/modeLayers.ts` (`NORMAL_LAYERS` at 221, `setMapMode` at 317)
- Modify: `web/src/map/useMapMode.ts` (`shownGyms`, `shownExps`, `shownSaved` at 42 to 45, a `scope` state)
- Modify: `web/src/map/RouteMap.tsx` (`pane` at 130, `TripBar` at 1041, `tripOpacity` at 738, `ROUTE_LAYERS` visibility at 728)
- Modify: `web/src/map/ModeSheet.tsx` or `GymsPanel.tsx` and `ExperiencesPanel.tsx` (a `Whole map` toggle in the list head)
- Test: `web/src/map/modeLayers.test.ts`, `web/src/map/useMapMode.test.ts` (new, pure parts only)

**Interfaces:**
- Consumes: `alongRoute`, `ROUTE_KM` from Task 2. `tripStops(trip)` from `web/src/data/trips.ts`. `routePoints(model, conn, options)` from `web/src/data/model.ts`.
- Produces:
  - `modeLayers.ts`: `NETWORK_LAYERS` (the routes, via, hit and place layers and labels) and `TRIP_LAYERS = [TRIP_OVERLAND, 'stop-dot', ...TRIP_STOP_LAYERS, 'stop-label']`. `setMapMode(map, mode)` hides only `NETWORK_LAYERS` in a mode, `TRIP_LAYERS` stay visible. Export `tripLayersStay(mode: MapMode | null): string[]` returning the layer ids that stay visible, for the test.
  - `useMapMode(map, data, first?, scope?: {line: LonLat[], stops: string[]} | null)`: new state `wide: boolean` with `setWide`, default false. `shownGyms`, `shownExps`, `shownSaved` pass through `alongRoute(rows, pointOf, scope.line, ROUTE_KM)` when `scope` is set and `wide` is false. Returned object gains `wide`, `setWide`, `scoped: boolean` (scope set and not wide).
  - `RouteMap`: `pane` stays while a mode is on, as mini (`sideMini` forced true), and `TripBar` renders while a mode is on. `tripOpacity` in a mode becomes 0.55. The list head of each layer panel shows a `Whole map` toggle button (`aria-pressed`) only when `mm.scoped || mm.wide` and a trip is open.
- [ ] **Step 1: Write the failing tests**: in `modeLayers.test.ts`, `tripLayersStay('gyms')` contains `'trip-stop'` and `'stop-label'` and not `'place-dot'`. In `useMapMode.test.ts`, test the pure scoping: extract `scopeRows(rows, pointOf, scope, wide)` into `routeScope.ts` and assert that with `wide` true all rows return and with a null scope all rows return.
- [ ] **Step 2: Run** both. Expected: FAIL.
- [ ] **Step 3: Implement** per the Interfaces block. The `scope` passed from RouteMap is `{line: routePoints of each trip leg concatenated, stops: tripStops(trip)}` memoised on `trip` and `model`, null without a trip.
- [ ] **Step 4: Run** typecheck and tests in both packages. Expected: PASS.
- [ ] **Step 5: Shoot** the planner Map tab with the gyms layer on and a trip open at 1440 (`b2-gyms-1440.png`) and at 375 (`b2-gyms-375.png`) by absolute path.
- [ ] **Step 6: Commit** `feat(map): layers sit on the trip, scoped along the route`.

## Self review

- Spec coverage. Story 1 Task 6. Story 2 Task 4. Story 3 is reachability of the existing stay block from the Overview section (Task 4) and the shot in the roast, no new write path, because the spec's add experience and add training have no UI write path for marks today (marks come from the `lists` bucket json, read only). That gap is recorded in the design log by the main session, not built here. Story 4 Tasks 3 and 6. Story 5 Task 7. Story 6 Tasks 3 and 5. Story 7 Task 3 (the web App's sign in strip is out of scope for the map package, it is `web/src/App.tsx`, noted for the main session).
- Types. `Bounds` is `[[number, number], [number, number]]`. `scope` is the same shape in Task 7's hook and `scopeRows`. `Section` keeps its `PlaceSections` signature.
- Proportion. Seven tasks for a seven story spec, no bodies.
