# Trips at night: implementation plan

> **For agentic workers:** each task below is one branch, built by one subagent in its own git worktree. Steps use checkbox (`- [ ]`) syntax. Read the spec first, then your task, then the Global Constraints and the Design Workflow.

**Goal:** Move the planner's Trips tab, trip view, picker and the map's trip panel to the map's night look, and turn the Trips home into the Timetable.

**Architecture:** One night token set on `:root` in `planner/src/styles/tokens.css`, the old `app.css` split into one CSS file per screen so branches do not collide, a shared pure layout function `stripLayout` plus a `TripStrip` component that both the Timetable and the trip view draw, and two small tested libraries for freshness and Claude tasks.

**Tech Stack:** Vite 8, React 19, TypeScript, Zustand 5, vitest, plain CSS with `@scope`, `@starting-style` and custom properties. maplibre on the map tab (unchanged).

**Spec:** `docs/superpowers/specs/2026-10-29-trips-night-redesign-design.md`

## Global Constraints

- No light, sand, grey or white surfaces anywhere in the planner or the map's trip panel. Use only the tokens in spec section 4.1.
- Bricolage Grotesque for words, IBM Plex Mono with `font-variant-numeric: tabular-nums` for every number. No Inter.
- No new runtime dependencies. No Tailwind, shadcn runtime, framer-motion or vaul. 21st.dev components are references to rebuild in plain React and CSS.
- Motion: `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`, `--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`, durations 120, 180, 240ms, press `scale(0.97)`, hover styles inside `@media (hover: hover) and (pointer: fine)`, no animation on keyboard actions, all motion off under `prefers-reduced-motion: reduce`.
- Focus: `outline: 2px solid var(--flight); outline-offset: 2px` on `:focus-visible`.
- UI text: plain sentences, no semicolons as separators, no em or en dashes. Kroner as `6.494 kr` (use `kr()` from `lib/format`), hours as `16h 10m` (`hours()`), local clock times, unknown as `?`.
- No booking links, no logins. Photos keep credit and licence.
- Never edit anything under `data/`. Never commit a key.
- Before every commit: `cd web && npm run typecheck && npm test` and `cd planner && npm run typecheck && npm test` both pass.
- Commit with `git -c user.name=Claude -c user.email=noreply@anthropic.com commit`, message ending with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Do not push. Do not merge. The coordinator merges.

## Design Workflow (required in every UI task)

Every UI task runs the whole workflow, not just the build. In order:

1. Invoke the `impeccable` skill. Run its setup (`sh C:/Users/Simon/.claude/skills/impeccable/scripts/impeccable context --target <your main file>`), then read `reference/craft-floor.md` before editing UI.
2. Invoke `emil-design-eng` and follow it for every interactive detail (press, hover gating, easing, durations, entering with `@starting-style`).
3. Use the 21st MCP: `mcp__21st__search` for your component kind, then `mcp__21st__get_component` on one or two candidates named in your task. Study structure, keyboard handling and states, then rebuild on our tokens. Never paste Tailwind classes or add packages.
4. For motion, invoke `animate` (or `apple-design` for sheets and drag). For phone layouts, invoke `mobile-native`.
5. Before committing, fetch the Vercel Web Interface Guidelines with the `web-design-guidelines` approach (WebFetch `https://raw.githubusercontent.com/vercel-labs/web-interface-guidelines/main/command.md`) and check your files against it. Fix what applies.
6. Run the impeccable detector on your changed files: `sh C:/Users/Simon/.claude/skills/impeccable/scripts/impeccable detect --json <files>`. Fix real findings.
7. Do not open a browser with the Playwright MCP (other agents share it). The coordinator checks visuals after merging. You may run `npm run build` in planner to prove it compiles.

## Review Focus

- A trip with no dated flights between landing and home (every stop shares days evenly): the strip still draws every stop with nonzero width and in order.
- A trip whose schedule has an error warning (a flight before you arrive): `stripLayout` never returns a negative width, and the warning shows as a coral row.
- Unknown prices or hours (`null`): shown as `?`, never `0 kr` or `0h`.
- `meta.json` missing or a type with `last_checked: null`: the freshness corner shows `?` and the app still loads.
- A phone at 390px wide: no horizontal page scroll on Trips, trip view or picker, and every tap target is at least 44px.

