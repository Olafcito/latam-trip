"""Offline tests of the cutover helpers of tripdb: the wipe list, the way map guard, cutover-done, dump and the values
the database cannot hold. A fake REST client stands in for the project, so no key or network is needed.
Run: python -I -X utf8 -m unittest discover -s plugin/scripts -p "test_cutover.py"
"""
import contextlib, io, json, math, os, sys, tempfile, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tripdb  # noqa: E402
import tripdb_store as S  # noqa: E402


class FakeRest:
    """Holds a row count per table, records deletes and inserts."""

    def __init__(self, held=None, docs=None):
        self.held, self.docs = dict(held or {}), list(docs or [])
        self.deleted, self.inserted = [], []

    def _call(self, method, path, **kw):
        table = path.split("/rest/v1/")[1].split("?")[0]
        return 206, {"Content-Range": f"0-0/{self.held.get(table, 0)}"}, b"[]"

    def get_all(self, table, params=None, **kw):
        if table == "documents":
            want = (params or {}).get("name", "").replace("eq.", "")
            return [d for d in self.docs if d["name"] == want]
        return [{"n": i} for i in range(self.held.get(table, 0))]

    def delete(self, table, params):
        self.deleted.append(table)

    def insert(self, table, rows, on_conflict=None, returning=None, resolution=None):
        self.inserted.append((table, rows))
        if table == "documents" and resolution == "ignore-duplicates":
            fresh = [r for r in rows if r["name"] not in {d["name"] for d in self.docs}]
            self.docs += fresh
            return [{"name": r["name"]} for r in fresh]
        return []

    def rpc(self, *a, **kw):
        return None


def run(fn, *a, **kw):
    out = io.StringIO()
    with contextlib.redirect_stdout(out):
        return fn(*a, **kw)


class WipeTest(unittest.TestCase):
    def setUp(self):
        self.src = tempfile.mkdtemp(prefix="tripdb-cut-")

    def test_wipe_clears_tasks_inbox_and_derived_options(self):
        for t in ("tasks", "inbox", "derived_options"):
            self.assertEqual(tripdb.WIPE_KEY[t], "id")
        with open(os.path.join(self.src, "way_id_map.json"), "w") as fh:
            fh.write("{}")
        rest = FakeRest(held={"tasks": 2, "inbox": 3, "derived_options": 1, "places": 1})
        run(tripdb.cmd_import, self.src, True, rest)
        self.assertEqual(sorted(rest.deleted), ["derived_options", "inbox", "places", "tasks"])

    def test_leftover_inbox_row_blocks_an_import_without_wipe(self):
        rest = FakeRest(held={"inbox": 1})
        with self.assertRaises(tripdb.Refused) as cm:
            run(tripdb.cmd_import, self.src, False, rest)
        self.assertIn("inbox 1", str(cm.exception))

    def test_wipe_refuses_without_a_way_map_and_touches_nothing(self):
        rest = FakeRest(held={"places": 1})
        with self.assertRaises(tripdb.Refused) as cm:
            run(tripdb.cmd_import, self.src, True, rest)
        self.assertIn("way_id_map.json", str(cm.exception))
        self.assertEqual(rest.deleted, [])
        self.assertEqual(rest.inserted, [])

    def test_wipe_still_refuses_after_cutover(self):
        with open(os.path.join(self.src, "way_id_map.json"), "w") as fh:
            fh.write("{}")
        rest = FakeRest(held={"places": 1}, docs=[{"name": "cutover_done"}])
        with self.assertRaises(tripdb.Refused):
            run(tripdb.cmd_import, self.src, True, rest)
        self.assertEqual(rest.deleted, [])


class CutoverDoneTest(unittest.TestCase):
    def test_writes_a_non_null_document_once(self):
        rest = FakeRest()
        self.assertTrue(run(tripdb.cmd_cutover_done, rest))
        doc = rest.docs[0]
        self.assertEqual(doc["name"], "cutover_done")
        self.assertTrue(doc["data"]["at"])
        self.assertFalse(run(tripdb.cmd_cutover_done, rest))
        self.assertEqual(len(rest.docs), 1)

    def test_the_command_is_dispatched_and_documented(self):
        self.assertIn("cutover-done", tripdb.__doc__)
        with open(tripdb.__file__, encoding="utf-8") as fh:
            self.assertIn('cmd == "cutover-done"', fh.read())

    def test_a_written_marker_stops_the_wipe_guard(self):
        rest = FakeRest()
        run(tripdb.cmd_cutover_done, rest)
        self.assertTrue(rest.get_all("documents", {"name": "eq.cutover_done"}))


class DumpTest(unittest.TestCase):
    def test_dump_includes_owners_and_inbox_tokens(self):
        names = [t for t, _, _ in tripdb.DUMP_TABLES]
        self.assertIn("owners", names)
        self.assertIn("inbox_tokens", names)
        rest = FakeRest(held={"owners": 1, "inbox_tokens": 1})
        with tempfile.TemporaryDirectory() as out:
            counts = run(tripdb.cmd_dump, out, rest)
            self.assertEqual((counts["owners"], counts["inbox_tokens"]), (1, 1))
            self.assertTrue(os.path.exists(os.path.join(out, "owners.jsonl")))
            self.assertTrue(os.path.exists(os.path.join(out, "inbox_tokens.jsonl")))


class UnstorableTest(unittest.TestCase):
    def test_detects_nan_infinity_and_lone_surrogates(self):
        for bad in (math.nan, math.inf, -math.inf, "a\ud800b", {"k": ["x", {"y": float("nan")}]}, {"a\udc00": 1}):
            self.assertTrue(S.has_unstorable(bad), repr(bad))
        for ok in (1.5, "café \U0001F600", {"a": [1, None, True]}):
            self.assertFalse(S.has_unstorable(ok), repr(ok))

    def test_a_num_field_refuses_nan_and_infinity(self):
        self.assertTrue(tripdb._is(1.5, "num"))
        self.assertFalse(tripdb._is(math.nan, "num"))
        self.assertFalse(tripdb._is(math.inf, "num"))

    def test_a_row_with_a_bad_value_is_refused_per_row(self):
        row = {"kind": "node", "id": "SJO", "name": "x\ud800", "country": "CR", "lat": 1, "lon": 1, "type": "city"}
        self.assertEqual(tripdb.row_errors("places", row), [tripdb.BAD_WHY])
        row["name"] = "San Jose"
        row["lat"] = math.nan
        self.assertEqual(tripdb.row_errors("places", row), [tripdb.BAD_WHY])

    def test_a_quote_with_a_bad_value_is_refused(self):
        self.assertEqual(tripdb.quote_errors({"price": math.inf}), [tripdb.BAD_WHY])

    def test_the_client_raises_a_rest_error_not_a_unicode_error(self):
        rest = S.Rest("http://127.0.0.1:9", "k")
        for body in ([{"a": "\ud800"}], [{"a": math.nan}]):
            with self.assertRaises(S.RestError):
                rest._call("POST", "/rest/v1/x", body=body)


if __name__ == "__main__":
    unittest.main()
