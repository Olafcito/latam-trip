"""Tests for pick_options in the flight-crawl-orchestrator's inout_pick.py, the long haul options kept per day pair.
Run from the repo root: python -I -X utf8 -m unittest discover -s plugin/scripts -p "test_inout_pick.py"
"""
import os, sys, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "skills", "flight-crawl-orchestrator", "scripts"))
from inout_pick import pick_options  # noqa: E402

WAYS = {"I2": {"depart": "2026-12-02T06:10"}, "I3": {"depart": "2026-12-03T07:00"}, "I3b": {"depart": "2026-12-03T13:00"},
        "H3": {"depart": "2027-02-03T18:00"}, "S1": {"depart": "2026-12-04T09:00"}, "S2": {"depart": "2027-02-01T10:00"}}


def opt(id_, way_in, way_home, price, total):
    return {"id": id_, "type": id_.split("-")[2], "way_in": way_in, "way_home": way_home, "price_dkk": price,
            "rating": {"total": total}}


def by_id(opts):
    return {o["id"]: o for o in opts}


DEC2 = opt("CTG-GUA-ticket", "I2", "H3", 8235, 6.9)
DEC3 = opt("CTG-GUA-ticket", "I3", "H3", 7900, 7.3)


class PickOptionsTest(unittest.TestCase):
    def test_keeps_one_option_per_day_pair(self):
        out = pick_options([DEC2, DEC3], WAYS)
        self.assertEqual({o["id"] for o in out}, {"CTG-GUA-ticket", "CTG-GUA-ticket-1202-0203"})

    def test_the_best_of_a_city_pair_keeps_the_old_id(self):
        out = by_id(pick_options([DEC2, DEC3], WAYS))
        self.assertEqual(out["CTG-GUA-ticket"]["way_in"], DEC3["way_in"])
        self.assertEqual(out["CTG-GUA-ticket-1202-0203"]["way_in"], DEC2["way_in"])

    def test_same_day_pair_keeps_the_better_one(self):
        early = opt("CTG-GUA-ticket", "I3", "H3", 7900, 7.3)
        later_cheaper = opt("CTG-GUA-ticket", "I3b", "H3", 7600, 7.3)
        worse = opt("CTG-GUA-ticket", "I3b", "H3", 7000, 7.0)
        out = pick_options([early, worse, later_cheaper], WAYS)
        self.assertEqual(len(out), 1)
        self.assertEqual(out[0]["way_in"], "I3b")
        self.assertEqual(out[0]["price_dkk"], 7600)
        out = pick_options([worse, early], WAYS)
        self.assertEqual([o["price_dkk"] for o in out], [7900])

    def test_ids_are_unique(self):
        opts = [DEC2, DEC3, opt("CTG-GUA-ticket", "I3b", "H3", 7600, 7.3), opt("CTG-GUA-ticket", "I2", "H3", 9000, 5.0),
                opt("CTG-GUA-madrid", "I2", "H3", 6000, 7.8), opt("CTG-GUA-madrid", "S1", "S2", 6500, 7.4),
                opt("SJO-LPB-oneways", "S1", "S2", 5000, 6.0)]
        out = pick_options(opts, WAYS)
        ids = [o["id"] for o in out]
        self.assertEqual(len(ids), len(set(ids)))
        self.assertEqual(set(ids), {"CTG-GUA-ticket", "CTG-GUA-ticket-1202-0203", "CTG-GUA-madrid", "CTG-GUA-madrid-1204-0201",
                                    "SJO-LPB-oneways"})

    def test_sorted_by_rating_then_price(self):
        opts = [opt("SJO-LPB-oneways", "S1", "S2", 5000, 6.0), DEC2, DEC3, opt("CTG-GUA-madrid", "S1", "S2", 7000, 7.3)]
        out = pick_options(opts, WAYS)
        self.assertEqual([(o["id"], o["price_dkk"]) for o in out],
                         [("CTG-GUA-madrid", 7000), ("CTG-GUA-ticket", 7900), ("CTG-GUA-ticket-1202-0203", 8235),
                          ("SJO-LPB-oneways", 5000)])

    def test_input_options_are_not_changed(self):
        pick_options([DEC2, DEC3], WAYS)
        self.assertEqual(DEC2["id"], "CTG-GUA-ticket")


if __name__ == "__main__":
    unittest.main()
