"""Evaluate whole-trip scenarios component by component from the crawl table.

Usage: python3 -I evaluate.py [--root DIR] [--md FILE]
Reads ROOT/data/scenarios.json:
 [{"id","name","story", "components": [
    {"label":"Long-haul", "pattern":"P:MAD>SAL/VVI>MAD" | ["alt1","alt2"], "pick":"value|cheap|fast",
     "dates":["2026-12-02"], "carriers":"Avianca", "no_flags":["self_transfer","us_transit"], "max_hours":24,
     "price":123, "hours":2.3, "flights":0, "note":"..." (fixed component, e.g. a train)} ]}]
and ROOT/data/bag_rules.json: [{"match":"Avianca","checked_dkk":..,"cabin_dkk":..,"note":..}] (per flown direction/ticket leg).
Per component it picks one acceptable quote (pick=value: lowest effective cost; cheap: lowest price; fast: shortest
longest leg), then sums price, a checked-bag variant, flight hours, number of flights, tickets, airlines and flags.
"""
import json, os, sqlite3, sys
args = sys.argv[1:]
ROOT = os.path.abspath(args[args.index("--root") + 1]) if "--root" in args else os.getcwd()
MD = args[args.index("--md") + 1] if "--md" in args else None
con = sqlite3.connect(os.path.join(ROOT, "data", "crawl.db"))
SC = json.load(open(os.path.join(ROOT, "data", "scenarios.json")))
BAGS = json.load(open(os.path.join(ROOT, "data", "bag_rules.json"))) if os.path.exists(os.path.join(ROOT, "data", "bag_rules.json")) else []


CODES = {"KL": "KLM", "AF": "Air France", "CM": "Copa", "G3": "GOL", "AV": "Avianca", "AA": "American", "UA": "United",
         "DL": "Delta", "LA": "LATAM", "OB": "BoA", "IB": "Iberia", "UX": "Air Europa", "AM": "Aeromexico", "Y4": "Volaris",
         "P5": "Wingo", "JA": "JetSMART", "BA": "British Airways", "AY": "Finnair", "LH": "Lufthansa", "FR": "Ryanair",
         "DY": "Norwegian", "SK": "Scandinavian", "AC": "Air Canada", "LX": "SWISS", "TA": "Avianca"}


def bag_for(carriers, leg):
    """Checked-bag add-on for one flown direction: the rule of the first matching carrier;
    long-haul rate when the leg is longer than 9 h."""
    carriers = [CODES.get(c, c) for c in carriers]
    for r in BAGS:
        if any(r["match"].lower() in c.lower() for c in carriers):
            v = r["longhaul_dkk"] if (leg.get("hours") or 0) > 9 else r["regional_dkk"]
            return {"match": r["match"], "checked_dkk": v, "cabin_dkk": r.get("cabin_dkk", 0)}
    return None


def pick(comp):
    pats = comp["pattern"] if isinstance(comp["pattern"], list) else [comp["pattern"]]
    rows = []
    for p in pats:
        rows += con.execute("SELECT quote_id, pattern_id, eff_cost, price_dkk, out_date, home_date, max_leg_hours, flags, raw "
                            "FROM quotes WHERE ok=1 AND pattern_id=?", (p,)).fetchall()
    out = []
    for qid, pid, eff, price, od, hd, mh, flags, raw in rows:
        q = json.loads(raw)
        legs = [d for d in [q.get("out")] + list(q.get("mid") or []) + [q.get("home")] if d]
        if comp.get("dates") and not any((d.get("dep") or "")[:10] in comp["dates"] for d in legs[:1]):
            continue
        if comp.get("home_dates") and len(legs) > 1 and (legs[-1].get("dep") or "")[:10] not in comp["home_dates"]:
            continue
        fl = set((flags or "").split(","))
        if set(comp.get("no_flags", [])) & fl:
            continue
        cars = sorted({c for d in legs for c in d.get("carriers") or []})
        if comp.get("carriers") and not all(any(comp["carriers"].lower() in c.lower() for c in d.get("carriers") or []) for d in legs):
            continue
        if comp.get("max_hours") and mh and mh > comp["max_hours"]:
            continue
        if not all(d.get("hours") and d.get("carriers") for d in legs) or len(legs) < (2 if q.get("structure") in ("return", "open_jaw") else 1):
            continue   # need both directions with hours and carriers
        out.append(dict(qid=qid, pid=pid, eff=eff, price=price, mh=mh or 0, legs=legs, cars=cars, flags=fl, q=q))
    if not out:
        return None
    key = {"cheap": lambda r: r["price"], "fast": lambda r: (r["mh"], r["price"])}.get(comp.get("pick"), lambda r: r["eff"])
    return min(out, key=key)


