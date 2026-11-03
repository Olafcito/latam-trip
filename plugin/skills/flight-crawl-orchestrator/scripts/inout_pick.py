"""Which long haul options inout.py keeps: one per city pair, kind and day pair (day out, day home).

The best option of a city pair and kind keeps the old id ("CTG-GUA-ticket"), so trips that saved it still resolve.
Every other day pair gets the days on its id, written MMDD ("CTG-GUA-ticket-1202-0203").
"""


def _better(o):
    return (o["rating"]["total"], -o["price_dkk"])


def _days(o, ways):
    return tuple((ways[o[k]].get("depart") or "")[5:10].replace("-", "") for k in ("way_in", "way_home"))


def pick_options(opts, ways):
    """Keep the best option per old id and day pair, by rating total and then the lower price. Sorted best first."""
    best, per_day = {}, {}
    for o in opts:
        if o["id"] not in best or _better(o) > _better(best[o["id"]]):
            best[o["id"]] = o
        group = per_day.setdefault(o["id"], {})
        d = _days(o, ways)
        if d not in group or _better(o) > _better(group[d]):
            group[d] = o
    out = []
    for oid, group in per_day.items():
        for (d_out, d_home), o in group.items():
            out.append(o if o is best[oid] else {**o, "id": f"{oid}-{d_out}-{d_home}"})
    return sorted(out, key=lambda o: (-o["rating"]["total"], o["price_dkk"]))