---

## Wave 1 (run in parallel)

### Task A: Night foundations

Branch `redesign/a-night-foundations`.

**Files:**
- Create: `planner/src/styles/tokens.css`, `base.css`, `shell.css`, `trips.css`, `dash.css`, `pick.css`, `waycard.css`, `index.css` (imports the others in that order)
- Delete: `planner/src/app.css` (its rules move into the files above, grouped by the class lists in spec section 5)
- Modify: `planner/src/main.tsx` (import `./styles/index.css`), `planner/index.html` (drop Inter from the font URL), `planner/src/App.tsx` (header and tabs)

**Interfaces:**
- Produces: the tokens of spec 4.1 on `:root`, and the primitive classes `.btn`, `.btn.primary`, `.btn.link`, `.btn.small`, `.btn.danger`, `.seg` (segmented, `aria-pressed` or radio buttons inside), `.tag` (mono inline tag, modifiers `.tag.mine`, `.tag.draft`), `.mono`, `.label` (11px lowercase mono faint), `table.grid` (hairline table), `.field` (input or select on `--surface-2`). Later tasks use these names and add screen classes only in their own CSS file.
- Produces: the CSS file ownership used by wave 2: B edits only `trips.css`, C only `dash.css` and `waycard.css`, D only `pick.css`, F only `shell.css` (the freshness corner block at its end).

- [ ] **Step 1:** Run the Design Workflow steps 1 to 4 (21st: segmented control `23552`, `34763`. Tables `89`).
- [ ] **Step 2:** Move every rule of `app.css` into the per screen files unchanged, keep the `@scope (:root) to (.rmap)` wrapper in each file, switch `main.tsx` to `styles/index.css`. Run `cd planner && npm run typecheck && npm test && npm run build`. Expected: pass. Commit "Planner CSS split into one file per screen".
- [ ] **Step 3:** Write `tokens.css` with the spec 4.1 values and the type scale of 4.2. Repaint `base.css` primitives to night (4.3). Replace every light value in all the screen files with tokens, so each screen is at least plainly night even before its own task (no `#fff`, `#f4f2ee`, `#f1efea`, blue `#1f4fb8`, pink bands). Drop Inter. Grep proves it: `grep -rniE "#fff\b|#ffffff|f4f2ee|f1efea|1f4fb8|Inter" planner/src planner/index.html` returns nothing.
- [ ] **Step 4:** Rebuild the shell (spec 4.4): one header band with wordmark "LatAm" and the date span in mono (keep the "data from GitHub, built ..." fact as a small muted line or a title attribute), text tabs with a sliding amber underline (transform on one indicator element, 180ms ease out), no `.n` badges. Leave an empty `<div className="fresh-slot" />` at the right of the header for Task F.
- [ ] **Step 5:** Design Workflow steps 5 and 6. Typecheck and test both apps. Commit "Night tokens, type and primitives for the planner".

### Task S: The trip strip

Branch `redesign/s-trip-strip`. Only creates new files, so it runs beside Task A.

**Files:**
- Create: `planner/src/lib/strip.ts`, `planner/src/lib/strip.test.ts`, `planner/src/components/TripStrip.tsx`, `planner/src/components/TripStrip.css` (imported by the component, all rules inside `@scope (.strip)`, values from the tokens of spec 4.1 with literal fallbacks, for example `var(--flight, #F2B544)`)

**Interfaces:**
- Consumes: `schedule`, `nodeName`, `nodeForAirport`, `Journey` from `lib/journey`, `toUtcMs` from `lib/time`, `countryColor` from `lib/colors`, `AppData`, `Way` from `data/types`.
- Produces:

```ts
export interface StripStay { node: string; name: string; country: string; start: number; end: number; nights: number }
export interface StripHop { at: number; mode: Mode; night: boolean; selfTransfer: boolean; known: boolean }
export interface StripLayout {
  departHome: number      // way in leaves Europe, UTC ms
  land: number            // way in lands, UTC ms
  leave: number           // way home leaves, UTC ms
  backHome: number        // way home lands in Europe, UTC ms
  stays: StripStay[]
  hops: StripHop[]
}
export function stripLayout(data: AppData, j: Journey): StripLayout | null   // null when a way is missing
export function stripDomain(layouts: StripLayout[], padDays?: number): [number, number] // default padDays 2
export function TripStrip(props: { layout: StripLayout; domain: [number, number]; size: 'row' | 'full'; label: string }): JSX.Element
```