results = []
for s in SC:
    tot = dict(price=0, bag=0, hours=0, flights=0, tickets=0, eff=0)
    lines, flags, airlines, ok = [], set(), set(), True
    for c in s["components"]:
        if "price" in c and "pattern" not in c:
            tot["price"] += c["price"]; tot["eff"] += c["price"] + 150 * c.get("hours", 0)
            tot["bag"] += c.get("bag_dkk", 0); tot["hours"] += c.get("hours", 0); tot["flights"] += c.get("flights", 0)
            tot["tickets"] += 1 if c.get("flights") else 0
            lines.append(f"{c['label']}: {c['price']} ({c.get('note', '')})")
            continue
        r = pick(c)
        if not r:
            ok = False; lines.append(f"{c['label']}: NOT PRICED ({c['pattern']})"); continue
        h = sum(d.get("hours") or 0 for d in r["legs"])
        nseg = sum((d.get("stops") or 0) + 1 for d in r["legs"])
        bag = 0; cabin = 0; bag_notes = []
        for d in r["legs"]:
            first = (d.get("flights") or [None])[0]
            op = [first.rsplit(" ", 1)[0]] if first and " " in first else (d.get("carriers") or [])[:1]
            br = bag_for(op or (d.get("carriers") or []), d)
            if br and br.get("checked_dkk") is not None:
                bag += br["checked_dkk"]; cabin += br.get("cabin_dkk") or 0
                bag_notes.append(f"{br['match']} {br['checked_dkk']}" + (f", cabin {br['cabin_dkk']}" if br.get("cabin_dkk") else ""))
            else:
                bag_notes.append("bag ?")
        tick = r["q"].get("tickets") or (2 if "self_transfer" in r["flags"] else 1)
        tot["price"] += r["price"] + cabin; tot["bag"] += bag; tot["hours"] += h; tot["flights"] += nseg
        tot["tickets"] += tick; tot["eff"] += r["eff"]
        flags |= {f for f in r["flags"] if f in ("self_transfer", "us_transit", "overnight", "tight_connection", "basic_fare", "airport_change")}
        if any(d.get("overnight_layover") for d in r["legs"]): flags.add("overnight")
        airlines |= set(r["cars"])
        hrs = " / ".join(f"{(d.get('dep') or '')[11:16]}>{(d.get('arr') or '')[11:16]}"
                         f"{'+1' if (d.get('arr') or '')[:10] > (d.get('dep') or '')[:10] else ''} {d.get('hours')}" for d in r["legs"])
        lines.append(f"{c['label']}: {r['price']:.0f}{f' + cabin bag {cabin}' if cabin else ''} | {r['pid']} {r['legs'][0].get('dep','')[:10]} | {hrs} h | "
                     f"{', '.join(r['cars'])} | {nseg} flights, {tick} ticket(s) | bag +{bag} ({'; '.join(bag_notes)})")
    results.append(dict(id=s["id"], name=s["name"], story=s.get("story", ""), ok=ok, lines=lines, flags=sorted(flags),
                        airlines=sorted(airlines), **tot))

out = []
for r in sorted(results, key=lambda r: (not r["ok"], r["eff"])):
    out.append(f"## {r['id']} {r['name']}{'' if r['ok'] else '  (INCOMPLETE)'}")
    out.append(f"total {r['price']:.0f} DKK with cabin bag | +{r['bag']:.0f} with checked bag = {r['price'] + r['bag']:.0f} | "
               f"{r['hours']:.1f} h in the air incl. connections | {r['flights']} flights | {r['tickets']} tickets | eff {r['eff']:.0f}")
    out.append(f"flags: {', '.join(r['flags']) or 'none'} | airlines: {', '.join(r['airlines'])}")
    out += ["  - " + l for l in r["lines"]]
    out.append("")
txt = "\n".join(out)
print(txt)
if MD:
    open(MD, "w").write(txt)
json.dump(results, open(os.path.join(ROOT, "data", "scenario_results.json"), "w"), indent=1, default=list)
