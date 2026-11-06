"""The tools of the latam-trip connector, with no network code of their own.

TYPES is one table of the things Claude may read and write: trips, flights, connections, stays, experiences, places,
tasks, bookings and lodgings. List, get, add, update and delete tools are made from it, five per type, and add takes a
batch. add_lodging takes rooms nested under each lodging and prices under each room, add_lodging_price adds prices to
rooms that exist.
set_leg_date and shift_leg write the dates of a trip's legs by the rules of planner/src/lib/journey.ts, and never move a
booked leg. attach_booking_file and attach_booking_upload put a booking's files in the private bookings bucket.
claim_task, finish_task, fail_task, list_add and list_remove are the task runner's tools, with each task type's
contract in runner.py.

CRUD only. A tool reads what is stored and writes it through the tripdb store, so every write passes the same checks as
the plugin's own commands. Nothing here searches the web.
"""
import base64, binascii, copy, datetime as dt, hashlib, json, math, os, re, sys, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
SCRIPTS = os.path.normpath(os.path.join(HERE, "..", "plugin", "scripts"))
if SCRIPTS not in sys.path:
    sys.path.insert(0, SCRIPTS)

import tripdb  # noqa: E402
import tripdb_cols as cols  # noqa: E402
from tripdb_store import Refused  # noqa: E402
from latam_trip_mcp import runner  # noqa: E402

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
    "stay": T("stay", "stays", tripdb.STAY, auto=("kind",), keys=("place", "site", "name", "room", "check_in", "check_out"),
              note="The stays table is closed and holds old quotes. list_stay and get_stay still read them, add_stay, "
                   "update_stay and delete_stay are refused. Places to stay are lodgings, prices go in with add_lodging_price."),
    "experience": T("experience", "experiences", tripdb.EXPERIENCE, auto=("kind",), keys=("id",)),
    "place": T("place", "places", tripdb.NODE, auto=("kind", "origin"), keys=("id",)),
    "task": T("task", "tasks", None, keys=("id",), note="A task for the agents. Tasks live in the project database only."),
    "booking": T("booking", "bookings", tripdb.BOOKING, auto=("id", "created_at", "updated_at", "attachments", "owner_id"), keys=("id",),
                 note="A booking is a ticket or a bed that is paid for, kept in the project database only. Keep one row per leg: "
                      "a ticket covering several legs is one row per leg with the same reference and the same ticket value, its "
                      "price sits on the first row and the others carry 0. Call list_booking with from, to and day before adding, "
                      "so nothing is bought twice. list_booking also takes place, and leaves out cancelled bookings unless where "
                      "has status. delete_booking sets the status to cancelled and keeps the row. depart and arrive are local "
                      "clock times. A booked leg holds its day, set_leg_date, shift_leg and update_trip never move it, "
                      "and update_trip never drops it or changes its ends."),
    "lodging": T("lodging", "lodgings", tripdb.LODGING, auto=("id", "created_at", "updated_at", "owner_id"), keys=("id",),
                 note="A lodging is a place to stay, kept in the project database only. Add only places Simon asked for, a task that asks to find places to stay counting as him asking, "
                      "with photos, rating, distances and rooms. A place is complete only with its photos, every room and a price "
                      "for the trip's dates on each room, so whatever the add cannot get is read from the site at once with a "
                      "browser, by the add-lodging skill in the plugin, and a Booking.com or Airbnb place also queues a "
                      "stay_details task for it. "
                      "Call list_lodging with place first, so a place is not added twice. place_id is a place in the places, "
                      "and tags come from " + ", ".join(tripdb.LODGING_TAGS.split(",")) + ". "
                      "Rooms go in rooms under the lodging and each room's prices in its prices, and a lodging is saved whole "
                      "or not at all. A lodging with the name of one stored at that place is that one: its fields are kept, "
                      "the rooms and prices it lacks are added and the reply names it in skipped, so sending a row again "
                      "never stores it twice. A price is in DKK for the nights from check_in to check_out. list_lodging takes place, "
                      "and leaves out hidden lodgings unless where has hidden. update_lodging changes the lodging alone, "
                      "add_lodging_price adds prices to rooms that exist. delete_lodging hides the lodging and keeps it."),
}

# The private bucket for booking files and the types it takes, as supabase/migrations/0013_bookings.sql sets them.
BOOKING_BUCKET = "bookings"
BOOKING_FILE_TYPES = ("application/pdf", "image/jpeg", "image/png", "image/heic", "image/webp")
BOOKING_FILE_EXT = {**{t.split("/")[1]: t for t in BOOKING_FILE_TYPES}, "jpg": "image/jpeg"}
MAX_FILE_MB = 4  # a Lambda request takes 6 MB, and base64 adds a third
BOOKING_WHERE = {"from": "from_code", "to": "to_code", "place": "place_id"}  # the short names list_booking takes
BOOKING_TIME_RE = re.compile(r"\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2})?)?$")
BOOKING_COLUMNS = [k for k in tripdb.BOOKING if k not in ("id", "created_at", "updated_at", "attachments")]
LODGING_WHERE = {"place": "place_id"}  # the short name list_lodging takes
ROOM_AUTO = {"id", "lodging_id", "created_at", "updated_at"}  # a room's fields the connector fills in
# A lodging, room or price gets an id made from what it is, so the same row sent again names the same rows
LODGING_NS = uuid.uuid5(uuid.NAMESPACE_DNS, "lodgings.latam-trip")

TASK_FIELDS = {"title": "!str", "type": "str", "status": "enum:open,working,done,failed", "trip_id": "str",
               "trip_version": "int", "result": "str", "data": "dict"}
CHAT_FLIGHT = {"from": "!iata", "to": "!iata", "date": "!date", "price": "!num", "dep": "time", "arr": "time", "hours": "num",
               "stops": "int", "via": "list", "carriers": "list", "flights": "list", "link": "str", "notes": "str"}
