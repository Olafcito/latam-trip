# Product overview

## What it is

latam-trip is Simon's own planner for a two month solo trip through Central America, Colombia and Bolivia, December 2026 to February 2027. Prices are in Danish kroner and times are local clock times.

Two apps share one Supabase database:

- **The planner** (`planner/`), with two tabs. Trips lists the planned versions of the trip and opens one as a page of stops, legs, stays and bookings. Map shows the researched network.
- **The web map** (`web/`), the public route map with the Options pane for whole trips, long haul tickets and regional flights.

A Claude plugin crawls flights, and a trip MCP lets a phone session read and save trip data.

## Who and when

One user, Simon, in two moments:

- **Before the trip, on his laptop.** He compares versions of the route, picks flights and stays, books them and keeps the booking facts in one place.
- **During the trip, on his phone.** He needs today's stop, the next leg and its booking facts at a glance, often offline or in a hurry.

## Screens

| Screen | Where |
|---|---|
| Trips list | planner, Trips tab |
| Trip page and trip map | planner, a trip |
| Flight sheets, booked flight sheet, way picker | planner, a leg of a trip |
| City sheets | planner, a stop of a trip |
| Map tab | planner, Map tab |
| Profile sheet | planner, the person mark at the end of the header |
| Web map | web |

Feature specs live in `features/`. The older specs in `docs/superpowers/specs/` cover the screens above.
