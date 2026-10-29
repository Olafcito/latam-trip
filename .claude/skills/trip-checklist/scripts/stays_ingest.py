"""Check stay-price-worker rows and add them to data/network/stays.jsonl (the stays database the app reads).

Usage: python3 -I plugin/skills/trip-checklist/scripts/stays_ingest.py data/raw/stays-<agent>.jsonl [--root DIR] [--usd 6.45] [--eur 7.46]
Rows without a price, dates or place are dropped and reported. Prices in USD or EUR are converted to DKK.
"""
import datetime as dt, json, os, sys

a = sys.argv[1:]
ROOT = os.path.abspath(a[a.index("--root") + 1]) if "--root" in a else os.getcwd()
RATE = {"DKK": 1.0, "USD": float(a[a.index("--usd") + 1]) if "--usd" in a else 6.45,
        "EUR": float(a[a.index("--eur") + 1]) if "--eur" in a else 7.46}
src = a[0]
dest = os.path.join(ROOT, "data", "network", "stays.jsonl")
seen = set()
if os.path.exists(dest):
    for l in open(dest, encoding="utf-8"):
        r = json.loads(l)
        seen.add((r["place"], r["site"], r["name"], r["room"], r["check_in"], r["check_out"]))
ok = bad = dup = 0
with open(dest, "a", encoding="utf-8") as out:
    for l in open(src, encoding="utf-8"):
        if not l.strip():
            continue
        r = json.loads(l)
        cur = (r.get("currency") or "DKK").upper()
        if not (r.get("place") and r.get("check_in") and r.get("check_out") and r.get("price_per_night")) or cur not in RATE:
            bad += 1
            print("drop", r.get("name"), r.get("place"), r.get("price_per_night"), cur)
            continue
        nights = (dt.date.fromisoformat(r["check_out"]) - dt.date.fromisoformat(r["check_in"])).days
        k = (r["place"], r["site"], r["name"], r["room"], r["check_in"], r["check_out"])
        if k in seen:
            dup += 1
            continue
        seen.add(k)
        out.write(json.dumps({"kind": "stay_quote", "place": r["place"], "site": r["site"], "name": r["name"],
                              "type": r.get("kind"), "room": r["room"], "dkk_per_night": round(r["price_per_night"] * RATE[cur]),
                              "nights": nights, "rating": r.get("rating"), "reviews": r.get("reviews"),
                              "check_in": r["check_in"], "check_out": r["check_out"], "url": r.get("url"),
                              "observed_at": r.get("observed_at"), "task_id": r.get("task_id"), "notes": r.get("notes")},
                             ensure_ascii=False) + "\n")
        ok += 1
print(f"added {ok}, dropped {bad}, duplicates {dup} -> {dest}")
