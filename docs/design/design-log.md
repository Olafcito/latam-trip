# Design log

Index of the living design log of the planner and the web map, kept by the `ui-roast` skill. A Design Audit adds a review file and a row here. A Design Roast is discussed first, and only what Simon accepts from it reaches this log, as a DES, REC or Q entry. Observations, hypotheses and decisions are kept apart. A roast finding is an observation. It becomes a rule only through a decision.

Seeded on 2026-11-03 from nine existing roasts covering eight screens, under the earlier process where every roast produced a review file. Before shots live in `docs/design/shots/<screen>/<review>/` and are git ignored because they show private data. The full roast reports are in `.superpowers/sdd/2026-11-03-ui-roast/`.

Files: `design-principles.md` (accepted principles), `design-decisions.md` (DES ids), `reviews/review-NNN.md` (one per audit, and one per roast before 2026-11-04), `reviews/retro-001.md` (retrospective and the cross screen fix order).

Priority scale: critical means the screen fails its core job, high means a journey step fails, medium and low are polish. The roasts said "load bearing" and "polish", so the mapping is mine.

## Review history

| Review | Date | Screen | Critical | High | Status | Link |
| --- | --- | --- | --- | --- | --- | --- |
| review-001 | 2026-11-03 | Trip map | 1 | 4 | open | [reviews/review-001.md](reviews/review-001.md) |
| review-002 | 2026-11-03 | Trip page | 1 | 4 | open | [reviews/review-002.md](reviews/review-002.md) |
| review-003 | 2026-11-03 | City sheets and map city panel | 1 | 4 | open | [reviews/review-003.md](reviews/review-003.md) |
| review-004 | 2026-11-03 | Trips list, compare tray and sign in | 2 | 3 | open | [reviews/review-004.md](reviews/review-004.md) |
| review-005 | 2026-11-03 | Way in and way home picker | 2 | 3 | open | [reviews/review-005.md](reviews/review-005.md) |
| review-006 | 2026-11-03 | Flight sheets | 1 | 4 | open | [reviews/review-006.md](reviews/review-006.md) |
| review-007 | 2026-11-03 | Booked flight sheet | 0 | 1 | open | [reviews/review-007.md](reviews/review-007.md) |
| review-008 | 2026-11-03 | Planner Map tab | 1 | 4 | open | [reviews/review-008.md](reviews/review-008.md) |
| review-009 | 2026-11-03 | Public web map | 1 | 4 | open | [reviews/review-009.md](reviews/review-009.md) |
| review-010 | 2026-11-04 | Planner Map tab, external roast by Simon, also applies to the web map | 1 | 2 | open | [reviews/review-010.md](reviews/review-010.md) |
| review-011 | 2026-11-04 | Booked flight sheet, a cost test of the two tier pipeline, not a clean before and after since the screen was rebuilt after review-007 | 0 | 1 | open | [reviews/review-011.md](reviews/review-011.md) |
| review-012 | 2026-11-04 | One palette for the planner and the web map, the Q-001 audit across nine shots of seven screens | 0 | 2 | open | [reviews/review-012.md](reviews/review-012.md) |

## Recurring problems

Each is a design system issue seen on two or more screens. Flagged means a candidate the senior designer has not validated yet. Validated here means at least two roasts name it in their own words.

