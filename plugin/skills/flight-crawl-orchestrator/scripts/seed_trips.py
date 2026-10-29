"""Turn the chosen trips (data/sources/seed_spec.json) into data/web/saved_trips.json for the planner.

Usage: python3 -I seed_trips.py [--root DIR] [--connections FILE]

Each trip = an in/out option from data/built/inout.json (long-haul ways with full timelines, by option id) + segments in
travel order: `overland` blocks (your own route, not priced) and `flight` segments resolved from the crawl table
(pinned quote_id, else the cheapest acceptable quote of the same route). Flights also carry `cid`, the planner's
connection id (alphabetical "A-B", see data/web/connections.json), and the trip carries `legs` in the planner's
TripLeg format ({cid, from, to, mode}) so the frontend can open it as a saved trip.
Schema: references/saved-trips-schema.md.
"""
import datetime as dt, json, os, sqlite3, sys
args = sys.argv[1:]
ROOT = os.path.abspath(args[args.index("--root") + 1]) if "--root" in args else os.getcwd()
CONN = args[args.index("--connections") + 1] if "--connections" in args else os.path.join(ROOT, "data", "web", "connections.json")
spec = json.load(open(os.path.join(ROOT, "data", "sources", "seed_spec.json")))
IO = json.load(open(os.path.join(ROOT, "data", "built", "inout.json")))
BAGS = json.load(open(os.path.join(ROOT, "data", "sources", "bag_rules.json")))
con = sqlite3.connect(os.path.join(ROOT, "data", "built", "trip.db"))
conn_ids = set()
if os.path.exists(CONN):
    conn_ids = {c["id"] for c in json.load(open(CONN))}
OPTS = {o["id"]: o for o in IO["options"]}


def cabin_fee(carriers):
    for r in BAGS:
        if any(r["match"].lower() in (c or "").lower() for c in carriers[:1]):
            return r.get("cabin_dkk") or 0, r.get("regional_dkk")
    return 0, None


def resolve(seg):
    row = con.execute("SELECT quote_id, raw FROM quotes WHERE quote_id=? AND ok=1", (seg.get("quote_id"),)).fetchone()
    pinned = bool(row)
    if not row:
        row = con.execute("SELECT quote_id, raw FROM quotes WHERE pattern_id=? AND ok=1 ORDER BY eff_cost LIMIT 1",
                          (f"R:{seg['from']}>{seg['to']}",)).fetchone()
    if not row:
        return {**seg, "status": "not priced"}
    qid, raw = row
    q = json.loads(raw); o = q.get("out") or {}
    cab, chk = cabin_fee(o.get("carriers") or [])
    cid = "-".join(sorted([seg["from"], seg["to"]]))
    return {"kind": "flight", "from": seg["from"], "to": seg["to"], "cid": cid if not conn_ids or cid in conn_ids else None,
            "quote_id": qid, "pinned": pinned, "source": q.get("source"), "observed_at": q.get("observed_at"),
            "price_seen_for": (o.get("dep") or "")[:10], "depart": o.get("dep"), "arrive": o.get("arr"), "hours": o.get("hours"),
            "via": o.get("via") or [], "layover_h": o.get("layover_h") or [], "carriers": o.get("carriers") or [],
            "flights": o.get("flights") or [], "fare_brand": q.get("fare_brand"), "cabin_bag": q.get("cabin_bag"),
            "price_dkk": q.get("price_dkk"), "cabin_bag_fee_dkk": cab, "checked_bag_fee_dkk": chk}


def way(wid):
    w = IO["ways"][wid]
    out = {k: w[k] for k in ("id", "direction", "type", "from", "to", "depart", "arrive", "total_hours", "flying_hours",
                             "flights", "hub_nights", "changes", "us_transit", "airports", "tickets", "price_dkk", "extras", "timeline")}
    return {**out, "shared_ticket": w.get("shared_ticket")}


trips = []
for t in spec["trips"]:
    o = OPTS.get(t["option"])
    if not o:
        print("option not found:", t["option"]); continue
    segs = [resolve(s) if s["kind"] == "flight" else s for s in t["segments"]]
    fl = [s for s in segs if s["kind"] == "flight" and s.get("price_dkk") is not None]
    between = round(sum(s["price_dkk"] for s in fl)); cab_between = sum(s["cabin_bag_fee_dkk"] for s in fl)
    long_haul = o["price_dkk"]; cab_lh = o["extras"]["cabin_bag_fees_dkk"]
    ticket = IO["tickets"][o["shared_ticket"]] if o.get("shared_ticket") else None
    trips.append({
        "id": t["id"], "name": t["name"], "rank": t["rank"], "order": t["order"], "seed": True,
        "inout": {"option_id": o["id"], "type": o["type"], "entry": o["entry"], "exit": o["exit"],
                  "ticket_quote_id": ticket["quote_id"] if ticket else None, "price_dkk": long_haul,
                  "extras": o["extras"], "rating": o["rating"], "way_in": way(o["way_in"]), "way_home": way(o["way_home"])},
        "segments": segs,
        "legs": [{"cid": s["cid"], "from": s["from"], "to": s["to"], "mode": "flight"} for s in fl if s.get("cid")],
        "totals": {"long_haul_dkk": long_haul, "in_between_dkk": between, "flights_total_dkk": long_haul + between,
                   "cabin_bag_fees_dkk": cab_lh + cab_between, "total_with_cabin_bags_dkk": long_haul + between + cab_lh + cab_between,
                   "hub_nights": o["extras"]["hub_nights"],
                   "us_transit": IO["ways"][o["way_in"]]["us_transit"] or IO["ways"][o["way_home"]]["us_transit"]}})

json.dump({"version": 1, "generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
           "note": spec["note"], "trips": trips}, open(os.path.join(ROOT, "data", "web", "saved_trips.json"), "w"), indent=1, ensure_ascii=False)
for t in trips:
    print(t["rank"], t["name"], t["totals"], [f"{s['from']}>{s['to']}" + ("" if s["kind"] == "overland" else f" {s.get('price_dkk')} cid={s.get('cid')}") for s in t["segments"]])
