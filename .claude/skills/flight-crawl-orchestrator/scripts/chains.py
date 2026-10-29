"""Self-built ticket chains: combine separate one-way products into ways in and ways home.

Usage: python3 -I chains.py [--root DIR] [--json FILE] [--top N]

A product is one acceptable quote (ok=1) that flies from A to B: a one-way (any number of stops) or a multi-city
ticket whose legs follow on from each other (e.g. a Mix & Match VVI>MAD + MAD>CPH). Chains join up to
`chain.max_products` products at the same airport, from the origin into a trip region (way in) or from a trip region
back to the origin (way home). Between two products:
  gap < chain.min_connect_h           -> the next product is moved to a later day (flag date_shift: price seen on another date)
  min_connect_h <= gap < 8 h          -> self-transfer connection (penalty: self_transfer, halved from 5 h)
  gap >= 8 h, same day                -> day stop (penalty chain.day_stop)
  gap spans nights                    -> stopover: nights x night price (chain.night_dkk per city, default)
                                         + chain.stop_penalty for buying separate tickets
  more than chain.max_stop_nights     -> the next product is moved earlier (date_shift) if possible
Cost per chain = sum of product effective costs + cabin-bag add-ons (bag_rules.json) + connection costs.
trip.json "chain": {"out_window": ["2026-12-01","2026-12-04"], "in_by": "2026-12-08", "home_from": "2027-01-28",
  "home_by": "2027-02-05", "max_products": 3, "min_connect_h": 3, "max_stop_nights": 4, "night_dkk": {"default": 350},
  "stop_penalty": 300, "day_stop": 400, "date_shift": 300}
Writes data/chains.json: {"out": [...], "home": [...]} sorted by effective cost, best few per entry/exit airport.
"""
import datetime as dt, json, os, sqlite3, sys
args = sys.argv[1:]
ROOT = os.path.abspath(args[args.index("--root") + 1]) if "--root" in args else os.getcwd()
OUT = args[args.index("--json") + 1] if "--json" in args else os.path.join(ROOT, "data", "chains.json")
TOP = int(args[args.index("--top") + 1]) if "--top" in args else 3
cfg = json.load(open(os.path.join(ROOT, "trip.json")))
W = cfg["scoring"]
C = {"out_window": ["2026-12-01", "2026-12-04"], "in_by": "2026-12-08", "home_from": "2027-01-28", "home_by": "2027-02-05",
     "max_products": 3, "min_connect_h": 3, "max_stop_nights": 4, "night_dkk": {"default": 350}, "stop_penalty": 300,
     "day_stop": 400, "date_shift": 300}
C.update(cfg.get("chain", {}))
HOME = set(cfg.get("home_airports", ["CPH"]))
REG = cfg["route_regions"]
reg_of = {a: r for r, aps in REG.items() for a in aps}
ENTRY = set(C.get("entry_airports") or reg_of)   # region airports allowed as the first/last airport of a chain
BAGS = json.load(open(os.path.join(ROOT, "data", "bag_rules.json")))
con = sqlite3.connect(os.path.join(ROOT, "data", "crawl.db"))


def bag(carriers, hours):
    for r in BAGS:
        if any(r["match"].lower() in (c or "").lower() for c in carriers[:1]):
            return r.get("cabin_dkk") or 0, (r["longhaul_dkk"] if hours > 9 else r["regional_dkk"])
    return 0, None


def ts(s):
    try:
        return dt.datetime.fromisoformat(s[:16])
    except Exception:
        return None


