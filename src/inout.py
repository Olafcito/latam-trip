"""City in / city out table: the best way to cross the Atlantic for every entry x exit airport pair.

Usage: python3 -I inout.py [--root DIR] [--csv FILE] [--md FILE] [--top N]

Three types per pair (each the best by effective cost):
  ticket    one ticket from the home airport (return or open jaw)
  madrid    one ticket from an alternative origin (e.g. MAD) + own one-way hops home<>origin, nights counted
  oneways   separate one-way tickets each way, incl. self-built chains through hubs (chains.py)
Rating /10 for the long-haul part only = 2 x (0.5 price + 0.3 way home + 0.2 way in):
  price 5 at trip.json inout.price_anchor (default 7,000 kr), minus 1 per 1,000 kr more (min 1);
  way in / home: start 5; -1 per night at a hub, -1 per change between separate tickets, -1 US transit,
  -1 if flying time > 20 h, another -1 if > 23 h (min 1).
Writes data/inout.csv (all pairs) and, with --md, a markdown table of the top N.
"""
import csv, datetime as dt, importlib.util, json, os, sqlite3, sys
args = sys.argv[1:]
ROOT = os.path.abspath(args[args.index("--root") + 1]) if "--root" in args else os.getcwd()
CSV = args[args.index("--csv") + 1] if "--csv" in args else os.path.join(ROOT, "data", "inout.csv")
MD = args[args.index("--md") + 1] if "--md" in args else None
TOP = int(args[args.index("--top") + 1]) if "--top" in args else 60

# reuse the chain builder (products, connect, ways in/home)
sys.argv = [sys.argv[0], "--root", ROOT]
spec = importlib.util.spec_from_file_location("chains", os.path.join(os.path.dirname(__file__), "chains.py"))
ch = importlib.util.module_from_spec(spec)
_stdout = sys.stdout; sys.stdout = open(os.devnull, "w")
spec.loader.exec_module(ch)
sys.stdout = _stdout
cfg, reg_of, HOME = ch.cfg, ch.reg_of, ch.HOME
ANCHOR = cfg.get("inout", {}).get("price_anchor", 7000)
ALT = [o for o in cfg.get("inout", {}).get("alt_origins", ["MAD"])]
US = {"MIA", "JFK", "EWR", "IAH", "DFW", "ATL", "ORD", "IAD", "LAX", "BOS", "CLT", "DTW", "PHL", "MCO", "FLL", "SFO", "SEA", "MSP"}
NAME = {"CPH": "Copenhagen", "MAD": "Madrid", "GDL": "Guadalajara", "MEX": "Mexico City", "CUN": "Cancún", "GUA": "Guatemala City",
        "SAL": "San Salvador", "SAP": "San Pedro Sula", "TGU": "Tegucigalpa", "RTB": "Roatán", "MGA": "Managua", "SJO": "San José",
        "LIR": "Liberia", "PTY": "Panama City", "BZE": "Belize City", "BOG": "Bogotá", "MDE": "Medellín", "CTG": "Cartagena",
        "CLO": "Cali", "SMR": "Santa Marta", "ADZ": "San Andrés", "PEI": "Pereira", "LPB": "La Paz", "VVI": "Santa Cruz",
        "CBB": "Cochabamba"}
con = sqlite3.connect(os.path.join(ROOT, "data", "crawl.db"))
raw_of = lambda qid: json.loads(con.execute("SELECT raw FROM quotes WHERE quote_id=?", (qid,)).fetchone()[0])


def legs_of_product(qid):
    q = raw_of(qid)
    return [d for d in [q.get("out")] + list(q.get("mid") or []) + ([q.get("home")] if q.get("structure") != "one_way" else []) if d]


def side_from_chain(c):
    """Direction summary from a chains.py record."""
    vias, us = [], False
    for i, p in enumerate(c["products"]):
        for d in legs_of_product(p["qid"]):
            vias += d.get("via") or []
        if i < len(c["products"]) - 1:
            vias.append(p["to"])
    us = bool(set(vias) & US)
    nights = sum(int(s.split(" night")[0]) for s in c["stops"] if " night" in s)
    changes = sum(1 for s in c["stops"] if "self-transfer" in s or "day stop" in s or "night" in s) if c["tickets"] > 1 else 0
    if c["tickets"] > 1 and not changes:   # a Mix & Match product: separate tickets inside one result
        changes = 1
    return dict(via=" ".join(dict.fromkeys(vias)), dep=c["start"][:16], arr=c["end"][:16], hours=c["hours"], nights=nights,
                changes=changes, us=us, carriers=", ".join(c["carriers"]), stops="; ".join(c["stops"]), price=c["total"],
                checked=c["checked"], flags=c["flags"])


def score_side(s):
    return max(1, 5 - s["nights"] - min(s["changes"], 1) - s["us"] - (s["hours"] > 20) - (s["hours"] > 23))


