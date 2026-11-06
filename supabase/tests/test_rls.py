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
CATALOGUE = {
    "airports": ("code", {"code": "TS1"}, {"name": "TEST01 airport"}),
    "places": ("id", {"id": "TEST01-place"}, {"name": "TEST01 place"}),
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
        for table in ("admins", "inbox_tokens", "leases", "derived_options", "stays", "site_calls", "hostelworld_cities",
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

    def test_bucket_folders(self):
        mine = f"{self.a.id}/TEST01/a.pdf"
        theirs = f"{self.b.id}/TEST01/b.pdf"
        # the users live on between runs, so a run that stopped halfway leaves its files behind
        self.users.service_storage(self.env).remove("bookings", [mine, theirs, f"{self.a.id}/TEST01/b.pdf",
                                                                 f"{self.b.id}/TEST01/a.pdf", "TEST01/legacy.pdf"])
        # a path of before the owner folders is the admin's alone until the move has run
        self.assertNotIn(self.b.storage.upload("bookings", "TEST01/legacy.pdf", b"%PDF-1.4 x")[0], (200, 201))
        ok(self, self.a.storage.upload("bookings", "TEST01/legacy.pdf", b"%PDF-1.4 legacy"))
        self.assertNotEqual(self.b.storage.download("bookings", "TEST01/legacy.pdf")[0], 200)
        ok(self, self.a.storage.remove("bookings", ["TEST01/legacy.pdf"]))
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

    def test_realtime_is_owner_scoped(self):
        seen = listen(self.env, self.b, "lodgings")
        try:
            seen.ready.wait(20)
            self.assertTrue(seen.ready.is_set(), seen.errors)
            other = self.lodging(self.a, "TEST01 of A")
            own = self.lodging(self.b, "TEST01 of B")
            deadline = time.time() + 20
            while time.time() < deadline and own not in seen.ids:
                time.sleep(0.2)
            time.sleep(1)  # a late event for A's row would land by now
        finally:
            seen.stop()
        self.assertIn(own, seen.ids, seen.errors)
        self.assertNotIn(other, seen.ids)

    def test_derive_state_readable_names_no_trip(self):
        ok(self, self.a.rest.rpc("save_trip", {"trip": {"id": "TEST01-secret-trip", "by": "TEST01"}}))
        rows = ok(self, self.b.rest.select("derive_state", "select=*"))
        self.assertEqual(len(rows), 1, rows)
        self.assertNotIn("TEST01-secret-trip", json.dumps(rows))


class listen:
    """A Realtime subscription to one table's inserts as one user, in a thread. ids holds the ids it was told about."""

    def __init__(self, env, user, table):
        self.ids, self.errors, self.ready, self.done = [], [], threading.Event(), threading.Event()
        self.thread = threading.Thread(target=self.run, args=(env, user, table), daemon=True)
        self.thread.start()

    def run(self, env, user, table):
        try:
            from websockets.sync.client import connect
        except ImportError as e:
            self.errors.append(f"websockets is missing: {e}")
            return
        url = env["SUPABASE_URL"].replace("http", "ws", 1).rstrip("/")
        url += f"/realtime/v1/websocket?apikey={env['SUPABASE_PUBLISHABLE_KEY']}&vsn=1.0.0"
        try:
            with connect(url, open_timeout=20) as ws:
                ws.send(json.dumps({"topic": "realtime:test-" + table, "event": "phx_join", "ref": "1", "payload": {
                    "config": {"postgres_changes": [{"event": "INSERT", "schema": "public", "table": table}]},
                    "access_token": user.token}}))
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
                    elif ev == "phx_reply" and (pl.get("status") != "ok"):
                        self.errors.append(pl)
                    elif ev == "postgres_changes":
                        rec = (pl.get("data") or {}).get("record") or {}
                        self.ids.append(rec.get("id"))
        except Exception as e:  # the test reads errors and fails with them
            self.errors.append(repr(e))

    def stop(self):
        self.done.set()
        self.thread.join(5)


if __name__ == "__main__":
    unittest.main()