products = []
for qid, pid, struct, eff, price, flags, raw in con.execute(
        "SELECT quote_id, pattern_id, structure, eff_cost, price_dkk, flags, raw FROM quotes "
        "WHERE ok=1 AND structure IN ('one_way','multi_city') AND price_dkk IS NOT NULL"):
    q = json.loads(raw)
    L = q.get("legs_requested") or []
    if not L or any(a["to"] != b["from"] for a, b in zip(L, L[1:])):
        continue
    legs = [d for d in [q.get("out")] + list(q.get("mid") or []) + ([q.get("home")] if struct != "one_way" else []) if d]
    if len(legs) != len(L) or not all(d.get("dep") and d.get("arr") and d.get("hours") for d in legs):
        continue
    dep, arr = ts(legs[0]["dep"]), ts(legs[-1]["arr"])
    if not dep or not arr:
        continue
    cabin = checked = 0
    for d in legs:
        cb, ck = bag(d.get("carriers") or [], d["hours"])
        cabin += cb; checked = None if (checked is None or ck is None) else checked + ck
    stops = []
    for d in legs:
        stops += [{"city": v, "kind": "connection"} for v in d.get("via") or []]
    for a, b in zip(legs, legs[1:]):
        gap = (ts(b["dep"]) - ts(a["arr"])).total_seconds() / 3600 if ts(b["dep"]) and ts(a["arr"]) else None
        nights = (ts(b["dep"]).date() - ts(a["arr"]).date()).days if gap is not None else None
        stops.append({"city": None, "kind": "inside ticket", "gap_h": gap, "nights": nights})
    for i, l in enumerate(L[:-1]):
        stops[-(len(L) - 1) + i]["city"] = l["to"]
    products.append(dict(qid=qid, pid=pid, frm=L[0]["from"], to=L[-1]["to"], dep=dep, arr=arr, price=price, eff=eff,
                         hours=round(sum(d["hours"] for d in legs), 2), cabin=cabin, checked=checked,
                         carriers=sorted({c for d in legs for c in d.get("carriers") or []}),
                         flights=sum((d.get("stops") or 0) + 1 for d in legs), source=q.get("source"),
                         flags=[f for f in (flags or "").split(",") if f], stops=stops,
                         self_transfer=bool(q.get("self_transfer")),
                         tickets=q.get("tickets") or (2 if q.get("self_transfer") else 1)))

by_from = {}
for p in products:
    by_from.setdefault(p["frm"], []).append(p)
for v in by_from.values():   # keep the cheapest few per destination and day to bound the search
    v.sort(key=lambda p: p["eff"])
for k in list(by_from):
    seen, keep = {}, []
    for p in by_from[k]:
        key = (p["to"], p["dep"].date())
        if seen.get(key, 0) < 3:
            keep.append(p); seen[key] = seen.get(key, 0) + 1
    by_from[k] = keep


def connect(prev, nxt):
    """Cost, label, shifted departure and flags for flying nxt after prev at prev['to']."""
    gap = (nxt["dep"] - prev["arr"]).total_seconds() / 3600
    shift, flags = 0, []
    while gap < C["min_connect_h"]:
        gap += 24; shift += 1
    while gap - 24 >= C["min_connect_h"] and (nxt["dep"] + dt.timedelta(days=shift)).date() > prev["arr"].date() + dt.timedelta(days=C["max_stop_nights"]):
        gap -= 24; shift -= 1
    if shift:
        flags.append("date_shift")
    dep = nxt["dep"] + dt.timedelta(days=shift)
    nights = (dep.date() - prev["arr"].date()).days
    if nights > C["max_stop_nights"]:
        return None
    city = prev["to"]
    cost = C["date_shift"] if shift else 0
    if nights == 0 and gap < 8:
        cost += W["self_transfer"] if gap < 5 else W["self_transfer"] / 2
        flags.append("self_transfer"); label = f"{gap:.1f} h self-transfer in {city}"
    elif nights == 0:
        cost += C["day_stop"]; label = f"{gap:.0f} h day stop in {city}"
    else:
        cost += nights * C["night_dkk"].get(city, C["night_dkk"]["default"]) + C["stop_penalty"]
        label = f"{nights} night{'s' if nights > 1 else ''} in {city}"
    return dict(cost=cost, label=label, dep=dep, shift=shift, flags=flags, nights=nights, city=city,
                nights_cost=nights * C["night_dkk"].get(city, C["night_dkk"]["default"]) if nights else 0)


