# Adapter notes (learned in round 1)
- Expedia: user_locale "da-DK" + DK user_location gives "Unknown error". Use user_locale "en-US", user_location null. Prices come in USD; convert at the rate stated in the task. No booking links returned. Through-flights can hide stops.
- Expedia: returns are cheap relative to one-ways (SJO one-way 5,900 vs return 7,100), so always price the return as well as open jaws.
- Kiwi: no bag prices. Cheap mainly on one-ways with 2 to 3 tickets (Avianca + Ryanair via BOG/MAD). Returns never beat known prices. Derive self_transfer from multiple tickets.
- Kiwi: cap of 8 rows can hide notable rank 9 to 10 results: scan the top 12, keep the distinct ones.

## Decisions 28 Oct 11:16 (Simon)
- Kiwi is dropped from the crawl.
- Momondo is the primary engine (returns and multi-city), Google Flights second (date grid, cross-check). Expedia only as a cheap scout for plain returns/one-ways if needed.
- Multi-city and returns tend to be cheaper than one-ways; one-ways are still worth scouting because they reveal hubs and carriers to build multi-city tickets from.
- Google Flights: the consent page appears first (reject it). Typing into the form was unreliable; building search URLs from the decoded `tfs` parameter of a working search was reliable. First load can show unsettled prices: wait about 6 s more and re-read. Multi-city shows the trip total on the first leg; open only the 2 cheapest second legs.
- Round 1 result: every open jaw home from VVI goes VVI-GRU (Gol) then CDG (AF) or AMS (KL), about 24 h, or Copa+KLM via PTY 20h45 at about +600 DKK. The outbound adds almost nothing on top of the VVI one-way (9,062 open jaw vs 8,973 one-way).
