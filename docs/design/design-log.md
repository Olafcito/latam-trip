# Design log

Index of the living design log of the planner and the web map. The `ui-roast` skill adds a review file after every roast and updates this index. Observations, hypotheses and decisions are kept apart. A roast finding is an observation. It becomes a rule only through a decision.

Seeded on 2026-11-03 from nine existing roasts covering eight screens. Before shots live in `docs/design/shots/<screen>/<review>/` and are git ignored because they show private data. The full roast reports are in `.superpowers/sdd/2026-11-03-ui-roast/`.

Files: `design-principles.md` (accepted principles), `design-decisions.md` (DES ids), `reviews/review-NNN.md` (one per roast), `reviews/retro-001.md` (retrospective and the cross screen fix order).

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

## Recurring problems

Each is a design system issue seen on two or more screens. Flagged means a candidate the senior designer has not validated yet. Validated here means at least two roasts name it in their own words.

| Id | Problem | Screens | Related decisions | Status |
| --- | --- | --- | --- | --- |
| REC-001 | Developer chrome in the top bar: a build line and a cryptic freshness chip that says nothing to a traveller | trip-page, trips-list, way-picker, map-tab | DES-022 | Validated |
| REC-002 | Prose and instruction lines doing the job of form: hints, recap sentences, usage manuals, explanation paragraphs | trip-map, trip-page, city, way-picker, flight-sheets, map-tab, web-map | DES-001, DES-003, DES-004 | Validated |
| REC-003 | Unknown shown as zero, as the words "unknown" or "not known", or as an empty chip, so estimates read as facts | trip-page, trips-list, flight-sheets, map-tab, web-map | DES-013 | Validated |
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
| REC-015 | The same object has two designs: the city on the trip sheet and on the map panel, the date picker as a strip and as a calendar, the trips and options naming on the web map | city, flight-sheets, web-map | DES-020 | Flagged |
| REC-016 | Inconsistent formats for money and durations: decimal hours next to hours and minutes, kroner written four ways | way-picker, flight-sheets, map-tab, web-map | DES-025 | Flagged |
| REC-017 | A table or grid where ranked cards would let the traveller decide: a 17 by 16 score grid, a 342 row table, a whole trip options table, a compare tray full of equal rows | trips-list, way-picker, web-map | DES-018, DES-021 | Validated |

## Open questions

| Id | Question |
| --- | --- |
| Q-001 | Gold, yellow and amber. The trip map roast says gold means flight and nothing else. The flight sheets roast says yellow means planned or selected with green for booked, and the accent for the single primary action. The city roast says amber is for the primary action and the current selection only. One palette has to settle flight, selected, planned and primary together. Until then DES-015 stays Proposed. |
| Q-002 | The booked banner. The flight sheets roast praises the green Booked bar as obvious at a glance. The outside review of the booked sheet calls it aggressive and wants a small check and label. The choice is between a strong status bar and a quiet mark, and it may depend on whether the sheet is the thing being scanned or the flight details are. |
| Q-003 | Where the network lives on the map. The map tab roast wants the network off by default. The web map roast wants it drawn faintly by default. These may be right for different audiences, a planner steering a trip and a guest reading research, but nobody has decided that. |
| Q-004 | Rank score versus price in the way picker. The roast wants price in the cell with the score as colour. It is not decided whether the score survives at all when Cheapest is chosen. |
| Q-005 | A calendar as the backbone. The outside review of the booked sheet suggests that tapping a day shows everything on that day (flights, check ins, activities, transport). No other roast covers it. It would change the date strip from navigation to a view. |
| Q-006 | Current plan. The trips list roast assumes one trip is the current plan and pins it. It is not decided how a trip becomes current or whether a drafting state exists apart from it. |
| Q-007 | Credentials on the planner sign in. The trips list roast suggests a passkey or a federated button. The web map roast wants sign in out of the guest view. Whether either becomes a product decision is open. |
| Q-008 | Free nights as a stop. The trip page roast wants free nights drawn as their own timeline row. The planner rule says earliest stop wins and spare days are never silent. The rendering of the remainder is open. |
| Q-009 | Compare cap. Compare caps at three. It is not decided whether a side panel, a sheet or the tray is the lasting form on desktop. |
| Q-010 | Ground leg detail. The bus card is thin and uses airport codes. Whether the data for departure times, frequency and pickup exists is unknown, so the fix may need data work first. |

## Counters

- Reviews since last retrospective: 0
- Reviews since last audit: 9
