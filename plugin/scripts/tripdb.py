"""tripdb: the supported interface to shared Supabase trip data.

Supabase is the source of truth. The FileStore exists for isolated unit tests and local
pipeline fixtures. The scheduled worker publishes built files to the app's storage bucket.

Usage: python -I -X utf8 plugin/scripts/tripdb.py [--root DIR] COMMAND [ARGS]
  add-quotes FILE [--name NAME]        validated quote rows into Supabase
  add-place FILE [--origin NAME]       place rows (kind node) into places.jsonl
  add-connection FILE [--origin NAME]  connection rows (kind edge) into connections.jsonl
  add-profile FILE [--origin NAME] [--replace]  place profiles (kind profile or profile_hostels) into profiles.jsonl
  add-image FILE [--origin NAME] [--replace]    place images (kind profile_image) into place_images.jsonl
  add-experience FILE                  experiences into experiences.jsonl
  update-experience ID [--set FIELD=VALUE ...] [--json FILE]  change fields of one experience
  add-experience-image FILE [--replace]         experience images into experience_images.jsonl
  add-stays FILE [--usd RATE] [--eur RATE]      stay-price-worker rows into stays.jsonl, prices in DKK
  list-add LIST TYPE ID [--note TEXT] [--name NAME]  save a place or experience in a list (lists.json)
  list-remove LIST TYPE ID             take it out again
  save-trip FILE [--by plan-trip|migration|planner]  save a trip's next version (prints id and version)
  delete-trip ID [ID ...]              soft-delete trips without removing their versions
  query TABLE [--eq COL=VAL] [--in COL=A,B] [--gte COL=VAL] [--select COLS] [--limit N]  rows as JSON lines
  doc-get NAME [FILE]   doc-put NAME FILE   read or replace a document (trip.json, lists.json, ...)
  log-task --issue N --type TYPE --summary TEXT [--outputs a,b] [--task FILE] [--done-at TIME]
  log-usage --round R --agent A --model M --tool T --searches N --tokens N --tool-uses N --seconds N --rows N
  ingest-inbox                         validate and ingest new rows in the Supabase Momondo inbox
  check                                validate the shared tables and documents against their schemas
  import --from DIR [--wipe]           load a data/sources folder into an empty Supabase project (SUPABASE_URL and SUPABASE_SECRET_KEY)
  pull --to DIR                        write the project out as the files of data/sources, quotes in quotes/all.jsonl
  cutover-done                         write the cutover_done document, spec 9.3 step 7, after which every --wipe refuses
  dump --to DIR                        write every table as it stands, one JSON lines file per table
  restore --from DIR [--wipe]          load a dump into an empty project and reset the identity sequences
  way-map --old OLD_INOUT --new NEW_INOUT  document way_id_map: old way id to new way id, matched on direction, type, tickets and depart
  file NAME                            print one built file from the bucket, for example places.json or built/routes.json
  run SCRIPT [ARGS]                    run evaluate, frontier, scenarios, usage_report or report_md on the project's derived data
  inbox-token --name NAME              make a token for the Momondo userscript, print it once and store only its hash
  status                               print derive_state, the worker version and the local git sha
  build [--fetch-elevation] [--no-sync]  local FileStore pipeline command for tests and fixtures
                                       production builds run in the scheduled worker
FILE may be - for stdin. Every row is checked against its schema and a bad row is refused with the reason.
Nothing is overwritten without --replace. Writes hold data/sources/.tripdb.lock and append in one write.
"""
import csv, datetime as dt, hashlib, io, json, math, os, re, secrets, shutil, sqlite3, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
PIPELINE = os.path.join(HERE, "..", "skills", "flight-crawl-orchestrator", "scripts")
sys.path.insert(0, PIPELINE)
sys.path.insert(0, HERE)
from quote_rules import quote_key  # noqa: E402
import tripdb_cols as cols  # noqa: E402
import tripdb_store as store  # noqa: E402
from tripdb_store import (Refused, RestError, Lock, TIME_RE, TRIP_META, USAGE_COLS, parse_time, now_utc, read_jsonl, rows_of,  # noqa: E402,F401
                          read_input, read_input_text, append_rows, write_atomic, known_quotes, sort_quotes, latest_trips,
                          get_store, trip_content as _trip_content)
DEFAULT_ROOT = os.path.abspath(os.path.join(HERE, "..", ".."))


# ---- paths --------------------------------------------------------------------------------------

class Paths:
    def __init__(self, root):
        self.root = os.path.abspath(root)
        self.sources = os.path.join(self.root, "data", "sources")
        self.quotes = os.path.join(self.sources, "quotes")
        self.inbox = os.path.join(self.sources, "inbox")
        self.processed = os.path.join(self.inbox, "processed")
        self.rejected = os.path.join(self.inbox, "rejected")
        self.built = os.path.join(self.root, "data", "built")
        self.web = os.path.join(self.root, "data", "web")
        self.lock = os.path.join(self.sources, ".tripdb.lock")

    def src(self, name):
        return os.path.join(self.sources, name)


# ---- schemas ------------------------------------------------------------------------------------
# A field spec is "type|type" with a leading "!" when the field is required. Types: str int num bool list
# dict null date (YYYY-MM-DD) time (ISO 8601 date and time) iata (3 capitals) pid (place id) slug cc
# (2 capitals) tid (trip id) enum:a,b,c and const:x. Fields not listed are allowed.

DATE_RE = re.compile(r"\d{4}-\d{2}-\d{2}$")
PATTERNS = {"iata": re.compile(r"[A-Z]{3}$"), "pid": re.compile(r"[A-Z][A-Z0-9_]{1,9}$"),
            "slug": re.compile(r"[a-z0-9][a-z0-9_-]*$"), "cc": re.compile(r"[A-Z]{2}$"),
            "tid": re.compile(r"[A-Za-z0-9][A-Za-z0-9_-]{0,63}$")}


def _is(v, t):
    if t == "str": return isinstance(v, str)
    if t == "int": return isinstance(v, int) and not isinstance(v, bool)
    if t == "num": return isinstance(v, (int, float)) and not isinstance(v, bool) and math.isfinite(v)
    if t == "bool": return isinstance(v, bool)
    if t == "list": return isinstance(v, list)
    if t == "dict": return isinstance(v, dict)
    if t == "null": return v is None
    if t == "date": return isinstance(v, str) and bool(DATE_RE.match(v)) and _valid_date(v)
    if t == "time": return isinstance(v, str) and parse_time(v) is not None
    if t in PATTERNS: return isinstance(v, str) and bool(PATTERNS[t].match(v))
    if t.startswith("enum:"): return v in t[5:].split(",")
    if t.startswith("const:"): return v == t[6:]
    raise ValueError(t)


def _valid_date(s):
    try:
        dt.date.fromisoformat(s)
        return True
    except ValueError:
        return False


def check_fields(row, schema):
    if not isinstance(row, dict):
        return ["row is not a JSON object"]
    errs = []
    for field, spec in schema.items():
        req = spec.startswith("!")
        types = spec.lstrip("!").split("|")
        if field not in row:
            if req:
                errs.append(f"missing {field}")
            continue
        if not any(_is(row[field], t) for t in types):
            errs.append(f"{field} is {json.dumps(row[field], ensure_ascii=False)[:60]}, expected {' or '.join(types)}")
    return errs


LEG_REQ = {"from": "!iata", "to": "!iata", "date": "!date", "return_date": "date"}
LEG = {"dep": "time|null", "arr": "time|null", "hours": "num|null", "stops": "int|null", "via": "list|null",
       "layover_h": "list|null", "carriers": "list|null", "flights": "list|null", "overnight_layover": "bool|null"}
QUOTE = {"agent": "!str", "task_id": "str|null", "source": "!str", "observed_at": "!time",
         "structure": "!enum:one_way,return,open_jaw,multi_city", "legs_requested": "!list", "rank": "int|null",
         "price": "num|null", "currency": "str|null", "price_dkk": "!num|null", "tickets": "int|null",
         "self_transfer": "bool|null", "fare_brand": "str|null", "cabin_bag": "str|null", "checked_bag": "str|null",
         "out": "!dict", "home": "dict|null", "mid": "list|null", "us_transit": "bool|null", "changeable": "str|null",
         "link": "str|null", "flags": "list|null", "notes": "str|null", "trip_name": "str"}
NODE = {"kind": "!const:node", "id": "!pid", "name": "!str", "country": "!cc", "lat": "!num", "lon": "!num", "type": "!str",
        "iata": "iata|null", "popularity": "!int", "why": "str|null", "source": "str|null", "origin": "str"}
EDGE = {"kind": "!const:edge", "from": "!pid", "to": "!pid",
        "mode": "!enum:flight,bus,boat,train,colectivo,shuttle,chicken_bus", "operator": "str|null",
        "duration_h": "num|null", "duration_range": "str|null", "price_dkk": "num|null", "price_range_local": "str|null",
        "frequency": "str|null", "overnight": "bool|null", "border": "bool|null", "both": "bool|null",
        "source": "str|null", "source_year": "int|null", "notes": "str|null", "origin": "str"}
PROFILE = {"kind": "!const:profile", "id": "!pid", "checked_at": "date|time|null", "image": "dict|null",
           "tagline": "str|null", "summary": "str|null", "things_to_do": "list|null", "touristy": "int|null",
           "hostels": "list|null", "sources": "list|null", "origin": "str"}
PROFILE_HOSTELS = {"kind": "!const:profile_hostels", "id": "!pid", "hostels": "!list", "currency_shown": "str|null",
                   "eur_dkk": "num|null", "origin": "str"}
