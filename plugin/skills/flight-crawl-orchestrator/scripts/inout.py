"""Ways in and ways home between the home airport and every Latin American airport, with full timelines.

Usage: python3 -I inout.py [--root DIR] [--md FILE] [--top N] [--per-endpoint K]

Model (schema in references/inout-schema.md):
  way      one direction: home airport -> entry airport (in) or exit airport -> home airport (home), with an ordered
           timeline of flights and stops (connection inside a ticket, self-transfer, day stop, night at a hub), so a
           front end can draw it without parsing text.
  ticket   something you buy. A return or open jaw is one ticket shared by a way in and a way home.
  option   a way in + a way home for one arrival city and one departure city, priced and rated.
Way types:
  ticket   one ticket from the home airport (return or open jaw), both ways share it
  madrid   one ticket from an alternative origin (trip.json inout.alt_origins, default MAD) + own one-way hops
  oneways  separate one-way tickets, incl. self-built chains through hubs (chains.py); any way in combines with any way home
Prices: price_dkk is the flight tickets only. Cabin-bag fees, checked-bag fees, hub nights and their estimated stay
cost are separate "extras" fields (the traveller counts hub nights as part of the journey, not of the flight price).
Rating /10 (long-haul only) = 2 x (0.5 price + 0.3 way home + 0.2 way in):
  price score 5 at inout.price_anchor (7,000 kr) for tickets + cabin-bag fees, minus 1 per 1,000 kr more (min 1);
  way score: 5, -1 per night at a hub, -1 if any change between separate tickets, -1 US transit,
  -1 if flying time > 20 h, another -1 if > 23 h (min 1).
Writes data/inout.json (airports, tickets, ways, options), data/inout.csv (options) and, with --md, a table.
"""
import csv, datetime as dt, importlib.util, json, os, sqlite3, sys
args = sys.argv[1:]
ROOT = os.path.abspath(args[args.index("--root") + 1]) if "--root" in args else os.getcwd()
MD = args[args.index("--md") + 1] if "--md" in args else None
TOP = int(args[args.index("--top") + 1]) if "--top" in args else 40
K = int(args[args.index("--per-endpoint") + 1]) if "--per-endpoint" in args else 4

sys.argv = [sys.argv[0], "--root", ROOT]
spec = importlib.util.spec_from_file_location("chains", os.path.join(os.path.dirname(__file__), "chains.py"))
ch = importlib.util.module_from_spec(spec)
_so = sys.stdout; sys.stdout = open(os.devnull, "w"); spec.loader.exec_module(ch); sys.stdout = _so
cfg, reg_of, HOME = ch.cfg, ch.reg_of, ch.HOME
IO = cfg.get("inout", {})
ANCHOR = IO.get("price_anchor", 7000)
ALT = IO.get("alt_origins", ["MAD"])
NIGHT = ch.C["night_dkk"]
US = {"MIA", "JFK", "EWR", "IAH", "DFW", "ATL", "ORD", "IAD", "LAX", "BOS", "CLT", "DTW", "PHL", "MCO", "FLL", "SFO", "SEA", "MSP", "PHX", "RDU"}
TZ = {**{a: 1 for a in "CPH MAD BCN CDG ORY AMS FRA ZRH MUC BRU FCO OSL ARN WAW BUD KRK MRS AGP ALC VLC RMU".split()},
      **{a: 0 for a in "LIS LHR LGW DUB KEF OPO MAN".split()}, "HEL": 2, "IST": 3, "SAW": 3,
      "CUN": -5, **{a: -6 for a in "MEX GDL TLC MTY NLU GUA SAL SAP TGU RTB MGA SJO LIR BZE".split()}, "PTY": -5,
      **{a: -5 for a in "BOG MDE CTG CLO SMR ADZ PEI BAQ LIM CUZ".split()}, **{a: -4 for a in "LPB VVI CBB SDQ CUR".split()},
      "GRU": -3, "SCL": -3, **{a: -5 for a in "MIA JFK EWR ATL IAD CLT BOS DTW PHL FLL MCO YYZ YUL RDU".split()},
      **{a: -6 for a in "ORD DFW IAH MSP".split()}, "PHX": -7, **{a: -8 for a in "LAX SFO SEA".split()}}
