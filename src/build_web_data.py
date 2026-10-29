"""Build the route map frontend data: data/web/places.json, connections.json, countries.json.

Usage: python3 -I build_web_data.py [--root DIR] [--fetch-elevation]
Reads data/network/map.json (run build_map.py first) and data/quotes.csv, writes the contract in
MAP_DESIGN_HANDOFF.md section 7: integer DKK prices, durations in minutes, lat/lon coordinates.
Undirected pairs: every connection merges the researched ground/boat/flight edges and the crawled
flights (R: one-ways, RR: returns) of both directions into one list of options.
--fetch-elevation looks up each place's altitude on the Open-Meteo elevation API (Copernicus DEM)
and caches it in data/network/elevation.json; without it the cache is used when present.
"""
import csv, datetime, json, os, re, sqlite3, statistics, sys, urllib.request

args = sys.argv[1:]
ROOT = os.path.abspath(args[args.index("--root") + 1]) if "--root" in args else os.getcwd()
NET = os.path.join(ROOT, "data", "network")
OUT = os.path.join(ROOT, "data", "web")

COUNTRIES = [  # code, name, label_lat, label_lon (context countries carry no places)
    ("MX", "Mexico", 22.5, -101.5), ("GT", "Guatemala", 15.6, -90.3), ("BZ", "Belize", 17.2, -88.7),
    ("SV", "El Salvador", 13.75, -88.9), ("HN", "Honduras", 14.75, -86.6), ("NI", "Nicaragua", 12.9, -85.2),
    ("CR", "Costa Rica", 10.0, -84.0), ("PA", "Panama", 8.4, -80.4), ("CO", "Colombia", 3.5, -73.0),
    ("VE", "Venezuela", 7.3, -66.0), ("EC", "Ecuador", -1.5, -78.3), ("PE", "Peru", -9.5, -75.0),
    ("BR", "Brazil", -10.0, -55.0), ("BO", "Bolivia", -16.5, -64.5), ("CL", "Chile", -23.5, -69.3),
    ("PY", "Paraguay", -23.0, -58.4), ("AR", "Argentina", -27.0, -64.0), ("CU", "Cuba", 21.8, -79.3),
    ("DO", "Dominican Rep.", 18.9, -70.5), ("US", "United States", 29.5, -98.0),
]
# airports that show up as flight vias but are not places on the map
CONTEXT_AIRPORTS = {
    "SDQ": ("Santo Domingo", "DO", 18.43, -69.67), "MEX": ("Mexico City", "MX", 19.44, -99.07),
    "MIA": ("Miami", "US", 25.79, -80.29), "LAP": ("La Paz (Baja California)", "MX", 24.07, -110.36),
    "NLU": ("Mexico City Felipe Angeles", "MX", 19.74, -99.02),
}
CATEGORIES = {  # fixed list from the handoff; regexes over tagline, summary, things to do and why
    "Transit hub": None,
    "Colonial": r"colonial|cobble|old town|walled",
    "Beach": r"beach|surf|snorkel|dive|diving|reef|caribbean coast",
    "Altitude": None,
    "Nature": r"volcano|hike|hiking|trek|national park|jungle|forest|waterfall|salt flat|lagoon|canyon|wildlife|river|cloud",
    "Nightlife": r"nightlife|bars?\b|party|salsa|club|rooftop",
    "Food": r"food|coffee|ceviche|cooking|cuisine|restaurant|chocolate|tequila|mezcal",
    "Markets": r"market",
    "Ruins": r"ruin|maya|inca|archaeolog|tikal|pyramid",
}
GROUND = {"bus", "shuttle", "chicken_bus", "colectivo", "train"}


SHORT = {"VVI": "Santa Cruz", "TAYR": "Tayrona"}  # map labels for names too long to place


def short_name(name):
    return re.sub(r"\s*\(.*?\)\s*", " ", name).split(" / ")[0].strip()


def minutes(hours):
    return None if hours in (None, "") else int(round(float(hours) * 60))


def dkk(x):
    return None if x in (None, "") else int(round(float(x)))


