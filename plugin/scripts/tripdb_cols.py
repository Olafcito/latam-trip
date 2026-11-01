"""Column maps between the fields of data/sources and the columns of the database (spec 4.1 and 4.2).

to_row(table, rec) turns a record of a source file into a row. A field with no column goes to extra.
from_row(table, row) turns a row back into the record the pipeline reads, following a null rule per table.
fold_places, fold_profiles and fold_quotes merge the repeats that import finds in the files.
Standard library only, so it runs under python -I once the folder of this file and the pipeline folder are on sys.path.
"""
import datetime as dt, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
PIPELINE = os.path.join(HERE, "..", "skills", "flight-crawl-orchestrator", "scripts")
if PIPELINE not in sys.path:
    sys.path.insert(0, PIPELINE)
import quote_rules as qr  # noqa: E402


def parse_ts(s):
    """An aware UTC datetime from the stamps in the files: 2026-10-31T15:55Z, ...T12:40:22Z, ...+00:00, with fractions."""
    if isinstance(s, dt.datetime):
        return s if s.tzinfo else s.replace(tzinfo=dt.timezone.utc)
    m = re.fullmatch(r"(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?\s*(Z|[+-]\d{2}(?::?\d{2})?)?", str(s).strip())
    if not m:
        raise ValueError(f"not a timestamp: {s!r}")
    d, hh, mm, ss, frac, tz = m.groups()
    t = dt.datetime.fromisoformat(d).replace(hour=int(hh), minute=int(mm), second=int(ss or 0),
                                              microsecond=int((frac or "0")[:6].ljust(6, "0")), tzinfo=dt.timezone.utc)
    if tz and tz != "Z":
        sign = 1 if tz[0] == "+" else -1
        digits = tz[1:].replace(":", "")
        t -= sign * dt.timedelta(hours=int(digits[:2]), minutes=int(digits[2:] or 0))
    return t


def z(s):
    """The Z format the files use: 2026-10-31T15:55:00Z."""
    return parse_ts(s).strftime("%Y-%m-%dT%H:%M:%SZ")


class TableMap:
    """field_to_col maps a file field to its column. key names the file fields that identify a record.
    drop_nulls says which null fields are left out when a record is read back: a set of file fields, or a function
    (field, row) that answers for each. kind is the value of the record's kind field, or None where kind is a column."""

    def __init__(self, table, field_to_col, key, kind=None, drop_nulls=(), stamps=(), computed=()):
        self.table, self.field_to_col, self.key, self.kind = table, field_to_col, key, kind
        self.drop_nulls = drop_nulls if callable(drop_nulls) else (lambda f, row, s=frozenset(drop_nulls): f in s)
        self.stamps, self.computed = set(stamps), tuple(computed)
        self.col_to_field = {c: f for f, c in field_to_col.items()}


def _same(*names):
    return {n: n for n in names}


def _hostels_only(field, row):
    """profile_hostels rows hold only the fields the file wrote, so a null column is an absent field."""
    return row.get("kind") == "profile_hostels"


