"""Tests for export_account, delete_account and the connector's writes a minute (FEAT-006 tasks 6.2 and 6.3).

The unit tests run the Core on a fake PostgREST and Storage and need nothing online. The last class runs the real
connector on the local Supabase stack, signs people in through the whole OAuth flow as claude.ai would, and deletes
accounts it made itself. It runs only with TRIPDB_DB_TESTS=1 and TRIPDB_ENV_FILE naming the file supabase/local_up.sh
wrote, and needs fastmcp, uvicorn, pyjwt and psycopg:

  TRIPDB_DB_TESTS=1 TRIPDB_ENV_FILE=<file> uv run --quiet --no-project --python 3.12 --with "fastmcp==3.4.2" \\
    --with "uvicorn==0.54.0" --with "pyjwt[crypto]==2.10.1" --with "psycopg[binary]==3.3.8" \\
    python -I -X utf8 -m unittest discover -s latam_trip_mcp -p "test_account.py" -v
"""
import datetime as dt, json, os, sys, time, unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, ".."))
for p in (REPO, os.path.join(REPO, "plugin", "scripts"), os.path.join(REPO, "supabase"), os.path.join(REPO, "supabase", "tests")):
    if p not in sys.path:
        sys.path.insert(0, p)

import tripdb_store  # noqa: E402
from latam_trip_mcp import core as mcp_core  # noqa: E402

ME, OTHER = "TEST01-me", "TEST01-other"
EVERY_TABLE = set(mcp_core.ACCOUNT_TABLES) | set(mcp_core.SERVICE_TABLES)


def refusal(name, message, status=400):
    """A RestError as PostgREST gives it when a function raises."""
    return tripdb_store.RestError(f"POST /rest/v1/rpc/{name} gave {status}: " + json.dumps({"code": "42501", "message": message}))


class FakeRest:
    """PostgREST and Storage as the caller ME sees them: a row of ME and a row of OTHER in every private table, and a
    booking file of each. The database refuses delete_account while a file of ME is left, as 0037 does."""

    def __init__(self):
        self.rows = {t: [{"owner_id": ME, "n": 1}, {"owner_id": OTHER, "n": 2}] for t in mcp_core.ACCOUNT_TABLES}
        self.files = {f"{ME}/b1/ticket.pdf", f"{ME}/b2/a.pdf", f"{ME}/b2/b.pdf", f"{OTHER}/b9/ticket.pdf"}
        self.calls, self.refuse, self.fail_deletes = [], {}, 0

    def get_all(self, table, params=None, **kw):
        self.calls.append(("get_all", table, dict(params or {})))
        return [r for r in self.rows[table] if params.get("owner_id") == "eq." + r["owner_id"]]

    def rpc(self, name, body=None):
        self.calls.append(("rpc", name, body))
        if name in self.refuse:
            raise self.refuse[name]
        if name == "delete_account":
            if any(f.startswith(ME + "/") for f in self.files):
                raise refusal(name, "Files are left in the bookings bucket. Remove them first, then delete the account.")
            for rows in self.rows.values():
                rows[:] = [r for r in rows if r["owner_id"] != ME]
            return {t: 1 for t in sorted(EVERY_TABLE)}
        return True if name == "may_delete_account" else 1

    def storage_list(self, bucket, prefix):
        assert bucket == "bookings", bucket
        found = {}
        for f in self.files:
            if f.startswith(prefix):
                head, sep, _ = f[len(prefix):].partition("/")
                found[head] = None if sep else "TEST01-object"
        return [{"name": n, "id": i} for n, i in sorted(found.items())]

    def storage_delete(self, bucket, paths):
        self.calls.append(("storage_delete", sorted(paths)))
        if self.fail_deletes:
            self.fail_deletes -= 1
            raise tripdb_store.RestError('DELETE /storage/v1/object/bookings gave 503: {"message": "TEST01 storage down"}')
        self.files -= set(paths)


