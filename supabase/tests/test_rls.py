"""Per user row level security on the local stack (FEAT-006 phase 2, task 2.1).

Two signed in users, A (the one admin) and B, act through PostgREST, Storage and Realtime with their own tokens.
Every private table keeps each person's rows to that person, the catalogue is read only for anyone but the admin,
and a row written with the secret key and no owner_id lands on the admin.

The tests commit rows and empty the tables with test_reset, so they run on the local stack only.
Run: bash supabase/local_up.sh <env file outside the repo>, then
TRIPDB_DB_TESTS=1 TRIPDB_ENV_FILE=<file> uv run --quiet --no-project --python 3.12 --with "psycopg[binary]==3.3.8"
  --with "websockets==15.0.1" python -I -X utf8 supabase/tests/test_rls.py -v
"""
import json, os, sys, threading, time, unittest, uuid

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
sys.path.insert(0, os.path.dirname(HERE))

PRIVATE = ["trips", "bookings", "lodgings", "lodging_rooms", "lodging_prices", "quotes", "tasks", "task_log", "inbox",
           "agent_usage", "user_profiles", "user_documents"]
# the column that finds a row again, and a column a stranger's update would change
KEY = {"trips": "id", "bookings": "id", "lodgings": "id", "lodging_rooms": "id", "lodging_prices": "id",
       "quotes": "quote_id", "tasks": "id", "task_log": "seq", "inbox": "id", "agent_usage": "seq",
       "user_profiles": "owner_id", "user_documents": "name"}
CHANGE = {"trips": {"saved_by": "TEST01 stranger"}, "bookings": {"notes": "TEST01 stranger"},
          "lodgings": {"notes": "TEST01 stranger"}, "lodging_rooms": {"notes": "TEST01 stranger"},
          "lodging_prices": {"site": "TEST01 stranger"}, "quotes": {"notes": "TEST01 stranger"},
          "tasks": {"title": "TEST01 stranger"}, "task_log": {"summary": "TEST01 stranger"},
          "inbox": {"reason": "TEST01 stranger"}, "agent_usage": {"agent": "TEST01 stranger"},
          "user_profiles": {"rules": "TEST01 stranger"}, "user_documents": {"data": {"by": "stranger"}}}
REFUSED = (401, 403)
# the private tables that were in the supabase_realtime publication until 0034 moved them to the owner topics
WAS_PUBLISHED = ["bookings", "lodgings", "lodging_rooms", "lodging_prices", "tasks", "trips"]
CATALOGUE = {
    "airports": ("code", {"code": "TS1"}, {"name": "TEST01 airport"}),
    "places": ("id", {"id": "TEST01-place"}, {"name": "TEST01 place"}),
    "stays": ("id", {"place_id": "TEST01-place", "site": "TEST01", "name": "TEST01 hostel", "room": "TEST01 dorm",
                       "check_in": "2026-12-03", "check_out": "2026-12-06"}, {"notes": "TEST01 stranger"}),
    "connections": ("id", {"from_id": "TEST01-place", "to_id": "TEST01-place", "mode": "bus"}, {"notes": "TEST01"}),
    "profiles": ("place_id", {"place_id": "TEST01-place", "kind": "place"}, {"tagline": "TEST01"}),
    "place_images": ("place_id", {"place_id": "TEST01-place"}, {"origin": "TEST01"}),
    "experiences": ("id", {"id": "TEST01-exp"}, {"name": "TEST01 experience"}),
    "experience_images": ("id", {"id": "TEST01-exp"}, {"image": {"url": "https://example.com/TEST01.jpg"}}),
    "documents": ("name", {"name": "TEST01-shared.json", "data": {}}, {"data": {"by": "stranger"}}),
}


def ok(test, got, codes=(200, 201, 204)):
    test.assertIn(got[0], codes, got)
    return got[1]


