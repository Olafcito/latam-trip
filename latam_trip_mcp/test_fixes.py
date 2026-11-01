"""Tests for the fixes after the final review: task checks, flight source, trash restore, stateless http, oauth tokens.
Run: python -I -X utf8 -m unittest discover -s latam_trip_mcp -p "test_*.py" """
import asyncio, os, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from test_core import Base, tripdb, mcp_core  # noqa: E402
from latam_trip_mcp import oauth  # noqa: E402


class TaskRest:
    def __init__(self):
        self.rows = [{"id": 1, "title": "t", "type": "flight_prices", "status": "open", "data": {}}]
        self.patches = []
        self.inserted = []

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


class OauthTest(unittest.TestCase):
    def setUp(self):
        self.db = {}
        self.saved = (oauth._get, oauth._put, oauth._delete)
        oauth._get = lambda pk: self.db.get(pk)
        oauth._put = lambda item: self.db.__setitem__(item["pk"], item)
        oauth._delete = lambda pk: self.db.pop(pk, None)
        self.addCleanup(lambda: [setattr(oauth, n, f) for n, f in zip(("_get", "_put", "_delete"), self.saved)])

    def test_a_code_is_stored_hashed_and_works_once(self):
        code = oauth.create_code("c1", "https://x.test/cb", "ch")
        self.assertFalse(any(code in pk for pk in self.db))
        self.assertEqual(oauth.consume_code(code)["client_id"], "c1")
        self.assertIsNone(oauth.consume_code(code))

    def test_a_refresh_token_is_bound_to_its_client_and_rotates(self):
        _, refresh, _ = oauth.issue_tokens("c1")
        self.assertIsNone(oauth.refresh_access(refresh, "c2"))
        access, exp, new_refresh = oauth.refresh_access(refresh, "c1")
        self.assertNotEqual(new_refresh, refresh)
        self.assertIsNone(oauth.refresh_access(refresh, "c1"))
        self.assertIsNotNone(oauth.refresh_access(new_refresh, "c1"))

    def test_the_login_page_names_where_it_sends_you(self):
        page = oauth.login_page({"redirect_uri": "https://claude.ai/api/mcp/auth_callback"})
        self.assertIn("claude.ai", page)


if __name__ == "__main__":
    unittest.main()
