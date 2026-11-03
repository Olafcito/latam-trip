"""Tests for the latam-trip connector. Run from the repo root:
python -I -X utf8 -m unittest discover -s latam_trip_mcp -p "test_*.py"
Every test works in its own temporary root with the file store, so no data is touched and nothing goes online."""
import ast, asyncio, base64, json, os, re, shutil, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, ".."))
for p in (REPO, os.path.join(REPO, "plugin", "scripts")):
    if p not in sys.path:
        sys.path.insert(0, p)

import tripdb  # noqa: E402
import tripdb_store  # noqa: E402
from latam_trip_mcp import core as mcp_core  # noqa: E402

NOW = "2026-11-01T10:00:00Z"


def place(pid, name, lat, lon, iata=None, cc="CR"):
    return {"kind": "node", "id": pid, "name": name, "country": cc, "lat": lat, "lon": lon, "type": "city", "iata": iata,
            "popularity": 3, "why": None, "source": None, "origin": "test"}


def hop(a, b, mode="bus", **extra):
    return {"from": a, "to": b, "mode": mode, "operator": None, "hours": 3.0, "price_dkk": 50, "flight": None, **extra}


def way(direction, a, b, depart, arrive):
    return {"direction": direction, "from": a, "to": b, "depart": depart, "arrive": arrive, "price_dkk": 3000,
            "tickets": [], "timeline": []}


FLIGHT = {"quote_id": "Q:x", "depart": "2026-12-25T09:00", "arrive": "2026-12-25T10:00", "hours": 1.0, "price_dkk": 600,
          "carriers": ["Sansa"]}


def seed_trip():
    return {"id": "t1", "version": 1, "name": "Costa Rica", "saved_at": "2026-10-30T10:00:00Z", "by": "plan-trip",
            "why": "A test trip", "way_in": way("in", "CPH", "SJO", "2026-12-02T09:00", "2026-12-02T20:00"),
            "way_home": way("home", "SJO", "CPH", "2027-01-30T10:00", "2027-01-31T10:00"),
            "places": [
                {"node": "SJO", "hop": None},
                {"node": "MONT", "hop": hop("SJO", "MONT", date="2026-12-05"), "nights": 5},
                {"node": "LIR", "hop": hop("MONT", "LIR", date="2026-12-10")},
                {"node": "TAM", "hop": hop("LIR", "TAM")},
                {"node": "NOSA", "hop": hop("TAM", "NOSA", "colectivo", date="2026-12-20")},
                {"node": "JACO", "hop": hop("NOSA", "JACO", "flight", flight=dict(FLIGHT))},
            ]}


class Base(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix="latam-mcp-test-")
        self.addCleanup(shutil.rmtree, self.root, True)
        self.paths = tripdb.Paths(self.root)
        for d in (self.paths.quotes, self.paths.inbox, self.paths.processed, self.paths.rejected):
            os.makedirs(d)
        places = [place("SJO", "San Jose", 9.93, -84.08, "SJO"), place("LIR", "Liberia", 10.63, -85.44, "LIR"),
                  place("MONT", "Monteverde", 10.3, -84.8), place("TAM", "Tamarindo", 10.3, -85.84),
                  place("NOSA", "Nosara", 9.98, -85.65), place("JACO", "Jaco", 9.61, -84.63)]
        with open(self.paths.src("places.jsonl"), "w", encoding="utf-8") as fh:
            fh.write("".join(json.dumps(p) + "\n" for p in places))
        with open(self.paths.src("experiences.jsonl"), "w", encoding="utf-8") as fh:
            fh.write("")
        with open(self.paths.src("trips.jsonl"), "w", encoding="utf-8") as fh:
            fh.write(json.dumps(seed_trip()) + "\n")
        for name, doc in (("trip.json", {"home": ["CPH"]}), ("experience_categories.json", {"categories": []})):
            with open(self.paths.src(name), "w", encoding="utf-8") as fh:
                json.dump(doc, fh)
        self.store = tripdb_store.FileStore(self.paths)
        self.core = mcp_core.Core(self.store, now=lambda: NOW)

    def trip(self):
        return self.store.trips()[0]

    def days(self):
        return self.core.leg_days(self.trip())


