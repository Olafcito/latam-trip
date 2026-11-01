"""The tools of the latam-trip connector, with no network code of their own.

TYPES is one table of the things Claude may read and write: trips, flights, connections, stays, experiences, places and
tasks. List, get, add, update and delete tools are made from it, five per type, and add takes a batch. set_leg_date and
shift_leg write the dates of a trip's legs by the rules of planner/src/lib/journey.ts.

CRUD only. A tool reads what is stored and writes it through the tripdb store, so every write passes the same checks as
the plugin's own commands. Nothing here searches the web.
"""
import copy, datetime as dt, hashlib, json, math, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.normpath(os.path.join(HERE, "..", "plugin", "scripts"))
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)

import tripdb  # noqa: E402
import tripdb_cols as cols  # noqa: E402
from tripdb_store import Refused  # noqa: E402

TRASH = "mcp_trash.json"
LIMIT = 50
MAX_LIMIT = 500


class T:
    """One type. table is the tripdb table, schema the tripdb schema its rows are checked against, auto the fields the
    connector fills in itself, and label what the tools call one of them."""

    def __init__(self, name, table, schema, auto=(), label=None, keys=None, note=""):
        self.name, self.table, self.schema, self.auto = name, table, schema, set(auto)
        self.label, self.keys, self.note = label or name, keys, note


TYPES = {
    "trip": T("trip", "trips", tripdb.TRIP, auto=("version", "saved_at", "by"), keys=("id",),
              note="A trip is saved as versions. An update or a date change makes a new version and keeps the old ones."),
    "flight": T("flight", "quotes", None, label="flight", keys=("quote_id",),
                note="A flight needs only from, to, date and price in DKK. It is stored as a chat quote with source chat."),
    "connection": T("connection", "connections", tripdb.EDGE, auto=("kind", "origin"), label="connection",
                    keys=("from", "to", "mode", "operator"), note="A bus, boat, train or other way between two places, or a flight edge."),
    "stay": T("stay", "stays", tripdb.STAY, auto=("kind",), keys=("place", "site", "name", "room", "check_in", "check_out")),
    "experience": T("experience", "experiences", tripdb.EXPERIENCE, auto=("kind",), keys=("id",)),
    "place": T("place", "places", tripdb.NODE, auto=("kind", "origin"), keys=("id",)),
    "task": T("task", "tasks", None, keys=("id",), note="A task for the agents. Tasks live in the project database only."),
}

TASK_FIELDS = {"title": "!str", "type": "str", "status": "enum:open,working,done,failed", "trip_id": "str",
               "trip_version": "int", "result": "str", "data": "dict"}
CHAT_FLIGHT = {"from": "!iata", "to": "!iata", "date": "!date", "price": "!num", "dep": "time", "arr": "time", "hours": "num",
               "stops": "int", "via": "list", "carriers": "list", "flights": "list", "link": "str", "notes": "str"}
HINTS = {"iata": "3 capital letters, like SJO", "pid": "capital letters and digits, like SJO or LCORN",
         "slug": "lowercase letters, digits, - and _", "cc": "2 capital letters, like CR", "tid": "letters, digits, - and _",
         "date": "YYYY-MM-DD", "time": "YYYY-MM-DD or YYYY-MM-DDTHH:MM"}
JSON_OF = {"str": "string", "iata": "string", "pid": "string", "slug": "string", "cc": "string", "tid": "string",
           "date": "string", "time": "string", "int": "integer", "num": "number", "bool": "boolean", "list": "array",
           "dict": "object"}


