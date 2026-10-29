# data/inout.json: ways in, ways home, tickets, options

Built by `scripts/inout.py` from the crawl table (and `chains.py`). Every journey starts and ends at the home airport
(Copenhagen). A **way** is one direction: Copenhagen → an airport in Latin America (`in`) or an airport → Copenhagen
(`home`). What makes ways differ is the detail: hubs, nights at a hub, separate tickets, times. The front end draws a
way from its `timeline` and prices a journey from `options` or from any way in + any way home.

```
{
 "generated_at": "2026-10-28T16:33:20Z", "currency": "DKK", "home": ["CPH"],
 "rating": {"formula": "...", "price_anchor_dkk": 7000, "price_basis": "...", "way_score": "..."},
 "airports": { "MAD": {"name","country","lat","lon","region","utc_offset","home","map_node"?} , ... },
 "tickets":  { "TQ:…": Ticket, ... },
 "ways":     { "I0183": Way, "H0184": Way, ... },
 "options":  [ Option, ... ]            // sorted by rating, best first
}
```

## Ticket (something you buy)
| field | meaning |
|---|---|
| id, quote_id | ticket id; quote_id is the row in quotes.csv |
| source, observed_at | engine and when the price was seen |
| structure | one_way, return, open_jaw, multi_city |
| legs | e.g. ["MAD>SAL", "VVI>MAD"] |
| price_dkk | the fare |
| fare_brand, cabin_bag, checked_bag | as shown by the seller (text) |
| cabin_bag_fee_dkk | estimated cabin-bag fee for this ticket (0 when included) |
| checked_bag_fee_dkk | estimated first checked bag for this ticket, null if unknown |
| tickets_inside, self_transfer | >1 / true for Mix & Match results that are really separate tickets |
| carriers, flags, notes, link | |

## Way (one direction)
| field | meaning |
|---|---|
| id | `I…` for in, `H…` for home |
| direction | `in` or `home` |
| type | `ticket` (one ticket from CPH), `madrid` (ticket from Madrid + own hops), `oneways` (separate one-ways, incl. self-built chains) |
| from, to | first and last airport (CPH and the Latin American airport) |
| depart, arrive | local times of the first departure and the last arrival |
| total_hours | door to door in real time (time zones applied), stops included |
| flying_hours | sum of flight durations as sold (connections inside a ticket included, stops between tickets excluded) |
| flights | number of flight segments |
| hub_nights | nights spent at a hub between tickets |
| changes | changes between separate tickets (self-transfers, day stops, nights) |
| us_transit | any connection in the USA |
| airports | every airport in order, for drawing the route |
| tickets | ticket ids this way uses, in order |
| shared_ticket | a return/open-jaw ticket also used by the paired way (its price sits on the option) |
| paired_with | for `ticket` and `madrid`: the way in the other direction on the same ticket |
| price_dkk | the way's own tickets only (excludes a shared ticket, bags and hub stays) |
| extras | `cabin_bag_fees_dkk`, `checked_bag_fees_dkk`, `hub_nights`, `hub_stay_estimate_dkk` (kept apart from the price) |
| score | 1 to 5, see rating |
| timeline | ordered list of `flight` and stop items, below |

Timeline items, in travel order:
```
{"kind": "flight", "from": "MAD", "to": "SAL", "depart": "2026-12-02T08:10", "arrive": "2026-12-02T15:40",
 "hours": 14.5, "connections": [{"airport": "BOG", "layover_h": 1.17}], "carriers": ["Avianca"],
 "flight_numbers": ["AV…"], "overnight_layover": false, "self_transfer_inside": false, "ticket": "TQ:…"}

{"kind": "night" | "day_stop" | "self_transfer" | "connection", "airport": "MAD",
 "arrive": "2026-12-01T18:55", "depart": "2026-12-02T08:10", "hours": 13.25, "nights": 1,
 "same_ticket": false, "stay_estimate_dkk": 450}
```
- `connection`: a change inside one ticket (protected). `self_transfer`: a change between separate tickets under 8 h.
  `day_stop`: 8 h or more the same day. `night`: one or more nights (`nights` says how many).
- Connections inside a flight item are the sold connections; `layover_h` may be null when the engine did not show it.
- Times are local at the airport; `airports[code].utc_offset` converts them (winter time).

## Option (a way in + a way home)
| field | meaning |
|---|---|
| id | `ENTRY-EXIT-type`, e.g. `SAL-VVI-madrid` |
| type, entry, exit | |
| way_in, way_home | way ids |
| shared_ticket | ticket id when both ways are one ticket |
| price_dkk | all flight tickets of the two ways (shared ticket counted once). Bags and stays excluded |
| extras | `cabin_bag_fees_dkk`, `checked_bag_fees_dkk`, `hub_nights`, `hub_stay_estimate_dkk` |
| rating | `total` /10, `price` 1-5, `way_in` 1-5, `way_home` 1-5 |

Options list the best per (entry, exit, type). For `oneways`, any way in can be combined with any way home: the
journey builder adds `price_dkk` and `extras` of the two ways.

## Rating
- Way score: 5, minus 1 per night at a hub, minus 1 if the way has any change between separate tickets, minus 1 for
  US transit, minus 1 if flying_hours > 20 and another 1 if > 23 (lowest 1).
- Price score: 5 at 7,000 kr for tickets + cabin-bag fees, minus 1 per 1,000 kr more (lowest 1). Hub stays are not
  in the price: the traveller counts nights at a hub as part of the journey.
- Total = 2 x (0.5 price + 0.3 way home + 0.2 way in), out of 10.
