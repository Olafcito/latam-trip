# The trip map

Which map this is: the planner's trip map, `planner/src/components/story/RouteSummary.tsx`, drawn by `routeView.ts` (where things sit), `routeInset.ts` (the magnified inset), `camera.ts` (where the camera looks), `labelSpots.ts` (where words go) and `routeLive.ts` (what moves). It opens as the window from "View on map" on a trip and lies as the strip on top of the trip dashboard (`planner/src/screens/TripDashboard.tsx`). It is not `web/src/map/RouteMap.tsx` (the MapLibre map of the Map tab) and not `LegMap.tsx` (the small map on a bus or boat ticket).

## Journey

1. **Before the trip, on the dashboard.** Simon opens a trip and sees the strip. He wants the shape of the whole trip without reading: which countries, in what order, where the long stays are.
2. **He opens the window.** The route draws itself from Copenhagen through every country and home again, so the order and direction are told once by motion. Then it rests as one calm route.
3. **At a glance.** The biggest flags are the longest stays. Nicaragua at 22 nights reads before Guatemala at 5, and a country only passed through is a small mark. Central America is readable at the size it is drawn, nothing overlaps and no word sits on a line.
4. **How he moves.** A flight looks like a flight and a bus or boat like the ground, and the line says which legs are booked and which are still a plan.
5. **Through the itinerary.** He moves along the itinerary bar at the foot of the map, country by country. The route reveals itself up to that country and the rest steps back, so he sees where he is in the trip, how long he stays there and the days.
6. **During the trip.** On his phone the bar starts on the country he is in today, the route lit up to there.
7. **One level deeper.** A tap on a flag still opens that country into its places with their nights, as before.

## Goals

- The trip reads at a glance: order, direction, length of each stay.
- Hierarchy by nights. Flag area follows the nights, strictly in order, and so does the weight of a country's name.
- Room where the trip happens. A cluster of countries too close to read gets a magnified inset in the free part of the frame, so every Central American flag and leg is a size a thumb can use.
- A camera. Opening a country flies the map to its places, choosing one in the bar frames it with its neighbours, letting go flies back to the whole trip. Flags and words keep their size while the land zooms.
- One readable route. Legs run between flags. A flight is an amber arc, overland a teal line, a boat blue. Dashed while a plan, solid once booked. Out and back legs never share a corridor.
- One mode language everywhere. The bar carries a glyph for every leg, the way out and the way home too, on the boundary where that leg is, filled once booked and an outline while a plan.
- The bar is a timeline: one track as long as the trip in days, a month hairline, a pass through as a tick, a today needle apart from selection, and a finger can scrub along it.
- Three tiers when a country is chosen: it is the hero with its legs in and out, what came before goes quiet, what comes after stays plain.
- The draw tells the order with names on it: each country's flag, fill, name and bar segment arrive as the line reaches it.
- The window is the screen. Full screen on a phone, a large card on a desktop with the map to its edges.

## Anti goals

- No new annotation clutter on the map. Nights leave the map labels for the bar, no legend, no lines of text, no hint telling you to tap.
- The map stays central. The bar is a thin layer at the foot, never a panel beside the map.
- No change to the MapLibre map of the Map tab, the ticket map or the booking views.
- No summary sentence of the trip.
- Gold is the flight and nothing else. Selection is white, today is red.
- The map is never stretched. The strip is the same uniform map turned, not leaned back.

## Design

