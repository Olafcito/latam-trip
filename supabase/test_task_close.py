"""Tests of migrations 0025, 0026, 0030 and 0031 (a stay_details or stay_prices task closes when the data is complete).

Every case runs in one transaction that is always rolled back, so nothing is committed. Each migration is applied
inside that transaction when schema_migrations does not list it yet, so the tests run before and after it goes live.
They run on the local stack: bash supabase/local_up.sh writes an env file outside the repo, and TRIPDB_ENV_FILE names it.
Run: TRIPDB_DB_TESTS=1 TRIPDB_ENV_FILE=<file> uv run --quiet --no-project --with "psycopg[binary]" python -I -X utf8 supabase/test_task_close.py -v
Without TRIPDB_ENV_FILE they read SUPABASE_PASSWORD and SUPABASE_URL from the environment or .env and run on the
project, still rolled back. Skipped without TRIPDB_DB_TESTS=1.
"""
import json, os, sys, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
MIGRATIONS = ("0025_task_close_by_data.sql", "0026_task_close_full_dates.sql", "0030_stay_prices_close.sql",
              "0031_task_ids_per_owner.sql")
LINKS = json.dumps([{"site": "booking", "url": "https://example.com/TEST01"}])
PHOTO = json.dumps(["https://example.com/TEST01.jpg"])
WATCHED = ("tasks", "lodgings", "lodging_rooms", "lodging_prices")


