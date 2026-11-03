"""Tests for the bookings schema and its migration. Run from the repo root:
python -I -X utf8 -m unittest discover -s plugin/scripts -p "test_bookings_schema.py"
The references are made up. No real booking is ever written here."""
import os, re, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tripdb  # noqa: E402

REPO = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
MIGRATION = os.path.join(REPO, "supabase", "migrations", "0013_bookings.sql")
DETAILS = os.path.join(REPO, "supabase", "migrations", "0015_booking_details.sql")

FLIGHT = {
    "kind": "flight", "status": "booked", "from_code": "CPH", "to_code": "CTG",
    "depart": "2026-12-02T06:00", "arrive": "2026-12-02T19:40", "reference": "TEST01", "seller": "KLM",
    "seller_reference": "TEST02", "fare": "Light", "url": "https://example.com/booking/TEST01", "price_dkk": 4200, "price": 560.5, "currency": "EUR",
    "refundable": "no", "changeable": "fee", "change_until": "2026-11-30", "cancel_until": None,
    "cabin_bag": "8 kg", "checked_bag": "23 kg", "travellers": 1, "ticket": "TEST01",
    "segments": [{"flight": "KL1126", "from": "CPH", "to": "AMS", "depart": "2026-12-02T06:00",
                  "arrive": "2026-12-02T07:30"}],
    "trip_id": "ctg-sal-xmas-cbb", "source": "picked", "notes": "Window seat", "attachments": [],
}
STAY = {"kind": "stay", "status": "booked", "place_id": "CTG", "check_in": "2026-12-02",
        "check_out": "2026-12-05", "reference": "TEST02", "seller": "Hostelworld", "source": "manual"}


class BookingSchema(unittest.TestCase):
    def check(self, row):
        return tripdb.check_fields(row, tripdb.BOOKING)

    def test_a_full_flight_row_passes(self):
        self.assertEqual(self.check(FLIGHT), [])

    def test_a_row_without_kind_is_refused(self):
        row = {k: v for k, v in FLIGHT.items() if k != "kind"}
        self.assertIn("missing kind", self.check(row))

    def test_a_row_without_status_is_refused(self):
        row = {k: v for k, v in FLIGHT.items() if k != "status"}
        self.assertIn("missing status", self.check(row))

    def test_an_unknown_kind_is_refused(self):
        errs = self.check(dict(FLIGHT, kind="plane"))
        self.assertTrue(any(e.startswith("kind is") for e in errs), errs)

    def test_an_unknown_refundable_is_refused(self):
        errs = self.check(dict(FLIGHT, refundable="maybe"))
        self.assertTrue(any(e.startswith("refundable is") for e in errs), errs)

    def test_a_stay_row_with_its_dates_passes(self):
        self.assertEqual(self.check(STAY), [])

    def test_a_seller_reference_must_be_text(self):
        errs = self.check(dict(FLIGHT, seller_reference=12345))
        self.assertTrue(any(e.startswith("seller_reference") for e in errs), errs)

    def test_bookings_stay_out_of_the_built_tables(self):
        self.assertNotIn("bookings", tripdb.TABLES)

    def test_a_kind_and_status_alone_pass(self):
        self.assertEqual(self.check({"kind": "other", "status": "cancelled"}), [])


class BookingMigration(unittest.TestCase):
    """The owner only rule lives in the migration text, so an edit cannot quietly drop it."""

    def setUp(self):
        with open(MIGRATION, encoding="utf-8") as f:
            self.sql = re.sub(r"--[^\n]*", "", f.read()).lower()

    def test_the_owner_only_rule_is_in_the_migration(self):
        for part in ("alter table public.bookings enable row level security",
                     "create policy owner_all on public.bookings",
                     "revoke all on public.bookings from anon",
                     "'bookings', 'bookings', false",
                     "alter publication supabase_realtime add table public.bookings"):
            self.assertIn(part, self.sql)

    def test_no_policy_or_grant_reaches_anon(self):
        self.assertNotRegex(self.sql, r"\bto\s+anon\b")
        self.assertNotRegex(self.sql, r"\bto\s+public\b")

    def test_every_storage_policy_is_for_the_bookings_bucket_and_the_owner(self):
        policies = re.findall(r"create policy \w+ on storage\.objects.*?;", self.sql, re.S)
        self.assertEqual(len(policies), 4, policies)
        for p in policies:
            self.assertIn("to authenticated", p)
            self.assertIn("bucket_id = 'bookings'", p)
            self.assertIn("(select public.is_owner())", p)


class DetailsMigration(unittest.TestCase):
    """0015 only adds columns. It opens nothing to anon and adds no trigger that would mark a build dirty."""

    def setUp(self):
        with open(DETAILS, encoding="utf-8") as f:
            self.sql = re.sub(r"--[^\n]*", "", f.read()).lower()

    def test_it_adds_the_two_columns(self):
        self.assertIn("add column seller_reference text", self.sql)
        self.assertIn("add column fare text", self.sql)

    def test_it_grants_and_triggers_nothing(self):
        for word in ("grant", "policy", "trigger", "anon", "disable"):
            self.assertNotIn(word, self.sql)


if __name__ == "__main__":
    unittest.main()
