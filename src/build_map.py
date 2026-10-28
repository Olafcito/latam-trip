"""Build the map dataset: nodes + edges + profiles from data/network/*.jsonl, plus priced flight edges from the crawl table.

Usage: python3 -I build_map.py [--root DIR]
Writes data/network/map.json ({"nodes":[...], "edges":[...]}; profile fields merged into nodes),
data/network/nodes.csv and data/network/edges.csv.
Flight edges from the crawl (pattern R:a>b one-ways, RR:a>b/b>a returns) carry "flights" (up to 6 distinct one-ways with
quote_id, local depart/arrive, hours, price, carriers, via, fare and bags) and: cheapest acceptable one-way price,
shortest hours, whether a nonstop exists, vias, carriers, the dates seen, and the return price when searched.
Airports referenced by edges but missing as nodes are reported (another region's researcher usually supplies them).
"""
import csv, glob, json, os, sqlite3, sys
args = sys.argv[1:]
ROOT = os.path.abspath(args[args.index("--root") + 1]) if "--root" in args else os.getcwd()
NET = os.path.join(ROOT, "data", "network")
nodes, edges, profiles, patches = {}, [], {}, []
for f in sorted(glob.glob(os.path.join(NET, "*.jsonl"))):
    for line in open(f):
        line = line.strip()
        if not line:
            continue
        try:
            r = json.loads(line)
        except json.JSONDecodeError:
            continue
        k = r.get("kind")
        if k == "node":
            nodes.setdefault(r["id"], {}).update({x: y for x, y in r.items() if y is not None})
        elif k == "edge":
            r["_src"] = os.path.basename(f)
            edges.append(r)
        elif k == "profile":
            profiles.setdefault(r["id"], {}).update({x: y for x, y in r.items() if not (x == "image" and y is None and profiles.get(r["id"], {}).get("image"))})
        elif k in ("profile_hostels", "profile_image"):
            patches.append(r)
# patches (browser-sourced images and hostel prices) win over the profilers' nulls
for r in patches:
    if r["kind"] == "profile_hostels" and r.get("hostels"):
        old = {h.get("name"): h for h in profiles.get(r["id"], {}).get("hostels") or []}
        profiles.setdefault(r["id"], {"id": r["id"]})["hostels"] = r["hostels"] + [h for n, h in old.items()
                                                                                  if n not in {x.get("name") for x in r["hostels"]} and (h.get("dorm_dkk") or h.get("private_dkk"))]
    elif r["kind"] == "profile_image" and r.get("image"):
        profiles.setdefault(r["id"], {"id": r["id"]})["image"] = r["image"]
for nid, p in profiles.items():
    if nid in nodes:
        nodes[nid]["profile"] = {x: y for x, y in p.items() if x not in ("kind", "id")}

# priced flight edges from the crawl
fl = {}
con = sqlite3.connect(os.path.join(ROOT, "data", "crawl.db"))
for qid, pid, price, hours, raw in con.execute(
        "SELECT quote_id, pattern_id, price_dkk, out_hours, raw FROM quotes WHERE (pattern_id LIKE 'R:%' OR pattern_id LIKE 'RR:%') AND ok=1"):
    q = json.loads(raw)
    rt = pid.startswith("RR:")
    a, b = pid.split(":")[1].split("/")[0].split(">")
    e = fl.setdefault((a, b), {"from": a, "to": b, "mode": "flight", "source": "crawl", "oneway_min_dkk": None,
                                "oneway_min_hours": None, "fastest_hours": None, "fastest_price_dkk": None, "nonstop": False,
                                "vias": set(), "carriers": set(), "dates": set(), "return_min_dkk": None, "quotes": 0})
    e["quotes"] += 1
    o = q.get("out") or {}
    if rt:
        e["return_min_dkk"] = min(x for x in (e["return_min_dkk"], price) if x is not None)
        continue
    if e["oneway_min_dkk"] is None or price < e["oneway_min_dkk"]:
        e["oneway_min_dkk"], e["oneway_min_hours"] = price, hours
    if hours and (e["fastest_hours"] is None or hours < e["fastest_hours"]):
        e["fastest_hours"], e["fastest_price_dkk"] = hours, price
    if o.get("stops") == 0 and o.get("flights"):
        e["nonstop"] = True
    e["vias"].update(o.get("via") or [])
    e["carriers"].update(o.get("carriers") or [])
    if o.get("dep"):
        e["dates"].add(o["dep"][:10])
    e.setdefault("flights", []).append({"quote_id": qid, "depart": o.get("dep"), "arrive": o.get("arr"), "hours": hours,
                                        "price_dkk": price, "carriers": o.get("carriers") or [], "via": o.get("via") or [],
                                        "layover_h": o.get("layover_h") or [], "fare_brand": q.get("fare_brand"),
                                        "cabin_bag": q.get("cabin_bag"), "checked_bag": q.get("checked_bag"),
                                        "overnight_layover": bool(o.get("overnight_layover")), "source": q.get("source")})
for e in fl.values():
    e["vias"], e["carriers"], e["dates"] = sorted(e["vias"]), sorted(e["carriers"]), sorted(e["dates"])
    keep, seen = [], set()   # up to 6 distinct flights per route, cheapest first, with clock times
    for f in sorted(e.get("flights", []), key=lambda f: (f["price_dkk"] or 1e9, f["hours"] or 99)):
        k = (tuple(f["carriers"]), tuple(f["via"]), (f["depart"] or "")[11:16])
        if k not in seen:
            seen.add(k); keep.append(f)
    e["flights"] = keep[:6]
    edges.append(e)

ids = set(nodes)
missing = sorted({x for e in edges for x in (e["from"], e["to"]) if x not in ids})
json.dump({"nodes": list(nodes.values()), "edges": edges, "missing_nodes": missing},
          open(os.path.join(NET, "map.json"), "w"), ensure_ascii=False, indent=1)
ncols = ["id", "name", "country", "lat", "lon", "type", "iata", "popularity", "why"]
with open(os.path.join(NET, "nodes.csv"), "w", newline="") as fh:
    w = csv.writer(fh); w.writerow(ncols + ["has_profile"])
    for n in nodes.values():
        w.writerow([n.get(c) for c in ncols] + [int("profile" in n)])
ecols = ["from", "to", "mode", "operator", "duration_h", "duration_range", "price_dkk", "frequency", "overnight", "border",
         "both", "oneway_min_dkk", "oneway_min_hours", "fastest_hours", "fastest_price_dkk", "nonstop", "vias", "carriers",
         "dates", "return_min_dkk", "source", "source_year", "notes"]
with open(os.path.join(NET, "edges.csv"), "w", newline="") as fh:
    w = csv.writer(fh); w.writerow(ecols)
    for e in edges:
        w.writerow([" ".join(e[c]) if isinstance(e.get(c), list) else e.get(c) for c in ecols])
print(f"nodes {len(nodes)} (profiles {len(profiles)}), edges {len(edges)} (crawl flights {len(fl)}), missing nodes: {missing}")
