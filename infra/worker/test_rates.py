"""Tests of the morning rates refresh. No network: a fake REST client and a fake function.
Run: python -I -X utf8 -m unittest discover -s infra/worker -p "test_rates.py"
The places and prices are made up."""
import os, sys, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import rates  # noqa: E402


class FakeRest:
    def __init__(self, prices):
        self.prices, self.params = prices, None

    def get_all(self, table, params=None):
        assert table == "lodging_prices"
        self.params = params
        return [dict(r) for r in self.prices]


PRICES = [
    {"check_in": "2026-12-10", "check_out": "2026-12-13", "lodging_rooms": {"lodging_id": "l1"}},
    {"check_in": "2026-12-10", "check_out": "2026-12-13", "lodging_rooms": {"lodging_id": "l1"}},
    {"check_in": "2026-12-20", "check_out": "2026-12-22", "lodging_rooms": {"lodging_id": "l1"}},
    {"check_in": "2026-12-10", "check_out": "2026-12-13", "lodging_rooms": {"lodging_id": "l2"}},
    {"check_in": "2026-12-10", "check_out": "2026-12-13", "lodging_rooms": None},
]


class Wanted(unittest.TestCase):
    def test_each_place_and_dates_once_and_only_hostelworld_from_today(self):
        rest = FakeRest(PRICES)
        self.assertEqual(rates.wanted(rest, "2026-11-05"), [
            ("l1", "2026-12-10", "2026-12-13"), ("l1", "2026-12-20", "2026-12-22"), ("l2", "2026-12-10", "2026-12-13")])
        self.assertEqual(rest.params["site"], "eq.hostelworld")
        self.assertEqual(rest.params["check_in"], "gte.2026-11-05")


class Refresh(unittest.TestCase):
    def test_every_wanted_set_is_asked_with_the_fetch_forced_and_failures_are_listed(self):
        calls = []

        def call(body):
            calls.append(body)
            if body["lodging_id"] == "l2":
                return 502, {"error": "Hostelworld did not answer."}
            if body["check_in"] == "2026-12-20":
                return 200, {"lodging_id": "l1", "fetched": False, "rooms": 0, "prices": 0}
            return 200, {"lodging_id": "l1", "fetched": True, "rooms": 2, "prices": 2}

        out = rates.refresh(FakeRest(PRICES), call, today="2026-11-05")
        self.assertEqual(len(calls), 3)
        self.assertTrue(all(c["fresh_minutes"] == 0 for c in calls))
        self.assertEqual(out["asked"], 3)
        self.assertEqual(out["fetched"], 1)
        self.assertEqual([f["lodging_id"] for f in out["failed"]], ["l1", "l2"])
        self.assertEqual(out["failed"][1]["error"], "Hostelworld did not answer.")

    def test_nothing_wanted_asks_nothing(self):
        out = rates.refresh(FakeRest([]), lambda body: self.fail("called"), today="2026-11-05")
        self.assertEqual(out, {"asked": 0, "fetched": 0, "failed": []})

    def test_it_stops_asking_when_the_lambda_is_nearly_out_of_time(self):
        calls = []
        left = iter([120000, 90000, 29000] + [10000] * 10)

        def call(body):
            calls.append(body)
            return 200, {"fetched": True}

        out = rates.refresh(FakeRest(PRICES), call, today="2026-11-05", remaining_ms=lambda: next(left), workers=1)
        self.assertEqual(len(calls), 2)
        self.assertEqual(out["asked"], 2)
        self.assertEqual(out["fetched"], 2)
        self.assertTrue(out["stopped_early"])

    def test_it_does_not_report_stopped_early_when_all_were_asked(self):
        out = rates.refresh(FakeRest(PRICES), lambda body: (200, {"fetched": True}), today="2026-11-05", remaining_ms=lambda: 200000)
        self.assertEqual(out["asked"], 3)
        self.assertNotIn("stopped_early", out)


if __name__ == "__main__":
    unittest.main()
