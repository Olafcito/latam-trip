"""Ingest worker JSONL into SQLite, score every quote, print a ranked report.

Usage: python3 -I ingest.py [--root DIR] [--top N]
  DIR (default: current directory) holds data/sources/trip.json and data/sources/quotes/*.jsonl.
Writes DIR/data/built/trip.db (table quotes). tripdb build runs it and then loads the other tables.
Scoring (effective cost, DKK-equivalent) is read from trip.json "scoring"; see references/scoring.md.
"""
import glob, json, os, re, sqlite3, sys, hashlib

args = sys.argv[1:]
ROOT = os.path.abspath(args[args.index("--root") + 1]) if "--root" in args else os.getcwd()
TOP = int(args[args.index("--top") + 1]) if "--top" in args else 30
CFG = {}
if os.path.exists(os.path.join(ROOT, "data", "sources", "trip.json")):
    CFG = json.load(open(os.path.join(ROOT, "data", "sources", "trip.json")))
W = dict(tight_connection=700, tight_connection_h=1.0, per_hour=150, soft_hours=23, extra_per_hour=150, overnight=800, self_transfer=1500,
         us_transit=500, airport_change=1000, no_changes=300, missing_side_hours=24)
W.update(CFG.get("scoring", {}))
US = set(CFG.get("us_airports", ["MIA", "JFK", "EWR", "ATL", "IAH", "DFW", "ORD", "LAX", "FLL", "MCO", "IAD"]))
ORIGINS = set(CFG.get("home_airports", ["CPH"])) | set(CFG.get("alt_origins", []))
MAXH = CFG.get("max_hours_one_way", 30)


def legs_of(q):
    return [q.get("out")] + list(q.get("mid") or []) + ([q.get("home")] if q.get("structure") != "one_way" else [])


def pattern_of(q):
    L = q.get("legs_requested") or []
    s = q.get("structure")
    if s == "return" and L:
        a, b = L[0]["from"], L[0]["to"]
        return f"{'P' if a in ORIGINS else 'RR'}:{a}>{b}/{b}>{a}"
    if s == "open_jaw" and len(L) >= 2:
        return f"{'P' if L[0]['from'] in ORIGINS or L[1]['to'] in ORIGINS else 'RR'}:{L[0]['from']}>{L[0]['to']}/{L[1]['from']}>{L[1]['to']}"
    if s == "multi_city":
        return "M:" + "+".join(f"{l['from']}>{l['to']}" for l in L)
    if len(L) == 1:
        l = L[0]
        if l["from"] in ORIGINS: return f"P:{l['from']}>{l['to']}/*"
        if l["to"] in ORIGINS: return f"P:*/{l['from']}>{l['to']}"
        return f"R:{l['from']}>{l['to']}"   # regional one-way
    return "P:?"


def via(d):
    return "-".join(d.get("via") or []) if d else ""


SELF_FIX_BEFORE = "2026-10-28T11:35:00Z"   # Momondo crawler v4 detects self-transfer per leg from then on


def clean(q):
    """Older Momondo rows flagged self_transfer from page-wide text. Single-carrier legs on a
    non-OTA site are almost certainly one ticket: drop the flag and mark the row."""
    if q.get("source") == "momondo" and q.get("self_transfer") and (q.get("observed_at") or "") < SELF_FIX_BEFORE:
        site = (q.get("notes") or "").split(";")[0].lower()
        legs = [d for d in legs_of(q) if d]
        if legs and all(len(d.get("carriers") or []) <= 1 for d in legs) and not any(
                x in site for x in ("kiwi", "mytrip", "gotogate", "trip.com", "flightnetwork", "budgetair")):
            q["self_transfer"] = False
            q["tickets"] = None
            q["flags"] = [f for f in (q.get("flags") or []) if f != "self_transfer"] + ["self_transfer_unverified"]
    return q