IMAGE = {"url": "!str", "page": "str|null", "credit": "str|null", "license": "str|null", "w": "int|null", "h": "int|null"}
PLACE_IMAGE = {"kind": "!const:profile_image", "id": "!pid", "image": "!dict", "origin": "str"}
EXPERIENCE = {"kind": "!const:experience", "id": "!slug", "name": "!str", "category": "!str", "tags": "list",
              "places": "!list", "area": "str|null", "country": "!cc", "lat": "!num", "lon": "!num",
              "summary": "str|null", "season": "str|null", "dec_jan": "str|null", "price": "str|null",
              "price_dkk": "num|null", "duration": "str|null", "requirements": "str|null", "details": "dict|null",
              "researched": "!bool", "checked_at": "date|time|null", "sources": "list|null"}
EXPERIENCE_IMAGE = {"kind": "!const:experience_image", "id": "!slug", "image": "!dict"}
STAY = {"kind": "!const:stay_quote", "place": "!pid", "site": "!str", "name": "!str", "type": "str|null", "room": "!str",
        "dkk_per_night": "!int", "nights": "!int", "rating": "num|null", "reviews": "int|null", "check_in": "!date",
        "check_out": "!date", "url": "str|null", "property_id": "str|null", "observed_at": "time|null", "task_id": "str|null",
        "notes": "str|null"}
TASK = {"issue": "!int", "type": "str|null", "task": "dict|null", "done_at": "!time", "summary": "str", "outputs": "list"}
# a saved trip, one row per version: the planner's journey (way in, way home, places with the hop that reached them)
TRIP = {"id": "!tid", "version": "!int", "name": "!str", "saved_at": "!time", "by": "!enum:plan-trip,migration,planner",
        "why": "!str", "rank": "int|null", "option_id": "str|null", "way_in": "!dict", "way_home": "!dict",
        "tickets": "dict|null", "places": "!list", "totals": "dict|null"}
TRIP_WAY = {"direction": "enum:in,home", "from": "!iata", "to": "!iata", "depart": "!time", "arrive": "!time",
            "price_dkk": "!num", "tickets": "!list", "timeline": "!list", "airports": "list", "observed_at": "time|null"}
TRIP_TICKET = {"id": "!str", "price_dkk": "!num", "observed_at": "str|null"}
TRIP_PLACE = {"node": "!pid", "hop": "!dict|null", "why": "str|null", "nights": "int|null", "arrive": "date|time|null",
              "depart": "date|time|null", "stay": "dict|null"}
TRIP_HOP = {"from": "!pid", "to": "!pid", "mode": "!enum:flight,bus,boat,train,colectivo,shuttle,chicken_bus",
            "operator": "str|null", "hours": "num|null", "price_dkk": "num|null", "observed_at": "time|null",
            "overnight": "bool|null", "border": "bool|null", "flight": "dict|null", "overland": "str|null",
            "countries": "list|null"}
TRIP_FLIGHT = {"quote_id": "!str", "depart": "!time", "arrive": "!time", "hours": "!num", "price_dkk": "!num",
               "carriers": "!list", "via": "list", "layover_h": "list", "observed_at": "time|null"}
# a booking, the bookings table of spec 4.1: one row per leg or stay, owner only, never in a built file.
# depart and arrive are local clock times or a day alone. A ticket that covers several legs shares its ticket value.
BOOKING = {"id": "str", "kind": "!enum:flight,bus,boat,stay,other", "status": "!enum:booked,cancelled",
           "from_code": "str|null", "to_code": "str|null", "depart": "date|time|null", "arrive": "date|time|null",
           "place_id": "str|null", "check_in": "date|null", "check_out": "date|null", "lodging_id": "str|null",
           "room_id": "str|null", "reference": "str|null", "seller": "str|null", "url": "str|null",
           "price_dkk": "num|null", "price": "num|null", "currency": "str|null",
           "refundable": "enum:yes,no,partly|null", "changeable": "enum:yes,no,fee|null",
           "change_until": "date|null", "cancel_until": "date|null", "cabin_bag": "str|null",
           "checked_bag": "str|null", "segments": "list|null", "travellers": "int", "trip_id": "str|null",
           "source": "enum:picked,manual,claude|null", "notes": "str|null", "attachments": "list",
           "ticket": "str|null", "created_at": "time", "updated_at": "time"}

# table: file, schema per kind, what makes a row the same row
TABLES = {
    "places": ("places.jsonl", {"node": NODE}),
    "connections": ("connections.jsonl", {"edge": EDGE}),
    "profiles": ("profiles.jsonl", {"profile": PROFILE, "profile_hostels": PROFILE_HOSTELS}),
    "place_images": ("place_images.jsonl", {"profile_image": PLACE_IMAGE}),
    "experiences": ("experiences.jsonl", {"experience": EXPERIENCE}),
    "experience_images": ("experience_images.jsonl", {"experience_image": EXPERIENCE_IMAGE}),
    "stays": ("stays.jsonl", {"stay_quote": STAY}),
    "task_log": ("task_log.jsonl", {None: TASK}),
    "trips": ("trips.jsonl", {None: TRIP}),
}
DOCS = ("trip.json", "bag_rules.json", "known_prices.json", "scenarios.json",
        "experience_categories.json", "lists.json", "elevation.json", "image_queries.json")


NUL_WHY = "contains a NUL character (U+0000), which the database cannot hold"
BAD_WHY = "contains a NaN, an Infinity or a lone surrogate, which the database cannot hold"


def quote_errors(q):
    if store.has_nul(q):
        return [NUL_WHY]
    if store.has_unstorable(q):
        return [BAD_WHY]
    errs = check_fields(q, QUOTE)
    if errs:
        return errs
    if not q["legs_requested"]:
        errs.append("legs_requested is empty")
    for i, l in enumerate(q["legs_requested"]):
        errs += [f"legs_requested[{i}] {e}" for e in check_fields(l, LEG_REQ)]
    for name in ("out", "home"):
        if isinstance(q.get(name), dict):
            errs += [f"{name} {e}" for e in check_fields(q[name], LEG)]
    for i, m in enumerate(q.get("mid") or []):
        errs += [f"mid[{i}] {e}" for e in check_fields(m, LEG)] if isinstance(m, dict) else [f"mid[{i}] is not an object"]
    if isinstance(q.get("price_dkk"), (int, float)) and q["price_dkk"] <= 0:
        errs.append(f"price_dkk {q['price_dkk']} is not above 0")
    return errs


def trip_errors(t):
    """What check_fields cannot see in a trip row: its ways, tickets and the chain of places."""
    errs = []
    if t["version"] < 1:
        errs.append(f"version {t['version']} is below 1")
    for name in ("way_in", "way_home"):
        errs += [f"{name} {e}" for e in check_fields(t[name], TRIP_WAY)]
    for k, tk in (t.get("tickets") or {}).items():
        errs += [f"tickets.{k} {e}" for e in check_fields(tk, TRIP_TICKET)]
    if not t["places"]:
        errs.append("places is empty")
    prev = None
    for i, p in enumerate(t["places"]):
        pe = check_fields(p, TRIP_PLACE)
        errs += [f"places[{i}] {e}" for e in pe]
        if pe:
            prev = None
            continue
        hop = p.get("hop")
        if i == 0:
            if hop is not None:
                errs.append("places[0] has a hop, the first place is where the way in lands")
        elif hop is None:
            errs.append(f"places[{i}] {p['node']} has no hop")
        else:
            he = check_fields(hop, TRIP_HOP)
            errs += [f"places[{i}].hop {e}" for e in he]
            if not he:
                if prev is not None and hop["from"] != prev:
                    errs.append(f"places[{i}].hop starts in {hop['from']}, the place before is {prev}")
                if hop["to"] != p["node"]:
                    errs.append(f"places[{i}].hop ends in {hop['to']}, the place is {p['node']}")
                if isinstance(hop.get("flight"), dict):
                    errs += [f"places[{i}].hop.flight {e}" for e in check_fields(hop["flight"], TRIP_FLIGHT)]
        prev = p["node"]
    return errs


def row_errors(table, row):
    schemas = TABLES[table][1]
    if store.has_nul(row):
        return [NUL_WHY]
    if store.has_unstorable(row):
        return [BAD_WHY]
    if not isinstance(row, dict):
        return ["row is not a JSON object"]
    kind = row.get("kind") if None not in schemas else None
    if kind not in schemas:
        return [f"kind {kind!r} does not belong in {table} (expected {', '.join(map(str, schemas))})"]
    errs = check_fields(row, schemas[kind])
    if table == "places" and not errs:
        if not (-90 <= row["lat"] <= 90 and -180 <= row["lon"] <= 180):
            errs.append(f"lat/lon {row['lat']},{row['lon']} out of range")
    if "image" in row and isinstance(row["image"], dict):
        errs += [f"image {e}" for e in check_fields(row["image"], IMAGE)]
    if table == "stays" and not errs and row["check_out"] <= row["check_in"]:
        errs.append("check_out is not after check_in")
    if table == "trips" and not errs:
        errs += trip_errors(row)
    return errs


# ---- files --------------------------------------------------------------------------------------

def load_doc(st, name, default=None):
    """The document NAME of a store, or default when it is not there. A Paths object stands for the files."""
    if not isinstance(st, store.Store):
        st = store.FileStore(st)
    data, _ = st.doc(name)
    return default if data is None else data


# ---- quotes -------------------------------------------------------------------------------------

