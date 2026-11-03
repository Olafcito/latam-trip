"""Turn the hops Claude marked booked into rows of the bookings table, once.

A booked hop is one whose flight has a quote_id starting with BOOKED:, written before the bookings table existed. Each
becomes a flight booking with the reference from the quote id and the seller from the operator text. A row with the
same reference, ends and day is there already and is left alone.

Without --apply it prints how many it would add and their ends and days. Never a reference, a price or a name: the
repo is public and so are its logs.

Usage: python -I -X utf8 plugin/scripts/booked_hops.py [--root DIR] [--apply]
"""
import os, re, sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tripdb  # noqa: E402
import tripdb_store  # noqa: E402

MARK = "BOOKED:"
COLUMNS = [k for k in tripdb.BOOKING if k not in ("id", "created_at", "updated_at", "attachments")]
TIME_RE = re.compile(r"\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$")  # the check of 0013_bookings.sql


def seller_of(operator, reference):
    """The name after booked: and before the first booking number, a run of digits or the reference. None if the text
    does not say it plainly."""
    m = re.search(r"booked:", operator or "", re.I)
    if not m:
        return None
    words = []
    for w in operator[m.end():].split():
        core = w.strip(",.;:()")
        if re.search(r"\d", core) or (reference and core == reference):
            return " ".join(words) or None
        if not core or core != w.lstrip("("):
            return None  # punctuation before any number ends the name, so the text does not name it plainly
        words.append(core)
    return None


def booking_of(hop, trip_id):
    """The bookings row of a booked hop, else None. A field the hop does not know is left out, never sent as null."""
    f = (hop or {}).get("flight") or {}
    q = f.get("quote_id")
    if not (isinstance(q, str) and q.startswith(MARK)):
        return None
    ref, op = q[len(MARK):].strip(), hop.get("operator")
    row = {"kind": "flight", "from_code": hop.get("from"), "to_code": hop.get("to"), "depart": f.get("depart"),
           "arrive": f.get("arrive"), "reference": ref, "seller": seller_of(op, ref), "price_dkk": f.get("price_dkk"),
           "source": "claude", "trip_id": trip_id, "notes": op}
    return {k: v for k, v in row.items() if v not in (None, "")}


def bad_fields(row):
    """The fields of a row the bookings table would refuse, by name only, so no value is printed."""
    errs = tripdb.check_fields({"status": "booked", **row}, tripdb.BOOKING)
    bad = [e.split()[1] if e.startswith("missing ") else e.split()[0] for e in errs]
    bad += [k for k in ("depart", "arrive") if isinstance(row.get(k), str) and not TIME_RE.match(row[k])]
    bad += [k for k in ("price_dkk",) if isinstance(row.get(k), (int, float)) and row[k] < 0]
    return sorted(set(bad))


def ends(r):
    return f"{r.get('from_code')} to {r.get('to_code')} on {(r.get('depart') or '')[:10]}"


def key_of(r):
    return (r.get("reference"), r.get("from_code"), r.get("to_code"), (r.get("depart") or "")[:10])


def to_add(store):
    """The rows of every saved trip's latest version that are not in bookings yet, each once."""
    seen = {key_of(r) for r in store.rest.get_all("bookings", {"select": "reference,from_code,to_code,depart"})}
    out = []
    for t in sorted(store.trips(), key=lambda t: t.get("id") or ""):
        for p in t.get("places") or []:
            row = booking_of(p.get("hop"), t.get("id"))
            if row and key_of(row) not in seen:
                seen.add(key_of(row))
                out.append(row)
    return out


def main(argv=None, store=None, out=None):
    a = list(sys.argv[1:] if argv is None else argv)
    out = out or sys.stdout
    root = a[a.index("--root") + 1] if "--root" in a else "."
    apply = "--apply" in a
    try:
        store = store or tripdb_store.get_store(tripdb.Paths(root), "supabase")
        rows = to_add(store)
        bad = [(r, bad_fields(r)) for r in rows]
        bad = [(r, b) for r, b in bad if b]
        if bad:
            for r, b in bad:
                print(f"refused: {ends(r)} has a bad " + ", ".join(b), file=sys.stderr)
            return 1
        if apply:
            if rows:
                try:
                    store.rest.insert("bookings", rows, columns=COLUMNS)
                except tripdb_store.RestError as e:
                    # the database may quote the failing row, so only its status goes out
                    code = re.search(r"gave (\d+)", str(e))
                    print("refused: the bookings insert failed" + (f" with {code.group(1)}" if code else ""), file=sys.stderr)
                    return 1
            print(f"added {len(rows)} booking{'' if len(rows) == 1 else 's'}", file=out)
            return 0
        print(f"{len(rows)} booking{'' if len(rows) == 1 else 's'} to add, run with --apply to add them", file=out)
        for r in rows:
            print("  " + ends(r), file=out)
        return 0
    except tripdb_store.Refused as e:
        print(f"refused: {e}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
