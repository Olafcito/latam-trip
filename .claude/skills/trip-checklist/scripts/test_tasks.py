"""Tests of tasks.py against a fake table. No network. Run: python -I -X utf8 -m unittest discover -s plugin/skills/trip-checklist/scripts -p "test_tasks.py" """
import contextlib, io, json, os, sys, tempfile, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import tasks  # noqa: E402


class FakeRest:
    def __init__(self, rows):
        self.rows = rows
        self.patches = []

    def get_all(self, table, params=None):
        assert table == "tasks"
        rows = list(self.rows)
        if "id" in params:
            rows = [r for r in rows if r["id"] == int(params["id"].split(".")[1])]
        if "status" in params:
            want = params["status"][4:-1].split(",")
            rows = [r for r in rows if r["status"] in want]
        return sorted(rows, key=lambda r: r["id"])

    def patch(self, table, params, body, returning=None):
        self.patches.append((table, params, body))
        for r in self.rows:
            if r["id"] == int(params["id"].split(".")[1]):
                r.update(body)


def row(i, status, title="t"):
    return {"id": i, "type": "flight_prices", "status": status, "title": title,
            "data": {"type": "flight_prices", "legs": [], "from": "app"}}


def out(fn, *a):
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        fn(*a)
    return buf.getvalue()


class TasksTest(unittest.TestCase):
    def test_list_shows_open_and_working(self):
        rest = FakeRest([row(10000, "open", "a"), row(10001, "working", "b"), row(10002, "done", "c")])
        text = out(tasks.cmd_list, rest)
        self.assertIn("#10000\tflight_prices\topen\ta", text)
        self.assertIn("#10001\tflight_prices\tworking\tb", text)
        self.assertNotIn("10002", text)
        self.assertIn("2 open", text)

    def test_show_prints_task_json(self):
        rest = FakeRest([row(10000, "open")])
        self.assertEqual(json.loads(out(tasks.cmd_show, rest, "10000")), {"type": "flight_prices", "legs": [], "from": "app"})

    def test_start_sets_working(self):
        rest = FakeRest([row(10000, "open")])
        out(tasks.cmd_start, rest, "10000")
        self.assertEqual(rest.rows[0]["status"], "working")
        self.assertEqual(rest.patches[0][2], {"status": "working"})

    def test_done_writes_result_and_logs(self):
        rest = FakeRest([row(10000, "working")])
        calls = []
        tasks.run_tripdb = lambda root, args: calls.append(args)
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, "s.md")
            with open(f, "w", encoding="utf-8") as fh:
                fh.write("# Found 12 fares\n\nDetails.\n")
            out(tasks.cmd_done, rest, "10000", f, ["quotes"], d)
        r = rest.rows[0]
        self.assertEqual(r["status"], "done")
        self.assertTrue(r["result"].startswith("# Found 12 fares"))
        self.assertTrue(r["done_at"])
        args = calls[0]
        self.assertEqual(args[:5], ["log-task", "--issue", "10000", "--summary", "Found 12 fares"])
        self.assertIn("--outputs", args)
        self.assertEqual(args[args.index("--type") + 1], "flight_prices")

    def test_the_userscript_task_types_can_be_shown_and_closed(self):
        for kind in ("fix_parser", "import_quotes"):
            r = {"id": 20000, "type": kind, "status": "open", "title": "u", "data": {"type": kind, "from": "userscript"}}
            rest = FakeRest([r])
            self.assertEqual(json.loads(out(tasks.cmd_show, rest, "20000"))["type"], kind)
            self.assertIn(f"#20000	{kind}	open	u", out(tasks.cmd_list, rest))
            calls = []
            tasks.run_tripdb = lambda root, args: calls.append(args)
            with tempfile.TemporaryDirectory() as d:
                f = os.path.join(d, "s.md")
                with open(f, "w", encoding="utf-8") as fh:
                    fh.write("# Fixed" + chr(10))
                out(tasks.cmd_done, rest, "20000", f, [], d)
            self.assertEqual(rest.rows[0]["status"], "done")
            self.assertEqual(calls[0][calls[0].index("--type") + 1], kind)

    def test_a_booking_task_is_listed_and_closed_with_only_its_type_and_leg_logged(self):
        leg = {"kind": "flight", "from": "ADZ", "to": "SMR", "day": "2026-12-08"}
        task = {"type": "booking", "leg": leg, "text": "confirmation in Gmail, ref TEST01, booked for two at 1234 kr",
                "note": "TEST01", "reference": "TEST01", "price_dkk": 1234, "from": "app"}
        rest = FakeRest([{"id": 40000, "type": "booking", "status": "open", "title": "b", "data": task}])
        self.assertIn("#40000	booking	open	b", out(tasks.cmd_list, rest))
        self.assertEqual(json.loads(out(tasks.cmd_show, rest, "40000"))["leg"], leg)
        logged, sent = [], []

        def log(root, args):
            sent.append(args)
            with open(args[args.index("--task") + 1], encoding="utf-8") as fh:
                logged.append(json.load(fh))

        tasks.run_tripdb = log
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, "s.md")
            with open(f, "w", encoding="utf-8") as fh:
                fh.write("# Booked ADZ to SMR, ref TEST01, 1234 kr" + chr(10))
            out(tasks.cmd_done, rest, "40000", f, ["TEST01.pdf"], d)
        self.assertEqual(rest.rows[0]["status"], "done")
        self.assertEqual(logged, [{"type": "booking", "leg": leg}])
        args = sent[0]
        self.assertEqual(args[args.index("--summary") + 1], "Booked")
        self.assertEqual(args[args.index("--outputs") + 1], "")
        for word in ("TEST01", "1234"):
            self.assertNotIn(word, json.dumps(logged))
            self.assertNotIn(word, json.dumps(args))

    def test_a_stay_prices_task_names_rooms_of_a_lodging(self):
        good = {"type": "stay_prices", "lodging_id": "L1", "room_ids": ["R1", "R2"], "check_in": "2026-12-10",
                "check_out": "2026-12-14", "from": "app"}
        old = {"type": "stay_prices", "place": "UTIL", "check_in": "2026-12-10", "check_out": "2026-12-14", "kinds": ["hostel"]}
        rest = FakeRest([{"id": 30000, "type": "stay_prices", "status": "open", "title": "a", "data": good},
                         {"id": 30001, "type": "stay_prices", "status": "open", "title": "b", "data": old}])
        text = out(tasks.cmd_list, rest)
        self.assertIn("#30000	stay_prices	open	a", text)
        self.assertIn("#30001	BAD TASK (stay_prices needs lodging_id, room_ids)	open	b", text)


if __name__ == "__main__":
    unittest.main()
