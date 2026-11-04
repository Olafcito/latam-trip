# Review 011: Booked flight sheet

- Screen: booked flight sheet, part of flight-sheets
- Date: 2026-11-04
- Brief: `review-011-brief.md`
- Shot folder: `docs/design/shots/flight-sheets/2/`, eight shots, four sheets at 1440x900 and 375x812
- Reviewer: senior-designer on Opus, from the brief and the shots only
- Context: the sheet was rebuilt after review-007, so this is a review of the current screen on its own terms. Findings are observations and no ruling has been made.

One limit of the evidence. The brief says the regional sheet carries a day picker across the whole trip with Earlier days and Later days buttons. The regional shots end at the stay facts under the card, so that picker is not visible in any shot. Everything said here about it rests on the brief's description.

## Review-007 findings, checked against these shots

| Review-007 id | What it said | Status | Did the change help |
| --- | --- | --- | --- |
| F1 | The full width green banner outweighed the flight | Resolved | Yes. A small green check, the word Booked and the date now sit in one quiet line, and the airport codes and times lead the card. The fix is the one review-007 suggested. The attention problem has partly moved down the sheet to the selected day chip, see F5 below |
| F2 | The reference block was too tall | Resolved where a reference exists | Yes. On the regional and worst case sheets the reference is one compact filled row with a copy icon, the strongest row in the facts block, which is right for check in. The two long haul sheets show no reference row at all, so the fix cannot be checked there, see F4 below |
| F3 | Notes showed raw database text | Resolved | Yes. Seller, paid amount, linked ticket and cabin bag are separate labelled rows with their own icons. No pasted strings appear on any of the four sheets |
| F4 | The flight line and plane were almost invisible, with no duration and no local time mark | Resolved, colour still open | Yes. The duration sits above the plane, the line and plane are clearly visible, every header time carries a local mark and the way home arrival carries a plus one day mark. The line is still gold, which waits on Q-001 and DES-015 |
| F5 | The date strip was crammed and showed a price on a booked day | Partly resolved, and superseded on the regional sheet | Mixed. The regional sheet replaced the strip with stay facts and a whole trip picker. The two long haul sheets still carry a three day strip, and on the way in the booked day chip still shows a rounded copy of the paid amount while the way home shows a ticket icon in the same place. This is now F1 below |

On the escalation's scoring question: F1, F2 and F3 should be recorded as resolved, not as superseded. The old shape is gone and what replaced it is what each suggested fix asked for, so calling them superseded would lose the fact that review-007 was right. The record should say they were resolved by the rebuild without a ruling, so nobody reads them as a fix cycle against review-007. Superseded fits only review-007 F5 on the regional sheet, where the rebuild put something different from the suggested fix in that place.

## The roast

1. The card is the best thing in the flight sheets so far. Big codes, city names under them, local times, a duration on the line, segments with layover times, then the booking facts in labelled rows. It reads like a boarding pass, which is the right model. On the phone it holds up without losing a field.
2. Everything around the card is inconsistent. Open the way in and you get a three day strip with a price on one chip. Open the regional leg and you get stay facts and, per the brief, a day picker across two months. Open the way home and you get the three day strip again, running two days past the end of the trip, with an icon where the price was. Same component, three behaviours, chosen by which leg you tapped.
3. The action row comes in two designs. On the long haul sheets Change booking and Remove booking are plain text side by side at the bottom left. On the regional and worst case sheets they are outlined buttons pushed to the two ends of the row. Remove booking is red and as heavy as Change booking in both. A pencil in the card corner is a third edit control with no visible difference from Change booking.
4. Paid followed by For 2 flights is a trap. The way in lists two segments above it, so the phrase reads as those two. The way home lists three segments above the same amount and the same phrase. The phrase actually counts the legs on one ticket, and the full amount is repeated on both sheets that share it.
5. Green does too many jobs. Booked badge, card edge, paid amount, the selected day chip and a dropzone border are all green. The saturated day chip at the foot of the long haul sheets is now the loudest object on the sheet, louder than the Booked badge.
6. The Files dropzone is a large dashed box with a subtext line on every sheet, holding nothing. It is a tolerable empty state, but it is the biggest target on a card where the facts are the point. Taste, not usability.
7. The worst case scroll is fine. Change and Remove fall below the fold at 1440x900, which suits a locked booking whose status comes first. This candidate is rejected.

