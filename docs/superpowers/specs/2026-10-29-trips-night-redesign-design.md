# Trips, at night: the redesign of the Trips pane

Status: written while Simon was away. Every decision below that he did not state himself is marked **(my call)** so he can overturn it.

## 1. Intent

Simon likes the route map: the night ground, the amber flights, Bricolage Grotesque with IBM Plex Mono numbers. He does not like the Trips pane. It reads as a second, generic app glued onto the map: light sand background, white cards with soft shadows, Inter, blue links, coloured pills. In his words it looks vibe coded, and he does not want grey, soft, white or sand colours anywhere. He liked the night look much better.

The aim is one app with one look. The Trips tab, the trip view, the in and home picker and the trip panel that sits on the map all move to the map's night world, and the Trips home becomes something only this app could show: every trip as a line on one shared calendar.

Success looks like this: Simon opens Trips on his laptop or phone and can see at a glance which trip lands when, how long he stays where, what it costs and what is still unknown, without reading a paragraph. Nothing on screen looks like a template.

## 2. What is there now (the critique)

Screens reviewed at 1440 wide: Trips home, the trip dashboard, the Map tab.

| Where | What is wrong | Why it matters |
|---|---|---|
| Whole Trips tab | Light #f4f2ee page, white cards, 14px radius, two layer shadows | Reads as a different product from the map next door. This is the main complaint. |
| Type | Inter everywhere, numbers in the same face as words | The map already set Bricolage plus Plex Mono. Prices and times lose their scan line. |
| Colour | Blue links, blue IN pill, green HOME pill, orange, purple, pink error band | Four accents, none of them the map's. Nothing says flight equals amber. |
| Trips home | Cards with a route as a dotted list of names, a facts strip, four buttons each | The route, the dates and the length of each stay are the point of a trip and they are text. Six cards look identical at a glance. |
| New trip | Dashed tile with a plus in a circle | The most generic empty tile there is. |
| Trip dashboard | Hero strip of seven equal facts, a list of white rows, a side column of cards | No hierarchy. 63 days in La Paz and 0 days in Santa Cruz have the same visual weight. |
| Warnings | Full width pink band | Shouts, and the pink is outside every palette in the app. |
| WayCard | Light blue and light green tracks with dashed lines | The one place that draws time is in pastel. |
| Map trip panel | Paper #F3EFE6 panel with ink text and ink buttons | The only light surface on the map. Simon calls it the trips pane he does not like. |
| Pick screen | Blue heat ramp on a light matrix | Again off palette. |

## 3. The direction contract

Six blocks, kept for the finish reviewer.

1. **World.** Night timetable. The planner is a departures board for one person's two months: dark ground, hairlines, numbers in mono, one warm accent. No paper, sand, grey or white surfaces anywhere in the planner or the map panel.
2. **Mode.** Operate. Scanability, consistency and the real scene (a laptop at home, a phone in a hostel) outrank expression. Brand lives in the details: the arc of a flight, the moon on a night landing, the amber edge on a stale price.
3. **Palette.** The map's own tokens, nothing new except a coral for errors.
4. **Type.** Bricolage Grotesque for words, IBM Plex Mono with tabular figures for every number (kr, times, dates, hours, counts). Inter is dropped.
5. **Structure.** Hairlines and spacing instead of cards. Surfaces differ by a step in luminance, never by shadow. Shadows only on floating things (sheets, popovers).
6. **Motion.** Fast and quiet: ease out, under 250ms, press scale 0.97, hover only on devices that hover, nothing on keyboard actions, everything off under reduced motion.

## 4. Foundations

### 4.1 Tokens

Defined once in `planner/src/styles/tokens.css` on `:root` for the planner. The map keeps its own `.rmap` scope with the same values.