def cmd_add_quotes(paths, file, name=None, stamp=True):
    name = name or os.path.basename(file if file != "-" else "stdin.jsonl")
    if not re.match(r"[A-Za-z0-9][A-Za-z0-9._-]*\.jsonl$", name):
        raise Refused(f"quote file name {name!r} must look like <agent>.jsonl")
    st = get_store(paths)
    dest = os.path.join(paths.quotes, name)
    if file != "-" and os.path.abspath(file) == os.path.abspath(dest):
        raise Refused(f"{file} is already a source file")
    good, bad = [], []
    stamped = 0
    for n, q, err in read_input(file):
        if err is None and isinstance(q, dict) and stamp and not q.get("observed_at"):
            q["observed_at"] = now_utc()
            stamped += 1
        errs = [err] if err else quote_errors(q)
        (bad.append((n, "; ".join(errs))) if errs else good.append(q))
    res = st.add_quotes(good, name)
    for n, why in bad:
        print(f"refused line {n}: {why}")
    print(f"quotes: added {res.added}, duplicates {res.duplicates}, refused {len(bad)}" + (f", stamped observed_at on {stamped}" if stamped else "")
          + f" -> {st.dest('quotes', name)}")
    return 1 if bad else 0


def cmd_ingest_inbox(paths, st=None):
    st = st or get_store(paths)
    entries = st.inbox_new()
    if not entries:
        print("inbox: empty")
        return 0
    total_bad = 0
    for e in entries:
        f = e["file"]
        good, bad = [], []
        for n, q, err in e["lines"]:
            errs = [err] if err else quote_errors(q)
            if not errs and q.get("source") != "momondo-manual":
                errs = [f"source is {q.get('source')!r}, inbox rows must say momondo-manual"]
            if not errs and "trip_name" in q and not isinstance(q["trip_name"], str):
                errs = ["trip_name is not text"]
            # a row with a NUL or a lone surrogate cannot be stored as jsonb, so the rejected copy keeps its text only
            shown = json.dumps(q) if store.has_nul(q) or store.has_unstorable(q) else q
            (bad.append({"line": n, "reason": "; ".join(errs), "row": shown}) if errs else good.append(q))
        res = st.add_quotes(good, f)
        status = "rejected" if bad and not good else "added"
        where = st.inbox_mark(e["id"], status, bad[0]["reason"] if bad else None, bad)
        total_bad += len(bad)
        print(f"inbox {f}: added {res.added}, duplicates {res.duplicates}, rejected {len(bad)}" + (f" -> {where}" if bad else ""))
        for b in bad:
            print(f"  rejected line {b['line']}: {b['reason']}")
    return 1 if total_bad else 0


# ---- network, experiences, stays ----------------------------------------------------------------

def _origin_of(file, origin):
    return origin or (os.path.splitext(os.path.basename(file))[0] if file != "-" else "tripdb")


def _add_rows(paths, table, file, kinds, same, replace=False, origin=None, extra_check=None, st=None):
    """Hand rows of the given kinds to a table. same(row) is the label of a row in the messages. A row whose key is stored
    already is skipped, or replaces the stored one with --replace (the later row wins in the build)."""
    st = st or get_store(paths)
    good, nums, bad, other = [], [], [], {}
    for n, r, err in read_input(file):
        if err:
            bad.append((n, err)); continue
        if isinstance(r, dict) and "kind" not in r and len(kinds) == 1:
            r["kind"] = kinds[0]
        if isinstance(r, dict) and r.get("kind") not in kinds:
            other[r.get("kind")] = other.get(r.get("kind"), 0) + 1; continue
        if origin is not False and isinstance(r, dict) and "origin" not in r:
            r["origin"] = _origin_of(file, origin)
        errs = row_errors(table, r) + (extra_check(r) if extra_check and isinstance(r, dict) else [])
        if errs:
            bad.append((n, "; ".join(errs))); continue
        good.append(r)
        nums.append(n)
    res = st.add(table, good, cols.COLS[table].key, replace=replace)
    for n, why in bad:
        print(f"refused line {n}: {why}")
    for i, _, why in res.skips:
        print(f"skipped line {nums[i]}: {same(good[i])} is stored already ({why})")
    for k, c in other.items():
        print(f"ignored {c} rows of kind {k!r} (another add- command takes them)")
    print(f"{table}: added {res.added}, skipped {res.skipped}, refused {len(bad)} -> {st.dest(table)}")
    return 1 if bad else 0


def place_ids(st):
    return st.ids("places")


def experience_ids(st):
    return st.ids("experiences")


def category_ids(st):
    return {c["id"] for c in (load_doc(st, "experience_categories.json", {}) or {}).get("categories", [])}


def warn_unknown_places(st, ids, what):
    known = place_ids(st)
    missing = sorted(set(ids) - known)
    if missing:
        print(f"note: {what} names places that are not in places.jsonl: {', '.join(missing)}")


def cmd_add_place(paths, file, origin=None):
    return _add_rows(paths, "places", file, ["node"], lambda r: r.get("id"), origin=origin)


def cmd_add_connection(paths, file, origin=None):
    def same(r):
        return f"{r.get('from')}>{r.get('to')} {r.get('mode')} {r.get('operator')}"
    st = get_store(paths)
    rc = _add_rows(paths, "connections", file, ["edge"], same, origin=origin, st=st)
    ends = [x for _, r, e in read_input(file) if not e and isinstance(r, dict) and r.get("kind", "edge") == "edge"
            for x in (r.get("from"), r.get("to")) if x] if file != "-" else []
    warn_unknown_places(st, ends, "a connection")
    return rc


def cmd_add_profile(paths, file, origin=None, replace=False):
    return _add_rows(paths, "profiles", file, ["profile", "profile_hostels"], lambda r: f"{r.get('kind')} {r.get('id')}",
                     replace=replace, origin=origin)


def cmd_add_image(paths, file, origin=None, replace=False):
    return _add_rows(paths, "place_images", file, ["profile_image"], lambda r: r.get("id"), replace=replace, origin=origin)


def _experience_check(st):
    cats = category_ids(st)
    known = place_ids(st)

    def check(r):
        errs = []
        if cats and r.get("category") not in cats:
            errs.append(f"category {r.get('category')!r} is not in experience_categories.json ({', '.join(sorted(cats))})")
        unknown = [p for p in r.get("places") or [] if p not in known]
        if unknown:
            errs.append(f"places {', '.join(map(str, unknown))} are not in places.jsonl")
        return errs
    return check


def cmd_add_experience(paths, file):
    st = get_store(paths)
    return _add_rows(paths, "experiences", file, ["experience"], lambda r: r.get("id"), origin=False,
                     extra_check=_experience_check(st), st=st)


def cmd_update_experience(paths, eid, sets=(), json_file=None):
    patch = {}
    if json_file:
        with open(json_file, encoding="utf-8") if json_file != "-" else sys.stdin as fh:
            patch.update(json.load(fh))
    for s in sets:
        if "=" not in s:
            raise Refused(f"--set {s!r}: expected FIELD=VALUE")
        k, v = s.split("=", 1)
        try:
            patch[k] = json.loads(v)
        except json.JSONDecodeError:
            patch[k] = v
    if not patch:
        raise Refused("nothing to change: give --set FIELD=VALUE or --json FILE")
    if {"id", "kind"} & set(patch):
        raise Refused("id and kind cannot be changed")
    st = get_store(paths)
    check = _experience_check(st)
    hit = st.update("experiences", eid, patch, lambda new: row_errors("experiences", new) + check(new))
    if hit is None:
        raise Refused(f"no experience {eid!r}")
    old, new = hit
    for k in patch:
        if old.get(k) != new[k]:
            print(f"{eid}.{k}: {json.dumps(old.get(k), ensure_ascii=False)[:80]} -> {json.dumps(new[k], ensure_ascii=False)[:80]}")
    print(f"experiences: updated {eid}")
    return 0


def cmd_add_experience_image(paths, file, replace=False):
    st = get_store(paths)
    exp, cats = experience_ids(st), {c.get("image_id") for c in (load_doc(st, "experience_categories.json", {}) or {}).get("categories", [])}

    def check(r):
        return [] if r.get("id") in exp | cats else [f"id {r.get('id')!r} is neither an experience nor a category image_id"]
    return _add_rows(paths, "experience_images", file, ["experience_image"], lambda r: r.get("id"), replace=replace,
                     origin=False, extra_check=check, st=st)


def _num(v):
    """A positive number, not a bool."""
    return isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0


def _str_id(v):
    """Booking.com property ids come as numbers or strings, stored as a string."""
    return None if v is None else str(v)


def cmd_add_stays(paths, file, usd=6.45, eur=7.46):
    """Stay-price-worker rows (price_per_night in DKK, USD or EUR) as stay quotes in DKK per night."""
    rate = {"DKK": 1.0, "USD": usd, "EUR": eur}
    st = get_store(paths)
    good, bad = [], []
    for n, r, err in read_input(file):
        if err:
            bad.append((n, err)); continue
        cur = (r.get("currency") or "DKK").upper()
        if cur not in rate:
            bad.append((n, f"currency {cur} is not DKK, USD or EUR")); continue
        ci, co = r.get("check_in"), r.get("check_out")
        nights = (dt.date.fromisoformat(co) - dt.date.fromisoformat(ci)).days if _is(ci, "date") and _is(co, "date") else None
        # Booking.com gives the total for the stay, so a row with only a total is priced per night here
        if r.get("price_per_night") is None and _num(r.get("total")) and nights and nights > 0:
            r = {**r, "price_per_night": r["total"] / nights}
        if not _num(r.get("price_per_night")):
            bad.append((n, f"price_per_night is {r.get('price_per_night')!r}")); continue
        row = {"kind": "stay_quote", "place": r.get("place"), "site": r.get("site"), "name": r.get("name"),
               "type": r.get("kind"), "room": r.get("room"), "dkk_per_night": round(r["price_per_night"] * rate[cur]), "nights": nights,
               "rating": r.get("rating"), "reviews": r.get("reviews"), "check_in": ci, "check_out": co,
               "url": r.get("url"), "property_id": _str_id(r.get("property_id")), "observed_at": r.get("observed_at") or now_utc(), "task_id": r.get("task_id"),
               "notes": r.get("notes")}
        errs = row_errors("stays", row)
        if errs:
            bad.append((n, "; ".join(errs))); continue
        good.append(row)
    res = st.add("stays", good, cols.COLS["stays"].key)
    for n, why in bad:
        print(f"refused line {n}: {why}")
    skipped = {i for i, _, _ in res.skips}
    warn_unknown_places(st, [r["place"] for i, r in enumerate(good) if i not in skipped], "a stay")
    print(f"stays: added {res.added}, duplicates {res.skipped}, refused {len(bad)} -> {st.dest('stays')}")
    return 1 if bad else 0