def properties_of(schema, skip=()):
    """(properties, required) of a JSON schema for the fields of a tripdb schema, so a client knows what to send."""
    props, required = {}, []
    for field, spec in schema.items():
        if field in skip:
            continue
        req = spec.startswith("!")
        types = spec.lstrip("!").split("|")
        if any(t.startswith("const:") for t in types):
            continue
        kinds, hint, enum = [], [], None
        for t in types:
            if t == "null":
                continue
            if t.startswith("enum:"):
                enum = t[5:].split(",")
                kinds.append("string")
            elif t in JSON_OF:
                kinds.append(JSON_OF[t])
                if t in HINTS:
                    hint.append(HINTS[t])
        kinds = sorted(set(kinds)) or ["string"]
        p = {"type": kinds[0] if len(kinds) == 1 else kinds}
        if enum:
            p["enum"] = enum
        if hint:
            p["description"] = "; ".join(dict.fromkeys(hint))
        props[field] = p
        if req:
            required.append(field)
    return props, required


# ---- dates, ported from planner/src/lib/journey.ts -----------------------------------------------------------

def add_days(day, n):
    return (dt.date.fromisoformat(day[:10]) + dt.timedelta(days=n)).isoformat()


def day_diff(a, b):
    return (dt.date.fromisoformat(b[:10]) - dt.date.fromisoformat(a[:10])).days


def before(a, b):
    """a before b. A date alone is only before a later day, never before a time on its own day."""
    return a[:10] < b[:10] if len(a) == 10 or len(b) == 10 else a < b


def dated(h):
    """When a hop leaves and arrives, if it is dated: a date set on it, else its picked flight."""
    f = h.get("flight")
    if h.get("date"):
        if f and f["depart"][:10] == h["date"]:
            return f["depart"], f["arrive"]
        span = day_diff(f["depart"], f["arrive"]) if f else (1 if h.get("overnight") else 0)
        return h["date"], add_days(h["date"], span)
    return (f["depart"], f["arrive"]) if f else None


def leg_day(h, estimate):
    """The day a hop leaves: the day set on it, else its picked flight's, else the estimate."""
    f = h.get("flight")
    return h.get("date") or (f["depart"][:10] if f else None) or estimate


def flight_off_day(h):
    """The day the picked flight really leaves, when the leg has been put on another day."""
    f = h.get("flight")
    flown = f["depart"][:10] if f else None
    return flown if flown and h.get("date") and flown != h["date"] else None


def schedule(trip, names=lambda n: n):
    """The days of a trip: per place inDay, outDay and days, plus the warnings. Floating legs share the days between the
    dated legs around them."""
    wi, wh, P = trip["way_in"], trip["way_home"], trip["places"]
    first = wi["arrive"][:10]
    pl = [{"node": p["node"], "days": 0, "inDay": first, "outDay": first} for p in P]
    warnings = []
    st = {"since": wi["arrive"], "start": 0}

    def share(end, until, leg):
        start, since = st["start"], st["since"]
        n = end - start + 1
        days = day_diff(since, until)
        if before(until, since):
            where = "there" if start == end else f"to {names(pl[start]['node'])}"
            warnings.append({"leg": leg, "text": f"The leg on from {names(pl[end]['node'])} leaves {until}, before you get {where} {since}"})
        at = since[:10]
        for k in range(start, end + 1):
            pl[k]["days"] = max(0, days // n + (int(math.fmod(days, n)) if k == start else 0))
            pl[k]["inDay"] = at
            at = add_days(at, pl[k]["days"])
            pl[k]["outDay"] = at

    for i, p in enumerate(P):
        h = p.get("hop")
        t = dated(h) if i > 0 and h else None
        if not t:
            continue
        share(i - 1, t[0], i)
        if before(wh["depart"], t[1]):
            f = h.get("flight")
            by = f"The flight to {names(p['node'])} lands" if f and t[0] == f["depart"] else f"The leg to {names(p['node'])} gets there"
            warnings.append({"leg": i, "text": f"{by} after the flight home leaves"})
        st["since"], st["start"] = t[1], i
    if pl:
        share(len(pl) - 1, wh["depart"], None)
    return {"places": pl, "warnings": warnings}


def floats(h):
    return bool(h) and not h.get("date") and not h.get("flight")


def now_hhmm():
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def haversine_km(a, b):
    r = 6371.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(x))