HUB_META = {"CPH": ("Copenhagen", "DK", 55.62, 12.65), "MAD": ("Madrid", "ES", 40.49, -3.57), "BCN": ("Barcelona", "ES", 41.30, 2.08),
            "LIS": ("Lisbon", "PT", 38.77, -9.13), "CDG": ("Paris", "FR", 49.01, 2.55), "AMS": ("Amsterdam", "NL", 52.31, 4.76),
            "FRA": ("Frankfurt", "DE", 50.03, 8.56), "LHR": ("London Heathrow", "GB", 51.47, -0.45), "LGW": ("London Gatwick", "GB", 51.15, -0.19),
            "ZRH": ("Zürich", "CH", 47.46, 8.55), "IST": ("Istanbul", "TR", 41.26, 28.74), "KEF": ("Reykjavík", "IS", 63.99, -22.62),
            "CUN": ("Cancún", "MX", 21.04, -86.87), "MEX": ("Mexico City", "MX", 19.44, -99.07), "SDQ": ("Santo Domingo", "DO", 18.43, -69.67),
            "CUR": ("Curaçao", "CW", 12.19, -68.96), "MIA": ("Miami", "US", 25.79, -80.29), "ATL": ("Atlanta", "US", 33.64, -84.43),
            "ORD": ("Chicago", "US", 41.98, -87.90), "DFW": ("Dallas", "US", 32.90, -97.04), "IAH": ("Houston", "US", 29.99, -95.34),
            "EWR": ("Newark", "US", 40.69, -74.17), "JFK": ("New York", "US", 40.64, -73.78), "YYZ": ("Toronto", "CA", 43.68, -79.63),
            "YUL": ("Montréal", "CA", 45.47, -73.74), "GRU": ("São Paulo", "BR", -23.43, -46.47), "LIM": ("Lima", "PE", -12.02, -77.11),
            "MUC": ("Munich", "DE", 48.35, 11.79), "BRU": ("Brussels", "BE", 50.90, 4.48), "DUB": ("Dublin", "IE", 53.42, -6.27),
            "OPO": ("Porto", "PT", 41.24, -8.68), "FCO": ("Rome", "IT", 41.80, 12.25), "HEL": ("Helsinki", "FI", 60.32, 24.96),
            "PHX": ("Phoenix", "US", 33.43, -112.01), "CLT": ("Charlotte", "US", 35.21, -80.94), "IAD": ("Washington", "US", 38.95, -77.46),
            "NLU": ("Mexico City Felipe Ángeles", "MX", 19.74, -99.02), "MTY": ("Monterrey", "MX", 25.78, -100.11),
            "BOS": ("Boston", "US", 42.36, -71.01), "LAX": ("Los Angeles", "US", 33.94, -118.41), "RDU": ("Raleigh-Durham", "US", 35.88, -78.79)}
con = sqlite3.connect(os.path.join(ROOT, "data", "crawl.db"))
RAW = {}


def raw(qid):
    if qid not in RAW:
        RAW[qid] = json.loads(con.execute("SELECT raw FROM quotes WHERE quote_id=?", (qid,)).fetchone()[0])
    return RAW[qid]


def utc(local, ap):
    t = ch.ts(local or "")
    return None if t is None or ap not in TZ else t - dt.timedelta(hours=TZ[ap])


def legs_of(q):
    return [d for d in [q.get("out")] + list(q.get("mid") or []) + ([q.get("home")] if q.get("structure") != "one_way" else []) if d]


def shift(s, days):
    t = ch.ts(s or "")
    return (t + dt.timedelta(days=days)).isoformat(timespec="minutes") if t else s


def flight_item(d, frm, to, tid, days=0):
    via = d.get("via") or []; lay = list(d.get("layover_h") or []) + [None] * len(via)
    return {"kind": "flight", "from": frm, "to": to, "depart": shift(d.get("dep"), days), "arrive": shift(d.get("arr"), days),
            "hours": d.get("hours"), "connections": [{"airport": v, "layover_h": lay[i]} for i, v in enumerate(via)],
            "carriers": d.get("carriers") or [], "flight_numbers": d.get("flights") or [],
            "overnight_layover": bool(d.get("overnight_layover")), "ticket": tid}


def stop_item(airport, arrive, depart, same_ticket):
    a, b = ch.ts(arrive or ""), ch.ts(depart or "")
    hours = round((b - a).total_seconds() / 3600, 2) if a and b else None
    nights = (b.date() - a.date()).days if a and b else 0
    if nights > 0:
        kind = "night"
    elif hours is not None and hours >= 8:
        kind = "day_stop"
    else:
        kind = "connection" if same_ticket else "self_transfer"
    return {"kind": kind, "airport": airport, "arrive": arrive, "depart": depart, "hours": hours, "nights": nights,
            "same_ticket": same_ticket, "stay_estimate_dkk": nights * NIGHT.get(airport, NIGHT["default"])}