# ---- lists, task log, usage ---------------------------------------------------------------------

def _lists_change(paths, fn, st=None):
    """Read lists.json, apply fn and write it back only if nobody changed it meanwhile. Tries again when somebody did."""
    st = st or get_store(paths)
    for _ in range(20):
        doc, version = st.doc("lists.json")
        doc = doc if doc is not None else {"lists": []}
        msg = fn(doc)
        doc["updated"] = dt.date.today().isoformat()
        if st.put_doc("lists.json", doc, version):
            print(msg)
            return 0
    raise Refused("lists.json keeps changing under this run, try again")


def cmd_list_add(paths, list_id, typ, item_id, note=None, name=None):
    if typ not in ("place", "experience"):
        raise Refused(f"type must be place or experience, not {typ!r}")
    st = get_store(paths)
    known = place_ids(st) if typ == "place" else experience_ids(st)
    if item_id not in known:
        raise Refused(f"no {typ} {item_id!r}")

    def change(doc):
        lst = next((l for l in doc["lists"] if l["id"] == list_id), None)
        if lst is None:
            if not name:
                raise Refused(f"no list {list_id!r}; give --name to create it")
            lst = {"id": list_id, "name": name, "items": []}
            doc["lists"].append(lst)
        if any(i["type"] == typ and i["id"] == item_id for i in lst["items"]):
            raise Refused(f"{typ} {item_id} is in {list_id} already")
        item = {"type": typ, "id": item_id, "added": dt.date.today().isoformat()}
        if note:
            item["note"] = note
        lst["items"].append(item)
        return f"lists: added {typ} {item_id} to {list_id}"
    return _lists_change(paths, change, st)


def cmd_list_remove(paths, list_id, typ, item_id):
    def change(doc):
        lst = next((l for l in doc["lists"] if l["id"] == list_id), None)
        if lst is None:
            raise Refused(f"no list {list_id!r}")
        before = len(lst["items"])
        lst["items"] = [i for i in lst["items"] if not (i["type"] == typ and i["id"] == item_id)]
        if len(lst["items"]) == before:
            raise Refused(f"{typ} {item_id} is not in {list_id}")
        return f"lists: removed {typ} {item_id} from {list_id}"
    return _lists_change(paths, change)


def cmd_log_task(paths, issue, typ, summary, outputs=(), task_file=None, done_at=None):
    task = None
    if task_file:
        with open(task_file, encoding="utf-8") as fh:
            task = json.load(fh)
    row = {"issue": issue, "type": typ, "task": task, "done_at": done_at or dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"),
           "summary": (summary or "")[:300], "outputs": list(outputs)}
    errs = row_errors("task_log", row)
    if errs:
        raise Refused("; ".join(errs))
    get_store(paths).append("task_log", row)
    print(f"task_log: logged issue #{issue}")
    return 0


def cmd_log_usage(paths, values):
    for c in ("searches", "tokens", "tool_uses", "seconds", "rows"):
        if not re.fullmatch(r"\d+", str(values.get(c, ""))):
            raise Refused(f"--{c.replace('_', '-')} must be a whole number")
    missing = [c for c in USAGE_COLS if values.get(c) in (None, "")]
    if missing:
        raise Refused("missing " + ", ".join("--" + c.replace("_", "-") for c in missing))
    get_store(paths).append("agent_usage", {c: values[c] for c in USAGE_COLS})
    print(f"agent_usage: logged {values['agent']}")
    return 0


# ---- query --------------------------------------------------------------------------------------

def cmd_query(paths, table, eq=(), in_=(), gte=(), select=None, limit=None):
    """Print the matching rows of a table as JSON lines, in the shape of the database columns."""
    rows = get_store(paths).query(table, eq, in_, gte, select, limit)
    for r in rows:
        print(json.dumps(r, ensure_ascii=False, default=str))
    return 0


# ---- documents ----------------------------------------------------------------------------------

def _doc_name(name):
    if name not in IMPORT_DOCS:
        raise Refused(f"{name!r} is not a document, expected one of {', '.join(IMPORT_DOCS)}")
    return name


def cmd_doc_get(paths, name, file="-"):
    """Write the document to FILE, or to stdout for -."""
    st = get_store(paths)
    try:
        data, _ = st.doc(_doc_name(name))
    except ValueError as e:
        raise Refused(f"{name} is not valid JSON ({e})")
    if data is None:
        raise Refused(f"no document {name}")
    text = json.dumps(data, ensure_ascii=False, indent=1) + chr(10)
    if file == "-":
        sys.stdout.write(text)
    else:
        write_atomic(file, text)
    return 0


def cmd_doc_put(paths, name, file):
    """Replace the document with the JSON in FILE. It is written only if nobody changed the document since it was read,
    and read again if somebody did. A new trip.json brings build_qid and usable of the stored quotes in line."""
    _doc_name(name)
    if file == "-":
        text = sys.stdin.read()
    else:
        with open(file, encoding="utf-8") as fh:
            text = fh.read()
    try:
        data = json.loads(text)
    except json.JSONDecodeError as e:
        raise Refused(f"{file} is not valid JSON ({e})")
    if store.has_nul(data):
        raise Refused(NUL_WHY)
    if store.has_unstorable(data):
        raise Refused(BAD_WHY)
    st = get_store(paths)
    for _ in range(20):
        try:
            version = st.doc(name)[1]
            done = st.put_doc(name, data, version)
        except ValueError as e:
            raise Refused(f"{name} is stored as invalid JSON ({e}), repair it by hand")
        if done:
            break
    else:
        raise Refused(f"{name} keeps changing under this run, try again")
    print(f"doc: wrote {name} -> {st.dest('documents', name)}")
    if name == "trip.json":
        n = st.recompute_quotes(data)
        if n:
            print(f"quotes: {n} changed build_qid or usable")
    return 0


# ---- trips --------------------------------------------------------------------------------------

def _trip_slug(name):
    s = re.sub(r"[^a-z0-9]+", "-", (name or "").lower()).strip("-")
    return (s or "trip")[:48]


def read_trips(path):
    """The trips in a FILE: one JSON object, a JSON list of them, or JSONL. [(label, trip or None, error or None)]."""
    if path == "-":
        text = sys.stdin.read()
    else:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
    try:
        doc = json.loads(text)
    except json.JSONDecodeError:
        return [(f"line {n}", r, e) for n, r, e in read_input_text(text)]
    items = doc if isinstance(doc, list) else [doc]
    return [(f"trip {i + 1}", t, None) for i, t in enumerate(items)]


def cmd_save_trip(paths, file, by="plan-trip"):
    """Save each trip in FILE as the next version of its id (a new id starts at version 1). A trip the same
    as its latest version is skipped. Without an id the trip gets one from its name."""
    st = get_store(paths)
    saved, skipped, bad = [], [], []
    ids = set(st.trip_ids())
    for label, t, err in read_trips(file):
        if err or not isinstance(t, dict):
            bad.append((label, err or "not a JSON object")); continue
        t = dict(t)
        if not t.get("id"):
            base = _trip_slug(t.get("name"))
            t["id"], k = base, 2
            while t["id"] in ids:
                t["id"], k = f"{base}-{k}", k + 1
        if not isinstance(t["id"], str):
            bad.append((label, f"id is {json.dumps(t['id'])[:40]}, expected a string")); continue
        label = t["id"]
        t["version"] = 1
        t["saved_at"] = now_utc()
        t["by"] = t.get("by") or by
        errs = row_errors("trips", t)
        if errs:
            bad.append((label, "; ".join(errs))); continue
        res = st.save_trip(t)
        ids.add(res["id"])
        (skipped if res["skipped"] else saved).append((res["id"], res["version"]))
    for label, why in bad:
        print(f"refused {label}: {why}")
    for label, v in skipped:
        print(f"skipped {label}: same as version {v}")
    for tid, v in saved:
        print(f"saved {tid} version {v} (open it at /?trip={tid})")
    print(f"trips: saved {len(saved)}, skipped {len(skipped)}, refused {len(bad)} -> {st.dest('trips')}")
    return 1 if bad else 0


def cmd_delete_trip(paths, ids):
    """Remove every version of each trip id. Git keeps the old rows of the files."""
    st = get_store(paths)
    found = st.delete_trip(set(ids))
    for tid in ids:
        if tid in found:
            print(f"deleted {tid} ({found[tid]} version{'s' if found[tid] != 1 else ''})")
        else:
            print(f"unknown trip {tid}")
    print(f"trips: deleted {len(found)}, kept {len({t['id'] for t in st.trips()})} -> {st.dest('trips')}")
    return 0 if len(found) == len(set(ids)) else 1