- **Flags.** Radius goes with the square root of the nights against the longest stay, with a floor so a short stay stays a flag. Passing through stays the small mark it was. Flags sit on the first place you reach. `fitSizes` shrinks the smaller of two touching flags first, then `inOrder` keeps every flag no bigger than one with more nights, so the order of sizes is the order of nights. Every flag has a hit circle of at least 44 px, and where two overlap the flag nearest the finger wins.
- **Inset.** `clusterOf` (pure, `routeInset.ts`) finds countries whose flags sit too close for their size. `insetFor` (pure) finds the largest free rectangle of their shape that holds no other stop and stays clear of the title and the bar, nearest to where they are. When it magnifies by at least 1.6, those countries and their places are drawn there by a second Mercator, with their own land and fills, and a quiet box marks their real place on the map. Legs reach into the inset.
- **Camera.** `frameFor` (pure, `camera.ts`) turns a box of the map into a zoom and a centre inside the room left by the title and the bar, never past the edge of the world. routeLive puts it on springs. The land, fills and borders zoom as one group with strokes kept thin. Flags, dots, legs and words are placed through the camera in screen units, so nothing grows. Open frames the country's places, choose frames the chosen country with the countries before and after it, close and Escape fly back.
- **Labels.** Country name only, sized by nights, placed where the camera will be and kept on their anchor through the move. While a country is open, the names of the others step out and their flags stay as context. Places are real dots joined in visit order by the same leg styling, each with its name and nights.
- **Route.** One path per leg with its family and booked state as data, between flags. `sideOf` (pure) bends each flight to the side that clears foreign flags and stays out of a corridor already used. Every leg longer than a short hop carries a chevron. The home stubs point along the great circle to home, a home glyph at each end that names home in its title.
- **Bar.** `ItineraryBar` built from `ribbon()` and `timeline()` (pure, `tripBar.ts`). Segments are buttons placed by days from the first day to the last, butted on one track. A pass through is a tick with its flag on its boundary. Leg glyphs sit above each boundary, the way out at the start, the way home at the end. A month hairline with a short month name below. A red today needle at the exact day, apart from the white ring of the chosen segment. Above the track the shown country reads as chips: flag, name, nights, days. Hover previews, a tap or Enter chooses, a second tap or Escape lets go, arrow keys step, a pointer drag scrubs.
- **Tiers.** `tierOf()` (pure) gives each country and leg past, hero or future for a chosen country, everything plain for none. CSS carries the look.
- **Draw.** A mask along the whole route. Each country's flag, fill, name and bar segment wait and arrive together as the line reaches it. A press ends it, reduced motion never starts it.
- **Strip.** The same flat map turned so the trip runs along the strip and fitted uniformly to fill it, with one corner radius and no fade.
- **Window.** On a phone the window is the whole screen, the title floating on top and the bar at the foot above the home indicator. On a desktop a large card, the map to its edges. The canvas takes the shape of the window it is in. The dialog never shows a focus ring of its own.
- **Today.** `hereAt()` (pure) gives the country of today's date, nothing before or after the trip.
- **Data.** `routeStops` gives each stop's days and whether the leg into it is booked. The window gets whether the ways in and home are booked, and where home is.
- Dark look kept: the same ground, land and tokens.

## Roast rulings

Round 1 roast: `.superpowers/sdd/2026-11-03-ui-roast/roast-map-1.md`.

1. Central America unreadable. Take. A magnified inset in the free part of the frame, found by a pure helper, with a box on its real place.
2. Open does not open anything. Take. A camera that flies to the country's places, real dots joined in order with no leader lines, back on close or Escape.
3. Phone wastes a third and flags untappable. Take. Full screen on a phone, every flag keeps a 44 px hit circle and the nearest flag wins.
4. Strip distorts and invents a route. Take. No lean, a uniform turned map that fills the strip, flights bend to the side clear of foreign flags and used corridors, one corner radius.
5. Chosen country is not the hero. Take. Three tiers, its legs in and out lit, the camera frames it with its neighbours, a drag scrubs the bar.
6. Mode encoded three ways. Take. A glyph per leg on its boundary, the ways out and home too, filled booked or outlined plan, never dropped, a bus drawn as a bus.
7. Draw without names. Take. Flag, fill, name and bar segment arrive together as the line reaches each country.
8. Bar is chips. Take. One butted track by days, a month hairline, a pass through as a tick, a red today needle apart from selection.
9. Gold means everything. Take. Gold is the flight only, selection is white, the dialog shows no focus ring.
10. Sentences doing the work of form. Take. The hint goes, home is a glyph, the readout is chips with nights and days.
11. Home legs miss the flags. Take. Every leg runs between flags while its country is closed, the home stubs point along the great circle home.
12. Size order slips. Take. Sizes follow nights strictly, with a test.
13. Desktop window floats. Change. A large card with the map to its edges rather than the whole viewport, so the trip page stays behind it and the close sits where it always does.
