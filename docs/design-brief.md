# Design brief: trip planner, next version

Please design the next version of my trip planner app: the user flows, the screens, and their states on laptop and phone (including empty, loading, offline and error). A developer will build it from your design afterwards, so make the hand-off clear: which screens exist, what each one shows, and how you get between them. Layout, visual style and components are up to you. This brief only says what the app must do and what information it shows.

## The app today

It's a planner for my two-month solo backpacking trip through Central America, Colombia and Bolivia, from early December 2026 to early February 2027. I travel slowly and decide on the ground, and I use the app on my laptop while planning and on my phone while travelling.

It has three parts today:
- **Map:** a dark, calm map of about 70 places (cities, islands, parks), with buses, shuttles, boats and flights between them. Hovering or tapping a place shows a card with a photo and its credit, a tagline, a short summary, things to do, how touristy it is (1 to 5) and a few hostels with prices per night.
- **Trips:** ways into and out of the region (long-haul tickets from Copenhagen) and whole-trip options, each with a rating, total price in kroner, travel hours and the regional flights in between.
- **Dashboard tables:** whole trips, long-haul tickets, and regional flights into and out of any airport.

All prices and searches come from Claude, which runs flight, hostel and research searches for me and writes the results into the app's data.

## What's new

### 1. Experiences
Things to do become their own collection, linked to places, with categories and photos.

- When I open a place, I want to see everything worth doing there, so I can judge whether the place is worth a stop.
- I want to browse all experiences across the trip by category, for example every shark dive in the region.
- I want to filter by what fits my trip: good in December and January, price, country, whether it needs experience or a certificate, and whether it has been properly researched.
- When I open an experience, I want the key facts at a glance and the sources, so I can trust it.
- Some experiences aren't at a place on the map (bull sharks at Playa del Carmen, Cocos Island). I still want to find them and see where they are.
- I want to see how a place's character (Beach, Nature, Ruins, Colonial, Markets, Food, Nightlife, Altitude) connects to the kinds of experiences it offers, and to go from a category to the places that are strong in it.
- I want to tell researched experiences apart from quick ones taken from a place's to-do list, and to ask Claude to research a quick one properly (see 4).

What each experience has:
- name, category and tags (such as sharks, course, volcano)
- the place or places it belongs to, or an area name when it isn't at a map place, and its location
- a photo with credit and licence. The photo is either its own, the place's photo standing in, or the category's photo standing in.
- a short summary, season, conditions in December and January, price as published and in kroner, duration, requirements
- category-specific facts. For diving these are water, animals, chance of seeing sharks, depth, certificate needed and minimum logged dives. Other categories will get their own facts later.
- researched or not, the date it was checked, and source links

There are 11 categories, each with a photo: Diving & snorkelling, Wildlife, Hiking & volcanoes, Beaches & islands, Ruins & history, Culture & markets, Food & drink, Nightlife & dance, Training, Adventure, Courses. Today there are about 300 experiences; 14 are fully researched (dive sites, a volcano hike, a rainforest hike) and the rest come from the places' to-do lists.

Places also gain bed prices for specific dates, found by Claude: site, name, dorm or private, price per night, rating, dates and when it was found. I want to see what a bed costs for given dates and how fresh that price is.

### 2. Saved lists
- I want to save a place or an experience to a list (the first one is "Want to check out") with an optional note, from wherever I see it.
- I want to see each list, open its items, add notes and remove items.
- I want saved things to stand out on the map and when browsing.
- Saving should feel instant. Claude only sees my lists once I send the changes over (as a task, see 4), so I need to see what hasn't been sent yet and send it all in one go.

### 3. Trip builder (in the trips part, next to the ways in and home)
- I want to ask for flights between any two places, including places that aren't the start or end of the trip, on a date I choose, for example Cancún to Guadalajara on 5 Dec.
- I want to build my own itinerary leg by leg, for example Cancún > Guadalajara > Guatemala City, or the whole trip: Copenhagen > Cancún, Cancún > Guadalajara, Guadalajara > Guatemala City, then later Santa Cruz > Copenhagen. A leg may start somewhere other than where the previous one ended, because I travel overland in between.
- For each leg I want to pick a date and how many days around it may also be searched (0 to 3 either side).
- Places without an airport need the nearest airport picked for me.
- I want to see straight away what's already known for each leg from earlier searches (cheapest and fastest, local departure and arrival times, hours, airlines, when it was checked), and which legs have never been priced.
- I want to send the itinerary to Claude to price it (see 4). Legs to and from Europe are always priced as one combined ticket, so I don't have to think about that.
- Once prices are in, I want the itinerary with a price per leg, the total in kroner, total travel hours, night landings and self-transfers, compared with the existing whole-trip options.
- I want to name, save, change and delete my itineraries.

### 4. Ask Claude
- From a place, a leg, an itinerary or an experience, I want to ask Claude to: find flight prices, find hostel or hotel prices for dates (hostel and/or hotel; dorm, private or either; optional maximum per night), research an experience (optionally with my own question), research a new place that isn't on the map, or answer a free question.
- For every request I choose one of two ways:
  - **Add to checklist:** the request goes on a checklist that Claude works through later when I tell it to. Technically this opens a prefilled page on GitHub in a new tab, where I press Submit.
  - **Ask Claude now:** the request is copied as a ready prompt and Claude opens in a new tab, so I can paste it and start right away.
- I want a checklist view: what's open, what's done, when it was done, a one-line result and a link to the full result. Results then show up where they belong: flight prices in the trips and on the map, bed prices on the place, research on the experience.

### 5. Freshness and update
- I want to see, very discreetly (a corner, never in the way), when the data was last checked: flights, beds and experiences.
- One update button there asks Claude to re-check everything stale (older than 3 days), the same two ways as in 4. For a single leg, place or experience, I want to refresh just that one.
- Individual prices show how old they are, so I can judge whether to trust them.

## Constraints
- Prices are in Danish kroner and times are local clock times.
- No em or en dashes in any text.
- The app never offers to book anything. It only shows prices and asks Claude to search.
- It has to work well on a phone, including with patchy connectivity.
- Photos always show their credit and licence.
- No logins or passwords in the app.
