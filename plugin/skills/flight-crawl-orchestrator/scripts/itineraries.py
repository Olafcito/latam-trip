"""Whole-trip itineraries: every in/out option (inout.json) x every sensible order of regions, with the flights in between.

Usage: python3 -I itineraries.py [--root DIR] [--json FILE] [--top N]

Regions: CA (Central America, bus-connected: GUA SAL SAP TGU RTB MGA SJO LIR), CO, BO (BoA inside Bolivia added once),
MXW (Guadalajara / Mexico City, bus-connected) and MXE (Cancún). CA, CO and BO are required; MXW and MXE only as the
entry or exit region. A region may appear twice only when it is both the first and the last, or for Colombia
(a Colombia base with Bolivia in the middle: CO > BO > CO).
Each hop between regions is the cheapest acceptable one-way by effective cost between the two regions' airports, with
departure from the region you are in and, for the first and last region, from/to the actual entry/exit airport when
that region is not bus-connected.
Price = flight tickets (option) + cabin-bag fees + hop prices + hop cabin-bag fees. Hub nights are shown, never priced.
Rating /10 = 2 x (0.35 price + 0.30 way home + 0.15 way in + 0.20 in between):
  price 5 at 12,500 kr, minus 1 per 1,000 kr more; in between 5, minus 1 per hop beyond two, minus 1 per hop that
  leaves or lands between 00:00 and 05:00 (min 1); way scores from inout.json.
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
REQUIRED = {"CA", "CO", "BO"}
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
    e = eff + cf
    if (a, b) not in best or e < best[(a, b)]["eff"]:
        dep, arr = o.get("dep") or "", o.get("arr") or ""
        night = any(t[11:13] and int(t[11:13]) < 5 for t in (dep, arr) if len(t) >= 13)
        best[(a, b)] = {"from": a, "to": b, "quote_id": qid, "price_dkk": price, "cabin_bag_fee_dkk": cf, "eff": e,
                        "depart": dep, "arrive": arr, "hours": o.get("hours"), "carriers": o.get("carriers") or [],
                        "via": o.get("via") or [], "night_hours": night, "date_seen": dep[:10]}


def hop(X, Y, frm=None, to=None):
    c = [v for (a, b), v in best.items() if REG[a] == X and REG[b] == Y and (frm is None or a == frm) and (to is None or b == to)]
    return min(c, key=lambda v: v["eff"]) if c else None


BUS_CONNECTED = {"CA", "CO", "BO", "MXW"}


def sequences(start, end):
    out = []

    def go(seq):
        if len(seq) > 6:
            return
        if seq[-1] == end and REQUIRED <= set(seq) and (len(seq) > 1 or start != end):
            out.append(list(seq))
        for r in ("CA", "CO", "BO", "MXW", "MXE"):
            if r == seq[-1]:
                continue
            if r in ("MXW", "MXE") and r != end:
                continue
            n = seq.count(r)
            if n >= 2 or (n == 1 and not (r == end and r == start) and r != "CO"):
                continue
            go(seq + [r])
    go([start])
    return [s for s in out if s[-1] == end]


results = []
for o in IO["options"]:
    e, x = o["entry"], o["exit"]
    if e not in REG or x not in REG:
        continue
    wi, wh = IO["ways"][o["way_in"]], IO["ways"][o["way_home"]]
    for seq in sequences(REG[e], REG[x]):
        hops, ok = [], True
        for i, (X, Y) in enumerate(zip(seq, seq[1:])):
            frm = e if i == 0 and X not in BUS_CONNECTED else None
            to = x if i == len(seq) - 2 and Y not in BUS_CONNECTED else None
            h = hop(X, Y, frm, to)
            if not h:
                ok = False; break
            hops.append(h)
        if not ok:
            continue
        hop_price = sum(h["price_dkk"] + h["cabin_bag_fee_dkk"] for h in hops) + BO_INTERNAL
        total = o["price_dkk"] + o["extras"]["cabin_bag_fees_dkk"] + hop_price
        P = max(1.0, min(5.0, 5 - (total - 12500) / 1000))
        B = max(1, 5 - max(0, len(hops) - 2) - sum(h["night_hours"] for h in hops))
        rating = round(2 * (0.35 * P + 0.30 * wh["score"] + 0.15 * wi["score"] + 0.20 * B), 1)
        results.append({"option": o["id"], "type": o["type"], "entry": e, "exit": x, "order": seq, "total_dkk": round(total),
                         "long_haul_dkk": o["price_dkk"] + o["extras"]["cabin_bag_fees_dkk"], "in_between_dkk": round(hop_price),
                         "hub_nights": o["extras"]["hub_nights"], "hops": hops, "bolivia_internal_dkk": BO_INTERNAL,
                         "way_in": o["way_in"], "way_home": o["way_home"],
                         "rating": {"total": rating, "price": round(P, 1), "way_in": wi["score"], "way_home": wh["score"], "in_between": B}})

results.sort(key=lambda r: (-r["rating"]["total"], r["total_dkk"]))
seen, uniq = set(), []
for r in results:   # one row per (entry, exit, order): the best type
    k = (r["entry"], r["exit"], tuple(r["order"]))
    if k not in seen:
        seen.add(k); uniq.append(r)
json.dump({"generated_from": "inout.json + crawl.db", "itineraries": uniq}, open(OUT, "w"), indent=1, ensure_ascii=False)
LBL = {"CA": "Central America", "CO": "Colombia", "BO": "Bolivia", "MXW": "Guadalajara/Mexico City", "MXE": "Cancún"}
print(f"itineraries: {len(uniq)} (from {len(results)})")
for r in uniq[:TOP]:
    print(f"{r['rating']['total']:>4} {r['total_dkk']:>6} {r['type']:<8} {r['entry']}>{r['exit']} {' > '.join(r['order']):<22} "
          f"LH {r['long_haul_dkk']} + {r['in_between_dkk']} | " + " | ".join(f"{h['from']}>{h['to']} {h['price_dkk']:.0f} {h['depart'][11:16]}" for h in r["hops"]))
