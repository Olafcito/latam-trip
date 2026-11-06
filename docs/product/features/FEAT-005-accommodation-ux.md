# FEAT-005: Accommodation at a stop, planned and booked

- Date: 2026-11-06
- Status: Drafted and built on the branch `worktree-agent-a7189d0987371254a`. Simon gave the brief, the two reference images and the scope in one go, so discovery was his brief. The separate review was skipped: no schema change, no new owner only data, the bookings table and the private bucket are used as the flights use them.
- References: the card image and the confirmation window image Simon gave on 2026-11-06. They are the design authority for this feature. Neither is in the repo.

## 1. Problem

A stop's fold hides where Simon sleeps behind a tab, as a small row with a thumbnail. Nothing on it says what the place is like, what it costs a night or how to turn a planned stay into a booked one. A booking confirmation can be attached to a flight but not to a stay, and there is no way to add accommodation from the trip as a whole.

## 2. Journey

1. **Open a stop.** On the trip, Simon opens a stop. Where he sleeps comes first and is the largest thing in the fold: the place's photo, its name with the address and the town under it, its kind and what it offers, the nights, the room where it was found and the price. An amber Not booked mark says it is only planned. Things to do and Experiences sit under it as two compact rows, each with a count, that open in place.
2. **Add from the stop (window A).** With no stay yet, Add accommodation opens the search he knows, filled in with the stop and its dates. He finds a place, opens it, picks a room with Select, and the window closes on the stop with the new card.
3. **Add from the whole trip (window B).** From the trip's header he presses Add accommodation. The same search opens with the destination empty. He picks a city of the trip, its dates follow, he can change dates and guests, and the rest is window A. After Select the window closes and the stop opens on the card.
4. **Book it and attach the confirmation (window C).** Once he has booked on the site, he presses Add booking confirmation on the card. A small window offers Upload confirmation, Paste booking link, Enter manually, and Use with AI, which copies a prompt for ChatGPT or Claude to find the booking in his mail. Any of the first three makes the stay booked.
5. **See it booked.** The card turns green: Booked, the provider's logo, the total large with the price a night under it, the attached confirmation and a Gmail button when the mail is known.
6. **Look at the details (window D).** Pressing the card opens the stay alone: photos, name and location, room, dates and nights, price, status, reference, where it was booked, cancellation and the confirmation file. From there he can add or open the confirmation, change the room or take the stay off the stop.

## 3. Goals

- Where Simon sleeps is the first and largest thing at a stop, as the reference card shows it.
- A planned stay becomes a booked one from the card, with its confirmation kept with it.
- One search adds accommodation, whether it starts at a stop or from the whole trip.

## 4. Non goals

- No Gmail sign in, Gmail API, mail sync, inbox or AI extraction screen. Use with AI only copies a prompt.
- No change to the itinerary rail on the left, to the timeline or to any flight view.
- No new search. Windows A and B are the existing `StaySearch` and `AddStay`.
- No booking on a site from the planner.
- No migration and no MCP change.
- Add activity and Add experience are not built. Nothing stores an activity a person adds, so the compact rows show what is gathered and open it in place.

## 5. User stories

- S1 (step 1). As Simon, opening a stop, I want the stay as a large card with photos and its facts, so that I see where I sleep and what it costs at a glance.
- S2 (step 1). As Simon, I want Things to do and Experiences as separate compact rows under the stay, so that they do not compete with it.
- S3 (step 2). As Simon, at a stop with no stay, I want Add accommodation to open the search filled in with the stop and its dates, and to close on the card after I pick a room.
- S4 (step 3). As Simon, on the trip, I want to add accommodation by picking the city first in the same search.
- S5 (step 4). As Simon, after booking on a site, I want to upload the confirmation, paste the booking link or type the details, so that the stay is booked in the planner.
- S6 (step 4). As Simon, I want a prompt I can paste into ChatGPT or Claude that names the city, so that they can find the booking in my mail.
- S7 (step 5). As Simon, I want the booked card green with the total and a confirmation mark.
- S8 (step 6). As Simon, I want the stay's full details in a window of its own, with the confirmation file I can open.

## 6. Acceptance criteria

- S1: A stop with a planned stay shows one card per stay part in two rows. One photo fills the card's height on the left, with no thumbnails. The top row holds the name, the address over the town and country, then the kind, the amenity icons and a Free cancellation chip whose tooltip says until when. The second row holds check-in with nights, the room and the price with an amber Not booked mark. No description line and no dot between words. Shots at 1280 and 390.
- S1b: The room row shows the provider's logo as a small square, then the room name (the booking's room name, else the chosen room) as an underlined link with an external link icon. It opens the place's link on that provider's site, else the booking's page, else it is plain text. Free cancellation shows only when the booking or the room's price is refundable or has a cancel by date. Non-refundable shows nothing.
- S2: The fold has no tabs. Things to do and Experiences are rows with a count chip and a chevron, and open in place. A shot.
- S3: Add accommodation at a stop opens `AddStay` with the stop's name and dates. Select on a room closes the window and the card shows the room. The useStayFind call site in `StopFold` is unchanged.
- S4: The trip header has Add accommodation. The search opens with an empty destination and no places. Picking a city fills its dates and places. Select closes the window and opens that stop. A shot.
- S5: Upload, link and manual entry each insert one `bookings` row of kind stay with the place, lodging, room, trip and dates when the stay has none, and update that row when it has one. The upload goes through `attachFile`. Unit tests on the draft row.
- S6: Copy prompt writes the brief's prompt with the stop's city to the clipboard and says Copied. A unit test on the prompt text.
- S7: A stay with a booking shows Booked in green and prices like a flight: the provider's logo, the total large ("1.220 DKK total") and the price a night under it. With no kroner but a price in another currency, that currency shows, never a conversion. A paperclip button says the confirmation is attached, and a Gmail button opens the mail when `mail_url` is known.
- S8: Pressing the card's photo or name opens the details window, which shows the selected place only. The confirmation file opens through a signed URL.

