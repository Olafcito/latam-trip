"""The rules that give a quote its identity and its usable flag. One definition, used by ingest.py and by tripdb.

Every function that depends on the trip settings takes cfg, the parsed data/sources/trip.json document.
Standard library only, so it runs under python -I once the folder of this file is on sys.path.
"""
import copy, hashlib, json

SELF_FIX_BEFORE = "2026-10-28T11:35:00Z"   # Momondo crawler v4 detects self-transfer per leg from then on
DEFAULT_ORIGINS = ["CPH"]
DEFAULT_MAX_HOURS = 30


def origins(cfg):
    cfg = cfg or {}
    return set(cfg.get("home_airports", DEFAULT_ORIGINS)) | set(cfg.get("alt_origins", []))


def max_hours(cfg):
    return (cfg or {}).get("max_hours_one_way", DEFAULT_MAX_HOURS)


def legs_of(q):
    return [q.get("out")] + list(q.get("mid") or []) + ([q.get("home")] if q.get("structure") != "one_way" else [])


def via(d):
    return "-".join(d.get("via") or []) if d else ""


def pattern_of(q, cfg):
    org = origins(cfg)
    L = q.get("legs_requested") or []
    s = q.get("structure")
    if s == "return" and L:
        a, b = L[0]["from"], L[0]["to"]
        return f"{'P' if a in org else 'RR'}:{a}>{b}/{b}>{a}"
    if s == "open_jaw" and len(L) >= 2:
        return f"{'P' if L[0]['from'] in org or L[1]['to'] in org else 'RR'}:{L[0]['from']}>{L[0]['to']}/{L[1]['from']}>{L[1]['to']}"
    if s == "multi_city":
        return "M:" + "+".join(f"{l['from']}>{l['to']}" for l in L)
    if len(L) == 1:
        l = L[0]
        if l["from"] in org: return f"P:{l['from']}>{l['to']}/*"
        if l["to"] in org: return f"P:*/{l['from']}>{l['to']}"
        return f"R:{l['from']}>{l['to']}"   # regional one-way
    return "P:?"


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


def normalise(q, cfg=None):
    """Fix a common worker slip: the home leg of an open jaw/return written as ORIGIN->X instead of X->ORIGIN."""
    L = q.get("legs_requested") or []
    if len(L) == 2 and L[1]["from"] == L[0]["from"] and L[1]["to"] != L[0]["from"]:
        L[1]["from"], L[1]["to"] = L[1]["to"], L[1]["from"]
        q["flags"] = (q.get("flags") or []) + ["legs_fixed"]
        if L[1]["from"] == L[0]["to"]:
            q["structure"] = "return"
    return q


def prepared(q, cfg=None):
    """A cleaned and normalised copy of a stored row. The stored row itself stays as the agent wrote it."""
    return normalise(clean(copy.deepcopy(q)), cfg)


def variant(q, cfg):
    """(pattern id, variant) of a prepared quote."""
    o, h = q.get("out") or {}, q.get("home") or {}
    mids = q.get("mid") or []
    pid = pattern_of(q, cfg)
    return pid, f"{pid}:{via(o)}/{'|'.join(via(m) for m in mids)}/{via(h)}:{q.get('tickets') or '?'}T"


def leg_dates(q):
    """(first date, last date) as ingest.py reads them: the last is the date of the final requested leg, or the
    return date of a single leg, and None for a plain one-way."""
    L = q.get("legs_requested") or []
    first = L[0]["date"] if L else None
    last = L[-1]["date"] if len(L) > 1 else (L[0].get("return_date") if L else None)
    return first, last


def qid_of(q, cfg):
    """build_qid of an already prepared quote."""
    o, h = q.get("out") or {}, q.get("home") or {}
    L = q.get("legs_requested") or []
    key = json.dumps([q.get("source"), variant(q, cfg)[1], [l.get("date") for l in L], q.get("price_dkk"),
                      o.get("flights") or [], h.get("flights") or []], sort_keys=True)
    return "Q:" + hashlib.sha1(key.encode()).hexdigest()[:12]


def build_qid(q, cfg):
    return qid_of(prepared(q, cfg), cfg)


def usable_of(q, cfg):
    """The ok flag of an already prepared quote, as 0 or 1. A quote with no price is never usable, the routes need one."""
    if q.get("price_dkk") is None:
        return 0
    hrs = [d.get("hours") for d in legs_of(q) if d and d.get("hours")]
    flags = list(q.get("flags") or [])
    site = (q.get("notes") or "").split(";")[0].replace("site=", "").strip()
    if site in ("Sponsoreret", "Annonce"):
        flags.append("ad_offer")
    return int(not ({"over_30h", "incomplete", "ad_offer"} & set(flags)) and all(x <= max_hours(cfg) for x in hrs))


def usable(q, cfg):
    return usable_of(prepared(q, cfg), cfg)


def quote_key(q):
    """Same route, dates, departure and arrival times, carriers, price and source: the same quote."""
    legs = [q.get("out")] + list(q.get("mid") or []) + ([q["home"]] if q.get("home") else [])
    price = q.get("price_dkk")
    return json.dumps([q.get("source"),
                       [[l.get("from"), l.get("to"), l.get("date"), l.get("return_date")] for l in q.get("legs_requested") or []],
                       [[(d or {}).get("dep"), (d or {}).get("arr"), (d or {}).get("carriers") or []] for d in legs],
                       None if price is None else float(price)])


def quote_id(q):
    """Identity in storage: quote_key plus the flight lists of every leg, so two quotes that differ only in
    flight numbers stay apart."""
    legs = [q.get("out")] + list(q.get("mid") or []) + ([q["home"]] if q.get("home") else [])
    flights = [(d or {}).get("flights") or [] for d in legs]
    return "Q2:" + hashlib.sha1(json.dumps([quote_key(q), flights]).encode()).hexdigest()[:20]
