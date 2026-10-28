"""Whole-trip itineraries: every in/out option (inout.json) x every sensible order of regions, with the flights in between.

Usage: python3 -I itineraries.py [--root DIR] [--json FILE] [--top N]

Regions: CA (Central America, bus-connected: GUA SAL SAP TGU RTB MGA SJO LIR), CO, BO (BoA LPB>CBB>VVI added when
Bolivia is visited). Scope (28 Oct): the trip starts in Central America (ENTRY_REGIONS), may visit Colombia and/or
Bolivia once each (OPTIONAL), and ends in Central America or Bolivia (EXIT_REGIONS); Bolivia as exit must come last.
Scenario A = Bolivia visited, B = no Bolivia.
Each hop between regions is the acceptable one-way between the two regions' airports with the lowest
effective cost + 100 kr per travel hour (hops over 15 h are skipped).
Total cost = flight tickets + cabin-bag fees + hub stays (inout total) + hop prices + hop cabin-bag fees (+ BoA hops)
  + 300 kr per regional flight landing between 00:00 and 05:59 (the bed is paid from the night before).
Total hours = flying hours of the way in and the way home + hours of every hop (layovers included) + 2 h for BoA hops.
Rating /10 = 2 x (0.35 cost + 0.35 hours + 0.15 way home + 0.15 hassle):
  cost 5 at 7,000 kr or less, minus 1 per 2,000 kr more; hours 5 at 34 h or less (the fastest long-haul pair),
  minus 1 per 8 h more (so 1 travel hour weighs like 250 kr; a 16 h Bolivia detour costs 2 hour points);
  hassle = average of the way-in score and the hops score (5, minus 1 per hop beyond two, minus 1 per hop that leaves
  or lands between 00:00 and 05:00); way scores from inout.json; every score min 1.
"""
import json, os, sqlite3, sys
args = sys.argv[1:]
ROOT = os.path.abspath(args[args.index("--root") + 1]) if "--root" in args else os.getcwd()
OUT = args[args.index("--json") + 1] if "--json" in args else os.path.join(ROOT, "data", "itineraries.json")
TOP = int(args[args.index("--top") + 1]) if "--top" in args else 40
IO = json.load(open(os.path.join(ROOT, "data", "inout.json")))
cfg = json.load(open(os.path.join(ROOT, "trip.json")))
BAGS = json.load(open(os.path.join(ROOT, "data", "bag_rules.json")))
con = sqlite3.connect(os.path.join(ROOT, "data", "crawl.db"))
W = cfg["scoring"]

REG = {**{a: "CA" for a in "GUA SAL SAP TGU RTB MGA SJO LIR".split()},
       **{a: "CO" for a in "BOG MDE CTG CLO SMR ADZ PEI".split()},
       **{a: "BO" for a in "LPB VVI CBB".split()}, "GDL": "MXW", "MEX": "MXW", "CUN": "MXE"}
NIGHT_BED = 300   # kr: a regional flight landing 00:00-05:59 needs the bed from the night before (hostel private room)
ENTRY_REGIONS, EXIT_REGIONS, OPTIONAL = {"CA", "MXW"}, {"CA", "BO"}, ("CO", "BO")   # MXW = a week in Guadalajara / Mexico City, then a flight into Central America
NO_ENTRY = {"GUA"}   # Simon: not starting in Guatemala
BO_INTERNAL = sum(con.execute("SELECT MIN(price_dkk) FROM quotes WHERE pattern_id=? AND ok=1", (p,)).fetchone()[0] or 0
                  for p in ("R:LPB>CBB", "R:CBB>VVI"))
NAME = {a: v.get("name", a) for a, v in IO["airports"].items()}


def cabin_fee(carriers):
    for r in BAGS:
        if any(r["match"].lower() in (c or "").lower() for c in carriers[:1]):
            return r.get("cabin_dkk") or 0
    return 0


# best one-way per airport pair
best = {}
for qid, pid, eff, price, raw in con.execute("SELECT quote_id, pattern_id, eff_cost, price_dkk, raw FROM quotes WHERE pattern_id LIKE 'R:%' AND ok=1"):
    a, b = pid[2:].split(">")
    if a not in REG or b not in REG or REG[a] == REG[b]:
        continue
    o = json.loads(raw).get("out") or {}
    cf = cabin_fee(o.get("carriers") or [])
    if (o.get("hours") or 99) > 15:
        continue
    e = eff + cf + 100 * (o.get("hours") or 0)
    if (a, b) not in best or e < best[(a, b)]["eff"]:
        dep, arr = o.get("dep") or "", o.get("arr") or ""
        night = any(t[11:13] and int(t[11:13]) < 5 for t in (dep, arr) if len(t) >= 13)
        bed = len(arr) >= 13 and int(arr[11:13]) < 6   # landing 00:00-05:59: the bed is paid from the night before
        best[(a, b)] = {"from": a, "to": b, "quote_id": qid, "price_dkk": price, "cabin_bag_fee_dkk": cf, "eff": e,
                        "depart": dep, "arrive": arr, "hours": o.get("hours"), "carriers": o.get("carriers") or [],
                        "via": o.get("via") or [], "night_hours": night, "night_arrival": bed, "date_seen": dep[:10]}