Layout rule for stays: walk the schedule places in order with a cursor starting at `land`. A stay starts at its `arrive` when known, otherwise at the cursor. It ends at its `depart` when known, otherwise at start plus `days` times 24h. The cursor moves to the end. Clamp so `end >= start`. Local times convert with `toUtcMs(local, airport.utc_offset)`. For map nodes that are not airports use the offset of the way in's arrival airport. A night hop is one whose arrival local hour is from 22 to 5.

- [ ] **Step 1:** Write `strip.test.ts` with `it('stays are in order and never negative')`, `it('a trip with no dated flights still gives every stop a width above zero')`, `it('the first stay starts at the landing and the last ends when the way home leaves')`, `it('stripDomain pads two days each side')`, using the seeded trips the way `seeds.test.ts` loads them (skip when `data/saved_trips.json` is missing) plus one hand built journey.
- [ ] **Step 2:** `cd planner && npx vitest run src/lib/strip.test.ts`. Expected: FAIL, module missing.
- [ ] **Step 3:** Implement `stripLayout` and `stripDomain`.
- [ ] **Step 4:** Run the test. Expected: PASS. Commit "Strip layout for a trip on a shared time axis".
- [ ] **Step 5:** Design Workflow steps 1 to 4 (21st: timelines `28289`, `38523`). Build `TripStrip` as one SVG with `role="img"` and `aria-label={label}`: stays as country tinted rects (2px top stroke at full colour, fill at 22% alpha), names inside when the rect is wide enough (measure with a character width estimate, no DOM measuring), flights as small amber arcs above the strip at their time (at least 10px wide), ground ticks in `--bus`, boat dashes in `--boat`, a moon glyph over night landings, a split mark for self transfers, the way in arc entering from the left end and the way home leaving at the right. `size='full'` adds week ticks with mono dates under the strip and labels every stay (rotated or staggered when crowded). Unknown hops draw in `--faint`.
- [ ] **Step 6:** Design Workflow steps 5 and 6. Typecheck and test. Commit "TripStrip component".

## Wave 2 (run in parallel, after A and S are merged)

### Task B: The Timetable (Trips home)

Branch `redesign/b-timetable`. Files: `planner/src/screens/TripsScreen.tsx`, `planner/src/styles/trips.css`, new `planner/src/components/CompareTray.tsx` if needed.

**Interfaces:** consumes `stripLayout`, `stripDomain`, `TripStrip` from Task S, the primitives of Task A, and the store (`saved`, `journey`, `compare`, `toggleCompare`, `deleteSaved`, `importJourneys`, `openSaved`, `openTrip`, `go`). Keep `summarize(data, j)` or extend it.

- [ ] **Step 1:** Design Workflow 1 to 4 (21st: tables `89`, `34787`, sheets `25002` for the tray, segmented `23552` for sort).
- [ ] **Step 2:** Build spec 6.1 in full: shared axis with month labels and week ticks, rows (name column with `#rank`, `mine` or the draft dot and `not saved`), strip, mono margin (all in kr, air hours, nights, stops, `?` for unknown), row actions with inline delete confirm, sort (rank, price, air time, default rank, seeded first then mine), one amber "New trip", export and import as link buttons under the table, compare tray (up to 3, best value per line marked with an amber dot, clear button, slides up 240ms on the drawer curve via `@starting-style`), empty state line, phone layout under 640px.
- [ ] **Step 3:** If sorting is more than a one line comparator, put it in `lib/tripsort.ts` with a test (`it('rank sorts seeded trips by rank then mine trips by name')`, `it('price puts unknown totals last')`).
- [ ] **Step 4:** Design Workflow 5 and 6. Typecheck and test both apps. Commit "Trips home as a timetable".

### Task C: The trip view

Branch `redesign/c-trip-view`. Files: `planner/src/screens/TripDashboard.tsx`, `planner/src/components/WayCard.tsx`, `TotalsPanel.tsx`, `MiniMap.tsx`, `planner/src/styles/dash.css`, `waycard.css`.