TICKETS = {}


def ticket(qid):
    q = raw(qid)
    tid = f"T{qid}"
    if tid not in TICKETS:
        legs = legs_of(q)
        cabin = checked = 0
        for d in legs:
            cb, ck = ch.bag(d.get("carriers") or [], d.get("hours") or 0)
            cabin += cb; checked = None if (checked is None or ck is None) else checked + ck
        TICKETS[tid] = {"id": tid, "quote_id": qid, "source": q.get("source"), "observed_at": q.get("observed_at"),
                        "structure": q.get("structure"), "legs": [f"{l['from']}>{l['to']}" for l in q.get("legs_requested") or []],
                        "price_dkk": q.get("price_dkk"), "fare_brand": q.get("fare_brand"),
                        "cabin_bag": q.get("cabin_bag"), "cabin_bag_fee_dkk": cabin, "checked_bag": q.get("checked_bag"),
                        "checked_bag_fee_dkk": checked, "tickets_inside": q.get("tickets") or 1,
                        "self_transfer": bool(q.get("self_transfer")), "link": q.get("link"),
                        "carriers": sorted({c for d in legs for c in d.get("carriers") or []}),
                        "flags": list(q.get("flags") or []), "notes": (q.get("notes") or "")[:300]}
    return tid


def timeline_from_quote(q, tid, legs_idx, days=0):
    """Flights (and stops between them inside the same ticket) for the chosen legs of a quote."""
    L = q.get("legs_requested") or []
    legs = legs_of(q)
    items = []
    for n, i in enumerate(legs_idx):
        if n:
            items.append(stop_item(L[i]["from"], items[-1]["arrive"], shift(legs[i].get("dep"), days),
                                   same_ticket=(q.get("tickets") or 1) == 1))
        items.append(flight_item(legs[i], L[i]["from"], L[i]["to"], tid, days))
        # a Mix & Match / self-transfer result: its connections are changes between separate tickets
        items[-1]["self_transfer_inside"] = bool(q.get("self_transfer")) and bool(items[-1]["connections"])
    return items


def finish_way(w):
    tl = w["timeline"]
    fl = [x for x in tl if x["kind"] == "flight"]
    st = [x for x in tl if x["kind"] != "flight"]
    w["from"], w["to"] = fl[0]["from"], fl[-1]["to"]
    w["depart"], w["arrive"] = fl[0]["depart"], fl[-1]["arrive"]
    a, b = utc(w["depart"], w["from"]), utc(w["arrive"], w["to"])
    w["total_hours"] = round((b - a).total_seconds() / 3600, 1) if a and b else None
    w["flying_hours"] = round(sum(x["hours"] or 0 for x in fl), 1)
    w["flights"] = sum(len(x["connections"]) + 1 for x in fl)
    w["hub_nights"] = sum(x["nights"] for x in st)
    w["changes"] = sum(1 for x in st if not x["same_ticket"]) + sum(1 for x in fl if x.get("self_transfer_inside"))
    w["us_transit"] = any(c["airport"] in US for x in fl for c in x["connections"]) or any(x["airport"] in US for x in st)
    w["airports"] = list(dict.fromkeys([fl[0]["from"]] + [a for x in tl for a in
                                       ([c["airport"] for c in x.get("connections") or []] + [x.get("airport") or x.get("to")]) if a]))
    w["score"] = max(1, 5 - w["hub_nights"] - (w["changes"] > 0) - w["us_transit"] - (w["flying_hours"] > 20) - (w["flying_hours"] > 23))
    return w


WAYS = {}


def add_way(w, shared=None):
    w = finish_way(w)
    key = (w["direction"], w["type"], tuple(w["tickets"]), w["depart"])
    for v in WAYS.values():
        if (v["direction"], v["type"], tuple(v["tickets"]), v["depart"]) == key:
            return v["id"]
    w["id"] = f"{'I' if w['direction'] == 'in' else 'H'}{len(WAYS) + 1:04d}"
    own = [t for t in w["tickets"] if t != shared]
    st = [x for x in w["timeline"] if x["kind"] != "flight"]
    w["shared_ticket"] = shared
    w["price_dkk"] = round(sum(TICKETS[t]["price_dkk"] for t in own))           # tickets only (shared ticket on the option)
    ck = [TICKETS[t]["checked_bag_fee_dkk"] for t in own]
    w["extras"] = {"cabin_bag_fees_dkk": sum(TICKETS[t]["cabin_bag_fee_dkk"] for t in own),
                   "checked_bag_fees_dkk": None if any(c is None for c in ck) else sum(ck),
                   "hub_nights": w["hub_nights"], "hub_stay_estimate_dkk": sum(x["stay_estimate_dkk"] for x in st)}
    WAYS[w["id"]] = w
    return w["id"]


