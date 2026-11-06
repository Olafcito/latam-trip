"""Tests of migrations 0027 and 0028 on the data they meet live: every row of before belongs to the admin.

The first test rebuilds the public schema up to 0026 inside one transaction, seeds every table that gains an owner and
the personal documents, applies 0027 and 0028 and checks that every row carries the admin's id, that no row was lost
and that the personal documents moved to user_documents. The transaction is always rolled back.
The second test stores booking files at the paths of before, runs move_booking_files.py and checks that the files and
the bookings rows point at <admin id>/<booking id>/<file>. It writes to the local stack and cleans up after itself.

Both run on the local stack only: bash supabase/local_up.sh writes an env file outside the repo, and TRIPDB_ENV_FILE
names it. Skipped without TRIPDB_DB_TESTS=1.
Run: TRIPDB_DB_TESTS=1 TRIPDB_ENV_FILE=<file> uv run --quiet --no-project --with "psycopg[binary]" python -I -X utf8 supabase/tests/test_owner_migration.py -v
"""
import glob, io, os, re, sys, unittest
from contextlib import redirect_stdout

HERE = os.path.dirname(os.path.abspath(__file__))
SUPA = os.path.dirname(HERE)
sys.path[:0] = [HERE, SUPA]
MIGRATIONS = os.path.join(SUPA, "migrations")
OWNED = ("trips", "bookings", "lodgings", "lodging_rooms", "lodging_prices", "quotes", "tasks", "task_log", "inbox",
         "agent_usage", "inbox_tokens")
PERSONAL = ("lists.json", "trip.json", "mcp_trash.json", "web_trips", "way_id_map", "unresolved_journeys",
            "current_plan")
SEED = """
insert into public.trips (id, version, data) values ('TEST01', 1, '{}'), ('TEST01', 2, '{}'), ('TEST01-b', 1, '{}');
insert into public.bookings (id, kind, attachments)
  values ('TEST01-a', 'other', '[{"path": "TEST01-a/TEST01.pdf", "name": "TEST01.pdf"}]'), ('TEST01-b', 'other', '[]');
insert into public.lodgings (id, place_id, name, kind, added_by) values ('TEST01-l', 'TEST01', 'TEST01', 'hostel', 'claude');
insert into public.lodging_rooms (id, lodging_id, name) values ('TEST01-r', 'TEST01-l', 'TEST01');
insert into public.lodging_prices (room_id, check_in, check_out, total_dkk) values ('TEST01-r', '2026-12-01', '2026-12-03', 100);
insert into public.quotes (quote_id) values ('TEST01-q1'), ('TEST01-q2');
insert into public.tasks (type, title) values ('place_research', 'TEST01');
insert into public.task_log (summary) values ('TEST01');
insert into public.inbox (file) values ('TEST01.jsonl');
insert into public.agent_usage (round) values ('TEST01');
insert into public.inbox_tokens (name, token_hash) values ('TEST01', 'TEST01');
insert into public.documents (name, data) values ('bag_rules.json', '{}');
"""


def env_or_skip():
    import migrate, users
    env = migrate.load_env()
    users.refuse(env)
    return env


