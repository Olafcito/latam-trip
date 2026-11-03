"""Tests of the REST client, import and pull. The live ones need TRIPDB_LIVE_TESTS=1 and the project keys, empty the project
first, so they skip on a project without test_reset, which the real one dropped at cutover.
Run: TRIPDB_LIVE_TESTS=1 python -I -X utf8 -m unittest discover -s plugin/scripts -p "test_roundtrip.py"
"""
import csv, glob, http.server, json, os, sys, tempfile, threading, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import tripdb  # noqa: E402
import tripdb_cols as C  # noqa: E402
import tripdb_store as S  # noqa: E402

LIVE = os.environ.get("TRIPDB_LIVE_TESTS") == "1"
SRC = os.path.join(REPO, "data", "sources")


# ---- a fake server that caps its pages ----

class Fake(http.server.BaseHTTPRequestHandler):
    rows, cap, fail_at, claim_total, calls = [], 3, None, None, 0

    def log_message(self, *a):
        pass

    def do_GET(self):
        cls = type(self)
        cls.calls += 1
        a, b = (int(x) for x in self.headers["Range"].split("-"))
        if cls.fail_at is not None and a >= cls.fail_at:
            self.send_response(500)
            self.end_headers()
            self.wfile.write(b'{"message":"boom"}')
            return
        page = cls.rows[a:min(b + 1, a + cls.cap)]
        total = cls.claim_total if cls.claim_total is not None else len(cls.rows)
        body = json.dumps(page).encode()
        self.send_response(206)
        self.send_header("Content-Range", f"{a}-{a + len(page) - 1}/{total}" if page else f"*/{total}")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


class RestTest(unittest.TestCase):
    def setUp(self):
        Fake.rows, Fake.cap, Fake.fail_at, Fake.claim_total, Fake.calls = [{"n": i} for i in range(10)], 3, None, None, 0
        self.srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Fake)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()
        self.rest = S.Rest(f"http://127.0.0.1:{self.srv.server_address[1]}", "sekret-value-123")

    def tearDown(self):
        self.srv.shutdown()
        self.srv.server_close()

    def test_get_all_pages_to_content_range(self):
        got = self.rest.get_all("t", {"select": "*"}, page=100)
        self.assertEqual([r["n"] for r in got], list(range(10)))
        self.assertEqual(Fake.calls, 4)

    def test_get_all_raises_when_a_page_fails(self):
        Fake.fail_at = 6
        with self.assertRaises(S.RestError) as cm:
            self.rest.get_all("t", page=100)
        self.assertIn("500", str(cm.exception))

    def test_get_all_raises_on_short_total(self):
        Fake.claim_total = 12
        with self.assertRaises(S.RestError):
            self.rest.get_all("t", page=100)

    def test_the_key_is_not_in_an_error(self):
        Fake.fail_at = 0
        with self.assertRaises(S.RestError) as cm:
            self.rest.get_all("t")
        self.assertNotIn("sekret-value-123", str(cm.exception))


# ---- the real files ----

def read(path):
    with open(path, encoding="utf-8") as fh:
        return [json.loads(l) for l in fh if l.strip()]


def cfg():
    with open(os.path.join(SRC, "trip.json"), encoding="utf-8") as fh:
        return json.load(fh)


def raw_quotes():
    return [q for f in tripdb.quote_files(SRC) for q in read(f)]


def parsed(table, rec):
    return {k: (C.parse_ts(v) if k in C.COLS[table].stamps and v is not None else v) for k, v in rec.items()}


@unittest.skipUnless(os.path.isdir(SRC), "source files are removed after the Supabase cutover")
class FilesTest(unittest.TestCase):
    def test_foreign_keys_hold_on_real_data(self):
        places = {p["id"] for p in C.fold_places(read(os.path.join(SRC, "places.jsonl")))}
        codes = {p["iata"] for p in C.fold_places(read(os.path.join(SRC, "places.jsonl"))) if p.get("iata")}
        self.assertTrue(places)
        for r in read(os.path.join(SRC, "connections.jsonl")):
            self.assertIn(r["from"], places)
            self.assertIn(r["to"], places)
        for f in ("profiles.jsonl", "place_images.jsonl"):
            for r in read(os.path.join(SRC, f)):
                self.assertIn(r["id"], places, f)
        for r in read(os.path.join(SRC, "stays.jsonl")):
            self.assertIn(r["place"], places)
        quotes = C.fold_quotes(raw_quotes(), cfg())
        stubs = {r[c] for r in quotes for c in ("first_from", "first_to", "last_from", "last_to") if r.get(c)} - codes
        self.assertEqual(len(stubs), 14)

    def test_connections_are_unique_on_their_key(self):
        keys = [(r["from"], r["to"], r["mode"], r.get("operator")) for r in read(os.path.join(SRC, "connections.jsonl"))]
        self.assertEqual(len(keys), len(set(keys)))


