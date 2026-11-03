# The city

Which pane this is: one city of the trip, in its two frames. The city sheet opens from a stop on the trip page (`planner/src/components/story/CityCard.tsx` in a `Modal`, with `Itinerary` from `TripHead.tsx` and `WhereToStay`). The city panel opens from a pin on the Map tab (`CityView` in `web/src/map/Panel.tsx`, with the stays slot from `planner/src/components/PlannerMap.tsx`). Inside both: Where to stay (`WhereToStay`, `StayCard`), the experiences and training sections, and the Add a place form (`AddPlace`). The roast is `.superpowers/sdd/2026-11-03-ui-roast/roast-city-1.md`.

## Journey

1. Simon taps a city in his trip. He sees how many nights he is there and the dates.
2. He wants to decide where to stay: the places he has saved, their price per night and total, the area, and which one is chosen. With nothing saved yet, the next step is obvious.
3. He found a hostel on Booking or Hostelworld. He adds it fast on his phone: name, link, price, dates.
4. He also looks at what to do there, experiences and places to train (he trains Brazilian jiu jitsu), without the sheet becoming a wall.
5. He closes the sheet and is back where he was.

## Goals

- One city design. The sheet and the map panel render the same body (`CityBody` in `web/src/map`): the same header, the same order, the same counts. Only the frame differs.
- The header answers step 1 in the same spot every time: the nights as a large number and the full range beside it, "2 to 3 Dec".
- Where to stay is the first block and the strongest one. Empty, it is a slot shaped like the card it becomes, with the uncovered nights in a warn tint, one primary Add a place and searches on Booking and Hostelworld for the city and the dates. Filled, every saved place shows its price per night, its total for the stop, its area and whether it is chosen.
- Adding a hostel on a phone takes a paste and two fields: link, name, price per night, dates. The total is worked out live.
- Experiences and training stay short: three rows each and a count to open the rest in place. Training lists gyms only, BJJ first, each with its disciplines as chips and its drop in price when known.
- Closing goes back to where he was, one close control per frame, and a half typed place survives a slip.

## Anti goals

- No travel guide prose in the body. The summary, the touristy meter and the altitude move behind About.
- No sentence that explains the planner. Rules show as marks with a tooltip.
- No new database fields. The data already holds price per night, total, dates, site, link and area.
- No change to the trip page around the sheet, the flight sheets, the route map window or the rest of the Map tab.
- No route picker inside the city. Connections fold to one row.

## Design

### Data

`lodging_prices` already holds `check_in`, `check_out`, `total_dkk`, `per_night_dkk`, `site` and `url`. `lodgings` holds `links` and `address`. The form buried them. The area is the free text `address`, shown as a pin chip on the card. No schema change, no migration, no edit to `types.ts`. Prices stay in the owner only tables.

### CityBody

A presentational component in `web/src/map/CityBody.tsx` with its own unscoped `city.css` (prefix `cy-`), on the shared token names with fallbacks so it reads right in both apps. It takes a view model, not the store.

- **Hero.** The photo full width, a small info mark in its corner that reveals the credit. No photo, no hero.
- **Head.** Flag and country as a kicker, the name, the tagline. When the city is a stop of the open trip: the nights large with the range beside it. A lock mark with a tooltip "The flight lands here" on the first stop replaces the footer sentence.
- **Stay slot.** Whatever the frame passes in. The planner passes `WhereToStay`. The public web map passes nothing.
- **Experiences.** Saved experiences and `things_to_do` merged into one list, deduped by name, three shown and a count button to open the rest in place. The category stays as a quiet label under the name.
- **Training.** Gyms only, ranked with BJJ first. Each row has its discipline chips (BJJ first) and the drop in price in kr when known, plus its score. Three shown and a count. The city scorecard is not a row.
- **About.** A disclosure with the summary, the touristy meter in a neutral tint with its label, and the altitude.
- **Extra slot.** The map panel passes Connections here.

### Map panel

