# The trip map

Which map this is: the planner's trip map, `planner/src/components/story/RouteSummary.tsx`, drawn by `routeView.ts` (where things sit), `labelSpots.ts` (where words go) and `routeLive.ts` (what moves). It opens as the window from "View on map" on a trip and lies laid back as the strip on top of the trip dashboard (`planner/src/screens/TripDashboard.tsx`). The roast in `.superpowers/sdd/2026-11-03-ui-roast/roast-map.md` and the shot `.playwright-mcp/map-check-375.png` show the window: a flag per country with its name and nights beside it, flight arcs with chevrons, "From Copenhagen" and "To Copenhagen". It is not `web/src/map/RouteMap.tsx` (the MapLibre map of the Map tab) and not `LegMap.tsx` (the small map on a bus or boat ticket).

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
- Hierarchy by nights. Flag size follows the nights, and so does the weight of a country's name.
- A calm Central America. Flags sit where you are, never pushed away from their place. Close flags shrink the smaller one first and then stack. Names go only where they clear every flag, word and line, the others come out on hover or focus and always stand in the bar.
- One readable route. Every leg carries its direction. Colour and form tell the mode: a flight is an amber arc, overland a teal line, a boat blue. A leg not yet booked is dashed, a booked leg is solid.
- Itinerary information as a designed layer: a translucent bar over the foot of the map with a segment per country, its width the nights, its flag, its nights and the mark of how you got there. A chosen segment shows its name and days above the bar.
- Progressive reveal. The window draws the route once on open and stepping through the bar reveals it up to the chosen country. With reduced motion the route is simply there and the steps cross fade.

## Anti goals

- No new annotation clutter on the map. Nights leave the map labels for the bar, no legend, no new lines of text.
- The map stays central. The bar is a thin layer at the foot, never a panel beside the map.
- No change to the MapLibre map of the Map tab, the ticket map or the booking views.
- No summary sentence of the trip.

## Design

- **Flags.** Radius goes with the square root of the nights against the longest stay, so area follows nights, with a floor so a five night stay stays tappable. Passing through stays the small mark it was. Flags sit on the first place you reach, at its true position. `fitSizes` shrinks the smaller of two touching flags down to a floor before they may overlap, and the smaller one is drawn on top.
- **Labels.** Country name only, sized by nights. The line is a hard obstacle in `spotFor`, so a label never sits under it. A label with no clear spot peeks on hover or focus as before.
- **Route.** One path per leg with its family and booked state as data. Flights between countries arc, every leg longer than a short hop carries a chevron at its middle in its own colour.
- **Bar.** `TripBar` in the window, built from `ribbon()` (a pure helper): segments with nights, share, arrival mode, booked state and days. Segments are buttons. Hover previews, a tap or Enter chooses, a second tap or Escape lets go, arrow keys step. The chosen country also gets the ring on its flag. Opening a country on the map chooses it in the bar.
- **Reveal.** `revealOf()` (pure) says which legs and flags are lit for a chosen country. The live map sets that state and CSS fades opacity. The opening draw is a mask along the whole route, its flags appear as the line reaches them. Reduced motion skips the draw.
- **Today.** `hereAt()` (pure) gives the country of today's date from the stops' days, nothing before or after the trip.
- **Data.** `routeStops` gains each stop's days and whether the leg into it is booked, from `lockedLegs`.
- Dark look kept: the same ground, land and tokens.
