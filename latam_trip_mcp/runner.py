"""The task runner's contract: which tasks a cloud run may take, what each one gives, and how it is closed.

An unattended run (docs/task-runner.md) takes and closes tasks only through three tools. claim_task picks the oldest open task a cloud
run can do, checks its fields against its type, sets it to working and hands back the task with its contract: what to
do, the exact tools to use, what to write and what never to do. finish_task closes a task the run holds with its
result and logs it, fail_task closes it as failed with the reason. Everything else stays open for Simon's own
checklist run, so a run can never take a flight search, a booking or a parser fix. A claimed task carries claimed_at,
and one still working after STALE_HOURS, from a run that crashed or timed out, is opened again by the next claim.

CLOUD lists the types. supabase/migrations/0018_task_runner_contract.sql holds the same list for the trigger that
starts a run, and a test keeps the two equal.
"""
import datetime as dt

import tripdb  # noqa: E402  (core.py puts plugin/scripts on the path first)
from tripdb_store import Refused  # noqa: E402

MAX_RESULT = 8000
STALE_HOURS = 3
DASHES = ("–", "—")
COMMON = {"type": "str", "note": "str|null", "from": "str|null"}
NEVER = ["book, reserve, pay, sign in or enter personal data",
         "tick a consent box or solve a captcha or bot check",
         "write a price that was not seen on the site",
         "write any table or tool not named in tools"]
RESULT = ("Markdown, at most 30 lines, in plain sentences or a short table. Kroner (DKK) and local clock times. "
          "No em or en dashes, no booking references, no names of people and no prices paid.")


class Contract:
    def __init__(self, does, needs, steps, tools, writes, cloud=None, check=None):
        self.does, self.needs, self.steps, self.tools, self.writes = does, needs, steps, tools, writes
        self.cloud = cloud or (lambda data: True)  # some tasks of a type need Simon, refresh of flights for one
        self.check = check or (lambda data: [])

    def shown(self, extra=None):
        out = {"does": self.does, "steps": self.steps, "tools": self.tools, "writes": self.writes, "never": NEVER,
               "result": RESULT, "close_with": "finish_task with the result, or fail_task with the reason"}
        return {**out, **(extra or {})}


def _experience_check(d):
    if d.get("experience") or (d.get("place") and d.get("question")):
        return []
    return ["needs experience, or place and question"]


def _stay_check(d):
    errs = [] if all(isinstance(r, str) and r for r in d.get("room_ids") or []) and d.get("room_ids") else ["room_ids is not a list of room ids"]
    if str(d.get("check_in")) >= str(d.get("check_out")):
        errs.append("check_out is not after check_in")
    return errs


def _list_items(d):
    errs = []
    if not d.get("add") and not d.get("remove"):
        errs.append("needs add or remove")
    for part in ("add", "remove"):
        for n, item in enumerate(d.get(part) or [], 1):
            bad = tripdb.check_fields(item, {"type": "!enum:place,experience", "id": "!str", "note": "str|null"})
            errs += [f"{part} item {n}: {e}" for e in bad]
    return errs


