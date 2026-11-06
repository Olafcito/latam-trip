"""Tests for the fixes after the final review: task checks, flight source, trash restore, stateless http, the resource server guard.
Run: python -I -X utf8 -m unittest discover -s latam_trip_mcp -p "test_*.py" """
import asyncio, os, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_core import Base, tripdb, mcp_core  # noqa: E402


class TaskRest:
    def __init__(self):
        self.rows = [{"id": 1, "title": "t", "type": "flight_prices", "status": "open", "data": {}}]
        self.patches = []
        self.inserted = []
        self.reads = []

    def get_all(self, table, params):
        self.reads.append((table, params))
        return [dict(r) for r in self.rows]

    def patch(self, table, params, body, returning=None):
        self.patches.append(body)
        self.rows[0].update(body)

    def insert(self, table, rows, returning=None, **kw):
        self.inserted.extend(rows)
        return [{"id": 2}]


class TaskTest(Base):
    def setUp(self):
        super().setUp()
        self.rest = TaskRest()
        self.store.kind = "supabase"
        self.store.rest = self.rest
        real = self.store.query
        self.store.query = lambda table, *a, **k: [dict(r) for r in self.rest.rows] if table == "tasks" else real(table, *a, **k)

    def test_task_list_reads_only_the_owners_tasks(self):
        self.core.list("task")
        self.assertEqual([(t, p.get("owner_id")) for t, p in self.rest.reads], [("tasks", "eq.OWNER1")])

    def test_add_task_refuses_an_unknown_field_and_a_nul(self):
        out = self.core.add("task", [{"title": "x", "bogus": 1}, {"title": "a" + chr(0) + "b"}])
        self.assertEqual(len(out["refused"]), 2, out)
        self.assertEqual(self.rest.inserted, [])

    def test_update_task_checks_the_merged_row_and_keeps_the_old_one(self):
        with self.assertRaises(tripdb.Refused):
            self.core.update("task", "1", {"status": "nonsense"})
        self.assertEqual(self.rest.patches, [])
        self.core.update("task", "1", {"status": "working"})
        self.assertEqual(self.rest.patches, [{"status": "working"}])
        self.assertEqual(self.core.trash()[-1]["action"], "update")


class UpdateRestoreTest(Base):
    def test_flight_from_another_source_cannot_be_changed(self):
        out = self.core.add("flight", [{"from": "SJO", "to": "LIR", "date": "2026-12-12", "price": 450}])
        fid = out["added"][0]
        row = self.store.query("quotes")[0]
        self.assertEqual(row["source"], "chat")
        self.store.remove("quotes", {"quote_id": fid})
        # a quote from the crawler, stored the way the build reads it
        crawl, errs = self.core.chat_flight({"from": "SJO", "to": "LIR", "date": "2026-12-13", "price": 500})
        crawl["source"] = "gflights"
        self.store.add_quotes([crawl], "x.jsonl")
        cid = mcp_core.cols.qr.quote_id(crawl)
        with self.assertRaises(tripdb.Refused):
            self.core.update("flight", cid, {"price": 1})

    def test_flight_update_twice_keeps_one_notes_prefix(self):
        fid = self.core.add("flight", [{"from": "SJO", "to": "LIR", "date": "2026-12-12", "price": 450, "notes": "hello"}])["added"][0]
        new = self.core.update("flight", fid, {"price": 400})["updated"]
        new = self.core.update("flight", new, {"price": 390})["updated"]
        notes = self.core.get("flight", new)["notes"]
        self.assertEqual(notes, "site=chat; hello")

    def test_flight_update_then_restore_puts_the_old_price_back_and_removes_the_new(self):
        fid = self.core.add("flight", [{"from": "SJO", "to": "LIR", "date": "2026-12-12", "price": 450}])["added"][0]
        new = self.core.update("flight", fid, {"price": 400})["updated"]
        self.core.update("flight", fid, restore=True)
        prices = sorted(r["price_dkk"] for r in self.store.query("quotes"))
        self.assertEqual(prices, [450])
        self.assertEqual(self.core.trash(), [])
        self.assertTrue(new)

    def test_connection_update_then_restore_with_a_changed_key(self):
        out = self.core.add("connection", [{"from": "SJO", "to": "LIR", "mode": "bus", "hours": 4.0, "price_dkk": 90}])
        self.assertEqual(out["refused"], [], out)
        cid = out["added"][0]
        new = self.core.update("connection", cid, {"mode": "shuttle"})["updated"]
        self.assertNotEqual(new, cid)
        modes = sorted(r["mode"] for r in self.store.rows("connections") if r["from"] == "SJO" and r["to"] == "LIR")
        self.assertEqual(modes, ["shuttle"])
        self.core.update("connection", cid, restore=True)
        modes = sorted(r["mode"] for r in self.store.rows("connections") if r["from"] == "SJO" and r["to"] == "LIR")
        self.assertEqual(modes, ["bus"])

    def test_trip_update_that_changes_nothing_leaves_no_trash(self):
        trip = self.trip()
        out = self.core.update("trip", "t1", {"why": trip["why"]})
        self.assertTrue(out["skipped"])
        self.assertEqual(self.core.trash(), [])

    def test_trip_update_then_restore(self):
        self.core.update("trip", "t1", {"why": "second"})
        self.assertEqual(len(self.core.trash()), 1)
        self.core.update("trip", "t1", restore=True)
        self.assertEqual(self.trip()["why"], "A test trip")
        self.assertEqual(self.core.trash(), [])

    def test_a_restore_that_fails_keeps_the_trash_entry(self):
        self.core.delete("place", "NOSA")
        real = self.store.add
        self.store.add = lambda *a, **k: (_ for _ in ()).throw(tripdb.Refused("boom"))
        with self.assertRaises(tripdb.Refused):
            self.core.update("place", "NOSA", restore=True)
        self.store.add = real
        self.assertEqual(len(self.core.trash()), 1)
        self.core.update("place", "NOSA", restore=True)
        self.assertEqual(self.core.trash(), [])