| Id | Problem | Screens | Related decisions | Status |
| --- | --- | --- | --- | --- |
| REC-001 | Developer chrome in the top bar: a build line and a cryptic freshness chip that says nothing to a traveller | trip-page, trips-list, way-picker, map-tab | DES-022 | Resolved. The build line is gone and the freshness corner now renders nothing unless something is stale, with plain words when it does. One shared header, so all four screens are fixed at once. |
| REC-002 | Prose and instruction lines doing the job of form: hints, recap sentences, usage manuals, explanation paragraphs | trip-map, trip-page, city, way-picker, flight-sheets, map-tab, web-map | DES-001, DES-003, DES-004 | Validated |
| REC-003 | Unknown shown as zero, as the words "unknown" or "not known", or as an empty chip, so estimates read as facts | trip-page, trips-list, flight-sheets, map-tab, web-map | DES-013 | Resolved. Every "not known"/"no price" span on all five screens now renders the shared hollow mark, and every total that mixes a known and an unpriced part reads as an outline chip, solid once it is all in. |
| REC-004 | Booked versus open is weak or missing, and booked things still look editable | trip-map, trip-page, trips-list, flight-sheets | DES-014, DES-023 | Validated |
| REC-005 | One accent colour carries several jobs (flight, selected, primary action, booked, cheaper, score) | trip-map, city, way-picker, flight-sheets, map-tab | DES-015 | Validated |
| REC-006 | The wrong action is the loudest: Save trip, New trip, a blind commit, Momondo links | trip-page, trips-list, map-tab, flight-sheets, city | DES-019 | Validated |
| REC-007 | The camera ignores the subject: nothing fits to the thing opened, panels cover it, or the frame fits a bounding box with ocean in it | trip-map, map-tab, web-map, city | DES-016 | Validated |
| REC-008 | Selecting something does not draw it. The rest is not dimmed in tiers and the route of the selection is not shown | trip-map, map-tab, web-map | DES-029 | Validated |
| REC-009 | Phone map chrome: control columns slide off the edge, legends cover zoom buttons, controls cover the busiest part of the map | trip-map, city, map-tab, web-map | DES-017 | Validated |
| REC-010 | Phone sheets behave differently: no grabber, several close buttons, no detents, a full screen takeover instead of a sheet | city, map-tab, web-map, trips-list, flight-sheets | DES-017 | Validated |
| REC-011 | Wide tables and grids on the phone, nested scroll areas, price columns off screen | trips-list, way-picker, flight-sheets, web-map, map-tab | DES-018 | Validated |
| REC-012 | Nights and dates missing or half shown, and length not drawn to scale | trip-map, trip-page, trips-list, city, flight-sheets | DES-021 | Validated |
| REC-013 | Mode vocabulary is incomplete or inconsistent: glyphs dropped on the phone, ground legs without a booked mark, two chip sizes for one thing | trip-map, trip-page, flight-sheets, web-map, map-tab | DES-015 | Validated |
| REC-014 | Raw data leaks into the interface: structured fields pasted into notes, mixed case carrier lists, photo credits at reading size, garbled titles and trip names | trip-page, city, trips-list, way-picker, flight-sheets, web-map | DES-026 | Validated |
| REC-015 | The same object has two designs: the city on the trip sheet and on the map panel, the date picker as a strip and as a calendar, the trips and options naming on the web map, and within the booked flight sheet itself the slot under the card and the action row, each shaped by which leg opened it | city, flight-sheets, web-map | DES-020 | Validated |
| REC-016 | Inconsistent formats for money and durations: decimal hours next to hours and minutes, kroner written four ways | way-picker, flight-sheets, map-tab, web-map | DES-025 | Resolved. The web map's duration helper now carries its own unit and the way panel delegates to it instead of its own decimal hours, so all four screens show hours and minutes, never a decimal, and kroner through the one shared formatter. The two apps' own duration functions still differ by a space before the minutes (`1h05m` against `1h 05m`), both correct, left as a later cleanup. |
| REC-017 | A table or grid where ranked cards would let the traveller decide: a 17 by 16 score grid, a 342 row table, a whole trip options table, a compare tray full of equal rows | trips-list, way-picker, web-map | DES-018, DES-021 | Validated |
| REC-018 | No semantic colour rules for the map: selected, saved, potential, rating and warning share the one orange. Candidate rule from review-010: selected is the strong accent, other saved places are muted, rating has its own treatment, warnings keep a reserved colour | map-tab, web-map | DES-015, Q-001 | Validated. Review-010 F4, review-006, review-008 F1 and review-011 F5 each name it in their own words. It is the map side of REC-005, and review-012 answers both with the one palette. |
| REC-019 | Route lines do not show the transport mode: one dotted style reads as an airline network even for bus and boat. Candidate rule from review-010: a line pattern per mode | map-tab, web-map | DES-015, REC-013 | Flagged. Only review-010 names it as such. Partly resolved in code, the network and the trips list chain draw the three patterns, and the trip flight leg still differs from the network flight. Review-012 recommends folding it into REC-013. |
| REC-020 | Two greens with different meanings: fly in and booked, plus cheaper, success and in the trip, share one hue | trips-list, way-picker, flight-sheets | DES-015 | Flagged by review-012 |

