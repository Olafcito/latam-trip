"""What a store must do the same way on the files and on the project. Run it with TRIPDB_STORE=file and again with
TRIPDB_STORE=supabase TRIPDB_LIVE_TESTS=1. Where the two differ by design the test says so."""
import contextlib, http.server, io, json, os, sys, tempfile, threading, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import test_tripdb as T  # noqa: E402
import tripdb  # noqa: E402
import tripdb_store  # noqa: E402


def place(pid, **over):
    r = {"kind": "node", "id": pid, "name": pid, "country": "CR", "lat": 1.0, "lon": 2.0, "type": "city",
         "popularity": 2, "why": None, "source": None, "origin": "t"}
    r.update(over)
    return r


class ContractTest(T.Base):
    def setUp(self):
        super().setUp()
        self.s = self.st or tripdb.get_store(self.paths)

    def add(self, rows, replace=False, table="places"):
        return self.s.add(table, rows, tripdb.cols.COLS[table].key, replace)

    def test_add_skips_identical(self):
        self.add([place("AAA")])
        res = self.add([place("AAA")])
        self.assertEqual((res.added, res.skipped, res.differs), (0, 1, 0))

    def test_add_reports_differs(self):
        self.add([place("AAA")])
        res = self.add([place("AAA", name="Other")])
        self.assertEqual((res.added, res.skipped, res.differs), (0, 1, 1))
        self.assertEqual([r["name"] for r in self.s.rows("places") if r["id"] == "AAA"], ["AAA"])

    def test_add_replace_merges_a_profile_and_keeps_the_image(self):
        base = {"kind": "profile", "id": "SJO", "checked_at": "2026-10-01", "tagline": "old", "summary": "s",
                "touristy": 2, "origin": "t", "image": "img1", "things_to_do": [], "sources": []}
        self.add([base], table="profiles")
        res = self.add([{**base, "tagline": "new", "image": None}], replace=True, table="profiles")
        self.assertEqual((res.added, res.replaced), (1, 1))
        # a file appends the new row and the build folds it over the old one, the project folds it at once
        got = tripdb.cols.fold_profiles([r for r in self.s.rows("profiles") if r["id"] == "SJO"])[0]
        self.assertEqual((got["tagline"], got["image"]), ("new", "img1"))

    def test_add_replace_takes_the_new_place_image(self):
        self.add([{"kind": "profile_image", "id": "SJO", "image": "a", "origin": "t"}], table="place_images")
        self.add([{"kind": "profile_image", "id": "SJO", "image": "b", "origin": "t"}], replace=True, table="place_images")
        self.assertEqual([r["image"] for r in self.s.rows("place_images")][-1], "b")

    def test_add_quotes_counts_match_todays_print(self):
        first = self.s.add_quotes([T.quote(), T.quote(price=6100, price_dkk=6100)], "a.jsonl")
        self.assertEqual((first.added, first.duplicates), (2, 0))
        again = self.s.add_quotes([T.quote()], "a.jsonl")
        self.assertEqual((again.added, again.duplicates), (0, 1))
        newer = self.s.add_quotes([T.quote(observed_at="2026-10-21T10:00:00Z")], "a.jsonl")
        # a file keeps a newer sighting as a row, the project folds it into last_seen and seen_count
        self.assertEqual((newer.added, newer.duplicates), (1, 0) if self.kind == "file" else (0, 1))

    def test_refused_row_is_not_stored_and_the_good_row_is(self):
        out = self.run_quiet_file([place("BBB"), place("CCC", lat="north")])
        self.assertIn("refused line 2", out[1])
        self.assertEqual(sorted(r["id"] for r in self.s.rows("places")), ["BBB", "SJO"])

    def run_quiet_file(self, rows):
        f = os.path.join(self.root, "in.jsonl")
        with open(f, "w", encoding="utf-8") as fh:
            fh.write("".join(json.dumps(r) + chr(10) for r in rows))
        return self.run_quiet(tripdb.cmd_add_place, f)

    def test_nul_row_refused_with_line_number_and_rest_land(self):
        out = self.run_quiet_file([place("DDD"), place("EEE", name="a" + chr(0) + "b"), place("FFF")])
        self.assertIn("refused line 2: contains a NUL", out[1])
        self.assertEqual(sorted(r["id"] for r in self.s.rows("places")), ["DDD", "FFF", "SJO"])

    def test_unknown_store_is_refused(self):
        with self.assertRaises(tripdb.Refused):
            tripdb.get_store(self.paths, "mongo")

    def test_missing_env_stops_before_anything_is_written(self):
        keep = {k: os.environ.pop(k, None) for k in ("SUPABASE_URL", "SUPABASE_SECRET_KEY")}
        try:
            empty = tempfile.mkdtemp(prefix="tripdb-noenv-")
            with self.assertRaises(tripdb.Refused) as cm:
                tripdb.get_store(tripdb.Paths(empty), "supabase")
            self.assertIn("SUPABASE_URL", str(cm.exception))
        finally:
            os.environ.update({k: v for k, v in keep.items() if v is not None})


    # ---- trips and documents ----
    def trip(self, **over):
        t = {"id": "t1", "name": "Costa Rica", "version": 1, "saved_at": "2026-10-20T10:00:00Z", "by": "plan-trip", "why": "first",
             "stops": []}
        t.update(over)
        return t

    def test_save_trip_versions_and_skips_the_same_content(self):
        one = self.s.save_trip(self.trip())
        same = self.s.save_trip(self.trip(saved_at="2026-10-21T10:00:00Z", by="other", version=9))
        two = self.s.save_trip(self.trip(why="second"))
        self.assertEqual((one["version"], one["skipped"]), (1, False))
        self.assertEqual((same["version"], same["skipped"]), (1, True))
        self.assertEqual((two["version"], two["skipped"]), (2, False))
        self.assertEqual([t["why"] for t in self.s.trips()], ["second"])

    def test_delete_trip_hides_every_version(self):
        self.s.save_trip(self.trip())
        self.s.save_trip(self.trip(why="second"))
        self.s.save_trip(self.trip(id="t2"))
        self.assertEqual(self.s.delete_trip({"t1"}), {"t1": 2})
        self.assertEqual([t["id"] for t in self.s.trips()], ["t2"])
        self.assertEqual(self.s.delete_trip({"t1"}) if self.kind == "file" else {}, {})

    def test_list_add_two_writers_lose_nothing(self):
        self.add([place("PA"), place("PB")])
        out = []

        def writer(pid):
            out.append(tripdb.cmd_list_add(self.paths, "L", "place", pid, None, "List"))
        with contextlib.redirect_stdout(io.StringIO()):
            threads = [threading.Thread(target=writer, args=(p,)) for p in ("PA", "PB")]
            for t in threads:
                t.start()
            for t in threads:
                t.join()
        self.assertEqual(out, [0, 0])
        items = self.s.doc("lists.json")[0]["lists"][0]["items"]
        self.assertEqual(sorted(i["id"] for i in items), ["PA", "PB"])

    def put(self, name, text):
        f = os.path.join(self.root, "doc.json")
        with open(f, "w", encoding="utf-8") as fh:
            fh.write(text)
        return self.run_quiet(tripdb.cmd_doc_put, name, f)

    def test_doc_put_stale_version_retries(self):
        real = self.s.put_doc
        calls = []

        def stale_once(name, data, version):
            calls.append(version)
            if len(calls) == 1:
                self.assertTrue(real(name, {"home": ["AAR"]}, version))
            return real(name, data, version)
        self.s.put_doc = stale_once
        old, tripdb.get_store = tripdb.get_store, lambda paths, kind=None: self.s
        self.addCleanup(setattr, tripdb, "get_store", old)
        rc, _ = self.put("trip.json", json.dumps({"home": ["BLL"]}))
        self.assertEqual(rc, 0)
        self.assertEqual(len(calls), 2)
        self.assertEqual(self.s.doc("trip.json")[0], {"home": ["BLL"]})

    def test_doc_put_rejects_bad_json_and_unknown_names(self):
        with self.assertRaises(tripdb.Refused):
            self.put("trip.json", "{not json")
        with self.assertRaises(tripdb.Refused):
            self.put("passwd.json", "{}")
        self.assertEqual(self.s.doc("trip.json")[0], {"home": ["CPH"]})

    def test_doc_get_prints_what_was_put(self):
        self.put("bag_rules.json", json.dumps([{"airline": "X"}]))
        rc, out = self.run_quiet(tripdb.cmd_doc_get, "bag_rules.json")
        self.assertEqual(json.loads(out), [{"airline": "X"}])

    def test_doc_put_trip_json_recomputes_qid_and_usable(self):
        if self.kind == "file":
            self.skipTest("the files hold neither build_qid nor usable")
        self.s.add_quotes([T.quote()], "a.jsonl")
        before = self.s.rest.get_all("quotes", {"select": "build_qid,usable"})[0]
        self.assertEqual(before["usable"], 1)
        rc, out = self.put("trip.json", json.dumps({"home": ["CPH"], "max_hours_one_way": 10}))
        self.assertIn("1 changed", out)
        after = self.s.rest.get_all("quotes", {"select": "build_qid,usable"})[0]
        self.assertEqual(after["usable"], 0)


class Handler(http.server.BaseHTTPRequestHandler):
    seen = []

    def do_POST(self):
        body = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        Handler.seen.append(len(body))
        ok = len(Handler.seen) < 3
        self.send_response(201 if ok else 400)
        self.end_headers()
        self.wfile.write(b"" if ok else b'{"message":"boom"}')

    def log_message(self, *a):
        pass


class BatchStopTest(unittest.TestCase):
    def test_batches_stop_with_row_range(self):
        srv = http.server.HTTPServer(("127.0.0.1", 0), Handler)
        threading.Thread(target=srv.serve_forever, daemon=True).start()
        self.addCleanup(srv.server_close)
        self.addCleanup(srv.shutdown)
        Handler.seen = []
        rest = tripdb_store.Rest(f"http://127.0.0.1:{srv.server_port}", "k")
        rest.BATCH_ROWS = 2
        with self.assertRaises(tripdb_store.RestError) as cm:
            rest.insert("places", [{"id": str(i)} for i in range(7)])
        self.assertIn("rows 4 to 5 refused", str(cm.exception))
        self.assertEqual(Handler.seen, [2, 2, 2])


if __name__ == "__main__":
    unittest.main()