class ToolsTest(Base):
    def test_types_table_generates_five_tools_per_type(self):
        self.assertEqual(set(mcp_core.TYPES), {"trip", "flight", "connection", "stay", "experience", "place", "task", "booking"})
        specs = {s["name"]: s for s in self.core.tool_specs()}
        for t in mcp_core.TYPES:
            for verb in ("list", "get", "add", "update", "delete"):
                self.assertIn(f"{verb}_{t}", specs)
        self.assertEqual(len(specs), 5 * len(mcp_core.TYPES) + 4)
        for name in ("set_leg_date", "shift_leg", "attach_booking_file", "attach_booking_upload"):
            self.assertIn(name, specs)
        rows = specs["add_place"]["schema"]["properties"]["rows"]
        self.assertEqual(rows["type"], "array")
        self.assertIn("lat", rows["items"]["properties"])
        self.assertIn("country", rows["items"]["required"])

    def test_add_batch_refuses_a_bad_row_by_number_and_keeps_the_good_rows(self):
        rows = [place("AAA", "Alpha", 1.0, 2.0), place("BBB", "Bravo", 1.0, 2.0, cc="XX1"), place("CCC", "Charlie", 3.0, 4.0)]
        for r in rows:
            r.pop("kind"), r.pop("origin")
        out = self.core.add("place", rows)
        self.assertEqual(out["added"], ["AAA", "CCC"])
        self.assertEqual([r["row"] for r in out["refused"]], [2])
        self.assertIn("country", out["refused"][0]["why"])
        self.assertTrue({"AAA", "CCC"} <= self.store.ids("places"))
        self.assertNotIn("BBB", self.store.ids("places"))


class FlightTest(Base):
    def add(self):
        out = self.core.add("flight", [{"from": "SJO", "to": "LIR", "date": "2026-12-12", "price": 450}])
        self.assertEqual(out["refused"], [], out)
        return out["added"][0]

    def test_chat_flight_needs_only_from_to_date_price(self):
        fid = self.add()
        got = self.core.get("flight", fid)
        self.assertEqual(got["legs_requested"], [{"from": "SJO", "to": "LIR", "date": "2026-12-12"}])
        self.assertEqual(got["price_dkk"], 450)
        bad = self.core.add("flight", [{"from": "SJO", "to": "LIR", "date": "2026-12-12"}])
        self.assertEqual(bad["added"], [])
        self.assertIn("price", bad["refused"][0]["why"])

    def test_chat_flight_has_source_chat(self):
        fid = self.add()
        self.assertEqual(self.core.get("flight", fid)["source"], "chat")

    def test_chat_flight_shows_in_the_planner_build_without_a_departure_time(self):
        fid = self.add()
        recs = [tripdb.cols.from_row("quotes", r) for r in self.store.query("quotes")]
        self.assertEqual(len(recs), 1)
        self.assertIsNone(recs[0]["out"].get("dep"))
        pairs = tripdb.pair_dates(recs)["pairs"]
        self.assertIn("SJO-LIR", pairs)
        row = pairs["SJO-LIR"]["2026-12-12"][0]
        self.assertEqual(row["p"], 450)
        self.assertIsNone(row["d"])
        db = self.store.query("quotes")[0]
        self.assertEqual(db["usable"], 1)
        self.assertIsNotNone(db["out_hours"])
        self.assertEqual(db["quote_id"], fid)

    def test_delete_flight_is_soft_too(self):
        fid = self.add()
        self.core.delete("flight", fid)
        self.assertEqual(self.store.query("quotes"), [])
        self.core.update("flight", fid, restore=True)
        self.assertEqual(self.core.get("flight", fid)["price_dkk"], 450)


class TripTest(Base):
    def test_trip_update_makes_a_new_version(self):
        out = self.core.update("trip", "t1", {"why": "Changed by chat"})
        self.assertEqual(out["version"], 2)
        self.assertEqual(self.store.trip_versions()["t1"], [1, 2])
        self.assertEqual(self.trip()["why"], "Changed by chat")
        old = [r for r in self.store.rows("trips") if r["version"] == 1][0]
        self.assertEqual(old["why"], "A test trip")

    def test_delete_is_soft_and_can_be_undone(self):
        self.core.delete("place", "NOSA")
        self.assertNotIn("NOSA", self.store.ids("places"))
        with self.assertRaises(tripdb.Refused):
            self.core.get("place", "NOSA")
        self.assertEqual(self.core.trash()[0]["id"], "NOSA")
        back = self.core.update("place", "NOSA", restore=True)
        self.assertEqual(back["restored"], "NOSA")
        self.assertEqual(self.core.get("place", "NOSA")["name"], "Nosara")
        self.assertEqual(self.core.trash(), [])
        self.core.update("trip", "t1", {"why": "second"})
        self.core.delete("trip", "t1")
        self.assertEqual(self.store.trips(), [])
        self.core.update("trip", "t1", restore=True)
        self.assertEqual(self.store.trip_versions()["t1"], [1, 2])