# 1. separate one-ways: chains.py ways, best K per endpoint
def chain_way(c, direction):
    tl, tids = [], []
    for p in c["products"]:
        q = raw(p["qid"]); tid = ticket(p["qid"]); tids.append(tid)
        days = (ch.ts(p["dep"]) - ch.ts(legs_of(q)[0]["dep"])).days
        items = timeline_from_quote(q, tid, range(len(legs_of(q))), days)
        if tl:
            tl.append(stop_item(p["frm"], tl[-1]["arrive"], items[0]["depart"], same_ticket=False))
        tl += items
    return add_way({"direction": direction, "type": "oneways", "timeline": tl, "tickets": tids, "flags": c["flags"]})


best_chain = {}
for direction, chains, end in (("in", ch.out, "to"), ("home", ch.home, "frm")):
    per = {}
    for c in sorted(chains, key=lambda c: c["eff"]):
        if c[end] not in reg_of:
            continue
        lst = per.setdefault(c[end], [])
        if len(lst) < K and all(c["route"] != x["route"] or abs(c["price"] - x["price"]) > 200 for x in lst):
            lst.append(c)
    for ap, lst in per.items():
        best_chain[(direction, ap)] = [chain_way(c, direction) for c in lst]

# 2. one ticket from home and 3. alternative-origin ticket + own hops
mains = {}
for qid, eff, rw in con.execute("SELECT quote_id, eff_cost, raw FROM quotes WHERE pattern_id LIKE 'P:%' "
                                "AND structure IN ('return','open_jaw') AND ok=1 AND IFNULL(self_transfer,0)=0"):
    q = json.loads(rw); L = q["legs_requested"]
    o, e = L[0]["from"], L[0]["to"]; x = L[1]["from"] if len(L) > 1 else e
    end = L[1]["to"] if len(L) > 1 else o
    if e not in reg_of or x not in reg_of or not q.get("out") or not q.get("home") or end != o or (q.get("tickets") or 1) > 1:
        continue
    kind = "ticket" if o in HOME else ("madrid" if o in ALT else None)
    if not kind:
        continue
    has_via = bool(q["out"].get("via") or q["out"].get("stops") == 0)
    k = (kind, e, x, o)
    if k not in mains or eff < mains[k][0] - 1 or (abs(eff - mains[k][0]) <= 1 and has_via and not mains[k][3]):
        mains[k] = (eff, qid, q, has_via)

pos_out = [p for p in ch.products if p["frm"] in HOME and p["to"] in ALT and p["tickets"] == 1]
pos_home = [p for p in ch.products if p["to"] in HOME and p["frm"] in ALT and p["tickets"] == 1]
OPTIONS = []
for (kind, e, x, o), (eff, qid, q, _) in mains.items():
    tid = ticket(qid)
    tl_in = timeline_from_quote(q, tid, [0]); tl_home = timeline_from_quote(q, tid, [len(legs_of(q)) - 1])
    tin, thome = [tid], [tid]
    if kind == "madrid":
        od, ha = ch.ts(q["out"]["dep"]), ch.ts(q["home"]["arr"])
        co = [(p, ch.connect(p, {"dep": od, "arr": od})) for p in pos_out if p["to"] == o]
        co = [(p["eff"] + p["cabin"] + l["cost"], p) for p, l in co if l and l["shift"] == 0]
        chm = [(p, ch.connect({"to": o, "arr": ha}, p)) for p in pos_home if p["frm"] == o]
        chm = [(p["eff"] + p["cabin"] + l["cost"], p, l) for p, l in chm if l]
        if not co or not chm:
            continue
        _, po = min(co, key=lambda c: c[0]); _, ph, lh = min(chm, key=lambda c: c[0])
        t_po, t_ph = ticket(po["qid"]), ticket(ph["qid"])
        f_po = timeline_from_quote(raw(po["qid"]), t_po, [0])
        f_ph = timeline_from_quote(raw(ph["qid"]), t_ph, [0], lh["shift"])
        tl_in = f_po + [stop_item(o, f_po[-1]["arrive"], tl_in[0]["depart"], False)] + tl_in
        tl_home = tl_home + [stop_item(o, tl_home[-1]["arrive"], f_ph[0]["depart"], False)] + f_ph
        tin, thome = [t_po, tid], [tid, t_ph]
    wi = add_way({"direction": "in", "type": kind, "timeline": tl_in, "tickets": tin, "flags": q.get("flags") or []}, tid)
    wh = add_way({"direction": "home", "type": kind, "timeline": tl_home, "tickets": thome, "flags": q.get("flags") or []}, tid)
    WAYS[wi]["paired_with"], WAYS[wh]["paired_with"] = wh, wi
    OPTIONS.append((kind, wi, wh, tid))

