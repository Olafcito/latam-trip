"""Tests of migration 0025 (a stay_details task closes when its lodging is complete) against the live project.

Every case runs in one transaction that is always rolled back, so nothing is committed. The migration is applied
inside that transaction when schema_migrations does not list it yet, so the tests run before and after it goes live.
Run: TRIPDB_DB_TESTS=1 uv run --quiet --no-project --with "psycopg[binary]" python -I -X utf8 -m unittest supabase.test_task_close -v
Needs SUPABASE_PASSWORD and SUPABASE_URL in the environment or in .env. Skipped without TRIPDB_DB_TESTS=1.
"""
import json, os, sys, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
MIGRATION = "0025_task_close_by_data.sql"
LINKS = json.dumps([{"site": "booking", "url": "https://example.com/TEST01"}])
PHOTO = json.dumps(["https://example.com/TEST01.jpg"])
WATCHED = ("tasks", "lodgings", "lodging_rooms", "lodging_prices")


@unittest.skipUnless(os.environ.get("TRIPDB_DB_TESTS") == "1", "set TRIPDB_DB_TESTS=1 to run against the project")
class TaskCloseTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import migrate
        cls.migrate = migrate
        cls.env = migrate.load_env()

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
        applied = False
        if self.cur.fetchone()[0] is not None:
            self.cur.execute("select 1 from public.schema_migrations where name = %s", (MIGRATION,))
            applied = self.cur.fetchone() is not None
        if not applied:
            migrate.apply_file(self.cur, os.path.join(HERE, "migrations", MIGRATION))

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
                      "and t.status in ('open', 'working') and public.stay_details_complete(t.data->>'lodging_id', "
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


if __name__ == "__main__":
    unittest.main()
