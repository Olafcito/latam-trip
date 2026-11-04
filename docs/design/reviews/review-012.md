# Review 012: One palette for the planner and the web map

- Kind: Design Audit
- Screens: planner Map tab, public web map, trip map, booked flight sheet, way in and way home picker, trips list, map city panel
- Date: 2026-11-04
- Reviewer: senior-designer on Opus, from the record, the code and the shots
- Shots, nine at 1440 wide:
  - `docs/design/shots/map-tab/1/02-map-tab-1440.png`
  - `docs/design/shots/map-tab/1/23-map-fly-in-1440.png`
  - `docs/design/shots/map-tab/1/26-map-gyms-1440.png`
  - `docs/design/shots/map-tab/1/27-map-experiences-1440.png`
  - `docs/design/shots/trip-map/1/01-trip-map-1440.png`
  - `docs/design/shots/flight-sheet/2026-11-04/final-2.png`
  - `docs/design/shots/way-picker/2026-11-04/matrix-final.png`
  - `docs/design/shots/trips-list/2026-11-04/final.png`
  - `docs/design/shots/city/1/25-map-city-panel-1440.png`
- Code read: `planner/src/styles/tokens.css` and every planner stylesheet that reads `--flight`, `--in` or `--booked`, `web/src/map/style.ts`, `web/src/map/layers.ts`, `web/src/map/modeLayers.ts`, `web/src/map/routeMap.css`, `web/src/map/modes.css`
- Journey: read the trip on the map, pick a way in or out, check what is booked, find a gym or an experience near a stop, notice that something needs attention
- Question: Q-001 with REC-018, REC-019 and DES-015. One palette has to settle flight, selected, planned, booked, primary action, layer markers, rating and warning across both apps, because FEAT-001 needs colours for selection, booked, layer markers and the mode vocabulary and its section 8 waits on this answer.

One limit of the evidence. The five map shots are from 2026-11-03 and the map code has moved since: the reach network is now a neutral grey and the trip line has a casing and chevrons. Where a shot and the code disagree, the finding says which one it rests on.

## Earlier findings, checked

| Earlier finding | What it said | Status | Evidence |
| --- | --- | --- | --- |
| review-008 F1, critical | The trip route cannot be told from the connection network, both in one yellow dash family | Partly resolved | The code draws the reach network in a neutral grey (`REACH`) and gives the trip a casing and chevrons. The full network layers still draw in the saturated mode hues, and the trip flight leg is solid gold while the network flight is dotted gold, so pattern and saturation still do not say in the trip. The shots predate the change and show the old state. Continued as F2 |
| review-010 F4, medium | Orange carries destinations, connections, selection, prices and indicators | Open | Every shot shows gold doing several jobs at once. Continued as F1 |
| review-010 F6, medium | Dotted orange lines read as an airline network even for bus and boat | Partly resolved | The network layers now draw ground solid, boat dashed and flight dotted, and the trips list route chain draws the same three patterns. The trip line on the map breaks the rule for flights. Continued as F2 |
| review-011 F5, low | Green carries booked, the card edge, the paid amount, the selected day and a dropzone border | Partly resolved | The paid amount is in the text colour now. Green still means fly in, cheaper day, success and in the trip elsewhere, see F3 |
| review-006, further finding | Yellow means four things | Superseded by F1 | The count is now nine jobs, not four |
| review-007 F4, colour part | The flight line is gold, waiting on Q-001 | Answered by this palette | Gold stays on the flight line, which is the one job it keeps |

## Observations

