# Scoring: effective cost

Effective cost (DKK-equivalent) = price
 + per_hour x hours, for every leg
 + extra_per_hour x hours beyond soft_hours, for the first and last (long-haul) legs
 + overnight penalty per leg with an overnight layover
 + us_transit penalty per leg via a US airport (ESTA, re-check of bags)
 + self_transfer penalty (separate tickets, missed-connection risk)
 + tight_connection penalty when any layover is shorter than tight_connection_h (default 700 DKK, 1.0 h): engines and OTAs sell connections below the airline's minimum, e.g. 50 min in Bogotá, which Google Flights hides
 + airport_change penalty
 + no_changes penalty when the fare cannot be changed
 + a missing leg counts as missing_side_hours hours (so incomplete rows do not rank too well)

Default weights (Simon's trip; set your own in data/sources/trip.json "scoring"):
per_hour 150, soft_hours 23, extra_per_hour 150, overnight 800, self_transfer 1500, us_transit 500, airport_change 1000, no_changes 300, missing_side_hours 24.

Hard limit: any leg longer than max_hours_one_way (30 h) makes the quote unacceptable (ok=0). It stays in the table for analytics but never in rankings.

How to calibrate with a user: ask what one hour of travel is worth to them, how many hours they consider normal, and how they feel about self-transfers, US transit and overnight layovers. Write the answers into data/sources/trip.json.

Scenario totals (scripts/scenarios.py) = main ticket + the regional legs the scenario forces (cheapest acceptable one-way of each), with effective cost added up the same way.

## Scenario rating shown to the traveller (28 Oct, Simon)
Score each whole-trip scenario 1 to 5 on four parts, then rate /10 = 2 x (0.35 price + 0.30 way home + 0.20 in between + 0.15 way in).
- Price: 5 at 12,500 kr total with cabin bag, minus 1 per 1,000 kr more (min 1).
- Way in / way home: start 5; -1 per night at a hub, -1 for a change between separate tickets, -1 US transit, -1 if flying time > 20 h, another -1 if > 23 h.
- In between: start 5; -1 per regional flight beyond two (domestic Bolivia BoA not counted), -1 if a flight leaves or lands 00:00 to 05:00.
Layout the traveller asked for: section 1 = one table of only the long-haul in/home flights (returns and separate tickets), one row per flight with departs/arrives, with extra rows for a hub night or a self-transfer and a bold total per option; section 2 = the flights in between as additions; section 3 = the rated scenarios. Never cram several facts into one cell.