@unittest.skipUnless(os.environ.get("TRIPDB_DB_TESTS") == "1", "set TRIPDB_DB_TESTS=1 to run against a database")
class TaskCloseTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import migrate
        cls.migrate = migrate
        cls.env = migrate.load_env()
        # rows inserted without an owner land on the admin, so a fresh local stack needs one. The project has one.
        if os.environ.get("TRIPDB_ENV_FILE"):
            sys.path.insert(0, os.path.join(HERE, "tests"))
            import users
            cls.a = users.admin(cls.env).id
            cls.b = users.make_user(cls.env, "b").id

    def setUp(self):
        migrate = self.migrate
        # a second connection that only counts, to see after the rollback that nothing was committed
        self.watch = migrate.connect(self.env)
        self.watch.autocommit = True
        self.before = self.counts(self.watch)
        self.con = migrate.connect(self.env)  # autocommit is False
        self.cur = self.con.cursor()
        self.addCleanup(self.finish)
        self.cur.execute("select to_regclass('public.schema_migrations')")
        applied = set()
        if self.cur.fetchone()[0] is not None:
            self.cur.execute("select name from public.schema_migrations where name = any(%s)", (list(MIGRATIONS),))
            applied = {r[0] for r in self.cur.fetchall()}
        for name in MIGRATIONS:
            if name not in applied:
                migrate.apply_file(self.cur, os.path.join(HERE, "migrations", name))

    def finish(self):
        try:
            self.con.rollback()
        finally:
            self.con.close()
            after = self.counts(self.watch)
            self.watch.close()
            self.assertEqual(self.before, after, "a test left rows behind")

    @staticmethod
    def counts(con):
        out = []
        with con.cursor() as c:
            for t in WATCHED:
                c.execute(f"select count(*) from public.{t}")
                out.append(c.fetchone()[0])
        return out

    # helpers
    def q(self, sql, args=None):
        self.cur.execute(sql, args)
        return self.cur.fetchall() if self.cur.description else None

    def lodging(self, photos="[]"):
        return self.q("insert into public.lodgings (place_id, name, kind, added_by, links, photos) "
                      "values ('TEST01', 'TEST01 hostel', 'hostel', 'claude', %s::jsonb, %s::jsonb) returning id",
                      (LINKS, photos))[0][0]

    def room(self, lodging, name="TEST01 room"):
        return self.q("insert into public.lodging_rooms (lodging_id, name) values (%s, %s) returning id", (lodging, name))[0][0]

    def price(self, room, ci, co, observed="now()"):
        self.q(f"insert into public.lodging_prices (room_id, check_in, check_out, total_dkk, observed_at) "
               f"values (%s, %s, %s, 100, {observed})", (room, ci, co))

    def photos(self, lodging):
        self.q("update public.lodgings set photos = %s::jsonb where id = %s", (PHOTO, lodging))

    def task(self, lodging):
        rows = self.q("select id, status, result, done_at from public.tasks "
                      "where data->>'type' = 'stay_details' and data->>'lodging_id' = %s order by id", (lodging,))
        self.assertEqual(len(rows), 1, "the booking link should have queued one stay_details task")
        return rows[0]

    def set_task(self, lodging, status=None, data=None):
        if status:
            self.q("update public.tasks set status = %s where data->>'lodging_id' = %s and data->>'type' = 'stay_details'", (status, lodging))
        if data:
            self.q("update public.tasks set data = data || %s::jsonb where data->>'lodging_id' = %s and data->>'type' = 'stay_details'",
                   (json.dumps(data), lodging))

    # cases
    def test_complete_lodging_closes_open_task(self):
        lid = self.lodging()
        rid = self.room(lid)
        self.assertEqual(self.task(lid)[1], "open")
        self.price(rid, "2026-12-03", "2026-12-06")
        self.assertEqual(self.task(lid)[1], "open")
        self.photos(lid)
        _, status, result, done_at = self.task(lid)
        self.assertEqual(status, "done")
        self.assertIsNotNone(done_at)
        self.assertEqual(result, "Closed by the data: 1 photos, 1 rooms, each priced for 2026-12-03 to 2026-12-06.")

    def test_no_photos_stays_open(self):
        lid = self.lodging()
        self.price(self.room(lid), "2026-12-03", "2026-12-06")
        self.assertEqual(self.task(lid)[1], "open")

    def test_one_room_unpriced_stays_open(self):
        lid = self.lodging(PHOTO)
        a = self.room(lid, "TEST01 a")
        self.room(lid, "TEST01 b")
        self.price(a, "2026-12-03", "2026-12-06")
        self.assertEqual(self.task(lid)[1], "open")

    def test_task_dates_must_match(self):
        lid = self.lodging(PHOTO)
        self.set_task(lid, data={"check_in": "2026-12-10", "check_out": "2026-12-12"})
        self.price(self.room(lid), "2026-12-03", "2026-12-06")
        self.assertEqual(self.task(lid)[1], "open")

    def test_latest_price_dates_when_task_has_none(self):
        lid = self.lodging(PHOTO)
        r1, r2 = self.room(lid, "TEST01 a"), self.room(lid, "TEST01 b")
        self.price(r1, "2026-12-01", "2026-12-02", "now() - interval '2 days'")
        self.price(r1, "2026-12-03", "2026-12-06")
        self.assertEqual(self.task(lid)[1], "open")
        self.price(r2, "2026-12-03", "2026-12-06")
        self.assertEqual(self.task(lid)[1], "done")

    def test_full_dates_win_over_newer_partial(self):
        lid = self.lodging()
        r1, r2 = self.room(lid, "TEST01 a"), self.room(lid, "TEST01 b")
        self.price(r1, "2026-12-03", "2026-12-06", "now() - interval '1 hour'")
        self.price(r2, "2026-12-03", "2026-12-06", "now() - interval '1 hour'")
        self.price(r1, "2026-12-03", "2026-12-08")
        self.photos(lid)
        _, status, result, _ = self.task(lid)
        self.assertEqual(status, "done")
        self.assertEqual(result, "Closed by the data: 1 photos, 2 rooms, each priced for 2026-12-03 to 2026-12-06.")

    def test_newest_full_dates_named(self):
        lid = self.lodging()
        r1, r2 = self.room(lid, "TEST01 a"), self.room(lid, "TEST01 b")
        for r in (r1, r2):
            self.price(r, "2026-12-03", "2026-12-06", "now() - interval '1 hour'")
            self.price(r, "2026-12-03", "2026-12-08")
        self.photos(lid)
        self.assertTrue(self.task(lid)[2].endswith("each priced for 2026-12-03 to 2026-12-08."))

    def test_working_closes_failed_untouched(self):
        lid = self.lodging()
        self.set_task(lid, status="working")
        self.price(self.room(lid), "2026-12-03", "2026-12-06")
        self.photos(lid)
        self.assertEqual(self.task(lid)[1], "done")
        lid2 = self.lodging()
        self.set_task(lid2, status="failed")
        self.q("update public.tasks set result = 'blocked' where data->>'lodging_id' = %s", (lid2,))
        self.price(self.room(lid2), "2026-12-03", "2026-12-06")
        self.photos(lid2)
        _, status, result, _ = self.task(lid2)
        self.assertEqual((status, result), ("failed", "blocked"))

    def test_room_delete_completes(self):
        lid = self.lodging(PHOTO)
        a = self.room(lid, "TEST01 a")
        spare = self.room(lid, "TEST01 b")
        self.price(a, "2026-12-03", "2026-12-06")
        self.assertEqual(self.task(lid)[1], "open")
        self.q("delete from public.lodging_rooms where id = %s", (spare,))
        self.assertEqual(self.task(lid)[1], "done")

    def test_backfill_closes_complete(self):
        lid = self.lodging(PHOTO)
        self.price(self.room(lid), "2026-12-03", "2026-12-06")
        self.set_task(lid, status="open")
        self.q("update public.tasks set done_at = null, result = null where data->>'lodging_id' = %s", (lid,))
        self.assertEqual(self.task(lid)[1], "open")
        closed = self.q("select public.close_stay_details(null)")[0][0]
        self.assertGreaterEqual(closed, 1)
        self.assertEqual(self.task(lid)[1], "done")
        left = self.q("select count(*) from public.tasks t where coalesce(t.type, t.data->>'type') = 'stay_details' "
                      "and t.status in ('open', 'working') and public.stay_details_complete(t.owner_id, t.data->>'lodging_id', "
                      "nullif(t.data->>'check_in', '')::date, nullif(t.data->>'check_out', '')::date)")[0][0]
        self.assertEqual(left, 0)

    def test_done_after_trigger_keeps_done(self):
        lid = self.lodging(PHOTO)
        self.price(self.room(lid), "2026-12-03", "2026-12-06")
        tid, status, result, _ = self.task(lid)
        self.assertEqual(status, "done")
        # the patch tasks.py done sends when it does not know the data closed the task
        self.q("update public.tasks set status = 'done', result = 'PC summary', done_at = now() where id = %s", (tid,))
        self.assertEqual(self.task(lid)[1], "done")

    # the cloud runner acts with the secret key, so only the admin's tasks wake it (finding 3, phase 4 task 4.1)
    def record_fires(self):
        self.q("create table if not exists public.fire_log (note text)")
        self.q("create or replace function public.fire_task_runner(note text) returns void language sql "
               "as $$ insert into public.fire_log values (note) $$")

    def fires(self):
        return [r[0] for r in self.q("select note from public.fire_log order by note")]

    def cloud_task(self, owner, age="0 minutes"):
        return self.q("insert into public.tasks (owner_id, type, title, data, created_at) "
                      "values (%s, 'question', 'TEST01', '{\"type\":\"question\"}'::jsonb, now() - %s::interval) returning id",
                      (owner, age))[0][0]

    def test_ping_ignores_other_owner(self):
        if not hasattr(self, "b"):
            self.skipTest("needs the local stack's two users")
        self.record_fires()
        self.cloud_task(self.b)
        self.assertEqual(self.fires(), [])
        tid = self.cloud_task(self.a)
        self.assertEqual(self.fires(), [f"task {tid} question"])

    def test_sweep_ignores_other_owner(self):
        if not hasattr(self, "b"):
            self.skipTest("needs the local stack's two users")
        self.record_fires()
        self.q("delete from public.tasks where status in ('open', 'working')")
        self.q("alter table public.tasks disable trigger tasks_ping_runner")
        self.cloud_task(self.b, "1 hour")
        self.q("select public.sweep_task_runner()")
        self.assertEqual(self.fires(), [])
        self.cloud_task(self.a, "1 hour")
        self.q("select public.sweep_task_runner()")
        self.assertEqual(self.fires(), ["sweep"])

    # stay_prices closes when every room of the task has a price for its dates seen after the task was queued (0030)
    def prices_task(self, lodging, rooms, ci="2026-12-03", co="2026-12-06", status="open", age="0 minutes", owner=None):
        self.record_fires()
        data = {"type": "stay_prices", "lodging_id": lodging, "room_ids": rooms, "check_in": ci, "check_out": co}
        return self.q("insert into public.tasks (owner_id, type, title, status, data, created_at) "
                      "values (coalesce(%s, public.admin_id()), 'stay_prices', 'TEST01', %s, %s::jsonb, now() - %s::interval) returning id",
                      (owner, status, json.dumps(data), age))[0][0]

    def state(self, tid):
        return self.q("select status, result from public.tasks where id = %s", (tid,))[0]

    def test_prices_close_when_every_room_is_priced(self):
        lid = self.lodging()
        a, b = self.room(lid, "TEST01 a"), self.room(lid, "TEST01 b")
        tid = self.prices_task(lid, [a, b])
        self.price(a, "2026-12-03", "2026-12-06")
        self.assertEqual(self.state(tid)[0], "open")
        self.price(b, "2026-12-03", "2026-12-06")
        self.assertEqual(self.state(tid), ("done", "Closed by the data: 2 rooms priced for 2026-12-03 to 2026-12-06."))

    def test_prices_older_than_the_task_do_not_close_it(self):
        lid = self.lodging()
        a, b = self.room(lid, "TEST01 a"), self.room(lid, "TEST01 b")
        self.price(a, "2026-12-03", "2026-12-06", "now() - interval '2 hours'")
        tid = self.prices_task(lid, [a, b], age="1 hour")
        self.price(b, "2026-12-03", "2026-12-06")
        self.assertEqual(self.state(tid)[0], "open")
        self.price(a, "2026-12-03", "2026-12-06")
        self.assertEqual(self.state(tid)[0], "done")

    def test_prices_other_dates_other_rooms_and_missing_rooms_stay_open(self):
        lid = self.lodging()
        a, spare = self.room(lid, "TEST01 a"), self.room(lid, "TEST01 b")
        other = self.lodging()
        stranger = self.room(other, "TEST01 c")
        wrong_dates = self.prices_task(lid, [a])
        missing = self.prices_task(lid, [a, "TEST01-gone"])
        elsewhere = self.prices_task(lid, [stranger])
        empty = self.prices_task(lid, [])
        self.price(a, "2026-12-03", "2026-12-08")
        self.price(spare, "2026-12-03", "2026-12-06")
        self.price(stranger, "2026-12-03", "2026-12-06")
        for tid in (wrong_dates, missing, elsewhere, empty):
            self.assertEqual(self.state(tid)[0], "open")
        self.price(a, "2026-12-03", "2026-12-06")
        self.assertEqual(self.state(wrong_dates)[0], "done")
        self.assertEqual(self.state(missing)[0], "open")

    def test_prices_working_closes_failed_untouched(self):
        lid = self.lodging()
        a = self.room(lid)
        working = self.prices_task(lid, [a], status="working")
        failed = self.prices_task(lid, [a], status="failed")
        self.q("update public.tasks set result = 'blocked' where id = %s", (failed,))
        self.price(a, "2026-12-03", "2026-12-06")
        self.assertEqual(self.state(working)[0], "done")
        self.assertEqual(self.state(failed), ("failed", "blocked"))

    def test_prices_of_another_owner_do_not_close_it(self):
        if not hasattr(self, "b"):
            self.skipTest("needs the local stack's two users")
        lid = self.lodging()
        a = self.room(lid)
        tid = self.prices_task(lid, [a])
        # B uses the same ids, which are free for B, and prices them for the same dates
        self.q("insert into public.lodgings (id, owner_id, place_id, name, kind, added_by, links) "
               "values (%s, %s, 'TEST01', 'TEST01 b hostel', 'hostel', 'claude', %s::jsonb)", (lid, self.b, LINKS))
        self.q("insert into public.lodging_rooms (id, owner_id, lodging_id, name) values (%s, %s, %s, 'TEST01 b')",
               (a, self.b, lid))
        self.q("insert into public.lodging_prices (owner_id, room_id, check_in, check_out, total_dkk) "
               "values (%s, %s, '2026-12-03', '2026-12-06', 100)", (self.b, a))
        self.assertEqual(self.state(tid)[0], "open")
        self.price(a, "2026-12-03", "2026-12-06")
        self.assertEqual(self.state(tid)[0], "done")

    def test_prices_backfill_and_bad_dates(self):
        lid = self.lodging()
        a = self.room(lid)
        tid = self.prices_task(lid, [a], age="1 hour")
        bad = self.prices_task(lid, [a], ci="not a date")
        self.q("update public.tasks set data = data || '{\"check_in\": \"not a date\"}' where id = %s", (bad,))
        self.q("alter table public.lodging_prices disable trigger lodging_prices_stay_prices_follow")
        self.price(a, "2026-12-03", "2026-12-06")
        self.q("alter table public.lodging_prices enable trigger lodging_prices_stay_prices_follow")
        self.assertEqual(self.state(tid)[0], "open")
        self.assertGreaterEqual(self.q("select public.close_stay_prices(null, null)")[0][0], 1)
        self.assertEqual(self.state(tid)[0], "done")
        self.assertEqual(self.state(bad)[0], "open")


if __name__ == "__main__":
    unittest.main()