1. Gold `#F2B544` is the only accent in either app. On the Map tab shot it is at once the flight network, the trip flight legs, the airport diamonds, the stop number discs, the selected place label, the Flight layer dot, the filled Save trip button and the stale freshness dot.
2. In the planner CSS `var(--flight)` serves nine jobs: flight, focus ring and text caret, the primary button, warning marks, the open or partial tone, every selected state (day chips, picker tiles, segment buttons, the selected trips row, the compare check), the best tier in the way picker grid, saved and near marks, and inline links such as Add reference. In the web map CSS it also colours prices, the current option card, the plan cursor and the range slider fill.
3. There is no accent, selected, warning, saved or rating token in `tokens.css`, and no booked, selected or warning key in the map's `C` object. Every non flight job reaches gold because gold is the only token there is.
4. Two greens sit very close together: `--in #58D68D` for fly in and `--booked #4ADE80` for booked. Between them they mean fly in, booked, cheaper day, success message, in the trip and the booking submit button. On the trips list shot the fly in city name and the booked count chip are the same green to the eye.
5. The gym score borrows the mode hues. Top is the bus teal, middle is the flight gold, in `SCORE_COLOUR` and in `modes.css` (`.tier-top`, `.tier-mid`). On the city panel shot the training chips are filled gold, the same gold as the flight lines on the map beside them.
6. Fly home is orange `#FF8A4C`, close in hue to the flight gold. On the Map tab shot the fly home ring and the gold stop discs read as one family.
7. Selection has five looks: a gold fill (the day chip, the way picker day), a gold inset ring (picker tiles), a gold left bar with a gold tint (the trips row), a gold label and dot on the map, and a light lift (the Best and Cheapest segmented control, the layer toggle). The light lift is the only one that does not borrow a meaning.
8. Saved has two looks. In the experiences panel it is gold text with a gold bookmark, on the map it is a white circle, and in code the bookmark badge is filled with flight gold.
9. Things that work and must survive: the three mode hues, the pattern per mode in the trips list route chain, the booked green check and card edge on the booked sheet, the neutral experience clusters, the neutral reach network and the three step shape of the gym score.
10. A record slip. FEAT-001 section 8 and its open list call REC-018 and REC-019 "Q-018, Q-019". No such questions exist. The spec should name the REC ids.

## Findings

| Id | Finding with its shot | Root cause and source area | Kind | Impact | Journey step | Scope | Priority | Fix as a task | Relation to earlier reviews |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | Gold means flight and eight other things at once: selected, primary action, warning, open, best tier, saved, links and stop numbers. Every shot shows it, most densely the Map tab (02), the way picker (matrix-final) and the city panel (25) | Design system. `--flight` is the only accent token and the CSS of both apps reads it directly for jobs that are not flight | Semantic inconsistency | Simon cannot tell from colour whether a gold thing is a flight, the thing he selected, the button to press or a warning. Colour stops carrying meaning on every screen, which is what P-001 relies on | All five steps | Design system, both apps | High | Add the tokens in the Proposed palette below to `tokens.css` and `routeMap.css`, then move every non flight use of `--flight` to its job token, one stylesheet at a time | review-010 F4, review-006, REC-005, REC-018 |
| F2 | The trip and the network are not told apart by a rule. The shots (02, 23, trip-map 01) show both in gold. The code now greys the reach network, but the full network still draws in saturated mode hues, and the trip flight leg is solid while the network flight is dotted | Map layers in `layers.ts`: `routeLayer` takes the mode hue for the network, `trip-flight` has no dash | Usability problem | Reading the route is the map's core job. When the network is as saturated as the trip, and when a flight changes pattern between network and trip, Simon cannot see at a glance which lines are his | Read the trip on the map | Map layers, web map and planner Map tab | High | Draw every network line in `--reach` with its mode pattern. Draw the trip in the mode hue with the same pattern, heavier and cased. Give `trip-flight` the network's dot pattern | review-008 F1, review-010 F6, REC-019, REC-013 |
| F3 | Two near identical greens mean fly in, booked, cheaper day, success, in the trip and a submit button. On the trips list (final) the fly in city and the booked chip share a green, and in the way picker (matrix-final) the in the trip cell is outlined in booked green | `--in` and `--booked` are two tokens for one perceived colour, and `.fl-day[data-low]`, `.bf-go`, `.matrix td[data-own]` and the success lines borrow them | Semantic inconsistency | A fly in that is green reads as booked when it may not be. A cheaper day that is green reads as a booked day. Booked is the fact Simon most needs to trust | Check what is booked | Design system, planner | Medium | Keep green for booked only. Take fly in off green (see the palette), move cheaper to a marker shape, success to a check glyph in the text colour, in the trip to a dot mark, and the booking submit to the primary action style | review-011 F5, review-008 Keep (reopened), REC-004 |
| F4 | The gym score uses the bus teal for top and the flight gold for middle (26, city 25) | `SCORE_COLOUR` in `modeLayers.ts` and `.tier-*` in `modes.css` map the score to mode tokens | Semantic inconsistency | Once layers sit on the trip (DES-030, FEAT-001), a gold gym cluster sits next to a gold flight line and a teal one next to a bus line. The score reads as a mode | Find a gym near a stop | Map layers and the city panel | Medium | Give the score its own three step ramp (`--score-top`, `--score-mid`, `--score-low`) and point `SCORE_COLOUR` and `.tier-*` at it. Keep the three step shape | review-008 Keep (structure kept, hues changed), REC-018 |
| F5 | The warning is flight gold. On the booked sheet (final-2) the header warning triangle and text are the same gold as the plane and its line below it. The stale freshness dot on the Map tab (02) and trip map (01) is gold too | `.warnmark`, `.dash-warn`, `.cph-warn`, the warn tone of `.pk-flag` and the stale dot read `--flight` | Semantic inconsistency | P-009 says a warning shows only when something needs attention. In a colour it shares with half the screen, it does not stand out when it does | Notice that something needs attention | Design system, both apps | Medium | Add `--warn` and move every warning mark to it, always with the triangle glyph. Never use it on the map lines | REC-018, DES-022 |
| F6 | The primary action is filled gold: Save trip (02, trip-map 01), New trip (trips-list final), the start and end button (matrix-final). The focus ring is gold too | `.btn.primary`, `.pbtn.primary`, `.ap-save`, the skip link and every `:focus-visible` read `--flight` | Excessive prominence and semantic inconsistency | The loudest object on each screen wears the flight colour, so a button competes with the route. On screens where Save trip is the wrong loudest action (DES-019) gold makes it louder still | Every step | Design system, both apps | Medium | Add `--accent` and `--accent-ink`, move the primary button and focus to them. Which button is primary stays DES-019's call | REC-006, DES-019 |
| F7 | Selection has five looks: gold fill, gold ring, gold bar with tint, gold label on the map, and a light lift (02, matrix-final, trips-list final, 27) | No selection token and no selection rule, so each component picked the nearest strong colour | Semantic inconsistency | Simon has to learn selection per component. Where the selection is gold it also reads as flight or as an action | Pick a way in or out | Component, both apps | Medium | One selection form everywhere: a 2 px ring in `--sel` on a `--surface-3` lift, with a shadow on the map. The Best and Cheapest control already does this and is the model | review-009 F5, DES-029, DES-015 |
| F8 | The web map cannot draw booked or selected without gold. `C` has no booked, selected or warning key, `routeMap.css` has no `--booked`, and the web `--faint` is `#5F7785` where the planner's is `#7F97A4` | Two token sets that drifted, map layers read only `C` | Semantic inconsistency | FEAT-001 needs booked legs and a selected place on the map. Without tokens the builder will reach for gold again | Check what is booked, on the map | Code, web map | Medium | Mirror the job tokens into `C` and `routeMap.css` with the same names and values as `tokens.css`, and align `--faint` | REC-018 |
| F9 | Saved has two looks: gold text and a gold bookmark in the experiences panel, a white circle on the map, and a bookmark badge filled with flight gold in code (27) | `modeLayers.ts` uses `C.flight` for saved, `.mc-saved` reads `--flight` | Semantic inconsistency | Small. Saved is learnable, but gold here again reads as flight or selected | Find an experience near a stop | Map layers and the experiences panel | Low | Saved is a filled bookmark glyph in `--saved`, unsaved an outline bookmark in `--muted`, on the map and in the panel | REC-018 |