`CityView` renders `CityBody` in its own head with the collapse and close buttons. Connections fold into one disclosure row with the count, opening in place. When the trip ends at this city the row reads "Next leg" and opens by itself, which replaces the amber trip note banner. A connection chip with no time and no price is dimmed and never empty. `RouteMap` gains a thin `cityStop?: (placeId) => { nights, first, out, fixed } | null` prop passed to `Panel`, so the Map tab shows nights and dates. The earliest stop at a place wins.

### Trip sheet

`CityCard` keeps its props, so `Story.tsx` does not change. Its body becomes `CityBody` with `WhereToStay` in the stay slot. The footer keeps Open in map, Change location and Delete. On the first stop the footer drops the sentence and the head carries the lock.

### Where to stay

- **Empty.** A filled slot card: a bed icon, the free nights in a warn tint, the dates, a solid primary Add a place, and Booking and Hostelworld search links for the city and the dates (`stayLinks.ts`, pure).
- **Chosen.** A chosen part shows as its stay card with the nights stepper and the remove control, as today. Free nights keep their slot.
- **Saved.** Other saved places at the city are compact rows: thumb, name, kind, area chip, rating, price per night and total for the free nights, and a choose control. A row opens in place to the full card. One room, choose takes it. Several rooms, the row opens to pick one.
- Add a place turns secondary once a place is saved.

### Add a place

- Opens as its own sheet over the city, titled with the city and its nights. That fixes the cut off hero and the stacked closes.
- No close button of its own, only Cancel and Add. A draft dismissed by Escape or the backdrop is kept for the city until Cancel or Add.
- Order: link first (the site chip appears and the name fills from a Booking or Hostelworld address, `linkName.ts`, pure), Name, Kind as a segmented control with Hostel first, price per night in kr as a large field with the total under it, check in and check out filled from the stop's free nights, Area.
- "Details" opens rooms, photos, amenities and notes.
- Saving writes one room ("Dorm bed" for a hostel, "Room" otherwise) with a price row holding both `per_night_dkk` and `total_dkk`, plus `site` and `url` from the link, and the area as `address`.
- Add is disabled until there is a name. The placeholder is dimmed.

### Colour

Amber stays for the primary action and the current choice. Row arrows, links and score chips go neutral.

## Roast rulings

1. Price, dates, area missing from the form. Taken. Price per night with a live total, dates from the stop, Area into `address`.
2. Link hidden, amenities fill the screen. Taken. Link first with the name read from the address, amenities behind Details. Reading the photo from the page is left out, the browser cannot fetch Booking.
3. Nights and dates half shown. Taken. One head with the large nights and the full range in both frames.
4. Empty stay is a ghost button. Taken. A filled slot with the bed, warn tinted nights, primary Add and the two searches.
5. Two designs for one city. Taken. One `CityBody`, order stay then do then train.
6. Repetition and a wall. Changed. Merged list with three shown and a count, summary behind About. No category icons, the quiet category label already tells it.
7. Training not for BJJ. Taken. Gyms only, BJJ first, discipline chips, drop in price. The city score leaves the list and is not moved to the head.
8. Map panel ends in a route picker, empty chips. Changed. Connections fold to one row with a count that opens in place, since items open in place. Empty chips are dimmed.
9. Hero cuts the title in form mode. Taken. The form is its own sheet titled with the city.
10. Two closes plus Cancel. Taken. The form has Cancel and Add only and keeps a dismissed draft.
11. Phone map shows controls over the map. Rejected for this pane. Map controls and layers belong to the Map tab agent, flagged in the report.
12. Sentences doing the interface's job. Taken. Lock mark with a tooltip, the banner becomes the Next leg row.
13. Raw photo credit. Taken. Info mark on the photo.
14. Touristy dots with no scale. Changed. A labelled neutral meter inside About, not in the head, since it is guide content.
15. Amber everywhere. Taken within the pane. Neutral arrows, links and score chips.
16. Mixed control signals. Changed. Segmented kind, dimmed placeholder, add chips on one row, Add disabled until a name. Price stays optional so a place can be saved before a price is known.
17. Phone sheets differ. Changed. The content is now one design. Grabber and swipe belong to `Modal` and the map panel frame, shared with other panes, flagged in the report.
