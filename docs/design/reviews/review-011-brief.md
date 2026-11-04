# Review 011 brief: Booked flight sheet

- Screen: booked flight sheet, part of the flight sheets (slug flight-sheets)
- Date: 2026-11-04
- Shot folder: `docs/design/shots/flight-sheets/2/`
- Purpose: a deliberate cheap test of the roast pipeline itself, one Sonnet prep pass before one Opus review pass, run on the same screen as review-007 for direct comparison

**Important note before the comparison.** The brief for this review was supposed to describe an unchanged screen, so the comparison against review-007 would be clean. It is not unchanged. Commit `4501c87`, dated 2026-11-04 and titled "Build the booked flight sheet and the day view of the trip", touched the booked flight sheet component after review-007 was written on 2026-11-03. The shots in `docs/design/shots/flight-sheets/2/` show a visibly different sheet from the ones in `docs/design/shots/flight-sheets/1/`: a small badge instead of a full width banner, a compact reference row instead of a tall block, structured booking facts instead of free text, and a day picker that now reaches across the whole trip instead of three days. The senior designer should treat this as a review of the current screen on its own terms, not as a before and after of the same build.

## Journey

Taken from review-007's journey column, the steps this screen is judged against.

1. Read the booked ticket, the moment the sheet opens on a booked leg.
2. Find the reference, if Simon needs it for check in or a change.
3. Read what was booked, the airline, seller, price and linked flights.
4. Read the flight, the route, times and duration.
5. Trust a booked leg, moving through the day strip without doubting what is locked.

## Shot list

All shots are at 1440x900 and 375x812 of the trip "Columbia, jul Bolivia, hjem GC" (`ctg-sal-xmas-cbb`), read only, no data changed.

- `01-booked-way-in-1440.png`, `01-booked-way-in-375.png`: the long haul way in, Copenhagen to Cartagena, a two flight connection on one ticket shared with the way home.
- `02-booked-regional-1440.png`, `02-booked-regional-375.png`: a regional leg, Cartagena to San Andres, with a booking reference, a seller and a linked ticket partner.
- `03-booked-way-home-1440.png`, `03-booked-way-home-375.png`: the long haul way home, Guatemala City to Copenhagen, a three flight connection sharing the same ticket as the way in.
- `04-booked-worst-case-1440.png`, `04-booked-worst-case-375.png`: the worst case reached, San Andres to Santa Marta, a connecting regional flight with the most rows of any sheet found (reference, seller, paid amount, linked ticket and a cabin bag allowance), tall enough to need a scroll on both sizes.

## Components on screen

- The booked flight sheet itself: a header with the city pair and the way label (way in, way home or neither for a regional leg), a small green badge for the booked state, the airport pair with local times and the flight line between them, the list of flight segments with carrier and flight number, a block of booking facts (reference, seller, paid amount, linked ticket, cabin bag where present), a files row, and the change and remove booking actions.
- The day picker inside the sheet (the "Day to look at" control), which differs in range between sheets, see candidate issues.
- The day detail list under the day picker, showing what else sits on the chosen day (a check in, a check out, the flight itself).
- The outer date strip on the trip's route list that opens the sheet.
- The route list and itinerary bar behind the sheet, not themselves in scope.

## Decisions and recurring problems that apply

- DES-020, one component per object: the booked sheet should look and behave the same regardless of which leg opened it. See the day picker range finding below.
- DES-023, a booked thing is locked, alternatives sit behind Change booking: the current sheet already follows this shape, worth checking it still holds.
- DES-025, one format for money and durations: money reads as kr with a period thousands separator throughout, durations read as hours and minutes throughout, both appear consistent on these shots.
- DES-026, raw data never becomes user text: the shots no longer show pasted database strings, booking facts are separate structured rows.
- DES-015, one colour one job: the flight line and plane mark still use the gold and amber family that review-010 and Q-001 are already arguing about elsewhere.
- DES-019, the primary action is the one for the journey step: Remove booking is styled in red and sits next to Change booking, both roughly equal weight.
- REC-004, booked versus open weak or missing: the badge is now small and green, worth checking it still reads clearly at a glance against REC-004's complaint.
- REC-012, nights and dates missing or half shown: the "In X, n nights" and "Passing through" facts under the sheet carry this.
- REC-014, raw data leaking into the interface: directly tied to F3 below, see the note on what changed.
- REC-015, the same object has two designs: directly tied to the day picker range finding below.

## Review-007's open findings

All five are still open in the index (no ruling recorded yet). What follows is review-007's own words, not a new judgement.

- F1: the green confirmation header took more attention than the flight, because booked status was a full width banner. Medium priority, suggested shrinking it to a small green check with a Booked label.
- F2: the booking reference block was too tall, a labelled section with large padding. Low priority, suggested one compact row with a copy icon.
- F3: the notes showed raw database text mixing airline, seller, reference, money and other flights, because imported strings were stored as the traveller's notes. High priority, suggested storing booking facts as structured fields and keeping notes for text the traveller writes.
- F4: the flight line and plane were almost invisible, with no duration or zone cue, low contrast and no mark for local time. Medium priority, suggested a stronger line with the duration on it and a local time mark.
- F5: the bottom date strip was crammed and showed a price on a booked day, because the strip was reused unchanged on a booked leg. Medium priority, suggested removing prices from the strip on booked legs or explaining the figure, compare DES-023.

## Candidate issues

Candidates only, not findings. The senior designer judges whether any of these are real.

- The shape of F1, F2 and F3 is no longer present on any of the four shots taken for this review. The badge is small, the reference sits in a compact row with a copy icon, and the booking facts are structured rows (reference, booked through, paid, same ticket, cabin bag) rather than a notes paragraph. Whether this counts as resolved is for the senior designer to call, given the code changed outside this review's control.
- The day picker's range differs between sheets. On the way in and way home shots it shows three days with no way to scroll further. On the regional leg shots it shows the whole trip, Thu 3 Dec through Tue 2 Feb, with Earlier days and Later days buttons. Same control, two different ranges, which is the shape REC-015 and DES-020 already name.
- On the way in sheet, the booked day chip in the outer date strip carries a price ("8,9k"). On the way home sheet, the same chip carries a small icon instead of a price. F5 asked whether a price belongs on a booked day at all, and now the two sheets do not even agree with each other on what replaces it.
- The day picker reaching across the whole trip, with a day detail list underneath showing everything on that day, reads like the idea in Q-005 (a calendar as the backbone, tapping a day shows flights, check ins and activities). Nobody has confirmed whether this was built to answer Q-005 or arrived as a side effect of the day view work in commit 4501c87.
- The worst case shot (San Andres to Santa Marta) does not fit in the viewport at either size without scrolling, and the Change and Remove booking actions sit past the fold on first look at 1440x900.

## Escalation

    {
      "escalation_required": true,
      "reason": "the booked flight sheet was rebuilt after review-007, so this review is not a clean before and after, and the new day picker may already answer an open question",
      "affected_components": ["booked-flight-sheet", "day-strip"],
      "related_decisions": ["DES-020", "DES-023", "DES-026"],
      "related_problems": ["REC-004", "REC-014", "REC-015"],
      "question": "Does the new day picker that reaches across the whole trip count as building Q-005, and should this review score F1, F2 and F3 as resolved, partly resolved or simply superseded by a rebuild nobody asked this review to judge"
    }
