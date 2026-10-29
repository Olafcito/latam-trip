"""One-off seed of the experiences database: data/network/experiences.jsonl.

Researched experiences come from data/network/diving.json (the dive sites) plus a few written here (Acatenango, Corcovado).
Every place's things-to-do list is then added as light experiences (researched: false), sorted into a category by the
keyword regexes in experience_categories.json. Seeded items that a researched experience at the same place already
covers (its replaces_seed regex) are skipped. Ran once on 2026-10-29; diving.json was folded in and removed, so experiences.jsonl is now the source and is edited directly.

Usage: python3 -I plugin/skills/trip-checklist/scripts/seed_experiences.py [--root DIR]
"""
import json, os, re, sys, unicodedata

args = sys.argv[1:]
ROOT = os.path.abspath(args[args.index("--root") + 1]) if "--root" in args else os.getcwd()
NET = os.path.join(ROOT, "data", "network")
USD = 6.45
TODAY = "2026-10-29"

cats = json.load(open(os.path.join(NET, "experience_categories.json"), encoding="utf-8"))
RX = {c["id"]: re.compile(c["keywords"], re.I) for c in cats["categories"]}
SEED_ORDER = ["diving", "training", "adventure", "wildlife", "ruins", "food", "nightlife", "culture", "hiking", "beach", "courses"]
COURSE = re.compile(r"course|school|lesson|class|learn", re.I)
nodes = {n["id"]: n for n in json.load(open(os.path.join(NET, "map.json"), encoding="utf-8"))["nodes"]}


def slug(s):
    s = unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", s).strip("-")[:48]


def category_of(text):
    for c in SEED_ORDER:
        if RX[c].search(text):
            return c
    return "culture"


out = []
# 1. dive sites researched on 2026-10-29
dv = json.load(open(os.path.join(NET, "diving.json"), encoding="utf-8"))
GENERAL = {"utila", "little-corn", "taganga"}   # cover the place's general diving items
for d in dv["sites"]:
    node = d.get("node")
    out.append({
        "kind": "experience", "id": d["id"], "name": d["name"], "category": "diving",
        "tags": ["sharks"] if "shark" in (d.get("animals") or "").lower() else [],
        "places": [node] if node else [], "area": None if node else d["name"].split(", ")[-1],
        "country": d["country"], "lat": d["lat"], "lon": d["lon"],
        "summary": d["animals"] + (". " + d["note"] if d.get("note") else ""),
        "season": d.get("season"), "dec_jan": d.get("dec_jan"),
        "price": d.get("price"), "price_dkk": d.get("price_dkk"), "duration": None,
        "requirements": d.get("cert"),
        "details": {"water": d.get("water"), "animals": d.get("animals"), "shark_chance": d.get("shark_chance"),
                    "depth": d.get("depth"), "cert": d.get("cert"), "logged_dives_min": d.get("logged_dives_min")},
        "researched": True, "checked_at": dv["updated"], "sources": d.get("sources") or [],
        "replaces_seed": r"dive|diving|snorkel" if d["id"] in GENERAL or d["id"] == "cano" else None,
    })
# 2. other researched experiences
out += [
    {"kind": "experience", "id": "acatenango", "name": "Acatenango overnight hike (view of Fuego erupting)", "category": "hiking",
     "tags": ["volcano", "overnight"], "places": ["ANT"], "area": None, "country": "GT", "lat": 14.5, "lon": -90.88,
     "summary": "Two-day hike to a camp facing Volcán de Fuego, which erupts through the night. Optional extra climb to Fuego's ridge with a local guide.",
     "season": "Dry season Nov to Apr", "dec_jan": "Dry season, cold at camp",
     "price": "Tour US$70 to 150; all in with optional porter, Fuego guide and gear rental US$110 to 170", "price_dkk": round(110 * USD),
     "duration": "2 days, 1 night", "requirements": "Good fitness; about 1,600 m of climbing",
     "details": {"extras": "Fuego guide 250 GTQ (US$30) cash; porter 200 GTQ (US$25) each way; gear US$5 to 20 per item"},
     "researched": True, "checked_at": TODAY,
     "sources": ["https://www.bucketlistly.blog/posts/acatenango-fuego-complete-hiking-guide"], "replaces_seed": r"acatenango"},
    {"kind": "experience", "id": "corcovado", "name": "Guided hike in Corcovado National Park", "category": "wildlife",
     "tags": ["rainforest", "guided"], "places": ["DRAKE"], "area": None, "country": "CR", "lat": 8.6, "lon": -83.62,
     "summary": "Rainforest hike from the San Pedrillo entrance, within a day's walk of Drake Bay. Scarlet macaws, monkeys and rare mammals.",
     "season": "Dry season Dec to Apr", "dec_jan": "Dry season", "price": "Not checked", "price_dkk": None,
     "duration": "1 day", "requirements": "Guide required (lodges arrange it)", "details": {},
     "researched": True, "checked_at": TODAY, "sources": ["https://Roughguides.Com/costa-rica/drake-bay/"],
     "replaces_seed": r"corcovado"},
]
researched = [e for e in out]
# 3. light experiences from the places' things-to-do lists
seen = {e["id"] for e in out}
for nid, n in nodes.items():
    for t in (n.get("profile") or {}).get("things_to_do") or []:
        if re.search(r"onward|bus connection", t, re.I):   # transport notes, not experiences
            continue
        if any(nid in r["places"] and r.get("replaces_seed") and re.search(r["replaces_seed"], t, re.I) for r in researched):
            continue
        eid = f"{nid.lower()}-{slug(t)}"
        if eid in seen:
            continue
        seen.add(eid)
        out.append({"kind": "experience", "id": eid, "name": t, "category": category_of(t),
                    "tags": ["course"] if COURSE.search(t) else [], "places": [nid], "area": None,
                    "country": n["country"], "lat": n["lat"], "lon": n["lon"], "summary": None, "season": None,
                    "dec_jan": None, "price": None, "price_dkk": None, "duration": None, "requirements": None,
                    "details": {}, "researched": False, "checked_at": (n.get("profile") or {}).get("checked_at"),
                    "sources": (n.get("profile") or {}).get("sources") or [], "replaces_seed": None})

with open(os.path.join(NET, "experiences.jsonl"), "w", encoding="utf-8") as f:
    for e in out:
        e = {k: v for k, v in e.items() if k != "replaces_seed"}
        f.write(json.dumps(e, ensure_ascii=False) + "\n")
by = {}
for e in out:
    by[e["category"]] = by.get(e["category"], 0) + 1
print(f"experiences {len(out)} (researched {len(researched)}) by category {by}")