Critical 0, high 2, medium 6, low 1.

## Proposed palette

The rule behind the table. Hue is spent on the three modes, booked, warning, error and the score, and on nothing else. State that is not one of those is carried by form: a ring, a fill weight, a glyph, a pattern or a lift. On the map, pattern means mode and saturation with weight means in the trip.

| Job | Colour role | Token in `tokens.css` and `C` | Hex | Where it conflicts today |
| --- | --- | --- | --- | --- |
| Flight line | Mode hue, dotted pattern on the network and the trip, heavier and cased on the trip | `--flight`, keep | `#F2B544` | Shares its hue with eight other jobs (F1). The trip flight leg is solid while the network flight is dotted (F2) |
| Bus or ground line | Mode hue, solid pattern | `--bus`, keep | `#6FD3B8` | The top gym score uses it (F4) |
| Boat line | Mode hue, dashed pattern | `--boat`, keep | `#8DB8F2` | None |
| Selected thing | Neutral lift: a 2 px ring on a `--surface-3` lift, a shadow on the map, the rest dimmed per DES-029. Never a fill in a meaning hue | `--sel`, add | `#EAF0F2` | Gold fill on `.fl-day[aria-checked]` and `.wp-d[data-sel]`, gold ring on `.pk-tile[aria-pressed]`, gold bar on `.tt-row[data-selected]`, gold label, dot and ring on the map, the amber `DASH_HI` halo (F7) |
| Saved or in the trip | A filled glyph, not a hue: a filled bookmark on items, a corner dot in grid cells. On the map, the trip line itself | `--saved`, add | `#EAF0F2` | Gold `.mc-saved`, gold bookmark badge on the map, green outline on `.matrix td[data-own]` (F3, F9) |
| Potential or reach | Desaturated, mode pattern kept, markers hollow | `--reach`, add (move `REACH` from `layers.ts` to `C`) | `#8EA2AD` | The full network draws in the saturated mode hues (F2) |
| Booked | Green check and a green card edge, the rest of the chip quiet per DES-014 | `--booked`, keep, and add to `C` and `routeMap.css` | `#4ADE80` | Shared with fly in, cheaper day, success, in the trip and the submit button (F3). Missing on the web map (F8) |
| Planned or picked, still open | The mode chip at full strength with the inline Pick or Book action in `--accent`, per DES-014 | none, uses the mode token | mode hue | Gold `data-tone='part'`, `.tag.draft`, `.tt-tag-open`, the dashed gold plan cursor (F1) |
| Primary action | Light filled button with dark text, one per view. Inline text actions in `--accent` with a glyph (plus, chevron, arrow). Focus ring in `--accent` | `--accent` and `--accent-ink`, add | `#EAF0F2` on `#13202A` | Filled gold `.btn.primary`, `.pbtn.primary`, `.ap-save`, gold focus ring, gold `.bk-row-add` and `.fl-link` (F6) |
| Cheaper or best | A marker shape in the text colour: a down tag glyph for the cheaper day, a small star for the single best option. No hue | none, a glyph in `--text` | `#EAF0F2` | Green `.fl-day[data-low]`, gold `.pk-tile-delta[data-best]` and `.cmp-best`, gold Cheapest label (F1, F3) |
| Rating | Its own sequential ramp in one reserved hue, lighter is better. Number in ink on top and middle, in `--text` on low. No score is hollow | `--score-top`, `--score-mid`, `--score-low`, add | `#C4A7FF`, `#9478D6`, `#5E4F8A` | Gym tiers in teal and gold, the gold way picker top tiers `.matrix td[data-tier]`, the gold training chips (F4) |
| Warning | Reserved attention hue, always with the triangle glyph, never on the map lines | `--warn`, add (takes the hue fly home gives up) | `#FF8A4C` | Gold `.warnmark`, `.dash-warn`, `.cph-warn`, `.pk-flag[data-tone='warn']`, gold stale dot (F5) |
| Gym marker | Score ramp fill with the glove glyph in ink, clusters by best tier, a `--sel` ring when selected | `--score-*` | as rating | Teal and gold clusters (F4) |
| Experience marker | Neutral disc in `--text` with the experience glyph, a filled bookmark badge when saved, neutral clusters | `--text`, `--saved` | `#EAF0F2`, cluster `#2C4452` keep | Saved experiences filled `C.flight` (F9) |
| Training marker | The gym marker. Training in the city panel is gym data and uses the same chip and ramp (DES-020) | `--score-*` | as rating | Filled gold training chips on the city panel (F4) |