@unittest.skipUnless(os.environ.get("TRIPDB_DB_TESTS") == "1", "set TRIPDB_DB_TESTS=1 to run against the local stack")
class RlsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import migrate, users
        cls.users = users
        cls.env = migrate.load_env()
        users.refuse(cls.env)
        cls.svc = users.service(cls.env)
        cls.a = users.admin(cls.env)
        cls.b = users.make_user(cls.env, "b")

    def setUp(self):
        ok(self, self.svc.rpc("test_reset"))

    # rows of each private table, written by who
    def lodging(self, who, name="TEST01 hostel"):
        return ok(self, who.rest.insert("lodgings", [{"place_id": "TEST01", "name": name, "kind": "hostel",
                                                      "added_by": "claude"}]))[0]["id"]

    def room(self, who, lodging):
        return ok(self, who.rest.insert("lodging_rooms", [{"lodging_id": lodging, "name": "TEST01 room"}]))[0]["id"]

    def row(self, who, table):
        tag = uuid.uuid4().hex[:8]
        if table == "lodging_rooms":
            return {"lodging_id": self.lodging(who), "name": "TEST01 room"}
        if table == "lodging_prices":
            return {"room_id": self.room(who, self.lodging(who)), "check_in": "2026-12-03", "check_out": "2026-12-06",
                    "total_dkk": 100}
        return {
            "trips": {"id": "TEST01-" + tag, "version": 1, "data": {"id": "TEST01-" + tag}},
            "bookings": {"kind": "other"},
            "lodgings": {"place_id": "TEST01", "name": "TEST01 hostel", "kind": "hostel", "added_by": "claude"},
            "quotes": {"quote_id": "TEST01-" + tag},
            "tasks": {"type": "place_research", "title": "TEST01"},
            "task_log": {"summary": "TEST01"},
            "inbox": {"file": "TEST01"},
            "agent_usage": {"round": "TEST01"},
            "user_profiles": {"home_airport": "CPH"},
            "user_documents": {"name": "TEST01-" + tag + ".json", "data": {}},
        }[table]

    def where(self, table, row):
        return f"{KEY[table]}=eq.{row[KEY[table]]}"

    # the matrix
    def test_private_tables(self):
        for table in PRIVATE:
            with self.subTest(table=table):
                mine = ok(self, self.a.rest.insert(table, [self.row(self.a, table)]))[0]
                theirs = ok(self, self.b.rest.insert(table, [self.row(self.b, table)]))[0]
                q = self.where(table, mine)
                self.assertEqual(ok(self, self.b.rest.select(table, "select=*&" + q)), [], "B reads A's row")
                self.assertEqual(ok(self, self.b.rest.update(table, q, CHANGE[table])), [], "B changes A's row")
                self.assertEqual(ok(self, self.b.rest.delete(table, q)), [], "B deletes A's row")
                again = ok(self, self.a.rest.select(table, "select=*&" + q))
                self.assertEqual(again, [mine], "A's row changed under B")
                stolen = dict(self.row(self.b, table), owner_id=self.a.id)
                code, body = self.b.rest.insert(table, [stolen])
                self.assertIn(code, REFUSED, (code, body))
                seen = ok(self, self.a.rest.select(table, "select=*"))
                self.assertTrue(seen and all(r["owner_id"] == self.a.id for r in seen), seen)
                self.assertNotIn(theirs[KEY[table]], [r[KEY[table]] for r in seen])

    def test_room_under_others_lodging_refused(self):
        theirs = self.lodging(self.a)
        under_theirs = self.b.rest.insert("lodging_rooms", [{"lodging_id": theirs, "name": "TEST01 room"}])
        under_none = self.b.rest.insert("lodging_rooms", [{"lodging_id": str(uuid.uuid4()), "name": "TEST01 room"}])
        self.assertNotIn(under_theirs[0], (200, 201), under_theirs)
        self.assertEqual((under_theirs[0], under_theirs[1].get("code")), (under_none[0], under_none[1].get("code")))
        self.room(self.b, self.lodging(self.b))  # under B's own it works

    def test_price_under_others_room_refused(self):
        theirs = self.room(self.a, self.lodging(self.a))
        price = {"check_in": "2026-12-03", "check_out": "2026-12-06", "total_dkk": 100}
        under_theirs = self.b.rest.insert("lodging_prices", [dict(price, room_id=theirs)])
        under_none = self.b.rest.insert("lodging_prices", [dict(price, room_id=str(uuid.uuid4()))])
        self.assertNotIn(under_theirs[0], (200, 201), under_theirs)
        self.assertEqual((under_theirs[0], under_theirs[1].get("code")), (under_none[0], under_none[1].get("code")))
        ok(self, self.b.rest.insert("lodging_prices", [dict(price, room_id=self.room(self.b, self.lodging(self.b)))]))

    def test_id_of_another_is_free(self):
        # B writes rows with the ids A uses, and it goes as it does with a fresh id, A's rows stay as they were
        lid = self.lodging(self.a)
        rid = self.room(self.a, lid)
        price = {"check_in": "2026-12-03", "check_out": "2026-12-06", "total_dkk": 100}
        pid = ok(self, self.a.rest.insert("lodging_prices", [dict(price, room_id=rid)]))[0]["id"]
        bid = ok(self, self.a.rest.insert("bookings", [{"kind": "other"}]))[0]["id"]
        before = {t: ok(self, self.svc.select(t, "select=*&order=id")) for t in ("lodgings", "lodging_rooms",
                                                                                  "lodging_prices", "bookings")}
        lodging = {"place_id": "TEST01", "name": "TEST01 of B", "kind": "hostel", "added_by": "claude"}
        writes = [("lodgings", lid, lodging), ("lodging_rooms", rid, {"lodging_id": lid, "name": "TEST01 of B"}),
                  ("lodging_prices", pid, dict(price, room_id=rid, total_dkk=1)), ("bookings", bid, {"kind": "stay"})]
        for table, taken, row in writes:
            with self.subTest(table=table):
                fresh = str(uuid.uuid4())
                if table == "lodging_rooms":  # under B's lodging of the same id, and the fresh one under a fresh lodging
                    ok(self, self.b.rest.insert("lodgings", [dict(lodging, id=fresh)]))
                    got_fresh = self.b.rest.insert(table, [dict(row, id=fresh, lodging_id=fresh)])
                else:
                    got_fresh = self.b.rest.insert(table, [dict(row, id=fresh)])
                got = self.b.rest.insert(table, [dict(row, id=taken)])
                self.assertEqual(got[0], got_fresh[0], (got, got_fresh))
                self.assertEqual(got[0], 201, got)
                self.assertEqual((got[1][0]["id"], got[1][0]["owner_id"]), (taken, self.b.id))
                # the upsert the clients send, on (id, owner_id), changes B's own row only
                again = self.b.rest.insert(table, [dict(row, id=taken)], on_conflict="id,owner_id",
                                           resolution="ignore-duplicates")
                self.assertIn(again[0], (200, 201), again)
        for table, rows in before.items():
            mine = [r for r in ok(self, self.svc.select(table, "select=*&order=id")) if r["owner_id"] == self.a.id]
            self.assertEqual(mine, rows, table)
        # each person reads their own row under the shared id
        for who in (self.a, self.b):
            got = ok(self, who.rest.select("lodgings", f"select=name,owner_id&id=eq.{lid}"))
            self.assertEqual([r["owner_id"] for r in got], [who.id])

    def test_taken_task_id_is_as_free_as_a_fresh_one(self):
        # tasks, inbox and task_log are keyed per owner (0031), so B inserting the id A holds is answered as a fresh id is
        rows = {"tasks": ("id", {"type": "place_research", "title": "TEST01"}),
                "inbox": ("id", {"file": "TEST01"}),
                "task_log": ("seq", {"summary": "TEST01"})}
        for table, (key, row) in rows.items():
            with self.subTest(table=table):
                mine = ok(self, self.a.rest.insert(table, [row]))[0]
                taken = mine[key]
                before = ok(self, self.svc.select(table, f"select=*&owner_id=eq.{self.a.id}&order={key}"))
                fresh = 9_000_000_000 + uuid.uuid4().int % 1_000_000_000
                got_fresh = self.b.rest.insert(table, [dict(row, **{key: fresh})])
                got = self.b.rest.insert(table, [dict(row, **{key: taken})])
                self.assertEqual(got[0], got_fresh[0], (got, got_fresh))
                self.assertEqual(got[0], 201, got)
                self.assertEqual((got[1][0][key], got[1][0]["owner_id"]), (taken, self.b.id))
                # the upsert the clients send, on (owner_id, key), changes B's own row only
                again = self.b.rest.insert(table, [dict(row, **{key: taken})], on_conflict=f"owner_id,{key}",
                                           resolution="ignore-duplicates")
                self.assertIn(again[0], (200, 201), again)
                after = ok(self, self.svc.select(table, f"select=*&owner_id=eq.{self.a.id}&order={key}"))
                self.assertEqual(after, before)
                for who in (self.a, self.b):
                    seen = ok(self, who.rest.select(table, f"select=owner_id&{key}=eq.{taken}"))
                    self.assertEqual([r["owner_id"] for r in seen], [who.id])

    def test_stay_details_meet_their_own_lodging(self):
        # A's place is complete, B's of the same id is not. Each task is judged by its own owner's place.
        lid = self.lodging(self.a)
        photos = [{"url": "https://example.com/TEST01.jpg"}]
        ok(self, self.a.rest.update("lodgings", f"id=eq.{lid}", {"photos": photos}))
        ok(self, self.b.rest.insert("lodgings", [{"id": lid, "place_id": "TEST01", "name": "TEST01 of B",
                                                  "kind": "hostel", "added_by": "claude", "photos": photos}]))
        task = {"type": "stay_details", "title": "TEST01", "status": "open",
                "data": {"type": "stay_details", "lodging_id": lid, "check_in": "2026-12-03",
                         "check_out": "2026-12-06"}}
        ta = ok(self, self.a.rest.insert("tasks", [task]))[0]["id"]
        tb = ok(self, self.b.rest.insert("tasks", [task]))[0]["id"]
        ok(self, self.b.rest.insert("lodging_rooms", [{"lodging_id": lid, "name": "TEST01 of B"}]))
        rid = self.room(self.a, lid)
        ok(self, self.a.rest.insert("lodging_prices", [{"room_id": rid, "check_in": "2026-12-03",
                                                        "check_out": "2026-12-06", "total_dkk": 100}]))
        status = lambda who, tid: ok(self, who.rest.select("tasks", f"select=status&id=eq.{tid}"))[0]["status"]
        self.assertEqual(status(self.a, ta), "done")
        self.assertEqual(status(self.b, tb), "open")
        # B's room has no price, and a sweep over everyone still leaves B's task open
        ok(self, self.svc.rpc("close_stay_details", {"p_lodging": None}))
        self.assertEqual(status(self.b, tb), "open")

    def test_same_trip_name_both_save(self):
        for who in (self.a, self.b):
            got = ok(self, who.rest.rpc("save_trip", {"trip": {"id": "colombia", "name": "Colombia", "by": "TEST01"}}))
            self.assertEqual((got["id"], got["version"], got["skipped"]), ("colombia", 1, False))
        for who in (self.a, self.b):
            rows = ok(self, who.rest.select("trips_latest", "select=id,version,owner_id&id=eq.colombia"))
            self.assertEqual(rows, [{"id": "colombia", "version": 1, "owner_id": who.id}])

    def test_unique_clash_reveals_nothing(self):
        picks = {"type": "stay_picks", "place_id": "TEST01", "check_in": "2026-12-03", "check_out": "2026-12-06"}
        for who in (self.a, self.b):
            ok(self, who.rest.insert("tasks", [{"type": "stay_picks", "title": "TEST01", "data": picks}]))
        again = self.b.rest.insert("tasks", [{"type": "stay_picks", "title": "TEST01", "data": picks}])
        self.assertEqual(again[0], 409, again)  # B's own repeat still clashes

    def test_catalogue_read_only(self):
        # A, the admin, writes a row in every catalogue table and changes it
        for table, (key, row, change) in CATALOGUE.items():
            with self.subTest(table=table, who="admin"):
                got = ok(self, self.a.rest.insert(table, [row]))[0]
                self.assertEqual(len(ok(self, self.a.rest.update(table, f"{key}=eq.{got[key]}", change))), 1)
        # B reads all of it and changes none of it
        for table, (key, row, change) in CATALOGUE.items():
            with self.subTest(table=table, who="B"):
                before = ok(self, self.svc.select(table, f"select=*&order={key}"))
                self.assertEqual(ok(self, self.b.rest.select(table, f"select=*&order={key}")), before)
                code, body = self.b.rest.insert(table, [row])
                self.assertIn(code, REFUSED, (code, body))
                self.assertEqual(ok(self, self.b.rest.update(table, f"{key}=not.is.null", change)), [])
                self.assertEqual(ok(self, self.b.rest.delete(table, f"{key}=not.is.null")), [])
                self.assertEqual(ok(self, self.svc.select(table, f"select=*&order={key}")), before)
        # derive_state is read by everyone and written by no client
        self.assertEqual(ok(self, self.b.rest.update("derive_state", "id=eq.1", {"last_warning": "TEST01"})), [])

    def test_service_tables_closed(self):
        for table in ("admins", "inbox_tokens", "leases", "derived_options", "site_calls", "hostelworld_cities",
                      "task_runner", "schema_migrations", "owner_limits", "read_booking_usage"):
            with self.subTest(table=table):
                for who in (self.a, self.b):
                    code, body = who.rest.select(table)
                    self.assertTrue(code in REFUSED or body == [], (table, code, body))

    def test_read_booking_cap_per_person(self):
        take = lambda who, cap: who.rest.rpc("take_read_booking", {"cap": cap})
        self.assertEqual([take(self.a, 2) for _ in range(3)], [(200, True), (200, True), (200, False)])
        # B has a count of their own, and a lower cap refuses once it is reached
        self.assertEqual(take(self.b, 1), (200, True))
        self.assertEqual(take(self.b, 1), (200, False))
        self.assertEqual(take(self.b, 0), (200, False))
        anon = self.users.Rest(self.env["SUPABASE_URL"], self.env["SUPABASE_PUBLISHABLE_KEY"])
        self.assertIn(anon.rpc("take_read_booking", {"cap": 5})[0], REFUSED)
        code, rows = self.svc.select("read_booking_usage", "select=owner_id,reads&order=reads")
        self.assertEqual(rows, [{"owner_id": self.b.id, "reads": 1}, {"owner_id": self.a.id, "reads": 2}])

    def limits(self):
        import migrate
        with migrate.connect(self.env) as con:
            limits = dict(con.execute("select name, value from public.owner_limits").fetchall())
            limits["file_size_limit"] = con.execute("select file_size_limit from storage.buckets "
                                                    "where id = 'bookings'").fetchone()[0]
        return limits

    def refused(self, got, says):
        code, body = got
        self.assertEqual(code, 400, body)
        self.assertIn(says, body["message"])
        self.assertNotIn("?", body["message"])

    def limit(self, name, value):
        """Sets one row of owner_limits for this test and puts the old value back after it."""
        import migrate
        with migrate.connect(self.env) as con:
            old = con.execute("select value from public.owner_limits where name = %s", (name,)).fetchone()
            con.execute("insert into public.owner_limits (name, value, unit) values (%s, %s, 'rows') "
                        "on conflict (name) do update set value = excluded.value", (name, value))

        def back():
            with migrate.connect(self.env) as con:
                if old:
                    con.execute("update public.owner_limits set value = %s where name = %s", (old[0], name))
                else:
                    con.execute("delete from public.owner_limits where name = %s", (name,))
        self.addCleanup(back)

    def test_add_quotes_holds_the_quotes_cap(self):
        # add_quotes inserts as the caller since 0033, so the quotes cap counts what a person adds through it
        self.limit("rows_in_quotes", 3)
        add = lambda who, ids: who.rest.rpc("add_quotes", {"rows": [
            {"quote_id": f"TEST01-{i}", "last_seen": "2026-11-06T12:00:00Z"} for i in ids]})
        self.assertEqual(ok(self, add(self.b, [1, 2])), {"added": 2, "seen_again": 0})
        # a quote seen again adds no row, so it passes at the cap too
        self.assertEqual(ok(self, add(self.b, [1, 2, 3])), {"added": 1, "seen_again": 2})
        self.assertEqual(ok(self, add(self.b, [1, 2, 3])), {"added": 0, "seen_again": 3})
        self.refused(add(self.b, [4]), "3 rows in quotes per person")
        self.assertEqual(len(ok(self, self.b.rest.select("quotes", "select=quote_id"))), 3)
        # A's quotes count apart
        self.assertEqual(ok(self, add(self.a, [1, 2, 3])), {"added": 3, "seen_again": 0})

    def test_growing_tables_have_limits_of_their_own(self):
        # the tables that only grow hold more than the default, so the worker and save_trip run through the trip
        limits = self.limits()
        for table in ("trips", "lodgings", "lodging_rooms", "lodging_prices", "quotes", "tasks", "task_log",
                      "agent_usage"):
            with self.subTest(table=table):
                self.assertGreater(limits[f"rows_in_{table}"], limits["rows_per_private_table"])

    def test_row_caps_per_person(self):
        self.limit("rows_per_private_table", 5)
        bookings = lambda n: [{"kind": "other"} for _ in range(n)]
        ok(self, self.b.rest.insert("bookings", bookings(5)))
        self.refused(self.b.rest.insert("bookings", bookings(1)), "5 rows in bookings per person")
        # the admin has the same cap, and B's rows count against B alone
        self.refused(self.a.rest.insert("bookings", bookings(6)), "5 rows in bookings per person")
        ok(self, self.a.rest.insert("bookings", bookings(1)))
        # a table with a limit of its own takes more, and stops at it
        self.limit("rows_in_agent_usage", 8)
        usage = lambda n: [{"round": "TEST01"} for _ in range(n)]
        ok(self, self.b.rest.insert("agent_usage", usage(8)))
        self.refused(self.b.rest.insert("agent_usage", usage(1)), "8 rows in agent_usage per person")
        # tasks stop at the tasks a day before the rows
        self.limit("tasks_per_day", 3)
        tasks = lambda n: [{"type": "place_research", "title": "TEST01"} for _ in range(n)]
        ok(self, self.b.rest.insert("tasks", tasks(3)))
        self.refused(self.b.rest.insert("tasks", tasks(1)), "3 tasks a day per person")
        ok(self, self.a.rest.insert("tasks", tasks(1)))

    def test_lodging_at_the_tasks_cap_comes_without_its_task(self):
        # a Booking.com lodging queues a stay_details task, and the cap on tasks never stops the lodging itself
        links = [{"site": "booking", "url": "https://example.com/TEST01"}]
        lodging = lambda name: {"place_id": "TEST01", "name": name, "kind": "hostel", "added_by": "claude",
                                "links": links}
        stay_tasks = lambda: ok(self, self.b.rest.select("tasks", "select=id&type=eq.stay_details"))
        ok(self, self.b.rest.insert("lodgings", [lodging("TEST01 first")]))
        self.assertEqual(len(stay_tasks()), 1)
        self.limit("rows_in_tasks", 2)
        ok(self, self.b.rest.insert("tasks", [{"type": "place_research", "title": "TEST01"}]))
        got = ok(self, self.b.rest.insert("lodgings", [lodging("TEST01 at the cap")]))
        self.assertEqual(got[0]["name"], "TEST01 at the cap")
        self.assertEqual(len(stay_tasks()), 1)
        self.assertEqual(len(ok(self, self.b.rest.select("tasks", "select=id"))), 2)
        # the tasks a day stop it the same way
        self.limit("rows_in_tasks", 100)
        self.limit("tasks_per_day", 2)
        ok(self, self.b.rest.insert("lodgings", [lodging("TEST01 at the day cap")]))
        self.assertEqual(len(stay_tasks()), 1)

    def test_bookings_folder_cap(self):
        limits = self.limits()
        cap, size = limits["bookings_folder_bytes"], limits["file_size_limit"]
        whole, rest = divmod(cap, size)
        names = [f"{self.b.id}/TEST01-cap/{i}.pdf" for i in range(whole + 1)]
        extra, mine = f"{self.b.id}/TEST01-cap/extra.pdf", f"{self.a.id}/TEST01-cap/a.pdf"
        store = self.users.service_storage(self.env)
        store.remove("bookings", names + [extra, mine])
        self.addCleanup(store.remove, "bookings", names + [extra, mine])
        for name in names[:whole]:
            ok(self, self.b.storage.upload("bookings", name, b"%" * size))
        if rest:
            ok(self, self.b.storage.upload("bookings", names[whole], b"%" * rest))
        # the folder is full, so one byte more is refused
        self.assertNotIn(self.b.storage.upload("bookings", extra, b"%")[0], (200, 201))
        # a file that replaces one of the same name counts once
        ok(self, self.b.storage.update("bookings", names[0], b"%" * size))
        # the admin's folder counts apart
        ok(self, self.a.storage.upload("bookings", mine, b"%PDF-1.4 TEST01"))

    def test_bucket_folders(self):
        mine = f"{self.a.id}/TEST01/a.pdf"
        theirs = f"{self.b.id}/TEST01/b.pdf"
        # the users live on between runs, so a run that stopped halfway leaves its files behind
        self.users.service_storage(self.env).remove("bookings", [mine, theirs, f"{self.a.id}/TEST01/b.pdf",
                                                                 f"{self.b.id}/TEST01/a.pdf", "TEST01/legacy.pdf"])
        self.legacy_paths()
        ok(self, self.a.storage.upload("bookings", mine, b"%PDF-1.4 TEST01"))
        self.assertEqual(ok(self, self.b.storage.list("bookings", f"{self.a.id}/TEST01")), [])
        self.assertEqual(ok(self, self.b.storage.list("bookings", f"{self.a.id}/")), [])
        self.assertNotEqual(self.b.storage.download("bookings", mine)[0], 200)
        self.assertNotEqual(self.b.storage.sign("bookings", mine)[0], 200)
        self.assertNotIn(self.b.storage.upload("bookings", f"{self.a.id}/TEST01/b.pdf", b"%PDF-1.4 x")[0], (200, 201))
        self.assertNotIn(self.b.storage.update("bookings", mine, b"%PDF-1.4 overwritten")[0], (200, 201))
        self.b.storage.remove("bookings", [mine])
        self.assertNotIn(self.b.storage.move("bookings", mine, f"{self.b.id}/TEST01/a.pdf")[0], (200, 201))
        code, body = self.a.storage.download("bookings", mine)
        self.assertEqual((code, body), (200, b"%PDF-1.4 TEST01"))
        # B's own folder works, and A cannot reach it either
        ok(self, self.b.storage.upload("bookings", theirs, b"%PDF-1.4 B"))
        self.assertEqual(ok(self, self.a.storage.list("bookings", f"{self.b.id}/TEST01")), [])
        ok(self, self.b.storage.remove("bookings", [theirs]))
        ok(self, self.a.storage.remove("bookings", [mine]))

    def legacy_paths(self):
        """A path of before the owner folders, <booking id>/<file>, is the admin's alone until the move has run, and
        only under a folder named by one of the admin's own bookings."""
        store = self.users.service_storage(self.env)
        own, of_b, stray = "TEST01-leg/legacy.pdf", "TEST01-legb/legacy.pdf", "TEST01-none/legacy.pdf"
        b_root = f"{self.b.id}/b.pdf"
        store.remove("bookings", [own, of_b, stray, b_root])
        self.addCleanup(store.remove, "bookings", [own, of_b, stray, b_root])
        ok(self, self.a.rest.insert("bookings", [{"id": "TEST01-leg", "kind": "other"}]))
        ok(self, self.b.rest.insert("bookings", [{"id": "TEST01-legb", "kind": "other"}]))
        # the admin's own booking folder works
        self.assertNotIn(self.b.storage.upload("bookings", own, b"%PDF-1.4 x")[0], (200, 201))
        ok(self, self.a.storage.upload("bookings", own, b"%PDF-1.4 legacy"))
        self.assertEqual(self.a.storage.download("bookings", own), (200, b"%PDF-1.4 legacy"))
        self.assertNotEqual(self.b.storage.download("bookings", own)[0], 200)
        ok(self, self.a.storage.remove("bookings", [own]))
        # a folder named by B's booking, by no booking, or by B's user id is never the admin's
        self.assertNotIn(self.a.storage.upload("bookings", of_b, b"%PDF-1.4 x")[0], (200, 201))
        self.assertNotIn(self.a.storage.upload("bookings", stray, b"%PDF-1.4 x")[0], (200, 201))
        ok(self, self.b.storage.upload("bookings", b_root, b"%PDF-1.4 B root"))
        ok(self, store.upload("bookings", of_b, b"%PDF-1.4 B legacy"))
        for path in (b_root, of_b):
            with self.subTest(path=path.replace(self.b.id, "<B id>")):
                folder = path.split("/")[0]
                self.assertNotIn(self.a.storage.upload("bookings", path, b"%PDF-1.4 x", upsert=True)[0], (200, 201))
                self.assertNotIn(self.a.storage.update("bookings", path, b"%PDF-1.4 x")[0], (200, 201))
                self.assertNotEqual(self.a.storage.download("bookings", path)[0], 200)
                self.assertNotEqual(self.a.storage.sign("bookings", path)[0], 200)
                self.assertEqual(ok(self, self.a.storage.list("bookings", folder + "/")), [])
                self.a.storage.remove("bookings", [path])
                self.assertEqual(store.download("bookings", path)[0], 200, "the admin removed it")
        self.assertEqual(self.b.storage.download("bookings", b_root), (200, b"%PDF-1.4 B root"))

    def test_service_insert_lands_on_admin(self):
        got = ok(self, self.svc.insert("lodgings", [{"place_id": "TEST01", "name": "TEST01 service", "kind": "hostel",
                                                     "added_by": "claude"}]))
        self.assertEqual(got[0]["owner_id"], self.a.id)
        task = ok(self, self.svc.insert("tasks", [{"type": "place_research", "title": "TEST01"}]))
        self.assertEqual(task[0]["owner_id"], self.a.id)

    def test_only_admin_rows_mark_dirty(self):
        def clean():
            ok(self, self.svc.update("derive_state", "id=eq.1", {"dirty_at": None, "dirty_since": None}))

        def dirty():
            return ok(self, self.svc.select("derive_state", "select=dirty_at&id=eq.1"))[0]["dirty_at"] is not None

        for table in ("quotes", "task_log", "inbox"):
            with self.subTest(table=table):
                for who, feeds in ((self.b, False), (self.a, True)):
                    clean()
                    row = ok(self, who.rest.insert(table, [self.row(who, table)]))[0]
                    self.assertEqual(dirty(), feeds, ("insert", who.id))
                    clean()
                    ok(self, who.rest.update(table, self.where(table, row), CHANGE[table]))
                    self.assertEqual(dirty(), feeds, ("update", who.id))
                    clean()
                    ok(self, who.rest.delete(table, self.where(table, row)))
                    self.assertEqual(dirty(), feeds, ("delete", who.id))
                # a write that touches no row of the admin's leaves the build alone
                clean()
                ok(self, self.svc.update(table, f"{KEY[table]}=eq.0", CHANGE[table]))
                self.assertFalse(dirty())

    def test_no_private_table_is_published(self):
        """Postgres Changes skips row level security on a delete, so no private table may be in the publication."""
        import migrate
        with migrate.connect(self.env) as con:
            rows = con.execute("select tablename from pg_publication_tables where pubname = 'supabase_realtime' "
                               "and schemaname = 'public'").fetchall()
        published = {r[0] for r in rows}
        self.assertEqual(published & set(PRIVATE), set())
        self.assertIn("derive_state", published)

    def test_realtime_is_owner_scoped(self):
        """A inserts, updates and deletes a row of each table that was published before 0034 while B listens every way
        a client can: Postgres Changes on the table, B's own owner topic, and A's owner topic. B hears nothing of A's,
        not even a delete, and cannot join A's topic. A hears each of the three on A's topic, with the table as the
        event and no column of the row in the message. B's own insert reaches B's topic."""
        topic_a, topic_b = "owner:" + self.a.id, "owner:" + self.b.id
        for table in WAS_PUBLISHED:
            with self.subTest(table=table):
                changes = listen(self.env, self.b, "test-" + table, postgres_changes=table)
                feed_a = listen(self.env, self.a, topic_a, private=True)
                feed_b = listen(self.env, self.b, topic_b, private=True)
                spy = listen(self.env, self.b, topic_a, private=True)
                try:
                    for feed in (feed_a, feed_b):
                        feed.ready.wait(20)
                        self.assertTrue(feed.ready.is_set(), feed.errors)
                    # the table is out of the publication, so the server may accept the subscription or refuse it
                    deadline = time.time() + 20
                    while time.time() < deadline and not (changes.ready.is_set() or changes.errors):
                        time.sleep(0.2)
                    while time.time() < deadline and not (spy.ready.is_set() or spy.errors):
                        time.sleep(0.2)
                    other = ok(self, self.a.rest.insert(table, [self.row(self.a, table)]))[0]
                    q = self.where(table, other)
                    ok(self, self.a.rest.update(table, q, CHANGE[table]))
                    ok(self, self.a.rest.delete(table, q))
                    ok(self, self.b.rest.insert(table, [self.row(self.b, table)]))
                    deadline = time.time() + 20
                    while time.time() < deadline and not (feed_b.told(table) and len(feed_a.told(table)) >= 3):
                        time.sleep(0.2)
                    time.sleep(1)  # a late message would land by now
                finally:
                    for feed in (changes, feed_a, feed_b, spy):
                        feed.stop()
                self.assertEqual(changes.events, [], "B heard a change through Postgres Changes")
                self.assertTrue(changes.ready.is_set() or changes.errors, "the subscription never answered")
                self.assertFalse(spy.ready.is_set(), "B joined A's topic")
                self.assertTrue(spy.errors, "B's join of A's topic was never refused")
                self.assertEqual(spy.events, [], "B heard A's topic")
                self.assertEqual([p["op"] for p in feed_b.told(table)], ["insert"], "B's topic")
                told = feed_a.told(table)
                self.assertEqual([p["op"] for p in told], ["insert", "update", "delete"], "A's topic")
                for p in told:
                    self.assertEqual(set(p), {"op", "id"}, p)
                    self.assertNotIn(str(other[KEY[table]]), json.dumps(p))

    def test_derive_state_readable_names_no_trip(self):
        """The worker's run_build writes derive_state on a dropped trip and on a failure, and B reads it. The steps around
        the state are stubbed, the state is written and read for real."""
        import shutil, tempfile
        from unittest import mock
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(HERE)), "infra", "worker"))
        import steps
        secret = "TEST01-secret-trip"
        ok(self, self.a.rest.rpc("save_trip", {"trip": {"id": secret, "by": "TEST01"}}))
        ok(self, self.svc.update("derive_state", "id=eq.1", {"last_error": None, "last_warning": None}))
        rest = steps.store.Rest(self.env["SUPABASE_URL"], self.env["SUPABASE_SECRET_KEY"])
        work = tempfile.mkdtemp(prefix="TEST01-")
        self.addCleanup(shutil.rmtree, work, ignore_errors=True)

        def dropped(root):
            os.makedirs(os.path.join(root, "data", "web"), exist_ok=True)
            with open(os.path.join(root, "data", "web", "inout.json"), "w", encoding="utf-8") as fh:
                json.dump({}, fh)
            return [secret]

        def broken(root):
            raise ValueError(f"trip {secret} refused, booking TEST01 at row TEST01")

        def build(pulled):
            with mock.patch.object(steps.tripdb, "cmd_ingest_inbox"), mock.patch.object(steps.store, "SupabaseStore"), \
                 mock.patch.object(steps.tripdb, "cmd_pull"), \
                 mock.patch.object(steps, "refuse_empty_pull"), mock.patch.object(steps, "build_pulled", pulled), \
                 mock.patch.object(steps, "upload", return_value={"uploaded": 0, "manifest_hash": "0" * 64}), \
                 mock.patch.object(steps, "replace_derived", return_value=0):
                return steps.run_build(rest, os.path.join(work, "build"), version="test")

        cases = ((dropped, "last_warning", "1 trip left out of the build"), (broken, "last_error", "check failed, ValueError"))
        for pulled, column, value in cases:
            with self.subTest(column=column):
                got = build(pulled)
                self.assertEqual(got["built"], pulled is dropped, got)
                rows = ok(self, self.b.rest.select("derive_state", "select=*"))
                self.assertEqual(len(rows), 1, rows)
                self.assertEqual(rows[0][column], value)
                self.assertNotIn("TEST01", json.dumps(rows))
                self.assertNotIn(secret, json.dumps(rows))