def normalise(q):
    """Fix a common worker slip: the home leg of an open jaw/return written as ORIGIN->X instead of X->ORIGIN."""
    L = q.get("legs_requested") or []
    if len(L) == 2 and L[1]["from"] == L[0]["from"] and L[1]["to"] != L[0]["from"]:
        L[1]["from"], L[1]["to"] = L[1]["to"], L[1]["from"]
        q["flags"] = (q.get("flags") or []) + ["legs_fixed"]
        if L[1]["from"] == L[0]["to"]:
            q["structure"] = "return"
    return q


def eff_cost(q):
    p = q.get("price_dkk")
    if p is None:
        return None
    e = p
    legs = legs_of(q)
    for i, d in enumerate(legs):
        long_haul = i in (0, len(legs) - 1)
        if not d or not d.get("hours"):
            e += W["per_hour"] * W["missing_side_hours"] + W["extra_per_hour"]
            continue
        h = d["hours"]
        e += W["per_hour"] * h + (W["extra_per_hour"] * max(0, h - W["soft_hours"]) if long_haul else 0)
        if d.get("overnight_layover"): e += W["overnight"]
        if set(d.get("via") or []) & US: e += W["us_transit"]
    if "tight_connection" in (q.get("flags") or []): e += W["tight_connection"]
    if q.get("self_transfer"): e += W["self_transfer"]
    if "airport_change" in (q.get("flags") or []): e += W["airport_change"]
    if q.get("changeable") == "no": e += W["no_changes"]
    return round(e)


def obs_key(t):
    """observed_at in a form that sorts by time ("...T10:05Z" and "...T10:05:30Z" both occur)."""
    return re.sub(r"T(\d\d:\d\d)Z$", r"T\1:00Z", t or "")