## Findings

| Id | Finding | Root cause | Impact | Journey step | Scope | Priority | Suggested fix as a task | Relation to earlier reviews |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | The area under the booked card is a different thing on each leg. The way in and way home show a three day strip that cannot move and, on the way home, runs past the last trip day (shots 01, 03). The way in strip puts a rounded paid amount on the booked chip, the way home puts a ticket icon there. The regional sheet shows stay facts on each side and, per the brief, a whole trip picker (shot 02) | Two date controls, the old nearby dates strip and a new trip day view, share one slot and are picked by leg type, while the stay facts that suit a flight appear only on regional legs | Simon cannot learn the sheet. A price on a booked day still invites a rebooking thought. The leg that most needs context, the long haul arrival, gets the least | 5, trust a booked leg | Component, and information architecture for the day view | High | On every booked sheet replace the area under the card with one stay facts row, the nights in the place left and the nights in the place reached, in the regional sheet's form. Remove both date controls from the booked sheet. Keep the day view for the trip level, see the escalation answer | Continues review-007 F5. Evidence for REC-015, DES-020, DES-023 |
| F2 | The edit controls are three and come in two designs. A pencil in the card corner, then Change booking and Remove booking as plain text on the long haul sheets (01, 03) and as outlined buttons at opposite ends on the regional sheets (02, 04). Remove booking is red and equal in weight to Change booking | The action row has no single definition, and the pencil and Change booking overlap without a visible difference | A destructive action is as easy to hit as the safe one on a locked booking. The booked card still looks editable from three places | 5, trust a booked leg | Component | Medium | Define one action row for the booked sheet. Change booking is the one secondary button. Remove booking becomes a quiet item behind it or at the end of the sheet, red only once chosen, with undo. Decide whether the pencil edits the facts and if so give it the facts block only, otherwise remove it | REC-004, the still editable half. REC-015. DES-019, DES-023 |
| F3 | Paid with For 2 flights is ambiguous and repeated. The same full amount appears on the way in and the way home, and For 2 flights sits under a list of two segments on one sheet and three on the other (01, 03, 04) | The amount belongs to the ticket, but it is drawn as a fact of the leg, and the unit word flights means legs here and segments in the list above | Simon may read the cost as per leg, or try to add the two sheets and double it. The label and the segment list disagree | 3, read what was booked | Component | Medium | Merge Paid and Same ticket into one ticket row: the amount, a link mark, and chips for the legs it covers, this leg first and marked as this one. Drop the For 2 flights subtext | New. See the proposed DES-031 |
| F4 | The two long haul sheets show no reference row at all, and nothing marks that it is missing (01, 03). The regional sheets show it as the strongest fact | A missing fact drops its row instead of keeping a slot | The long haul tickets are where check in matters most, and Simon cannot tell whether the reference was never entered or the sheet dropped it | 2, find the reference | Component | Medium | Keep the reference row on every booked sheet. When it is empty, show the row dimmed with a hollow mark and an add action in place, in the style DES-013 proposes for unknown values | New. Relates to DES-005 and DES-013 |
| F5 | Green carries booked, the card edge, the paid amount, the selected day and a dropzone border. The saturated selected day chip outweighs the Booked badge (01, 03) | No colour rule for money and selection inside the booked card | The eye lands at the bottom of the sheet first, which repeats review-007 F1 in a smaller form. Green money reads as a state | 1, read the booked ticket | Design system | Low | Set the paid amount in the primary text colour. If any day control survives F1, mark selection with a neutral lift, not a green fill. Keep green for the booked badge and card edge only | DES-015, Q-001 |

Critical 0, high 1, medium 3, low 1.

## Restructuring

- Remove: both date controls from the booked sheet, the For 2 flights subtext, and the pencil unless it gets a job Change booking does not do.
- Combine: Paid and Same ticket into one ticket row.
- Separate: the day view from the flight. A booked flight sheet answers what is this flight and what is locked. A day view answers what happens on a day. They should not share a sheet.
- Move: the stay facts row to every booked sheet, under the card, where the regional sheet already has it.
- Redesign: the action row as one definition with Change booking as the only button.
- Keeps its place: the card header, the segment list, the reference row, the seller row, the cabin bag row and the files row.

## Why

