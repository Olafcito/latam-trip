"""Tests of tasks.py against a fake table. No network. Run: python -I -X utf8 -m unittest discover -s plugin/skills/trip-checklist/scripts -p "test_tasks.py" """
import contextlib, datetime as dt, io, json, os, sys, tempfile, unittest

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
        if "owner_id" in params:
            rows = [r for r in rows if r.get("owner_id") == params["owner_id"][3:]]
        if "id" in params:
            rows = [r for r in rows if r["id"] == int(params["id"].split(".")[1])]
        if "status" in params:
            st = params["status"]
            want = [st[3:]] if st.startswith("eq.") else st[4:-1].split(",")
            rows = [r for r in rows if r["status"] in want]
        return sorted(rows, key=lambda r: r["id"])

    def patch(self, table, params, body, returning=None):
        self.patches.append((table, params, body))
        for r in self.rows:
            if r["id"] == int(params["id"].split(".")[1]) and ("owner_id" not in params or r.get("owner_id") == params["owner_id"][3:]):
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

    def test_done_on_done_task_keeps_result(self):
        r = row(10000, "done")
        r.update(result="Closed by the data: 1 photos", done_at="2026-11-06T10:00:00+00:00")
        rest = FakeRest([r])
        calls = []
        tasks.run_tripdb = lambda root, args: calls.append(args)
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, "s.md")
            with open(f, "w", encoding="utf-8") as fh:
                fh.write("# Stored 2 rooms\n")
            text = out(tasks.cmd_done, rest, "10000", f, [], d)
        self.assertIn("already done by the data", text)
        self.assertEqual(rest.patches, [])
        self.assertEqual(rest.rows[0]["result"], "Closed by the data: 1 photos")
        self.assertEqual(rest.rows[0]["done_at"], "2026-11-06T10:00:00+00:00")
        self.assertEqual(calls[0][:5], ["log-task", "--issue", "10000", "--summary", "Stored 2 rooms"])

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

    def test_every_cloud_type_is_known_here(self):
        from latam_trip_mcp.runner import CLOUD
        self.assertEqual(set(CLOUD) - tasks.TYPES, set())

    def test_fail_sets_failed_with_the_reason(self):
        rest = FakeRest([row(10000, "working")])
        with tempfile.TemporaryDirectory() as d:
            f = os.path.join(d, "r.md")
            with open(f, "w", encoding="utf-8") as fh:
                fh.write("Blocked by a captcha")
            out(tasks.cmd_fail, rest, "10000", f)
        r = rest.rows[0]
        self.assertEqual((r["status"], r["result"]), ("failed", "Blocked by a captcha"))
        self.assertTrue(r["done_at"])


class OwnerTest(unittest.TestCase):
    """Two owners share the table. The loop sees and changes the rows of its own owner only."""

    def rest(self):
        mine, theirs = row(10000, "open", "mine"), row(10001, "open", "theirs")
        mine["owner_id"], theirs["owner_id"] = "OWNER-A", "OWNER-B"
        mine["created_at"] = theirs["created_at"] = "2026-11-06T00:00:00+00:00"
        base = FakeRest([mine, theirs])
        return base, tasks.Owned(base, "OWNER-A")

    def test_wait_and_list_see_only_the_owner(self):
        base, rest = self.rest()
        self.assertEqual(sorted(r["id"] for r in rest.get_all("tasks", {"status": "in.(open)"})), [10000])
        text = out(tasks.cmd_list, rest)
        self.assertIn("#10000", text)
        self.assertNotIn("10001", text)
        lines = out(lambda: tasks.cmd_wait(rest, sleep=lambda s: None, now=lambda: NOW)).splitlines()
        self.assertEqual([json.loads(l)["id"] for l in lines], [10000])

    def test_start_done_and_fail_refuse_a_row_of_another_owner(self):
        base, rest = self.rest()
        for fn, args in ((tasks.cmd_start, ("10001",)), (tasks.cmd_show, ("10001",))):
            with self.assertRaises(SystemExit):
                out(fn, rest, *args)
        # even a Rest that returns the row without the filter does not let start touch it
        with self.assertRaises(SystemExit):
            tasks.get_row(base_without_filter(base, "OWNER-A"), 10001)
        self.assertEqual(base.patches, [])
        self.assertEqual(base.rows[1]["status"], "open")
        out(tasks.cmd_start, rest, "10000")
        self.assertEqual([r["status"] for r in base.rows], ["working", "open"])

    def test_the_owner_is_the_admin_and_nobody_else(self):
        class Admins:
            def get_all(self, table, params=None):
                return [{"user_id": "OWNER-A"}]
        self.assertEqual(tasks.owner_of(Admins(), {}), "OWNER-A")
        self.assertEqual(tasks.owner_of(Admins(), {"TRIPDB_OWNER_ID": "OWNER-A"}), "OWNER-A")
        with self.assertRaises(SystemExit):
            tasks.owner_of(Admins(), {"TRIPDB_OWNER_ID": "OWNER-B"})


