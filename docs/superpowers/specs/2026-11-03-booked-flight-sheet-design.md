# The booked flight sheet

Which sheet this is: the flight sheet of the trip story, `planner/src/components/story/FlightSheet.tsx`, with the booked box on top (`BookedBox.tsx`) and the date strip (`Days` in the same file). The way in and the way home use the same box and strip through `WaySheet.tsx`. The roast in `.superpowers/sdd/2026-11-03-ui-roast/roast-booking.md` covers the box of a booked flight and the strip under it.

## Journey

### A booked leg

1. **Before the day.** Simon opens the leg to check the flight. He wants the flight number, when it leaves and lands, how long it takes and that the times are local, without reading a sentence.
2. **At a desk.** At check in or a transfer desk he is asked for the reference. He finds it in one row, reads it in a code font and copies it with one tap.
3. **What he paid and through whom.** He sees the price in DKK, the price in the currency he paid in, who sold it with their own order number, and what the price covers when one ticket holds several flights. The other flights on the same ticket are listed so he knows a change touches them too.
4. **What his fare allows.** Fare name, cabin bag, checked bag, refund and change rules sit as rows, each with an icon. His own notes stand apart and only when he wrote some.
5. **What else happens that day.** He taps a day in the strip. A day view shows everything on that day across the trip: flights leaving and landing, check out and check in, the stay that night, booked activities and ground transport.

### An unbooked leg

1. He opens the leg and sees a strip of days, each with a readable price, the cheapest marked.
2. He picks a day, the list shows the flights of that day by price, and the day view below the strip shows what else is planned that day so he does not pick a flight that clashes with a check out.
3. He picks a flight and books it from the footer as before.

## Roast points and answers

- **The big green header.** Gone. The top row is a small green check, the word Booked and the day, with the edit pencil at the right. Green stays a mark, not a surface.
- **The reference takes too much space.** It becomes one compact row: a hash icon, a small label, the code in mono at body size and a copy icon button that turns into a check for a moment after copying.
- **Notes read like a raw DB string.** The facts move out of the notes into fields: airline and flight per segment, booked through, the provider's own number, the airline reference, what the price covers and the other legs on the same ticket. Each shows as a designed row. Notes keep only Simon's own words, under their own heading, and are hidden when empty. No raw database string reaches the sheet.
- **The flight line is too faint.** The line between the codes becomes solid in the flight colour with a larger plane. The duration sits over the line when known. The times carry a small "local" mark. A flight with stops shows each segment as a row with its flight number, and the layover between them.
- **Strip prices too small, and why a booked day shows a live fare.** Prices are written in full thousands at a readable size. On a booked leg the booked day shows what was paid, in green with a check, and a later flight of a shared ticket shows a ticket mark instead of a price. The other days of a booked leg show no live fare until Simon chooses Change booking. Instead they show small marks of what happens that day. On an unbooked leg each day shows the cheapest fare, labelled as from.
- **A tap on a day shows the whole day.** A new day view, built from a pure helper, lists the day's events across the trip in time order with an icon per kind.

## Data

- Migration `0015_booking_details.sql` adds `seller_reference text` (the provider's own order number) and `fare text` (the fare name) to `public.bookings`. The table stays owner only through the policies of 0013. Bookings never enter tripdb `TABLES` or any public build. Both columns join `tripdb.BOOKING` and the `Booking` type.
- A script run once moves the facts of the booked rows out of their notes: segments with carrier and number, seller reference, fare, bags, the price in its own currency and a shared ticket for two flights bought together. It prints counts only. Notes end empty.
- `reference` and `fare` belong to one row in the edit form, so a second flight on the same ticket keeps its own airline reference. `seller_reference` is shared across the ticket like the seller.

## Design

- **Box.** Mark row, route with the flight line, segment rows, the reference row, then one grouped list of fact rows: Booked through (seller with its number and copy), Paid (DKK, the paid currency and what it covers), Same ticket (the other legs with day and codes), Fare, Bags, Refund, Change and Travellers. Files and actions stay as they are.
- **Duration.** From the local departure and arrival with each airport's UTC offset from `inout.json`, or from the picked flight's hours. Without both offsets no duration is shown.
- **Strip.** `dayValue()` (pure) says what a day shows: a fare, the paid amount, a ticket mark, event marks or nothing. The strip renders from it. Days stay a radio group with arrow keys.
- **Day view.** `tripDay()` (pure) takes the schedule, the legs, the bookings and a day and gives the events in order: leave and land per leg, check out and check in per stop, the stay that night and booked activities. `Story.tsx` passes it to both sheets.
- Dark look kept: the same tokens, the flight amber for the line, the booked green only as a mark.

## Anti goals

- No live fare beside a booked day.
- No sentence that recaps the booking, no question mark, no dash as a separator.
- No real reference, number, price or name in code, tests or docs. Fixtures use TEST01.
- No change to the trip map files.