class LegDatesTest(Base):
    def test_set_leg_date_moves_no_other_leg_and_keeps_its_flight(self):
        before = self.days()
        out = self.core.set_leg_date("t1", 2, "2026-12-11")
        after = self.days()
        self.assertEqual(out["version"], 2)
        self.assertEqual(after[2], "2026-12-11")
        for k in (1, 3, 4, 5):
            self.assertEqual(after[k], before[k], f"leg {k} moved")
        self.assertEqual(self.trip()["places"][5]["hop"]["flight"]["depart"], "2026-12-25T09:00")

    def test_shift_leg_moves_that_leg_and_every_later_leg(self):
        before = self.days()
        out = self.core.shift_leg("t1", 2, 1)
        after = self.days()
        self.assertEqual(out["version"], 2)
        self.assertEqual(after[1], before[1])
        self.assertEqual(after[2], "2026-12-11")
        self.assertEqual(after[3], "2026-12-16")
        self.assertEqual(after[4], "2026-12-21")
        self.assertEqual(after[5], "2026-12-26")
        self.assertEqual(out["flight_off_day"][0]["flight_day"], "2026-12-25")

    def test_shift_leg_never_changes_an_earlier_leg(self):
        before = self.days()
        self.core.shift_leg("t1", 4, -2)
        after = self.days()
        self.assertEqual(after[4], "2026-12-18")
        for k in (1, 2, 3):
            self.assertEqual(after[k], before[k], f"leg {k} moved")

    def test_date_clash_is_saved_and_named_in_the_reply(self):
        out = self.core.set_leg_date("t1", 4, "2026-12-08")
        self.assertEqual(out["version"], 2)
        self.assertEqual(self.days()[4], "2026-12-08")
        self.assertTrue(out["clashes"])
        self.assertIn("Tamarindo", out["clashes"][0])
        self.assertIn("before", out["clashes"][0])

    def test_leg_off_its_flight_day_is_saved_and_the_reply_names_the_real_day(self):
        out = self.core.set_leg_date("t1", 5, "2026-12-27")
        self.assertEqual(out["version"], 2)
        leg = self.trip()["places"][5]["hop"]
        self.assertEqual(leg["date"], "2026-12-27")
        self.assertEqual(leg["flight"]["depart"], "2026-12-25T09:00")
        self.assertEqual(out["flight_off_day"], [{"leg": 5, "place": "Jaco", "set_day": "2026-12-27", "flight_day": "2026-12-25"}])


class BookingRest:
    """The bookings table and the bookings bucket as the project would hold them, in memory. The references are made up."""

    def __init__(self):
        self.rows, self.files, self.signed = [], {}, []

    def get_all(self, table, params=None, page=None, limit=None):
        assert table == "bookings", table
        return [json.loads(json.dumps(r)) for r in self.rows]

    def insert(self, table, rows, returning=None, columns=None, **kw):
        assert table == "bookings", table
        # PostgREST refuses a bulk insert whose rows have different keys unless columns names them (PGRST102)
        if len({frozenset(r) for r in rows}) > 1 and not columns:
            raise tripdb_store.RestError("POST /rest/v1/bookings gave 400: All object keys must match")
        if columns and any(set(r) - set(columns) for r in rows):
            raise tripdb_store.RestError("POST /rest/v1/bookings gave 400: a key outside columns")
        got = []
        for r in rows:
            row = {"status": "booked", "travellers": 1, "attachments": [], **json.loads(json.dumps(r)),
                   "id": f"b{len(self.rows) + 1}", "created_at": NOW, "updated_at": NOW}
            self.rows.append(row)
            got.append({"id": row["id"]})
        return got if returning else []

    def patch(self, table, params, body, returning=None):
        assert table == "bookings", table
        for r in self.rows:
            if "eq." + r["id"] == params["id"]:
                r.update(json.loads(json.dumps(body)))

    def storage_put(self, bucket, path, data, content_type="application/json", upsert=True, cache_control=None):
        self.files[(bucket, path)] = (data, content_type)

    def storage_sign_upload(self, bucket, path):
        self.signed.append((bucket, path))
        return f"https://example.test/storage/v1/object/upload/sign/{bucket}/{path}?token=TESTTOKEN"


