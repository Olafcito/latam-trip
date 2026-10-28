"""Scenario totals: main ticket + the regional hops the trip forces, and the hops still missing.

Usage: python3 -I scenarios.py [--root DIR] [--top N]
trip.json "region_sequence": ordered regions [{name, airports, optional, entry?, exit?}]. The traveller enters the
first region of the sequence that the main ticket reaches, must visit every non-optional region in order, and flies
home from the main ticket's exit airport. Totals are computed with and without each optional region.
Hops = acceptable regional one-ways in the table (pattern R:a>b); the cheapest effective cost between two regions
is used (a region's "entry"/"exit" airport is required when set). Side-trip airports (trip.json "side_trip_airports")
as entry add a hop from there to the first region.
"""
import itertools, json, os, sqlite3, sys
args = sys.argv[1:]
ROOT = os.path.abspath(args[args.index("--root") + 1]) if "--root" in args else os.getcwd()
TOP = int(args[args.index("--top") + 1]) if "--top" in args else 8
cfg = json.load(open(os.path.join(ROOT, "trip.json")))
SEQ = cfg["region_sequence"]
SIDE = set(cfg.get("side_trip_airports", {}))
con = sqlite3.connect(os.path.join(ROOT, "data", "crawl.db"))

reg = {}
for pid, eff, price, h, car in con.execute(
        "SELECT pattern_id, eff_cost, price_dkk, out_hours, out_carriers FROM quotes WHERE pattern_id LIKE 'R:%' AND ok=1"):
    a, b = pid[2:].split(">")
    if (a, b) not in reg or eff < reg[(a, b)][0]:
        reg[(a, b)] = (eff, price, h, car)


def region_of(ap):
    for i, r in enumerate(SEQ):
        if ap in r["airports"]:
            return i
    return None


def hop(src, dst_region, src_air=None):
    """Cheapest leg from region index src (or airport src_air) into region dst_region.
    The region's preferred entry airport is used when priced; otherwise any airport (marked *)."""
    R = SEQ[dst_region]
    srcs = [src_air] if src_air else SEQ[src]["airports"]
    for targets, mark in (([R["entry"]], "") if R.get("entry") else ([], ""), (R["airports"], "*")):
        c = [(reg[(a, b)], (a, b)) for a in srcs for b in targets if (a, b) in reg]
        if c:
            v, (a, b) = min(c)
            return v, (a, b + (mark if R.get("entry") and b != R["entry"] else ""))
    return None


def leave(region_idx, exit_air):
    R = SEQ[region_idx]
    srcs = [R["exit"]] if R.get("exit") else R["airports"]
    c = [(reg[(a, exit_air)], (a, exit_air)) for a in srcs if (a, exit_air) in reg]
    return min(c) if c else None


optional = [i for i, r in enumerate(SEQ) if r.get("optional")]
variants = []
for k in range(len(optional) + 1):
    for drop in itertools.combinations(optional, k):
        variants.append([i for i in range(len(SEQ)) if i not in drop])

HOME = set(cfg.get("home_airports", ["CPH"]))
POS = cfg.get("positioning", {})
GROUND = {k: v.get("cost", 0) for k, v in POS.get("ground_dkk", {}).items()}
pos_q = []   # (eff, price, out_to, home_from) for every acceptable home<->Spain return or open jaw
for pid, eff, price, raw in con.execute("SELECT pattern_id, eff_cost, price_dkk, raw FROM quotes WHERE structure IN ('return','open_jaw') AND ok=1"):
    L = json.loads(raw)["legs_requested"]
    a = L[0]["from"]; b = L[0]["to"]
    c2 = L[-1]["from"] if len(L) > 1 else b
    if a in HOME and b in POS.get("fly_to", []) and c2 in POS.get("fly_to", []):
        pos_q.append((eff, price, b, c2))


def positioning(start):
    """Cheapest way home -> start and back: flights to/from any fly_to airport plus a one-way ground leg
    (half the configured both-ways cost) for each end that is not the start airport itself."""
    best = None
    for eff, price, b, c2 in pos_q:
        g = sum(GROUND.get(start, 0) / 2 for x in (b, c2) if x != start)
        if start not in (b, c2) and start not in GROUND:
            continue
        cand = (eff + g, price + g, f"{b}/{c2}", g)
        if best is None or cand[0] < best[0]:
            best = cand
    return best