def export_trips(paths):
    """data/web/trips.json: the latest version of every trip, with a short list of its earlier versions."""
    latest, every = latest_trips(rows_of(paths.src(TABLES["trips"][0])))
    trips = []
    for tid, row in latest.items():
        out = dict(row)
        out["history"] = [{"version": r.get("version"), "saved_at": r.get("saved_at"), "by": r.get("by"), "why": r.get("why")}
                          for r in reversed(every[tid][:-1])]
        trips.append(out)
    trips.sort(key=lambda t: (t.get("rank") is None, t.get("rank") or 0, t.get("saved_at") or ""))
    doc = {"generated_at": now_utc(), "source": "trips", "trips": trips}
    os.makedirs(paths.web, exist_ok=True)
    write_atomic(os.path.join(paths.web, "trips.json"), json.dumps(doc, ensure_ascii=False, indent=1) + "\n")
    return len(trips)


# ---- check --------------------------------------------------------------------------------------

def run_check(paths, quiet=False, st=None):
    """(errors, warnings) over every source."""
    st = st or get_store(paths)
    errors, warnings = [], []
    for name in DOCS:
        try:
            data, _ = st.doc(name)
        except ValueError as e:
            errors.append(f"{st.label(name)}: not valid JSON ({e})")
            continue
        if data is None and name in ("trip.json", "bag_rules.json"):
            errors.append(f"{st.label(name)}: missing")
    lists = load_doc(st, "lists.json", {"lists": []}) or {}
    cats = load_doc(st, "experience_categories.json", {"categories": []}) or {}
    for c in cats.get("categories", []):
        errors += [f"{st.label('experience_categories.json')} {c.get('id')}: {e}" for e in
                   check_fields(c, {"id": "!slug", "name": "!str", "place_categories": "!list", "image_id": "str|null"})]
    counts = {}
    for table in TABLES:
        n = 0
        for label, r, err in st.check_rows(table):
            n += 1
            errs = [err] if err else row_errors(table, r)
            errors += [f"{label}: {e}" for e in errs]
        counts[table] = n
    for tid, got in st.trip_versions().items():
        if got != list(range(1, len(got) + 1)):
            errors.append(f"{st.label('trips')} {tid}: versions {got}, expected 1 to {len(got)} once each")
    places, exps = place_ids(st), experience_ids(st)
    for r in st.rows("experiences"):
        for e in _experience_check(st)(r):
            errors.append(f"{st.label('experiences')} {r.get('id')}: {e}")
    for l in lists.get("lists", []):
        for i in l.get("items", []):
            if (i.get("type") == "place" and i.get("id") not in places) or (i.get("type") == "experience" and i.get("id") not in exps)                     or i.get("type") not in ("place", "experience"):
                errors.append(f"{st.label('lists.json')} {l.get('id')}: unknown {i.get('type')} {i.get('id')}")
    for table, what in (("profiles", "profile"), ("place_images", "place image")):
        for r in st.rows(table):
            if r.get("id") not in places:
                warnings.append(f"{what} {r.get('id')} has no place")
    nq, groups = 0, set()
    for label, q, err in st.check_quotes():
        nq += 1
        groups.add(label.rsplit(":", 1)[0])
        errs = [err] if err else quote_errors(q)
        errors += [f"{label}: {e}" for e in errs]
    if not quiet:
        print("sources: " + ", ".join(f"{t} {n}" for t, n in counts.items()) + f", quotes {nq} in {len(groups)} files")
    return errors, warnings


def cmd_check(paths, max_lines=40):
    errors, warnings = run_check(paths)
    for w in warnings[:max_lines]:
        print("warning:", w)
    for e in errors[:max_lines]:
        print("error:", e)
    if len(errors) > max_lines:
        print(f"... and {len(errors) - max_lines} more errors")
    print(f"check: {len(errors)} errors, {len(warnings)} warnings")
    return 1 if errors else 0


# ---- build --------------------------------------------------------------------------------------

def _sql_value(v):
    if isinstance(v, bool):
        return int(v)
    if isinstance(v, (list, dict)):
        return json.dumps(v, ensure_ascii=False)
    return v


def load_tables(paths):
    """Every source table into data/built/trip.db next to the quotes table that ingest.py writes."""
    con = sqlite3.connect(os.path.join(paths.built, "trip.db"))
    for table, (fname, _) in TABLES.items():
        rows = [r for r in rows_of(paths.src(fname)) if isinstance(r, dict)]
        cols = []
        for r in rows:
            cols += [c for c in r if c not in cols]
        cols = cols or ["kind"]
        con.execute(f'DROP TABLE IF EXISTS "{table}"')
        con.execute(f'CREATE TABLE "{table}" (line INTEGER, ' + ", ".join(f'"{c}"' for c in cols) + ")")
        con.executemany(f'INSERT INTO "{table}" VALUES (' + ",".join("?" * (len(cols) + 1)) + ")",
                        [[i] + [_sql_value(r.get(c)) for c in cols] for i, r in enumerate(rows, 1)])
    con.execute("DROP TABLE IF EXISTS documents")
    con.execute("CREATE TABLE documents (name TEXT PRIMARY KEY, json TEXT)")
    for name in DOCS:
        p = paths.src(name)
        if os.path.exists(p):
            with open(p, encoding="utf-8") as fh:
                con.execute("INSERT INTO documents VALUES (?, ?)", (name, fh.read()))
    con.commit()
    con.close()


# Airports whose flights are the long-haul tickets, not regional hops. The trip's home airports and alt origins
# from trip.json are added to these.
LONG_HAUL = {"CPH", "MAD", "BCN", "LIS", "CDG", "AMS", "FRA", "LGW", "LHR", "IST", "ALC", "VLC", "RMU", "ZRH", "MUC", "BRU"}
# "retracted": a quote found to be wrong. Adding the same quote again (same tripdb quote key) with a newer
# observed_at and this flag takes it off the price lists, since the newest sighting of a quote is the one that counts.
PAIR_DATES_SKIP = {"over_30h", "incomplete", "ad_offer", "retracted"}