COLS = {
    "airports": TableMap("airports", _same("code", "name", "city", "country", "lat", "lon"), ("code",)),
    "places": TableMap("places", {**_same("id", "name", "country", "lat", "lon", "type", "popularity", "why", "source", "origin"),
                                  "iata": "airport_code"}, ("id",), kind="node"),
    "connections": TableMap("connections", {**_same("mode", "operator", "duration_h", "price_dkk", "frequency", "overnight", "border",
                                                    "source", "source_year", "notes", "origin", "duration_range", "price_range_local"),
                                            "from": "from_id", "to": "to_id", "both": "both_ways"},
                            ("from", "to", "mode", "operator"), kind="edge"),
    "profiles": TableMap("profiles", {**_same("kind", "checked_at", "tagline", "summary", "touristy", "origin", "image",
                                              "things_to_do", "hostels", "sources"), "id": "place_id"},
                         ("id", "kind"), drop_nulls=_hostels_only),
    "place_images": TableMap("place_images", {**_same("origin", "image"), "id": "place_id"}, ("id",), kind="profile_image"),
    "experiences": TableMap("experiences", _same("id", "name", "category", "country", "lat", "lon", "area", "summary", "season",
                                                 "dec_jan", "price", "price_dkk", "duration", "requirements", "researched",
                                                 "checked_at", "tags", "places", "details", "sources"), ("id",), kind="experience"),
    "experience_images": TableMap("experience_images", _same("id", "image"), ("id",), kind="experience_image"),
    "stays": TableMap("stays", {**_same("site", "name", "room", "check_in", "check_out", "type", "dkk_per_night", "nights", "rating",
                                        "reviews", "url", "property_id", "observed_at", "task_id", "notes"), "place": "place_id"},
                      ("place", "site", "name", "room", "check_in", "check_out"), kind="stay_quote", stamps=("observed_at",)),
    "quotes": TableMap("quotes", {**_same("agent", "task_id", "source", "structure", "price", "currency", "price_dkk", "tickets",
                                          "self_transfer", "us_transit", "flags", "fare_brand", "cabin_bag", "checked_bag",
                                          "changeable", "link", "notes", "trip_name", "legs_requested"),
                                  "observed_at": "last_seen", "out": "out_leg", "mid": "mid_legs", "home": "home_leg"},
                       ("source", "legs_requested"), drop_nulls=("mid", "trip_name"), stamps=("observed_at",),
                       computed=("quote_id", "build_qid", "first_seen", "seen_count", "first_from", "first_to", "last_from",
                                 "last_to", "first_date", "last_date", "out_hours", "home_hours", "usable")),
    "task_log": TableMap("task_log", _same("issue", "type", "done_at", "summary", "task", "outputs"), ("issue", "done_at"),
                         stamps=("done_at",)),
    "agent_usage": TableMap("agent_usage", _same("round", "agent", "model", "tool", "searches", "tokens", "tool_uses", "seconds", "rows"),
                            ("round", "agent", "model", "tool")),
}


def to_row(table, rec):
    """A database row for a source record. Every mapped column is present, as None when the record lacks the field."""
    m = COLS[table]
    row, extra = {c: None for c in m.field_to_col.values()}, {}
    for f, v in rec.items():
        if f in m.field_to_col:
            row[m.field_to_col[f]] = z(v) if f in m.stamps and v is not None else v
        elif f == "kind":
            if v != m.kind:
                extra["kind"] = v
        else:
            extra[f] = v
    row["extra"] = extra
    return row


def from_row(table, row):
    """The record the pipeline reads for a database row. Columns that no file field maps to are not part of it."""
    m = COLS[table]
    rec = {}
    if m.kind:
        rec["kind"] = m.kind
    for f, c in m.field_to_col.items():
        if c not in row:
            continue
        v = row[c]
        if v is None and m.drop_nulls(f, row):
            continue
        rec[f] = z(v) if f in m.stamps and v is not None else v
    extra = dict(row.get("extra") or {})
    if extra.pop("obs_fmt", None) == "min" and rec.get("observed_at"):
        rec["observed_at"] = rec["observed_at"][:16] + "Z"
    rec.update(extra)
    return rec


def fold_places(rows):
    """One record per place id, in the order of first appearance. A later value that is not null wins, as in build_map.py.
    A field that is null in every copy stays null."""
    out = {}
    for r in rows:
        rec = out.setdefault(r["id"], {})
        for f, v in r.items():
            if v is not None or f not in rec:
                rec[f] = v
    return list(out.values())


def fold_profiles(rows):
    """One record per (id, kind). A later copy updates every field, but a null image never replaces a stored image
    (build_map.py line 40). Hostel lists of profile_hostels rows keep the earlier hostels that the later list lacks,
    as build_map.py does when it applies the rows one after the other."""
    out = {}
    for r in rows:
        k = (r["id"], r["kind"])
        old = out.get(k)
        if old is None:
            out[k] = dict(r)
            continue
        new = {f: v for f, v in r.items() if not (f == "image" and v is None and old.get("image"))}
        if r["kind"] == "profile_hostels" and r.get("hostels") is not None:
            names = {h.get("name") for h in r["hostels"]}
            new["hostels"] = list(r["hostels"]) + [h for h in old.get("hostels") or [] if h.get("name") not in names]
        old.update(new)
    return list(out.values())


