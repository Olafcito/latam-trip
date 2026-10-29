"""Tests for tripdb. Run from the repo root: python -I -X utf8 -m unittest discover -s plugin/scripts -p "test_*.py"
Every test works in its own temporary root, so the real data is never touched."""
import contextlib, io, json, os, shutil, sys, tempfile, threading, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tripdb  # noqa: E402


def quote(**over):
    q = {"agent": "momondo-worker", "task_id": "t1", "source": "momondo", "observed_at": "2026-10-20T10:00:00Z",
         "structure": "one_way", "legs_requested": [{"from": "CPH", "to": "SJO", "date": "2026-12-03"}],
         "rank": 1, "price": 5200, "currency": "DKK", "price_dkk": 5200, "tickets": 1, "self_transfer": False,
         "out": {"dep": "2026-12-03T06:00", "arr": "2026-12-03T20:00", "hours": 20, "stops": 1, "via": ["MAD"],
                 "carriers": ["Iberia"], "flights": ["IB3301", "IB6313"]},
         "home": None, "mid": None, "link": None, "flags": [], "notes": None}
    q.update(over)
    return q


class Base(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp(prefix="tripdb-test-")
        self.paths = tripdb.Paths(self.root)
        for d in (self.paths.quotes, self.paths.inbox, self.paths.processed, self.paths.rejected):
            os.makedirs(d)
        self.write(self.paths.src("places.jsonl"), [
            {"kind": "node", "id": "SJO", "name": "San Jose", "country": "CR", "lat": 9.93, "lon": -84.08, "type": "city",
             "iata": "SJO", "popularity": 3, "why": None, "source": None, "origin": "net-ca"}])
        self.write(self.paths.src("experiences.jsonl"), [])
        with open(self.paths.src("experience_categories.json"), "w", encoding="utf-8") as fh:
            json.dump({"categories": [{"id": "nature", "name": "Nature", "place_categories": [], "image_id": "cat-nature"}]}, fh)
        for name, doc in (("trip.json", {"home": ["CPH"]}), ("bag_rules.json", [])):
            with open(self.paths.src(name), "w", encoding="utf-8") as fh:
                json.dump(doc, fh)

    def tearDown(self):
        shutil.rmtree(self.root, ignore_errors=True)

    def write(self, path, rows):
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as fh:
            for r in rows:
                fh.write((r if isinstance(r, str) else json.dumps(r)) + "\n")
        return path

    def rows(self, path):
        return tripdb.rows_of(path)

    def text(self, path):
        with open(path, encoding="utf-8") as fh:
            return fh.read()

    def run_quiet(self, fn, *a, **kw):
        out = io.StringIO()
        with contextlib.redirect_stdout(out):
            rc = fn(self.paths, *a, **kw)
        return rc, out.getvalue()


class SchemaTest(Base):
    def test_good_quote_passes(self):
        self.assertEqual(tripdb.quote_errors(quote()), [])

    def test_bad_quote_is_refused_with_reasons(self):
        bad = quote(structure="round_trip", price_dkk="cheap", legs_requested=[{"from": "Copenhagen", "to": "SJO"}])
        errs = tripdb.quote_errors(bad)
        self.assertTrue(any("structure" in e for e in errs), errs)
        self.assertTrue(any("price_dkk" in e for e in errs), errs)
        errs = tripdb.quote_errors(quote(legs_requested=[{"from": "Copenhagen", "to": "SJO"}]))
        self.assertIn("legs_requested[0] from is \"Copenhagen\", expected iata", errs)
        self.assertIn("legs_requested[0] missing date", errs)

    def test_bad_time_and_missing_field(self):
        q = quote(observed_at="yesterday")
        del q["agent"]
        errs = tripdb.quote_errors(q)
        self.assertIn("missing agent", errs)
        self.assertTrue(any(e.startswith("observed_at") for e in errs), errs)

    def test_place_row_schema(self):
        self.assertEqual(tripdb.row_errors("places", self.rows(self.paths.src("places.jsonl"))[0]), [])
        errs = tripdb.row_errors("places", {"kind": "node", "id": "sjo", "name": "x", "country": "Costa Rica",
                                            "lat": 9, "lon": -84, "type": "city", "popularity": 1})
        self.assertTrue(any(e.startswith("id") for e in errs), errs)
        self.assertTrue(any(e.startswith("country") for e in errs), errs)
        self.assertIn("kind 'edge' does not belong in places (expected node)", tripdb.row_errors("places", {"kind": "edge"}))

    def test_add_place_refuses_bad_row_and_keeps_file(self):
        before = self.text(self.paths.src("places.jsonl"))
        f = self.write(os.path.join(self.root, "in.jsonl"), [{"kind": "node", "id": "LIR", "name": "Liberia", "country": "CR",
                                                              "lat": "north", "lon": -85.5, "type": "city", "popularity": 2}])
        rc, out = self.run_quiet(tripdb.cmd_add_place, f)
        self.assertEqual(rc, 1)
        self.assertIn("refused line 1: lat", out)
        self.assertEqual(self.text(self.paths.src("places.jsonl")), before)

    def test_add_place_never_overwrites(self):
        f = self.write(os.path.join(self.root, "in.jsonl"), [{"kind": "node", "id": "SJO", "name": "San Jose CR", "country": "CR",
                                                              "lat": 9.93, "lon": -84.08, "type": "city", "popularity": 4}])
        rc, out = self.run_quiet(tripdb.cmd_add_place, f)
        self.assertIn("skipped line 1: SJO is stored already (differs", out)
        self.assertEqual(len(self.rows(self.paths.src("places.jsonl"))), 1)

    def test_check_reports_bad_source_row(self):
        self.write(os.path.join(self.paths.quotes, "w.jsonl"), [quote(), quote(price_dkk=-5), "{not json"])
        errors, _ = tripdb.run_check(self.paths, quiet=True)
        self.assertEqual(len(errors), 2, errors)
        self.assertTrue(any("w.jsonl:2: price_dkk -5 is not above 0" in e for e in errors), errors)
        self.assertTrue(any("w.jsonl:3: not JSON" in e for e in errors), errors)


class AddQuotesTest(Base):
    def test_dedupe_within_batch_and_against_stored(self):
        stored = quote(observed_at="2026-10-20T10:00:00Z")
        self.write(os.path.join(self.paths.quotes, "mom-1.jsonl"), [stored])
        incoming = [
            quote(observed_at="2026-10-19T08:00:00Z", task_id="older"),   # same quote, older: duplicate
            quote(observed_at="2026-10-20T10:00:00Z", task_id="same"),    # same quote, same time: duplicate
            quote(price_dkk=4900, price=4900),                           # cheaper: a new quote
            quote(price_dkk=4900, price=4900, observed_at="2026-10-18T00:00:00Z"),  # same cheaper quote, older in batch
            quote(out={**quote()["out"], "dep": "2026-12-03T09:00"}),     # other departure: a new quote
        ]
        f = self.write(os.path.join(self.root, "mom-2.jsonl"), incoming)
        rc, out = self.run_quiet(tripdb.cmd_add_quotes, f)
        self.assertEqual(rc, 0, out)
        self.assertIn("added 2, duplicates 3, refused 0", out)
        added = self.rows(os.path.join(self.paths.quotes, "mom-2.jsonl"))
        self.assertEqual(sorted(q["price_dkk"] for q in added), [4900, 5200])
        self.assertEqual(next(q for q in added if q["price_dkk"] == 4900)["observed_at"], "2026-10-20T10:00:00Z")
        # running the same file again adds nothing
        rc, out = self.run_quiet(tripdb.cmd_add_quotes, f)
        self.assertIn("added 0, duplicates 5", out)

    def test_newer_observation_is_kept(self):
        self.write(os.path.join(self.paths.quotes, "mom-1.jsonl"), [quote()])
        f = self.write(os.path.join(self.root, "mom-2.jsonl"), [quote(observed_at="2026-10-25T10:00:00+00:00")])
        rc, out = self.run_quiet(tripdb.cmd_add_quotes, f)
        self.assertIn("added 1, duplicates 0", out)

    def test_stamps_observed_at_and_refuses_bad_rows(self):
        q = quote()
        del q["observed_at"]
        f = self.write(os.path.join(self.root, "gfl-1.jsonl"), [q, quote(legs_requested=[]), "nope"])
        rc, out = self.run_quiet(tripdb.cmd_add_quotes, f)
        self.assertEqual(rc, 1)
        self.assertIn("added 1, duplicates 0, refused 2, stamped observed_at on 1", out)
        self.assertIn("refused line 2: legs_requested is empty", out)
        self.assertIn("refused line 3: not JSON", out)
        self.assertIsNotNone(tripdb.parse_time(self.rows(os.path.join(self.paths.quotes, "gfl-1.jsonl"))[0]["observed_at"]))


class InboxTest(Base):
    def manual(self, **over):
        return quote(**{"agent": "momondo-userscript", "source": "momondo-manual", "task_id": None, **over})

    def test_happy_path_with_dedupe_and_move(self):
        self.write(os.path.join(self.paths.quotes, "manual-20261020T090000Z.jsonl"), [self.manual()])
        name = "manual-20261028T120000Z.jsonl"
        self.write(os.path.join(self.paths.inbox, name), [
            self.manual(),                                                 # stored already, same time
            self.manual(price_dkk=4800, price=4800, trip_name="Costa Rica first"),
            self.manual(price_dkk=4800, price=4800, trip_name="Costa Rica first", observed_at="2026-10-21T10:00:00Z"),
        ])
        rc, out = self.run_quiet(tripdb.cmd_ingest_inbox)
        self.assertEqual(rc, 0, out)
        self.assertIn(f"inbox {name}: added 1, duplicates 2, rejected 0", out)
        self.assertFalse(os.path.exists(os.path.join(self.paths.inbox, name)))
        self.assertTrue(os.path.exists(os.path.join(self.paths.processed, name)))
        added = self.rows(os.path.join(self.paths.quotes, name))
        self.assertEqual(len(added), 1)
        self.assertEqual(added[0]["source"], "momondo-manual")
        self.assertEqual(added[0]["trip_name"], "Costa Rica first")
        self.assertEqual(added[0]["observed_at"], "2026-10-21T10:00:00Z")
        rc, out = self.run_quiet(tripdb.cmd_ingest_inbox)
        self.assertIn("inbox: empty", out)

    def test_rejected_rows_go_to_rejected_with_reason(self):
        name = "manual-20261028T130000Z.jsonl"
        no_time = self.manual()
        del no_time["observed_at"]
        self.write(os.path.join(self.paths.inbox, name), [
            self.manual(price_dkk=3900, price=3900),
            self.manual(source="momondo"),
            no_time,
            "{broken",
            self.manual(price_dkk=4100, price=4100, trip_name=7),
        ])
        rc, out = self.run_quiet(tripdb.cmd_ingest_inbox)
        self.assertEqual(rc, 1)
        self.assertIn("added 1, duplicates 0, rejected 4", out)
        rejected = self.rows(os.path.join(self.paths.rejected, name))
        self.assertEqual([r["line"] for r in rejected], [2, 3, 4, 5])
        reasons = [r["reason"] for r in rejected]
        self.assertIn("must say momondo-manual", reasons[0])
        self.assertIn("missing observed_at", reasons[1])
        self.assertIn("not JSON", reasons[2])
        self.assertIn("trip_name", reasons[3])
        self.assertTrue(os.path.exists(os.path.join(self.paths.processed, name)))
        self.assertEqual(len(self.rows(os.path.join(self.paths.quotes, name))), 1)


class WriteSafetyTest(Base):
    def test_concurrent_appends_keep_every_line(self):
        dest = os.path.join(self.root, "x.jsonl")

        def work(n):
            for i in range(50):
                with tripdb.Lock(self.paths):
                    tripdb.append_rows(dest, [{"w": n, "i": i}])
        ts = [threading.Thread(target=work, args=(n,)) for n in range(4)]
        [t.start() for t in ts]
        [t.join() for t in ts]
        rows = self.rows(dest)
        self.assertEqual(len(rows), 200)
        self.assertEqual(len(tripdb.read_jsonl(dest)), 200)

    def test_append_adds_missing_newline(self):
        dest = os.path.join(self.root, "y.jsonl")
        with open(dest, "w", encoding="utf-8") as fh:
            fh.write('{"a": 1}')
        tripdb.append_rows(dest, [{"a": 2}])
        self.assertEqual(self.rows(dest), [{"a": 1}, {"a": 2}])


class StaysAndExperiencesTest(Base):
    def test_add_stays_converts_and_dedupes(self):
        row = {"place": "SJO", "site": "hostelworld", "name": "Selina", "kind": "hostel", "room": "dorm",
               "price_per_night": 20, "currency": "USD", "check_in": "2026-12-04", "check_out": "2026-12-06"}
        f = self.write(os.path.join(self.root, "stays.jsonl"), [row, row, {**row, "price_per_night": None}])
        rc, out = self.run_quiet(tripdb.cmd_add_stays, f)
        self.assertIn("added 1, duplicates 1, refused 1", out)
        s = self.rows(self.paths.src("stays.jsonl"))[0]
        self.assertEqual((s["dkk_per_night"], s["nights"], s["type"]), (129, 2, "hostel"))

    def test_experience_add_update_and_refusals(self):
        exp = {"kind": "experience", "id": "arenal-hike", "name": "Arenal hike", "category": "nature", "tags": [],
               "places": ["SJO"], "area": None, "country": "CR", "lat": 10.46, "lon": -84.7, "researched": False,
               "checked_at": "2026-10-28"}
        f = self.write(os.path.join(self.root, "e.jsonl"), [exp, {**exp, "id": "x", "category": "volcanoes"}])
        rc, out = self.run_quiet(tripdb.cmd_add_experience, f)
        self.assertIn("added 1, skipped 0, refused 1", out)
        self.assertIn("category 'volcanoes' is not in experience_categories.json", out)
        rc, out = self.run_quiet(tripdb.cmd_update_experience, "arenal-hike", ["price_dkk=350", "researched=true"])
        self.assertIn("arenal-hike.price_dkk: null -> 350", out)
        e = self.rows(self.paths.src("experiences.jsonl"))[0]
        self.assertEqual((e["price_dkk"], e["researched"]), (350, True))
        with self.assertRaises(tripdb.Refused):
            tripdb.cmd_update_experience(self.paths, "arenal-hike", ["lat=far"])
        with self.assertRaises(tripdb.Refused):
            tripdb.cmd_update_experience(self.paths, "nope", ["price_dkk=1"])


if __name__ == "__main__":
    unittest.main()
