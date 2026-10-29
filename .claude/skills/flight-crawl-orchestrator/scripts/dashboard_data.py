"""Rows for the Trip Flight Options dashboard: data/web/dash_trips.json (whole trips) and data/web/dash_journeys.json
(long-haul in/out options). One row per journey, sorted by rating. Run after inout.py and itineraries.py.

Usage: python3 -I dashboard_data.py [--root DIR]
"""
import datetime as dt, json, os, sys

args = sys.argv[1:]
ROOT = os.path.abspath(args[args.index("--root") + 1]) if "--root" in args else os.getcwd()
IO = json.load(open(os.path.join(ROOT, "data", "built", "inout.json")))
IT = json.load(open(os.path.join(ROOT, "data", "built", "itineraries.json")))["itineraries"]
OUT = os.path.join(ROOT, "data", "web")
os.makedirs(OUT, exist_ok=True)

NICE = {"San Jose (Costa Rica)": "San José", "Bogota": "Bogotá", "Medellin": "Medellín", "Roatan": "Roatán",
        "Santa Cruz de la Sierra": "Santa Cruz", "Liberia (Costa Rica)": "Liberia"}
REGION = {"CA": "Central America", "CO": "Colombia", "BO": "Bolivia", "MXW": "Mexico"}
TYPE = {"ticket": "One ticket", "madrid": "Madrid ticket + own hops", "oneways": "Separate one-ways"}


def name(a):
    n = IO["airports"].get(a, {}).get("name", a)
    return NICE.get(n, n)


def when(s):
    if not s:
        return ""
    d = dt.datetime.fromisoformat(s[:16])
    return f"{d.day} {d.strftime('%b')} {d.strftime('%H:%M')}"


def via(w):
    return " ".join(w["airports"][1:-1]) or "nonstop"


def stops(w):
    out = []
    for x in w.get("timeline", []):
        if x.get("kind") == "night":
            out.append(f"{x['nights']} night{'s' if x['nights'] > 1 else ''} {x.get('airport', '')}".strip())
        elif x.get("kind") == "day_stop":
            out.append(f"day stop {x.get('airport', '')}".strip())
        elif x.get("kind") == "self_transfer":
            out.append(f"self-transfer {x.get('airport', '')}".strip())
    return "; ".join(out)


def airlines(w):
    seen = []
    for x in w.get("timeline", []):
        for c in x.get("carriers") or []:
            if c and c not in seen:
                seen.append(c)
    return ", ".join(seen)


def legs(o):
    a, b = IO["ways"][o["way_in"]], IO["ways"][o["way_home"]]
    return {"out_via": via(a), "out_leaves": when(a["depart"]), "out_lands": when(a["arrive"]), "out_hours": a["flying_hours"], "out_airlines": airlines(a),
            "home_via": via(b), "home_leaves": when(b["depart"]), "home_lands": when(b["arrive"]), "home_hours": b["flying_hours"], "home_airlines": airlines(b),
            "stops": "; ".join(x for x in [("out: " + stops(a)) if stops(a) else "", ("home: " + stops(b)) if stops(b) else ""] if x)}


journeys = []
for o in IO["options"]:
    journeys.append({"id": o["id"], "in": name(o["entry"]), "out": name(o["exit"]), "type": TYPE.get(o["type"], o["type"]),
                     "rating": o["rating"].get("on_total", o["rating"]["total"]), "rating_flights": o["rating"]["total"],
                     "total_kr": o.get("total_dkk", o["price_dkk"]), "flights_kr": o["price_dkk"],
                     "cabin_bags_kr": o["extras"]["cabin_bag_fees_dkk"] or 0, "hub_stays_kr": o["extras"]["hub_stay_estimate_dkk"] or 0,
                     "hub_nights": o["extras"]["hub_nights"] or 0, **legs(o)})
journeys.sort(key=lambda r: (-r["rating"], r["total_kr"]))

