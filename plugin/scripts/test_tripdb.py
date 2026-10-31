"""Tests for tripdb. Run from the repo root: python -I -X utf8 -m unittest discover -s plugin/scripts -p "test_*.py"
Every test works in its own temporary root, so the real data is never touched."""
import contextlib, io, json, os, shutil, subprocess, sys, tempfile, threading, unittest

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

    def test_add_stays_booking_total_and_property_id(self):
        row = {"place": "SJO", "site": "booking", "name": "Casa Lima", "kind": "guesthouse", "room": "private",
               "total": 1203, "currency": "DKK", "check_in": "2026-12-04", "check_out": "2026-12-07",
               "property_id": "7731542", "url": "https://www.booking.com/hotel/cr/casa-lima.html"}
        f = self.write(os.path.join(self.root, "b.jsonl"), [row])
        rc, out = self.run_quiet(tripdb.cmd_add_stays, f)
        self.assertIn("added 1, duplicates 0, refused 0", out)
        s = self.rows(self.paths.src("stays.jsonl"))[0]
        self.assertEqual((s["dkk_per_night"], s["nights"], s["property_id"], s["url"]),
                         (401, 3, "7731542", "https://www.booking.com/hotel/cr/casa-lima.html"))

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


def trip(**over):
    way = {"direction": "in", "from": "CPH", "to": "SJO", "depart": "2026-12-03T06:00", "arrive": "2026-12-03T20:00",
           "price_dkk": 3900, "tickets": ["T1"], "timeline": [], "airports": ["CPH", "MAD", "SJO"]}
    t = {"id": "costa-rica", "name": "Costa Rica in and out", "why": "Short and cheap",
         "way_in": way, "way_home": {**way, "direction": "home", "from": "SJO", "to": "CPH",
                                     "depart": "2027-01-20T21:00", "arrive": "2027-01-21T17:00"},
         "tickets": {"T1": {"id": "T1", "price_dkk": 6494, "observed_at": "2026-10-20T10:00:00Z"}},
         "places": [{"node": "SJO", "hop": None, "why": "Where the flight lands"},
                    {"node": "LIR", "hop": {"from": "SJO", "to": "LIR", "mode": "bus", "operator": "Pulmitan",
                                            "hours": 4.5, "price_dkk": 60, "observed_at": None, "overnight": False,
                                            "border": False, "flight": None}, "why": "Beaches", "nights": 3}]}
    t.update(over)
    return t


