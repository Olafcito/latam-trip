"""Graph view of the trip: main tickets (in and home) + region-to-region hops -> every sensible route order.

Usage: python3 -I routes.py [--root DIR] [--json FILE]
Regions come from trip.json "route_regions" ({"MX":[...],"CA":[...],"CO":[...],"BO":[...]}), required regions from
"route_required" (e.g. ["CA","CO","BO"]) and optional ones from "route_optional" (e.g. ["MX"]).
For each main ticket (best acceptable quote per pattern, no self-transfer) with entry region A and exit region Z, every
order of the regions to visit that starts in A and ends in Z is priced: each step uses the cheapest acceptable one-way
hop (effective cost) between any airport of the two regions; travel inside a region is by ground and not priced.
Bolivia's internal flights (trip.json "route_internal") are added when Bolivia is visited.
"""
import itertools, json, os, sqlite3, sys
args = sys.argv[1:]
ROOT = os.path.abspath(args[args.index("--root") + 1]) if "--root" in args else os.getcwd()
OUT = args[args.index("--json") + 1] if "--json" in args else os.path.join(ROOT, "data", "routes.json")
cfg = json.load(open(os.path.join(ROOT, "trip.json")))
REG = cfg["route_regions"]; REQ = cfg["route_required"]; OPT = cfg.get("route_optional", [])
INTERNAL = cfg.get("route_internal", {})
HOME = set(cfg.get("home_airports", ["CPH"])) | set(cfg.get("alt_origins", []))
PREF_IN = cfg.get("route_entry_preferred", {})
con = sqlite3.connect(os.path.join(ROOT, "data", "crawl.db"))
reg_of = {a: r for r, aps in REG.items() for a in aps}

hops = {}   # (a, b) -> best acceptable one-way
for pid, eff, price, h, oc, flags, od, raw in con.execute(
        "SELECT pattern_id, eff_cost, price_dkk, out_hours, out_carriers, flags, out_date, raw FROM quotes WHERE pattern_id LIKE 'R:%' AND ok=1"):
    a, b = pid[2:].split(">")
    if a in reg_of and b in reg_of and reg_of[a] != reg_of[b]:
        if (a, b) not in hops or eff < hops[(a, b)]["eff"]:
            o = json.loads(raw).get("out") or {}
            hops[(a, b)] = dict(frm=a, to=b, eff=eff, price=price, hours=h, carriers=oc, flags=flags, date=od,
                                dep=(o.get("dep") or "")[11:16], arr=(o.get("arr") or "")[11:16],
                                next_day=(o.get("arr") or "")[:10] > (o.get("dep") or "")[:10])
internal = {}
for leg in INTERNAL.get("BO", []):
    a, b = leg.split(">")
    r = con.execute("SELECT MIN(price_dkk), MIN(out_hours) FROM quotes WHERE pattern_id=? AND ok=1", (f"R:{a}>{b}",)).fetchone()
    internal[leg] = r[0]


HOP_AP = cfg.get("route_hop_airports", {})
POSN = cfg.get("route_positioning", {})


def best_hop(A, B):
    c = [v for (a, b), v in hops.items() if reg_of[a] == A and reg_of[b] == B
         and (A not in HOP_AP or a in HOP_AP[A]) and (B not in HOP_AP or b in HOP_AP[B])]
    pref = PREF_IN.get(B)
    cp = [v for v in c if v["to"] == pref]
    if cp and min(v["eff"] for v in cp) <= min(v["eff"] for v in c) + 1500:   # prefer the entry airport (e.g. La Paz) unless much dearer
        c = cp
    return min(c, key=lambda v: v["eff"]) if c else None


region_hops = {f"{A}>{B}": best_hop(A, B) for A in REG for B in REG if A != B}