BUS = {"kind": "bus", "from_code": "TAM", "to_code": "NOSA", "depart": "2026-12-20T08:00", "reference": "TEST01",
       "seller": "Test Lines", "price_dkk": 120}


class BookingBase(Base):
    def setUp(self):
        super().setUp()
        self.rest = BookingRest()
        self.store.kind = "supabase"
        self.store.rest = self.rest

    def book(self, **row):
        out = self.core.add("booking", [{**BUS, **row}])
        self.assertEqual(out["refused"], [], out)
        return out["added"][0]


class BookingTest(BookingBase):
    def test_add_then_list_by_from_and_day(self):
        bid = self.book()
        self.book(kind="stay", from_code=None, to_code=None, depart=None, place_id="NOSA", check_in="2026-12-20",
                  check_out="2026-12-23", reference="TEST02")
        got = self.core.list("booking", {"from": "TAM", "day": "2026-12-20"})
        self.assertEqual([r["id"] for r in got["rows"]], [bid])
        self.assertEqual(got["rows"][0]["status"], "booked")
        self.assertEqual(self.core.list("booking", {"from": "TAM", "day": "2026-12-21"})["count"], 0)
        self.assertEqual(self.core.list("booking", {"to": "NOSA"})["count"], 1)
        stays = self.core.list("booking", {"place": "NOSA", "day": "2026-12-20"})["rows"]
        self.assertEqual([r["reference"] for r in stays], ["TEST02"])

    def test_add_refuses_a_bad_row_by_number_and_keeps_the_good_one(self):
        out = self.core.add("booking", [dict(BUS), dict(BUS, kind="plane"), dict(BUS, price_dkk=-5),
                                        dict(BUS, depart="2026-12-20T08:00Z"), dict(BUS, attachments=[])])
        self.assertEqual(len(out["added"]), 1)
        self.assertEqual([r["row"] for r in out["refused"]], [2, 3, 4, 5])
        self.assertEqual(len(self.rest.rows), 1)

    def test_a_flight_and_a_stay_go_in_together(self):
        flight = {"kind": "flight", "from_code": "SJO", "to_code": "LIR", "depart": "2026-12-12T06:00", "reference": "TEST04",
                  "price_dkk": 450, "ticket": "TEST-T1"}
        stay = {"kind": "stay", "place_id": "LIR", "check_in": "2026-12-12", "check_out": "2026-12-14", "reference": "TEST05"}
        out = self.core.add("booking", [flight, stay])
        self.assertEqual(out["refused"], [], out)
        self.assertEqual(len(out["added"]), 2)
        self.assertEqual([r["travellers"] for r in self.rest.rows], [1, 1])
        self.assertEqual([r["attachments"] for r in self.rest.rows], [[], []])

    def test_update_changes_the_reference(self):
        bid = self.book()
        self.core.update("booking", bid, {"reference": "TEST03"})
        self.assertEqual(self.core.get("booking", bid)["reference"], "TEST03")
        with self.assertRaises(tripdb.Refused):
            self.core.update("booking", bid, {"travellers": None})
        self.core.update("booking", bid, restore=True)
        self.assertEqual(self.core.get("booking", bid)["reference"], "TEST01")

    def test_delete_cancels_and_keeps_the_row_and_restore_brings_it_back(self):
        bid = self.book()
        out = self.core.delete("booking", bid)
        self.assertEqual(out["deleted"], bid)
        self.assertEqual(len(self.rest.rows), 1)
        self.assertEqual(self.core.get("booking", bid)["status"], "cancelled")
        self.assertEqual(self.core.list("booking", {"from": "TAM"})["count"], 0)
        self.assertEqual(self.core.list("booking", {"from": "TAM", "status": "cancelled"})["count"], 1)
        self.core.update("booking", bid, restore=True)
        self.assertEqual(self.core.get("booking", bid)["status"], "booked")
        self.assertEqual(self.core.list("booking", {"from": "TAM"})["count"], 1)

    def test_attach_a_small_pdf(self):
        bid = self.book()
        data = b"%PDF-1.4\n%"
        self.assertEqual(len(data), 10)
        out = self.core.call("attach_booking_file", {"id": bid, "name": "ticket.pdf",
                                                     "content_base64": base64.b64encode(data).decode()})
        entry = {"path": f"{bid}/ticket.pdf", "name": "ticket.pdf", "type": "application/pdf", "size": 10, "added_at": NOW}
        self.assertEqual(out["attachment"], entry)
        self.assertEqual(self.core.get("booking", bid)["attachments"], [entry])
        self.assertEqual(self.rest.files[("bookings", f"{bid}/ticket.pdf")], (data, "application/pdf"))

    def test_a_file_over_4_mb_is_refused(self):
        bid = self.book()
        big = base64.b64encode(b"x" * (5 * 1024 * 1024)).decode()
        with self.assertRaises(tripdb.Refused) as e:
            self.core.call("attach_booking_file", {"id": bid, "name": "ticket.pdf", "content_base64": big})
        self.assertIn("4 MB", str(e.exception))
        self.assertEqual(self.rest.files, {})
        self.assertEqual(self.core.get("booking", bid)["attachments"], [])

    def test_a_type_outside_the_bucket_list_is_refused(self):
        bid = self.book()
        with self.assertRaises(tripdb.Refused):
            self.core.call("attach_booking_upload", {"id": bid, "name": "page.html", "type": "text/html"})
        with self.assertRaises(tripdb.Refused):
            self.core.call("attach_booking_file", {"id": bid, "name": "page.html",
                                                   "content_base64": base64.b64encode(b"<p>hi</p>").decode()})
        self.assertEqual((self.rest.files, self.rest.signed), ({}, []))
        self.assertEqual(self.core.get("booking", bid)["attachments"], [])

    def test_attach_upload_gives_a_signed_url_and_adds_the_entry(self):
        bid = self.book()
        out = self.core.call("attach_booking_upload", {"id": bid, "name": "scan.jpg", "type": "image/jpeg"})
        self.assertIn("token=TESTTOKEN", out["upload_url"])
        self.assertEqual(out["valid"], "2 hours")
        self.assertIsNone(out["attachment"]["size"])
        self.assertEqual(self.rest.signed, [("bookings", f"{bid}/scan.jpg")])
        got = self.core.get("booking", bid)["attachments"]
        self.assertEqual([(a["path"], a["type"]) for a in got], [(f"{bid}/scan.jpg", "image/jpeg")])

    def test_the_file_types_are_the_bucket_list(self):
        with open(os.path.join(REPO, "supabase", "migrations", "0013_bookings.sql"), encoding="utf-8") as fh:
            sql = fh.read()
        listed = re.findall(r"allowed_mime_types = array\[([^\]]*)\]", sql)[0]
        self.assertEqual(list(mcp_core.BOOKING_FILE_TYPES), re.findall(r"'([^']+)'", listed))


