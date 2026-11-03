"""Tests for booked_hops. Run from the repo root: python -I -X utf8 -m unittest discover -s plugin/scripts -p "test_*.py"
The store is faked in memory and the references are made up, so nothing goes online."""
import contextlib, io, json, os, sys, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import booked_hops  # noqa: E402
import tripdb  # noqa: E402
import tripdb_store  # noqa: E402

OPERATOR = "LATAM LA4392, booked: Travellink 11111111111, LATAM booking TEST01"
BOOKED = {"quote_id": "BOOKED:TEST01", "depart": "2026-12-03T11:37", "arrive": "2026-12-03T13:02", "hours": 1.4,
          "price_dkk": 700, "carriers": ["LATAM"], "source": "booked"}
COLUMNS = [k for k in tripdb.BOOKING if k not in ("id", "created_at", "updated_at", "attachments")]


def hop(a, b, flight=None, operator=OPERATOR, mode="flight"):
    return {"from": a, "to": b, "mode": mode, "operator": operator, "hours": 1.4, "price_dkk": 700, "flight": flight}


def trip(tid, hops):
    places = [{"node": "CTG", "hop": None}] + [{"node": h["to"], "hop": h} for h in hops]
    return {"id": tid, "version": 2, "name": tid, "places": places}


class FakeRest:
    """The bookings table in memory, refusing what PostgREST refuses."""

    def __init__(self):
        self.rows, self.inserts = [], 0

    def get_all(self, table, params=None, page=None, limit=None):
        assert table == "bookings", table
        return [json.loads(json.dumps(r)) for r in self.rows]

    def insert(self, table, rows, returning=None, columns=None, **kw):
        assert table == "bookings", table
        if len({frozenset(r) for r in rows}) > 1 and not columns:
            raise tripdb_store.RestError("POST /rest/v1/bookings gave 400: All object keys must match")
        if any(set(r) - set(columns or COLUMNS) for r in rows):
            raise tripdb_store.RestError("POST /rest/v1/bookings gave 400: a key outside columns")
        self.inserts += 1
        for r in rows:
            self.rows.append({"status": "booked", "travellers": 1, **json.loads(json.dumps(r)), "id": f"b{len(self.rows) + 1}"})
        return [{"id": r["id"]} for r in self.rows[-len(rows):]] if returning else []


class FakeStore:
    kind = "supabase"

    def __init__(self, trips):
        self._trips, self.rest = trips, FakeRest()

    def trips(self):
        return [json.loads(json.dumps(t)) for t in self._trips]


class BookingOfTest(unittest.TestCase):
    def test_a_booked_hop_gives_its_row(self):
        row = booked_hops.booking_of(hop("CTG", "ADZ", BOOKED), "t1")
        self.assertEqual(row, {"kind": "flight", "from_code": "CTG", "to_code": "ADZ", "depart": "2026-12-03T11:37",
                               "arrive": "2026-12-03T13:02", "reference": "TEST01", "seller": "Travellink",
                               "price_dkk": 700, "source": "claude", "trip_id": "t1", "notes": OPERATOR})
        self.assertEqual(set(row) - set(COLUMNS), set())
        self.assertEqual(tripdb.check_fields({"status": "booked", **row}, tripdb.BOOKING), [])

    def test_the_seller_stops_at_the_reference_too(self):
        op = "JetSMART JA1 via Medellin, booked: JetSMART TEST02 (Travellink 22222222222), COP 1"
        row = booked_hops.booking_of(hop("ADZ", "SMR", {**BOOKED, "quote_id": "BOOKED:TEST02"}, op), "t1")
        self.assertEqual((row["seller"], row["reference"]), ("JetSMART", "TEST02"))

    def test_no_booked_part_leaves_the_seller_out(self):
        row = booked_hops.booking_of(hop("CTG", "ADZ", BOOKED, "LATAM LA4392"), "t1")
        self.assertNotIn("seller", row)
        self.assertEqual(row["notes"], "LATAM LA4392")

    def test_no_operator_leaves_seller_and_notes_out(self):
        row = booked_hops.booking_of(hop("CTG", "ADZ", BOOKED, None), "t1")
        self.assertNotIn("seller", row)
        self.assertNotIn("notes", row)

    def test_a_missing_price_is_left_out(self):
        f = {k: v for k, v in BOOKED.items() if k != "price_dkk"}
        self.assertNotIn("price_dkk", booked_hops.booking_of(hop("CTG", "ADZ", f), "t1"))
        self.assertNotIn("price_dkk", booked_hops.booking_of(hop("CTG", "ADZ", {**BOOKED, "price_dkk": None}), "t1"))

    def test_a_hop_not_booked_gives_nothing(self):
        self.assertIsNone(booked_hops.booking_of(hop("CTG", "ADZ", {**BOOKED, "quote_id": "Q:abc"}), "t1"))
        self.assertIsNone(booked_hops.booking_of(hop("CTG", "ADZ", None, mode="bus"), "t1"))
        self.assertIsNone(booked_hops.booking_of(None, "t1"))