class FakeStore:
    kind = "supabase"

    def __init__(self, rest):
        self.rest = rest


class AccountTest(unittest.TestCase):
    def setUp(self):
        self.rest = FakeRest()
        self.core = mcp_core.Core(FakeStore(self.rest), owner=ME)

    def rpcs(self):
        return [c[1] for c in self.rest.calls if c[0] == "rpc"]

    def test_export_has_every_table(self):
        out = self.core.call("export_account")
        self.assertEqual(set(out["tables"]), set(mcp_core.ACCOUNT_TABLES))
        self.assertIn("user_profiles", out["tables"])
        for t, rows in out["tables"].items():
            self.assertEqual(rows, [{"owner_id": ME, "n": 1}], t)
        for _, t, params in (c for c in self.rest.calls if c[0] == "get_all"):
            self.assertEqual(params["owner_id"], "eq." + ME)
            self.assertTrue(params["order"].endswith(".asc"), params)
        # the paths of the caller's files only, never their bytes and never another person's
        self.assertEqual(out["files"], [f"{ME}/b1/ticket.pdf", f"{ME}/b2/a.pdf", f"{ME}/b2/b.pdf"])
        json.dumps(out)

    def test_the_private_tables_are_named_once(self):
        self.assertFalse(set(mcp_core.ACCOUNT_TABLES) & set(mcp_core.SERVICE_TABLES))
        self.assertEqual(len(mcp_core.SERVICE_TABLES), len(set(mcp_core.SERVICE_TABLES)))

    def test_delete_counts_every_private_table(self):
        out = self.core.call("delete_account", {"email": "Test01@Example.test"})
        self.assertEqual(set(out["deleted"]), EVERY_TABLE)
        self.assertEqual(out["files"], 3)
        self.assertEqual(self.rest.files, {f"{OTHER}/b9/ticket.pdf"})
        self.assertEqual(self.rpcs(), ["may_delete_account", "delete_account"])
        self.assertEqual(self.rest.calls[-1], ("rpc", "delete_account", {"p_email": "Test01@Example.test"}))
        self.assertTrue(all(r["owner_id"] == OTHER for rows in self.rest.rows.values() for r in rows))

    def test_delete_needs_the_email(self):
        for empty in ("", "   ", None):
            with self.assertRaises(tripdb_store.Refused) as got:
                self.core.delete_account(empty)
            self.assertIn("typed by the person", str(got.exception))
        self.rest.refuse["may_delete_account"] = refusal(
            "may_delete_account", "The email does not match this account. The person types the email their account signs in with.", 403)
        with self.assertRaises(tripdb_store.Refused) as got:
            self.core.delete_account("someone-else@example.test")
        # the message reads as a sentence, without the HTTP wrapping, and not a file or a row is touched
        self.assertEqual(str(got.exception), "The email does not match this account. The person types the email their account signs in with.")
        self.assertEqual(len(self.rest.files), 4)
        self.assertEqual(self.rpcs(), ["may_delete_account"])
        self.assertNotIn("storage_delete", [c[0] for c in self.rest.calls])

    def test_the_admin_is_refused_before_a_file_goes(self):
        self.rest.refuse["may_delete_account"] = refusal("may_delete_account", "The admin account cannot be deleted this way.", 403)
        with self.assertRaises(tripdb_store.Refused) as got:
            self.core.delete_account("admin@example.test")
        self.assertIn("admin", str(got.exception))
        self.assertEqual(len(self.rest.files), 4)

    def test_delete_retries_after_storage_failure(self):
        self.rest.fail_deletes = 1
        with self.assertRaises(tripdb_store.Refused) as got:
            self.core.delete_account("test01@example.test")
        self.assertIn("nothing was deleted", str(got.exception))
        self.assertEqual(self.rpcs(), ["may_delete_account"])
        self.assertEqual(len(self.rest.files), 4)
        self.assertTrue(all(len(rows) == 2 for rows in self.rest.rows.values()))
        out = self.core.delete_account("test01@example.test")
        self.assertEqual(out["files"], 3)
        self.assertEqual(self.rpcs(), ["may_delete_account", "may_delete_account", "delete_account"])

    def test_a_file_storage_keeps_stops_the_delete(self):
        # Storage answers but removes nothing, as it does for a path the policy hides
        self.rest.storage_delete = lambda bucket, paths: None
        with self.assertRaises(tripdb_store.Refused) as got:
            self.core.delete_account("test01@example.test")
        self.assertIn("3 booking files could not be removed", str(got.exception))
        self.assertNotIn("delete_account", self.rpcs())

    def test_the_account_is_kept_in_the_project_only(self):
        core = mcp_core.Core(type("Files", (), {"kind": "files"})(), owner=ME)
        for name, args in (("export_account", {}), ("delete_account", {"email": "test01@example.test"})):
            with self.assertRaises(tripdb_store.Refused):
                core.call(name, args)

    def test_the_descriptions_say_permanent_and_typed(self):
        specs = {s["name"]: s for s in self.core.tool_specs()}
        text = specs["delete_account"]["description"]
        self.assertIn("permanent", text)
        self.assertIn("typed by the person", text)
        self.assertIn("admin", text)
        self.assertIn("typed by the person", specs["delete_account"]["schema"]["properties"]["email"]["description"])
        self.assertEqual(specs["delete_account"]["schema"]["required"], ["email"])
        self.assertIn("delete_account", specs["export_account"]["description"])