BOOKING_COM = "Booking.com accommodations_search"
CONTRACTS = {
    "question": Contract(
        "Answers Simon's question in the result.",
        {"text": "!str"},
        ["Read text.",
         "Look up what the trip data holds with the latam-trip list and get tools, and the web when the data cannot answer it.",
         "Answer in the result. When the web was used, name the sources."],
        ["latam-trip list_* and get_* tools", "WebSearch", "WebFetch"],
        "Nothing but the result."),
    "lists_update": Contract(
        "Adds places and experiences to one of Simon's saved lists, or takes them off.",
        {"list": "!str", "add": "list|null", "remove": "list|null"},
        ["For each item in add, call list_add with list, the item's type, id and note.",
         "For each item in remove, call list_remove with list, the item's type and id.",
         "A refused item is not retried. Name it and the reason in the result."],
        ["latam-trip list_add", "latam-trip list_remove"],
        "The lists document, through list_add and list_remove only.",
        check=_list_items),
    "experience_research": Contract(
        "Researches one experience, or a question about a place, and saves it as one experience row.",
        {"experience": "str|null", "place": "str|null", "question": "str|null", "dates": "str|list|dict|null"},
        ["With experience: get_experience for the row. With place and question: get_place, then list_experience "
         "to find a row that already covers it.",
         "Research price, season, conditions in December and January, requirements and how to book, with 2 to 4 "
         "sources. Use attractions_search for tours and tickets that can be booked.",
         "Save it: update_experience on the row that exists, or add_experience for a new one with a category from "
         "categories and places from the map. Set researched true and checked_at to today."],
        ["latam-trip get_experience, list_experience, add_experience, update_experience, get_place, list_place",
         "Booking.com attractions_search", "WebSearch", "WebFetch"],
        "One experience row, through add_experience or update_experience.",
        check=_experience_check),
    "stay_prices": Contract(
        "Prices the named rooms of a stored place to stay on Booking.com for the dates.",
        {"lodging_id": "!str", "room_ids": "!list", "check_in": "!date", "check_out": "!date"},
        ["get_lodging with lodging_id. Use its Booking.com link to know the property.",
         f"{BOOKING_COM} with the lodging's place and country, check_in, check_out, 1 adult, 1 room, currency DKK and "
         "user_country_code dk. Pick the property that matches the link or the name.",
         "For each room in room_ids that the property sells, one add_lodging_price row: room_id, check_in, check_out, "
         "total_dkk as shown for the stay, site booking, url the property's Booking.com link, refundable yes, no or "
         "partly, cancel_until when shown.",
         "A room the property does not sell, or a property not found, gets no row and is named in the result. "
         "Hostelworld is left for Simon's own run, say so in the result."],
        ["latam-trip get_lodging", "latam-trip add_lodging_price", BOOKING_COM],
        "lodging_prices rows for rooms in room_ids only, through add_lodging_price. Never a lodging or a room.",
        check=_stay_check),
    "refresh": Contract(
        "Checks researched experiences again when they were last checked more than older_than_days days ago.",
        {"scope": "!enum:all,flights,stays,experiences", "item": "str|null", "older_than_days": "int|null"},
        ["list_experience with where {\"researched\": true}, or get_experience with item when it is given.",
         "Keep the ones whose checked_at is older than older_than_days days, 3 when it is not given. At most 10, "
         "the oldest first, and name the rest in the result.",
         "For each, check price, season and how to book on the web and update_experience what changed, with "
         "checked_at today."],
        ["latam-trip list_experience, get_experience, update_experience", "Booking.com attractions_search",
         "WebSearch", "WebFetch"],
        "Experience rows, through update_experience only.",
        cloud=lambda d: d.get("scope") == "experiences"),
}
CLOUD = tuple(CONTRACTS)


def task_type(row):
    data = row.get("data") if isinstance(row.get("data"), dict) else {}
    return row.get("type") or data.get("type"), data


def runs_in_cloud(row):
    typ, data = task_type(row)
    return typ in CONTRACTS and CONTRACTS[typ].cloud(data)


def data_errors(typ, data):
    c = CONTRACTS[typ]
    return tripdb.check_fields(data, {**COMMON, **c.needs}) or c.check(data)  # a check may trust the fields' types


def result_errors(result):
    if not isinstance(result, str) or not result.strip():
        return ["result is empty"]
    errs = []
    if len(result) > MAX_RESULT:
        errs.append(f"result is {len(result)} characters, at most {MAX_RESULT}")
    if any(d in result for d in DASHES):
        errs.append("result has an em or en dash, write it without")
    if "\x00" in result:
        errs.append(tripdb.NUL_WHY)
    return errs