HINTS = {"iata": "3 capital letters, like SJO", "pid": "capital letters and digits, like SJO or LCORN",
         "slug": "lowercase letters, digits, - and _", "cc": "2 capital letters, like CR", "tid": "letters, digits, - and _",
         "date": "YYYY-MM-DD", "time": "YYYY-MM-DDTHH:MM, a date alone is refused"}
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


def in_list(values):
    """A PostgREST in filter for the values, each quoted, so a comma or a bracket in one cannot break the list."""
    return "in.(" + ",".join('"' + str(v).replace("\\", "\\\\").replace('"', '\\"') + '"' for v in values) + ")"


def now_hhmm():
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def haversine_km(a, b):
    r = 6371.0
    p1, p2 = math.radians(a[0]), math.radians(b[0])
    dp, dl = p2 - p1, math.radians(b[1] - a[1])
    x = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(x))


def same_name(s):
    """A name as a match sees it, where case and runs of spaces do not count."""
    return " ".join(str(s).split()).casefold()


def stable_id(owner, *parts):
    """An id made from the owner and what the row is, so two people who add the same hostel get two ids."""
    return str(uuid.uuid5(LODGING_NS, "|".join((owner, *parts))))


def pair_key(r, keys):
    return tuple(r.get(k) for k in keys)