class GateTest(unittest.TestCase):
    def setUp(self):
        self.rest = FakeRest()
        self.core = mcp_core.Core(FakeStore(self.rest), owner=ME)

    def test_a_write_counts_and_a_read_does_not(self):
        for name in ("update_profile", "add_trip", "delete_flight", "claim_task", "list_add", "delete_account"):
            self.core.gate(name)
        for name in ("list_trip", "get_booking", "get_profile", "export_account"):
            self.core.gate(name)
        sent = [c[2]["p_write"] for c in self.rest.calls if c[:2] == ("rpc", "connector_call")]
        self.assertEqual(sent, [True] * 6 + [False] * 4)

    def test_every_tool_is_a_read_or_a_write(self):
        names = {s["name"] for s in self.core.tool_specs()}
        reads = mcp_core.Core.read_tools()
        self.assertLessEqual(reads, names)
        for name in reads:
            self.assertRegex(name, r"^(list_|get_|export_)")
        for name in names - reads:
            self.assertNotRegex(name, r"^(get_|export_)")

    def test_the_limit_is_a_plain_tool_error(self):
        self.rest.refuse["connector_call"] = tripdb_store.RestError(
            'POST /rest/v1/rpc/connector_call gave 400: {"code": "P0001", "message": "The limit is 60 changes a minute per '
            'person, and this one would pass it. Wait a minute and try again.", "hint": "owner_limits names the limit."}')
        with self.assertRaises(tripdb_store.Refused) as got:
            self.core.gate("update_profile")
        self.assertEqual(str(got.exception), "The limit is 60 changes a minute per person, and this one would pass it. Wait a minute and try again.")

    def test_the_file_store_has_no_gate(self):
        mcp_core.Core(type("Files", (), {"kind": "files"})(), owner=ME).gate("update_profile")

    def test_the_server_gates_before_the_tool_runs(self):
        try:
            from fastmcp.exceptions import ToolError
        except ImportError:
            self.skipTest("needs fastmcp")
        from latam_trip_mcp import server
        ran = []
        self.rest.refuse["connector_call"] = refusal("connector_call", "This account was deleted. Sign in again with an account that exists.", 403)
        self.core.update_profile = lambda patch: ran.append(patch)
        mcp = server.build_mcp(lambda: self.core)
        tool = asyncio_run(mcp.get_tool("update_profile"))
        with self.assertRaises(ToolError) as got:
            asyncio_run(tool.run({"patch": {"home_airport": "CPH"}}))
        self.assertIn("deleted", str(got.exception))
        self.assertEqual(ran, [])


