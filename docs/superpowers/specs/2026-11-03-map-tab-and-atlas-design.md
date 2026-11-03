# Map tab and route atlas

The MapLibre map in `web/src/map` has two homes. The planner Map tab draws Simon's trip on it with the trip pane beside it. The public web map in `web/` is the signed out route atlas with the Options pane. Both share the camera, the layers, the controls and the panels, so one spec covers both.

## Journey

### Planner Map tab

1. Simon opens the Map tab with his trip open. He sees his route on the real map and the trip pane beside it, without the pane hiding the route.
2. He explores. He taps a city that is not in his trip and sees how he could get there from his route, with a way to add it as a leg.
3. He taps the city where he flies in from Copenhagen and sees the way in options.
4. He turns on layers, gyms to train jiu jitsu and experiences, and sees them where they are without the map turning into noise.
5. On his phone everything still fits: nothing runs off the screen, the sheet can be pulled down to see the map.

### Public web map

1. Someone opens the link. They see the region and the researched cities and grasp what this is without reading a paragraph.
2. They open the options and see the ranked whole trip options and ticket prices, and tapping one shows it on the map.
3. They tap a city and see how it connects: which cities it reaches, by flight or bus, how long and how much.
4. They tap one connection and see that route's flights and buses.
5. On a phone the map stays usable and the panels do not bury it.

## Goals

- The trip is the only saturated line on the Map tab. What the cursor reaches is drawn quiet and neutral until a city is tapped. The trip shows its direction.
- Stops that sit on top of each other read as one stacked badge with their range, and a tap on it zooms in until they part.
- No camera move ever zooms out past the researched region. A route opened from a panel fits both ends beside the panel or above the sheet.
- A leg with no price leads with the action that finds one, not with what is unknown.
- Gyms and experiences sit on the trip. The route stays drawn under them and the trip card stays.
- On a phone the controls stay on screen with one layers menu, and the map owns the space between the header and the sheet.
- The atlas opens on the researched region with its network drawn faintly, so the first glance says connections.
- The atlas puts its options first: a filled Trip options button in the header, the price beside the rating, no prose, and a picked option drawn on the map in order.
- A guest never meets a sign in form or an empty trip planner.

## Anti goals

- No change to the city panel's Where to stay, experiences and training content. The city design agent owns it.
- No change to the way in and home picker (PickScreen), the flight sheets, the booking views, the story map window, the trip page or the trips list.
- No new data in the public web build. The atlas reads only the public built files it reads today (places, connections, countries, flights, experiences, lists and the dash tables). Booking references, prices paid, names and attachments stay out.
- No new map library and no new dependency.

## Design

### Lines

- Route layers gain a `reach` feature state. In build mode at rest the cursor's routes carry it and draw in a neutral slate at low opacity. A hovered reach route lights in its mode colour. A tapped city's routes keep their mode colours as today.
- The trip draws solid, flights in amber and ground legs in bus green, each line oriented in travel order. A chevron symbol layer rides the trip line to show direction.
- The atlas at rest, with no trip open, draws the whole network at a faint base opacity in mode colours. With a trip open or a city selected the base goes to zero as today.
- A selected route calms the city's other lines further, so the route in focus is the one line that reads.

### Stops

- The `trip-stops` source clusters with a small radius. A cluster badge shows its first and last stop number joined by an ellipsis, as in 2…5, and a tap zooms to where it splits. The cluster drops out at higher zooms so every number shows.
- Place labels collide with the diamonds and dots instead of printing over them.

### Camera

- `showCity` never zooms out below the zoom the map opened at, so a city with long haul flights does not throw the camera to Europe.
- Opening a route fits its points beside the route panel, clamped between the opening zoom and a sane close zoom, whenever an end is outside the free part of the map.

### Leg offer and route panel

- With no fare known the route panel shows its mode cards with one muted dash for duration and price, no unknown rows (no "not searched", "not listed", "No stop data", "No dated search" line or "Fare unknown" note), and Search live prices as the primary action. Add leg sits beside it as one button. Add leg and continue moves to primary once a price exists.
- Carriers are deduplicated and normalised, and Operators goes when it repeats Carriers.

### Way panel