Two further moves follow from the table and are part of the proposal.

- Fly in and fly home give up their hues. They are the two ends of the trip, which is a position, so they keep their ring and get a landing glyph and a take off glyph in `--text`. Green then means booked only and orange is free for warning. This reopens the review-008 Keep for green in and orange home. The reason is F3: a green fly in now reads as booked.
- Error stays `--err #FF6B5E`, unchanged.

Contrast checked for the new fills. Ink on `--score-mid` is about 4.7 to 1, ink on `--score-top` about 8 to 1, `--text` on `--score-low` about 6 to 1, ink on `--accent` about 14 to 1.

Taste and usability, kept apart.

- Usability: each job above gets one colour or one form, the score does not borrow a mode hue, the warning hue is used for nothing else, the network is less saturated than the trip, and pattern means mode. These follow from P-001, P-009, Familiarity and the cost findings above.
- Taste: violet for the score ramp, and a light fill for the primary action rather than a reserved action hue. Both are defensible choices among several. A different score hue works as long as it is not a mode hue, not green, not orange and lightness still orders the tiers. A reserved action hue works as long as nothing else uses it, at the cost of one more hue on screen. The light fill follows the Apple pattern of a white prominent button on a dark surface and spends no hue on action, which is why it is proposed.

### Which shot conflicts the palette resolves, and what each needs