def asyncio_run(coro):
    import asyncio
    return asyncio.run(coro)


# ---- the local stack --------------------------------------------------------------------------------------------

PLACE = "TMCPACCT"
PDF = b"%PDF-1.4 TEST01"

if os.environ.get("TRIPDB_DB_TESTS") == "1":
    from latam_trip_mcp.test_auth import ConnectorStack, mcp_call
else:  # the class below is skipped, and test_auth needs pyjwt to import
    ConnectorStack, mcp_call = unittest.TestCase, None


@unittest.skipUnless(os.environ.get("TRIPDB_DB_TESTS") == "1", "set TRIPDB_DB_TESTS=1 and TRIPDB_ENV_FILE to the local stack")
class AccountDbTest(ConnectorStack):
    """Accounts made here and deleted here, through the real connector. Each delete takes a person of its own, made
    again on the next run. A and the admin are only read."""

    @classmethod
    def setUpClass(cls):
        import migrate, users
        cls.env = env = migrate.load_env()
        users.refuse(env)
        cls.users, cls.migrate = users, migrate
        cls.svc = users.service(env)
        cls.admin = users.admin(env)
        cls.a = users.make_user(env, "mcp-account-a")
        got = cls.svc.insert("places", [{"id": PLACE, "name": "TEST01 place"}], on_conflict="id", resolution="merge-duplicates")
        assert got[0] in (200, 201), got
        cls.start_connector()

    @classmethod
    def tearDownClass(cls):
        cls.stop_connector()
        cls.wipe(cls.a)
        cls.svc.delete("places", f"id=eq.{PLACE}")

    # ---- people and their rows ----

    @classmethod
    def wipe(cls, user):
        """Every row of user that these tests make, and their files."""
        for t in ("lodgings", "bookings", "trips", "user_documents", "quotes", "tasks", "task_log", "agent_usage",
                  "inbox", "inbox_tokens", "user_profiles"):
            cls.svc.delete(t, f"owner_id=eq.{user.id}")
        _, listed = user.storage.list("bookings", user.id + "/")
        for folder in listed or []:
            _, inner = user.storage.list("bookings", f"{user.id}/{folder['name']}/")
            user.storage.remove("bookings", [f"{user.id}/{folder['name']}/{f['name']}" for f in inner or []])

    def ok(self, got):
        self.assertIn(got[0], (200, 201, 204), got)
        return got[1]

    def seed(self, user):
        """A row of user in every private table a person or the worker writes, and one booking file. The file path."""
        self.wipe(user)
        uid, tag = user.id, "TEST01-" + user.email.split("@")[0]
        trip = {"id": tag, "version": 1, "name": tag, "saved_at": "2026-11-06T00:00:00Z", "by": "migration",
                "why": "TEST01 account test", "way_in": {}, "way_home": {}, "places": []}
        self.ok(user.rest.insert("trips", [{"id": tag, "version": 1, "data": trip}]))
        self.ok(user.rest.insert("user_documents", [{"name": tag, "data": {"note": "TEST01"}}]))
        self.ok(user.rest.insert("quotes", [{"quote_id": tag, "notes": "TEST01"}]))
        self.ok(user.rest.insert("user_profiles", [{"owner_id": uid, "home_airport": "CPH"}]))
        booking = self.ok(user.rest.insert("bookings", [{"kind": "other", "notes": "TEST01"}]))[0]
        self.ok(user.rest.insert("lodgings", [{"id": tag, "place_id": PLACE, "name": "TEST01 hostel", "kind": "hostel",
                                                "added_by": "TEST01"}]))
        self.ok(user.rest.insert("lodging_rooms", [{"id": tag + "-room", "lodging_id": tag, "name": "TEST01 dorm"}]))
        self.ok(user.rest.insert("lodging_prices", [{"id": tag + "-price", "room_id": tag + "-room",
                                                     "check_in": "2026-12-03", "check_out": "2026-12-06", "per_night_dkk": 100}]))
        self.ok(user.rest.insert("tasks", [{"type": "stay_prices", "status": "working", "title": "TEST01"}]))
        # the rows only the worker and the service write
        self.ok(self.svc.insert("task_log", [{"owner_id": uid, "summary": "TEST01"}]))
        self.ok(self.svc.insert("agent_usage", [{"owner_id": uid, "agent": "TEST01"}]))
        self.ok(self.svc.insert("inbox", [{"owner_id": uid, "status": "new", "file": "TEST01"}]))
        self.ok(self.svc.insert("inbox_tokens", [{"owner_id": uid, "name": tag, "token_hash": tag}]))
        path = f"{uid}/{booking['id']}/ticket.pdf"
        self.ok(user.storage.upload("bookings", path, PDF))
        return path

    def counts(self, user):
        """The rows user owns in every owner_id table, read with the secret key."""
        with self.migrate.connect(self.env) as con:
            out = {}
            for t in sorted(self.owner_tables(con)):
                out[t] = con.execute(f'select count(*) from public."{t}" where owner_id = %s', (user.id,)).fetchone()[0]
            return out

    @staticmethod
    def owner_tables(con):
        return {r[0] for r in con.execute(
            "select c.table_name from information_schema.columns c join information_schema.tables t "
            "on t.table_schema = c.table_schema and t.table_name = c.table_name "
            "where c.table_schema = 'public' and c.column_name = 'owner_id' and t.table_type = 'BASE TABLE'").fetchall()}

    def files(self, user):
        _, listed = self.users.service_storage(self.env).list("bookings", user.id + "/")
        return listed or []

    def exists(self, user):
        with self.migrate.connect(self.env) as con:
            return con.execute("select count(*) from auth.users where id = %s", (user.id,)).fetchone()[0] == 1

    def gone(self, label):
        """A person made for one delete, their rows and a file, and their connector token."""
        user = self.users.make_user(self.env, label)
        self.seed(user)
        (bearer,) = self.connect(user)
        return user, bearer

    # ---- the tests ----

    def test_every_owner_id_table_is_named_and_cascades(self):
        with self.migrate.connect(self.env) as con:
            self.assertEqual(self.owner_tables(con), EVERY_TABLE,
                             "a table with owner_id is missing from ACCOUNT_TABLES or SERVICE_TABLES in core.py, or is named there and gone")
            loose = con.execute("select conrelid::regclass::text from pg_catalog.pg_constraint where contype = 'f' "
                                "and confrelid = 'auth.users'::regclass and confdeltype <> 'c' "
                                "and connamespace = 'public'::regnamespace").fetchall()
            self.assertEqual(loose, [])
            keyed = {r[0] for r in con.execute(
                "select c.relname from pg_catalog.pg_constraint k join pg_catalog.pg_class c on c.oid = k.conrelid "
                "join pg_catalog.pg_attribute a on a.attrelid = k.conrelid and a.attnum = any(k.conkey) "
                "where k.contype = 'f' and k.confrelid = 'auth.users'::regclass and a.attname = 'owner_id' "
                "and k.connamespace = 'public'::regnamespace").fetchall()}
            self.assertEqual(set(EVERY_TABLE), keyed,
                             "an owner_id column has no key to auth.users, so a delete would leave its rows")

    def test_export_has_every_table(self):
        b = self.users.make_user(self.env, "mcp-account-b")
        path = self.seed(b)
        self.seed(self.a)
        (bearer,) = self.connect(b)
        self.tool(bearer, "update_profile", {"patch": {"home_airport": "MAD"}})
        out = self.tool(bearer, "export_account", {})
        self.assertEqual(set(out["tables"]), set(mcp_core.ACCOUNT_TABLES))
        for t, rows in out["tables"].items():
            self.assertTrue(rows, f"{t} came back empty")
            self.assertEqual({r["owner_id"] for r in rows}, {b.id}, t)
        self.assertEqual(out["tables"]["user_profiles"][0]["home_airport"], "MAD")
        self.assertEqual(out["files"], [path])
        self.wipe(b)

    def test_delete_counts_every_private_table(self):
        user, bearer = self.gone("mcp-account-gone-1")
        before = self.counts(user)
        out = self.tool(bearer, "delete_account", {"email": user.email.upper()})
        self.assertEqual(set(out["deleted"]), EVERY_TABLE)
        for t in mcp_core.ACCOUNT_TABLES:
            self.assertGreaterEqual(out["deleted"][t], 1, t)
        # the counts are what the person owned when the delete ran, the write the delete itself counted included
        for t, n in before.items():
            self.assertEqual(out["deleted"][t], n + (1 if t == "connector_writes" and not n else 0), t)
        self.assertEqual(out["files"], 1)
        self.assertFalse(self.exists(user))
        self.assertEqual(set(self.counts(user).values()), {0})
        self.assertEqual(self.files(user), [])

    def test_delete_leaves_another_person_untouched(self):
        path = self.seed(self.a)
        before = self.counts(self.a)
        user, bearer = self.gone("mcp-account-gone-2")
        self.tool(bearer, "delete_account", {"email": user.email})
        after = self.counts(self.a)
        self.assertEqual(after, before)
        self.assertTrue(self.exists(self.a))
        self.assertEqual([f["name"] for f in self.files(self.a)], [path.split("/")[1]])
        got = self.a.storage.download("bookings", path)
        self.assertEqual(got, (200, PDF))

    def test_a_deleted_persons_old_token_fails_cleanly(self):
        user, bearer = self.gone("mcp-account-gone-3")
        self.tool(bearer, "delete_account", {"email": user.email})
        for name, args in (("list_trip", {}), ("update_profile", {"patch": {"home_airport": "MAD"}}), ("export_account", {})):
            text = self.tool(bearer, name, args, refused=True)
            self.assertIn("This account was deleted", text)
        # and no row came back with the call
        self.assertEqual(set(self.counts(user).values()), {0})

    def test_delete_needs_the_email(self):
        user, bearer = self.gone("mcp-account-gone-4")
        before = self.counts(user)
        for wrong in ("someone-else@example.test", " ", user.email + ".other"):
            text = self.tool(bearer, "delete_account", {"email": wrong}, refused=True)
            self.assertTrue("does not match" in text or "typed by the person" in text, text)
        self.assertTrue(self.exists(user))
        self.assertEqual(len(self.files(user)), 1)
        after = self.counts(user)
        # only the refused calls were counted as writes
        self.assertEqual({t: n for t, n in after.items() if t != "connector_writes"},
                         {t: n for t, n in before.items() if t != "connector_writes"})
        # the admin is refused by the check delete_account runs first, which deletes nothing
        code, body = self.admin.rest.rpc("may_delete_account", {"p_email": self.admin.email})
        self.assertNotEqual(code, 200, body)
        self.assertIn("admin account cannot be deleted", body["message"])
        with self.migrate.connect(self.env) as con:
            src = con.execute("select prosrc from pg_catalog.pg_proc where proname = 'delete_account'").fetchone()[0]
        self.assertLess(src.index("may_delete_account"), src.index("delete from auth.users"))
        # without a sign in nothing is asked
        anon = self.users.Rest(self.env["SUPABASE_URL"], self.env["SUPABASE_PUBLISHABLE_KEY"])
        for fn in ("may_delete_account", "delete_account"):
            self.assertNotEqual(anon.rpc(fn, {"p_email": user.email})[0], 200)
        self.tool(bearer, "delete_account", {"email": user.email})

    def test_delete_retries_after_storage_failure(self):
        user, bearer = self.gone("mcp-account-gone-5")
        before = self.counts(user)
        down = tripdb_store.RestError('DELETE /storage/v1/object/bookings gave 503: {"message": "TEST01 storage down"}')
        with mock.patch.object(tripdb_store.Rest, "storage_delete", side_effect=down):
            text = self.tool(bearer, "delete_account", {"email": user.email}, refused=True)
        self.assertIn("nothing was deleted", text)
        self.assertTrue(self.exists(user))
        self.assertEqual(len(self.files(user)), 1)
        self.assertEqual({t: n for t, n in self.counts(user).items() if t != "connector_writes"},
                         {t: n for t, n in before.items() if t != "connector_writes"})
        # the database refuses too while a file is left, so no other way round the files deletes the rows
        code, body = user.rest.rpc("delete_account", {"p_email": user.email})
        self.assertNotEqual(code, 200, body)
        self.assertIn("Files are left", body["message"])
        self.assertTrue(self.exists(user))
        out = self.tool(bearer, "delete_account", {"email": user.email})
        self.assertEqual(out["files"], 1)
        self.assertFalse(self.exists(user))
        self.assertEqual(self.files(user), [])

    def writes_this_minute(self, user):
        with self.migrate.connect(self.env) as con:
            got = con.execute("select coalesce(sum(writes), 0) from public.connector_writes where owner_id = %s "
                              "and minute = date_trunc('minute', now())", (user.id,)).fetchone()[0]
        return int(got)

    def fresh_minute(self, *people):
        """No count left for these people, and a minute with time enough for 61 calls."""
        with self.migrate.connect(self.env) as con:
            for u in people:
                con.execute("delete from public.connector_writes where owner_id = %s", (u.id,))
            con.commit()
        second = dt.datetime.now().second
        if second > 40:
            time.sleep(61 - second)

    def test_the_61st_write_is_refused_and_another_person_is_unaffected(self):
        from latam_trip_mcp import server
        c = self.users.make_user(self.env, "mcp-account-c")
        d = self.users.make_user(self.env, "mcp-account-d")
        bc, bd = self.connect(c, d)
        self.fresh_minute(c, d)
        core = server.core_for(bc)
        for _ in range(59):
            core.gate("update_profile")
        self.tool(bc, "update_profile", {"patch": {"home_airport": "CPH"}})
        self.assertEqual(self.writes_this_minute(c), 60)
        text = self.tool(bc, "update_profile", {"patch": {"home_airport": "MAD"}}, refused=True)
        self.assertIn("The limit is 60 changes a minute per person", text)
        self.assertNotIn("gave 4", text)
        # the refused write changed nothing, and reads stay free
        self.assertEqual(self.tool(bc, "get_profile", {})["profile"]["home_airport"], "CPH")
        self.tool(bc, "list_trip", {})
        self.tool(bd, "update_profile", {"patch": {"home_airport": "LIM"}})
        self.assertEqual(self.writes_this_minute(d), 1)
        for u in (c, d):
            self.svc.delete("user_profiles", f"owner_id=eq.{u.id}")

    def test_the_count_is_no_clients_to_read_or_write(self):
        c = self.users.make_user(self.env, "mcp-account-c")
        code, body = c.rest.select("connector_writes")
        self.assertNotEqual(code, 200, body)
        code, body = c.rest.insert("connector_writes", [{"owner_id": c.id, "minute": "2026-11-06T00:00:00Z", "writes": 0}])
        self.assertNotIn(code, (200, 201), body)
        # the function counts the caller only, whatever it is given
        code, body = c.rest.rpc("connector_call", {"p_write": False})
        self.assertEqual((code, body), (200, 0))


if __name__ == "__main__":
    unittest.main()
