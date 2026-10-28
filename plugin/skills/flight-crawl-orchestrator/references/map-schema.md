# Map data schema (nodes, edges, place profiles)

The interactive map reads three record kinds from `data/network/*.jsonl` (built into `data/network/map.json` by `scripts/build_map.py`).

## node (written by network-researcher)
`{"kind":"node","id","name","country","lat","lon","type","iata","popularity","why","source"}`

## edge (written by network-researcher; flight prices refined by Momondo workers)
`{"kind":"edge","from","to","mode","operator","duration_h","duration_range","price_dkk","price_range_local","frequency","overnight","border","both","source","source_year","notes"}`

## profile (written by place-profiler): what the small hover/popup shows
```json
{
 "kind": "profile", "id": "ANT", "checked_at": "2026-10-28",
 "image": {"url": "https://upload.wikimedia.org/...jpg", "page": "https://commons.wikimedia.org/wiki/File:...",
           "credit": "author name", "license": "CC BY-SA 4.0"},
 "tagline": "Colonial town under three volcanoes",
 "summary": "2 sentences: what the place is and what the vibe is.",
 "things_to_do": ["Acatenango overnight volcano hike", "Rooftop bars and the Santa Catalina arch", "Coffee farm tour"],
 "touristy": 4,
 "hostels": [{"name": "Tropicana Hostel", "dorm_dkk": 95, "private_dkk": 320, "source": "url", "source_year": 2025}],
 "sources": ["url"]
}
```
Rules: images only from Wikimedia Commons with a free licence (record credit and licence; landscapes or buildings, no identifiable people). things_to_do: 3 to 5 short items that also show the vibe. hostels: the 2 to 3 most popular, price per night (dorm and private) with source and year. touristy: one number 1 to 5 (1 = local life, 5 = tourist bubble). Never guess a price (null).

## How the map uses it
- Hover on a node: image, tagline, summary, things to do, hostels with price per night.
- Click: "From here" = the node's edges sorted by duration (mode, operator, duration, price, frequency, overnight, border), computed from edges at render time.
- Hover on an edge: mode, duration, price, frequency, source.
- Filters: mode (bus/boat/flight), max duration.
