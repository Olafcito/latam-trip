# Retrospective 001

Date: 2026-11-03. Covers review-001 to review-009, seeded at once.
## Retrospective

Written when seeding eight screens at once. A fresh retrospective is due after every fifth further review.

**Commonest problems.** Seven of eight screens carry prose or instruction lines, six show a weak or missing booked versus open state or a wrong primary action, and five or more show unknowns as zeros or empty chips, one accent colour doing many jobs, or camera and phone control trouble on a map. Those clusters are the same few rules broken in many places, which is good news because a shared fix helps many screens.

**What would help most screens at once.** In order of screens helped for the effort:

1. Delete prose, instruction lines and developer chrome. It is mostly deletion and it touches seven screens.
2. One formatter for money and durations, and the rule that an unknown is never zero. It helps trips list, trip page, way picker, flight sheets, map tab and web map.
3. One booked and open marker with status first on the trip page and the trips list. It fixes the most damaging journey failures on four screens.
4. One phone sheet and map control standard, with no nested scroll and tables turned into cards. It helps seven screens.
5. One camera and selection rule for the maps. It helps trip map, map tab, web map and the city panel.

**Principles emerging.** Status before editing. One colour, one job. The subject fills the frame. A locked thing looks locked. The same object looks the same everywhere.

**What to standardise first.** The shared pieces, in order: the money and duration formatter, the unknown state, the booked and open marker, the mode vocabulary with its single flight colour, the phone sheet with detents and its map control column, the nights scaled timeline, and the city component.

## Suggested fix order across all screens

| Rank | Fix | Screens helped | Why here |
| --- | --- | --- | --- |
| 1 | Sweep: remove build chrome, instruction lines, recap sentences and duplicate prose | trip-map, trip-page, city, trips-list, way-picker, flight-sheets, map-tab, web-map | Cheapest, no new design, frees space for the later fixes |
| 2 | Shared formatter for money and durations, and unknown is never zero | trips-list, trip-page, way-picker, flight-sheets, map-tab, web-map | Two critical findings on the trips list rest on it, and the rule is small |
| 3 | One booked and open marker on every leg, plus a status row on the trip page and a current plan card on the trips list | trip-page, trips-list, trip-map, flight-sheets | Fixes the critical status findings on two screens and the booked mark on two more |
| 4 | Phone standard: one sheet with detents, one map control column, ranked cards instead of tables | city, map-tab, web-map, trip-map, way-picker, trips-list, flight-sheets | Most of the high findings on the phone, where the traveller uses the app on the road |
| 5 | Camera fits the subject, selection draws and dims in three tiers | trip-map, map-tab, web-map, city | The core failure of every map screen |
| 6 | Shared nights scaled timeline, used in the trips list, compare tray and trip map bar | trips-list, trip-map, trip-page | Replaces three weak designs with one |
| 7 | Way picker: price in the cell, an apply action, a sticky detail panel | way-picker | Two critical findings on one screen, needs the formatter first |
| 8 | Flight sheets: pick belongs to the leg date, effect preview, locked booked legs, a booking form with the flight | flight-sheets | One critical and four high findings, needs the booked marker first |
| 9 | City: one component for both frames and a stay form with price and dates | city | One critical finding and a design system gain |
| 10 | Colour job pass once the palette question is settled, and the guest view of the web map | trip-map, city, way-picker, flight-sheets, map-tab, web-map | Depends on the open question about gold, yellow and amber |
