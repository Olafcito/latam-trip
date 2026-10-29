"""Convert Momondo crawler output (window.__out) to JSONL rows in the crawl schema.

Usage (any number of legs, v4):
  python3 -I momondo_lines.py <agent> <task_id> --legs CPH-PTY@2026-12-03,PTY-SAL@2026-12-06,VVI-CPH@2027-02-03 <infile> >> data/raw/<agent>.jsonl
Legacy forms (still accepted):
  python3 -I momondo_lines.py <agent> <task_id> <date1> <date2|-> <LEG1> <LEG2|-> <infile>
  LEG = FROM-TO; 3-letter ENTRY EXIT is read as CPH-ENTRY / EXIT-CPH.
Structure: one_way (1 leg), return (A-B,B-A), open_jaw (2 legs otherwise), multi_city (3+ legs).
Rows: out = first leg, home = last leg (2+ legs), mid = legs in between (multi_city).
Near-identical rows (same carriers and via per leg, hours within 2, price within 500, same self-transfer) are dropped.
"""
import json, sys, datetime

US = {"MIA", "JFK", "EWR", "ATL", "IAH", "DFW", "ORD", "LAX", "FLL", "MCO", "IAD", "BOS", "CLT", "PHL"}
a = sys.argv[1:]
agent, task = a[0], a[1]
if a[2] == "--legs":
    spec = [x.split("@") for x in a[3].split(",")]
    legs_req = [{"from": l.split("-")[0], "to": l.split("-")[1], "date": d} for l, d in spec]
    inf = a[4]
else:
    od, hd, a1, a2, inf = a[2:7]
    if len(a1) == 3:
        a1, a2 = "CPH-" + a1, a2 + "-CPH"
    legs_req = [{"from": a1.split("-")[0], "to": a1.split("-")[1], "date": od}]
    if a2 != "-":
        legs_req.append({"from": a2.split("-")[0], "to": a2.split("-")[1], "date": hd})
n = len(legs_req)
L = legs_req
if n == 1: structure = "one_way"
elif n == 2 and L[0]["from"] == L[1]["to"] and L[0]["to"] == L[1]["from"]: structure = "return"
elif n == 2: structure = "open_jaw"
else: structure = "multi_city"
if structure == "return":
    link = f"https://www.momondo.dk/flight-search/{L[0]['from']}-{L[0]['to']}/{L[0]['date']}/{L[1]['date']}"
else:
    link = "https://www.momondo.dk/flight-search/" + "/".join(f"{l['from']}-{l['to']}/{l['date']}" for l in L)


def leg(s, date):
    p = s.split(",")
    if len(p) < 9 or not p[0]:
        return None
    via = p[4].split() if p[4] else []
    y = date[:5]
    if date[5:7] == "12" and p[0][:2] in ("01", "02"): y = str(int(date[:4]) + 1) + "-"   # flexible window crossing new year
    if date[5:7] in ("01", "02") and p[0][:2] == "12": y = str(int(date[:4]) - 1) + "-"
    return {"dep": y + p[0], "arr": y + p[1], "hours": float(p[2] or 0), "stops": int(p[3] or 0),
            "via": via, "layover_h": [float(x) for x in p[5].split()] if p[5] else [],
            "carriers": sorted({f.rsplit(" ", 1)[0] for f in p[6].split("+") if f}),
            "flights": [f for f in p[6].split("+") if f], "overnight_layover": p[7] == "1", "_apt": p[8] == "1"}


def similar(x, y):
    if abs((x["price_dkk"] or 0) - (y["price_dkk"] or 0)) > 500:
        return False
    for i in range(n):
        u, v = x["_legs"][i], y["_legs"][i]
        if not u and not v: continue
        if not u or not v: return False
        if u["carriers"] != v["carriers"] or abs(u["hours"] - v["hours"]) > 2 or u["via"] != v["via"]: return False
        if u["dep"][:10] != v["dep"][:10]: return False   # keep every date of a flexible search
    return x["self_transfer"] == y["self_transfer"]


now = datetime.datetime.now(datetime.timezone.utc).replace(tzinfo=None).isoformat(timespec="seconds") + "Z"
kept = []
for line in open(inf):
    line = line.strip()
    if not line or line.startswith("count=") or line.startswith("ERR"):
        continue
    parts = line.split("~")
    h = parts[0].split(";")
    legs = [leg(parts[i + 1], L[i]["date"]) if len(parts) > i + 1 else None for i in range(n)]
    flags = []
    st = h[3] == "1"
    if st: flags.append("self_transfer")
    for d in legs:
        if not d: flags.append("incomplete"); continue
        if d["hours"] > 30: flags.append("over_30h")
        if d.pop("_apt"): flags.append("airport_change")
    if any(set(d["via"]) & US for d in legs if d): flags.append("us_transit")
    if h[4] and "basic" in h[4].lower(): flags.append("basic_fare")
    if "mix" in (h[2] or "").lower() or "mix & match" in line.lower(): flags.append("mix_match")
    flags = sorted(set(flags))
    row = {"agent": agent, "task_id": task, "source": "momondo", "observed_at": now, "structure": structure,
           "legs_requested": legs_req, "rank": int(h[0]), "price": float(h[1] or 0), "currency": "DKK",
           "price_dkk": float(h[1] or 0) or None, "tickets": 2 if st else None, "self_transfer": st,
           "fare_brand": h[4] or None, "cabin_bag": h[5] or None, "checked_bag": h[6] or None,
           "out": legs[0], "home": legs[-1] if n > 1 else None, "mid": legs[1:-1] if n > 2 else [],
           "us_transit": "us_transit" in flags, "changeable": h[7] or "unknown", "link": link, "flags": flags,
           "notes": f"site={h[2]}; other={h[8] if len(h) > 8 else ''}; protection={h[9] if len(h) > 9 else ''}",
           "_legs": legs}
    if any(similar(row, k) for k in kept):
        continue
    kept.append(row)
    out = {k: v for k, v in row.items() if k != "_legs"}
    print(json.dumps(out, ensure_ascii=False))