for (d1, e), ins in best_chain.items():
    if d1 != "in": continue
    for (d2, x), homes in best_chain.items():
        if d2 == "home":
            OPTIONS.append(("oneways", ins[0], homes[0], None))


def option(kind, wi, wh, shared):
    a, b = WAYS[wi], WAYS[wh]
    s = TICKETS[shared] if shared else None
    price = a["price_dkk"] + b["price_dkk"] + (s["price_dkk"] if s else 0)
    cabin = a["extras"]["cabin_bag_fees_dkk"] + b["extras"]["cabin_bag_fees_dkk"] + (s["cabin_bag_fee_dkk"] if s else 0)
    ck = [a["extras"]["checked_bag_fees_dkk"], b["extras"]["checked_bag_fees_dkk"], s["checked_bag_fee_dkk"] if s else 0]
    P = max(1.0, min(5.0, 5 - (price + cabin - ANCHOR) / 1000))
    return {"id": f"{a['to']}-{b['from']}-{kind}", "type": kind, "entry": a["to"], "exit": b["from"], "way_in": wi, "way_home": wh,
            "shared_ticket": shared, "price_dkk": round(price),
            "extras": {"cabin_bag_fees_dkk": cabin, "checked_bag_fees_dkk": None if any(c is None for c in ck) else sum(ck),
                       "hub_nights": a["hub_nights"] + b["hub_nights"],
                       "hub_stay_estimate_dkk": a["extras"]["hub_stay_estimate_dkk"] + b["extras"]["hub_stay_estimate_dkk"]},
            "rating": {"total": round(2 * (0.5 * P + 0.3 * b["score"] + 0.2 * a["score"]), 1), "price": round(P, 1),
                       "way_in": a["score"], "way_home": b["score"]}}


best_opt = {}
for kind, wi, wh, shared in OPTIONS:
    o = option(kind, wi, wh, shared)
    if o["id"] not in best_opt or (o["rating"]["total"], -o["price_dkk"]) > (best_opt[o["id"]]["rating"]["total"], -best_opt[o["id"]]["price_dkk"]):
        best_opt[o["id"]] = o
opts = sorted(best_opt.values(), key=lambda o: (-o["rating"]["total"], o["price_dkk"]))

nodes = {}
mp = os.path.join(ROOT, "data", "network", "map.json")
if os.path.exists(mp):
    for n in json.load(open(mp))["nodes"]:
        if n.get("iata"):
            nodes[n["iata"]] = {"name": n["name"], "country": n.get("country"), "lat": n.get("lat"), "lon": n.get("lon"), "map_node": n["id"]}
AIRPORTS = {}
for a in sorted({a for w in WAYS.values() for a in w["airports"]}):
    m = nodes.get(a) or (dict(zip(("name", "country", "lat", "lon"), HUB_META[a])) if a in HUB_META else {"name": a})
    AIRPORTS[a] = {**m, "region": reg_of.get(a), "utc_offset": TZ.get(a), "home": a in HOME}

json.dump({"generated_at": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), "currency": "DKK", "home": sorted(HOME),
           "rating": {"formula": "2 x (0.5 price + 0.3 way_home + 0.2 way_in)", "price_anchor_dkk": ANCHOR,
                      "price_basis": "tickets + cabin-bag fees (hub stays not included)",
                      "way_score": "5, -1 per night at a hub, -1 if any change between separate tickets, -1 US transit, -1 if flying > 20 h, -1 more if > 23 h"},
           "airports": AIRPORTS, "tickets": TICKETS, "ways": WAYS, "options": opts},
          open(os.path.join(ROOT, "data", "inout.json"), "w"), indent=1, ensure_ascii=False)