def fetch_elevation(nodes):
    lat = ",".join(str(n["lat"]) for n in nodes)
    lon = ",".join(str(n["lon"]) for n in nodes)
    url = f"https://api.open-meteo.com/v1/elevation?latitude={lat}&longitude={lon}"
    with urllib.request.urlopen(url, timeout=30) as r:
        elev = json.load(r)["elevation"]
    return {n["id"]: int(round(e)) for n, e in zip(nodes, elev)}


def categories(n, alt):
    p = n.get("profile") or {}
    text = " ".join([p.get("tagline") or "", p.get("summary") or "", n.get("why") or ""] + (p.get("things_to_do") or [])).lower()
    scores = {}
    if n["type"] == "hub":
        scores["Transit hub"] = 1
    if alt is not None and alt >= 2500:
        scores["Altitude"] = 3
    if n["type"] in ("beach", "island"):
        scores["Beach"] = 2
    if n["type"] in ("park", "lake"):
        scores["Nature"] = 2
    for cat, rx in CATEGORIES.items():
        if rx:
            hits = len(re.findall(rx, text))
            if hits:
                scores[cat] = scores.get(cat, 0) + hits
    order = list(CATEGORIES)
    return [c for c, _ in sorted(scores.items(), key=lambda kv: (-kv[1], order.index(kv[0])))][:3]


HUB_FLIGHTS = 3  # flight routes that make a town a destination


def tier(n):
    if n["type"] == "border":
        return "stop_only"
    return "destination" if n["popularity"] <= 2 else "town"


