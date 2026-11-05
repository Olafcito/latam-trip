"""Tests for the places to stay schemas and their migration. Run from the repo root:
python -I -X utf8 -m unittest discover -s plugin/scripts -p "test_lodgings_schema.py"
The places and prices are made up."""
import os, re, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tripdb  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
MIGRATION = os.path.join(REPO, "supabase", "migrations", "0014_lodgings.sql")
TABLES = ("lodgings", "lodging_rooms", "lodging_prices")

LODGING = {
    "id": "l1", "place_id": "CTG", "name": "Test Hostel", "kind": "hostel",
    "photos": [{"url": "https://example.com/a.jpg", "caption": "The pool"}],
    "rating": 9.1, "reviews": 812, "rating_source": "hostelworld", "address": "Calle 1", "lat": 10.42, "lon": -75.55,
    "to_center_km": 1.2, "to_beach_km": 0, "tags": ["pool", "social"], "summary": "A social hostel by the walls.",
    "notes": "Ask for the top floor", "links": [{"site": "hostelworld", "url": "https://example.com/hostel/TEST01"}],
    "added_by": "claude", "hidden": False,
}
ROOM = {"id": "r1", "lodging_id": "l1", "name": "10 bed dorm", "beds": 10, "private": False, "bathroom": "shared",
        "notes": None, "site": "hostelworld", "site_id": "TEST01", "photo": "https://example.com/room.jpg"}
PRICE = {"id": "p1", "room_id": "r1", "check_in": "2026-12-09", "check_out": "2026-12-14", "total_dkk": 1240,
         "per_night_dkk": 248, "site": "hostelworld", "url": "https://example.com/hostel/TEST01", "refundable": "partly",
         "cancel_until": "2026-12-06", "available": 3, "observed_at": "2026-11-03T10:00:00Z"}


class LodgingSchema(unittest.TestCase):
    def test_a_full_lodging_room_and_price_pass(self):
        self.assertEqual(tripdb.check_fields(LODGING, tripdb.LODGING), [])
        self.assertEqual(tripdb.check_fields(ROOM, tripdb.LODGING_ROOM), [])
        self.assertEqual(tripdb.check_fields(PRICE, tripdb.LODGING_PRICE), [])

    def test_an_unknown_kind_is_refused(self):
        errs = tripdb.check_fields(dict(LODGING, kind="castle"), tripdb.LODGING)
        self.assertTrue(any(e.startswith("kind is") for e in errs), errs)

    def test_an_unknown_added_by_or_bathroom_is_refused(self):
        self.assertTrue(tripdb.check_fields(dict(LODGING, added_by="someone"), tripdb.LODGING))
        self.assertTrue(tripdb.check_fields(dict(ROOM, bathroom="outside"), tripdb.LODGING_ROOM))

    def test_a_link_to_an_unknown_site_is_refused(self):
        self.assertEqual(tripdb.check_fields(LODGING["links"][0], tripdb.LODGING_LINK), [])
        errs = tripdb.check_fields({"site": "expedia", "url": "https://example.com"}, tripdb.LODGING_LINK)
        self.assertTrue(any(e.startswith("site is") for e in errs), errs)
        self.assertEqual(tripdb.check_fields(LODGING["photos"][0], tripdb.LODGING_PHOTO), [])
        self.assertIn("missing url", tripdb.check_fields({"caption": "x"}, tripdb.LODGING_PHOTO))

    def test_a_room_without_lodging_id_is_refused(self):
        row = {k: v for k, v in ROOM.items() if k != "lodging_id"}
        self.assertIn("missing lodging_id", tripdb.check_fields(row, tripdb.LODGING_ROOM))

    def test_a_price_without_check_in_is_refused(self):
        row = {k: v for k, v in PRICE.items() if k != "check_in"}
        self.assertIn("missing check_in", tripdb.check_fields(row, tripdb.LODGING_PRICE))

    def test_a_room_from_an_unknown_site_or_a_price_with_a_text_count_is_refused(self):
        self.assertTrue(tripdb.check_fields(dict(ROOM, site="expedia"), tripdb.LODGING_ROOM))
        self.assertEqual(tripdb.check_fields(dict(ROOM, site=None, site_id=None, photo=None), tripdb.LODGING_ROOM), [])
        self.assertTrue(tripdb.check_fields(dict(PRICE, available="3"), tripdb.LODGING_PRICE))
        self.assertEqual(tripdb.check_fields(dict(PRICE, available=None), tripdb.LODGING_PRICE), [])

    def test_a_trip_place_with_planned_stays_passes(self):
        p = {"node": "CTG", "hop": None, "stays": [{"lodging_id": "a", "room_id": "b"}]}
        self.assertEqual(tripdb.check_fields(p, tripdb.TRIP_PLACE), [])
        self.assertTrue(tripdb.check_fields(dict(p, stays="a"), tripdb.TRIP_PLACE))

    def test_each_planned_stay_has_the_trip_stay_shape(self):
        def stay_errors(stays):
            t = {"version": 1, "way_in": {}, "way_home": {}, "places": [{"node": "CTG", "hop": None, "stays": stays}]}
            return [e for e in tripdb.trip_errors(t) if e.startswith("places[0].stays")]
        self.assertEqual(stay_errors([{"lodging_id": "a", "room_id": "b", "nights": 3}, {"lodging_id": "c"}]), [])
        errs = stay_errors([1, {"room": "x"}, {"lodging_id": "a", "nights": 0}, {"lodging_id": "a", "nights": "2"}])
        self.assertEqual([e.split(" ")[0] for e in errs], [f"places[0].stays[{k}]" for k in range(4)])
        self.assertIn("missing lodging_id", errs[1])
        self.assertIn("nights is below 1", errs[2])

    def test_the_tag_words_are_the_ones_of_the_spec(self):
        self.assertEqual(tripdb.LODGING_TAGS.split(","),
                         ["beach", "pool", "social", "quiet", "kitchen", "breakfast", "aircon", "workspace"])


class LodgingMigration(unittest.TestCase):
    """The owner only rule lives in the migration text, so an edit cannot quietly drop it."""

    def setUp(self):
        with open(MIGRATION, encoding="utf-8") as f:
            self.sql = re.sub(r"--[^\n]*", "", f.read()).lower()

    def test_the_owner_only_rule_is_on_every_table(self):
        for t in TABLES:
            for part in (f"create table public.{t} (",
                         f"alter table public.{t} enable row level security",
                         f"create policy owner_all on public.{t} for all to authenticated",
                         f"revoke all on public.{t} from anon"):
                self.assertIn(part, self.sql)

    def test_every_table_is_in_realtime(self):
        for t in TABLES:
            self.assertRegex(self.sql, rf"tablename = '{t}'\)\s+then\s+alter publication supabase_realtime add table public\.{t};")

    def test_rooms_and_prices_go_with_what_they_belong_to(self):
        self.assertIn("lodging_id text not null references public.lodgings(id) on delete cascade", self.sql)
        self.assertIn("room_id text not null references public.lodging_rooms(id) on delete cascade", self.sql)
        self.assertEqual(self.sql.count("id text primary key default gen_random_uuid()::text"), 3)

    def test_no_policy_or_grant_reaches_anon(self):
        self.assertNotRegex(self.sql, r"\bto\s+anon\b")
        self.assertNotRegex(self.sql, r"\bto\s+public\b")
        self.assertEqual(len(re.findall(r"create policy", self.sql)), 3)


if __name__ == "__main__":
    unittest.main()