def hop(X, Y, frm=None, to=None):
    c = [v for (a, b), v in best.items() if REG[a] == X and REG[b] == Y and (frm is None or a == frm) and (to is None or b == to)]
    return min(c, key=lambda v: v["eff"]) if c else None


BUS_CONNECTED = {"CA", "BO"}   # Colombia is not: a hop out of Colombia leaves from the city you flew into


def sequences(start, end):
    from itertools import permutations
    out = []
    for n in range(len(OPTIONAL) + 1):
        for mid in permutations(OPTIONAL, n):
            head = [start] if start == "CA" else [start, "CA"]
            if end == "BO":
                if "BO" in mid:
                    continue
                seq = [*head, *mid, "BO"]
            else:
                seq = [*head, *mid] + ([end] if mid or head[-1] != end else [])
            out.append(seq)
    return out


results = []
for o in IO["options"]:
    e, x = o["entry"], o["exit"]
    if e not in REG or x not in REG or REG[e] not in ENTRY_REGIONS or REG[x] not in EXIT_REGIONS or e in NO_ENTRY:
        continue
    wi, wh = IO["ways"][o["way_in"]], IO["ways"][o["way_home"]]
    for seq in sequences(REG[e], REG[x]):
        hops, ok = [], True
        for i, (X, Y) in enumerate(zip(seq, seq[1:])):
            frm = (e if i == 0 else hops[-1]["to"]) if X not in BUS_CONNECTED else None
            to = x if i == len(seq) - 2 and Y not in BUS_CONNECTED else None
            h = hop(X, Y, frm, to)
            if not h:
                ok = False; break
            hops.append(h)
        if not ok:
            continue
        bo = "BO" in seq
        beds = sum(1 for h in hops if h.get("night_arrival"))
        hop_price = sum(h["price_dkk"] + h["cabin_bag_fee_dkk"] for h in hops) + (BO_INTERNAL if bo else 0) + NIGHT_BED * beds
        total = o.get("total_dkk", o["price_dkk"] + o["extras"]["cabin_bag_fees_dkk"]) + hop_price
        hours = (wi["flying_hours"] or 0) + (wh["flying_hours"] or 0) + sum(h["hours"] or 0 for h in hops) + (2 if bo else 0)
        C = max(1.0, min(5.0, 5 - (total - 7000) / 2000))
        H = max(1.0, min(5.0, 5 - (hours - 34) / 8))
        B = max(1, 5 - max(0, len(hops) - 2) - sum(h["night_hours"] for h in hops))
        Z = (wi["score"] + B) / 2
        rating = round(2 * (0.35 * C + 0.35 * H + 0.15 * wh["score"] + 0.15 * Z), 1)
        results.append({"option": o["id"], "type": o["type"], "entry": e, "exit": x, "order": seq, "scenario": "A" if bo else "B",
                         "total_dkk": round(total), "total_hours": round(hours, 1),
                         "long_haul_dkk": o.get("total_dkk", o["price_dkk"]), "in_between_dkk": round(hop_price),
                         "hub_nights": o["extras"]["hub_nights"], "night_arrivals": beds, "hops": hops, "bolivia_internal_dkk": BO_INTERNAL if bo else 0,
                         "way_in": o["way_in"], "way_home": o["way_home"],
                         "rating": {"total": rating, "cost": round(C, 1), "hours": round(H, 1), "way_home": wh["score"],
                                    "hassle": Z, "way_in": wi["score"], "hops": B}})

results.sort(key=lambda r: (-r["rating"]["total"], r["total_dkk"]))
seen, uniq = set(), []
for r in results:   # one row per (entry, exit, order, type)
    k = (r["entry"], r["exit"], tuple(r["order"]), r["type"])
    if k not in seen:
        seen.add(k); uniq.append(r)
json.dump({"generated_from": "inout.json + crawl.db", "itineraries": uniq}, open(OUT, "w"), indent=1, ensure_ascii=False)
LBL = {"CA": "Central America", "CO": "Colombia", "BO": "Bolivia"}
print(f"itineraries: {len(uniq)} (from {len(results)})")
for r in uniq[:TOP]:
    print(f"{r['rating']['total']:>4} {r['total_dkk']:>6} {r['total_hours']:>5}h {r['type']:<8} {r['entry']}>{r['exit']} {' > '.join(r['order']):<22} "
          f"LH {r['long_haul_dkk']} + {r['in_between_dkk']} | " + " | ".join(f"{h['from']}>{h['to']} {h['price_dkk']:.0f} {h['depart'][11:16]}" for h in r["hops"]))
