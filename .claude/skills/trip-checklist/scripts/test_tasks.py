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


if __name__ == "__main__":
    unittest.main()
