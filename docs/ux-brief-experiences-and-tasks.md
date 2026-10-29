# Brief: experiences, saved lists, trip builder and asking Claude

This brief describes what the trip app needs to do next and the information it has to show. It says nothing about layout, visual style or components. Those are yours to design.

## Context

The app is Simon's planner for a two-month solo trip through Central America, Colombia and Bolivia (December 2026 to February 2027). It already has a map of places and connections (buses, boats, flights), place panels (tagline, summary, things to do, hostels, photo) and trip scenarios. Simon travels slowly and decides on the ground. He uses the app on his laptop while planning and on his phone while travelling.

Five new needs:
1. **Experiences.** Things to do become their own database, linked to places, with categories and photos.
2. **Saved lists.** Simon can save places and experiences he wants to check out.
3. **Trip builder.** Simon can ask for flights between any two places, or build his own itinerary leg by leg with dates and flexible days, and have Claude price it.
4. **Ask Claude.** From anywhere in the app, Simon can send a job to Claude (find flight prices, find hostel or hotel prices, research something). He can either queue it on a checklist or start it right away.
5. **Freshness.** The app shows, discreetly, when its data was last checked, and offers one button to update everything.

## 1. Experiences

### User stories
- When I open a place, I want to see everything worth doing there as experiences, so I can judge whether the place is worth a stop.
- I want to browse all experiences across the trip, filtered by category (for example Diving), so I can find, say, every shark dive in the region.
- I want to filter by what fits my trip: good in December and January, price, country, whether it needs experience or a certification, and whether it has been properly researched.
- When I open an experience, I want its key facts at a glance (price in kroner, season, conditions in Dec/Jan, duration, requirements) and the sources, so I can trust it.
- Some experiences are not at a place on the map (bull sharks at Playa del Carmen, Cocos Island). I still want to find them and see where they are.
- I want to see how a place's character (its categories, such as Beach or Nature) connects to the kinds of experiences it offers, and to go from a category to the places that are strong in it.
- I want to tell the researched experiences apart from the quick ones taken from a place's things-to-do list, and to ask Claude to research a quick one properly (see Ask Claude).