opts = {o["id"]: o for o in IO["options"]}
trips = []
for r in IT:
    o = opts[r["option"]]
    hops = "; ".join(f"{name(h['from'])} → {name(h['to'])} {when(h['depart'])} to {when(h['arrive'])[-5:]}, {h['hours']} h, "
                     f"{round(h['price_dkk']):,} kr" + (" + 300 kr bed (lands at night)" if h.get("night_arrival") else "")
                     for h in r["hops"])
    if r.get("bolivia_internal_dkk"):
        hops += ("; " if hops else "") + f"La Paz → Cochabamba → Santa Cruz (BoA), {round(r['bolivia_internal_dkk']):,} kr"
    trips.append({"id": f"{r['option']}|{'-'.join(r['order'])}", "scenario": r.get("scenario", "") + (" + Mexico" if r["order"][0] == "MXW" else ""),
                  "route": " → ".join(REGION.get(x, x) for x in r["order"]), "in": name(r["entry"]), "out": name(r["exit"]),
                  "type": TYPE.get(r["type"], r["type"]), "rating": r["rating"]["total"], "rating_cost": r["rating"].get("cost"),
                  "rating_hours": r["rating"].get("hours"), "total_kr": r["total_dkk"], "travel_hours": r.get("total_hours"),
                  "long_haul_kr": r["long_haul_dkk"], "regional_kr": r["in_between_dkk"], "hub_nights": r["hub_nights"] or 0, "night_arrivals": r.get("night_arrivals", 0),
                  "regional_flights": hops or "none", **legs(o)})
trips.sort(key=lambda r: (-r["rating"], r["total_kr"]))

json.dump(trips, open(os.path.join(OUT, "dash_trips.json"), "w"), ensure_ascii=False)
json.dump(journeys, open(os.path.join(OUT, "dash_journeys.json"), "w"), ensure_ascii=False)
print(f"trips {len(trips)} | journeys {len(journeys)} | best trip: {trips[0]['in']} > {trips[0]['out']} {trips[0]['route']} "
      f"{trips[0]['total_kr']:,} kr {trips[0]['travel_hours']} h rating {trips[0]['rating']}")

# Regional flights: every acceptable one-way between Latin American airports (no European origins, max 30 h).
# Per airport pair up to three rows: the cheapest, the fastest, and the cheapest that lands between 06:00 and 23:59.
import sqlite3
EU = {"CPH", "MAD", "BCN", "LIS", "CDG", "AMS", "FRA", "LGW", "LHR", "IST", "ALC", "ZRH", "MUC", "BRU"}
con = sqlite3.connect(os.path.join(ROOT, "data", "built", "trip.db"))
pairs = {}
for qid, pid, d, price, hours, via, carriers, flags, raw in con.execute(
        "SELECT quote_id, pattern_id, out_date, price_dkk, out_hours, out_via, out_carriers, flags, raw FROM quotes "
        "WHERE pattern_id LIKE 'R:%' AND ok=1"):
    a, b = pid[2:].split(">")
    if a in EU or b in EU or not price or not hours or hours > 30:
        continue
    o = json.loads(raw).get("out") or {}
    pairs.setdefault((a, b), []).append({"qid": qid, "date": d, "price": price, "hours": hours, "via": via or "",
                                         "carriers": carriers or "", "flags": flags or "", "dep": o.get("dep") or "",
                                         "arr": o.get("arr") or ""})
flights = []
for (a, b), qs in pairs.items():
    dates = len({q["date"] for q in qs})
    day = [q for q in qs if len(q["arr"]) >= 13 and int(q["arr"][11:13]) >= 6]
    picks = [("Cheapest", min(qs, key=lambda q: (q["price"], q["hours"]))),
             ("Fastest", min(qs, key=lambda q: (q["hours"], q["price"])))]
    if day:
        picks.append(("Cheapest landing 06:00 to 23:59", min(day, key=lambda q: (q["price"], q["hours"]))))
    seen = {}
    for label, q in picks:
        if q["qid"] in seen:
            seen[q["qid"]]["pick"] += " + " + label.lower()
            continue
        flags = [f for f in q["flags"].split(",") if f in ("self_transfer", "us_transit", "basic_fare", "long_layover", "airport_change")]
        row = {"id": f"{a}>{b}|{q['qid']}", "from": name(a), "to": name(b), "from_code": a, "to_code": b, "pick": label,
               "price_kr": round(q["price"]), "hours": round(q["hours"], 1), "departs": when(q["dep"]), "lands": when(q["arr"]),
               "via": q["via"].replace("-", " ") or "nonstop", "airlines": q["carriers"],
               "notes": ", ".join(f.replace("_", " ") for f in flags), "dates_searched": dates}
        seen[q["qid"]] = row
        flights.append(row)
flights.sort(key=lambda r: (r["to"], r["price_kr"]))
json.dump(flights, open(os.path.join(OUT, "dash_flights.json"), "w"), ensure_ascii=False)
print(f"regional flight rows {len(flights)} over {len(pairs)} airport pairs")