class Core:
    def __init__(self, store, now=None, owner=None):
        self.store = store
        self._owner = owner
        self.now = now or now_hhmm

    def owner(self):
        """Whose rows these tools read and write: the one the Core was made for, else the store's own (the admin)."""
        if self._owner is None:
            self._owner = self.store.owner()
        return self._owner

    def mine(self, params):
        """The params of a read with the owner filter added. The secret key sees every owner's rows, so it is named."""
        return {**params, "owner_id": "eq." + self.owner()}

    # ---- the tools --------------------------------------------------------------------------------------------

    def tool_specs(self):
        """Every tool as {name, description, schema, fn}. A client reads the schema to know which fields to send."""
        specs = []
        for t in TYPES.values():
            props, required = self.fields_of(t)
            row = {"type": "object", "properties": props, "required": required}
            patch_props = {k: v for k, v in props.items() if k != "rooms"}  # an update changes the lodging alone
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
                                                              "patch": {"type": "object", "properties": patch_props},
                                                              "restore": {"type": "boolean"}}, "required": ["id"]},
                 "fn": (lambda t=t: lambda id, patch=None, restore=False: self.update(t.name, id, patch, restore))()},
                {"name": f"delete_{t.name}", "description": f"Delete one {label}. The delete is soft, update_{t.name} with restore true brings it back.",
                 "schema": {"type": "object", "properties": {"id": {"type": "string"}}, "required": ["id"]},
                 "fn": (lambda t=t: lambda id: self.delete(t.name, id))()},
            ]
        price_props, price_required = properties_of(tripdb.LODGING_PRICE, skip={"id"})
        price_row = {"type": "object", "properties": price_props, "required": price_required}
        leg = {"description": "The leg to change: the number of the place it arrives at (the first place has no leg), or that place's id.",
               "type": ["integer", "string"]}
        specs += [
            {"name": "set_leg_date", "description": "Put one leg of a trip on a day. No other leg moves, the leg keeps its picked flight, and the nights "
             "either side follow from the dates. A clash is saved as it is and named in the reply, and so is a flight on another day than the leg. "
             "A booked leg is refused, change its booking first.",
             "schema": {"type": "object", "properties": {"trip_id": {"type": "string"}, "leg": leg, "date": {"type": "string", "description": HINTS["date"]}},
                        "required": ["trip_id", "leg", "date"]},
             "fn": lambda trip_id, leg, date: self.set_leg_date(trip_id, leg, date)},
            {"name": "shift_leg", "description": "Move one leg of a trip and every later leg by the same number of days, earlier or later. "
             "Earlier legs never change. The move stops at the first booked leg after this one: it and every leg after it keep their days, and "
             "the reply names it in held. A booked leg itself is refused. A clash is saved as it is and named in the reply.",
             "schema": {"type": "object", "properties": {"trip_id": {"type": "string"}, "leg": leg, "days": {"type": "integer"}},
                        "required": ["trip_id", "leg", "days"]},
             "fn": lambda trip_id, leg, days: self.shift_leg(trip_id, leg, days)},
            {"name": "attach_booking_file", "description": f"Attach a file Claude has, such as a PDF from a mail, to a booking. "
             f"Up to {MAX_FILE_MB} MB of file, sent as base64. The name's ending gives the type, a PDF or a photo. A file with the "
             f"same name is replaced. Use attach_booking_upload for a larger file.",
             "schema": {"type": "object", "properties": {
                 "id": {"type": "string", "description": "the booking's id"},
                 "name": {"type": "string", "description": "the file name, ending in " + ", ".join("." + e for e in sorted(BOOKING_FILE_EXT))},
                 "content_base64": {"type": "string"}}, "required": ["id", "name", "content_base64"]},
             "fn": lambda id, name, content_base64: self.attach_booking_file(id, name, content_base64)},
            {"name": "attach_booking_upload", "description": "Get a signed upload URL for a booking's file, valid for 2 hours, "
             "and add the file to the booking. PUT the file's bytes to the URL with its type as Content-Type. A file with the same "
             "name is replaced. Type is a PDF or a photo. The entry's size stays null until the upload is confirmed, so an "
             "attachment with size null may not be in the bucket yet.",
             "schema": {"type": "object", "properties": {
                 "id": {"type": "string", "description": "the booking's id"},
                 "name": {"type": "string", "description": "the file name, like ticket.pdf"},
                 "type": {"type": "string", "enum": list(BOOKING_FILE_TYPES)}}, "required": ["id", "name", "type"]},
             "fn": lambda id, name, type: self.attach_booking_upload(id, name, type)},
            {"name": "add_lodging_price", "description": "Add prices to rooms of lodgings that exist, one row per room and date "
             "range, in DKK. get_lodging gives the room ids. A row for a room that does not exist, or that fails the checks, "
             "is refused by its row number and the other rows are still saved. Never add a lodging to hold a price.",
             "schema": {"type": "object", "properties": {"rows": {"type": "array", "minItems": 1, "items": price_row}},
                        "required": ["rows"]},
             "fn": lambda rows: self.add_lodging_price(rows)},
        ]
        return specs + runner.Runner(self).specs()

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
        if t.name == "booking":
            props, required = properties_of(t.schema, skip=t.auto)
            return props, [f for f in required if f != "status"]  # a new booking is booked unless it says otherwise
        if t.name == "lodging":
            return self.lodging_fields(t)
        return properties_of(t.schema, skip=t.auto | {"kind"})

    @staticmethod
    def lodging_fields(t):
        """A lodging's fields with its rooms nested, and each room's prices nested in it."""
        def items(schema, skip=()):
            p, r = properties_of(schema, skip=skip)
            return {"type": "object", "properties": p, "required": r}
        props, required = properties_of(t.schema, skip=t.auto)
        props["photos"]["items"] = items(tripdb.LODGING_PHOTO)
        props["links"]["items"] = items(tripdb.LODGING_LINK)
        props["tags"]["items"] = {"type": "string", "enum": tripdb.LODGING_TAGS.split(",")}
        room = items(tripdb.LODGING_ROOM, skip=ROOM_AUTO)
        room["properties"]["prices"] = {"type": "array", "items": items(tripdb.LODGING_PRICE, skip={"id", "room_id"})}
        props["rooms"] = {"type": "array", "items": room}
        return props, [f for f in required if f != "added_by"]  # added by claude unless it says otherwise

    @staticmethod
    def example_where(t):
        return {"trip": '"name": "Costa Rica"', "flight": '"from": "SJO", "to": "LIR"', "connection": '"from": "SJO", "mode": "bus"',
                "stay": '"place": "LCORN"', "experience": '"category": "nature"', "place": '"country": "CR"',
                "task": '"status": "open"', "booking": '"from": "SJO", "to": "LIR", "day": "2026-12-12"',
                "lodging": '"place": "LCORN"'}[t.name]

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
        if tname == "booking":
            self.need_project("bookings")
            return [(r["id"], r) for r in self.store.rest.get_all("bookings", self.mine({"select": "*", "order": "created_at,id"}))]
        if tname == "lodging":
            self.need_project("lodgings")
            return [(r["id"], r) for r in self.store.rest.get_all("lodgings", self.mine({"select": "*", "order": "created_at,id"}))]
        out = {}
        for r in self.store.rows(t.table):
            out[self.ident(tname, r)] = r
        return list(out.items())

    @staticmethod
    def ident(tname, r):
        if tname in ("trip", "place", "experience", "booking", "lodging"):
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
        return r if tname in ("trip", "task", "booking", "lodging") else {"id": id, **r}

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
        if tname == "booking":
            where = dict(where or {})
            if "status" not in where and r.get("status") == "cancelled":
                return False
            if "day" in where and where.pop("day") not in ((r.get("depart") or "")[:10], r.get("check_in")):
                return False
            where = {BOOKING_WHERE.get(k, k): v for k, v in where.items()}
        if tname == "lodging":
            where = dict(where or {})
            if "hidden" not in where and r.get("hidden"):
                return False
            where = {LODGING_WHERE.get(k, k): v for k, v in where.items()}
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
        if tname == "lodging":
            return {**r, "rooms": self.rooms_of(i)}
        return self.shown(tname, i, r)

    def rooms_of(self, lodging_id):
        """A lodging's rooms by name, each with its prices by dates. Rooms written together share created_at, so
        only the name gives them the same order every time."""
        rooms = self.store.rest.get_all("lodging_rooms", self.mine({"select": "*", "lodging_id": "eq." + lodging_id,
                                                                    "order": "name,id"}))
        prices = self.store.rest.get_all("lodging_prices", self.mine({"select": "*", "room_id": in_list([r["id"] for r in rooms]),
                                                                      "order": "check_in,check_out,observed_at,id"})) if rooms else []
        return [{**r, "prices": [p for p in prices if p["room_id"] == r["id"]]} for r in rooms]

    # ---- add --------------------------------------------------------------------------------------------------

    def add(self, tname, rows):
        if not isinstance(rows, list) or not rows:
            raise Refused("rows must be a list with at least one row")
        if tname == "stay":
            raise Refused(tripdb.STAYS_CLOSED)
        if tname == "lodging":
            return self.add_lodging(rows)
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
            return {"status": "open", **row}, self.task_errors(row)
        if tname == "booking":
            set_here = sorted(set(row) & t.auto)
            if set_here:
                return None, ["the connector sets " + ", ".join(set_here) + ", leave them out"]
            r = {"status": "booked", **row}
            return r, self.booking_errors(r)
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

    @staticmethod
    def task_errors(row):
        """Reasons to refuse a task row: a field the table lacks, a value the database cannot hold, or a bad field."""
        unknown = [k for k in row if k not in TASK_FIELDS]
        if unknown:
            return ["unknown field " + ", ".join(sorted(unknown)) + ", the fields are " + ", ".join(TASK_FIELDS)]
        if tripdb.store.has_nul(row):
            return [tripdb.NUL_WHY]
        if tripdb.store.has_unstorable(row):
            return [tripdb.BAD_WHY]
        return tripdb.check_fields(row, TASK_FIELDS)

    @staticmethod
    def booking_errors(row):
        """Reasons to refuse a booking row: the schema, and the checks the bookings table makes, so one bad row in a
        batch is refused here and does not fail the whole insert."""
        unknown = [k for k in row if k not in tripdb.BOOKING]
        if unknown:
            return ["unknown field " + ", ".join(sorted(unknown)) + ", the fields are " + ", ".join(tripdb.BOOKING)]
        if tripdb.store.has_nul(row):
            return [tripdb.NUL_WHY]
        if tripdb.store.has_unstorable(row):
            return [tripdb.BAD_WHY]
        errs = tripdb.check_fields(row, tripdb.BOOKING)
        if errs:
            return errs
        errs += [f"{k} is {row[k]}, expected a local time like 2026-12-02T06:00 or a day alone"
                 for k in ("depart", "arrive") if row.get(k) is not None and not BOOKING_TIME_RE.match(row[k])]
        errs += [f"{k} is below 0" for k in ("price_dkk", "price") if row.get(k) is not None and row[k] < 0]
        if row.get("travellers") is not None and row["travellers"] < 1:
            errs.append("travellers is below 1")
        if row.get("check_in") and row.get("check_out") and row["check_out"] <= row["check_in"]:
            errs.append("check_out is not after check_in")
        return errs

    @staticmethod
    def stored_errors(row, schema):
        """Reasons the row cannot go in a table of that schema: a field it lacks, a value the database cannot hold, or a
        field of the wrong type."""
        if not isinstance(row, dict):
            return ["is not a JSON object"]
        unknown = [k for k in row if k not in schema]
        if unknown:
            return ["unknown field " + ", ".join(sorted(unknown)) + ", the fields are " + ", ".join(schema)]
        if tripdb.store.has_nul(row):
            return [tripdb.NUL_WHY]
        if tripdb.store.has_unstorable(row):
            return [tripdb.BAD_WHY]
        return tripdb.check_fields(row, schema)

    @classmethod
    def lodging_errors(cls, row):
        """Reasons to refuse a lodging, without its rooms: the schema, its photos and links, and the checks the table makes."""
        errs = cls.stored_errors(row, tripdb.LODGING)
        if errs:
            return errs
        for name, schema in (("photos", tripdb.LODGING_PHOTO), ("links", tripdb.LODGING_LINK)):
            for n, item in enumerate(row.get(name) or []):
                errs += [f"{name}[{n}] {e}" for e in (tripdb.check_fields(item, schema) if isinstance(item, dict)
                                                       else ["is not a JSON object"])]
        tags = tripdb.LODGING_TAGS.split(",")
        odd = [x for x in row.get("tags") or [] if x not in tags]
        if odd:
            errs.append(f"tags has {json.dumps(odd, ensure_ascii=False)[:60]}, a tag is one of " + ", ".join(tags))
        if row.get("rating") is not None and not 0 <= row["rating"] <= 10:
            errs.append("rating is not out of 10")
        errs += [f"{k} is below 0" for k in ("reviews", "to_center_km", "to_beach_km") if row.get(k) is not None and row[k] < 0]
        errs += [f"{k} is not between -{m} and {m}" for k, m in (("lat", 90), ("lon", 180))
                 if row.get(k) is not None and not -m <= row[k] <= m]
        return errs

    @classmethod
    def room_errors(cls, row):
        errs = cls.stored_errors(row, tripdb.LODGING_ROOM)
        if not errs and row.get("beds") is not None and row["beds"] < 1:
            errs.append("beds is below 1")
        return errs

    @classmethod
    def price_errors(cls, row):
        errs = cls.stored_errors(row, tripdb.LODGING_PRICE)
        if errs:
            return errs
        if row["check_out"] <= row["check_in"]:
            errs.append("check_out is not after check_in")
        if row.get("total_dkk") is None and row.get("per_night_dkk") is None:
            errs.append("give total_dkk or per_night_dkk")
        errs += [f"{k} is below 0" for k in ("total_dkk", "per_night_dkk", "available")
                 if row.get(k) is not None and row[k] < 0]
        return errs

    def place_errors(self, row):
        """A lodging's place_id must be a place in the places, as a stay's or a connection's place must."""
        pid = row.get("place_id")
        return [f"place {pid} is not in the places"] if isinstance(pid, str) and pid not in self.store.ids("places") else []

    def lodging_parts(self, row):
        """(lodging, [(room, its prices)]) as given, without the ids the connector sets, and the reasons to refuse any
        part of them. Two rooms with one name, or two prices of a room for the same dates and site, are refused, as
        they would be one row once stored."""
        if not isinstance(row, dict):
            return None, ["row is not a JSON object"]
        row = dict(row)
        rooms = row.pop("rooms", None) or []
        set_here = sorted(set(row) & TYPES["lodging"].auto)
        if set_here:
            return None, ["the connector sets " + ", ".join(set_here) + ", leave them out"]
        lodging = {"added_by": "claude", **row}
        errs = self.lodging_errors(lodging) or self.place_errors(lodging)
        if not isinstance(rooms, list):
            return None, errs + ["rooms is not a list"]
        out, names = [], {}
        for n, room in enumerate(rooms):
            if not isinstance(room, dict):
                errs.append(f"rooms[{n}] is not a JSON object")
                continue
            room = dict(room)
            prices = room.pop("prices", None) or []
            set_here = sorted(set(room) & ROOM_AUTO)
            if set_here:
                errs.append(f"rooms[{n}]: the connector sets " + ", ".join(set_here) + ", leave them out")
                continue
            room_errs = self.room_errors({**room, "lodging_id": "new"})
            errs += [f"rooms[{n}] {e}" for e in room_errs]
            if not room_errs:
                if same_name(room["name"]) in names:
                    errs.append(f"rooms[{n}] has the name of rooms[{names[same_name(room['name'])]}]")
                names.setdefault(same_name(room["name"]), n)
            if not isinstance(prices, list):
                errs.append(f"rooms[{n}].prices is not a list")
                continue
            dates, good = {}, []
            for k, price in enumerate(prices):
                if isinstance(price, dict) and {"id", "room_id"} & set(price):
                    errs.append(f"rooms[{n}].prices[{k}]: the connector sets id and room_id, leave them out")
                    continue
                price_errs = self.price_errors({**price, "room_id": "new"} if isinstance(price, dict) else price)
                errs += [f"rooms[{n}].prices[{k}] {e}" for e in price_errs]
                if price_errs:
                    continue
                key = (price["check_in"], price["check_out"], price.get("site") or "")
                if key in dates:
                    errs.append(f"rooms[{n}].prices[{k}] has the dates and site of prices[{dates[key]}]")
                dates.setdefault(key, k)
                good.append(price)
            out.append((room, good))
        return (lodging, out), errs

    def lodging_rows(self, lodging_id, given, stored):
        """(rooms, prices, room ids in the order given) to write for a lodging. A room of a lodging that is stored
        already is matched by name, and a price by its room, dates and site, so only what it lacks is written. A new
        row's id comes from what it is, so a write that is sent again names the rows the first one wrote."""
        rest = self.store.rest
        have, have_ids, have_prices = {}, set(), set()
        if stored:
            got = rest.get_all("lodging_rooms", self.mine({"select": "id,name", "lodging_id": "eq." + lodging_id}))
            have = {same_name(r["name"]): r["id"] for r in got}
            have_ids = {r["id"] for r in got}
            if got:
                have_prices = {(p["room_id"], p["check_in"], p["check_out"], p.get("site") or "") for p in rest.get_all(
                    "lodging_prices", self.mine({"select": "room_id,check_in,check_out,site", "room_id": in_list(sorted(have_ids))}))}
        rooms, prices, order = [], [], []
        owner = self.owner()
        for room, given_prices in given:
            rid = have.get(same_name(room["name"])) or stable_id(owner, lodging_id, same_name(room["name"]))
            order.append(rid)
            if rid not in have_ids:
                rooms.append({**room, "id": rid, "lodging_id": lodging_id, "owner_id": owner})
            for p in given_prices:
                key = (rid, p["check_in"], p["check_out"], p.get("site") or "")
                if key not in have_prices:
                    prices.append({**p, "id": stable_id(owner, *key), "room_id": rid, "owner_id": owner})
        return rooms, prices, order

    def add_lodging(self, rows):
        """Each lodging is saved whole or not at all, and one row never stops the others. A lodging with any part that
        fails its checks writes nothing. A new lodging whose write fails is taken away again with its rooms and prices.
        One with the name of a lodging stored at that place is that lodging, so a row sent again after a timeout or a
        refusal finishes what the first try left and never stores the place twice."""
        self.need_project("lodgings")
        rest = self.store.rest
        owner = self.owner()
        # the caller's own lodgings only, since a derived id carries the owner and a place of another person is not this one
        stored = rest.get_all("lodgings", self.mine({"select": "id,place_id,name,hidden"}))
        added, rooms, skipped, refused = [], {}, [], []
        once = {"on_conflict": "id,owner_id", "resolution": "ignore-duplicates"}  # a row that is there already stays as it is
        for n, row in enumerate(rows, 1):
            parts, errs = self.lodging_parts(row)
            if errs:
                refused.append({"row": n, "why": "; ".join(errs)})
                continue
            lodging, given = parts
            self.fill_center_km(lodging)
            key = (lodging["place_id"], same_name(lodging["name"]))
            lid = stable_id(owner, *key)
            old = (next((s for s in stored if (s["place_id"], same_name(s["name"])) == key), None)
                   or next((s for s in stored if s["id"] == lid), None))
            lid = old["id"] if old else lid
            try:
                room_rows, price_rows, order = self.lodging_rows(lid, given, old is not None)
                if not old:
                    rest.insert("lodgings", [{**lodging, "id": lid, "owner_id": owner}], **once)
                if room_rows:
                    rest.insert("lodging_rooms", room_rows, **once)
                if price_rows:
                    rest.insert("lodging_prices", price_rows, **once)
            except Refused as e:
                refused.append(self.undo_lodging(n, lid, e, old))
                continue
            rooms[lid] = order
            if old:
                hidden = ", it is hidden and update_lodging with hidden false shows it again" if old.get("hidden") else ""
                skipped.append({"row": n, "id": lid, "why": f"stored already as {lid}, its fields are kept and the rooms and "
                                f"prices it lacked are added, update_lodging changes its fields{hidden}"})
            else:
                added.append(lid)
                stored.append({"id": lid, "place_id": lodging["place_id"], "name": lodging["name"], "hidden": False})
        return {"added": added, "rooms": rooms, "skipped": skipped, "refused": refused}

    def fill_center_km(self, lodging):
        """to_center_km from the lodging's and its place's lat and lon, when the caller left it out and both are known."""
        if lodging.get("to_center_km") is not None or lodging.get("lat") is None or lodging.get("lon") is None:
            return
        try:
            _, place = self.find("place", lodging["place_id"])
        except Refused:
            return
        if place.get("lat") is not None and place.get("lon") is not None:
            lodging["to_center_km"] = round(haversine_km((place["lat"], place["lon"]), (lodging["lat"], lodging["lon"])), 1)

    def undo_lodging(self, n, lid, e, old):
        """The refusal of a row whose write failed. A new lodging is taken away again, which takes its rooms and prices
        with it. When that fails too the reply names what is left, so it is never lost."""
        if old:
            return {"row": n, "id": lid, "why": f"{e}. {lid} was stored already and is kept, send the same row again "
                                                "to add the rooms and prices it lacks"}
        try:
            self.store.rest.delete("lodgings", self.mine({"id": "eq." + lid}))
        except Refused as e2:
            return {"row": n, "id": lid, "why": f"{e}. Taking it away again failed too ({e2}), so it is saved in part as "
                                                f"{lid}. Send the same row again to finish it, or delete_lodging to hide it"}
        return {"row": n, "why": f"{e}, nothing was saved"}

    def add_lodging_price(self, rows):
        """Prices for rooms that exist. A row for a room that does not exist is refused, nothing makes a lodging here."""
        self.need_project("lodgings")
        if not isinstance(rows, list) or not rows:
            raise Refused("rows must be a list with at least one row")
        good, refused = [], []
        for n, row in enumerate(rows, 1):
            errs = (["the connector sets id, leave it out"] if isinstance(row, dict) and "id" in row
                    else self.price_errors(row))
            (refused.append({"row": n, "why": "; ".join(errs)}) if errs else good.append((n, row)))
        asked = sorted({r["room_id"] for _, r in good})
        known = {r["id"] for r in self.store.rest.get_all("lodging_rooms", self.mine({"select": "id", "id": in_list(asked)}))} if asked else set()
        for n, r in good:
            if r["room_id"] not in known:
                refused.append({"row": n, "why": f"no room {r['room_id']!r}, get_lodging gives the room ids"})
        good = [{**r, "owner_id": self.owner()} for _, r in good if r["room_id"] in known]
        added = [g["id"] for g in self.store.rest.insert("lodging_prices", good, returning="id")] if good else []
        return {"added": added, "skipped": [], "refused": sorted(refused, key=lambda x: x["row"])}

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
            got = self.store.rest.insert("tasks", [{**r, "owner_id": self.owner()} for r in good], returning="id")
            return [str(g["id"]) for g in got], []
        if tname == "booking":
            self.need_project("bookings")
            # every column is named, so rows with different fields go in together and a field left out takes its default
            owner = self.owner()
            rows = [{**r, "owner_id": owner} for r in good]
            return [g["id"] for g in self.store.rest.insert("bookings", rows, returning="id", columns=BOOKING_COLUMNS + ["owner_id"])], []
        if tname == "flight":
            res = self.store.add_quotes(good, "chat.jsonl")
            ids = [cols.qr.quote_id(q) for q in good]
            return ids, ([{"row": nums[0], "why": "stored already"}] if res.duplicates and len(good) == 1 else [])
        res = self.store.add(t.table, good, cols.COLS[t.table].key)
        skip_at = {i for i, _, _ in res.skips}
        added = [self.ident(tname, r) for i, r in enumerate(good) if i not in skip_at]
        return added, [{"row": nums[i], "why": f"{self.ident(tname, good[i])} is stored already ({why})"} for i, _, why in res.skips]

    def need_project(self, what="tasks"):
        if getattr(self.store, "kind", "") != "supabase":
            raise Refused(f"{what} are kept in the project database only")

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
        if tname == "stay":
            raise Refused(tripdb.STAYS_CLOSED)
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
            errs = self.task_errors({**{k: v for k, v in old.items() if k in TASK_FIELDS and v is not None}, **patch})
            if errs:
                raise Refused(f"{i}: " + "; ".join(errs))
            self.keep("task", i, [old], "update")
            self.store.rest.patch("tasks", self.mine({"id": "eq." + i}), patch)
            return {"updated": i}
        if tname == "booking":
            set_here = sorted(set(patch) & t.auto)
            if set_here:
                raise Refused(f"{i}: the connector sets " + ", ".join(set_here))
            errs = self.booking_errors({**{k: v for k, v in old.items() if k not in t.auto}, **patch})
            if errs:
                raise Refused(f"{i}: " + "; ".join(errs))
            self.keep("booking", i, [old], "update")
            self.store.rest.patch("bookings", self.mine({"id": "eq." + i}), patch)
            return {"updated": i}
        if tname == "lodging":
            if "rooms" in patch:
                raise Refused(f"{i}: update_lodging changes the lodging alone, add prices with add_lodging_price")
            set_here = sorted(set(patch) & t.auto)
            if set_here:
                raise Refused(f"{i}: the connector sets " + ", ".join(set_here))
            errs = self.lodging_errors({**{k: v for k, v in old.items() if k not in t.auto}, **patch})
            errs = errs or (self.place_errors(patch) if "place_id" in patch else [])
            if errs:
                raise Refused(f"{i}: " + "; ".join(errs))
            self.keep("lodging", i, [old], "update")
            self.store.rest.patch("lodgings", self.mine({"id": "eq." + i}), patch)
            return {"updated": i}
        if {"id", "kind"} & set(patch):
            raise Refused("id and kind cannot be changed")
        new = {**old, **patch}
        errs = tripdb.row_errors(t.table, new) or self.extra_checks(tname, new)
        if errs:
            raise Refused(f"{i}: " + "; ".join(errs))
        self.keep(tname, i, [old], "update", replaced_by=self.ident(tname, new))
        if t.table in ("places", "experiences"):
            self.store.update(t.table, i, patch, None)
        else:
            # the new row goes in first, so a failure between the two steps leaves two rows and never none
            self.store.add(t.table, [new], cols.COLS[t.table].key, replace=True)
            if {k: new.get(k) for k in t.keys} != {k: old.get(k) for k in t.keys}:
                self.store.remove(t.table, {k: old.get(k) for k in t.keys})
        return {"updated": self.ident(tname, new)}

    def update_trip(self, id, patch):
        _, old = self.find("trip", id)
        if {"id", "version", "saved_at"} & set(patch):
            raise Refused("id, version and saved_at cannot be changed, a save makes the next version")
        new = {**copy.deepcopy(old), **patch}
        new["by"] = patch.get("by") or "plan-trip"
        self.check_booked_days(old, new)
        self.keep("trip", id, [old], "update")
        try:
            out = self.save_trip(new)
        except Refused:
            self.drop_last("trip", id)
            raise
        if out["skipped"]:
            self.drop_last("trip", id)
        return out

    def save_trip(self, t):
        errs = tripdb.row_errors("trips", t)
        if errs:
            raise Refused(f"{t['id']}: " + "; ".join(errs))
        res = self.store.save_trip(t)
        return {"id": res["id"], "version": res["version"], "skipped": bool(res["skipped"])}

    def update_flight(self, id, old, patch):
        if old.get("source") != "chat":
            raise Refused(f"{id} is a {old.get('source')} quote, only flights saved from chat can be changed here")
        flat = {"from": old["legs_requested"][0]["from"], "to": old["legs_requested"][0]["to"], "date": old["legs_requested"][0]["date"],
                "price": old["price_dkk"], **{k: v for k, v in (old["out"] or {}).items() if k in CHAT_FLIGHT}}
        flat["notes"] = re.sub(r"^site=chat(; )?", "", old.get("notes") or "") or None
        flat.update(patch)
        new, errs = self.chat_flight({k: v for k, v in flat.items() if v is not None})
        if errs:
            raise Refused(f"{id}: " + "; ".join(errs))
        new_id = cols.qr.quote_id(new)
        self.keep("flight", id, [old], "update", replaced_by=new_id)
        if new_id == id:
            self.store.remove("quotes", {"quote_id": id})  # the same quote again would count as a duplicate
            self.store.add_quotes([new], "chat.jsonl")
        else:
            self.store.add_quotes([new], "chat.jsonl")
            self.store.remove("quotes", {"quote_id": id})
        return {"updated": new_id}

    def delete(self, tname, id):
        t = TYPES[tname]
        if tname == "stay":
            raise Refused(tripdb.STAYS_CLOSED)
        if tname == "task":
            self.need_project()
            i, old = self.find("task", id)
            self.keep("task", i, [old], "delete")
            self.store.rest.delete("tasks", self.mine({"id": "eq." + i}))
            return {"deleted": i}
        if tname == "trip":
            return self.delete_trip(id)
        i, old = self.find(tname, id)
        self.keep(tname, i, [old], "delete")
        try:
            if tname == "booking":
                self.store.rest.patch("bookings", self.mine({"id": "eq." + i}), {"status": "cancelled"})  # the row stays, cancelled
            elif tname == "lodging":
                self.store.rest.patch("lodgings", self.mine({"id": "eq." + i}), {"hidden": True})  # set aside, with its rooms and prices
            elif tname == "flight":
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

    def keep(self, tname, id, rows, action, replaced_by=None):
        """Put the rows a write is about to lose into the trash, so the write can be undone. replaced_by is the id the
        row has after an update, so a restore can take the new row away."""
        entry = {"type": tname, "id": id, "action": action, "deleted_at": self.now(), "rows": rows}
        if replaced_by is not None:
            entry["replaced_by"] = replaced_by
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

        def peek(entries):
            for k in range(len(entries) - 1, -1, -1):
                if entries[k]["type"] == tname and entries[k]["id"] == str(id):
                    picked.update(entries[k])
                    return

        self.edit_trash(peek)
        if not picked:
            raise Refused(f"nothing to restore for {t.label} {id!r}")
        rows, action = picked["rows"], picked["action"]
        now_id = picked.get("replaced_by") or str(id)
        if tname == "trip":
            if action == "delete":
                self.store.restore_trip(id, rows)
            else:
                self.store.save_trip(rows[-1])
        elif tname == "task":
            self.need_project()
            if action == "update":
                self.store.rest.patch("tasks", self.mine({"id": "eq." + str(id)}), {k: v for k, v in rows[0].items() if k in TASK_FIELDS})
            else:
                self.store.rest.insert("tasks", [{**r, "owner_id": self.owner()} for r in rows])  # back under its own id, as the caller's
        elif tname == "booking":
            self.need_project("bookings")
            # the attachments stay as they are, a file added since is still in the bucket
            back = {"status": rows[0]["status"]} if action == "delete" else {k: v for k, v in rows[0].items() if k not in t.auto}
            self.store.rest.patch("bookings", self.mine({"id": "eq." + str(id)}), back)
        elif tname == "lodging":
            self.need_project("lodgings")
            # a field the old row did not have goes back to null, so a field the update added is taken away too
            back = {"hidden": rows[0]["hidden"]} if action == "delete" else {
                k: rows[0].get(k) for k, spec in t.schema.items() if k not in t.auto and (k in rows[0] or "null" in spec)}
            self.store.rest.patch("lodgings", self.mine({"id": "eq." + str(id)}), back)
        elif tname == "flight":
            if action == "update" and now_id == str(id):
                self.store.remove("quotes", {"quote_id": now_id})
            self.store.add_quotes(rows, "chat.jsonl")
            if action == "update" and now_id != str(id):
                self.store.remove("quotes", {"quote_id": now_id})
        else:
            # the old row goes back first and the changed one goes after, so a failure never leaves nothing
            self.store.add(t.table, rows, cols.COLS[t.table].key, replace=True)
            if action == "update" and now_id != str(id) and t.table not in ("places", "experiences"):
                current = self.find(tname, now_id)[1]
                self.store.remove(t.table, {k: current.get(k) for k in t.keys})

        def drop(entries):
            for k in range(len(entries) - 1, -1, -1):
                if entries[k] == picked:
                    del entries[k]
                    return

        self.edit_trash(drop)  # only now, so a restore that failed halfway can be tried again
        return {"restored": str(id), "action_undone": action}

    # ---- booking files ----------------------------------------------------------------------------------------

    def booking_file(self, id, name, ftype):
        """(booking id, path in the bucket) for a file about to be attached, after the checks."""
        if not isinstance(name, str) or not name.strip() or name.strip(".") == "" or re.search(r"[/\\\x00-\x1f]", name):
            raise Refused(f"name {name!r} is not a file name, give one like ticket.pdf")
        if ftype not in BOOKING_FILE_TYPES:
            raise Refused(f"{name} is {ftype or 'of an unknown type'}, the bookings bucket takes " + ", ".join(BOOKING_FILE_TYPES))
        i, _ = self.find("booking", id)
        return i, f"{self.owner()}/{i}/{name}"

    def attach(self, id, entry):
        """Add the entry to the booking's attachments, in place of one with the same path."""
        _, row = self.find("booking", id)
        files = [a for a in row.get("attachments") or [] if a.get("path") != entry["path"]] + [entry]
        self.store.rest.patch("bookings", self.mine({"id": "eq." + id}), {"attachments": files})

    def attach_booking_file(self, id, name, content_base64):
        self.need_project("bookings")
        ext = name.rsplit(".", 1)[-1].lower() if isinstance(name, str) and "." in name else ""
        i, path = self.booking_file(id, name, BOOKING_FILE_EXT.get(ext))
        if not isinstance(content_base64, str):
            raise Refused("content_base64 must be the file as a base64 string")
        limit = MAX_FILE_MB * 1024 * 1024
        if len(content_base64.rstrip("=")) * 3 // 4 > limit:  # the size before decoding, so a huge string is not decoded
            raise Refused(f"{name} is over {MAX_FILE_MB} MB, the limit of attach_booking_file. Use attach_booking_upload for it.")
        try:
            data = base64.b64decode(content_base64, validate=True)
        except (binascii.Error, ValueError):
            raise Refused("content_base64 is not base64")
        if not data:
            raise Refused(f"{name} is empty")
        if len(data) > limit:
            raise Refused(f"{name} is over {MAX_FILE_MB} MB, the limit of attach_booking_file. Use attach_booking_upload for it.")
        ftype = BOOKING_FILE_EXT[ext]
        self.store.rest.storage_put(BOOKING_BUCKET, path, data, content_type=ftype, upsert=True)
        entry = {"path": path, "name": name, "type": ftype, "size": len(data), "added_at": self.now()}
        self.attach(i, entry)
        return {"booking": i, "attachment": entry}

    def attach_booking_upload(self, id, name, type):
        self.need_project("bookings")
        i, path = self.booking_file(id, name, type)
        url = self.store.rest.storage_sign_upload(BOOKING_BUCKET, path)
        entry = {"path": path, "name": name, "type": type, "size": None, "added_at": self.now()}
        self.attach(i, entry)
        return {"booking": i, "attachment": entry, "upload_url": url, "method": "PUT", "content_type": type,
                "valid": "2 hours"}

    # ---- booked legs ------------------------------------------------------------------------------------------

    def airport_node(self):
        """The map node of an airport code, the way the planner's nodeForAirport reads inout.json: inout.py gives an
        airport the place with that iata, the place whose id is the code winning. Any other code is a node itself."""
        nodes = {}
        for p in self.store.rows("places"):
            if p.get("iata") and (p["id"] == p["iata"] or p["iata"] not in nodes):
                nodes[p["iata"]] = p["id"]
        return lambda code: nodes.get(code, code)

    def booked_legs(self, trip):
        """{leg number: day} of the legs a booking holds. A leg is booked when a booked row (not cancelled) has its two
        ends and departs on the day the leg shows. Bookings live in the project database only."""
        if getattr(self.store, "kind", "") != "supabase":
            return {}
        rows = [r for _, r in self.pairs("booking") if r.get("status") == "booked" and r.get("depart")]
        if not rows:
            return {}
        node, P = self.airport_node(), trip["places"]
        ends = {(node(r.get("from_code")), node(r.get("to_code")), r["depart"][:10]) for r in rows}
        return {k: day for k, day in self.leg_days(trip).items() if (P[k - 1]["node"], P[k]["node"], day) in ends}

    def check_booked_days(self, old, new):
        """Refuse a new version of a trip with no leg on a booked leg's two ends and day. Moving or dropping a booked
        leg, or changing one of its ends, is refused. Another leg with the same two ends can still move."""
        booked = self.booked_legs(old)
        if not booked:
            return
        errs = tripdb.row_errors("trips", new)
        if errs:
            raise Refused(f"{new['id']}: " + "; ".join(errs))
        P, Q = old["places"], new["places"]
        days = self.leg_days(new)
        for k, day in sorted(booked.items()):
            ends = (P[k - 1]["node"], P[k]["node"])
            if day not in {d for m, d in days.items() if (Q[m - 1]["node"], Q[m]["node"]) == ends}:
                raise self.booked_refusal(k, day)

    @staticmethod
    def booked_refusal(k, day):
        return Refused(f"Leg {k} is booked on {day}. Change the booking first.")

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
        booked = self.booked_legs(t)
        if k in booked:
            raise self.booked_refusal(k, booked[k])
        self.pin(t)
        t["places"][k]["hop"]["date"] = date
        return self.saved_with_dates(t)

    def shift_leg(self, trip_id, leg, days):
        if isinstance(days, bool) or not isinstance(days, int):
            raise Refused("days must be a whole number")
        _, old = self.find("trip", trip_id)
        t = copy.deepcopy(old)
        k = self.leg_number(t, leg)
        booked = self.booked_legs(t)
        if k in booked:
            raise self.booked_refusal(k, booked[k])
        held = min((b for b in booked if b > k), default=None)
        end = len(t["places"]) if held is None else held
        s = schedule(t, self.names())
        P = t["places"]
        day_of = lambda m: leg_day(P[m]["hop"], s["places"][m - 1]["outDay"])
        moves = {m: add_days(day_of(m), days) for m in range(k, end)}
        m = k - 1
        while m >= 1 and floats(P[m].get("hop")):
            moves[m] = day_of(m)
            m -= 1
        # the booked leg and every leg after it keep their days, so a leg that floats there is pinned where it is
        for m in range(end, len(P)):
            if floats(P[m].get("hop")):
                moves[m] = day_of(m)
        for m, day in moves.items():
            P[m]["hop"]["date"] = day
        out = self.saved_with_dates(t)
        if held is not None:
            place = self.names()(P[held]["node"])
            out["held"] = {"leg": held, "place": place, "day": booked[held],
                           "text": f"Leg {held} to {place} is booked on {booked[held]}, so it and every later leg stay on their days."}
        return out

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