### Information per experience (`data/web/experiences.json`)
- `name`, `category` (one of 11), `tags` (for example `sharks`, `course`, `volcano`)
- `places` (map place ids; can be several or none), `area` (a name when there is no map place), `country`, `lat`, `lon`
- `image` (`url`, `page`, `credit`, `licence`) and `image_source`: `own` (a photo of this experience), `place` (the place's photo standing in) or `category` (the category photo standing in). Credits must be visible somewhere.
- `summary`, `season`, `dec_jan` (conditions in December and January), `price` (as published), `price_dkk`, `duration`, `requirements`
- `details`: category-specific facts. For diving these are water, animals, shark_chance, depth, cert and logged_dives_min. Other categories will get their own over time, so show whatever is present.
- `researched` (true or false), `checked_at`, `sources` (links)
- `saved_in` (list ids)

### Categories (`data/web/experience_categories.json`)
There are 11 over-categories: Diving & snorkelling, Wildlife, Hiking & volcanoes, Beaches & islands, Ruins & history, Culture & markets, Food & drink, Nightlife & dance, Training, Adventure, Courses. Each has a `name`, an `image` (a stand-in photo until its own is found; Training and Courses have none yet) and `place_categories`, which are the place categories it relates to (Beach, Nature, Altitude, Ruins, Colonial, Markets, Food, Nightlife). The categories are meant for filtering and for visual browsing.

### Per place (`data/web/places.json`)
- `experience_ids`: the experiences at this place.
- `categories`: the place's character (existing).
- `stay_quotes`: priced beds found by Claude for specific dates: `site`, `name`, `type`, `room` (dorm or private), `dkk_per_night`, `nights`, `rating`, `reviews`, `check_in`, `check_out`, `url`, `observed_at`, `notes`. Simon wants to see what a bed costs for given dates and how fresh that price is.

## 2. Saved lists

### User stories
- I want to save a place or an experience to a list (the first one is "Want to check out") with an optional note, from wherever I see it.
- I want to see each list, open its items, add notes and remove items.
- I want saved things to stand out on the map and in browsing.
- Saving should feel instant. The lists that Claude reads live in the repo, though, so I need to see whether my latest changes have reached the repo yet, and to send them over in one go.

### Information (`data/web/lists.json`)
`lists`: each has an `id`, a `name` and `items`. Each item has a `type` (`place` or `experience`), an `id`, `added` (a date) and a `note`. Changes reach the repo as a `lists_update` task (see below). The app has no way to write to the repo itself.

## 3. Trip builder (in the trips part, next to the existing inbound and outbound options)

### User stories
- I want to ask for flights between any two places, including places that aren't the trip's entry or exit, on a date I choose, for example Cancún to Guadalajara on 5 Dec.
- I want to build my own itinerary leg by leg, for example Cancún > Guadalajara > Guatemala City, or the whole trip: Copenhagen > Cancún, Cancún > Guadalajara, Guadalajara > Guatemala City, then later Santa Cruz > Copenhagen. A leg may start somewhere other than where the previous one ended, because I travel overland in between.
- For each leg I want to pick a date and say how many days around it may also be searched (0 to 3 either side).
- I want to see straight away what is already known for each leg from earlier searches (cheapest and fastest, local departure and arrival clock times, hours, airlines, when it was checked), and which legs have never been priced.
- I want to send the itinerary to Claude to price (checklist or now). Legs touching Europe are always priced as one combined ticket from and back to Copenhagen, together with my home leg; I don't have to think about that.
- When the results are in, I want to see the itinerary with a price per leg, the total in kroner, total travel hours, any night landings and any self-transfers, and compare it with the existing whole-trip options and their ratings.
- I want to name, save, change and delete my itineraries.

### Information
- Existing: `data/web/connections.json` (known legs and prices with `observed_at`) and the dashboard datasets for whole trips and long-haul tickets.
- An itinerary is sent as a `flight_prices` task: `name`, and `legs`, each with `from`, `to` (IATA codes), `date` and `flex_days`. After Claude has run it, its prices are in the same data as everything else (connections and the long-haul options) and in `data/web/task_log.json` under its name.
- Places without an airport: a leg needs an airport, so the app should help pick the nearest one (places have `iata`, or the nearest hub).

## 4. Ask Claude

### User stories
- From a place, a connection, a flight or a trip, I want to ask "find flight prices" for chosen airports and dates (one-way, return, or several legs, with flexible days).
- From a place, I want to ask "find hostel or hotel prices" for check-in and check-out dates, choosing hostel and/or hotel, dorm, private or either, and an optional maximum per night.
- From an experience, I want to ask Claude to research it, optionally with my own question (for example "what does it cost in January and how do I book").
- I want to ask Claude to research a new place that isn't on the map yet, or just ask a free question.
- For every request I choose one of two ways:
  - **Add to checklist.** The task goes on a list that Claude works through when I say "check the checklist".
  - **Ask Claude now.** I get the request ready to start in a Claude chat right away.
- I want to see the checklist: what's open, what's done, when it was done, a one-line result, and a link to the full result. Results then show up where they belong (flight prices on the map and dashboard, bed prices on the place, research on the experience).

### How the hand-over works (fixed, see `docs/claude-tasks.md`)
- **Add to checklist** opens a prefilled GitHub issue in `Olafcito/latam-trip` with the label `claude-task`, and Simon presses Submit on GitHub. Issue title: `[<type>] <summary>`. Body: one human line plus one fenced `json` block with the task.
- **Ask Claude now** is the same task wrapped in a short prompt (template in `docs/claude-tasks.md`) that Simon pastes into, or opens directly in, Claude.
- The checklist can be read live and without a login from `https://api.github.com/repos/Olafcito/latam-trip/issues?labels=claude-task&state=all`. Done tasks are also in `data/web/task_log.json` (`issue`, `type`, `task`, `done_at`, `summary`, `outputs`).
- Task types and fields: `flight_prices` (`name`, `legs` of from/to/date/flex_days), `stay_prices` (`place`, `check_in`, `check_out`, `kinds`, `room`, `max_dkk_per_night`), `experience_research` (`experience` or `place`, `question`, `dates`), `place_research` (`name`, `country`, `question`), `lists_update` (`list`, `add`, `remove`), `question` (`text`), `refresh` (`scope`, `item`, `older_than_days`). Every task can carry a free `note`.

## 5. Freshness and update

### User stories
- I want to see, very discreetly (a corner, never in the way), when the data was last checked: flights, beds, experiences.
- I want one update button there that asks Claude to re-check everything that's stale (older than 3 days by default), the same two ways as other tasks (checklist or now). Per item (a leg, a place's beds, an experience) I want to be able to ask for just that one to be refreshed.
- Individual prices should show how old they are, so I can judge whether to trust them.

### Information
`data/web/meta.json`: `built_at` and `last_checked` with `flights`, `stays`, `experiences`, `places`, `tasks` (ISO times). The update button sends a `refresh` task: `scope` (`all`, `flights`, `stays`, `experiences`), optional `item`, `older_than_days`.

## Constraints
- No passwords or tokens in the app. Simon confirms every issue himself on GitHub.
- Prices are in Danish kroner. Times are local clock times. Copy never uses em or en dashes.
- The app must work well on a phone, including with patchy connectivity.
- Photos need their credit and licence shown.
- The app never offers to book anything. Claude only searches and reads.