class SaveTripTest(Base):
    def save(self, *trips, by="plan-trip"):
        f = os.path.join(self.root, "trip.json")
        with open(f, "w", encoding="utf-8") as fh:
            json.dump(trips[0] if len(trips) == 1 else list(trips), fh)
        return self.run_quiet(tripdb.cmd_save_trip, f, by)

    def stored(self):
        return self.rows(self.paths.src("trips.jsonl"))

    def test_first_save_is_version_1(self):
        rc, out = self.save(trip(), by="migration")
        self.assertEqual(rc, 0)
        self.assertIn("saved costa-rica version 1", out)
        r = self.stored()[0]
        self.assertEqual((r["id"], r["version"], r["by"]), ("costa-rica", 1, "migration"))
        self.assertTrue(r["saved_at"].endswith("Z"))
        self.assertEqual(tripdb.run_check(self.paths, quiet=True)[0], [])

    def test_second_save_of_the_same_id_is_version_2(self):
        self.save(trip())
        rc, out = self.save(trip(why="Two more nights in Liberia", places=trip()["places"][:1]))
        self.assertIn("saved costa-rica version 2", out)
        self.assertEqual([r["version"] for r in self.stored()], [1, 2])

    def test_identical_content_is_skipped(self):
        self.save(trip())
        rc, out = self.save(trip(), by="planner")
        self.assertEqual(rc, 0)
        self.assertIn("skipped costa-rica: same as version 1", out)
        self.assertEqual(len(self.stored()), 1)

    def test_a_trip_without_id_gets_one_from_its_name(self):
        self.save(trip())
        rc, out = self.save(trip(id=None, name="Costa Rica"))
        self.assertIn("saved costa-rica-2 version 1", out)

    def test_bad_row_is_refused_with_reason(self):
        bad = trip(places=[{"node": "SJO", "hop": None},
                           {"node": "LIR", "hop": {"from": "PTY", "to": "LIR", "mode": "rocket"}}])
        del bad["why"]
        rc, out = self.save(bad)
        self.assertEqual(rc, 1)
        self.assertIn("refused costa-rica: missing why", out)
        rc, out = self.save(trip(places=[{"node": "SJO", "hop": None},
                                         {"node": "LIR", "hop": {**trip()["places"][1]["hop"], "from": "PTY"}}]))
        self.assertIn("places[1].hop starts in PTY, the place before is SJO", out)
        self.assertFalse(os.path.exists(self.paths.src("trips.jsonl")) and self.stored())

    def test_check_finds_versions_out_of_order(self):
        self.save(trip())
        r = dict(self.stored()[0], version=3)
        self.write(self.paths.src("trips.jsonl"), [self.stored()[0], r])
        errors, _ = tripdb.run_check(self.paths, quiet=True)
        self.assertTrue(any("versions [1, 3]" in e for e in errors), errors)

    def test_export_keeps_the_latest_version_and_a_history(self):
        self.save(trip(why="First idea"))
        self.save(trip(why="Second idea"))
        self.save(trip(id="other", name="Other", rank=1))
        self.assertEqual(tripdb.export_trips(self.paths), 2)
        with open(os.path.join(self.paths.web, "trips.json"), encoding="utf-8") as fh:
            doc = json.load(fh)
        self.assertEqual([t["id"] for t in doc["trips"]], ["other", "costa-rica"])
        cr = doc["trips"][1]
        self.assertEqual((cr["version"], cr["why"]), (2, "Second idea"))
        self.assertEqual([(h["version"], h["why"]) for h in cr["history"]], [(1, "First idea")])
        self.assertEqual(doc["trips"][0]["history"], [])

    def test_delete_trip_removes_every_version_and_only_that_trip(self):
        self.save(trip(why="First idea"))
        self.save(trip(why="Second idea"))
        self.save(trip(id="other", name="Other"))
        rc, out = self.run_quiet(tripdb.cmd_delete_trip, ["costa-rica", "nope"])
        self.assertEqual(rc, 1)
        self.assertIn("deleted costa-rica (2 versions)", out)
        self.assertIn("unknown trip nope", out)
        self.assertEqual([r["id"] for r in self.stored()], ["other"])
        self.assertEqual(tripdb.run_check(self.paths, quiet=True)[0], [])


if __name__ == "__main__":
    unittest.main()


