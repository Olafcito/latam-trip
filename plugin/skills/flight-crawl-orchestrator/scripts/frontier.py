"""Frontier: list the searches not yet in the table, highest priority first, ready to hand to workers in batches of 8.

Usage: python3 -I frontier.py [--root DIR] [--kind main|regional|all] [--limit N] [--json]
main     = origin x entry x exit main tickets from trip.json "gateways" (open jaw, or return when entry == exit)
regional = one-ways between airport groups and within groups from trip.json "regional"
A search counts as covered when the table holds any quote for that pattern from that origin (any date).
"""
import itertools, json, os, sqlite3, sys
args = sys.argv[1:]
ROOT = os.path.abspath(args[args.index("--root") + 1]) if "--root" in args else os.getcwd()
KIND = args[args.index("--kind") + 1] if "--kind" in args else "all"
LIMIT = int(args[args.index("--limit") + 1]) if "--limit" in args else 40
cfg = json.load(open(os.path.join(ROOT, "trip.json")))
con = sqlite3.connect(os.path.join(ROOT, "data", "crawl.db"))
have = {r[0] for r in con.execute("SELECT DISTINCT pattern_id FROM quotes")}
tasks = []
if KIND in ("main", "all"):
    g = cfg["gateways"]
    for o, od in g["origins"].items():
        for e, we in g["entries"].items():
            for x, wx in g["exits"].items():
                pid = f"P:{o}>{e}/{x}>{o}"
                if pid in have:
                    continue
                if e == x:
                    legs = f"{o}-{e}@{od['out']},{e}-{o}@{od['home']}"
                else:
                    legs = f"{o}-{e}@{od['out']},{x}-{o}@{od['home']}"
                tasks.append((we * wx * od.get("weight", 1), "main", pid, legs))
if KIND in ("regional", "all"):
    r = cfg["regional"]
    G, skip = r["groups"], set(r.get("skip_from", []))
    def add(a, b, d, w):
        pid = f"R:{a}>{b}"
        if a == b or pid in have:
            return
        tasks.append((w, "regional", pid, f"{a}-{b}@{d}"))
    for ga, gb, d, *wt in r["pairs_between"]:
        for a in G[ga]:
            for b in G[gb]:
                if a in skip or b in skip:
                    continue
                add(a, b, d, wt[0] if wt else 2.0)
    for gname, d in r["within"]:
        for a, b in itertools.permutations(G[gname], 2):
            add(a, b, d, 1.0)
tasks.sort(key=lambda t: -t[0])
if "--json" in args:
    print(json.dumps([{"priority": t[0], "kind": t[1], "pattern": t[2], "legs": t[3]} for t in tasks[:LIMIT]], indent=1))
else:
    print(f"open searches: {len(tasks)} (main {sum(1 for t in tasks if t[1]=='main')}, regional {sum(1 for t in tasks if t[1]=='regional')})")
    for t in tasks[:LIMIT]:
        print(f"  {t[0]:>4} {t[1]:<8} {t[2]:<24} {t[3]}")