class BookedLegTest(BookingBase):
    def test_set_leg_date_on_a_booked_leg_is_refused_and_the_trip_is_unchanged(self):
        self.core.update("place", "NOSA", {"iata": "NOB"})
        self.book(to_code="NOB")
        with self.assertRaises(tripdb.Refused) as e:
            self.core.set_leg_date("t1", 4, "2026-12-22")
        self.assertEqual(str(e.exception), "Leg 4 is booked on 2026-12-20. Change the booking first.")
        self.assertEqual(self.store.trip_versions()["t1"], [1])
        with self.assertRaises(tripdb.Refused):
            self.core.shift_leg("t1", 4, 1)
        self.assertEqual(self.store.trip_versions()["t1"], [1])

    def test_shift_leg_stops_at_the_first_booked_leg(self):
        before = self.days()
        self.book()
        out = self.core.shift_leg("t1", 2, 2)
        after = self.days()
        self.assertEqual(after[1], before[1])
        self.assertEqual(after[2], "2026-12-12")
        self.assertEqual(after[3], "2026-12-17")
        self.assertEqual(after[4], before[4])
        self.assertEqual(after[5], before[5])
        self.assertEqual(out["held"]["leg"], 4)
        self.assertIn("booked on 2026-12-20", out["held"]["text"])

    def test_update_trip_that_moves_a_booked_leg_is_refused(self):
        self.book()
        t = self.trip()
        t["places"][4]["hop"]["date"] = "2026-12-22"
        with self.assertRaises(tripdb.Refused) as e:
            self.core.update("trip", "t1", {"places": t["places"]})
        self.assertEqual(str(e.exception), "Leg 4 is booked on 2026-12-20. Change the booking first.")
        self.assertEqual(self.store.trip_versions()["t1"], [1])

    def test_update_trip_that_leaves_booked_legs_alone_works(self):
        self.book()
        before = self.days()
        t = self.trip()
        t["places"][2]["hop"]["date"] = "2026-12-11"
        out = self.core.update("trip", "t1", {"places": t["places"], "why": "TEST change"})
        self.assertEqual(out["version"], 2)
        self.assertEqual(self.days()[2], "2026-12-11")
        self.assertEqual(self.days()[4], before[4])

    def test_a_cancelled_booking_or_one_on_another_day_locks_nothing(self):
        bid = self.book()
        self.book(depart="2026-12-19T08:00", reference="TEST02")
        self.core.delete("booking", bid)
        out = self.core.set_leg_date("t1", 4, "2026-12-22")
        self.assertEqual(self.days()[4], "2026-12-22")
        self.assertNotIn("held", self.core.shift_leg("t1", 2, 1))
        self.assertEqual(out["version"], 2)