NAME = lambda a: AIRPORTS.get(a, {}).get("name", a)
TYPE = {"ticket": "One ticket", "madrid": "Madrid ticket + own hops", "oneways": "Separate one-ways"}


def stops_txt(w):
    def one(x):
        what = f"{x['nights']} night{'s' if x['nights'] > 1 else ''}" if x["nights"] else ("day stop" if x["kind"] == "day_stop" else "self-transfer")
        return f"{what} {x['airport']} ({x['hours']:.0f} h)"
    return "; ".join(one(x) for x in w["timeline"] if x["kind"] in ("night", "day_stop", "self_transfer"))


with open(os.path.join(ROOT, "data", "inout.csv"), "w", newline="") as f:
    wr = csv.writer(f)
    wr.writerow(["rating", "type", "entry", "exit", "price_dkk", "cabin_bag_fees_dkk", "checked_bag_fees_dkk", "hub_nights",
                 "way_in", "in_depart", "in_arrive", "in_flying_h", "in_total_h", "in_stops",
                 "way_home", "home_depart", "home_arrive", "home_flying_h", "home_total_h", "home_stops"])
    for o in opts:
        a, b = WAYS[o["way_in"]], WAYS[o["way_home"]]
        wr.writerow([o["rating"]["total"], o["type"], o["entry"], o["exit"], o["price_dkk"], o["extras"]["cabin_bag_fees_dkk"],
                     o["extras"]["checked_bag_fees_dkk"], o["extras"]["hub_nights"],
                     a["id"], a["depart"], a["arrive"], a["flying_hours"], a["total_hours"], stops_txt(a),
                     b["id"], b["depart"], b["arrive"], b["flying_hours"], b["total_hours"], stops_txt(b)])


def hm(s): return s[11:16] if s and len(s) >= 16 else ""


def day(s):
    try:
        d = dt.date.fromisoformat(s[:10]); return f"{d.day} {d.strftime('%b')}"
    except Exception:
        return ""


def via(w):
    return " ".join(a for a in w["airports"][1:-1])


if MD:
    pick = opts[:TOP]
    for t in TYPE:
        pick += [o for o in opts if o["type"] == t][:5]
    seen = set()
    for o in opts:
        for key in (("in", o["entry"], o["type"]), ("out", o["exit"], o["type"])):
            if key not in seen:
                seen.add(key); pick.append(o)
    pick = sorted({o["id"]: o for o in pick}.values(), key=lambda o: (-o["rating"]["total"], o["price_dkk"]))
    lines = ["| # | In | Out | Type | Flights (kr) | Cabin bag fees (kr) | Rating | Out via | Leaves CPH | Lands | Out h | Home via | Departs | Home in CPH | Home h | Hub nights | Stops at hubs |",
             "|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|"]
    for i, o in enumerate(pick, 1):
        a, b = WAYS[o["way_in"]], WAYS[o["way_home"]]
        s = "; ".join(x for x in [("out: " + stops_txt(a)) if stops_txt(a) else "", ("home: " + stops_txt(b)) if stops_txt(b) else ""] if x)
        lines.append(f"| {i} | {NAME(o['entry'])} | {NAME(o['exit'])} | {TYPE[o['type']]} | {o['price_dkk']:,} | {o['extras']['cabin_bag_fees_dkk'] or ''} | "
                     f"{o['rating']['total']} | {via(a) or 'nonstop'} | {day(a['depart'])} {hm(a['depart'])} | {day(a['arrive'])} {hm(a['arrive'])} | "
                     f"{a['flying_hours']} | {via(b) or 'nonstop'} | {day(b['depart'])} {hm(b['depart'])} | {day(b['arrive'])} {hm(b['arrive'])} | "
                     f"{b['flying_hours']} | {o['extras']['hub_nights'] or ''} | {s} |")
    open(MD, "w").write("\n".join(lines) + "\n")
print(f"ways: {sum(w['direction'] == 'in' for w in WAYS.values())} in, {sum(w['direction'] == 'home' for w in WAYS.values())} home | "
      f"tickets: {len(TICKETS)} | options: {len(opts)} | airports: {len(AIRPORTS)}")
for o in opts[:10]:
    a, b = WAYS[o["way_in"]], WAYS[o["way_home"]]
    print(o["rating"]["total"], o["price_dkk"], o["extras"], o["id"], "|", a["depart"], a["arrive"], a["total_hours"], stops_txt(a), "|",
          b["depart"], b["arrive"], b["total_hours"], stops_txt(b))