No conflict is fixed by changing a token value. Every non flight job points at `var(--flight)` or `C.flight` directly, so each needs its selector or layer moved to the new token. The table sorts them by the size of that change.

| Conflict in the shots | Resolved by the palette | Change needed |
| --- | --- | --- |
| Gold training chips and gold or teal gym clusters (26, city 25) | Yes | Small: the four `.tier-*` lines in `modes.css` and `SCORE_COLOUR` in `modeLayers.ts` point at the score ramp |
| Gold warning triangle above the gold plane (final-2), gold stale dot (02, trip-map 01) | Yes | Small: add `--warn` and move about six warning selectors |
| Filled gold Save trip, New trip and start and end buttons, gold focus ring (02, trip-map 01, trips-list final, matrix-final) | Yes | Small to medium: add `--accent`, move the primary button selectors in both apps and the focus rules in `base.css` |
| Gold Add reference and gold More about link (final-2, city 25) | Yes | Medium: inline action selectors move to `--accent` and each gains a glyph, which is markup |
| Gold selected states in planner components (matrix-final, trips-list final) | Yes | Medium: about nine selectors move to the `--sel` ring and lift |
| Selected place gold on the map, amber picked airport halo (02, 23) | Yes | Map code: `labelPaint`, `place-dot`, `place-ring`, `place-air` and `DASH_HI` in `layers.ts` read `C.sel` |
| Trip line and network in one gold family (02, 23, trip-map 01) | Yes | Map code: `routeLayer` draws in `C.reach` with the mode pattern, `trip-flight` gets the dot pattern |
| Saved as gold text in the panel and a white circle on the map (27) | Yes | Map code and CSS: the bookmark badge reads `C.saved`, `.mc-saved` moves to a glyph |
| Booked cannot be drawn on the web map | Yes | Map code: add `booked`, `sel`, `saved`, `reach`, `warn`, `accent` and the score keys to `C`, and `--booked` to `routeMap.css` |
| Fly in green beside the green booked chip (trips-list final), orange fly home beside gold stop discs (02) | Only with new form | New glyphs: landing and take off marks for the trip ends in the map, the route chain and the pane. Colour alone cannot resolve it, because there is no free hue for the ends |
| Green cheaper day, gold best tile delta, gold Cheapest label (matrix-final) | Only with new form | New glyphs: the cheaper tag and the best star |
| Green outlined in the trip cell in the grid (matrix-final) | Only with new form | New markup: a corner dot in the cell |
| Mode layer pill shows a coloured dot that no longer matches a grey network (02) | Only with new form | New markup: the pill shows a short line sample in the mode pattern |
| Gold stop number discs on the map and in the panel (02) | Partly | They become neutral discs with ink numbers. Whether stop numbers stay at all is a FEAT-001 question, not a colour one |

## Restructuring

- Remove: gold from every job that is not flight, the hues of fly in and fly home, the second green.
- Add: seven job tokens, `--sel`, `--saved`, `--reach`, `--accent` with `--accent-ink`, `--warn` and the three `--score-*`, in `tokens.css`, `routeMap.css` and `C`, with the same names and values in both apps.
- Combine: the gym marker and the training chip into one marker on one ramp.
- Move: selection from colour to form, the neutral lift the segmented control already uses.
- Keeps its place: the three mode hues, the pattern per mode, the booked green check and card edge, the neutral clusters, the neutral reach network, `--err`.

## Why

- P-001, form carries the meaning. A colour can only carry meaning if it carries one. Nine jobs on one gold means the gold carries none.
- Familiarity. Things that look the same must behave the same. A gold button, a gold flight and a gold warning look the same and do not.
- Simplicity, clear hierarchy. The trip is the most important thing on the map, so it is the only saturated line. The network recedes to grey.
- P-009. A warning shows only when something needs attention, which works only if its colour is reserved for it.
- Craft, nothing random. One token set shared by both apps, so the planner and the web map cannot drift again.
- Pre attentive processing. Hue is the fastest channel for a category and lightness the right one for an order, which is why the score is a lightness ramp in one hue and the modes are three hues.
- Restraint. Review-010 asked for meaning, not five new colours. The palette adds one hue, the score violet, and frees one, the second green.

## Fix order

