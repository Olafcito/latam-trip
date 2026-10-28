<!-- impeccable:product-schema 1 -->
# LatAm trip planner

Written from the briefs in this repo (DESIGN_HANDOFF.md, MAP_BRIEF.md, trip.json) and Simon's messages. The init questions were skipped at Simon's request. Facts marked (inferred) were not confirmed by Simon.

## Platform

web

## Users

One user: Simon, planning his own two-month trip through Central and South America in December 2026 to February 2027. He reads data fluently and wants to decide fast. He uses a laptop first and a phone on the go (inferred).

## Product Purpose

Pick the cheapest sensible way in and way home from Copenhagen, then grow a route around those two fixed flights on a map, seeing at every step what the whole trip costs and how the dates fit.

## Positioning

A private planning tool over crawled flight and route data, not a booking site. It replaces spreadsheets and tab juggling. Nothing is sold and no one else uses it (inferred).

## Operating Context

Opened a few times a week during planning, for sessions of ten to sixty minutes. Mostly on a laptop in the evening, sometimes on a phone to check a saved trip (inferred). Data is a snapshot from crawls, so prices are observed values with a date, never live quotes.

## Capabilities and Constraints

- Two tabs only: Map and Trips. Simon decided this.
- Trips is the entry: a landing page to start a new trip or open a saved one. A new trip starts by choosing the in and out airports.
- The in and out picker is a matrix of arrival airports against departure airports, each cell the best rated option for the pair, plus the option list and a visual view of the two ways with icons for flights, stops and nights.
- Building the route happens on the map. Opening a trip on the map shows only that trip, lights the places reachable from its current end, and keeps a plan panel with places, nights, dates, warnings and totals.
- Saved trips, compare, export and import stay reachable but secondary.
- Danish number style (6.494 kr), tabular figures, hours as "16h 10m", unknown values as "?" never 0.
- Everything in the data stays reachable in the UI.
- Runs from static JSON, no backend, state in localStorage.

## Evidence on Hand

- Simon's feedback (2026-10-28): the old map planner was useless, clicking a trip node only opened the node, the map kept all nodes visible inside a trip, the trip list cluttered the open trip, the matrix was missing, the way timelines were cluttered text.
- The earlier in and out design (docs/in-out/IN_OUT_DESIGN.md) he liked: heat matrix, journey card, map with arcs, two timelines Out and Home.

## Product Principles

- Calm and data first. Numbers lead, decoration follows.
- Much less text, more visual guidance: icons, bars scaled by time, colour by direction and transport mode.
- Each pane does one job and hands off to the next: Trips picks the in and out, the Map builds around them.
- Nothing invented: unknown stays "?".
