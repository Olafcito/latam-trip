"""Markdown tables from data/routes.json: in/home tickets, region hops, best route orders.
Usage: python3 -I report_md.py [--root DIR] > analysis.md"""
import json, os, sys
args = sys.argv[1:]
ROOT = os.path.abspath(args[args.index("--root") + 1]) if "--root" in args else os.getcwd()
D = json.load(open(os.path.join(ROOT, "data", "routes.json")))
cfg = json.load(open(os.path.join(ROOT, "trip.json")))
POS = cfg.get("route_positioning", {})
NAMES = {"CPH": "Copenhagen", "MAD": "Madrid", "ALC": "Alicante", "GUA": "Guatemala City", "SAL": "San Salvador",
         "SAP": "San Pedro Sula", "MGA": "Managua", "SJO": "San José CR", "PTY": "Panama City", "BOG": "Bogotá",
         "MDE": "Medellín", "CTG": "Cartagena", "CLO": "Cali", "VVI": "Santa Cruz", "LPB": "La Paz", "GDL": "Guadalajara",
         "CBB": "Cochabamba", "TGU": "Tegucigalpa", "RTB": "Roatán"}
RN = {"MX": "Guadalajara", "CA": "Central America", "CO": "Colombia", "BO": "Bolivia"}
n = lambda a: NAMES.get(a, a)
k = lambda x: f"{x:,.0f}"
out = ["| From | In to | Home from | Ticket (kr) | Incl. getting to Spain (kr) | Hours out / home | Airlines out / home |",
       "|---|---|---|---|---|---|---|"]
for m in sorted(D["mains"], key=lambda m: m["price"] + POS.get(m["origin"], {}).get("price", 0)):
    p = POS.get(m["origin"], {}).get("price", 0)
    out.append(f"| {n(m['origin'])} | {n(m['entry'])} | {n(m['exit'])} | {k(m['price'])} | {k(m['price'] + p) if p else ''} | "
               f"{m['out_h'] or '?'} / {m['home_h'] or '?'} | {m['out_carriers'] or '?'} / {m['home_carriers'] or '?'} |")
print("\n".join(out))
print("\n---HOPS---")
print("| From region | To region | Cheapest flight | Price (kr) | Hours | Airline |\n|---|---|---|---|---|---|")
for key, h in sorted(D["region_hops"].items()):
    A, B = key.split(">")
    if h:
        print(f"| {RN[A]} | {RN[B]} | {n(h['frm'])} → {n(h['to'])} | {k(h['price'])} | {h['hours']} | {h['carriers']} |")
    else:
        print(f"| {RN[A]} | {RN[B]} | not priced yet | | | |")
print("\n---ROUTES---")
print("| # | Long-haul ticket | Order | Flights between regions | Total flights (kr) |\n|---|---|---|---|---|")
seen = set(); i = 0
for r in D["routes"]:
    key = (r["main"], tuple(r["order"]))
    if key in seen: continue
    seen.add(key); i += 1
    if i > 25: break
    hops = "; ".join(h for h in r["hops"] if not h.startswith("positioning"))
    mt = f"{n(r['origin'])} → {n(r['entry'])} / {n(r['exit'])} → {n(r['origin'])}"
    print(f"| {i} | {mt} | {' → '.join(RN[x] for x in r['order'])} | {hops} | {k(r['total'])} |")
