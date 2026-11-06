"""Tests of tripdb lodging-details against a fake rest. No network, the ids and prices are made up. Run from the repo root:
python -I -X utf8 -m unittest discover -s plugin/scripts -p "test_lodging_details.py" """
import contextlib, io, json, os, sys, tempfile, unittest

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tripdb  # noqa: E402


class FakeRest:
    def __init__(self, lodgings, rooms=(), prices=()):
        self.t = {"lodgings": [dict(r) for r in lodgings], "lodging_rooms": [dict(r) for r in rooms],
                  "lodging_prices": [dict(r) for r in prices]}
        self.writes, self.n = [], 0

    def _match(self, rows, params):
        for k, v in params.items():
            if k == "select":
                continue
            if v.startswith("eq."):
                rows = [r for r in rows if str(r.get(k)) == v[3:]]
            elif v.startswith("in.("):
                rows = [r for r in rows if str(r.get(k)) in v[4:-1].split(",")]
        return rows

    def get_all(self, table, params=None):
        return [dict(r) for r in self._match(self.t[table], params or {})]

    def insert(self, table, rows, returning=None, **kw):
        out = []
        for r in rows:
            self.n += 1
            r = dict(r, id=r.get("id") or f"new{self.n}")
            self.t[table].append(r)
            self.writes.append(("insert", table, r))
            out.append({"id": r["id"]})
        return out if returning else []

    def patch(self, table, params, body, returning=None):
        for r in self._match(self.t[table], params):
            r.update(body)
        self.writes.append(("patch", table, body))


PRICE = {"check_in": "2026-12-09", "check_out": "2026-12-14", "total_dkk": 1240, "per_night_dkk": 248,
         "url": "https://example.com/TEST01", "refundable": "yes", "cancel_until": "2026-12-06", "available": 3}


def room(name, sid, **over):
    r = {"site_id": sid, "name": name, "beds": None, "private": True, "bathroom": "private",
         "photo": "https://example.com/r.jpg", "notes": None, "prices": [dict(PRICE)]}
    r.update(over)
    return r


class LodgingDetails(unittest.TestCase):
    def run_cmd(self, doc, rest, dry=False):
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, "x.json")
            with open(f, "w", encoding="utf-8") as fh:
                json.dump(doc, fh)
            out = io.StringIO()
            with contextlib.redirect_stdout(out):
                try:
                    tripdb.cmd_lodging_details(tripdb.Paths(d), f, dry, rest=rest)
                except tripdb.Refused as e:
                    return out.getvalue() + "REFUSED " + str(e)
            return out.getvalue()

    def base(self):
        return FakeRest([{"id": "L1", "photos": []}],
                        [{"id": "R1", "lodging_id": "L1", "name": "Double Room", "site": None, "site_id": None, "photo": None},
                         {"id": "R2", "lodging_id": "L1", "name": "Suite", "site": "booking", "site_id": "TEST02", "photo": None}])

    def test_adopts_by_name_matches_by_site_id_and_adds(self):
        rest = self.base()
        doc = {"lodging_id": "L1", "photos": [{"url": "https://example.com/p.jpg", "caption": None}],
               "rooms": [room("double room", "TEST01"), room("Renamed suite", "TEST02", beds=2), room("Loft", "TEST03")]}
        out = self.run_cmd(doc, rest)
        self.assertIn("rooms added 1, rooms updated 2, prices added 3, photos 1", out)
        rooms = {r["id"]: r for r in rest.t["lodging_rooms"]}
        self.assertEqual((rooms["R1"]["site"], rooms["R1"]["site_id"]), ("booking", "TEST01"))
        self.assertEqual(rooms["R2"]["name"], "Renamed suite")
        self.assertEqual(len(rest.t["lodging_rooms"]), 3)
        self.assertEqual({p["site"] for p in rest.t["lodging_prices"]}, {"booking"})
        self.assertEqual(rest.t["lodgings"][0]["photos"], [{"url": "https://example.com/p.jpg", "caption": None}])

    def test_the_cheapest_room_placeholder_goes_to_the_cheapest_room_read(self):
        rest = FakeRest([{"id": "L1", "photos": []}],
                        [{"id": "R1", "lodging_id": "L1", "name": "Cheapest room shown", "site": None, "site_id": None, "photo": None}])
        dear = room("Suite", "TEST02", prices=[dict(PRICE, total_dkk=3000)])
        cheap = room("Standard Double", "TEST01", prices=[dict(PRICE, total_dkk=900)])
        out = self.run_cmd({"lodging_id": "L1", "photos": [], "rooms": [dear, cheap]}, rest)
        self.assertIn("rooms added 1, rooms updated 1", out)
        rooms = {r["id"]: r for r in rest.t["lodging_rooms"]}
        self.assertEqual((rooms["R1"]["name"], rooms["R1"]["site_id"]), ("Standard Double", "TEST01"))
        self.assertEqual(len(rest.t["lodging_rooms"]), 2)

    def test_empty_photos_keep_the_stored_ones_and_a_second_run_adds_no_price(self):
        rest = self.base()
        rest.t["lodgings"][0]["photos"] = [{"url": "https://example.com/old.jpg", "caption": None}]
        doc = {"lodging_id": "L1", "photos": [], "rooms": [room("Double Room", "TEST01")]}
        self.run_cmd(doc, rest)
        out = self.run_cmd(doc, rest)
        self.assertIn("prices added 0", out)
        self.assertEqual(rest.t["lodgings"][0]["photos"][0]["url"], "https://example.com/old.jpg")
        self.assertEqual(len(rest.t["lodging_rooms"]), 2)

    def test_a_bad_row_refuses_the_whole_file(self):
        rest = self.base()
        bad = room("Loft", "TEST03")
        bad["prices"][0]["check_out"] = "2026-12-09"
        out = self.run_cmd({"lodging_id": "L1", "rooms": [room("Double Room", "TEST01"), bad]}, rest)
        self.assertIn("REFUSED", out)
        self.assertIn("check_out is not after check_in", out)
        self.assertEqual(rest.writes, [])

    def test_unknown_lodging_and_bad_bathroom_are_refused(self):
        rest = self.base()
        self.assertIn("no lodging", self.run_cmd({"lodging_id": "NOPE", "rooms": []}, rest))
        out = self.run_cmd({"lodging_id": "L1", "rooms": [room("Loft", "TEST03", bathroom="en suite")]}, rest)
        self.assertIn("bathroom", out)
        self.assertEqual(rest.writes, [])

    def test_dry_writes_nothing(self):
        rest = self.base()
        doc = {"lodging_id": "L1", "photos": [{"url": "https://example.com/p.jpg"}], "rooms": [room("Loft", "TEST03")]}
        out = self.run_cmd(doc, rest, dry=True)
        self.assertIn("rooms added 1", out)
        self.assertEqual(rest.writes, [])


class Migration(unittest.TestCase):
    def test_stay_details_is_not_made_a_cloud_type(self):
        repo = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
        with open(os.path.join(repo, "supabase", "migrations", "0022_stay_details_task.sql"), encoding="utf-8") as fh:
            sql = fh.read()
        self.assertNotIn("function public.task_runs_in_cloud", sql)

    def test_airbnb_places_queue_stay_details_too(self):
        repo = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
        with open(os.path.join(repo, "supabase", "migrations", "0024_stay_details_airbnb.sql"), encoding="utf-8") as fh:
            sql = fh.read()
        self.assertIn("in ('booking', 'airbnb')", sql)
        self.assertNotIn("function public.task_runs_in_cloud", sql)


if __name__ == "__main__":
    unittest.main()