def chain_record(path, links):
    ps = [p for p in path]
    price = sum(p["price"] for p in ps)
    cabin = sum(p["cabin"] for p in ps)
    checked = None if any(p["checked"] is None for p in ps) else sum(p["checked"] for p in ps)
    nights_cost = sum(l["nights_cost"] for l in links)
    eff = sum(p["eff"] for p in ps) + cabin + sum(l["cost"] for l in links)
    flags = sorted({f for p in ps for f in p["flags"] if f in ("self_transfer", "us_transit", "mix_match", "basic_fare",
                                                                  "airport_change", "long_layover", "date_assumed")}
                   | {f for l in links for f in l["flags"]})
    route = ">".join([ps[0]["frm"]] + [p["to"] for p in ps])
    deps = [ps[0]["dep"]] + [l["dep"] for l in links]
    arr = ps[-1]["arr"] + dt.timedelta(days=links[-1]["shift"] if links else 0)
    return dict(route=route, frm=ps[0]["frm"], to=ps[-1]["to"], price=round(price), cabin=cabin, checked=checked,
                stay_cost=nights_cost, total=round(price + cabin + nights_cost), eff=round(eff),
                hours=round(sum(p["hours"] for p in ps), 1), flights=sum(p["flights"] for p in ps), tickets=sum(p["tickets"] for p in ps),
                start=deps[0].isoformat(), end=arr.isoformat(),
                stops=[l["label"] for l in links],
                carriers=sorted({c for p in ps for c in p["carriers"]}), flags=flags,
                products=[dict(qid=p["qid"], pattern=p["pid"], frm=p["frm"], to=p["to"], dep=d.isoformat(),
                               arr=(p["arr"] + (d - p["dep"])).isoformat(),
                               price=p["price"], hours=p["hours"], carriers=p["carriers"], source=p["source"],
                               flights=p["flights"], cabin=p["cabin"])
                          for p, d in zip(ps, deps)])


def search(starts, ok_end, first_ok, end_ok):
    found = []

    def go(path, links):
        last = path[-1]
        if ok_end(last["to"]) and end_ok(last["arr"] + dt.timedelta(days=links[-1]["shift"] if links else 0)):
            found.append(chain_record(path, links))
            return
        if len(path) >= C["max_products"]:
            return
        prev = dict(last)
        if links:
            prev["arr"] = last["arr"] + dt.timedelta(days=links[-1]["shift"])
        if last["to"] in reg_of:   # a stop inside a trip region belongs to the route, not to the way in/home
            return
        for nxt in by_from.get(last["to"], []):
            if nxt["to"] in {p["frm"] for p in path}:
                continue
            l = connect(prev, nxt)
            if l:
                go(path + [nxt], links + [l])

    for a in starts:
        for p in by_from.get(a, []):
            if first_ok(p["dep"]):
                go([p], [])
    return [c for c in found if c["frm"] in ENTRY or c["to"] in ENTRY]


d = lambda s: dt.date.fromisoformat(s)
out = search(HOME, lambda a: a in reg_of,
             lambda t: d(C["out_window"][0]) <= t.date() <= d(C["out_window"][1]),
             lambda t: t.date() <= d(C["in_by"]))
home = search([a for a in reg_of], lambda a: a in HOME,
              lambda t: t.date() >= d(C["home_from"]),
              lambda t: t.date() <= d(C["home_by"]))


def best(chains, key):
    chains.sort(key=lambda c: c["eff"])
    res, seen, routes = [], {}, set()
    for c in chains:
        if seen.get(c[key], 0) >= TOP or c["route"] + str(c["price"]) in routes:
            continue
        seen[c[key]] = seen.get(c[key], 0) + 1; routes.add(c["route"] + str(c["price"])); res.append(c)
    return res


res = {"out": best(out, "to"), "home": best(home, "frm"), "config": C}
json.dump(res, open(OUT, "w"), indent=1)
print(f"products: {len(products)} | ways in: {len(out)} -> kept {len(res['out'])} | ways home: {len(home)} -> kept {len(res['home'])}")
for side in ("out", "home"):
    print(f"\n{side.upper()} (best by effective cost)")
    for c in res[side][:18]:
        print(f"{c['eff']:>6} {c['total']:>6} {c['route']:<20} {c['hours']:>5} h {c['tickets']}t "
              f"{', '.join(c['carriers'])[:40]:<40} | {'; '.join(c['stops']) or 'one ticket'} | {','.join(c['flags'])}")