class StatelessTest(unittest.TestCase):
    def test_the_asgi_app_is_built_stateless(self):
        from latam_trip_mcp import server
        with open(os.path.join(os.path.dirname(server.__file__), "server.py"), encoding="utf-8") as fh:
            self.assertIn("stateless_http=True", fh.read())


class DocsTest(Base):
    def test_the_connector_page_names_every_tool(self):
        with open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "docs", "connector.md"), encoding="utf-8") as fh:
            doc = fh.read()
        missing = [s["name"] for s in self.core.tool_specs() if f"`{s['name']}`" not in doc]
        self.assertEqual(missing, [])


class GuardTest(unittest.TestCase):
    """The resource server guard: the metadata names Supabase, a request without a good bearer gets a 401 that points at
    the metadata, and a good one reaches the tools with its user id."""

    def setUp(self):
        from latam_trip_mcp import server
        self.server = server
        self.seen = []
        self.saved = os.environ.get("SUPABASE_URL")
        os.environ["SUPABASE_URL"] = "https://proj.test"
        self.addCleanup(lambda: os.environ.__setitem__("SUPABASE_URL", self.saved) if self.saved else os.environ.pop("SUPABASE_URL", None))

        async def inner(scope, receive, send):
            self.seen.append(server.caller.get())
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"ok"})
        self.app = server.guard(inner, lambda t: "user-1" if t == "good" else None, lambda h: "https://mcp.test")

    def call(self, path, bearer=None):
        out = []
        headers = [(b"authorization", f"Bearer {bearer}".encode())] if bearer is not None else []

        async def send(m):
            out.append(m)
        asyncio.run(self.app({"type": "http", "path": path, "headers": headers}, None, send))
        head = {k.decode(): v.decode() for k, v in out[0].get("headers", [])}
        return out[0]["status"], head, out[1]["body"]

    def test_the_metadata_names_supabase_as_the_authorization_server(self):
        import json
        status, _, body = self.call("/.well-known/oauth-protected-resource/mcp")
        meta = json.loads(body)
        self.assertEqual(status, 200)
        self.assertEqual(meta["resource"], "https://mcp.test/mcp")
        self.assertEqual(meta["authorization_servers"], ["https://proj.test/auth/v1"])
        self.assertEqual(meta["scopes_supported"], ["email"])
        self.assertEqual(self.call("/.well-known/oauth-protected-resource")[0], 200)

    def test_no_bearer_gets_a_401_with_the_metadata_url(self):
        status, head, _ = self.call("/mcp")
        self.assertEqual(status, 401)
        self.assertEqual(head["www-authenticate"], 'Bearer resource_metadata="https://mcp.test/.well-known/oauth-protected-resource/mcp"')

    def test_a_refused_bearer_says_invalid_token(self):
        status, head, _ = self.call("/mcp", "bad")
        self.assertEqual(status, 401)
        self.assertIn('error="invalid_token"', head["www-authenticate"])
        self.assertIn("resource_metadata=", head["www-authenticate"])
        self.assertEqual(self.seen, [])

    def test_a_good_bearer_reaches_the_tools_with_its_user(self):
        status, _, _ = self.call("/mcp", "good")
        self.assertEqual(status, 200)
        self.assertEqual(self.seen, [("good", "user-1")])
        self.assertIsNone(self.server.caller.get())

    def test_the_old_sign_in_routes_are_gone(self):
        for path in ("/authorize", "/token", "/register", "/signin/approve", "/.well-known/oauth-authorization-server"):
            self.assertEqual(self.call(path)[0], 401, path)


if __name__ == "__main__":
    unittest.main()