- Each way opens with a Flighty style header: the two airport codes large, departure and arrival clock times under them, and the total in hours and minutes between them with the layover code as a mark. Durations use hours and minutes everywhere. The duplicate Leaves row goes.

### Layers

- A mode keeps the trip drawn, dimmed, and keeps the trip pane as its mini card.

### Controls and legend

- The travel pills draw their own line style, so the legend keeps only the marker types and the Fly in and Fly home key goes (the rings are learned from the pane).
- The hint bar goes.
- On a phone the zoom buttons go (pinch exists), the travel pills and the mode buttons fold into one layers button with a small menu, the controls never shift sideways, and the attribution pins to the map corner.

### Trip pane

- The "Next from" prose goes. The ReachList puts the mode icon before the name and the duration and price as a tight pair on the right, so the name gets the slack.
- Save trip is a compact button that lights only when there are unsaved edits.
- The mini card shows title, total, stops and days only, never "Next from".

### Atlas chrome

- The sign in strip becomes a person icon in the header that opens the same form in a popover.
- The header holds a filled Trip options button and the Trips button, anchored there so panels never displace them.
- The Options pane loses its two paragraphs. The price is column two. The rating badge scales its fill with the rating.
- A picked option draws its airports in order as a numbered line and fits the camera to them.
- On a phone the Options pane is a bottom sheet over the lower half, with the map above it.

## Roast rulings

### Map tab (roast-maptab-1)

1. Take, changed: reach lines draw neutral and quiet at rest, the trip goes solid with chevrons. The travel pills stay on because they filter what the cursor reaches.
2. Take: stops cluster into a 2…5 badge that zooms in on tap, labels collide with markers.
3. Take: the camera never zooms out past the opening zoom, a route fits both ends beside its panel.
4. Change: the way panel gets the Flighty header and hours and minutes. A list of other way in options belongs to the way picker, which another agent owns, and the Europe arc is rejected because nothing should zoom out to Copenhagen.
5. Take mostly: no unknown rows, one dash, Search live prices primary when no price exists. Offering the leg from the two or three nearest stops is rejected because the cursor model holds: the earliest stop wins.
6. Change: the trip stays drawn and dimmed under a mode and the mini card stays. Independent toggles and an on my route scope for gyms are deferred to the gyms owner, the mode model stays one at a time.
7. Reject for now: the gym markers live in modeLayers and the gyms panel, outside the journey's need here, flagged as an open concern.
8. Take: on a phone no zoom buttons, one layers menu, no sideways shift, attribution pinned.
9. Change: the sheet already has peek, half and full in sheet.ts for modes. The trip sheet gets a peek height and Save trip goes compact. A full drag rebuild is out of scope.
10. Take: the hint bar, the reach prose, the "No dated search" line and the "then show what leaves" subtext go. The header build line is app chrome outside this pane, flagged.
11. Take: the pills carry their line style, the IoLegend goes.
12. Take: the ReachList gives the name the slack.
13. Reject here: the header freshness chip is app chrome outside this pane, flagged.
14. Take: Flighty header, the field label grid recedes.
15. Take: the mini card drops "Next from". The stray line is the hidden hint bar's border and goes with it.
16. Take: Save trip is compact and lights only when dirty.

### Atlas (roast-web-1)

1. Take: the sign in strip becomes a person icon.
2. Take: the faint network at rest, labels collide with diamonds. Fitting to researched cities is changed to fitting the destinations, so Montevideo and the US border no longer frame it.
3. Take: Trip options is the filled header button, Trips sits beside it in the header.
4. Take: price is column two in the table. Cards are rejected for now, the DataTable stays and gets its order fixed.
5. Take: both paragraphs go.
6. Take: a picked option draws its airports in order and fits.
7. Take: Options is a bottom sheet on a phone.
8. Partial: In and Out become arrow icons. Moving Connections above the brochure is the city design agent's call, flagged.
9. Take: other lines calm further and the camera fits the route.
10. Take: same phone controls as the Map tab. Gyms and Experiences move into the layers menu rather than leaving, since the atlas holds that data.
11. Take: carriers deduplicated, not searched rows hidden.
12. Take: one chip size, duration regular and price bold.
13. Take: the hint bar goes and the legend keeps the marker types only.
14. Take: the rating fill scales with the rating.
15. Take: Trips is anchored in the header.