- Consistency and standards (Nielsen 4) and DES-020. One object, one component. The booked sheet for the way in and for a regional hop must be learnable once, so the slot under the card holds the same thing every time.
- Error prevention (Nielsen 5) and P-002. A destructive action on a locked booking recedes until wanted. Making it equal to Change booking spends the same weight on the rare dangerous path as on the safe one.
- Match between system and real world (Nielsen 2). A traveller thinks of a price as belonging to a ticket. Showing it as the leg's fact, with a unit word that disagrees with the list above it, breaks that model.
- Restraint without hiding, P-005. Dropping the reference row when it is empty hides exactly what step 2 needs. A dimmed slot shows the gap without a sentence, per P-001.
- Visual hierarchy and P-002 again. The first look should land on the flight and its booked mark, not on a filled chip at the foot of the sheet.
- Gestalt proximity. The stay facts sit under the card because they describe its two ends, the place left and the place reached. That makes them the right context for a flight, where a two month picker is not.

## Fix order

1. F1. One area under the card for every leg, with stay facts and no date control.
2. F2. One action row, Change booking as the only button, Remove booking quiet.
3. F3 with F4. The ticket row and the always present reference row, both inside the facts block. F5 after, or with F1 if a day control survives.

## Escalation answer

The new day picker does not count as building Q-005. Q-005 asks for a calendar as the trip's backbone, where the date strip turns from navigation into a view of each day. What the brief describes is a second date control nested inside one leg's sheet, with a whole trip range on regional legs only and a three day window on the long hauls. That is a day view in the wrong place, and it adds a second date control where DES-020 asks for one. It does show that a day list with flights, check ins and check outs reads well, which is useful evidence for Q-005. Q-005 should stay open and be answered at the trip level, on the route list or the itinerary, not inside a booked flight. If Simon wants the day view kept as a prototype of Q-005, it should move out of the booked sheet before it spreads to the open flight sheets.

On F1, F2 and F3 of review-007, see the scoring note above: resolved, recorded as resolved by the rebuild without a ruling.

## Recurring problems

- REC-004, booked versus open weak or missing. Confirmed for the still editable half only. The booked state itself now reads at a glance on every sheet, so the weak marker half does not reproduce here. The three edit controls and the red Remove at full weight do, see F2.
- REC-014, raw data leaking into the interface. Not reproduced on this screen. No pasted strings appear on any of the four sheets. It stays validated from its other screens, and flight-sheets can leave its scope once Simon rules review-007 F3 resolved.
- REC-015, the same object has two designs. Validated, it should move from Flagged to Validated. This one component shows it twice within itself, the slot under the card and the action row, each in two designs by leg type. Together with the city and web map evidence it is systemic.
- New candidate, not entered: a fact shared by several objects shown as if it belonged to each, here the ticket price on both legs of one ticket. One screen of evidence only. If the trip totals or the trips list show the same double counting risk, it should become a recurring problem.

## Proposed decision

DES-031, status Proposed. A cost shared by several legs is shown once as the ticket's, with chips for the legs it covers and the current leg marked, never as a fact of a single leg. Any total that sums legs counts a shared ticket once. Reasoning: the booked sheets repeat one ticket's full price on two legs with a unit word that disagrees with the segment list. Alternatives: split the amount across legs (rejected, it invents a per leg price the seller never stated), or keep the amount per leg with a subtext (rejected, it is a sentence standing in for the form). Applies to flight-sheets, trip-page, trips-list.

The rule that a booked sheet carries no date control is better made as an amendment to DES-023 than as a new decision, if Simon accepts F1.

## Verdict

A clear improvement on review-007. The booked card itself is close to the Wallet and Flighty bar and review-007's three biggest complaints about it are gone. The remaining problems sit around the card, not in it: the slot under it and the action row change with the leg, and the money row says less than it seems to. Fix the frame, not the card.

## Keep

- The card header: large airport codes, city names under them, local times with a local mark, the plus one day mark, and the duration on the line.
- The segment list with layover times on their own quiet line.
- The compact reference row with its copy icon and its filled background, the strongest fact on the sheet.
- The structured fact rows with an icon and a label each.
- The stay facts row under the regional card, which should become the standard.
- The phone layout, which keeps every field and wraps the carrier under the segment only when it has to.
- Alternatives staying behind Change booking, as DES-023 asks.

## Rulings

None yet. All findings stay open for Simon.