def pair_key(r, keys):
    return tuple(r.get(k) for k in keys)


class Core:
    def __init__(self, store, now=None):
        self.store = store
        self.now = now or now_hhmm

    # ---- the tools --------------------------------------------------------------------------------------------

    def tool_specs(self):
        """Every tool as {name, description, schema, fn}. A client reads the schema to know which fields to send."""
        specs = []
        for t in TYPES.values():
            props, required = self.fields_of(t)
            row = {"type": "object", "properties": props, "required": required}
            label = t.label
            note = (" " + t.note) if t.note else ""
            specs += [
                {"name": f"list_{t.name}", "description": f"List the stored {label}s that match the where fields, {LIMIT} at a time. "
                 f"Give where {{\"trashed\": true}} to list the {label}s that were deleted and can be restored.{note}",
                 "schema": {"type": "object", "properties": {
                     "where": {"type": "object", "description": f"Fields a {label} must have, for example {{{self.example_where(t)}}}"},
                     "limit": {"type": "integer", "minimum": 1, "maximum": MAX_LIMIT}}},
                 "fn": (lambda t=t: lambda where=None, limit=LIMIT: self.list(t.name, where, limit))()},
                {"name": f"get_{t.name}", "description": f"Get one {label} by id, in full.",
                 "schema": {"type": "object", "properties": {"id": {"type": "string"}}, "required": ["id"]},
                 "fn": (lambda t=t: lambda id: self.get(t.name, id))()},
                {"name": f"add_{t.name}", "description": f"Add one or more {label}s in one call. A row that fails the checks is refused "
                 f"by its row number and the other rows are still saved.{note}",
                 "schema": {"type": "object", "properties": {"rows": {"type": "array", "minItems": 1, "items": row}}, "required": ["rows"]},
                 "fn": (lambda t=t: lambda rows: self.add(t.name, rows))()},
                {"name": f"update_{t.name}", "description": f"Change fields of one {label}. Give the fields to change in patch. "
                 f"Give restore true instead to undo the last delete or change of that {label}.",
                 "schema": {"type": "object", "properties": {"id": {"type": "string"},
                                                              "patch": {"type": "object", "properties": props},
                                                              "restore": {"type": "boolean"}}, "required": ["id"]},
                 "fn": (lambda t=t: lambda id, patch=None, restore=False: self.update(t.name, id, patch, restore))()},
                {"name": f"delete_{t.name}", "description": f"Delete one {label}. The delete is soft, update_{t.name} with restore true brings it back.",
                 "schema": {"type": "object", "properties": {"id": {"type": "string"}}, "required": ["id"]},
                 "fn": (lambda t=t: lambda id: self.delete(t.name, id))()},
            ]
        leg = {"description": "The leg to change: the number of the place it arrives at (the first place has no leg), or that place's id.",
               "type": ["integer", "string"]}
        specs += [
            {"name": "set_leg_date", "description": "Put one leg of a trip on a day. No other leg moves, the leg keeps its picked flight, and the nights "
             "either side follow from the dates. A clash is saved as it is and named in the reply, and so is a flight on another day than the leg.",
             "schema": {"type": "object", "properties": {"trip_id": {"type": "string"}, "leg": leg, "date": {"type": "string", "description": HINTS["date"]}},
                        "required": ["trip_id", "leg", "date"]},
             "fn": lambda trip_id, leg, date: self.set_leg_date(trip_id, leg, date)},
            {"name": "shift_leg", "description": "Move one leg of a trip and every later leg by the same number of days, earlier or later. "
             "Earlier legs never change. A clash is saved as it is and named in the reply.",
             "schema": {"type": "object", "properties": {"trip_id": {"type": "string"}, "leg": leg, "days": {"type": "integer"}},
                        "required": ["trip_id", "leg", "days"]},
             "fn": lambda trip_id, leg, days: self.shift_leg(trip_id, leg, days)},
        ]
        return specs

    def call(self, name, args=None):
        for s in self.tool_specs():
            if s["name"] == name:
                return s["fn"](**(args or {}))
        raise Refused(f"no tool {name}")

    def fields_of(self, t):
        if t.name == "flight":
            return properties_of(CHAT_FLIGHT)
        if t.name == "task":
            return properties_of(TASK_FIELDS)
        return properties_of(t.schema, skip=t.auto | {"kind"})

    @staticmethod
    def example_where(t):
        return {"trip": '"name": "Costa Rica"', "flight": '"from": "SJO", "to": "LIR"', "connection": '"from": "SJO", "mode": "bus"',
                "stay": '"place": "LCORN"', "experience": '"category": "nature"', "place": '"country": "CR"',
                "task": '"status": "open"'}[t.name]

    # ---- what is stored ---------------------------------------------------------------------------------------

    def pairs(self, tname, where=None):
        """[(id, record)] of a type, the later row winning where one was written over another."""
        t = TYPES[tname]
        if tname == "trip":
            return [(r["id"], r) for r in self.store.trips()]
        if tname == "flight":
            eq = []
            w = where or {}
            if w.get("from"):
                eq.append("first_from=" + str(w["from"]))
            if w.get("to"):
                eq.append("first_to=" + str(w["to"]))
            if w.get("id"):
                eq.append("quote_id=" + str(w["id"]))
            return [(r["quote_id"], cols.from_row("quotes", r)) for r in self.store.query("quotes", eq=eq)]
        if tname == "task":
            return [(str(r["id"]), r) for r in self.store.query("tasks")]
        out = {}
        for r in self.store.rows(t.table):
            out[self.ident(tname, r)] = r
        return list(out.items())

    @staticmethod
    def ident(tname, r):
        if tname in ("trip", "place", "experience"):
            return r["id"]
        if tname == "connection":
            return f"{r['from']}>{r['to']}:{r['mode']}" + (f":{r['operator']}" if r.get("operator") else "")
        if tname == "stay":
            return "stay-" + hashlib.sha1("|".join(str(r.get(k)) for k in TYPES["stay"].keys).encode()).hexdigest()[:10]
        raise Refused(f"no id for {tname}")

    def find(self, tname, id):
        for i, r in self.pairs(tname, {"id": id} if tname == "flight" else None):
            if i == str(id):
                return i, r
        raise Refused(f"no {TYPES[tname].label} {id!r}")

    @staticmethod
    def shown(tname, id, r):
        return r if tname in ("trip", "task") else {"id": id, **r}

    @staticmethod
    def brief(tname, id, r):
        if tname == "trip":
            return {"id": id, "version": r["version"], "name": r["name"], "why": r["why"], "saved_at": r["saved_at"],
                    "places": [p["node"] for p in r["places"]]}
        if tname == "flight":
            leg = r["legs_requested"][0]
            return {"id": id, "from": leg["from"], "to": leg["to"], "date": leg["date"], "price_dkk": r["price_dkk"],
                    "source": r["source"], "dep": (r["out"] or {}).get("dep"), "carriers": (r["out"] or {}).get("carriers")}
        return Core.shown(tname, id, r)

    @staticmethod
    def matches(tname, r, where):
        for k, v in (where or {}).items():
            if tname == "flight" and k in ("from", "to", "date"):
                if r["legs_requested"][0].get(k) != v:
                    return False
            elif r.get(k) != v:
                return False
        return True

    def list(self, tname, where=None, limit=LIMIT):
        where = dict(where or {})
        limit = max(1, min(int(limit or LIMIT), MAX_LIMIT))
        if where.pop("trashed", False):
            rows = [e for e in self.trash() if e["type"] == tname]
            return {"count": len(rows), "rows": rows[:limit]}
        rows = [(i, r) for i, r in self.pairs(tname, where) if self.matches(tname, r, where)]
        return {"count": len(rows), "rows": [self.brief(tname, i, r) for i, r in rows[:limit]]}

    def get(self, tname, id):
        i, r = self.find(tname, id)
        return self.shown(tname, i, r)

    # ---- add --------------------------------------------------------------------------------------------------

    def add(self, tname, rows):
        if not isinstance(rows, list) or not rows:
            raise Refused("rows must be a list with at least one row")
        good, nums, refused = [], [], []
        for n, row in enumerate(rows, 1):
            try:
                r, errs = self.prepare(tname, row)
            except Refused as e:
                r, errs = None, [str(e)]
            if errs:
                refused.append({"row": n, "why": "; ".join(errs)})
            else:
                good.append(r)
                nums.append(n)
        added, skipped = self.write(tname, good, nums, refused)
        return {"added": added, "skipped": skipped, "refused": sorted(refused, key=lambda x: x["row"])}

    def prepare(self, tname, row):
        """(row ready to store, reasons to refuse)."""
        if not isinstance(row, dict):
            return None, ["row is not a JSON object"]
        t = TYPES[tname]
        if tname == "flight":
            return self.chat_flight(row)
        if tname == "task":
            errs = tripdb.check_fields(row, TASK_FIELDS)
            return ({"status": "open", **row}, errs)
        r = dict(row)
        if tname == "trip":
            r = self.new_trip(r)
        else:
            if tname != "experience" or "kind" not in r:
                r["kind"] = {"place": "node", "connection": "edge", "stay": "stay_quote", "experience": "experience"}[tname]
            if "origin" in t.auto:
                r.setdefault("origin", "chat")
        errs = tripdb.row_errors(t.table, r)
        if not errs:
            errs = self.extra_checks(tname, r)
        return r, errs

    def extra_checks(self, tname, r):
        known = self.store.ids("places")
        if tname == "connection":
            return [f"place {p} is not in the places" for p in (r["from"], r["to"]) if p not in known]
        if tname == "stay":
            return [] if r["place"] in known else [f"place {r['place']} is not in the places"]
        if tname == "experience":
            return tripdb._experience_check(self.store)(r)
        return []

    def new_trip(self, r):
        r = dict(r)
        if not r.get("id"):
            base = tripdb._trip_slug(r.get("name"))
            ids, r["id"], k = self.store.trip_ids(), base, 2
            while r["id"] in ids:
                r["id"], k = f"{base}-{k}", k + 1
        r["version"] = 1
        r["saved_at"] = self.now()
        r["by"] = r.get("by") or "plan-trip"
        return r

    def write(self, tname, good, nums, refused):
        t = TYPES[tname]
        if not good:
            return [], []
        if tname == "trip":
            added, skipped = [], []
            for n, r in zip(nums, good):
                try:
                    res = self.store.save_trip(r)
                except Refused as e:
                    refused.append({"row": n, "why": str(e)})
                    continue
                (skipped if res["skipped"] else added).append(res["id"] if not res["skipped"] else {"row": n, "why": f"same as version {res['version']}"})
            return added, skipped
        if tname == "task":
            self.need_project()
            got = self.store.rest.insert("tasks", good, returning="id")
            return [str(g["id"]) for g in got], []
        if tname == "flight":
            res = self.store.add_quotes(good, "chat.jsonl")
            ids = [cols.qr.quote_id(q) for q in good]
            return ids, ([{"row": nums[0], "why": "stored already"}] if res.duplicates and len(good) == 1 else [])
        res = self.store.add(t.table, good, cols.COLS[t.table].key)
        skip_at = {i for i, _, _ in res.skips}
        added = [self.ident(tname, r) for i, r in enumerate(good) if i not in skip_at]
        return added, [{"row": nums[i], "why": f"{self.ident(tname, good[i])} is stored already ({why})"} for i, _, why in res.skips]

    def need_project(self):
        if getattr(self.store, "kind", "") != "supabase":
            raise Refused("tasks are kept in the project database only")

    # ---- chat flights -----------------------------------------------------------------------------------------

    def chat_flight(self, r):
        errs = [f"missing {k}" for k in ("from", "to", "date", "price") if r.get(k) in (None, "")]
        if errs:
            return None, errs
        bad = tripdb.check_fields(r, CHAT_FLIGHT)
        if bad:
            return None, bad
        hours = r.get("hours") if r.get("hours") is not None else self.flight_hours(r["from"], r["to"])
        notes = "site=chat" + (f"; {r['notes']}" if r.get("notes") else "")
        q = {"agent": "chat", "task_id": None, "source": "chat", "observed_at": self.now(), "structure": "one_way",
             "legs_requested": [{"from": r["from"], "to": r["to"], "date": r["date"]}], "rank": None, "price": r["price"],
             "currency": "DKK", "price_dkk": r["price"], "tickets": 1, "self_transfer": False,
             "out": {"dep": r.get("dep"), "arr": r.get("arr"), "hours": hours, "stops": r.get("stops"), "via": r.get("via") or [],
                     "carriers": r.get("carriers") or [], "flights": r.get("flights") or []},
             "home": None, "mid": None, "link": r.get("link"), "flags": [], "notes": notes, "trip_name": "chat"}
        return q, tripdb.quote_errors(q)

    def flight_hours(self, a, b):
        """How long a flight takes when nobody said: the flight edge between the places if the map has one, else the distance."""
        places = {p.get("iata"): p for p in self.store.rows("places") if p.get("iata")}
        pa, pb = places.get(a), places.get(b)
        if pa and pb:
            for e in self.store.rows("connections"):
                if e.get("mode") == "flight" and {e["from"], e["to"]} == {pa["id"], pb["id"]} and e.get("duration_h"):
                    return e["duration_h"]
            km = haversine_km((pa["lat"], pa["lon"]), (pb["lat"], pb["lon"]))
            return round(0.75 + km / 700, 2)
        return 3.0

    # ---- update, delete, undo ---------------------------------------------------------------------------------

    def update(self, tname, id, patch=None, restore=False):
        if restore:
            return self.restore(tname, id)
        if not isinstance(patch, dict) or not patch:
            raise Refused("nothing to change, give patch with the fields to change")
        t = TYPES[tname]
        if tname == "trip":
            return self.update_trip(id, patch)
        i, old = self.find(tname, id)
        if tname == "flight":
            return self.update_flight(i, old, patch)
        if tname == "task":
            self.need_project()
            self.store.rest.patch("tasks", {"id": "eq." + i}, patch)
            return {"updated": i}
        if {"id", "kind"} & set(patch):
            raise Refused("id and kind cannot be changed")
        new = {**old, **patch}
        errs = tripdb.row_errors(t.table, new) or self.extra_checks(tname, new)
        if errs:
            raise Refused(f"{i}: " + "; ".join(errs))
        self.keep(tname, i, [old], "update")
        if t.table in ("places", "experiences"):
            self.store.update(t.table, i, patch, None)
        else:
            self.store.remove(t.table, {k: old.get(k) for k in t.keys})
            self.store.add(t.table, [new], cols.COLS[t.table].key)
        return {"updated": self.ident(tname, new)}

    def update_trip(self, id, patch):
        _, old = self.find("trip", id)
        if {"id", "version", "saved_at"} & set(patch):
            raise Refused("id, version and saved_at cannot be changed, a save makes the next version")
        new = {**copy.deepcopy(old), **patch}
        new["by"] = patch.get("by") or "plan-trip"
        return self.save_trip(new)

    def save_trip(self, t):
        errs = tripdb.row_errors("trips", t)
        if errs:
            raise Refused(f"{t['id']}: " + "; ".join(errs))
        res = self.store.save_trip(t)
        return {"id": res["id"], "version": res["version"], "skipped": bool(res["skipped"])}

    def update_flight(self, id, old, patch):
        flat = {"from": old["legs_requested"][0]["from"], "to": old["legs_requested"][0]["to"], "date": old["legs_requested"][0]["date"],
                "price": old["price_dkk"], **{k: v for k, v in (old["out"] or {}).items() if k in CHAT_FLIGHT}}
        flat["notes"] = old.get("notes")
        flat.update(patch)
        new, errs = self.chat_flight({k: v for k, v in flat.items() if v is not None})
        if errs:
            raise Refused(f"{id}: " + "; ".join(errs))
        self.keep("flight", id, [old], "update")
        self.store.remove("quotes", {"quote_id": id})
        self.store.add_quotes([new], "chat.jsonl")
        return {"updated": cols.qr.quote_id(new)}

    def delete(self, tname, id):
        t = TYPES[tname]
        if tname == "task":
            self.need_project()
            i, old = self.find("task", id)
            self.keep("task", i, [old], "delete")
            self.store.rest.delete("tasks", {"id": "eq." + i})
            return {"deleted": i}
        if tname == "trip":
            return self.delete_trip(id)
        i, old = self.find(tname, id)
        self.keep(tname, i, [old], "delete")
        try:
            if tname == "flight":
                self.store.remove("quotes", {"quote_id": i})
            else:
                self.store.remove(t.table, {k: old.get(k) for k in t.keys})
        except Refused:
            self.drop_last(tname, i)
            raise
        return {"deleted": i, "restore": f"update_{tname} with restore true"}

    def delete_trip(self, id):
        self.find("trip", id)
        versions = [r["data"] for r in self.store.query("trips", eq=["id=" + id])]
        self.keep("trip", id, versions, "delete")
        found = self.store.delete_trip({id})
        return {"deleted": id, "versions": found.get(id, 0), "restore": "update_trip with restore true"}

    def keep(self, tname, id, rows, action):
        """Put the rows a write is about to lose into the trash, so the write can be undone."""
        entry = {"type": tname, "id": id, "action": action, "deleted_at": self.now(), "rows": rows}
        self.edit_trash(lambda entries: entries.append(entry))

    def drop_last(self, tname, id):
        def drop(entries):
            for k in range(len(entries) - 1, -1, -1):
                if entries[k]["type"] == tname and entries[k]["id"] == id:
                    del entries[k]
                    return
        self.edit_trash(drop)

    def edit_trash(self, fn):
        for _ in range(6):
            data, version = self.store.doc(TRASH)
            data = data or {"entries": []}
            out = fn(data["entries"])
            if self.store.put_doc(TRASH, data, version):
                return out
        raise Refused("the trash is busy, try again")

    def trash(self):
        data, _ = self.store.doc(TRASH)
        return [{k: e[k] for k in ("type", "id", "action", "deleted_at")} for e in (data or {}).get("entries", [])]

    def restore(self, tname, id):
        t = TYPES[tname]
        picked = {}

        def take(entries):
            for k in range(len(entries) - 1, -1, -1):
                if entries[k]["type"] == tname and entries[k]["id"] == str(id):
                    picked.update(entries.pop(k))
                    return

        self.edit_trash(take)
        if not picked:
            raise Refused(f"nothing to restore for {t.label} {id!r}")
        rows, action = picked["rows"], picked["action"]
        if tname == "trip":
            if action == "delete":
                self.store.restore_trip(id, rows)
            else:
                self.store.save_trip(rows[-1])
        elif tname == "task":
            self.need_project()
            self.store.rest.insert("tasks", rows)
        elif tname == "flight":
            if action == "update":
                for q in self.pairs("flight", {"id": id}):
                    self.store.remove("quotes", {"quote_id": q[0]})
            self.store.add_quotes(rows, "chat.jsonl")
        else:
            if action == "update":
                self.store.remove(t.table, {k: self.find(tname, id)[1].get(k) for k in t.keys})
            self.store.add(t.table, rows, cols.COLS[t.table].key, replace=True)
        return {"restored": str(id), "action_undone": action}

    # ---- dates ------------------------------------------------------------------------------------------------

    def names(self):
        known = {p["id"]: p.get("name") or p["id"] for p in self.store.rows("places")}
        return lambda node: known.get(node, node)

    def leg_days(self, trip):
        """{leg number: the day it leaves} for the legs of a trip."""
        s = schedule(trip, self.names())
        return {k: leg_day(p["hop"], s["places"][k - 1]["outDay"]) for k, p in enumerate(trip["places"]) if k > 0 and p.get("hop")}

    def leg_number(self, trip, leg):
        P = trip["places"]
        if isinstance(leg, str) and not leg.strip().isdigit():
            hits = [k for k, p in enumerate(P) if k > 0 and p["node"] == leg]
            if not hits:
                raise Refused(f"no leg arrives at {leg}")
            return hits[0]
        k = int(leg)
        if not (1 <= k < len(P)) or not P[k].get("hop"):
            raise Refused(f"leg {leg} does not exist, legs are numbered 1 to {len(P) - 1} by the place they arrive at")
        return k

    def set_leg_date(self, trip_id, leg, date):
        if not isinstance(date, str) or not tripdb.DATE_RE.match(date) or not tripdb._valid_date(date):
            raise Refused(f"date {date!r} is not a day, expected YYYY-MM-DD")
        _, old = self.find("trip", trip_id)
        t = copy.deepcopy(old)
        k = self.leg_number(t, leg)
        self.pin(t)
        t["places"][k]["hop"]["date"] = date
        return self.saved_with_dates(t)

    def shift_leg(self, trip_id, leg, days):
        if isinstance(days, bool) or not isinstance(days, int):
            raise Refused("days must be a whole number")
        _, old = self.find("trip", trip_id)
        t = copy.deepcopy(old)
        k = self.leg_number(t, leg)
        s = schedule(t, self.names())
        P = t["places"]
        day_of = lambda m: leg_day(P[m]["hop"], s["places"][m - 1]["outDay"])
        moves = {m: add_days(day_of(m), days) for m in range(k, len(P))}
        m = k - 1
        while m >= 1 and floats(P[m].get("hop")):
            moves[m] = day_of(m)
            m -= 1
        for m, day in moves.items():
            P[m]["hop"]["date"] = day
        return self.saved_with_dates(t)

    def pin(self, t):
        """Every leg with no day and no flight on the day it shows, so a day set by hand on one leg moves no other."""
        s = schedule(t, self.names())
        for k, p in enumerate(t["places"]):
            if k > 0 and floats(p.get("hop")):
                p["hop"]["date"] = s["places"][k - 1]["outDay"]

    def saved_with_dates(self, t):
        t["by"] = "plan-trip"
        out = self.save_trip(t)
        names = self.names()
        s = schedule(t, names)
        out["legs"] = [{"leg": k, "place": names(p["node"]), "day": leg_day(p["hop"], s["places"][k - 1]["outDay"])}
                       for k, p in enumerate(t["places"]) if k > 0 and p.get("hop")]
        out["nights"] = [{"place": names(p["node"]), "nights": s["places"][k]["days"]} for k, p in enumerate(t["places"])]
        out["clashes"] = [w["text"] for w in s["warnings"]]
        out["flight_off_day"] = [{"leg": k, "place": names(p["node"]), "set_day": p["hop"]["date"], "flight_day": flight_off_day(p["hop"])}
                                 for k, p in enumerate(t["places"]) if k > 0 and p.get("hop") and flight_off_day(p["hop"])]
        return out