mains = {}
for pid, eff, price, oh, hh, oc, hc, od, hd, raw in con.execute(
        "SELECT pattern_id, eff_cost, price_dkk, out_hours, home_hours, out_carriers, home_carriers, out_date, home_date, raw "
        "FROM quotes WHERE pattern_id LIKE 'P:%' AND structure IN ('return','open_jaw') AND ok=1 AND IFNULL(self_transfer,0)=0"):
    L = json.loads(raw)["legs_requested"]
    o, e = L[0]["from"], L[0]["to"]
    x = L[1]["from"] if len(L) > 1 else e
    if o not in HOME or e not in reg_of or x not in reg_of:
        continue
    if pid not in mains or eff < mains[pid]["eff"]:
        q = json.loads(raw)
        mains[pid] = dict(pattern=pid, origin=o, entry=e, exit=x, eff=eff, price=price, out_h=oh, home_h=hh,
                          out_carriers=oc, home_carriers=hc, out_date=od, home_date=hd, tickets=q.get("tickets") or 1,
                          fare=q.get("fare_brand"), checked_bag=q.get("checked_bag"))

CHAINS = os.path.join(ROOT, "data", "chains.json")   # self-built ways in and home (chains.py)
if os.path.exists(CHAINS):
    ch = json.load(open(CHAINS))
    for o in ch["out"]:
        for h in ch["home"]:
            if o["to"] not in reg_of or h["frm"] not in reg_of:
                continue
            pid = f"C:{o['route']}/{h['route']}"
            eff = o["eff"] + h["eff"]
            if pid in mains and mains[pid]["eff"] <= eff:
                continue
            mains[pid] = dict(pattern=pid, origin=o["frm"], entry=o["to"], exit=h["frm"], eff=eff,
                              price=o["total"] + h["total"], out_h=o["hours"], home_h=h["hours"],
                              out_carriers=", ".join(o["carriers"]), home_carriers=", ".join(h["carriers"]),
                              out_date=o["start"][:10], home_date=h["start"][:10], tickets=o["tickets"] + h["tickets"],
                              fare=None, checked_bag=None, chain=True,
                              chain_note=f"in: {'; '.join(o['stops']) or 'one ticket'} | home: {'; '.join(h['stops']) or 'one ticket'}",
                              checked_add=(o["checked"] or 0) + (h["checked"] or 0),
                              flags=sorted(set(o["flags"]) | set(h["flags"])))

routes = []
for m in mains.values():
    A, Z = reg_of[m["entry"]], reg_of[m["exit"]]
    for with_opt in ([[]] + [[o] for o in OPT]):
        need = list(dict.fromkeys(REQ + with_opt + [A, Z]))
        middle = [r for r in need if r not in (A, Z)]
        for perm in itertools.permutations(middle):
            order = [A] + list(perm) + ([Z] if Z != A or len(need) > 1 else [])
            if A == Z and len(order) == 1:
                continue
            pos = POSN.get(m["origin"], {}).get("price", 0)
            total, eff, legs, ok = m["price"] + pos, m["eff"] + pos, ([f"positioning {pos}"] if pos else []), True
            for X, Y in zip(order, order[1:]):
                h = region_hops.get(f"{X}>{Y}")
                if not h:
                    ok = False; legs.append(f"{X}>{Y}: not priced"); break
                total += h["price"]; eff += h["eff"]
                legs.append(f"{h['frm']}>{h['to']} {h['price']:.0f} ({h.get('dep')}>{h.get('arr')}{'+1' if h.get('next_day') else ''}, {h['hours']} h, {h['carriers']})")
            if not ok:
                continue
            if "BO" in order:
                add = sum(v for v in internal.values() if v)
                total += add; eff += add + 150 * 1.6
            routes.append(dict(main=m["pattern"], origin=m["origin"], entry=m["entry"], exit=m["exit"], order=order,
                               with_optional=with_opt, total=round(total), eff=round(eff), main_price=m["price"], positioning=pos,
                               hops=legs))
routes.sort(key=lambda r: r["eff"])
json.dump({"mains": sorted(mains.values(), key=lambda m: m["price"]), "region_hops": region_hops, "routes": routes,
           "internal": internal}, open(OUT, "w"), indent=1)
print(f"main tickets: {len(mains)}, region hops priced: {sum(1 for v in region_hops.values() if v)}/{len(region_hops)}, routes: {len(routes)}")
print("missing region hops:", [k for k, v in region_hops.items() if not v])
for r in routes[:15]:
    print(f"{r['eff']:>6} {r['total']:>6} {r['main']:<22} {' > '.join(r['order'])} | " + " | ".join(r["hops"]))