def pair_dates(quotes, long_haul=LONG_HAUL, max_hours=30):
    """Every regional one-way quote by directed pair and departure date, cheapest first.

    {"pairs": {"BOG-VVI": {"2027-01-28": [quote, ...]}}} where a quote is
    {"p": price kr, "d": local departure "06:10", "a": local arrival "12:40", "n": days later it lands (only when > 0),
     "h": hours, "c": airlines, "s": stops, "src": source, "at": newest observed_at (UTC, "2026-10-28T10:00Z")},
    plus what the row knows beyond that, each key only when known: "v": airports it stops at, "w": hours waited at
    each, "ag": the site selling it, "o": true for a night at a layover, "f": "self_transfer", "airport_change" and
    "stopover". A quote flagged "stopover" is a planned stay on the way, so max_hours does not apply to it.
    The same quote seen more than once (tripdb's quote key) is one entry with its newest observed_at."""
    newest = {}
    for q in quotes:
        if not isinstance(q, dict) or q.get("structure") != "one_way":
            continue
        legs = q.get("legs_requested") or []
        out = q.get("out") or {}
        if len(legs) != 1 or q.get("price_dkk") is None or not isinstance(out, dict):
            continue
        a, b = legs[0].get("from"), legs[0].get("to")
        if not a or not b or a in long_haul or b in long_haul:
            continue
        t = parse_time(q.get("observed_at"))
        if not t:
            continue
        k = quote_key(q)
        if k not in newest or t > newest[k][0]:
            newest[k] = (t, q)

    pairs = {}
    for t, q in newest.values():
        out = q["out"]
        flags = set(q.get("flags") or [])
        stopover = "stopover" in flags
        if PAIR_DATES_SKIP & (flags - {"over_30h"} if stopover else flags):
            continue
        if not isinstance(out.get("hours"), (int, float)) or (out["hours"] > max_hours and not stopover):
            continue
        if (q.get("notes") or "").split(";")[0].replace("site=", "").strip() in ("Sponsoreret", "Annonce"):
            continue
        leg, out = q["legs_requested"][0], q["out"]
        dep, arr = out.get("dep") or "", out.get("arr") or ""
        date = dep[:10] if DATE_RE.match(dep[:10]) else leg.get("date")
        if not date:
            continue
        row = {"p": int(round(float(q["price_dkk"]))), "d": dep[11:16] or None, "a": arr[11:16] or None}
        if DATE_RE.match(arr[:10]) and DATE_RE.match(dep[:10]):
            n = (dt.date.fromisoformat(arr[:10]) - dt.date.fromisoformat(dep[:10])).days
            if n > 0:
                row["n"] = n
        via = [v for v in out.get("via") or [] if isinstance(v, str) and v]
        row.update({"h": round(float(out["hours"]), 2),
                    "c": [c.strip() for c in out.get("carriers") or [] if isinstance(c, str) and 0 < len(c.strip()) <= 20],
                    "s": out["stops"] if isinstance(out.get("stops"), int) else len(via),
                    "src": q.get("source"), "at": t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%MZ")})
        row.update(_row_detail(q, out, via))
        pairs.setdefault(f"{leg['from']}-{leg['to']}", {}).setdefault(date, []).append(row)
    for dates in pairs.values():
        for date, rows in dates.items():
            rows = _drop_carrierless_twins(rows)
            rows.sort(key=lambda r: (r["p"], r["h"], r["d"] or "", r["src"] or ""))
            dates[date] = rows
    return {"pairs": {k: dict(sorted(v.items())) for k, v in sorted(pairs.items())}}


def _row_detail(q, out, via):
    """The keys of a pair_dates row that only some quotes know, left out when unknown."""
    d = {}
    if via:
        d["v"] = via
    waits = [round(float(h), 2) if isinstance(h, (int, float)) else None for h in out.get("layover_h") or []]
    if any(h is not None for h in waits):
        d["w"] = waits
    note = (q.get("notes") or "").split(";")[0].strip()
    if note.startswith("site=") and note[5:].strip():
        d["ag"] = note[5:].strip()
    if out.get("overnight_layover"):
        d["o"] = True
    flags = set(q.get("flags") or [])
    if q.get("self_transfer"):
        flags.add("self_transfer")
    marks = sorted(flags & {"self_transfer", "airport_change", "stopover"})
    if marks:
        d["f"] = marks
    return d


def _drop_carrierless_twins(rows):
    """A result row read without its airlines is the same flight as a row with the same price, times, stops and
    source that has them: keep the named ones, with the newest observation of the twins."""
    twin = lambda r: (r["p"], r["d"], r["a"], r.get("n"), r["s"], r["src"])
    named = {}
    for r in rows:
        if r["c"]:
            named.setdefault(twin(r), []).append(r)
    kept = []
    for r in rows:
        if r["c"] or twin(r) not in named:
            kept.append(r)
            continue
        for n in named[twin(r)]:
            n["at"] = max(n["at"], r["at"])
            for key in ("v", "w", "ag"):
                if key in r:
                    n.setdefault(key, r[key])
    return kept


def write_pair_dates(paths):
    trip = load_doc(paths, "trip.json", {}) or {}
    long_haul = LONG_HAUL | set(trip.get("home_airports") or []) | set(trip.get("alt_origins") or [])
    quotes = []
    if os.path.isdir(paths.quotes):
        for f in sorted(os.listdir(paths.quotes)):
            if f.endswith(".jsonl"):
                quotes += rows_of(os.path.join(paths.quotes, f))
    doc = pair_dates(quotes, long_haul, trip.get("max_hours_one_way", 30))
    os.makedirs(paths.web, exist_ok=True)
    write_atomic(os.path.join(paths.web, "pair_dates.json"), json.dumps(doc, ensure_ascii=False, separators=(",", ":")) + "\n")
    n = sum(len(r) for d in doc["pairs"].values() for r in d.values())
    return f"pair_dates.json: {len(doc['pairs'])} pairs, {n} quotes"


STEPS = ["ingest.py", "build_map.py", "build_web_data.py", "chains.py", "routes.py", "inout.py", "itineraries.py",
         "dashboard_data.py"]
PUBLISH = [("built", "map.json"), ("built", "inout.json"), ("sources", "bag_rules.json"), ("sources", "trip.json")]


def _run(paths, script, extra=()):
    r = subprocess.run([sys.executable, "-I", "-X", "utf8", script, "--root", paths.root, *extra],
                       capture_output=True, text=True, encoding="utf-8", errors="replace")
    if r.returncode:
        print(r.stdout[-3000:])
        print(r.stderr[-3000:])
        raise Refused(f"{os.path.basename(script)} failed")
    lines = [l for l in r.stdout.splitlines() if l.strip()]
    return lines


def cmd_build(paths, fetch_elevation=False, sync=True):
    fs = store.FileStore(paths)
    rc = cmd_ingest_inbox(paths, fs)
    errors, _ = run_check(paths, st=fs)
    if errors:
        for e in errors[:40]:
            print("error:", e)
        raise Refused(f"check found {len(errors)} errors, fix the sources first (tripdb check)")
    os.makedirs(paths.built, exist_ok=True)
    os.makedirs(paths.web, exist_ok=True)
    with Lock(paths):
        for step in STEPS:
            lines = _run(paths, os.path.join(PIPELINE, step), ["--fetch-elevation"] if step == "build_web_data.py" and fetch_elevation else [])
            if step == "ingest.py":
                print(f"{step}: {lines[0] if lines else ''}")
                load_tables(paths)
                print("trip.db: loaded " + ", ".join(TABLES) + ", documents")
            else:
                warn = [l for l in lines if l.startswith("WARNING")]
                print(f"{step}: {(lines[-1] if lines else '')[:160]}" + (f" ({len(warn)} warnings)" if warn else ""))
        for where, name in PUBLISH:
            shutil.copyfile(os.path.join(paths.root, "data", where, name), os.path.join(paths.web, name))
        print("data/web: copied " + ", ".join(n for _, n in PUBLISH))
        print(write_pair_dates(paths))
        print(f"data/web/trips.json: {export_trips(paths)} trips")
    if sync and os.path.isdir(os.path.join(paths.root, "plugin")):
        for l in _run(paths, os.path.join(HERE, "sync_claude_dir.py")):
            print("sync_claude_dir.py:", l)
    print("build: done (data/web/meta.json carries the build time)")
    return rc


def _way_key(w):
    return json.dumps([w["direction"], w["type"], list(w["tickets"]), w["depart"]])


def cmd_way_map(paths, old, new):
    """Write the document way_id_map, old way id to new way id, matching on the key inout.py uses for its ids."""
    def ways(path):
        try:
            with open(path, encoding="utf-8") as fh:
                return json.load(fh)["ways"]
        except (OSError, ValueError, KeyError) as e:
            raise Refused(f"cannot read the ways of {path}: {e}")
    by_key = {_way_key(w): wid for wid, w in ways(new).items()}
    out = {}
    for wid, w in ways(old).items():
        hit = by_key.get(_way_key(w))
        if hit:
            out[wid] = hit
    write_atomic(paths.src("way_id_map.json"), json.dumps(out, indent=1, ensure_ascii=False) + "\n")
    print(f"way-map: {len(out)} of {len(ways(old))} old ways found in the new build")
    return 0


# ---- Supabase: import and pull ------------------------------------------------------------------

IMPORT_DOCS = DOCS + ("way_id_map.json",)
# table, file, order column. Foreign key order, so a table never comes before the one it points to.
SB_TABLES = [("places", "places.jsonl", "seq"), ("connections", "connections.jsonl", "id"), ("profiles", "profiles.jsonl", "seq"),
             ("place_images", "place_images.jsonl", "seq"), ("experiences", "experiences.jsonl", "seq"),
             ("experience_images", "experience_images.jsonl", "seq"), ("stays", "stays.jsonl", "id")]
WIPE_KEY = {"quotes": "seq", "trips": "seq", "stays": "id", "connections": "id", "profiles": "seq", "place_images": "seq",
            "experience_images": "seq", "experiences": "seq", "task_log": "seq", "agent_usage": "seq", "places": "seq",
            "airports": "code", "documents": "name", "tasks": "id", "inbox": "id", "derived_options": "id"}
WIPE_ORDER = list(WIPE_KEY)


def _rest(root):
    env = store.load_env(root)
    try:
        return store.Rest(env.get("SUPABASE_URL"), env.get("SUPABASE_SECRET_KEY"))
    except store.RestError as e:
        raise Refused(str(e))


def _sources_dir(arg):
    """(the sources folder, the repo root) for a Paths, a repo root or a sources folder."""
    if isinstance(arg, Paths):
        return arg.sources, arg.root
    d = os.path.abspath(arg)
    nested = os.path.join(d, "data", "sources")
    if os.path.isdir(nested):
        return nested, d
    return d, os.path.abspath(os.path.join(d, "..", ".."))


def _count(rest, table):
    _, hdr, _ = rest._call("GET", f"/rest/v1/{table}?select=*&limit=1", retry=True,
                           headers={"Prefer": "count=exact", "Range-Unit": "items", "Range": "0-0"})
    m = re.search(r"/(\d+)$", hdr.get("Content-Range") or "")
    return int(m.group(1)) if m else 0


def quote_files(src):
    d = os.path.join(src, "quotes")
    return [os.path.join(d, f) for f in sorted(os.listdir(d)) if f.endswith(".jsonl")] if os.path.isdir(d) else []


def cmd_import(paths_or_dir, wipe=False, rest=None):
    """Load a data/sources folder into an empty project. Repeated places, profiles and quotes fold, and the airports
    are made from the places and the quotes. Returns the counts, table by table."""
    src, root = _sources_dir(paths_or_dir)
    if wipe and not os.path.exists(os.path.join(src, "way_id_map.json")):
        raise Refused("way_id_map.json is missing in " + src + ", run tripdb way-map first (spec 9.3 step 2b), "
                      "or the browser journeys all go to unresolved")
    rest = rest or _rest(root)
    counts = {}
    try:
        held = {t: n for t in WIPE_ORDER if (n := _count(rest, t))}
        if held and not wipe:
            raise Refused("the project holds rows (" + ", ".join(f"{t} {n}" for t, n in held.items()) + "), use --wipe to clear them")
        if held:
            if rest.get_all("documents", {"select": "name", "name": "eq.cutover_done"}):
                raise Refused("cutover_done exists, --wipe refused")
            for t in WIPE_ORDER:
                if t in held:
                    rest.delete(t, {WIPE_KEY[t]: "not.is.null"})

        def rows(path):
            return [r for r in rows_of(path) if isinstance(r, dict)]
        cfg = {}
        if os.path.exists(os.path.join(src, "trip.json")):
            with open(os.path.join(src, "trip.json"), encoding="utf-8") as fh:
                cfg = json.load(fh)
        places = cols.fold_places(rows(os.path.join(src, "places.jsonl")))
        raw_quotes = [q for f in quote_files(src) for q in rows(f)]
        try:
            quotes = cols.fold_quotes(raw_quotes, cfg)
        except cols.QuoteIdConflict as e:
            raise Refused(f"import stopped: {e}")
        place_codes = {p["iata"] for p in places if p.get("iata")}
        quote_codes = {r[c] for r in quotes for c in ("first_from", "first_to", "last_from", "last_to") if r.get(c)}
        rest.insert("airports", [{"code": c} for c in sorted(place_codes | quote_codes)])
        counts["airports"] = len(place_codes | quote_codes)
        counts["airport_stubs_from_quotes"] = len(quote_codes - place_codes)
        for table, fname, _ in SB_TABLES:
            recs = rows(os.path.join(src, fname))
            counts[table + "_in_file"] = len(recs)
            if table == "places":
                recs = places
            elif table == "profiles":
                recs = cols.fold_profiles(recs)
            counts[table] = len(recs)
            rest.insert(table, [cols.to_row(table, r) for r in recs])
        counts["quotes_in_files"] = len(raw_quotes)
        counts["quotes"] = len(quotes)
        rest.insert("quotes", quotes)
        trips = rows(os.path.join(src, "trips.jsonl"))
        counts["trips"] = len(trips)
        rest.insert("trips", [cols.trip_row(t) for t in trips])
        log = rows(os.path.join(src, "task_log.jsonl"))
        counts["task_log"] = len(log)
        rest.insert("task_log", [cols.to_row("task_log", r) for r in log])
        usage = []
        up = os.path.join(src, "agent_usage.csv")
        if os.path.exists(up):
            with open(up, encoding="utf-8", newline="") as fh:
                usage = [cols.usage_row(r) for r in csv.DictReader(fh)]
        counts["agent_usage"] = len(usage)
        rest.insert("agent_usage", usage)
        docs = []
        for name in IMPORT_DOCS:
            p = os.path.join(src, name)
            if os.path.exists(p):
                with open(p, encoding="utf-8") as fh:
                    docs.append({"name": name[:-5] if name == "way_id_map.json" else name, "version": 1, "data": json.load(fh)})
        counts["documents"] = len(docs)
        rest.insert("documents", docs)
    except store.RestError as e:
        raise Refused(f"import stopped: {e}")
    for k, v in counts.items():
        print(f"import: {k} {v}")
    return counts


def _jsonl(path, recs):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    write_atomic(path, "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in recs))


def _usage_cell(v):
    return "" if v is None else (str(int(v)) if float(v) == int(v) else str(v))


def _pull_usage(rest, to_dir):
    usage = rest.get_all("agent_usage", {"select": "*", "order": "seq.asc"})
    buf = io.StringIO()
    w = csv.writer(buf, lineterminator="\n")
    w.writerow(USAGE_COLS)
    for r in usage:
        w.writerow([_usage_cell(r[c]) if c in ("searches", "tokens", "tool_uses", "seconds", "rows") else r[c] for c in USAGE_COLS])
    write_atomic(os.path.join(to_dir, "agent_usage.csv"), buf.getvalue())


def _pull_docs(rest, to_dir, only=None):
    """Writes the documents (all, or those named in only) as files of data/sources. Returns the rows written."""
    names = {(n[:-5] if n == "way_id_map.json" else n): n for n in IMPORT_DOCS}
    docs = [d for d in rest.get_all("documents", {"select": "name,data"}) if d["name"] in names and (only is None or d["name"] in only)]
    for d in docs:
        write_atomic(os.path.join(to_dir, names[d["name"]]), json.dumps(d["data"], indent=1, ensure_ascii=False) + "\n")
    return docs


def cmd_pull(to_dir, rest=None, root=None):
    """Write the project out as the files of data/sources. Quotes go to one file, in seq order. Nothing is folded."""
    to_dir = os.path.abspath(to_dir)
    rest = rest or _rest(root or DEFAULT_ROOT)
    try:
        for table, fname, order in SB_TABLES:
            rows = rest.get_all(table, {"select": "*", "order": order + ".asc"})
            _jsonl(os.path.join(to_dir, fname), [cols.from_row(table, r) for r in rows])
        quotes = rest.get_all("quotes", {"select": "*", "order": "seq.asc"})
        _jsonl(os.path.join(to_dir, "quotes", "all.jsonl"), [cols.from_row("quotes", r) for r in quotes])
        trips = [r for r in rest.get_all("trips", {"select": "*", "order": "seq.asc"}) if not r.get("deleted_at")]
        _jsonl(os.path.join(to_dir, "trips.jsonl"), [cols.trip_rec(r) for r in trips])
        log = rest.get_all("task_log", {"select": "*", "order": "seq.asc"})
        if log:
            _jsonl(os.path.join(to_dir, "task_log.jsonl"), [cols.from_row("task_log", r) for r in log])
        _pull_usage(rest, to_dir)
        docs = _pull_docs(rest, to_dir)
    except store.RestError as e:
        raise Refused(f"pull stopped: {e}")
    print(f"pull: {len(quotes)} quotes, {len(trips)} trips and {len(docs)} documents into {to_dir}")
    return 0


# ---- Supabase: dump and restore -----------------------------------------------------------------
# table, order column, identity column. Foreign key order, so a table never comes before the one it points to.
DUMP_TABLES = [("airports", "code", None), ("places", "seq", "seq"), ("connections", "id", "id"), ("profiles", "seq", "seq"),
               ("place_images", "seq", "seq"), ("experiences", "seq", "seq"), ("experience_images", "seq", "seq"),
               ("stays", "id", "id"), ("quotes", "seq", "seq"), ("trips", "seq", "seq"), ("documents", "name", None),
               ("inbox", "id", "id"), ("tasks", "id", "id"), ("task_log", "seq", "seq"), ("agent_usage", "seq", "seq"),
               ("owners", "user_id", None), ("inbox_tokens", "name", None)]


def cmd_cutover_done(rest=None, root=None):
    """Write the cutover_done document (spec 9.3 step 7). From then on the live test suites and every --wipe refuse, and
    the browser import runs. Writing it twice leaves the first one."""
    rest = rest or _rest(root or DEFAULT_ROOT)
    try:
        got = rest.insert("documents", [{"name": "cutover_done", "version": 1, "data": {"at": now_utc()}}], on_conflict="name",
                          returning="name", resolution="ignore-duplicates")
    except store.RestError as e:
        raise Refused(f"cutover-done stopped: {e}")
    print("cutover-done: written" if got else "cutover-done: already written, left as it was")
    return bool(got)


def cmd_dump(to_dir, rest=None, root=None):
    """Every table as it stands, one JSON lines file per table with all columns. Nothing is shaped or dropped."""
    to_dir = os.path.abspath(to_dir)
    rest = rest or _rest(root or DEFAULT_ROOT)
    counts = {}
    try:
        for table, order, _ in DUMP_TABLES:
            rows = rest.get_all(table, {"select": "*", "order": order + ".asc"})
            _jsonl(os.path.join(to_dir, table + ".jsonl"), rows)
            counts[table] = len(rows)
    except store.RestError as e:
        raise Refused(f"dump stopped: {e}")
    print("dump: " + ", ".join(f"{t} {n}" for t, n in counts.items()) + f" into {to_dir}")
    return counts


def cmd_restore(from_dir, wipe=False, rest=None, root=None):
    """Load a dump into an empty project and move the identity sequences past the loaded rows."""
    from_dir = os.path.abspath(from_dir)
    rest = rest or _rest(root or DEFAULT_ROOT)
    counts = {}
    try:
        held = {t: n for t, _, _ in reversed(DUMP_TABLES) if (n := _count(rest, t))}
        if held and not wipe:
            raise Refused("the project holds rows (" + ", ".join(f"{t} {n}" for t, n in held.items()) + "), use --wipe to clear them")
        if held:
            if rest.get_all("documents", {"select": "name", "name": "eq.cutover_done"}):
                raise Refused("cutover_done exists, --wipe refused")
            for t, order, _ in reversed(DUMP_TABLES):
                if t in held:
                    rest.delete(t, {order: "not.is.null"})
        for table, order, ident in DUMP_TABLES:
            path = os.path.join(from_dir, table + ".jsonl")
            rows = [r for r in rows_of(path) if isinstance(r, dict)] if os.path.exists(path) else []
            rest.insert(table, rows)
            counts[table] = len(rows)
            if ident:
                rest.rpc("reset_identity", {"tbl": table, "col": ident})
    except store.RestError as e:
        raise Refused(f"restore stopped: {e}")
    print("restore: " + ", ".join(f"{t} {n}" for t, n in counts.items()))
    return counts


# ---- command line -------------------------------------------------------------------------------

# ---- Supabase: reading what the worker built ---------------------------------------------------

BUCKET = "web"
# what each analysis script reads: files of the bucket under built/, documents, and the usage table
RUN_NEEDS = {"evaluate": {"built": ("trip.db",), "docs": ("scenarios.json", "bag_rules.json")},
             "frontier": {"built": ("trip.db",), "docs": ("trip.json",)},
             "scenarios": {"built": ("trip.db",), "docs": ("trip.json",)},
             "usage_report": {"usage": True},
             "report_md": {"built": ("routes.json",), "docs": ("trip.json",)}}


def _bucket_path(name):
    """places.json is a web file, built/routes.json is a built one."""
    name = name.strip().lstrip("/")
    if not name or ".." in name.split("/"):
        raise Refused("file needs a name, for example places.json or built/routes.json")
    return name if name.startswith(("built/", "data/web/")) else "data/web/" + name


def _fetch(rest, path, shown=None):
    try:
        return rest.storage_get(BUCKET, path)
    except RestError as e:
        raise Refused(f"no file {shown or path} in the bucket ({e})")


def cmd_file(name, rest=None, root=None, out=None):
    """Print one file from the bucket. Text goes to stdout as it is, a binary file such as trip.db as bytes."""
    rest = rest or _rest(root or DEFAULT_ROOT)
    data = _fetch(rest, _bucket_path(name), name)
    out = out or sys.stdout
    try:
        out.write(data.decode("utf-8"))
    except UnicodeDecodeError:
        getattr(out, "buffer", out).write(data)
    return 0


def cmd_run(script, args=(), rest=None, root=None, keep=None):
    """Fetch the derived files a script needs into a temp folder and run the script from the pipeline on it, unchanged."""
    script = (script or "").removesuffix(".py")
    if script not in RUN_NEEDS:
        raise Refused(f"run knows {', '.join(sorted(RUN_NEEDS))}, not {script!r}")
    rest = rest or _rest(root or DEFAULT_ROOT)
    need = RUN_NEEDS[script]
    tmp = keep or tempfile.mkdtemp(prefix="tripdb-run-")
    try:
        built, src = os.path.join(tmp, "data", "built"), os.path.join(tmp, "data", "sources")
        os.makedirs(built, exist_ok=True)
        os.makedirs(src, exist_ok=True)
        for fname in need.get("built", ()):
            with open(os.path.join(built, fname), "wb") as fh:
                fh.write(_fetch(rest, "built/" + fname))
        try:
            if need.get("docs"):
                got = {d["name"] for d in _pull_docs(rest, src, only=set(need["docs"]))}
                missing = [d for d in need["docs"] if d not in got and d != "bag_rules.json"]
                if missing:
                    raise Refused("the project has no document " + ", ".join(missing))
            if need.get("usage"):
                _pull_usage(rest, src)
        except RestError as e:
            raise Refused(f"run stopped: {e}")
        proc = subprocess.run([sys.executable, "-I", "-X", "utf8", os.path.join(PIPELINE, script + ".py"), "--root", tmp, *args],
                              capture_output=True)
        sys.stdout.write(proc.stdout.decode("utf-8", "replace"))
        sys.stderr.write(proc.stderr.decode("utf-8", "replace"))
        return proc.returncode
    finally:
        if keep is None:
            shutil.rmtree(tmp, ignore_errors=True)


def _git_sha(root):
    try:
        out = subprocess.run(["git", "-C", root, "rev-parse", "--short=7", "HEAD"], capture_output=True, text=True, timeout=20)
        return out.stdout.strip() or "unknown"
    except (OSError, subprocess.SubprocessError):
        return "unknown"


def cmd_status(rest=None, root=None):
    """derive_state, so a session can see whether its data has reached the app, and the worker next to the local code."""
    root = root or DEFAULT_ROOT
    rest = rest or _rest(root)
    try:
        rows = rest.get_all("derive_state", {"select": "*", "id": "eq.1"})
    except RestError as e:
        raise Refused(f"status stopped: {e}")
    state = rows[0] if rows else {}
    for k, v in state.items():
        print(f"{k}: {v if v is not None else 'none'}")
    local = _git_sha(root)
    worker = state.get("worker_version")
    print(f"local_sha: {local}")
    if worker and local != "unknown" and worker != local:
        print("The worker runs other code than this checkout. bash infra/deploy.sh brings it up to date.")
    return 0


def token_hash(token):
    """What inbox_tokens stores and submit_inbox compares: the SHA-256 of the token as UTF-8, in lower case hex."""
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def cmd_inbox_token(name, rest=None, root=None, out=None):
    """A new token for the userscript. It is printed once and only its hash is kept, so a lost token is replaced, not read.
    Running it again with the same name replaces the token."""
    if not name or not re.fullmatch(r"[A-Za-z0-9._-]{1,40}", name):
        raise Refused("inbox-token needs --name with letters, digits, dot, dash or underscore")
    rest = rest or _rest(root or DEFAULT_ROOT)
    token = "mmk_" + secrets.token_urlsafe(32)
    try:
        rest.insert("inbox_tokens", [{"name": name, "token_hash": token_hash(token)}], on_conflict="name", resolution="merge-duplicates")
    except RestError as e:
        raise Refused(f"inbox-token stopped: {e}")
    (out or sys.stdout).write(token + chr(10))
    return 0


def _opt(a, name, default=None):
    if name in a:
        i = a.index(name)
        if i + 1 >= len(a):
            raise Refused(f"{name} needs a value")
        v = a[i + 1]
        del a[i:i + 2]
        return v
    return default


def _flag(a, name):
    if name in a:
        a.remove(name)
        return True
    return False


def main(argv=None):
    a = list(sys.argv[1:] if argv is None else argv)
    try:
        paths = Paths(_opt(a, "--root", DEFAULT_ROOT))
        if not a or a[0] in ("-h", "--help", "help"):
            print(__doc__)
            return 0
        cmd, a = a[0], a[1:]
        if cmd == "add-quotes":
            name = _opt(a, "--name")
            return cmd_add_quotes(paths, a[0], name)
        if cmd in ("add-place", "add-connection", "add-profile", "add-image"):
            origin, replace = _opt(a, "--origin"), _flag(a, "--replace")
            if cmd == "add-place": return cmd_add_place(paths, a[0], origin)
            if cmd == "add-connection": return cmd_add_connection(paths, a[0], origin)
            if cmd == "add-profile": return cmd_add_profile(paths, a[0], origin, replace)
            return cmd_add_image(paths, a[0], origin, replace)
        if cmd == "add-experience":
            return cmd_add_experience(paths, a[0])
        if cmd == "update-experience":
            sets = []
            while "--set" in a:
                sets.append(_opt(a, "--set"))
            return cmd_update_experience(paths, a[0], sets, _opt(a, "--json"))
        if cmd == "add-experience-image":
            replace = _flag(a, "--replace")
            return cmd_add_experience_image(paths, a[0], replace)
        if cmd == "add-stays":
            usd, eur = float(_opt(a, "--usd", 6.45)), float(_opt(a, "--eur", 7.46))
            return cmd_add_stays(paths, a[0], usd, eur)
        if cmd == "list-add":
            note, name = _opt(a, "--note"), _opt(a, "--name")
            return cmd_list_add(paths, a[0], a[1], a[2], note, name)
        if cmd == "list-remove":
            return cmd_list_remove(paths, a[0], a[1], a[2])
        if cmd == "save-trip":
            by = _opt(a, "--by", "plan-trip")
            return cmd_save_trip(paths, a[0], by)
        if cmd == "delete-trip":
            if not a:
                raise Refused("delete-trip needs at least one trip id")
            return cmd_delete_trip(paths, a)
        if cmd == "query":
            multi = {}
            for flag in ("--eq", "--in", "--gte"):
                multi[flag] = []
                while flag in a:
                    multi[flag].append(_opt(a, flag))
            sel, lim = _opt(a, "--select"), _opt(a, "--limit")
            if len(a) != 1:
                raise Refused("query needs a table name")
            return cmd_query(paths, a[0], multi["--eq"], multi["--in"], multi["--gte"], sel, lim)
        if cmd == "doc-get":
            return cmd_doc_get(paths, a[0], a[1] if len(a) > 1 else "-")
        if cmd == "doc-put":
            return cmd_doc_put(paths, a[0], a[1])
        if cmd == "log-task":
            issue = _opt(a, "--issue")
            if not issue or not issue.isdigit():
                raise Refused("--issue N is required")
            outputs = [x for x in (_opt(a, "--outputs", "") or "").split(",") if x]
            return cmd_log_task(paths, int(issue), _opt(a, "--type"), _opt(a, "--summary", ""), outputs,
                                _opt(a, "--task"), _opt(a, "--done-at"))
        if cmd == "log-usage":
            return cmd_log_usage(paths, {c: _opt(a, "--" + c.replace("_", "-")) for c in USAGE_COLS})
        if cmd == "ingest-inbox":
            return cmd_ingest_inbox(paths)
        if cmd == "check":
            return cmd_check(paths)
        if cmd == "way-map":
            o, n = _opt(a, "--old"), _opt(a, "--new")
            if not o or not n:
                raise Refused("way-map needs --old and --new")
            return cmd_way_map(paths, o, n)
        if cmd == "import":
            wipe, src = _flag(a, "--wipe"), _opt(a, "--from")
            if not src:
                raise Refused("import needs --from DIR")
            cmd_import(src, wipe)
            return 0
        if cmd == "cutover-done":
            cmd_cutover_done(root=paths.root)
            return 0
        if cmd == "dump":
            dest = _opt(a, "--to")
            if not dest:
                raise Refused("dump needs --to DIR")
            cmd_dump(dest, root=paths.root)
            return 0
        if cmd == "restore":
            wipe, src = _flag(a, "--wipe"), _opt(a, "--from")
            if not src:
                raise Refused("restore needs --from DIR")
            cmd_restore(src, wipe, root=paths.root)
            return 0
        if cmd == "pull":
            dest = _opt(a, "--to")
            if not dest:
                raise Refused("pull needs --to DIR")
            return cmd_pull(dest, root=paths.root)
        if cmd == "file":
            if len(a) != 1:
                raise Refused("file needs one name")
            return cmd_file(a[0], root=paths.root)
        if cmd == "run":
            if not a:
                raise Refused("run needs a script name")
            return cmd_run(a[0], a[1:], root=paths.root)
        if cmd == "inbox-token":
            return cmd_inbox_token(_opt(a, "--name"), root=paths.root)
        if cmd == "status":
            return cmd_status(root=paths.root)
        if cmd == "build":
            fetch, nosync = _flag(a, "--fetch-elevation"), _flag(a, "--no-sync")
            return cmd_build(paths, fetch, not nosync)
        raise Refused(f"unknown command {cmd!r}, see --help")
    except Refused as e:
        print(f"tripdb: {e}", file=sys.stderr)
        return 2
    except IndexError:
        print("tripdb: missing argument, see --help", file=sys.stderr)
        return 2


if __name__ == "__main__":
    sys.exit(main())