class listen:
    """One Realtime channel as one user, in a thread. With postgres_changes it asks for every change of that table,
    otherwise it joins the topic as a broadcast channel, private when asked. events holds every postgres_changes or
    broadcast message as (event, payload). ready is set once the server accepts the join, errors holds each refusal."""

    def __init__(self, env, user, topic, postgres_changes=None, private=False):
        self.events, self.errors, self.ready, self.done = [], [], threading.Event(), threading.Event()
        self.thread = threading.Thread(target=self.run, args=(env, user, topic, postgres_changes, private), daemon=True)
        self.thread.start()

    def run(self, env, user, topic, table, private):
        try:
            from websockets.sync.client import connect
        except ImportError as e:
            self.errors.append(f"websockets is missing: {e}")
            return
        url = env["SUPABASE_URL"].replace("http", "ws", 1).rstrip("/")
        url += f"/realtime/v1/websocket?apikey={env['SUPABASE_PUBLISHABLE_KEY']}&vsn=1.0.0"
        changes = [{"event": "*", "schema": "public", "table": table}] if table else []
        config = {"broadcast": {"self": False, "ack": False}, "presence": {"key": ""}, "postgres_changes": changes,
                  "private": private}
        try:
            with connect(url, open_timeout=20) as ws:
                ws.send(json.dumps({"topic": "realtime:" + topic, "event": "phx_join", "ref": "1",
                                    "payload": {"config": config, "access_token": user.token}}))
                last_beat = time.time()
                while not self.done.is_set():
                    if time.time() - last_beat > 15:
                        ws.send(json.dumps({"topic": "phoenix", "event": "heartbeat", "payload": {}, "ref": "hb"}))
                        last_beat = time.time()
                    try:
                        msg = json.loads(ws.recv(timeout=0.5))
                    except TimeoutError:
                        continue
                    ev, pl = msg.get("event"), msg.get("payload") or {}
                    if ev == "system" and pl.get("extension") == "postgres_changes":
                        if pl.get("status") == "ok":
                            self.ready.set()
                        else:
                            self.errors.append(pl)
                    elif ev == "phx_reply" and msg.get("ref") == "1":
                        if pl.get("status") != "ok":
                            self.errors.append(pl)
                        elif not table:
                            self.ready.set()
                    elif ev == "phx_reply" and pl.get("status") != "ok":
                        self.errors.append(pl)
                    elif ev == "postgres_changes":
                        self.events.append((ev, pl.get("data") or {}))
                    elif ev == "broadcast":
                        self.events.append((pl.get("event"), pl.get("payload") or {}))
        except Exception as e:  # the test reads errors and fails with them
            self.errors.append(repr(e))

    def told(self, event):
        """The payloads of the broadcast messages named event, in the order they came."""
        return [p for e, p in list(self.events) if e == event]

    def stop(self):
        self.done.set()
        self.thread.join(5)


if __name__ == "__main__":
    unittest.main()
