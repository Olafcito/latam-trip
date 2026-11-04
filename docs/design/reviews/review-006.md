# Review 006: Flight sheets

- Screen: flight-sheets
- Date: 2026-11-03
- Shot folder: `docs/design/shots/flight-sheets/1/`
- Source roast: `.superpowers/sdd/2026-11-03-ui-roast/roast-flights-1.md`

**Verdict.** The booked long haul card is close to Wallet quality, but everything before booking is not there yet. The planned leg and the picked flight can sit on different days, the loudest button moves the trip without a preview, and booked legs still look movable. The booking form never asks which flight was booked.

| Id | Finding | Root cause | Journey step | Scope | Priority | Suggested fix as a task |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | The pick and the leg date disagree and the main action moves the trip blind | A pick is stored apart from the leg date, with two verbs for one decision | Step 2, know the pick | Design system | Critical | Make a pick belong to the leg date, use one verb Pick, show the effect inline before it commits, and show the pick in the sheet header and the timeline chip. |
| F2 | No comparison and no best pick | Candidates are unmarked and an empty state is a blank room | Step 1, compare candidates | Component | High | Mark Best, cheapest and fastest in place, and show an estimated ghost card with two equal search buttons when no fares exist. |
| F3 | Moving a date never shows what it does to the trip | The night counts are static text away from the day under the finger | Step 3, move a date | Information architecture | High | Show a delta row on hover or press with nights, shifted stops and the cost change, and lock days that clash with a booked leg. |
| F4 | Booked legs still look movable | The booked leg opens the same picker and price strip | Step 6, trust a booked leg | Design system | High | Lock the date chip, open the picker read only if at all, and move alternatives behind Change booking. |
| F5 | The booking form never asks which flight was booked | The form is a payment receipt without the itinerary | Steps 5 and 6, record a booking | Component | High | Open the form with the picked flight as an editable ticket card, prefill the price from it, put price after the reference, and tuck terms behind More. |

**Keep.** The booked long haul card with big codes, layovers and the +1 marker, the timeline chips with a green outline and check for booked legs, the candidate row anatomy, live night counts in the header, the form's first screen with the route card, and dimmed past days.

Further findings: 10 more in the roast file (the unlabelled three cell options strip, the cramped phone candidate list, prose and repeated dates, yellow meaning four things, money written four ways, blurred airline and seller, long haul card details, booking form ergonomics, layout misses, two date pickers). See `roast-flights-1.md` in `.superpowers/sdd/2026-11-03-ui-roast/`. The booked sheet has its own review, review-007.