def _end_of(q):
    """(from, to) of the last requested leg, as the last_* columns read it."""
    L = q.get("legs_requested") or []
    if not L:
        return None, None
    if len(L) > 1:
        return L[-1].get("from"), L[-1].get("to")
    if L[0].get("return_date"):
        return L[0].get("to"), L[0].get("from")
    return L[0].get("from"), L[0].get("to")


def quote_row(rec, cfg):
    """The database row of one record, with the computed columns: identity, airports, dates, hours and the usable flag."""
    p = qr.prepared(rec, cfg)
    L = p.get("legs_requested") or []
    row = to_row("quotes", rec)
    if not re.fullmatch(r".*T\d\d:\d\d:\d\d.*", str(rec.get("observed_at") or "")):
        row["extra"]["obs_fmt"] = "min"
    first_date, last_date = qr.leg_dates(p)
    last_from, last_to = _end_of(p)
    stamp = row["last_seen"]
    row.update(quote_id=qr.quote_id(rec), build_qid=qr.qid_of(p, cfg), first_seen=stamp, seen_count=1,
               first_from=L[0].get("from") if L else None, first_to=L[0].get("to") if L else None,
               last_from=last_from, last_to=last_to, first_date=first_date, last_date=last_date,
               out_hours=(p.get("out") or {}).get("hours"), home_hours=(p.get("home") or {}).get("hours"),
               usable=qr.usable_of(p, cfg))
    return row


class QuoteIdConflict(Exception):
    pass


def fold_quotes(rows, cfg):
    """Database rows of quote records, one per quote_id, in the order of first appearance. A row takes the content of the
    first copy, as ingest.py keeps the first row of a qid (spec 4.2), first_seen and last_seen are the oldest and newest, and
    seen_count is the size of the group. One quote_id with two build_qid values is an error, unless the only difference
    is a price of 9337 against 9337.0, which float() makes equal."""
    groups = {}
    for rec in rows:
        r = quote_row(rec, cfg)
        groups.setdefault(r["quote_id"], []).append(r)
    out = []
    for qid, g in groups.items():
        qids = {r["build_qid"] for r in g}
        if len(qids) > 1 and len({None if r["price_dkk"] is None else float(r["price_dkk"]) for r in g}) > 1:
            raise QuoteIdConflict(f"{qid} has build_qid values {sorted(qids)}")
        newest = g[0]
        for r in g[1:]:
            if parse_ts(r["last_seen"]) > parse_ts(newest["last_seen"]):
                newest = r
        row = dict(g[0])
        row["extra"] = dict(row["extra"])
        row["extra"].pop("obs_fmt", None)
        if newest["extra"].get("obs_fmt"):
            row["extra"]["obs_fmt"] = newest["extra"]["obs_fmt"]
        row["first_seen"] = min((r["last_seen"] for r in g), key=parse_ts)
        row["last_seen"] = newest["last_seen"]
        row["seen_count"] = len(g)
        out.append(row)
    return out


def trip_row(rec):
    """A trips row: the whole record stays in data, as the version, the time and the writer are columns too."""
    return {"id": rec["id"], "version": rec["version"], "saved_at": z(rec["saved_at"]) if rec.get("saved_at") else None,
            "saved_by": rec.get("by"), "deleted_at": None, "data": rec}


def trip_rec(row):
    return row["data"]


def usage_row(rec):
    """A row of agent_usage.csv: the four names stay text, the five measures become numbers."""
    out = {}
    for c in ("round", "agent", "model", "tool"):
        out[c] = rec.get(c)
    for c in ("searches", "tokens", "tool_uses", "seconds", "rows"):
        v = rec.get(c)
        out[c] = None if v in (None, "") else (int(v) if re.fullmatch(r"-?\d+", str(v)) else float(v))
    return out