rows = []
# 1. separate one-ways / self-built chains: best way in per entry, best way home per exit
best_in, best_home = {}, {}
for c in ch.out:
    if c["to"] in reg_of and (c["to"] not in best_in or c["eff"] < best_in[c["to"]]["eff"]):
        best_in[c["to"]] = c
for c in ch.home:
    if c["frm"] in reg_of and (c["frm"] not in best_home or c["eff"] < best_home[c["frm"]]["eff"]):
        best_home[c["frm"]] = c
for e, ci in best_in.items():
    for x, chm in best_home.items():
        rows.append(dict(type="oneways", entry=e, exit=x, eff=ci["eff"] + chm["eff"], out=side_from_chain(ci), home=side_from_chain(chm),
                         tickets=ci["tickets"] + chm["tickets"]))


def side_from_leg(d, price=0, nights=0, changes=0, extra_hours=0.0, dep=None, arr=None, stops=""):
    v = d.get("via") or []
    return dict(via=" ".join(v), dep=(dep or d.get("dep") or "")[:16], arr=(arr or d.get("arr") or "")[:16],
                hours=round((d.get("hours") or 0) + extra_hours, 1), nights=nights, changes=changes, us=bool(set(v) & US),
                carriers=", ".join(d.get("carriers") or []), stops=stops, price=price, checked=None, flags=[])


# 2. one ticket from the home airport, 3. one ticket from an alternative origin + own hops
mains = {}
for qid, pid, eff, raw in con.execute("SELECT quote_id, pattern_id, eff_cost, raw FROM quotes WHERE pattern_id LIKE 'P:%' "
                                      "AND structure IN ('return','open_jaw') AND ok=1 AND IFNULL(self_transfer,0)=0"):
    q = json.loads(raw); L = q["legs_requested"]
    o, e = L[0]["from"], L[0]["to"]; x = L[1]["from"] if len(L) > 1 else e
    end = L[1]["to"] if len(L) > 1 else o
    if e not in reg_of or x not in reg_of or not q.get("out") or not q.get("home") or end != o or (q.get("tickets") or 1) > 1:
        continue   # only true round trips on one ticket (back to the same origin)
    if o in HOME:
        k = ("ticket", e, x)
    elif o in ALT:
        k = ("madrid", e, x, o)
    else:
        continue
    has_via = bool(q["out"].get("via") or q["out"].get("stops") == 0)
    if k not in mains or eff < mains[k][0] - 1 or (abs(eff - mains[k][0]) <= 1 and has_via and not mains[k][2]):
        mains[k] = (eff, q, has_via)

pos_out = [p for p in ch.products if p["frm"] in HOME and p["to"] in ALT and p["tickets"] == 1]
pos_home = [p for p in ch.products if p["to"] in HOME and p["frm"] in ALT and p["tickets"] == 1]
for k, (eff, q, _) in mains.items():
    out, home = q["out"], q["home"]
    if k[0] == "ticket":
        rows.append(dict(type="ticket", entry=k[1], exit=k[2], eff=eff, tickets=1,
                         out=side_from_leg(out, q["price_dkk"]), home=side_from_leg(home, 0)))
        continue
    o = k[3]
    od, ha = ch.ts(out["dep"]), ch.ts(home["arr"])
    best_o = best_h = None
    for p in pos_out:   # hop to the origin, arriving before the long-haul departure
        if p["to"] != o: continue
        l = ch.connect(p, {"dep": od, "arr": od})
        if l and l["shift"] == 0:
            c = p["eff"] + p["cabin"] + l["cost"]
            if not best_o or c < best_o[0]: best_o = (c, p, l)
    for p in pos_home:
        if p["frm"] != o: continue
        l = ch.connect({"to": o, "arr": ha}, p)
        if l:
            c = p["eff"] + p["cabin"] + l["cost"]
            if not best_h or c < best_h[0]: best_h = (c, p, l)
    if not best_o or not best_h:
        continue
    (co, po, lo), (chh, ph, lh) = best_o, best_h
    s_out = side_from_leg(out, po["price"] + po["cabin"] + lo["nights_cost"] + q["price_dkk"], nights=lo["nights"],
                          changes=1, extra_hours=po["hours"], dep=po["dep"].isoformat(), stops=f"{NAME.get(po['to'], po['to'])}: {lo['label']}")
    s_out["carriers"] = ", ".join(po["carriers"]) + " + " + s_out["carriers"]
    s_out["via"] = (o + " " + s_out["via"]).strip()
    arr_home = (ph["arr"] + dt.timedelta(days=lh["shift"])).isoformat()
    s_home = side_from_leg(home, ph["price"] + ph["cabin"] + lh["nights_cost"], nights=lh["nights"], changes=1,
                           extra_hours=ph["hours"], arr=arr_home, stops=f"{NAME.get(o, o)}: {lh['label']}")
    s_home["carriers"] += " + " + ", ".join(ph["carriers"])
    s_home["via"] = (s_home["via"] + " " + o).strip()
    rows.append(dict(type="madrid", entry=k[1], exit=k[2], eff=eff + co + chh, tickets=3, out=s_out, home=s_home))