| Token | Value | Use |
|---|---|---|
| `--ground` | `#0B1720` | page background (the map's ground) |
| `--surface` | `#0F1F29` | raised regions: header band, sticky bars, sheets, table heads |
| `--surface-2` | `#14252E` | hover rows, inputs, selected segment (the map's land) |
| `--surface-3` | `#1A2E39` | pressed or active rows |
| `--line` | `#1C3340` | hairlines between rows |
| `--line-2` | `#24404D` | control borders, stronger dividers (the map's chrome line) |
| `--text` | `#EAF0F2` | primary text |
| `--muted` | `#93A7B2` | secondary text |
| `--faint` | `#5F7785` | tertiary text, axis ticks, "?" |
| `--flight` | `#F2B544` | flights, the primary action, focus ring, stale edge |
| `--flight-ink` | `#13202A` | text on amber |
| `--bus` | `#6FD3B8` | ground legs |
| `--boat` | `#8DB8F2` | boat legs, night landing moon |
| `--in` | `#58D68D` | the way in (as on the map) |
| `--home` | `#FF8A4C` | the way home (as on the map) |
| `--err` | `#FF6B5E` | errors only, always with an icon and words |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | entering, pressing |
| `--ease-drawer` | `cubic-bezier(0.32, 0.72, 0, 1)` | sheets |
| `--t-fast` `--t-med` `--t-slow` | `120ms` `180ms` `240ms` | durations |

Country colours (`lib/colors.ts`) stay as they are in hue, but on night they are used as a 2px top stroke at full strength plus a fill at about 22% alpha, so they read as tints, not blocks. The builder may lift lightness slightly if a colour falls under 3:1 against `--ground`. **(my call)**

Warnings use amber with a warning glyph. Amber therefore means "flight" as a stroke and "look at this" as an edge with a glyph. The two never appear as the same shape. **(my call)**

### 4.2 Type scale

Bricolage Grotesque (already loaded, opsz 12 to 96, weights 400 to 800) and IBM Plex Mono (400, 500, 600). Remove Inter from `planner/index.html`.

| Role | Face | Size and weight |
|---|---|---|
| Display (trip name on the trip view) | Bricolage | 28px, 700, tracking -0.02em |
| Title (row name, section) | Bricolage | 15 to 16px, 600 |
| Body | Bricolage | 14px, 400 |
| Small | Bricolage | 12.5px, 400 |
| Number large (total) | Plex Mono | 22 to 28px, 500 |
| Number | Plex Mono | 13px, 500 |
| Label | Plex Mono | 11px, 500, lowercase, `--faint` | 

Labels are lowercase mono instead of the current uppercase tracked Inter labels. **(my call)**

### 4.3 Primitives

- **Buttons.** `.btn` is transparent with a `--line-2` hairline and `--text`. `.btn.primary` is filled `--flight` with `--flight-ink` text, at most one per view. `.btn.link` is `--muted` text that turns `--text` with an underline on hover. No blue anywhere. All buttons scale to 0.97 on press over 120ms. Minimum hit area 36px on desktop, 44px on touch.
- **Segmented control.** A hairline group, the selected segment on `--surface-2` with `--text`, sliding thumb over 180ms ease out (find a 21st segmented control, adapt to CSS without new dependencies).
- **Tags.** Replace pills with inline mono tags: `#1`, `mine`, `draft`, `one ticket`. Text colour carries meaning, no filled backgrounds except the amber draft dot.
- **Tables.** Hairline rows, mono numbers right aligned, sticky head on `--surface`, row hover `--surface-2` (only on hover capable devices).
- **Focus.** `outline: 2px solid var(--flight); outline-offset: 2px` on `:focus-visible` for every interactive element.
- **Icons.** The map's icon set (`@map/map/icons` plus `components/icons.tsx`), stroke icons at 13 to 16px, `currentColor`.

### 4.4 Shell

The header becomes one quiet band: wordmark "LatAm" in Bricolage 600 with the date span in mono beside it, the tabs as text tabs with an amber 2px underline that slides between them, and on the right the freshness corner (workstream F). The `.n` number badges go. The whole page is `--ground`, and the Map tab's frame keeps its 14px radius.

## 5. The component inventory

Everything that needs a design, grouped by surface. The workstream that owns each item is in brackets.

**Foundations [A]:** tokens, type scale, buttons, segmented control, tags, tables, inputs and selects, checkboxes, focus ring, header band, tabs, loading and error screens, empty state line.

**Trips home [B]:** time axis (months, week ticks), trip row, the trip strip (stays, flights, ground legs, night moon, self transfer split, long-haul ends), right margin numbers, row actions (open, map, compare, delete with inline confirm), sort control, new trip button, compare selection and compare tray, export and import, empty state, phone layout.

**Trip view [C]:** back link, display name with rank or mine tag, actions (build on the map, save, export), the trip strip at full width with date ticks and stop labels, warnings as hairline rows with an edge, the leg table (one ticket bracket for the two long-haul legs with a lock glyph, stop rows, hop rows, checked dates with stale edge), the ledger (costs and totals), days per country bar, way in and way home cards (WayCard on night), the mini map on night, phone layout with a sticky total bar.

**Pick in and home [D]:** matrix heat ramp on amber, row and column highlight, filters, options table, expanded option, counts.

**Map trip panel [E]:** the paper panel, plan panel, folded mini panel, trips list panel, way panel, buttons and links in it, all on night.

**Freshness [F]:** freshness corner in the header, stale threshold logic, stale edges.

**Ask Claude [G]:** "Price with Claude" entry, the sheet (side on desktop, bottom on phone), per leg flex stepper 0 to 3, the long-haul lock, "Add to checklist", "Ask Claude now" with copied state, recheck entry from a stale leg.

**Later, not in this round:** experiences browser, saved lists with outbox, the checklist view of done tasks, the place panel's photo credit layout. These need their own design pass and data that is only partly there.

## 6. The new Trips concept: The Timetable

Claude Design proposed the Timetable. This is that idea, kept where it works and changed where the data or the screen argue against it.

### 6.1 Trips home

One shared horizontal time axis from two days before the earliest landing to two days after the latest return across all listed trips. Month names in mono at the top, a hairline tick per week, a faint band on weekends is not used (noise). **(my call)**

Each trip is one row on a three column grid: name column (about 240px), strip (flexible), numbers margin (about 300px).

- **Name column.** Trip name in Bricolage 15px 600, below it a mono line with the tag: `#1` for ranked seeded trips, `mine` for trips Simon built, and an amber dot plus `not saved` for the unsaved draft.
- **The strip.** Each stay is a segment from arrival to departure, tinted with its country colour (top stroke plus 22% fill). The stay's place name sits inside the segment when it fits and is hidden when it does not (the full list is in the row's accessible name and tooltip). Hops between stays sit at their own time: a flight is a small amber arc rising above the strip (minimum width 10px so short flights stay visible), a ground leg is a mint tick, a boat is a dashed blue tick. The long-haul way in is an amber arc entering from the left edge of the row with a small plane glyph, the way home leaves to the right. A night landing gets a small moon over its arrival point, and a self transfer gets a split mark on the arc.

  Claude Design wanted flight arcs whose width shows hours. On a 70 day axis an 18 hour flight is about 8px wide on a laptop, so width cannot carry hours. Hours go to the margin instead and the arc only shows when. **(my call)**
- **Numbers margin.** Plex Mono, right aligned columns: all in kr (the largest number in the row), hours in the air, nights in Latin America, number of stops. Unknown is `?` in `--faint`, never 0.
- **Row actions.** The whole row opens the trip view. On the right, small icon buttons: show on the map, compare (a checkbox), delete. They are `--faint` and turn `--text` on row hover or focus. On touch they are always visible. Delete confirms inline in the row ("Delete? yes / no") rather than in a dialog.
- **Toolbar above the table.** A segmented sort (rank, price, air time), the count of trips in mono, and the one primary amber button "New trip". Export and import are link buttons under the table.
- **Compare.** Ticking up to three rows slides up a compare tray from the bottom edge (sticky, `--surface`, 240ms drawer curve). It shows the chosen trips side by side as a hairline table, the best value per line marked with an amber dot. It can be cleared.
- **Empty state.** One line in `--muted` ("No trips yet. Start with the way in and the way home.") and the New trip button. No illustration.
- **Phone (under 640px).** Each row stacks: name and total on one line, the strip full width below it with the axis compressed to month labels, then a mono line with hours, nights and stops. Claude Design proposed vertical time with one trip per swipe. That hides comparison, which is the point of the home screen, so rows stay stacked and scroll vertically. **(my call)**

### 6.2 Trip view

- **Head.** "Trips" back link, then the trip name at display size with its tag, and on the right: Build on the map (ghost), Save (primary amber while there are unsaved changes, plain "Saved" text otherwise), Export JSON (link). Price with Claude joins here in workstream G.
- **Strip.** The same trip strip component as the home row, full width and taller (about 64px), with date ticks per week and every stop labelled. This replaces the seven fact hero.
- **Key numbers.** One mono line under the strip: total kr large, then lands, flies home, nights, stops, flights, hours in the air, small.
- **Warnings.** Hairline rows with a 2px left edge (amber for warn, coral for error) and a glyph. No filled bands.
- **Two columns on desktop.** Left, the leg table. Right, the ledger, which is sticky.
- **Leg table.** Columns: n, from and to, date, times, hours, price, checked. The long-haul way in is the first row and the way home the last row, joined by a bracket in the left gutter with a lock glyph and the note "one ticket, 7.850 kr" when they are one ticket. Stop rows carry the place, the country dot, the nights and the dates. Hop rows sit between stops with the mode glyph, the operator, the times, the hours and the price. Checked shows the observed date in mono, and a row whose price was checked more than three days ago gets an amber left edge. Unknown values are `?`.
- **Ledger.** Costs grouped as now (long-haul tickets, regional flights, flight tickets total, bags, hub nights, ground), the total in large mono at the bottom, then the days per country bar (country tints, labels in mono), the way in and way home cards on night, and the mini map on night.
- **Phone.** One column. The ledger collapses into a sticky bottom bar showing the total, which expands upward as a sheet.

### 6.3 Pick in and home

The matrix ramp moves to amber on night: empty `--surface`, then amber at about 15%, 30%, 60% and full, with `--flight-ink` text on the two strongest steps. The selected cell gets a 2px `--text` ring. Row and column highlight use `--surface-2`. Filters and the options table use the shared primitives. The expanded option sits on `--surface`.

### 6.4 Map trip panel

The panel on the map changes from paper to night: background `--surface` (`#0F1F29`, solid) with a `--line-2` hairline border, text `--text`. Wherever the paper design used ink as a filled background (primary buttons, the selected direction, the finish button, dark trip buttons) it becomes amber with `--flight-ink` text. Paper hover colours become `--surface-2`. The map canvas, its layers, markers, legends and chips do not change. This lives in `web/src/map/routeMap.css` and so also changes the web app's panel, which is wanted.

### 6.5 Freshness and Ask Claude

- **Freshness corner.** In the header, right side, mono and small: a dot plus "flights 1 d". The dot and text turn amber when any tracked type is older than three days. A hover or focus popover lists each type with its last checked date. Missing values show `?`.
- **Ask Claude sheet.** Opened from "Price with Claude" on the trip view or from a stale leg's recheck button. Desktop: a 420px side sheet from the right. Phone: a bottom sheet with a drag handle that dismisses on a downward flick. It lists the legs of the current trip with a flex stepper (0 to 3 days) each, the two long-haul legs locked together as one ticket, an optional note field, and two actions: "Add to checklist" (opens the prefilled GitHub issue in a new tab) and "Ask Claude now" (copies the prompt and opens claude.ai/new, the button shows "Copied" for two seconds). The task format, issue link and prompt follow `docs/claude-tasks.md` exactly. The app never offers booking.

## 7. Constraints

- Plain sentences in UI text and docs. No semicolons as separators, no em or en dashes. Kroner as `6.494 kr`, local clock times, hours as `16h 10m`, unknown as `?`.
- No booking links, no logins. Photos always show credit and licence.
- No new runtime dependencies. No Tailwind, no shadcn runtime, no framer-motion, no vaul. 21st.dev components are a reference: read them with the 21st MCP and rebuild the parts we need in plain React and CSS on our tokens.
- `data/web/` and `data/saved_trips.json` are generated and never edited by hand.
- Never commit a key.
- `cd web && npm run typecheck && npm test` and `cd planner && npm run typecheck && npm test` pass before every commit that touches an app.
- The Map tab's map canvas look does not change.

## 8. Anti-goals

It fails even if it works when: any light, sand, grey or white surface remains in the planner or the map panel. Cards with shadows come back under another name. Blue links remain. Numbers are set in Bricolage. A screen needs a paragraph to explain itself. Motion is noticed rather than felt.

## 9. Workstreams

Each is one branch and merges into `main` as a single merge commit, so any one can be reverted with `git revert -m 1 <merge>` without touching the others. A must land first because every other stream builds on its tokens and its CSS file split.

| Id | Branch | Owns | Depends on |
|---|---|---|---|
| A | `redesign/a-night-foundations` | tokens, base CSS, primitives, shell and tabs, CSS split into per screen files, Inter removed | none |
| B | `redesign/b-timetable` | Trips home: axis, rows, compare tray | A, S |
| S | `redesign/s-trip-strip` | `lib/strip.ts` with tests, `TripStrip` component | none |
| C | `redesign/c-trip-view` | TripDashboard, WayCard, TotalsPanel, MiniMap on night, leg table, ledger | A, S |
| D | `redesign/d-pick-night` | PickScreen matrix and options table | A |
| E | `redesign/e-map-panel-night` | `web/src/map/routeMap.css` panel styles only | A (for values only) |
| F | `redesign/f-freshness` | meta.json loading, `lib/freshness.ts` with tests, header corner | A |
| G | `redesign/g-ask-claude` | `lib/claudeTask.ts` with tests, AskClaudeSheet, entry points in the trip view | A, C, F |

B and C both need the strip, so it is its own workstream S (`redesign/s-trip-strip`) that only adds new files and runs beside A: a pure, tested `stripLayout(data, journey)` in `planner/src/lib/strip.ts` and a `TripStrip` component that draws a layout on a given time domain at `row` or `full` size. B and C start after A and S are merged. The exact interface is in the plan. **(my call)**

## 10. Left to the builder

Exact spacing values inside the scale, icon choices within the existing set, how the arc is drawn (SVG path or CSS), the precise breakpoints between 640 and 1100, the copy of small labels as long as it follows the writing rules, and which 21st component to study for each primitive.