class MainTest(unittest.TestCase):
    def setUp(self):
        second = {**BOOKED, "quote_id": "BOOKED:TEST03", "depart": "2026-12-17T12:02", "arrive": "2026-12-17T22:48"}
        plain = {**BOOKED, "quote_id": "Q:plain"}
        # the same booked hop sits in two trips, and is added once
        self.store = FakeStore([
            trip("t1", [hop("CTG", "ADZ", BOOKED), hop("ADZ", "CLO", plain), hop("CLO", "VVI", second, "Copa CM1")]),
            trip("t2", [hop("CTG", "ADZ", BOOKED)])])

    def run_main(self, *argv):
        out = io.StringIO()
        rc = booked_hops.main(["--root", ".", *argv], store=self.store, out=out)
        return rc, out.getvalue()

    def test_without_apply_it_prints_ends_and_days_and_writes_nothing(self):
        rc, out = self.run_main()
        self.assertEqual(rc, 0)
        self.assertEqual(self.store.rest.rows, [])
        self.assertIn("2 bookings to add", out)
        self.assertIn("CTG to ADZ on 2026-12-03", out)
        self.assertIn("CLO to VVI on 2026-12-17", out)
        for secret in ("TEST01", "TEST03", "11111111111", "Travellink", "700"):
            self.assertNotIn(secret, out)

    def test_apply_twice_inserts_once(self):
        rc, out = self.run_main("--apply")
        self.assertEqual(rc, 0)
        self.assertIn("added 2 bookings", out)
        self.assertEqual(sorted(r["reference"] for r in self.store.rest.rows), ["TEST01", "TEST03"])
        self.assertEqual({r["trip_id"] for r in self.store.rest.rows}, {"t1"})
        rc, out = self.run_main("--apply")
        self.assertEqual(rc, 0)
        self.assertIn("added 0 bookings", out)
        self.assertEqual(len(self.store.rest.rows), 2)
        self.assertEqual(self.store.rest.inserts, 1)
        self.assertNotIn("TEST0", out)

    def test_a_row_already_there_is_matched_by_reference_ends_and_day(self):
        self.store.rest.rows.append({"id": "b0", "kind": "flight", "reference": "TEST01", "from_code": "CTG", "to_code": "ADZ",
                                     "depart": "2026-12-03T09:00", "status": "cancelled"})
        rc, out = self.run_main()
        self.assertIn("1 booking to add", out)
        self.assertNotIn("CTG to ADZ", out)
        # another day is another booking
        self.store.rest.rows[0]["depart"] = "2026-12-04"
        rc, out = self.run_main()
        self.assertIn("2 bookings to add", out)

    def test_a_row_the_table_would_refuse_stops_the_run_without_its_values(self):
        bad = {**BOOKED, "quote_id": "BOOKED:TEST04", "depart": "2026-12-20T10:00Z"}
        self.store._trips.append(trip("t3", [hop("VVI", "SJO", bad)]))
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            rc, out = self.run_main("--apply")
        self.assertEqual(rc, 1)
        self.assertEqual(self.store.rest.rows, [])
        self.assertIn("VVI to SJO on 2026-12-20 has a bad depart", err.getvalue())
        self.assertNotIn("TEST04", err.getvalue() + out)

    def test_a_failed_insert_prints_only_its_status(self):
        def refuse(*a, **kw):
            raise tripdb_store.RestError("bookings rows 0 to 1 refused: POST /rest/v1/bookings gave 400: "
                                         "Failing row contains (TEST01, Travellink)")
        self.store.rest.insert = refuse
        err = io.StringIO()
        with contextlib.redirect_stderr(err):
            rc, out = self.run_main("--apply")
        self.assertEqual(rc, 1)
        self.assertIn("the bookings insert failed with 400", err.getvalue())
        self.assertNotIn("TEST01", err.getvalue() + out)
        self.assertNotIn("Travellink", err.getvalue() + out)


if __name__ == "__main__":
    unittest.main()