# keep the best row per (type, entry, exit), rate, sort
best = {}
for r in rows:
    k = (r["type"], r["entry"], r["exit"])
    if k not in best or r["eff"] < best[k]["eff"]:
        best[k] = r
out_rows = []
for r in best.values():
    price = r["out"]["price"] + r["home"]["price"]
    P = max(1.0, min(5.0, 5 - (price - ANCHOR) / 1000))
    I, H = score_side(r["out"]), score_side(r["home"])
    r.update(price=round(price), p_score=round(P, 1), in_score=I, home_score=H, rating=round(2 * (0.5 * P + 0.3 * H + 0.2 * I), 1))
    out_rows.append(r)
out_rows.sort(key=lambda r: (-r["rating"], r["price"]))

TYPE = {"ticket": "One ticket", "madrid": "Madrid ticket + own hops", "oneways": "Separate one-ways"}
with open(CSV, "w", newline="") as f:
    w = csv.writer(f)
    w.writerow(["rating", "type", "entry", "exit", "price_dkk", "tickets", "out_via", "out_dep", "out_arr", "out_hours", "out_stops",
                "out_carriers", "home_via", "home_dep", "home_arr_cph", "home_hours", "home_stops", "home_carriers",
                "price_score", "in_score", "home_score"])
    for r in out_rows:
        o, h = r["out"], r["home"]
        w.writerow([r["rating"], r["type"], r["entry"], r["exit"], r["price"], r["tickets"], o["via"], o["dep"], o["arr"], o["hours"],
                    o["stops"], o["carriers"], h["via"], h["dep"], h["arr"], h["hours"], h["stops"], h["carriers"],
                    r["p_score"], r["in_score"], r["home_score"]])


def hm(s):
    return s[11:16] if len(s) >= 16 else ""


def day(s):
    try:
        d = dt.date.fromisoformat(s[:10]); return f"{d.day} {d.strftime('%b')}"
    except Exception:
        return ""


if MD:
    PER_TYPE = 5   # always show the best few of every type, even below the top N
    pick = out_rows[:TOP] + [r for t in TYPE for r in [x for x in out_rows if x["type"] == t][:PER_TYPE]]
    seen_city = set()   # and the best row of each type for every arrival city and every departure city
    for r in out_rows:
        for key in (("in", r["entry"], r["type"]), ("out", r["exit"], r["type"])):
            if key not in seen_city:
                seen_city.add(key); pick.append(r)
    pick = sorted({id(r): r for r in pick}.values(), key=lambda r: (-r["rating"], r["price"]))
    short = lambda s: s.split(": ", 1)[-1] if s else ""
    lines = ["| # | In | Out | Type | Price (kr) | Rating | Out via | Leaves CPH | Lands | Out h | Home via | Departs | Home in CPH | Home h | Stops at hubs |",
             "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for i, r in enumerate(pick, 1):
        o, h = r["out"], r["home"]
        stops = "; ".join(x for x in [("out: " + short(o["stops"])) if o["stops"] else "", ("home: " + short(h["stops"])) if h["stops"] else ""] if x)
        lines.append(f"| {i} | {NAME.get(r['entry'], r['entry'])} | {NAME.get(r['exit'], r['exit'])} | {TYPE[r['type']]} | {r['price']:,} | "
                     f"{r['rating']} | {o['via'] or 'nonstop'} | {day(o['dep'])} {hm(o['dep'])} | {day(o['arr'])} {hm(o['arr'])} | {o['hours']} | "
                     f"{h['via'] or 'nonstop'} | {day(h['dep'])} {hm(h['dep'])} | {day(h['arr'])} {hm(h['arr'])} | {h['hours']} | {stops} |")
    open(MD, "w").write("\n".join(lines) + "\n")
print(f"pairs: {len(out_rows)} ({sum(r['type'] == 'ticket' for r in out_rows)} ticket, {sum(r['type'] == 'madrid' for r in out_rows)} madrid, "
      f"{sum(r['type'] == 'oneways' for r in out_rows)} one-ways)")
for r in out_rows[:30]:
    o, h = r["out"], r["home"]
    print(f"{r['rating']:>4} {r['price']:>6} {r['type']:<8} {r['entry']}>{r['exit']} | out {o['via']:<16} {o['dep'][5:]}>{o['arr'][5:]} {o['hours']}h n{o['nights']} c{o['changes']} | "
          f"home {h['via']:<16} {h['dep'][5:]}>{h['arr'][5:]} {h['hours']}h n{h['nights']} c{h['changes']} | {o['stops'][:40]} / {h['stops'][:40]}")