class StorageSignTest(unittest.TestCase):
    def rest(self, answer):
        rest = tripdb_store.Rest("https://x.test", "k")
        self.seen = []
        self.headers = []
        rest._call = lambda method, path, body=None, headers=None, **kw: self.seen.append((method, path, body)) or (
            self.headers.append(headers)) or (200, {}, json.dumps(answer).encode())
        return rest

    def test_a_signed_download_url(self):
        url = self.rest({"signedURL": "/object/sign/bookings/b1/t.pdf?token=TESTTOKEN"}).storage_sign("bookings", "b1/t.pdf")
        self.assertEqual(url, "https://x.test/storage/v1/object/sign/bookings/b1/t.pdf?token=TESTTOKEN")
        self.assertEqual(self.seen, [("POST", "/storage/v1/object/sign/bookings/b1/t.pdf", {"expiresIn": 600})])

    def test_a_signed_upload_url(self):
        url = self.rest({"url": "/object/upload/sign/bookings/b1/t.pdf?token=TESTTOKEN"}).storage_sign_upload("bookings", "b1/t.pdf")
        self.assertEqual(url, "https://x.test/storage/v1/object/upload/sign/bookings/b1/t.pdf?token=TESTTOKEN")
        self.assertEqual(self.seen[0][:2], ("POST", "/storage/v1/object/upload/sign/bookings/b1/t.pdf"))
        self.assertEqual(self.headers[0], {"x-upsert": "true"})

    def test_an_insert_names_every_key_its_rows_use(self):
        rest = self.rest([])
        rest.insert("tasks", [{"title": "a"}, {"title": "b", "status": "done"}])
        self.assertEqual(self.seen[0][1], "/rest/v1/tasks?columns=title,status")
        rest.insert("bookings", [{"kind": "bus"}], returning="id", columns=["kind", "status"])
        self.assertEqual(self.seen[1][1], "/rest/v1/bookings?columns=kind,status&select=id")


class GuardTest(Base):
    def test_no_tool_searches_the_web(self):
        for s in self.core.tool_specs():
            text = (s["name"] + " " + s["description"]).lower()
            self.assertNotIn("search", text)
            self.assertNotIn("web", text)
        banned = {"urllib", "requests", "httpx", "http", "socket", "aiohttp", "webbrowser", "ftplib", "smtplib"}
        for f in ("core.py", "server.py"):
            with open(os.path.join(HERE, f), encoding="utf-8") as fh:
                tree = ast.parse(fh.read())
            for node in ast.walk(tree):
                names = [a.name for a in node.names] if isinstance(node, ast.Import) else [node.module or ""] if isinstance(node, ast.ImportFrom) else []
                for n in names:
                    self.assertNotIn(n.split(".")[0], banned, f"{f} imports {n}")

    def test_a_call_with_no_token_is_refused(self):
        from latam_trip_mcp import server
        reached = []

        async def inner(scope, receive, send):
            reached.append(scope["path"])

        guard = server.guard(inner, lambda token: token == "good", lambda headers: "https://example.test")

        async def call(headers):
            sent = []

            async def send(m):
                sent.append(m)

            async def receive():
                return {"type": "http.request", "body": b"", "more_body": False}
            await guard({"type": "http", "path": "/mcp", "method": "POST", "headers": headers}, receive, send)
            return sent

        for headers in ([], [(b"authorization", b"Bearer wrong")]):
            sent = asyncio.run(call(headers))
            self.assertEqual(sent[0]["status"], 401)
            sent_headers = {k.decode(): v.decode() for k, v in sent[0]["headers"]}
            self.assertIn("resource_metadata", sent_headers["www-authenticate"])
        self.assertEqual(reached, [])
        asyncio.run(call([(b"authorization", b"Bearer good")]))
        self.assertEqual(reached, ["/mcp"])


if __name__ == "__main__":
    unittest.main()