def base_without_filter(base, owner):
    """A client with the owner attribute that ignores the filter, as a mistake in Owned would."""
    class Leaky:
        def __init__(self):
            self.owner = owner

        def get_all(self, table, params=None):
            return base.get_all(table, {k: v for k, v in params.items() if k != "owner_id"})
    return Leaky()


NOW = dt.datetime(2026, 11, 6, 12, 0, tzinfo=dt.timezone.utc)


def queued(i, kind, minutes_old, **data):
    made = (NOW - dt.timedelta(minutes=minutes_old)).isoformat()
    return {"id": i, "type": kind, "status": "open", "title": f"t{i}", "created_at": made, "data": {"type": kind, **data}}


class WaitRest(FakeRest):
    """Each get_all call pops the next round: a list of rows, or an exception to raise. Rows are added by the sleep."""
    def __init__(self, rounds):
        super().__init__([])
        self.rounds = list(rounds)

    def get_all(self, table, params=None):
        r = self.rounds.pop(0)
        if isinstance(r, Exception):
            raise r
        return r


class WaitTest(unittest.TestCase):
    def run_wait(self, rounds, **kw):
        rest, slept = WaitRest(rounds), []
        text = out(lambda: tasks.cmd_wait(rest, sleep=slept.append, now=lambda: NOW, **kw))
        return [json.loads(l) for l in text.splitlines()], slept, rest

    def test_waits_through_empty_rounds_and_prints_nothing_meanwhile(self):
        lines, slept, _ = self.run_wait([[], [], [queued(5, "flight_prices", 0)]], every=30)
        self.assertEqual(lines, [{"id": 5, "type": "flight_prices", "title": "t5"}])
        self.assertEqual(slept, [30, 30])

    def test_skips_cloud_tasks_inside_the_grace(self):
        cloud = queued(6, "question", 5)
        lines, slept, _ = self.run_wait([[cloud], [cloud, queued(7, "stay_details", 1, lodging_id="L1")]])
        self.assertEqual([l["id"] for l in lines], [7])
        self.assertEqual(len(slept), 1)

    def test_a_cloud_task_past_the_grace_is_returned(self):
        lines, _, _ = self.run_wait([[queued(8, "question", 20)]], grace=15)
        self.assertEqual([l["id"] for l in lines], [8])

    def test_a_refresh_of_flights_is_for_the_pc_but_experiences_run_in_the_cloud(self):
        pc = queued(9, "refresh", 0, scope="flights")
        cloud = queued(10, "refresh", 0, scope="experiences")
        lines, _, _ = self.run_wait([[cloud, pc]])
        self.assertEqual([l["id"] for l in lines], [9])

    def test_survives_a_network_error(self):
        lines, slept, _ = self.run_wait([OSError("down"), [queued(11, "booking", 0, leg={})]])
        self.assertEqual([l["id"] for l in lines], [11])
        self.assertEqual(len(slept), 1)

    def test_gives_up_with_one_error_line_after_ten_failed_rounds(self):
        rest, slept = WaitRest([OSError("down")] * tasks.GIVE_UP), []
        buf = io.StringIO()
        with contextlib.redirect_stdout(buf), self.assertRaises(SystemExit) as e:
            tasks.cmd_wait(rest, sleep=slept.append, now=lambda: NOW)
        self.assertEqual(e.exception.code, 1)
        self.assertIn("error", json.loads(buf.getvalue()))
        self.assertEqual(len(slept), tasks.GIVE_UP - 1)


if __name__ == "__main__":
    unittest.main()
