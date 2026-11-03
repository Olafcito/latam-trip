# Trip page design

The trip page is TripDashboard: its header, the status of the trip with its costs, the story of stops and legs, the card behind a bus or a boat leg, and the All costs view. The route map strip and window, the flight sheets, the booked flight view, the WhenPicker, the booking form and the city sheet belong to other work and are not changed here.

## Journey

1. Simon opens his trip. He wants to know at once where it stands: how long, how much it costs, what is booked and what is still open.
2. He reads down the trip in order, stop by stop, and sees for each stop how many nights, the dates, and how he gets to the next one.
3. He spots what still needs doing, a leg with no flight picked or nothing booked, without hunting.
4. He taps a ground leg (a bus or boat) to see its details: operator, duration, price, how to book.
5. He opens all costs to see where the money goes and which part is paid versus still estimated.
6. On his phone during the trip he scrolls to today and sees what is next.

## Goals

- The first block of the page says where the trip stands: its nights and dates, what it costs with the part paid, how many legs are booked and how many are open.
- Every leg carries the same booked or open mark, flights, buses, boats, the way in and the way home alike. Open is the loud one.
- An open leg says what to do on it, Pick flight or Book, and the open counter takes you to the next one.
- Every stop shows its dates and its nights as figures. Changing the nights is one tap away, not the face of the row.
- Free nights are a row of their own on the rail with their dates and a way to give them to a stop.
- The card of a bus or a boat shows all the map holds for that leg: the operator, how often it runs, the time it takes and its range, the price with whether it is paid or an estimate, the local price range, the notes and where to book.
- All costs splits every category into paid, estimated and not priced, and lists the biggest items, each of which takes you to its leg.
- During the trip the page opens on today: where you are, the nights left there and the next leg.

## Anti goals

- No sentence lines that sum the trip up. The nights, the cost and the counts are figures with icons, each on its own spot.
- No new colours. Amber already means a flight, green means booked, the muted greys mean estimated.
- No change to how nights move. The earliest stop wins and a night less becomes a free night, as today.
- No editing of live data from the page that was not there before.
- Flight count and time in the air are not costs and leave the cost view.

## Design

### Header

Back to Trips, the trip's name, its rank and its version stay. Save trip shows only when the trip differs from what is stored, as a plain button, so it never outshines the trip. Saved state is checked against the stored table row when there is one, so an untouched table trip is not dirty. Build on the map and Export JSON move into one overflow menu at the right. View on map goes, the route strip under the status is that control already. The global nav is the shell of the whole app and is not changed here.

### Status row

The first thing in the card, in place of "Route 18 places" and the cost strip:

- **Nights.** A moon and the trip's nights as one big figure, the first and last day under it as a date range.
- **Cost.** The trip's cost, travel and stays together, as one big figure in kroner. A thin bar under it fills green for the part paid and grey for the part estimated. A small hatched end with a count shows how many parts have no price. The figure is a button that opens All costs.
- **Booked.** A green check and the count of booked legs.
- **Open.** An amber open circle and the count of open legs. A tap scrolls to the next open leg after the one last shown and lights it for a moment. With nothing open the chip reads All booked.

The route strip from the map work follows the status row, unchanged.

### All costs

Opens in place under the status row. One line per category with something in it: Long haul, Regional flights, Ground, Stays, Hub stays, Cabin bags. Each line is its name, a bar split into paid (solid green) and estimated (solid grey), a hatched piece when parts are not priced, and the kroner at the end with the paid part named under it when there is one. Zero lines are hidden. Checked bags are optional, so they show as their own line with the fee and an Optional chip, outside the total. Under the lines the five biggest items, each with its mode icon, its route, a paid check or an estimate tilde and its kroner. A tap on an item closes the view and takes you to that leg.

### Stops