class PairDatesTest(Base):
    def regional(self, a="BOG", b="VVI", date="2027-01-28", **over):
        leg = {"dep": f"{date}T06:10", "arr": f"{date}T12:40", "hours": 5.5, "stops": 1, "via": ["LIM"],
               "carriers": ["Avianca"], "flights": None}
        leg.update(over.pop("out", {}))
        return quote(legs_requested=[{"from": a, "to": b, "date": date}], out=leg, **over)

    def test_export_groups_by_date_both_ways_and_skips_long_haul(self):
        self.write(os.path.join(self.paths.quotes, "mom-1.jsonl"), [
            self.regional(price_dkk=1900, price=1900),
            self.regional(price_dkk=1500, price=1500, source="expedia"),
            self.regional(date="2027-01-29", price_dkk=1700, price=1700),
            self.regional("VVI", "BOG", "2027-02-02", price_dkk=2100, price=2100,
                          out={"arr": "2027-02-03T01:05", "hours": 20.9}),
            quote(),  # CPH to SJO: a long-haul ticket
            self.regional("MAD", "BOG"),  # an alt origin from trip.json is long haul too
            self.regional("BOG", "LIM", flags=["incomplete"]),
            self.regional("BOG", "LIM", structure="return"),
        ])
        with open(self.paths.src("trip.json"), "w", encoding="utf-8") as fh:
            json.dump({"home_airports": ["CPH"], "alt_origins": ["MAD"]}, fh)
        msg = tripdb.write_pair_dates(self.paths)
        self.assertIn("2 pairs, 4 quotes", msg)
        with open(os.path.join(self.paths.web, "pair_dates.json"), encoding="utf-8") as fh:
            doc = json.load(fh)
        self.assertEqual(sorted(doc["pairs"]), ["BOG-VVI", "VVI-BOG"])
        there = doc["pairs"]["BOG-VVI"]
        self.assertEqual(sorted(there), ["2027-01-28", "2027-01-29"])
        self.assertEqual([r["p"] for r in there["2027-01-28"]], [1500, 1900])  # cheapest first
        first = there["2027-01-28"][0]
        self.assertEqual(first, {"p": 1500, "d": "06:10", "a": "12:40", "h": 5.5, "c": ["Avianca"], "s": 1,
                                 "src": "expedia", "at": "2026-10-20T10:00Z", "v": ["LIM"]})
        back = doc["pairs"]["VVI-BOG"]["2027-02-02"][0]
        self.assertEqual((back["d"], back["a"], back["n"]), ("06:10", "01:05", 1))

    def test_manual_quote_keeps_its_source_and_newest_observation(self):
        manual = self.regional(source="momondo-manual", agent="manual-20261029T1313", observed_at="2026-10-25T08:00Z")
        self.write(os.path.join(self.paths.quotes, "mom-1.jsonl"), [manual])
        self.write(os.path.join(self.paths.quotes, "manual-2.jsonl"), [
            {**manual, "observed_at": "2026-10-29T13:13Z"},
            {**manual, "observed_at": "2026-10-20T07:00Z"},
        ])
        doc = tripdb.pair_dates(tripdb.rows_of(os.path.join(self.paths.quotes, "mom-1.jsonl"))
                                + tripdb.rows_of(os.path.join(self.paths.quotes, "manual-2.jsonl")))
        rows = doc["pairs"]["BOG-VVI"]["2027-01-28"]
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0]["src"], rows[0]["at"]), ("momondo-manual", "2026-10-29T13:13Z"))

    def test_a_row_read_without_its_airlines_folds_into_its_named_twin(self):
        named = self.regional(price_dkk=404, price=404, observed_at="2026-10-28T10:00Z")
        bare = self.regional(price_dkk=404, price=404, observed_at="2026-10-28T19:00Z", out={"carriers": []})
        other = self.regional(price_dkk=404, price=404, out={"carriers": [], "dep": "2027-01-28T22:25"})
        rows = tripdb.pair_dates([named, bare, other])["pairs"]["BOG-VVI"]["2027-01-28"]
        self.assertEqual([(r["d"], r["c"], r["at"]) for r in rows],
                         [("06:10", ["Avianca"], "2026-10-28T19:00Z"), ("22:25", [], "2026-10-20T10:00Z")])

    def test_a_row_keeps_its_stops_waits_site_and_warnings_only_when_known(self):
        full = self.regional(notes="site=Mytrip; other=Kiwi.com 496; protection=1", flags=["airport_change", "basic_fare"],
                             self_transfer=True, out={"layover_h": [2.5, None], "via": ["LIM", "PTY"], "overnight_layover": True})
        row = tripdb.pair_dates([full])["pairs"]["BOG-VVI"]["2027-01-28"][0]
        self.assertEqual((row["v"], row["w"], row["ag"], row["o"], row["f"]),
                         (["LIM", "PTY"], [2.5, None], "Mytrip", True, ["airport_change", "self_transfer"]))
        bare = self.regional(notes="no site in this note", out={"via": [], "stops": 1})
        row = tripdb.pair_dates([bare])["pairs"]["BOG-VVI"]["2027-01-28"][0]
        self.assertEqual(row["s"], 1)  # a stop can be known without knowing where
        self.assertFalse({"v", "w", "ag", "o", "f"} & set(row))

    def test_a_planned_stopover_is_kept_past_the_hour_limit_with_its_wait(self):
        long = {"hours": 33.77, "via": ["PTY"], "layover_h": [26.95], "overnight_layover": True}
        self.assertEqual(tripdb.pair_dates([self.regional(out=long)])["pairs"], {})
        self.assertEqual(tripdb.pair_dates([self.regional(flags=["over_30h"], out=long)])["pairs"], {})
        for flags in (["stopover"], ["stopover", "over_30h"]):
            row = tripdb.pair_dates([self.regional(flags=flags, out=long)])["pairs"]["BOG-VVI"]["2027-01-28"][0]
            self.assertEqual((row["h"], row["v"], row["w"], row["o"], row["f"]), (33.77, ["PTY"], [26.95], True, ["stopover"]))
        # only the limit on hours is lifted, a row that is unusable for another reason stays out
        self.assertEqual(tripdb.pair_dates([self.regional(flags=["stopover", "incomplete"], out=long)])["pairs"], {})
        self.assertEqual(tripdb.pair_dates([self.regional(flags=["stopover"], out={"hours": None})])["pairs"], {})

    def test_a_newer_retracted_copy_takes_a_wrong_price_off_the_list(self):
        wrong = self.regional(observed_at="2026-10-31T12:00Z")
        retracted = self.regional(observed_at="2026-10-31T16:00Z", flags=["retracted"])
        other = self.regional(price_dkk=2900, price=2900, observed_at="2026-10-31T12:00Z")
        rows = tripdb.pair_dates([wrong, retracted, other])["pairs"]["BOG-VVI"]["2027-01-28"]
        self.assertEqual([r["p"] for r in rows], [2900])
        # an older retracted copy does not hide a newer sighting of the same quote
        seen_again = self.regional(observed_at="2026-11-01T09:00Z")
        rows = tripdb.pair_dates([wrong, retracted, seen_again])["pairs"]["BOG-VVI"]["2027-01-28"]
        self.assertEqual(len(rows), 1)

    def test_a_named_twin_takes_the_stops_and_site_of_a_row_read_without_airlines(self):
        named = self.regional(price_dkk=404, price=404, out={"via": []})
        bare = self.regional(price_dkk=404, price=404, notes="site=Kiwi.com", out={"carriers": [], "layover_h": [1.5]})
        row = tripdb.pair_dates([named, bare])["pairs"]["BOG-VVI"]["2027-01-28"]
        self.assertEqual(len(row), 1)
        self.assertEqual((row[0]["c"], row[0]["v"], row[0]["w"], row[0]["ag"]), (["Avianca"], ["LIM"], [1.5], "Kiwi.com"))


