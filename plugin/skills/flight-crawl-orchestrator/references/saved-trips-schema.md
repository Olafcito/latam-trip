# data/saved_trips.json: the chosen trips, ready for the planner

Built by `scripts/seed_trips.py` from `data/seed_spec.json` (which trips, which flights) + `data/inout.json` + the crawl table.

```
{"version": 1, "generated_at": "...", "note": "...", "trips": [Trip]}
Trip = {
 "id": "seed-1-gua-bog", "name": "Guatemala City in, Bogotá home", "rank": 1, "order": ["CA","BO","CO"], "seed": true,
 "inout": {"option_id": "GUA-BOG-ticket", "type": "ticket", "entry": "GUA", "exit": "BOG", "ticket_quote_id": "Q:…",
           "price_dkk": 7637, "rating": {...}, "way_in": Way, "way_home": Way},        // Way as in inout-schema.md
 "segments": [Segment],          // travel order between landing and the flight home
 "legs": [{"cid": "LPB-SJO", "from": "SJO", "to": "LPB", "mode": "flight"}],   // planner TripLeg format
 "totals": {"long_haul_dkk", "in_between_dkk", "flights_total_dkk", "cabin_bag_fees_dkk", "total_with_cabin_bags_dkk",
            "hub_nights", "us_transit"}
}
Segment = {"kind": "overland", "from", "to", "countries": ["SV","HN"], "note"}            // your own route, not priced
        | {"kind": "flight", "from", "to", "cid", "quote_id", "pinned", "price_seen_for", "depart", "arrive", "hours",
           "via", "layover_h", "carriers", "flights", "fare_brand", "cabin_bag", "price_dkk", "cabin_bag_fee_dkk",
           "checked_bag_fee_dkk", "source", "observed_at"}
```
`cid` is the planner's connection id (the two place ids sorted alphabetically, "A-B"). Prices are flight tickets only;
hub nights are counted, never priced. The planner imports each seed once per browser (localStorage key
`latam-trip.seeded`), so a seed the user deletes does not come back.