## 7. Functional requirements

- A planned stay is a `PlannedStay` in the trip's JSON (`Journey.places[i].stays`). Its dates come from the schedule through `stayParts`, its price from `lodging_prices` through `partDkk`. Unchanged.
- A booked stay is a `bookings` row with kind stay, matched to a part by `partBooking` on the place, the lodging and the nights. Unchanged.
- Booking a planned part inserts that row: kind stay, status booked, `place_id`, `lodging_id`, `room_id`, `trip_id`, `check_in` the part's first night, `check_out` the morning after its last, `source` manual, and the reference, url, price, seller and cancellation as given. A part that already has a row is updated instead.
- Files go to the private `bookings` bucket under the row's id, through `attachFile`, with its type and size checks.
- The AI prompt is built by one function from the stop's city, with the exact wording of the brief.

## 8. UX requirements

- The card follows the reference image: one photo left, about 28 percent and as tall as the card, details right, a divider, then three columns (check-in, room, price with the confirmation action). When the details are narrower than 820 px the price goes under check-in and the room, across the details. On a phone the photo goes on top, full width, and the columns stack.
- Planned is amber (`--flight`), booked is green (`--booked`). The mark sits on the photo and at the top right, as in the reference.
- Window C follows the confirmation reference: three rounded rows with icon, title, subtitle and chevron, then the Use with AI box. Each row opens its form in the same window, with a back arrow.
- Window D follows the flight detail sheet: the modal of the planner, a header with photos, then facts as labelled rows, the confirmation tiles, and the acts at the foot.
- Icons that carry meaning have an accessible name and a tooltip. New icons go in `planner/src/components/icons.tsx`.
- New pattern flagged: the large stay card and the stacked fold have no DES decision behind them yet. The reference image is the authority for this feature.

## 9. Plan

**Reused as is.** `StaySearch` and `AddStay` (windows A and B), `PropertyView` (the place and its rooms), `Modal`, `stayParts`, `partBooking`, `partDkk`, `tripStays`, `stayClashes`, `saveBookings`, `attachFile`, `fileUrl`, `fileProblem`, `amenityRow`, `AmenityIcon`, `kindWord`, `bookAt`, the booking file tiles' look.

**Changed.**
- `CityFold`: tabs become stacked sections. The stays body first, then Things to do and Experiences as compact rows that open in place, then About as a compact row so Change location and Delete stay reachable.
- `StopFold`: renders the new cards in place of `StayList`, holds windows C and D, and can render its search without its own modal (`embed`) so window B shows the same search in one window. The `useStayFind` call stays where it is with the same arguments. Select on a room closes the window.
- `StaySearch`: an optional destination picker (`destinations`, `onDestination`). With no destination the fields wait and the list says to pick a city.
- `Story` and `TripDashboard`: the trip header's Add accommodation, and window B around an embedded `StopFold`.

**Created.**
- `components/stays/AccommodationCard.tsx`: the reference card, planned and booked.
- `components/stays/StayConfirm.tsx`: window C.
- `components/stays/StayDetails.tsx`: window D.
- `lib/stayBooking.ts`: the booking draft for a part, the AI prompt, and the facts the card and the details share. With `lib/stayBooking.test.ts`.
- `lib/stayCard.ts`: the card's provider and the page its room opens, whether it cancels for free, and a booked stay's price in the currency known. With `lib/stayCard.test.ts`.
- Icons `Sparkles`, `Paperclip` and `Chevron`.
- `styles/acccard.css`.

**Migration.** None. Planned stays already live in the trip JSON, booked stays in `bookings` with kind stay, files in the private bucket. Nothing new is stored.

**MCP.** No change. `add_booking` and `attach_booking_file` already take a stay, so a booking that ChatGPT or Claude finds through the copied prompt lands in the same row.

## 10. Edge cases

- A stop with no nights: no card, and Add accommodation is not offered, as today.
- A planned part with no room: the room column says Choose a room and opens the place.
- No photos: the photo column shows a bed on the surface colour.
- No address: the town and country show alone.
- No price known: the price slot is empty. No placeholder text and no extra price chips.
- No provider known: no logo, and the room name is plain text.
- A booked stay with no lodging (typed in by hand): the card shows the seller or Booked stay, with no photos.
- A long name or room: two lines then an ellipsis.
- A part the stop has no nights left for: the card keeps the amber warning mark on the dates.
- Upload refused (type, size, offline): the reason shows in the window, nothing is created twice.

## 11. Dependencies and privacy

- Files: `planner/src/components/stays/*`, `planner/src/components/story/StopFold.tsx`, `Story.tsx`, `screens/TripDashboard.tsx`, `planner/src/lib/stayBooking.ts`, `planner/src/styles/`.
- Tables: `bookings` (owner only) and the `bookings` bucket (private). The reference, prices paid and files stay there. No fixture holds a real one, tests use `TEST01`.

## 12. Checks

- Unit tests: the booking draft (insert and update), the prompt, the card facts.
- Typecheck and tests in `web` and `planner`.
- Shots at 1440 and 390 of the fold, windows B, C and D, compared with the two references by one Opus reviewer, one fix round, shot again. No roast, by Simon's brief.
- Code review with `feature-dev:code-reviewer`.

## 13. Open questions

- Q1, for Simon: should Add activity and Add experience be built, and where would an added activity be stored.
- Q2, for Simon: the reference shows a check-in time. No place stores one, so the card shows the day only.