1. F8 first. Add the job tokens to `tokens.css`, `routeMap.css` and `C`. Nothing is visible yet, and FEAT-001 can build on the tokens from day one.
2. F2. The trip and network rule in `layers.ts`, the map's core job.
3. F1 with F6, F5 and F7. Move the primary action, warning and selection selectors off `--flight`. One stylesheet at a time, both apps.
4. F4 and F9. The score ramp and the saved glyph, which FEAT-001 layer markers need.
5. F3. The second green goes, with the end glyphs, the cheaper tag and the grid corner dot. This is the only step that needs new icons.
6. Correct FEAT-001 section 8 to name REC-018 and REC-019 instead of Q-018 and Q-019.

## Recurring problems

- REC-005, one accent carries several jobs. Validated, confirmed with more evidence. Nine jobs in the planner CSS, more in the web map. The palette answers it.
- REC-018, no semantic colour rules for the map. Should move from Flagged to Validated. Review-010 F4, review-006 and review-008 F1 each name it in their own words, and review-011 F5 names its green half. It is the map side of REC-005 and could be merged into it.
- REC-019, a line pattern per mode. Stays Flagged by the letter of the rule, since only review-010 names it as such. It is now partly resolved in code: the network and the trips list chain already draw the three patterns. Recommend merging it into REC-013, the mode vocabulary, which is validated.
- REC-013, mode vocabulary. Confirmed on the map, where the trip flight leg changes pattern from the network.
- Candidate, for the main session to number: two greens with different meanings, fly in and booked, plus cheaper, success and in the trip. Seen on the trips list, the way picker and the flight sheets. Flagged.

## Proposed decisions

DES-015, rewritten, Proposed:

> One colour, one job. Hue is spent only on the three modes (flight gold `--flight`, ground teal `--bus`, boat blue `--boat`), booked (green `--booked`), warning (orange `--warn`, always with its triangle), error (red `--err`) and the score (a violet ramp `--score-top`, `--score-mid`, `--score-low`). Everything else is carried by form. Selected is a neutral lift, a 2 px ring in `--sel` on a raised surface, and the rest dims per DES-029. Saved is a filled glyph. Potential is desaturated `--reach`. The primary action is the one light filled button in a view (`--accent` on `--accent-ink`), and focus uses it too. Cheaper and best are marker shapes, not colours. Open legs keep their mode colour with an inline action, booked legs go quiet with a green check, per DES-014. On the map, pattern means mode (flight dotted, ground solid, boat dashed) and saturation with weight means in the trip. Fly in and fly home are positions, marked by a ring with a landing or take off glyph, not by a hue. Both apps share one token set with the same names and values. One mode vocabulary is used on map, bar, timeline and chips, and the phone never drops a glyph.

Alternatives: a reserved action hue instead of the light fill (one more hue, taste). A neutral lightness ramp for the score (rejected, a low score would read as dimmed or potential on the map). Keep green for fly in and give booked a different hue (rejected, booked green is learned and kept in review-006 and review-011).

## Q-001 answer, for the design log

Answered 2026-11-04 by review-012, Proposed. Gold means flight and nothing else, so the trip map roast was right about the hue, and the flight sheets and city roasts were right about the jobs but wrong to give them gold. Selected is a neutral lift, a ring in `--sel` on a raised surface with the rest dimmed, never a colour. Planned or open keeps its mode colour with an inline action, and booked is green and only green. The primary action is the single light filled button in a view (`--accent`), which also carries focus. Warning takes a reserved orange (`--warn`) that fly home gives up, rating gets its own violet ramp (`--score-*`) instead of borrowing the bus teal and flight gold, and saved, cheaper and best are shapes, not hues. On the map, pattern means mode and saturation means in the trip, with the network in a neutral `--reach`. DES-015 is rewritten to match and stays Proposed until Simon accepts it.

## Verdict and Keep

Verdict: the colour system fails because it has one accent. Gold means flight and eight other things on every screen, the two greens mean six things, and the score borrows two mode hues. The fix is not new colours but new jobs: seven tokens that mostly alias the text colour, one new hue for the score, and selection moved to form. No conflict is fixed by a token value alone, because every non flight job reads `--flight` directly, so the work is a selector pass in both apps, a layer pass on the map and four new glyphs. Critical 0, high 2.

Keep:

- The three mode hues and the pattern per mode in the trips list route chain.
- The booked green check and card edge on the booked sheet, and the paid amount in the text colour.
- The light lift of the Best and Cheapest control and the layer toggle, the model for every selection.
- The neutral experience clusters and the neutral reach network.
- The three step shape of the gym score, with new hues.

## Rulings