One line: the flag on the rail, the name (it opens the city card as today), the dates from arrival to departure, and at the right the nights as a figure, a moon and the number. Passing through is a small arrow icon with no number. A stop held by booked legs on both sides shows a lock on the figure. A tap on the figure opens the stepper in a small popover from it, with the chooser of where a night comes from when there are no free nights, as the stepper works now. A booked stay at the stop shows a bed mark by the figure. On the phone the dates sit on the same line as the figure.

### Free nights

A row of its own before the flight home: a dashed marker on the rail, a bed icon, the dates the free nights fall on and their count as a figure. A tap on it opens a list of the stops, and picking one gives it a night from the free ones, the same move as a night more on that stop.

### Legs

One line. The date is plain text in the date column, still a button to the calendar. Then the mode chip: the mode icon, the duration (with a tilde when it is about), the times, then the airline when a flight is picked, then the price, green with a check when paid, grey with a tilde when it is an estimate. The state mark sits on the chip:

- **Booked.** Quiet: a small green check on the chip, nothing more.
- **Open.** An amber chip with an open circle and the action word: Pick flight on a flight with no flight picked, Book on anything else not booked.

The rail keeps its line style for the mode. The teal of ground legs gets more contrast against the card.

### The card of a bus or a boat

It opens in place under its leg, pushing the rows below down, on both desktop and phone, and its leg stays lit while it is open. It shows:

- the place names at both ends, no airport codes on ground legs
- a row of icon facts: how often it runs or when it leaves, the time it takes with its range, a border crossing
- the operator as a line with the mode icon
- the price, grey with a tilde and "estimate" when not paid, green with a check when paid, and the local price range from the map under it
- the notes from the map
- where to book as a link with the site's name, and Mark as booked as today.

The little map shows only when the two ends are far enough apart to read as a way, and it is smaller.

### Today

When today falls inside the trip, a Now block takes the top of the status row: the stop you are at with its nights left, then the next leg with its day, time, booked or open mark and a tap that takes you to it. In the story, the stop of today carries a Today chip, the stops and legs before it are muted, and the page opens scrolled to it. Before the trip and after it nothing changes. In development a `today` URL parameter sets the day, so the state can be seen before the trip starts.

## Roast rulings

1. No trip status at the top. **Take.** Status row with nights, cost with a paid bar, booked and open chips. The "not priced" count sits as a hatched piece of the bar with its number, as the open chip counts legs, not prices.
2. Open items do not stand out. **Take, without the filter.** Open legs get the amber chip with the action word, booked go quiet. An Open only filter would hide the trip's order, the open chip that steps through open legs does the job.
3. All costs answers the wrong question. **Take, without experiences.** Categories split paid and estimated with the biggest items under them. Experiences have no cost in the data the page reads, so there is no line for them.
4. Stop rows lead with an editing control. **Take.** Nights as a figure with dates, the stepper behind a tap, a lock when held, an icon for passing through.
5. Guatemala City contradicts itself. **Take.** Free nights are their own row with dates, count and a way to give them to a stop.
6. The bus card is thin and partly wrong. **Take.** Place names, icon facts, operator line, price by state, how to book from the map's source. A logo is out, the data has none. Pickup point is shown only as the map's notes give it, the data has no field for it.
7. Nothing for today on the phone. **Take.** Now block, today chip, muted past and the page opens on today.
8. The header is admin clutter. **Change.** Save shows only when needed and goes quiet, Build on the map and Export go in one overflow menu, View on map goes. The version stays in view, it tells which version is open. The global nav is the shared app shell and is left to the main session.
9. Leg rows waste their information. **Take.** Airline and price on the chip, the date as plain text, times stay on the chip line on the phone. The date stays in its column on the leg, as the leg is what leaves on that day and the stop now has its own dates.
10. Line styles carry meaning nobody is told. **Take.** Line style stays for the mode, booked state only on the chip, teal gets more contrast.
11. The desktop leg card hides its own anchor. **Take.** The card opens in place under its leg on every screen, and the leg stays lit. This also follows the rule that items open in place.
