"""Tests of the column maps. They read the real files of data/sources, so they also check the counts of the spec."""
import glob, json, os, sys, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import tripdb_cols as C  # noqa: E402

SRC = os.path.join(REPO, "data", "sources")
FILES = {"places": "places.jsonl", "connections": "connections.jsonl", "profiles": "profiles.jsonl",
         "place_images": "place_images.jsonl", "experiences": "experiences.jsonl",
         "experience_images": "experience_images.jsonl", "stays": "stays.jsonl"}


def read(name):
    with open(os.path.join(SRC, name), encoding="utf-8") as fh:
        return [json.loads(l) for l in fh if l.strip()]


def quotes():
    out = []
    for f in sorted(glob.glob(os.path.join(SRC, "quotes", "*.jsonl"))):
        out += read(os.path.relpath(f, SRC))
    return out


def cfg():
    with open(os.path.join(SRC, "trip.json"), encoding="utf-8") as fh:
        return json.load(fh)


def norm(table, rec):
    """The record as parsed values: stamps compared as instants."""
    rec = dict(rec)
    for f in C.COLS[table].stamps:
        if rec.get(f) is not None:
            rec[f] = C.parse_ts(rec[f])
    return rec


@unittest.skipUnless(os.path.isdir(SRC), "source files are removed after the Supabase cutover")
class ColsTest(unittest.TestCase):
    def test_round_trip_each_table(self):
        for table, name in FILES.items():
            for rec in read(name):
                back = C.from_row(table, C.to_row(table, rec))
                self.assertEqual(norm(table, back), norm(table, rec), (table, rec.get("id")))
        for rec in quotes():
            back = C.from_row("quotes", C.to_row("quotes", rec))
            self.assertEqual(norm("quotes", back), norm("quotes", rec))

    def test_unknown_field_goes_to_extra(self):
        row = C.to_row("places", {"kind": "node", "id": "X", "name": "x", "colour": "red"})
        self.assertEqual(row["extra"], {"colour": "red"})
        self.assertEqual(C.from_row("places", row)["colour"], "red")
        self.assertNotIn("colour", row)

    def test_names_follow_the_spec(self):
        row = C.to_row("connections", {"kind": "edge", "from": "A", "to": "B", "both": True, "mode": "bus", "operator": None})
        self.assertEqual((row["from_id"], row["to_id"], row["both_ways"]), ("A", "B", True))
        self.assertEqual(C.to_row("places", {"id": "A", "iata": "CPH"})["airport_code"], "CPH")
        self.assertEqual(C.to_row("profiles", {"id": "A", "kind": "profile"})["place_id"], "A")
        q = C.to_row("quotes", {"out": {"a": 1}, "mid": [], "home": None, "observed_at": "2026-10-31T15:55Z"})
        self.assertEqual((q["out_leg"], q["mid_legs"], q["home_leg"]), ({"a": 1}, [], None))

    def test_quote_null_mid_dropped(self):
        row = C.to_row("quotes", {"agent": "a", "out": {}, "home": None, "task_id": None})
        back = C.from_row("quotes", row)
        self.assertNotIn("mid", back)
        self.assertNotIn("trip_name", back)
        self.assertIn("home", back)
        self.assertIn("task_id", back)
        self.assertIsNone(back["home"])
        self.assertNotIn("quote_id", back)
        self.assertNotIn("usable", back)

    def test_experience_nulls_kept(self):
        recs = read("experiences.jsonl")
        nulls = sum(1 for r in recs for v in r.values() if v is None)
        kept = sum(1 for r in recs for v in C.from_row("experiences", C.to_row("experiences", r)).values() if v is None)
        self.assertEqual(kept, nulls)
        self.assertGreater(nulls, 2000)

    def test_profile_hostels_absent_fields_dropped(self):
        rec = {"kind": "profile_hostels", "id": "LCORN", "hostels": [{"name": "h"}], "origin": "w"}
        back = C.from_row("profiles", C.to_row("profiles", rec))
        self.assertEqual(back, rec)
        full = {"kind": "profile", "id": "LCORN", "image": None, "hostels": []}
        back = C.from_row("profiles", C.to_row("profiles", full))
        self.assertIsNone(back["image"])
        self.assertIsNone(back["tagline"])

    def test_observed_at_reads_back_as_last_seen_in_z(self):
        row = C.to_row("quotes", {"observed_at": "2026-10-31T15:55Z"})
        self.assertEqual(row["last_seen"], "2026-10-31T15:55:00Z")
        row["last_seen"] = "2026-10-31T15:55:00+00:00"
        self.assertEqual(C.from_row("quotes", row)["observed_at"], "2026-10-31T15:55:00Z")
        row["last_seen"] = "2026-10-31T17:55:00.5+02:00"
        self.assertEqual(C.from_row("quotes", row)["observed_at"], "2026-10-31T15:55:00Z")
        self.assertNotIn("first_seen", C.from_row("quotes", row))

    def test_fold_places_98_to_88(self):
        rows = read("places.jsonl")
        self.assertEqual((len(rows), len(C.fold_places(rows))), (98, 88))

    def test_fold_places_later_non_null_wins(self):
        out = C.fold_places([{"id": "A", "name": "old", "iata": "CPH", "why": None}, {"id": "A", "name": "new", "iata": None, "why": "w"}])
        self.assertEqual(out, [{"id": "A", "name": "new", "iata": "CPH", "why": "w"}])

    def test_fold_profiles_123_to_118(self):
        rows = read("profiles.jsonl")
        self.assertEqual((len(rows), len(C.fold_profiles(rows))), (123, 118))

    def test_later_null_image_keeps_image(self):
        rows = [{"id": "A", "kind": "profile", "image": {"url": "u"}, "summary": "a"},
                {"id": "A", "kind": "profile", "image": None, "summary": "b"}]
        out = C.fold_profiles(rows)
        self.assertEqual(out, [{"id": "A", "kind": "profile", "image": {"url": "u"}, "summary": "b"}])

    def test_hostels_of_an_earlier_row_survive(self):
        rows = [{"id": "A", "kind": "profile_hostels", "hostels": [{"name": "x", "p": 1}, {"name": "y", "p": 2}]},
                {"id": "A", "kind": "profile_hostels", "hostels": [{"name": "y", "p": 3}]}]
        out = C.fold_profiles(rows)
        self.assertEqual(out[0]["hostels"], [{"name": "y", "p": 3}, {"name": "x", "p": 1}])

    def test_fold_quotes_counts(self):
        rows = quotes()
        folded = C.fold_quotes(rows, cfg())
        self.assertEqual(sum(r["seen_count"] for r in folded), len(rows))
        self.assertEqual(len({r["quote_id"] for r in folded}), len(folded))
        self.assertLess(len(folded), len(rows))
        for r in folded:
            self.assertLessEqual(C.parse_ts(r["first_seen"]), C.parse_ts(r["last_seen"]))

    def test_fold_quotes_stops_on_two_qids(self):
        base = next(r for r in quotes() if r.get("price_dkk"))
        a = C.quote_row(base, cfg())
        b = dict(a, build_qid="Q:other", price_dkk=float(a["price_dkk"]) + 1)
        orig = C.quote_row
        rows = iter([a, b])
        try:
            C.quote_row = lambda rec, c: next(rows)
            with self.assertRaises(C.QuoteIdConflict):
                C.fold_quotes([base, base], cfg())
        finally:
            C.quote_row = orig

    def test_int_and_float_price_are_one_quote(self):
        base = next(r for r in quotes() if isinstance(r.get("price_dkk"), int) and r["price_dkk"])
        twin = json.loads(json.dumps(base))
        twin["price_dkk"] = float(base["price_dkk"])
        twin["observed_at"] = "2030-01-01T00:00Z"
        out = C.fold_quotes([base, twin], cfg())
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["seen_count"], 2)
        self.assertEqual(out[0]["last_seen"], "2030-01-01T00:00:00Z")

    def test_computed_columns(self):
        c = cfg()
        for rec in quotes()[:300]:
            r = C.quote_row(rec, c)
            self.assertTrue(r["quote_id"].startswith("Q2:"))
            self.assertTrue(r["build_qid"].startswith("Q:"))
            self.assertIn(r["usable"], (0, 1))
            self.assertIn(r["structure"], ("one_way", "return", "open_jaw", "multi_city"))
            self.assertIsNotNone(r["first_from"])


if __name__ == "__main__":
    unittest.main()


class AbsentFieldTest(unittest.TestCase):
    base = {"agent": "a", "source": "kiwi", "structure": "one_way", "legs_requested": [], "out": {}}

    def test_a_missing_field_stays_missing_and_a_null_stays_null(self):
        for rec in ({**base_rec} for base_rec in (self.base,)):
            back = C.from_row("quotes", C.to_row("quotes", rec))
            self.assertNotIn("home", back)
            self.assertNotIn("fare_brand", back)
        rec = {**self.base, "home": None, "fare_brand": None}
        back = C.from_row("quotes", C.to_row("quotes", rec))
        self.assertIsNone(back["home"])
        self.assertIsNone(back["fare_brand"])