## Open questions

| Id | Question |
| --- | --- |
| Q-001 | Answered 2026-11-04 by review-012, Proposed. Gold means flight and nothing else, so the trip map roast was right about the hue, and the flight sheets and city roasts were right about the jobs but wrong to give them gold. Selected is a neutral lift, a ring in `--sel` on a raised surface with the rest dimmed, never a colour. Planned or open keeps its mode colour with an inline action, and booked is green and only green. The primary action is the single light filled button in a view (`--accent`), which also carries focus. Warning takes a reserved orange (`--warn`) that fly home gives up, rating gets its own violet ramp (`--score-*`) instead of borrowing the bus teal and flight gold, and saved, cheaper and best are shapes, not hues. On the map, pattern means mode and saturation means in the trip, with the network in a neutral `--reach`. DES-015 is rewritten to match and stays Proposed until Simon accepts it. Two taste choices are his: a violet score ramp against a reserved action hue, and the light filled main button. The palette contradicts the review-008 Keep on the fly in and fly home hues, which become positions marked by a ring and a glyph. |
| Q-002 | The booked banner. The flight sheets roast praises the green Booked bar as obvious at a glance. The outside review of the booked sheet calls it aggressive and wants a small check and label. The choice is between a strong status bar and a quiet mark, and it may depend on whether the sheet is the thing being scanned or the flight details are. |
| Q-003 | Where the network lives on the map. The map tab roast wants the network off by default. The web map roast wants it drawn faintly by default. These may be right for different audiences, a planner steering a trip and a guest reading research, but nobody has decided that. |
| Q-004 | Rank score versus price in the way picker. The roast wants price in the cell with the score as colour. It is not decided whether the score survives at all when Cheapest is chosen. Note 11-04: the grid is back with one figure per cell, the score under Best and the price in thousands under Cheapest, and the key beside the sort names the tiers for each. The 11-04 roast of the restored grid asks for both dimensions on the selected cell, so one click shows score and price. That is the open part. |
| Q-005 | A calendar as the backbone. The outside review of the booked sheet suggests that tapping a day shows everything on that day (flights, check ins, activities, transport). No other roast covers it. It would change the date strip from navigation to a view. |
| Q-006 | Current plan. The trips list roast assumes one trip is the current plan and pins it. It is not decided how a trip becomes current or whether a drafting state exists apart from it. |
| Q-007 | Credentials on the planner sign in. The trips list roast suggests a passkey or a federated button. The web map roast wants sign in out of the guest view. Whether either becomes a product decision is open. |
| Q-008 | Free nights as a stop. The trip page roast wants free nights drawn as their own timeline row. The planner rule says earliest stop wins and spare days are never silent. The rendering of the remainder is open. |
| Q-009 | Compare cap. Compare caps at three. It is not decided whether a side panel, a sheet or the tray is the lasting form on desktop. |
| Q-010 | Ground leg detail. The bus card is thin and uses airport codes. Whether the data for departure times, frequency and pickup exists is unknown, so the fix may need data work first. |
| Q-011 | Answered 2026-11-04. Simon ruled C, both, a geographic interface that doubles as the central management dashboard. Recorded as PROD-006 and FEAT-001 (`docs/product/features/FEAT-001-map-dashboard.md`), unblocking the sidebar architecture findings of review-010 (F1 and F3). |

## Synthesis

The last retrospective is `reviews/retro-001.md`, written after review-009. The next one is written when the evidence warrants it, not on a count: several reviews since the last, the same problem resurfacing, decisions that contradict each other, or Simon asking. Since retro-001: review-010, review-011 and review-012.