@unittest.skipUnless(os.environ.get("TRIPDB_DB_TESTS") == "1", "set TRIPDB_DB_TESTS=1 to run against a database")
class OwnerMigrationTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        import migrate, users
        cls.migrate, cls.users = migrate, users
        cls.env = env_or_skip()
        cls.a = users.admin(cls.env)

    def test_rows_of_before_land_on_the_admin(self):
        migrate = self.migrate
        con = migrate.connect(self.env)
        self.addCleanup(con.close)
        self.addCleanup(con.rollback)
        notices = []
        con.add_notice_handler(lambda d: notices.append(d.message_primary))
        cur = con.cursor()
        cur.execute("drop schema public cascade")
        cur.execute("create schema public")
        cur.execute("grant usage on schema public to anon, authenticated, service_role")
        cur.execute("create table public.schema_migrations (name text primary key, "
                    "applied_at timestamptz not null default now())")
        files = sorted(glob.glob(os.path.join(MIGRATIONS, "*.sql")))
        for path in files:
            if os.path.basename(path) >= "0027":
                break
            migrate.apply_file(cur, path)
        cur.execute("insert into public.owners (user_id) values (%s)", (self.a.id,))
        cur.execute(SEED)
        cur.execute("insert into public.documents (name, data) select unnest(%s::text[]), '{}'::jsonb", (list(PERSONAL),))
        before = {}
        for t in OWNED:
            cur.execute(f"select count(*) from public.{t}")
            before[t] = cur.fetchone()[0]
            self.assertGreater(before[t], 0, t)
        notices.clear()
        for name in ("0027_owners.sql", "0028_bookings_bucket_folders.sql"):
            migrate.apply_file(cur, os.path.join(MIGRATIONS, name))

        for t in OWNED:
            with self.subTest(table=t):
                cur.execute(f"select count(*), count(*) filter (where owner_id = %s) from public.{t}", (self.a.id,))
                self.assertEqual(cur.fetchone(), (before[t], before[t]))
                self.assertIn(f"owner_id set to the admin on {before[t]} rows of {t}", notices)
        cur.execute("select name, owner_id::text from public.user_documents order by name")
        self.assertEqual(cur.fetchall(), sorted((n, self.a.id) for n in PERSONAL))
        self.assertIn(f"owner_id set to the admin on {len(PERSONAL)} rows of user_documents, moved from documents",
                      notices)
        cur.execute("select name from public.documents")
        self.assertEqual(cur.fetchall(), [("bag_rules.json",)])
        cur.execute("select user_id::text from public.admins")
        self.assertEqual(cur.fetchall(), [(self.a.id,)])
        # the same trip name is one trip per owner, its latest version
        cur.execute("select id, version, owner_id::text from public.trips_latest order by id")
        self.assertEqual(cur.fetchall(), [("TEST01", 2, self.a.id), ("TEST01-b", 1, self.a.id)])
        # a room and a price keep their parent through the composite keys
        cur.execute("select r.owner_id = l.owner_id, p.owner_id = r.owner_id from public.lodging_prices p "
                    "join public.lodging_rooms r on r.id = p.room_id join public.lodgings l on l.id = r.lodging_id")
        self.assertEqual(cur.fetchall(), [(True, True)])

    def test_move_booking_files(self):
        import move_booking_files
        users, svc = self.users, self.users.service(self.env)
        store = users.service_storage(self.env)
        b = users.make_user(self.env, "b")
        old = ["TEST01-mv/one.pdf", "TEST01-mv/two.pdf"]
        new = [f"{self.a.id}/{p}" for p in old]
        others = f"{b.id}/TEST01-mv/b.pdf"

        def clean():
            store.remove("bookings", old + new + [others])
            svc.delete("bookings", "id=eq.TEST01-mv")
        clean()
        self.addCleanup(clean)
        for p in old:
            code, body = store.upload("bookings", p, b"%PDF-1.4 " + p.encode())
            self.assertIn(code, (200, 201), body)
        self.assertIn(store.upload("bookings", others, b"%PDF-1.4 B")[0], (200, 201))
        attachments = [{"path": p, "name": p.split("/")[1], "type": "application/pdf", "size": 1} for p in old]
        code, body = svc.insert("bookings", [{"id": "TEST01-mv", "kind": "other", "attachments": attachments}])
        self.assertIn(code, (200, 201), body)

        def run(*argv):
            out = io.StringIO()
            with redirect_stdout(out):
                code = move_booking_files.main(list(argv))
            return code, out.getvalue()

        code, out = run()
        self.assertEqual(code, 0, out)
        self.assertIn("files to move 2, bookings to update 1", out)
        self.assertEqual(store.download("bookings", old[0])[0], 200)  # a dry run moves nothing
        code, out = run("--apply")
        self.assertEqual(code, 0, out)
        self.assertNotIn("TEST01", out)  # counts only, never a path
        for p, q in zip(old, new):
            self.assertEqual(self.a.storage.download("bookings", q), (200, b"%PDF-1.4 " + p.encode()))
            self.assertNotEqual(store.download("bookings", p)[0], 200)
        self.assertEqual(b.storage.download("bookings", others), (200, b"%PDF-1.4 B"))
        code, rows = svc.select("bookings", "id=eq.TEST01-mv&select=attachments")
        self.assertEqual([a["path"] for a in rows[0]["attachments"]], new)
        self.assertEqual([a["name"] for a in rows[0]["attachments"]], ["one.pdf", "two.pdf"])
        # B cannot reach the admin's moved files
        self.assertNotEqual(b.storage.download("bookings", new[0])[0], 200)
        # a second run finds nothing left
        code, out = run("--apply")
        self.assertEqual(code, 0, out)
        self.assertIn("files to move 0, bookings to update 0", out)


if __name__ == "__main__":
    unittest.main()