class Runner:
    """claim_task, finish_task, fail_task and the list tools, on a Core's store."""

    def __init__(self, core):
        self.core = core

    @property
    def rest(self):
        self.core.need_project()
        return self.core.store.rest

    def tasks(self, status):
        return self.rest.get_all("tasks", {"status": "eq." + status, "select": "*", "order": "id"})

    def take(self, row, to, body=None):
        """Move a task from row's status to `to`, only if nobody moved it first. True when this call moved it."""
        got = self.rest.patch("tasks", {"id": f"eq.{row['id']}", "status": "eq." + row["status"]},
                              {"status": to, **(body or {})}, returning="id")
        return bool(got)

    def context(self, typ, data):
        """What the run needs beyond the task: the lodging and its rooms, or the experience categories."""
        if typ == "stay_prices":
            _, lodging = self.core.find("lodging", data["lodging_id"])
            rooms = self.core.rooms_of(lodging["id"])
            missing = [r for r in data["room_ids"] if r not in {x["id"] for x in rooms}]
            if missing:
                raise Refused("rooms " + ", ".join(map(str, missing)) + " are not rooms of the lodging")
            return {"lodging": {"id": lodging["id"], "name": lodging.get("name"), "place_id": lodging.get("place_id"),
                                "links": lodging.get("links"),
                                "rooms": [{"id": r["id"], "name": r.get("name")} for r in rooms if r["id"] in data["room_ids"]]}}
        if typ == "experience_research":
            return {"categories": sorted(tripdb.category_ids(self.core.store))}
        return {}

    def release_stale(self):
        """Open again a cloud task a run claimed more than STALE_HOURS ago and never closed."""
        cutoff = dt.datetime.now(dt.timezone.utc) - dt.timedelta(hours=STALE_HOURS)
        for row in self.tasks("working"):
            try:
                at = dt.datetime.fromisoformat(str(row.get("claimed_at")).replace("Z", "+00:00"))
            except ValueError:
                continue  # never claimed by a run, so Simon's own checklist run holds it
            if at < cutoff and runs_in_cloud(row):
                self.take(row, "open", {"claimed_at": None})

    def claim_task(self):
        self.release_stale()
        left = 0
        for row in self.tasks("open"):
            if not runs_in_cloud(row):
                left += 1
                continue
            typ, data = task_type(row)
            try:
                errs = data_errors(typ, data)
                extra = {} if errs else self.context(typ, data)
            except Exception as e:  # a task the app or a chat wrote badly must never block the tasks after it
                errs = [str(e) or type(e).__name__]
            if errs:
                why = " ".join(e[:1].upper() + e[1:].rstrip(".") + "." for e in errs)
                self.take(row, "failed", {"result": f"This task cannot be done as it is. {why} Ask again from the app.",
                                          "done_at": self.core_now()})
                continue
            if not self.take(row, "working", {"claimed_at": self.core_now()}):
                continue  # another run took it first
            return {"task": {"id": row["id"], "type": typ, "title": row.get("title"), "data": data},
                    "contract": CONTRACTS[typ].shown(extra)}
        return {"task": None, "left_for_simon": left}

    def held(self, id):
        rows = self.rest.get_all("tasks", {"id": f"eq.{int(id)}", "select": "*"})
        if not rows:
            raise Refused(f"no task {id}")
        row = rows[0]
        if row.get("status") != "working":
            raise Refused(f"task {id} is {row.get('status')}, only a task claimed with claim_task can be closed")
        if not runs_in_cloud(row):
            raise Refused(f"task {id} is not a cloud task")
        return row

    def finish_task(self, id, result, outputs=None):
        row = self.held(id)
        outputs = outputs or []
        errs = result_errors(result)
        if not isinstance(outputs, list) or not all(isinstance(o, str) for o in outputs) or len(outputs) > 50:
            errs.append("outputs is a list of at most 50 ids or names of what was written")
        if errs:
            raise Refused("; ".join(errs))
        done_at = self.core_now()
        if not self.take(row, "done", {"result": result, "done_at": done_at}):
            raise Refused(f"task {id} changed while it was being closed")
        typ, data = task_type(row)
        first = next((l.strip("# ").strip() for l in result.splitlines() if l.strip()), "")
        log = tripdb.public_log_row({"issue": int(row["id"]), "type": typ, "task": data, "done_at": done_at,
                                     "summary": first[:300], "outputs": outputs})
        logged = not tripdb.row_errors("task_log", log)
        if logged:
            self.core.store.append("task_log", log)
        return {"done": int(row["id"]), "logged": logged}

    def fail_task(self, id, reason):
        row = self.held(id)
        errs = [e.replace("result", "reason") for e in result_errors(reason)]
        if errs:
            raise Refused("; ".join(errs))
        if not self.take(row, "failed", {"result": reason, "done_at": self.core_now()}):
            raise Refused(f"task {id} changed while it was being closed")
        return {"failed": int(row["id"])}

    def list_add(self, list, type, id, note=None, name=None):
        tripdb.cmd_list_add(None, list, type, id, note, name, st=self.core.store)
        return {"added": {"list": list, "type": type, "id": id}}

    def list_remove(self, list, type, id):
        tripdb.cmd_list_remove(None, list, type, id, st=self.core.store)
        return {"removed": {"list": list, "type": type, "id": id}}

    def core_now(self):
        return dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")

    def specs(self):
        id_ = {"type": "integer", "description": "the task's id, as claim_task gave it"}
        item = {"list": {"type": "string", "description": "the list's id"},
                "type": {"type": "string", "enum": ["place", "experience"]},
                "id": {"type": "string", "description": "the place's or experience's id"}}
        return [
            {"name": "claim_task", "description": "Take the oldest open task an unattended run can do and set it to working. "
             "The reply holds the task and its contract: what to do, the steps, the only tools to use, what to write, what never "
             "to do and how to write the result. A task of another type is left open for Simon, and the reply counts them in "
             "left_for_simon. A task whose fields are wrong is closed as failed with the reason and skipped. task null means "
             "nothing is left to do.",
             "schema": {"type": "object", "properties": {}},
             "fn": lambda: self.claim_task()},
            {"name": "finish_task", "description": "Close a task claimed with claim_task: store the result, set it to done and log it. "
             "The result is markdown of at most 8000 characters with no em or en dashes. outputs names the rows written, "
             "such as experience ids or lodging price rooms.",
             "schema": {"type": "object", "properties": {"id": id_, "result": {"type": "string"},
                                                          "outputs": {"type": "array", "items": {"type": "string"}, "maxItems": 50}},
                        "required": ["id", "result"]},
             "fn": lambda id, result, outputs=None: self.finish_task(id, result, outputs)},
            {"name": "fail_task", "description": "Close a task claimed with claim_task as failed, with the reason in one or two "
             "sentences, when it cannot be done in this run: a site blocked, the connector missing, the lodging gone.",
             "schema": {"type": "object", "properties": {"id": id_, "reason": {"type": "string"}}, "required": ["id", "reason"]},
             "fn": lambda id, reason: self.fail_task(id, reason)},
            {"name": "list_add", "description": "Add a place or an experience to one of Simon's saved lists. Give name to make "
             "a new list. A place or experience not stored, or one in the list already, is refused.",
             "schema": {"type": "object", "properties": {**item, "note": {"type": "string"},
                                                          "name": {"type": "string", "description": "only to make a new list"}},
                        "required": ["list", "type", "id"]},
             "fn": lambda list, type, id, note=None, name=None: self.list_add(list, type, id, note, name)},
            {"name": "list_remove", "description": "Take a place or an experience off one of Simon's saved lists.",
             "schema": {"type": "object", "properties": item, "required": ["list", "type", "id"]},
             "fn": lambda list, type, id: self.list_remove(list, type, id)},
        ]