out, missing = {}, set()
q = """SELECT pattern_id, eff_cost, price_dkk, out_date, home_date, out_hours, home_hours, out_carriers, home_carriers, raw
       FROM quotes WHERE (pattern_id LIKE 'P:%' OR pattern_id LIKE 'M:%') AND structure!='one_way' AND ok=1"""
for pid, eff, price, od, hd, oh, hh, oc, hc, raw in con.execute(q):
    r = json.loads(raw)
    L = r["legs_requested"]
    entry = L[0]["to"]
    exit_ = L[-1]["from"] if r["structure"] != "return" else L[0]["to"]
    start = L[0]["from"]
    pos_parts, pos_eff, pos_price = [], 0, 0
    if start not in HOME and start not in SIDE:
        pb = positioning(start)
        bag = POS.get("bag_dkk", {}).get("cost", 0)
        if pb:
            pos_parts.append(f"pos CPH<>{pb[2]} {pb[1] - pb[3]:.0f}+bag {bag}" + (f"+ground {pb[3]:.0f} est" if pb[3] else ""))
            pos_eff += pb[0] + bag; pos_price += pb[1] + bag
        else:
            missing.add(f"positioning to {start}")
    paid = {(region_of(l["from"]), region_of(l["to"])) for l in L[1:-1]}   # hops inside a multi-city ticket
    for var in variants:
        name = " > ".join(SEQ[i]["name"] for i in var)
        parts, t_eff, t_price, ok = list(pos_parts), eff + pos_eff, price + pos_price, bool(pos_parts) or start in HOME or start in SIDE
        cur_air = entry if entry in SIDE else None
        cur = region_of(entry)
        path = var[:]
        if cur is not None and cur not in path:
            path = [cur] + path
        elif cur is not None and cur != path[0]:
            path = [cur] + path              # entered mid-sequence: go back to the first region, then in order
        elif cur == path[0]:
            path = path
        if cur is None and not cur_air:
            continue
        for nxt in (path if cur_air else path[1:]):
            if cur == nxt:
                continue
            # a multi-city ticket may already contain this hop
            if (cur, nxt) in paid:
                cur = nxt; continue
            h = hop(cur, nxt, cur_air)
            if h:
                (e, p, hrs, car), (a, b) = h
                parts.append(f"{a}>{b} {p:.0f}"); t_eff += e; t_price += p
            else:
                ok = False; missing.add(f"{cur_air or SEQ[cur]['name']} -> {SEQ[nxt]['name']}")
            cur, cur_air = nxt, None
        for ri in path:
            for leg in SEQ[ri].get("internal_legs", []):
                a, b = leg.split(">")
                v = reg.get((a, b))
                if v:
                    parts.append(f"{a}>{b} {v[1]:.0f}"); t_eff += v[0]; t_price += v[1]
                else:
                    ok = False; missing.add(f"internal {leg}")
        if exit_ not in SEQ[path[-1]]["airports"]:
            h = leave(path[-1], exit_)
            if h:
                (e, p, hrs, car), (a, b) = h
                parts.append(f"{a}>{b} {p:.0f}"); t_eff += e; t_price += p
            else:
                ok = False; missing.add(f"{SEQ[path[-1]]['name']} -> {exit_}")
        out.setdefault(name, []).append((ok, round(t_eff), round(t_price), pid, od, hd, oh, hh, oc, hc, price, " + ".join(parts)))

for name, rows in out.items():
    print(f"\n== Route {name}: best complete totals (eff, total, pattern, dates, hours, carriers, main, hops)")
    seen, n = set(), 0
    for r in sorted([x for x in rows if x[0]], key=lambda x: x[1]):
        k = (r[3], r[8], r[9])
        if k in seen: continue
        seen.add(k); n += 1
        print(f"  {r[1]:>6} {r[2]:>6} {r[3]:<20} {r[4]}/{r[5]} {r[6]}h/{r[7]}h {r[8]} | {r[9]} main {r[10]:.0f} + {r[11]}")
        if n >= TOP: break
    print(f"  ({sum(1 for x in rows if not x[0])} main tickets lack a priced hop)")
print("\nHops in the table:", ", ".join(f"{a}>{b} {v[1]:.0f}" for (a, b), v in sorted(reg.items(), key=lambda kv: kv[1][0])))
print("Missing hops (search these):", sorted(missing) or "none")
