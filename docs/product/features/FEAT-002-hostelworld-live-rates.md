# FEAT-002: Live rates from Hostelworld

- Date: 2026-11-05
- Status: Built and roasted 2026-11-05 from `docs/superpowers/plans/2026-11-05-hostelworld-rates.md`. The Outcome section at the end says what the roast found and what changed.

## 1. Problem

Simon is about to book the places to stay for a trip that starts on 2026-12-03, and the planner cannot tell him what a bed costs tonight. The lodgings tables exist and the Accommodation pane shows a place with its rooms and prices, but every price in them was typed by hand or written by a Claude task that Simon has to start, and the Hostelworld part of that task needs his own browser (`docs/task-runner.md`). The tables were empty when this spec was written. Booking.com and Hostelworld give no public API without a partner contract, and a plain fetch of a Booking.com page gets a bot challenge. Hostelworld's own site, though, reads its rooms and prices from an unauthenticated JSON endpoint that answers a plain request with a browser like user agent. That is the workaround until a real API is in reach, and it must not depend on Simon's PC being on.

Simon's sketch, in his words: tap a place, see the stored price with a tag saying how old it is, and a live fetch that comes back a second or two later, started by opening the place, with no refresh button.

## 2. Journey

Numbered moments on the Accommodation pane of a stop, Simon on his phone or laptop, with the dates of the stay set.

1. **Open a place.** Tap a place with a Hostelworld link. The pane opens at once with the rooms and the prices the store holds, each price with a mark saying when it was seen.
2. **Watch it come in.** A quiet live dot says Hostelworld is being asked. A second or two later the rooms refresh in place: tonight's price per bed or per room, how many beds or rooms are left when few are, and whether the booking is free to cancel and until when.
3. **Judge it.** A price seen today reads as today. One seen days ago is marked amber, so a stale price is never mistaken for a quote.
4. **Add a place from a link.** Paste a Hostelworld link on the Find & add tab. The place appears with its photos, rating, address and rooms, priced for the dates, and opens without a second tap.
5. **Come back tomorrow.** Every place and dates that have a Hostelworld price are asked again each morning by the worker, so the stored price is never older than a day while the dates are ahead, whether or not Simon opens the app.
6. **Nothing comes.** Hostelworld does not answer, or the place has no Hostelworld link. The stored prices stay, and one small warn mark on the rooms section says what happened. No sentence under every room.

## 3. Goals

- A price per room for the dates, in DKK, from Hostelworld, without a key, a browser or Simon's PC.
- The stored price shows first and the live one replaces it in place. Nothing is hidden while asking.
- The age of a price is in its form, a mark on the row, not a line of prose.
- A pasted Hostelworld link is enough to add a place.
- The morning refresh keeps prices a day old at most for every stay with dates ahead.

## 4. Non goals

- Booking.com rooms and prices. The Booking.com connector gives one cheapest total per property and no rooms, and there is no public endpoint. Booking.com prices keep coming through the `stay_prices` task until a real API is in reach. The backlog holds the Airbnb search and the reservations from other portals.
- Booking through the app. The app never books, pays or ticks a consent box. The dated link opens Hostelworld.
- A price history view. Every observation is kept in `lodging_prices`, the view of it is later work.
- A refresh button. Opening the place is the refresh.

## 5. User stories

1. As Simon, opening a place with a Hostelworld link, I want its rooms priced for my dates within a few seconds so that I can decide where to book without leaving the planner.
2. As Simon, reading a price, I want to see when it was seen so that I never book on an old number.
3. As Simon, reading a room, I want to see when few beds or rooms are left and whether it is free to cancel so that I can judge the urgency and the risk.
4. As Simon, with a Hostelworld link on my phone, I want to paste it and get the place with its rooms and prices so that adding a place is one step.
5. As Simon, not opening the app for a day, I want the prices kept fresh by themselves so that the pane is right when I come back.

## 6. Acceptance criteria

Story 1
- Opening a place whose links hold a Hostelworld property id calls the `stay-rates` function once for the place and dates. Opening it again within ten minutes makes no second call.
- The pane shows the stored rooms and prices before the call returns, and the rows refresh in place through the realtime reload, without a tap.
- While the call runs, the rooms heading shows the live dot with the accessible text "Asking Hostelworld", and a room with no price for these dates shows the dot in place of "No price yet".

Story 2
- Each room row with a price for these exact dates shows a Clock mark with the age of the latest observation, today, 1 d or 5 d, and a tooltip "Seen on Hostelworld 5 Nov 14:02".
- An observation older than the stale limit of `freshness.ts` renders the mark in the amber tone.

Story 3
- A price with `available` at most 3 shows a "3 left" chip, and its accessible name says beds for a dorm and rooms for a private.
- A price with `refundable` yes shows a free cancellation chip with the last day from `cancel_until`.
- A failed call shows one warn mark on the rooms section with the message as its tooltip and accessible name, and no stored price disappears.

Story 4
- The Find & add tab has a link row with the placeholder "Paste a Hostelworld link" and a Go button enabled only for a link with a Hostelworld property id.
- Submitting the link adds the place at the open stop with name, kind, photos, rating, review count, address, coordinates, tags and link, prices it for the dates, reloads the store and opens it.
- A link to a place that is stored already prices that place and opens it. No second place is made.

Story 5
- The worker's `rates` action asks the function for every distinct place and dates with a Hostelworld price whose check in is today or later, with the fresh window at 0, and reports how many were asked, fetched and failed.
- A schedule runs it at 05:00 UTC daily.

All
- The function writes with the service role and refuses every caller but the owner and the worker key. The tables stay owner only.
- No price, name or reference reaches a built file, a commit, a doc or a test fixture.
- No question mark and no prose summary line in the UI.

## 7. Open questions

- A room Hostelworld does not list for the dates keeps its last price. It should probably show as sold out for those dates. Left for Simon to see in use.
- Hostelworld's endpoint is unofficial and can change or start refusing. The function fails soft, and the age mark then shows the price going stale.

## 8. ## Outcome

Roast 2026-11-05, score 6.5. Accepted and built in the fix round (b46ad64): a price from today is a plain price with no mark, an older price dims and carries a clock chip that says "5 days old" in words, amber once stale, so the age is never read as beds left. The asking dot is neutral and pulses, and a room with no price for the dates shows a pulsing bar the size of a price instead of a green dot or the words "No price yet". The double focus ring on the link field could not be reproduced in the browser, and the orange top line was not found in the shots, both left. Not accepted here: the roast's point that the Select buttons and the Hostelworld seller row are two actions fighting over one moment is a concept question about the Accommodation pane, raised with Simon, not changed in this feature. After shots: phone-after.png, phone-asking-after.png, desktop-after.png.