class MomondoLinesTest(unittest.TestCase):
    """The converter in momondo-search: the same airline later the same day is another flight to the planner."""
    SCRIPT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "skills", "momondo-search", "scripts", "momondo_lines.py")
    OUT = ("count=2 done=True title=LPB-CBB\n"
           "1;255;BoA;0;;;;;;0~01-29T08:00,01-29T08:45,0.75,0,,,OB 640,0,0\n"
           "2;300;BoA;0;;;;;;0~01-29T12:10,01-29T12:55,0.75,0,,,OB 644,0,0\n")

    def convert(self, *switch):
        with tempfile.TemporaryDirectory() as tmp:
            path = os.path.join(tmp, "out.txt")
            with open(path, "w", encoding="utf-8") as fh:
                fh.write(self.OUT)
            done = subprocess.run([sys.executable, "-I", self.SCRIPT, "worker", "t1", *switch, "--legs", "LPB-CBB@2027-01-29", path],
                                  capture_output=True, encoding="utf-8", check=True)
        return [json.loads(line)["out"]["dep"] for line in done.stdout.splitlines()]

    def test_near_identical_rows_go_unless_every_flight_is_asked_for(self):
        self.assertEqual(self.convert(), ["2027-01-29T08:00"])
        self.assertEqual(self.convert("--all"), ["2027-01-29T08:00", "2027-01-29T12:10"])
