# Product decisions

Ids never change. Status is Proposed, Accepted or Reconsidered. Only Simon accepts.

## PROD-001 The earliest stop wins

- **Decision.** When two stops compete for the same days, the earlier one keeps them.
- **Reasoning.** Simon plans in travel order, so a change late in the trip must not push the start around.
- **Applies to.** Every rule that moves dates.
- **Date.** 2026-10-30. **Status.** Accepted.

## PROD-002 No silent spare days

- **Decision.** Days that no stop covers are shown as free nights, never absorbed without a word. Adding a stop uses the free nights and asks only when there are none.
- **Reasoning.** Lost days on a two month trip are expensive and easy to miss.
- **Applies to.** Trip page, trip map, any date change.
- **Date.** 2026-10-30. **Status.** Accepted.

## PROD-003 Items open in place

- **Decision.** A stop, leg or booking opens where it sits, not on a separate page.
- **Reasoning.** Simon keeps his place in the trip while looking at one part of it.
- **Applies to.** Every list and map item.
- **Date.** 2026-10-30. **Status.** Accepted.

## PROD-004 The frontend shows all the data the database holds

- **Decision.** If a table holds a fact for what a screen presents, the screen shows it.
- **Reasoning.** Data that is saved but never shown is data Simon cannot trust or correct.
- **Applies to.** Every screen.
- **Date.** 2026-10-29. **Status.** Accepted.

## PROD-005 Private facts stay private

- **Decision.** Booking references, prices paid, names and attachments live only in owner only tables and a private bucket, never in a built file or a commit.
- **Reasoning.** The repo and the web bucket are public.
- **Applies to.** Every feature that stores or shows a booking.
- **Date.** 2026-11-01. **Status.** Accepted.

## PROD-006 The map is both the overview and the dashboard

- **Decision.** The planner Map tab and the public web map are a geographic interface that doubles as the central management dashboard for places, experiences, training, stays and transport, in one surface. Not a pure geographic overview, not a pure operational planner, and never split into separate overview and management modes or screens.
- **Reasoning.** Review-010 raised Q-011 because the sidebar architecture and the map composition cannot be fixed without knowing which job the map serves. Simon settled it directly during the FEAT-001 discovery chat on 2026-11-04.
- **Applies to.** Map tab (`planner/src`), public web map (`web/src/map`), FEAT-001 and any later map work.
- **Date.** 2026-11-04. **Status.** Accepted.

## PROD-007 People use latam-trip through their own Claude

- **Decision.** latam-trip is offered to other travellers as a connector and a plugin they add to their own Claude. latam-trip hosts the data, the connector and the skills. Each person brings their own Claude subscription and their own browser, signs in as themselves, and sees and changes only their own private data on top of one shared catalogue of places, connections and quotes. latam-trip runs no server side browser workers and no model, with one exception: the `read-booking` function reads a pasted booking confirmation with latam-trip's own Claude API key, capped per owner each month.
- **Reasoning.** It is the shape closest to what exists, it costs latam-trip no tokens, and browser reads stay on the person's own device, since Booking.com blocks datacenter browsers (TECH-002, TECH-003). A hosted agent was the alternative and was set aside on cost and on the scraping it would need.
- **Applies to.** FEAT-006 and every later feature that adds a table, a connector tool or a skill.
- **Date.** 2026-11-06. **Status.** Proposed.

## PROD-008 What a person adds is theirs, the catalogue is shared

- **Decision.** The shared catalogue is places, connections, airports, place profiles and images, experiences and their images, and the shared documents. Every signed in person reads it and only an admin writes it. Everything a person adds, searches or books is private to them: trips, lodgings with their rooms and prices, flight quotes, bookings and their files, tasks and their log, their documents and their profile. A private row never reaches a built file in the public `web` bucket. Simon's own crawled quotes keep feeding the public Options pane, since the pipeline is his.
- **Reasoning.** A person's flight searches give their home airport and the dates they are away, and a person's places to stay and tasks show where they will be. Writes to the catalogue reach every user and the public bucket, so they stay with the one person who reviews them. This changes the word quotes in PROD-007, which put them in the shared catalogue.
- **Applies to.** FEAT-006 and every later feature that adds a table, a connector tool or a built file.
- **Date.** 2026-11-06. **Status.** Proposed.