**Interfaces:** consumes `TripStrip` at `size='full'` with `stripDomain([layout], 2)`, `schedule`, `totals`, the store's `saveJourney`, `showOnMap`, `closeTrip`. Leaves an empty `<div className="dash-actions-extra" />` in the head actions for Task G.

- [ ] **Step 1:** Design Workflow 1 to 4 (21st: tables `89`, `4783`. Sheets `31360` for the phone ledger).
- [ ] **Step 2:** Build spec 6.2: head, full strip, key numbers line, warnings as edged hairline rows, two columns (leg table and sticky ledger), the one ticket bracket with lock for the long haul legs when `shared_ticket` or a return ticket joins them, checked date per priced hop from `flight.observed_at` or ticket `observed_at` with an amber edge when older than 3 days, WayCard and MiniMap on night, phone single column with sticky total bar that expands the ledger as a bottom sheet.
- [ ] **Step 3:** Design Workflow 5 and 6. Typecheck and test both apps. Commit "Trip view at night with leg table and ledger".

### Task D: Pick at night

Branch `redesign/d-pick-night`. Files: `planner/src/screens/PickScreen.tsx`, `planner/src/styles/pick.css`.

- [ ] **Step 1:** Design Workflow 1 to 4 (21st: tables `89`, segmented `26923`).
- [ ] **Step 2:** Build spec 6.3: matrix ramp `.s0 #14252E`, `.s1 #F2B54426`, `.s2 #F2B5444D`, `.s3 #F2B54499`, `.s4 #F2B544` with `--flight-ink` text on s3 and s4, selected cell with a 2px `--text` ring, row and column highlight on `--surface-2`, filters and options table on the primitives, expanded option on `--surface`, phone layout with the matrix scrolling inside its own box.
- [ ] **Step 3:** Design Workflow 5 and 6. Typecheck and test both apps. Commit "Pick in and home at night".

### Task E: The map trip panel at night

Branch `redesign/e-map-panel-night`. It touches only the web app, so it runs in wave 1 beside A and S. File: `web/src/map/routeMap.css`, only the panel sections (the paper panel from about line 147, the trips panel, the plan panel from about line 466 to 560, and the bottom sheet rules from about line 563). Do not touch map canvas, layer, marker, legend or chip rules.

- [ ] **Step 1:** Design Workflow 1, 2 and 4 (`apple-design` for the bottom sheet).
- [ ] **Step 2:** Apply spec 6.4: `--panel` becomes `#0F1F29` (solid) with a `--chrome-line` hairline border, `--ink` text becomes `--text`, ink filled controls (`.pbtn.primary`, `.dirseg` selected, `.plan-finish`, `.tbtn.dark`) become `--flight` with `#13202A` text, paper hovers (`#E4DED1` and similar) become `#14252E`, `a` colour `#7A4F00` becomes `--flight`, `.panel.plan.mini` becomes a translucent night `#0F1F29E0`. Check every rule that reads `--panel` or `--ink` still has contrast at least 4.5:1 for text.
- [ ] **Step 3:** Design Workflow 5 and 6 on `routeMap.css`. Typecheck and test both apps. Commit "Map trip panel at night".

### Task F: Freshness

Branch `redesign/f-freshness`. Files: `planner/src/data/types.ts` (add `meta`), `planner/src/data/load.ts`, new `planner/src/lib/freshness.ts` and `freshness.test.ts`, new `planner/src/components/Freshness.tsx`, `planner/src/App.tsx` (render it in `.fresh-slot`), `planner/src/styles/shell.css` (append only).

**Interfaces:**

```ts
// data/types.ts
export interface Meta { built_at: string | null; last_checked: Record<string, string | null> }
// AppData gains: meta: Meta | null

// lib/freshness.ts
export const STALE_DAYS = 3
export interface Fresh { type: string; at: string | null; ageDays: number | null; stale: boolean }
export function freshness(meta: Meta | null, now: number): Fresh[]   // one per key of last_checked, in key order
export function ageLabel(ageDays: number | null): string            // '?' for null, 'today', '1 d', '5 d'
export function isStale(at: string | null, now: number, days?: number): boolean // null is not stale, it is unknown
```