@unittest.skipUnless(LIVE, "set TRIPDB_LIVE_TESTS=1 to run against the project")
class LiveTest(unittest.TestCase):
    counts = {}

    def setUp(self):
        self.rest = tripdb._rest(REPO)
        try:
            self.rest.rpc("test_reset")
        except S.RestError as e:
            # the real project dropped test_reset at cutover, and these tests empty the project they run on
            if " gave 404" in str(e):
                self.skipTest("the project has no test_reset, so it is the real one. Point .env at a throwaway project to run these")
            raise

    def test_import_refuses_when_rows_exist(self):
        self.rest.insert("airports", [{"code": "ZZZ"}])
        with self.assertRaises(tripdb.Refused) as cm:
            tripdb.cmd_import(SRC, rest=self.rest)
        self.assertIn("airports 1", str(cm.exception))
        self.assertEqual(len(self.rest.get_all("places")), 0)

    def test_round_trip_real_data(self):
        counts = tripdb.cmd_import(SRC, rest=self.rest)
        type(self).counts = counts
        self.assertEqual((counts["places_in_file"], counts["places"]), (98, 88))
        self.assertEqual((counts["profiles_in_file"], counts["profiles"]), (123, 118))
        self.assertEqual(counts["airport_stubs_from_quotes"], 14)
        with tempfile.TemporaryDirectory() as out:
            tripdb.cmd_pull(out, rest=self.rest)
            same = [("places", "places.jsonl", C.fold_places(read(os.path.join(SRC, "places.jsonl")))),
                    ("connections", "connections.jsonl", read(os.path.join(SRC, "connections.jsonl"))),
                    ("profiles", "profiles.jsonl", C.fold_profiles(read(os.path.join(SRC, "profiles.jsonl")))),
                    ("place_images", "place_images.jsonl", read(os.path.join(SRC, "place_images.jsonl"))),
                    ("experiences", "experiences.jsonl", read(os.path.join(SRC, "experiences.jsonl"))),
                    ("experience_images", "experience_images.jsonl", read(os.path.join(SRC, "experience_images.jsonl"))),
                    ("stays", "stays.jsonl", read(os.path.join(SRC, "stays.jsonl")))]
            for table, fname, want in same:
                got = read(os.path.join(out, fname))
                self.assertEqual(len(got), len(want), table)
                for i, (g, w) in enumerate(zip(got, want)):
                    self.assertEqual(parsed(table, g), parsed(table, w), (table, i))
            trips = read(os.path.join(SRC, "trips.jsonl"))
            self.assertEqual(read(os.path.join(out, "trips.jsonl")), trips)
            # quotes: one row per quote_id, in the order of first appearance, with the first copy's content
            groups = {}
            for q in raw_quotes():
                groups.setdefault(C.qr.quote_id(q), []).append(q)
            want = []
            for g in groups.values():
                want.append(dict(g[0], observed_at=max((q["observed_at"] for q in g), key=C.parse_ts)))
            got = read(os.path.join(out, "quotes", "all.jsonl"))
            self.assertEqual(len(got), len(want))
            self.assertEqual(counts["quotes"], len(want))
            for i, (g, w) in enumerate(zip(got, want)):
                self.assertEqual(parsed("quotes", g), parsed("quotes", w), ("quotes", i))
            for name in tripdb.DOCS:
                p = os.path.join(SRC, name)
                if os.path.exists(p):
                    with open(p, encoding="utf-8") as fh, open(os.path.join(out, name), encoding="utf-8") as fo:
                        self.assertEqual(json.load(fo), json.load(fh), name)
            with open(os.path.join(SRC, "agent_usage.csv"), encoding="utf-8", newline="") as fh, \
                    open(os.path.join(out, "agent_usage.csv"), encoding="utf-8", newline="") as fo:
                a, b = list(csv.DictReader(fh)), list(csv.DictReader(fo))
            self.assertEqual(len(a), len(b))
            for x, y in zip(a, b):
                self.assertEqual({k: (float(v) if k in ("searches", "tokens", "tool_uses", "seconds", "rows") else v) for k, v in x.items()},
                                 {k: (float(v) if k in ("searches", "tokens", "tool_uses", "seconds", "rows") else v) for k, v in y.items()})
        print("\nimport counts:", json.dumps(counts, sort_keys=True))

    def test_foreign_keys_hold_on_real_data(self):
        # the database refuses a row whose key is missing, so a clean import is the proof
        counts = tripdb.cmd_import(SRC, rest=self.rest)
        self.assertGreater(counts["connections"], 0)
        self.assertEqual(len(self.rest.get_all("quotes", {"select": "quote_id"})), counts["quotes"])

    def test_golden_compare(self):
        """data/web built from a pull of the project against data/web built from the files in git. Only build stamps and
        the known differences may differ (19 in connections, 57 in inout.json, 3 in pair_dates)."""
        import shutil
        base = tempfile.mkdtemp()
        roots = {}
        try:
            for name in ("git", "pull"):
                d = os.path.join(base, name)
                shutil.copytree(os.path.join(REPO, "plugin"), os.path.join(d, "plugin"),
                                ignore=shutil.ignore_patterns("__pycache__", "node_modules"))
                shutil.copytree(os.path.join(REPO, "data", "raw"), os.path.join(d, "data", "raw"))
                roots[name] = d
            shutil.copytree(SRC, os.path.join(roots["git"], "data", "sources"))
            tripdb.cmd_import(SRC, rest=self.rest)
            tripdb.cmd_pull(os.path.join(roots["pull"], "data", "sources"), rest=self.rest)
            for d in roots.values():
                self.assertEqual(tripdb.main(["--root", d, "build", "--no-sync"]), 0)
            stamps = {"built_at", "generated_at"}
            diffs = {}

            def walk(a, b, path, f):
                if isinstance(a, dict) and isinstance(b, dict):
                    for k in sorted(set(a) | set(b)):
                        if k in stamps:
                            continue
                        walk(a.get(k), b.get(k), path + "/" + k, f)
                elif isinstance(a, list) and isinstance(b, list) and len(a) == len(b):
                    for i, (x, y) in enumerate(zip(a, b)):
                        walk(x, y, f"{path}[{i}]", f)
                elif a != b:
                    diffs.setdefault(f, []).append(path)
            web = os.path.join(roots["git"], "data", "web")
            for f in sorted(os.listdir(web)):
                if f.endswith(".json"):
                    with open(os.path.join(web, f), encoding="utf-8") as fa, \
                            open(os.path.join(roots["pull"], "data", "web", f), encoding="utf-8") as fb:
                        walk(json.load(fa), json.load(fb), "", f)
            # the differences the spec expects (section 4.2 and the golden compare row): a folded quote shows its newest
            # observed_at as a ticket time in inout.json (57 at most), and 3 pair_dates values
            import re
            for f, cap in (("inout.json", 57), ("connections.json", 19)):
                left = [x for x in diffs.get(f, []) if not re.fullmatch(r"/(tickets/TQ:\w+|options\[\d+\])/observed_at|.*/observed_at", x)]
                self.assertEqual(left, [], f)
                self.assertLessEqual(len(diffs.pop(f, [])), cap, f)
            self.assertEqual(len(diffs.pop("pair_dates.json", [])), 3)
            self.assertEqual({f: len(v) for f, v in diffs.items()}, {}, {f: v[:5] for f, v in diffs.items()})
        finally:
            shutil.rmtree(base, ignore_errors=True)

    def test_dump_restore_dump(self):
        tripdb.cmd_import(SRC, rest=self.rest)
        self.rest.patch("trips", {"id": "eq." + read(os.path.join(SRC, "trips.jsonl"))[0]["id"]}, {"deleted_at": "2026-11-01T10:00:00+00:00"})
        self.rest.patch("quotes", {"seq": "eq.1"}, {"seen_count": 7})
        with tempfile.TemporaryDirectory() as d1, tempfile.TemporaryDirectory() as d2:
            n1 = tripdb.cmd_dump(d1, rest=self.rest)
            self.rest.rpc("test_reset")
            tripdb.cmd_restore(d1, rest=self.rest)
            n2 = tripdb.cmd_dump(d2, rest=self.rest)
            self.assertEqual(n1, n2)
            for table, _, _ in tripdb.DUMP_TABLES:
                self.assertEqual(read(os.path.join(d1, table + ".jsonl")), read(os.path.join(d2, table + ".jsonl")), table)
            self.assertTrue(any(r["deleted_at"] for r in read(os.path.join(d2, "trips.jsonl"))))
            self.assertEqual(read(os.path.join(d2, "quotes.jsonl"))[0]["seen_count"], 7)
        before = max(r["seq"] for r in self.rest.get_all("agent_usage", {"select": "seq"}))
        got = self.rest.insert("agent_usage", [{"round": "new", "agent": "a", "model": "m", "tool": "t"}], returning="seq")
        self.assertGreater(got[0]["seq"], before)

    def test_restore_refuses_when_rows_exist(self):
        self.rest.insert("airports", [{"code": "ZZZ"}])
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(tripdb.Refused) as cm:
                tripdb.cmd_restore(d, rest=self.rest)
            self.assertIn("airports 1", str(cm.exception))
        self.assertEqual(len(self.rest.get_all("airports")), 1)


if __name__ == "__main__":
    unittest.main()
