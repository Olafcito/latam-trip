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

Default weights (Simon's trip; set your own in trip.json "scoring"):
per_hour 150, soft_hours 23, extra_per_hour 150, overnight 800, self_transfer 1500, us_transit 500, airport_change 1000, no_changes 300, missing_side_hours 24.

Hard limit: any leg longer than max_hours_one_way (30 h) makes the quote unacceptable (ok=0). It stays in the table for analytics but never in rankings.

How to calibrate with a user: ask what one hour of travel is worth to them, how many hours they consider normal, and how they feel about self-transfers, US transit and overnight layovers. Write the answers into trip.json.

Scenario totals (scripts/scenarios.py) = main ticket + the regional legs the scenario forces (cheapest acceptable one-way of each), with effective cost added up the same way.