`loadFrom` also fetches `data/web/meta.json` and sets `meta: null` when that one fetch fails, without failing the load. `last_checked` values are either a date `2026-10-29` or a full ISO time.

- [ ] **Step 1:** Write `freshness.test.ts`: `it('a date three days old is not stale, four days is')`, `it('null is unknown, shown as ?')`, `it('meta null gives an empty list')`, `it('accepts both a bare date and an ISO time')`.
- [ ] **Step 2:** Run it. Expected: FAIL, module missing.
- [ ] **Step 3:** Implement `lib/freshness.ts` and the load change. Run tests. Expected: PASS. Commit "Freshness of the data, loaded from meta.json".
- [ ] **Step 4:** Design Workflow 1 to 4 (21st: a popover or tooltip). Build the corner per spec 6.5: a dot plus the flights age, amber when any type is stale, a popover on hover or focus listing each type with its date in mono, and `?` when unknown. Opens on focus too, closes on Escape.
- [ ] **Step 5:** Design Workflow 5 and 6. Typecheck and test both apps. Commit "Freshness corner in the header".

## Wave 3 (after B, C and F are merged)

### Task G: Ask Claude

Branch `redesign/g-ask-claude`. Files: new `planner/src/lib/claudeTask.ts` and `claudeTask.test.ts`, new `planner/src/components/AskClaudeSheet.tsx` and `AskClaudeSheet.css`, `planner/src/screens/TripDashboard.tsx` (fill `.dash-actions-extra`, add Recheck on stale legs).

**Interfaces:**

```ts
export interface LegAsk { from: string; to: string; date: string; flex_days: number }
export interface FlightTask { type: 'flight_prices'; legs: LegAsk[]; name?: string; note?: string; from: 'app' }
export function flightTask(legs: LegAsk[], name?: string, note?: string): FlightTask
export function issueUrl(task: FlightTask, summary: string): string
export function askNowPrompt(task: FlightTask): string
export const ISSUE_BASE = 'https://github.com/Olafcito/latam-trip/issues/new'
```

Format exactly as `docs/claude-tasks.md`: title `[flight_prices] <summary>`, label `claude-task`, body one human line then one fenced json block. The prompt starts with `In the repo Olafcito/latam-trip, run the trip-checklist skill on this task now and write the results back:` followed by the json. Read `docs/claude-tasks.md` before writing the tests.

- [ ] **Step 1:** Write `claudeTask.test.ts`: `it('issue url carries the label and the title format')`, `it('body is one line then a fenced json block that parses back to the task')`, `it('flex days are clamped to 0..3')`, `it('the prompt starts with the ask now sentence')`.
- [ ] **Step 2:** Run it. Expected: FAIL. Implement. Run. Expected: PASS. Commit "Claude flight task builder".
- [ ] **Step 3:** Design Workflow 1 to 4 (21st: sheets `25002`, `31360`, `11442`, steppers `28180`, `29940`. `apple-design` for the bottom sheet drag and flick dismiss).
- [ ] **Step 4:** Build spec 6.5's sheet: right sheet 420px on desktop, bottom sheet with handle on phone, legs from the current trip with a 0 to 3 stepper each, the two long haul legs locked together as one ticket (one stepper for both), a note field, "Add to checklist" opens `issueUrl` in a new tab, "Ask Claude now" copies `askNowPrompt` and opens `https://claude.ai/new`, the button reads "Copied" for 2 seconds. Escape closes, focus is trapped while open and returns to the trigger. Entry points: "Price with Claude" in the trip view head and "Recheck" on a stale leg (opens with only that leg).
- [ ] **Step 5:** Design Workflow 5 and 6. Typecheck and test both apps. Commit "Ask Claude sheet".

## Wave 4 (coordinator)

- [ ] Merge each branch with `git merge --no-ff`, run both apps' checks after each, push.
- [ ] Visual check at 1440 and 390 on Trips home, trip view, pick and the map panel, fix in one batch.
- [ ] Impeccable detector over `planner/src` and `web/src/map/routeMap.css`, the Vercel guidelines and the break-ui pass.
- [ ] `impeccable-finish-reviewer` against the spec's direction contract, apply material fixes, then `impeccable-documenter` writes `DESIGN.md`.
- [ ] Delete merged branches after `git log main..<branch>` is empty. Keep the dev server running on port 5181.
