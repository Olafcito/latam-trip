"""The task runner's contract: which tasks a cloud run may take, what each one gives, and how it is closed.

An unattended run (docs/task-runner.md) takes and closes tasks only through three tools. claim_task picks the oldest open task a cloud
run can do, checks its fields against its type, sets it to working and hands back the task with its contract: what to
do, the exact tools to use, what to write and what never to do. finish_task closes a task the run holds with its
result and logs it, fail_task closes it as failed with the reason. Everything else stays open for Simon's own
checklist run, so a run can never take a flight search, a booking or a parser fix. A claimed task carries claimed_at,
and one still working after STALE_HOURS, from a run that crashed or timed out, is opened again by the next claim.

CLOUD lists the types. the newest supabase/migrations file that defines task_runs_in_cloud (0023 now) holds the same list for the trigger that
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


def _search_check(d):
    errs = []
    if str(d.get("check_in")) >= str(d.get("check_out")):
        errs.append("check_out is not after check_in")
    else:
        try:
            nights = (dt.date.fromisoformat(str(d["check_out"])) - dt.date.fromisoformat(str(d["check_in"]))).days
            if nights > 30:
                errs.append("the stay is more than 30 nights")
        except ValueError:
            errs.append("check_in and check_out are not dates")
    top = d.get("top")
    if top is not None and (isinstance(top, bool) or not isinstance(top, int) or not 1 <= top <= 5):
        errs.append("top is a number from 1 to 5")
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
# the value picks of FEAT-004: the kinds a pick may be, the review floors tried in turn and the guard finish_task holds
PICK_KINDS = ("hostel", "hotel", "apartment")
PICK_REVIEWS = (50, 20, 5)
PICK_RATING = 8.0
PICKS = 3
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
    "stay_search": Contract(
        "Finds the best rated places to stay at one stored place on Booking.com for the dates and stores them. "
        "Hostelworld is searched by the stay-rates edge function in the same press.",
        {"place_id": "!str", "check_in": "!date", "check_out": "!date", "top": "int|null"},
        ["context holds the place (id, name, country) and the lodgings already stored there (id, name, links, hidden).",
         f"{BOOKING_COM} with the place's name and country, check_in, check_out, 1 adult, 1 room, currency DKK and "
         "user_country_code dk.",
         "Keep the properties rated 8.0 or more on Booking.com's 10 scale, the ones with the most reviews first, as many "
         "as top says, 3 when it is not given. Leave out a property already stored at the place, matched by its "
         "Booking.com link or its name, and any stored with hidden true. When fewer remain, fill from the rest by "
         "reviews, still leaving out the stored and hidden ones.",
         "For each, one add_lodging row: place_id, name, kind from the property type (hostel, hotel, guesthouse, "
         "apartment or other), rating on the 10 scale, reviews as the number of reviews, links with one entry of site "
         "booking and the Booking.com url, lat, lon and address when shown, added_by claude, and in rooms one room, the "
         "cheapest shown, with its name as shown and in prices one row: check_in, check_out, total_dkk as shown for the "
         "stay, site booking, url the property's Booking.com link, refundable yes, no or partly and cancel_until when shown.",
         "Send photos only with URLs the connector returned. Without one, leave photos out.",
         "In the result name the places added and the ones skipped with the reason, stored, hidden or too few reviews."],
        ["latam-trip get_place, list_lodging, add_lodging", BOOKING_COM],
        "Lodgings at place_id with their one room and its price, through add_lodging only.",
        check=_search_check),
    "stay_picks": Contract(
        "Finds three good value places to stay at one stored place on Booking.com for the dates, when the stop is opened "
        "for the first time, and stores them.",
        {"place_id": "!str", "check_in": "!date", "check_out": "!date"},
        ["context holds the place (id, name, country, lat, lon) and the lodgings already stored there (id, name, links, hidden).",
         f"{BOOKING_COM} with the place's name and country, check_in, check_out, 1 adult, 1 room, currency DKK, "
         "user_country_code dk and minimum_review_score 8. Search up to three times and pool the results: the place, "
         "the place's beach when it is a town on the coast, and a lower nightly price band.",
         "Keep a property only when it shows a rating of 8.0 or more on Booking.com's 10 scale, a number of reviews, a "
         "price for the dates and its lat and lon. A property with no rating shown is left out.",
         "Keep only the kinds hostel, hotel and apartment. Hotel, resort, aparthotel and capsule hotel count as hotel or "
         "hostel as named, apartment, holiday home and villa count as apartment. Leave out guest houses, bed and breakfasts, "
         "homestays, inns, lodges, campsites and every other kind.",
         "Leave out a property already stored at the place, matched by its Booking.com link or its name, Hostelworld "
         "ones included, and any stored with hidden true.",
         "Keep those within 2 km of the place's lat and lon, or within 5 km when Booking.com lists them with the Beachfront "
         "or Beach facility. When fewer than three remain, widen the 2 km to 3 km, then 5 km, and say so in the result.",
         "Leave out every property with few reviews: keep those with 50 reviews or more. When fewer than three remain, "
         "lower the floor to 20, then 5, and say so in the result.",
         "Rank by rating for the money, the rating points above 7 per krone of the stay's total: (rating - 7) / total_dkk. "
         "A 9.2 at 600 kroner (0.0037) ranks above an 8.1 at 500 kroner (0.0022). Take the top three, or fewer when "
         "fewer remain.",
         "For each, one add_lodging row: place_id, name, kind hostel, hotel or apartment, rating on the 10 scale, reviews "
         "as the number of reviews, links with one entry of site booking and the Booking.com url, lat, lon and address "
         "when shown, tags beach when it was kept for the beach facility, added_by claude, and in rooms one room, the "
         "cheapest shown, with its name as shown and in prices one row: check_in, check_out, total_dkk as shown for the "
         "stay, site booking, url the property's Booking.com link, refundable yes, no or partly and cancel_until when shown. "
         "Leave to_center_km out, add_lodging works it out.",
         "Send photos only with URLs the connector returned. Without one, leave photos out.",
         "Close with finish_task with outputs the ids add_lodging gave, best first. In the result name the places added "
         "and how many were left out for each reason. With none left, finish with no outputs and say why."],
        ["latam-trip get_place, list_lodging, add_lodging", BOOKING_COM],
        "At most three lodgings at place_id with their one room and its price, through add_lodging only.",
        check=_search_check),
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
        if typ in ("stay_search", "stay_picks"):
            _, place = self.core.find("place", data["place_id"])
            stored = self.rest.get_all("lodgings", {"select": "*", "place_id": "eq." + data["place_id"], "order": "name,id"})
            return {"place": {"id": place.get("id", data["place_id"]), "name": place.get("name"), "country": place.get("country"),
                              "lat": place.get("lat"), "lon": place.get("lon")},
                    "stored": [{"id": r["id"], "name": r.get("name"), "links": r.get("links"), "hidden": bool(r.get("hidden"))}
                               for r in stored]}
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
        typ, data = task_type(row)
        hid = []
        if not errs and typ == "stay_picks":
            bad, hid = self.check_picks(data, outputs)
            errs += bad
        if errs:
            raise Refused("; ".join(errs))
        if hid:
            result = result.rstrip() + "\n\nHidden by the value rule: " + ", ".join(f"{i} ({why})" for i, why in hid) + "."
        done_at = self.core_now()
        if not self.take(row, "done", {"result": result[:MAX_RESULT], "done_at": done_at}):
            raise Refused(f"task {id} changed while it was being closed")
        first = next((l.strip("# ").strip() for l in result.splitlines() if l.strip()), "")
        log = tripdb.public_log_row({"issue": int(row["id"]), "type": typ, "task": data, "done_at": done_at,
                                     "summary": first[:300], "outputs": outputs})
        logged = not tripdb.row_errors("task_log", log)
        if logged:
            self.core.store.append("task_log", log)
        out = {"done": int(row["id"]), "logged": logged}
        return {**out, "hidden": [i for i, _ in hid]} if hid else out

    def check_picks(self, data, outputs):
        """A stay_picks finish names the lodgings it added. One that is not a lodging at the task's place refuses the
        finish. One the value rule would not have picked is hidden rather than refused, since the run has no tool to
        take back what it wrote: under PICK_RATING, under the lowest review floor, of a kind outside PICK_KINDS, or past
        the third. Its stay_details task stays. Returns (refusals, [(id, why)] hidden)."""
        rows = {r["id"]: r for r in self.rest.get_all("lodgings", {"select": "*", "place_id": "eq." + data["place_id"]})}
        missing = [o for o in outputs if o not in rows]
        if missing:
            return ["outputs names " + ", ".join(missing) + ", which are not lodgings at " + data["place_id"]], []
        hid = []
        for n, o in enumerate(outputs):
            r = rows[o]
            why = ("past the third" if n >= PICKS
                   else "no rating" if r.get("rating") is None
                   else f"rated {r['rating']}" if r["rating"] < PICK_RATING
                   else "too few reviews" if (r.get("reviews") or 0) < PICK_REVIEWS[-1]
                   else f"kind {r.get('kind')}" if r.get("kind") not in PICK_KINDS else None)
            if why and not r.get("hidden"):
                self.rest.patch("lodgings", {"id": "eq." + o}, {"hidden": True})
                hid.append((o, why))
        return [], hid

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