def main():
    os.makedirs(os.path.join(ROOT, "data", "built"), exist_ok=True)
    con = sqlite3.connect(os.path.join(ROOT, "data", "built", "trip.db"))
    con.execute("DROP TABLE IF EXISTS quotes")
    con.execute("""CREATE TABLE quotes (quote_id TEXT PRIMARY KEY, agent TEXT, task_id TEXT, source TEXT,
        observed_at TEXT, structure TEXT, pattern_id TEXT, variant TEXT, out_date TEXT, home_date TEXT, n_legs INT,
        rank INT, price_dkk REAL, currency TEXT, tickets INT, self_transfer INT, fare_brand TEXT,
        checked_bag TEXT, out_hours REAL, home_hours REAL, mid_hours REAL, max_leg_hours REAL, out_via TEXT, home_via TEXT,
        out_carriers TEXT, home_carriers TEXT, flags TEXT, ok INT, eff_cost REAL, link TEXT, raw TEXT)""")
    n, newest = 0, {}
    for f in sorted(glob.glob(os.path.join(ROOT, "data", "sources", "quotes", "*.jsonl"))):
        for line in open(f):
            line = line.strip()
            if not line:
                continue
            try:
                q = normalise(clean(json.loads(line)))
                if any(x < W["tight_connection_h"] for d in legs_of(q) if d for x in (d.get("layover_h") or []) if isinstance(x, (int, float))):
                    q["flags"] = sorted(set((q.get("flags") or []) + ["tight_connection"]))
            except json.JSONDecodeError:
                continue
            L = q.get("legs_requested") or []
            o, h = q.get("out") or {}, q.get("home") or {}
            mids = q.get("mid") or []
            pid = pattern_of(q)
            var = f"{pid}:{via(o)}/{'|'.join(via(m) for m in mids)}/{via(h)}:{q.get('tickets') or '?'}T"
            out_date = L[0]["date"] if L else None
            home_date = L[-1]["date"] if len(L) > 1 else (L[0].get("return_date") if L else None)
            key = json.dumps([q.get("source"), var, [l.get("date") for l in L], q.get("price_dkk"),
                              o.get("flights") or [], h.get("flights") or []], sort_keys=True)
            qid = "Q:" + hashlib.sha1(key.encode()).hexdigest()[:12]
            hrs = [d.get("hours") for d in legs_of(q) if d and d.get("hours")]
            flags = q.get("flags") or []
            site = (q.get("notes") or "").split(";")[0].replace("site=", "").strip()
            if site in ("Sponsoreret", "Annonce"):
                flags = list(flags) + ["ad_offer"]
            ok = int(not ({"over_30h", "incomplete", "ad_offer"} & set(flags)) and all(x <= MAXH for x in hrs))
            mid_h = sum((m or {}).get("hours") or 0 for m in mids) or None
            seen_at = obs_key(q.get("observed_at"))
            if qid in newest:
                # the same quote seen again: keep the first row, but with the newest time it was seen
                if seen_at > newest[qid]:
                    newest[qid] = seen_at
                    con.execute("UPDATE quotes SET observed_at=? WHERE quote_id=?", (q.get("observed_at"), qid))
                n += 1
                continue
            newest[qid] = seen_at
            con.execute("INSERT INTO quotes VALUES (" + ",".join("?" * 31) + ")", (
                qid, q.get("agent"), q.get("task_id"), q.get("source"), q.get("observed_at"), q.get("structure"),
                pid, var, out_date, home_date, len(L), q.get("rank"), q.get("price_dkk"), q.get("currency"),
                q.get("tickets"), int(bool(q.get("self_transfer"))) if q.get("self_transfer") is not None else None,
                q.get("fare_brand"), q.get("checked_bag"), o.get("hours"), h.get("hours"), mid_h,
                max(hrs) if hrs else None, via(o), via(h),
                ",".join(o.get("carriers") or []), ",".join(h.get("carriers") or []),
                ",".join(flags), ok, eff_cost(q), q.get("link"), line))
            n += 1
    con.commit()
    rows = con.execute("SELECT quote_id FROM quotes").fetchall()
    print(f"ingested lines: {n}, unique quotes: {len(rows)}, acceptable (ok=1): "
          f"{con.execute('SELECT COUNT(*) FROM quotes WHERE ok=1').fetchone()[0]}")
    print("\nBest acceptable per pattern (main tickets):")
    for r in con.execute("""SELECT pattern_id, MIN(eff_cost), MIN(price_dkk), COUNT(*), GROUP_CONCAT(DISTINCT source)
                            FROM quotes WHERE (pattern_id LIKE 'P:%' OR pattern_id LIKE 'M:%') AND structure!='one_way' AND ok=1
                            GROUP BY pattern_id ORDER BY MIN(eff_cost) LIMIT ?""", (TOP,)):
        print(" ", r)
    print("\nBest acceptable regional one-ways:")
    for r in con.execute("""SELECT pattern_id, MIN(price_dkk), MIN(out_hours), COUNT(*) FROM quotes
                            WHERE (pattern_id LIKE 'R:%' OR pattern_id LIKE 'RR:%') AND ok=1 GROUP BY pattern_id ORDER BY MIN(price_dkk)"""):
        print(" ", r)
    print("\nTop main tickets by effective cost:")
    for r in con.execute("""SELECT eff_cost, price_dkk, source, pattern_id, out_date, home_date, out_via, home_via,
                            out_hours, home_hours, out_carriers, home_carriers, tickets FROM quotes
                            WHERE (pattern_id LIKE 'P:%' OR pattern_id LIKE 'M:%') AND structure!='one_way' AND ok=1
                            ORDER BY eff_cost LIMIT ?""", (TOP,)):
        print(" ", r)
    hubs = {}
    for (ov, hv) in con.execute("SELECT out_via, home_via FROM quotes WHERE ok=1"):
        for x in (ov or "").split("-") + (hv or "").split("-"):
            if x: hubs[x] = hubs.get(x, 0) + 1
    print("\nHub counts (acceptable quotes):", sorted(hubs.items(), key=lambda kv: -kv[1])[:20])


if __name__ == "__main__":
    main()