def build():
    m = json.load(open(os.path.join(NET, "map.json"), encoding="utf-8"))
    nodes = {n["id"]: n for n in m["nodes"]}
    elev_path = os.path.join(NET, "elevation.json")
    elev = json.load(open(elev_path, encoding="utf-8")) if os.path.exists(elev_path) else {}
    if "--fetch-elevation" in args:
        elev.update(fetch_elevation(list(nodes.values())))
        json.dump(elev, open(elev_path, "w", encoding="utf-8"), indent=1, sort_keys=True)

    def load_json(name, default):
        f = os.path.join(NET, name)
        return json.load(open(f, encoding="utf-8")) if os.path.exists(f) else default
    shortlist = load_json("shortlist.json", {"places": []})
    diving = load_json("diving.json", {"sites": []})
    starred = {x["id"] for x in shortlist.get("places", [])}
    dives_at = {}
    for d in diving.get("sites", []):
        if d.get("node"):
            dives_at.setdefault(d["node"], []).append(d["id"])

    places = []
    for n in nodes.values():
        p = n.get("profile") or {}
        img = p.get("image") or None
        alt = elev.get(n["id"])
        places.append({
            "id": n["id"], "name": n["name"], "short_name": SHORT.get(n["id"]) or short_name(n["name"]), "country": n["country"],
            "lat": n["lat"], "lon": n["lon"], "tier": tier(n), "type": n["type"], "popularity": n["popularity"],
            "iata": n.get("iata"), "airport_transfer_min": None,
            "why": p.get("tagline") or n.get("why"), "reason": n.get("why"),
            "summary": p.get("summary"), "categories": categories(n, alt),
            "things_to_do": p.get("things_to_do") or [], "touristy": p.get("touristy"), "altitude_m": alt,
            "image": img and {"url": img.get("url"), "page": img.get("page"), "credit": img.get("credit"),
                              "licence": img.get("license"), "w": img.get("w"), "h": img.get("h")},
            "hostels": [{"name": h.get("name"), "dorm_dkk": dkk(h.get("dorm_dkk")), "private_dkk": dkk(h.get("private_dkk")),
                         "rating": h.get("rating"), "price_suspect": bool(h.get("price_suspect")), "url": h.get("source")}
                        for h in (p.get("hostels") or [])],
            "hostel_note": p.get("hostel_price_note"),
            "shortlist": n["id"] in starred, "dive_sites": dives_at.get(n["id"], []),
        })
    for code, (name, country, lat, lon) in CONTEXT_AIRPORTS.items():
        if code not in nodes:
            places.append({"id": code, "name": name, "short_name": name, "country": country, "lat": lat, "lon": lon,
                           "tier": "stop_only", "type": "airport", "popularity": 5, "iata": code, "context": True})
    known = {p["id"] for p in places}

    # crawled one-way quotes per directed pair: cheapest, fastest, typical, observed_at, link
    quotes = {}
    for q in csv.DictReader(open(os.path.join(ROOT, "data", "quotes.csv"), encoding="utf-8")):
        pid = q["pattern_id"]
        if not pid.startswith(("R:", "RR:")) or q["ok"] != "1" or not q["price_dkk"]:
            continue
        a, b = pid.split(":")[1].split("/")[0].split(">")
        quotes.setdefault((a, b), []).append(q)
    # the outbound leg as flown: a search for one date also returns flights on the days around it
    legs, homes = {}, {}
    db = os.path.join(ROOT, "data", "crawl.db")
    if os.path.exists(db):
        for qid, raw in sqlite3.connect(db).execute(
                "SELECT quote_id, raw FROM quotes WHERE (pattern_id LIKE 'R:%' OR pattern_id LIKE 'RR:%') AND ok=1"):
            r = json.loads(raw)
            legs[qid], homes[qid] = r.get("out") or {}, r.get("home") or {}

    def flown(q):
        return (legs.get(q["quote_id"], {}).get("dep") or q["out_date"])[:10]

    def days_after(leg):  # the arrival is this many days after the departure
        d, a = (leg.get("dep") or "")[:10], (leg.get("arr") or "")[:10]
        return (datetime.date.fromisoformat(a) - datetime.date.fromisoformat(d)).days if d and a else 0

    used = set()  # directed pairs whose quotes reached an option

    def leg_of(leg, hours, via, carriers, fallback):
        return {"date": (leg.get("dep") or fallback or "")[:10] or None,
                "dep": (leg.get("dep") or "")[11:16] or None, "arr": (leg.get("arr") or "")[11:16] or None,
                "arr_days": days_after(leg), "duration_min": minutes(hours), "vias": [v for v in (via or "").split("-") if v],
                "carriers": [c for c in (carriers or "").split(",") if c], "flights": leg.get("flights") or []}

    def stops_of(via):
        return [{"place_id": v, "type": "layover", "wait_min": None} for v in (via or "").split("-") if v]

    def crawl_flight(e, pair_quotes):
        ow = [q for q in pair_quotes if q["pattern_id"].startswith("R:")]
        rr = [q for q in pair_quotes if q["pattern_id"].startswith("RR:")]
        cheap = min(ow, key=lambda q: float(q["price_dkk"])) if ow else None
        timed = [q for q in ow if q["out_hours"]]
        fast = min(timed, key=lambda q: (float(q["out_hours"]), float(q["price_dkk"]))) if timed else None
        ret = min(rr, key=lambda q: float(q["price_dkk"])) if rr else None
        observed = max((q["observed_at"] for q in pair_quotes), default=None)
        flags = sorted({f for q in ow for f in q["flags"].split(",") if f})
        day_best = {}  # the cheapest one-way per departure date
        for q in ow:
            d = flown(q)
            if d and (d not in day_best or float(q["price_dkk"]) < float(day_best[d]["price_dkk"])):
                day_best[d] = q
        by_date = []
        for d, q in sorted(day_best.items()):
            leg = legs.get(q["quote_id"], {})
            by_date.append({"date": d, "from": e["from"], "to": e["to"], "dkk": dkk(q["price_dkk"]),
                            "dep": (leg.get("dep") or "")[11:16] or None, "arr": (leg.get("arr") or "")[11:16] or None,
                            "arr_days": days_after(leg), "duration_min": minutes(q["out_hours"]), "vias": [v for v in q["out_via"].split("-") if v],
                            "carriers": [c for c in q["out_carriers"].split(",") if c], "flights": leg.get("flights") or [],
                            "self_transfer": q["self_transfer"] == "1", "searched": q["out_date"], "link": q["link"] or None})
        round_trips, seen = [], set()  # every dated return, both legs as flown
        for q in sorted(rr, key=lambda q: (q["out_date"], float(q["price_dkk"]))):
            out = leg_of(legs.get(q["quote_id"], {}), q["out_hours"], q["out_via"], q["out_carriers"], q["out_date"])
            home = leg_of(homes.get(q["quote_id"], {}), q["home_hours"], q["home_via"], q["home_carriers"], q["home_date"])
            k = (q["price_dkk"], json.dumps(out), json.dumps(home))
            if k in seen:
                continue
            seen.add(k)
            round_trips.append({"from": e["from"], "to": e["to"], "dkk": dkk(q["price_dkk"]), "out": out, "home": home,
                                "self_transfer": q["self_transfer"] == "1", "link": q["link"] or None})
        return {
            "mode": "flight", "operators": e.get("carriers") or [],
            "duration_min": minutes(e.get("fastest_hours")),
            "price_dkk": {"min": dkk(e.get("oneway_min_dkk")),
                          "typical": dkk(statistics.median(float(q["price_dkk"]) for q in ow)) if ow else None},
            "frequency": None, "overnight": False,
            "border": nodes.get(e["from"], {}).get("country") != nodes.get(e["to"], {}).get("country"),
            "stops": stops_of(fast and fast["out_via"]),
            "geometry": None,
            "flight": {
                "nonstop": bool(e.get("nonstop")), "vias": e.get("vias") or [], "carriers": e.get("carriers") or [],
                "oneway_dkk": {"min": dkk(e.get("oneway_min_dkk")), "observed_at": cheap and cheap["observed_at"]},
                "return_dkk": {"min": dkk(ret["price_dkk"]), "observed_at": ret["observed_at"]} if ret
                              else ({"min": dkk(e["return_min_dkk"]), "observed_at": None} if e.get("return_min_dkk") else None),
                "dates_searched": e.get("dates") or [],
                "by_date": by_date,
                "round_trips": round_trips,
                "cheapest": cheap and {"dkk": dkk(cheap["price_dkk"]), "duration_min": minutes(cheap["out_hours"]),
                                       "vias": [v for v in cheap["out_via"].split("-") if v], "carriers": cheap["out_carriers"].split(","),
                                       "date": flown(cheap), "self_transfer": cheap["self_transfer"] == "1"},
                "fastest": fast and {"dkk": dkk(fast["price_dkk"]), "duration_min": minutes(fast["out_hours"]),
                                     "vias": [v for v in fast["out_via"].split("-") if v], "carriers": fast["out_carriers"].split(","),
                                     "date": flown(fast)},
                "flags": flags, "quotes": len(pair_quotes),
            },
            "source": "crawl", "observed_at": observed,
            "note": None, "booking_url": (cheap or fast or {}).get("link") or None,
            "dir": [e["from"], e["to"]],
        }

    def researched(e):
        mode = e["mode"]
        src = e.get("source") or ""
        return {
            "mode": mode, "operators": [o.strip() for o in re.split(r"\s*/\s*|,\s*", e.get("operator") or "") if o.strip()],
            "duration_min": minutes(e.get("duration_h")), "duration_range_h": e.get("duration_range"),
            "price_dkk": {"min": dkk(e.get("price_dkk")), "typical": None}, "price_local": e.get("price_range_local"),
            "frequency": e.get("frequency"), "overnight": bool(e.get("overnight")), "border": bool(e.get("border")),
            "stops": [], "geometry": None,
            "flight": {"nonstop": None, "vias": [], "carriers": [o.strip() for o in re.split(r"\s*/\s*|,\s*", e.get("operator") or "") if o.strip()],
                       "oneway_dkk": {"min": dkk(e.get("price_dkk")), "observed_at": str(e.get("source_year") or "")},
                       "return_dkk": None, "dates_searched": [], "by_date": [], "round_trips": []} if mode == "flight" else None,
            "source": "manual", "source_url": src if src.startswith("http") else None,
            "observed_at": str(e.get("source_year") or "") or None,
            "note": e.get("notes"), "booking_url": None,
        }

    conns = {}
    for e in m["edges"]:
        a, b = e["from"], e["to"]
        if a not in known or b not in known or a == b:
            continue
        key = tuple(sorted((a, b)))
        c = conns.setdefault(key, {"id": f"{key[0]}-{key[1]}", "a": key[0], "b": key[1], "options": []})
        if e.get("source") == "crawl":
            used.add((a, b))
            opt = crawl_flight(e, quotes.get((a, b), []))
            # the stops are listed from a to b; a crawl from b to a is reversed
            if (a, b) != key:
                opt["stops"].reverse()
        else:
            opt = researched(e)
        c["options"].append(opt)

    # one flight option per pair: crawled data wins on price, researched data fills operators, frequency and note
    for c in conns.values():
        fl = [o for o in c["options"] if o["mode"] == "flight"]
        if len(fl) <= 1:
            continue
        crawled = [o for o in fl if o["source"] == "crawl"]
        manual = [o for o in fl if o["source"] != "crawl"]
        if crawled:
            best = min(crawled, key=lambda o: o["price_dkk"]["min"] or 1e9)
            for o in crawled:
                if o is best:
                    continue
                best["flight"]["dates_searched"] = sorted(set(best["flight"]["dates_searched"]) | set(o["flight"]["dates_searched"]))
                best["flight"]["by_date"] = sorted(best["flight"]["by_date"] + o["flight"]["by_date"], key=lambda r: (r["date"], r["from"]))
                best["flight"]["round_trips"] = sorted(best["flight"]["round_trips"] + o["flight"]["round_trips"],
                                                       key=lambda r: (r["out"]["date"] or "", r["dkk"] or 0))
                best["flight"]["vias"] = sorted(set(best["flight"]["vias"]) | set(o["flight"]["vias"]))
                best["flight"]["carriers"] = sorted(set(best["flight"]["carriers"]) | set(o["flight"]["carriers"]))
                best["flight"]["nonstop"] = best["flight"]["nonstop"] or o["flight"]["nonstop"]
                if o["duration_min"] and (not best["duration_min"] or o["duration_min"] < best["duration_min"]):
                    best["duration_min"] = o["duration_min"]
                if o["flight"]["return_dkk"] and not best["flight"]["return_dkk"]:
                    best["flight"]["return_dkk"] = o["flight"]["return_dkk"]
                best["flight"]["quotes"] += o["flight"]["quotes"]
            if manual:
                m0 = min(manual, key=lambda o: o["duration_min"] or 1e9)
                best["frequency"] = m0["frequency"]
                best["note"] = m0["note"]
                best["source_url"] = m0["source_url"]
                best["operators"] = list(dict.fromkeys(best["operators"] + m0["operators"]))
                best["researched"] = {"duration_min": m0["duration_min"], "price_min": m0["price_dkk"]["min"],
                                      "operators": m0["operators"], "year": m0["observed_at"]}
                if m0["duration_min"] and best["flight"]["nonstop"] and (not best["duration_min"] or m0["duration_min"] < best["duration_min"]):
                    best["duration_min"] = m0["duration_min"]
            keep = [best]
        else:
            keep = [min(manual, key=lambda o: o["price_dkk"]["min"] or 1e9)]
        c["options"] = [o for o in c["options"] if o["mode"] != "flight"] + keep

    for c in conns.values():
        for o in c["options"]:
            o.pop("dir", None)
            o["stops"] = [s for s in o["stops"] if s["place_id"] in known]
        c["options"].sort(key=lambda o: (o["mode"] == "flight", o["duration_min"] or 1e9))

    # a place with several flight routes is a hub the overview draws lines to: always shown, and labelled first
    flights = {}
    for c in conns.values():
        if any(o["mode"] == "flight" for o in c["options"]):
            for end in (c["a"], c["b"]):
                flights[end] = flights.get(end, 0) + 1
    for p in places:
        p["hub"] = not p.get("context") and flights.get(p["id"], 0) >= HUB_FLIGHTS
        if p["hub"] and p["tier"] == "town":
            p["tier"] = "destination"

    countries = [{"code": c, "name": n, "label_lat": la, "label_lon": lo} for c, n, la, lo in COUNTRIES]
    os.makedirs(OUT, exist_ok=True)
    for name, data in (("places", places), ("connections", list(conns.values())), ("countries", countries),
                       ("diving", diving), ("shortlist", shortlist)):
        json.dump(data, open(os.path.join(OUT, f"{name}.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
    print(f"places {len(places)}  connections {len(conns)}  options {sum(len(c['options']) for c in conns.values())}"
          f"  altitude {sum(1 for p in places if p.get('altitude_m') is not None)}  -> {OUT}")
    # every acceptable regional quote should reach the map, so a pair left over means map.json lacks its edge
    for pair in sorted(set(quotes) - used):
        print(f"WARNING {len(quotes[pair])} acceptable quotes for {pair[0]}>{pair[1]} have no flight edge in map.json")


if __name__ == "__main__":
    build()
