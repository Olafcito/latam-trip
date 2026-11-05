"""Tests for the task runner's tools in runner.py. Run from the repo root:
python -I -X utf8 -m unittest discover -s latam_trip_mcp -p "test_*.py"
The tasks live in an in-memory table and everything else in the file store of a temporary root."""
import json, os, re, sys, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, ".."))
for p in (REPO, os.path.join(REPO, "plugin", "scripts")):
    if p not in sys.path:
        sys.path.insert(0, p)

from tripdb_store import Refused  # noqa: E402
from latam_trip_mcp import runner  # noqa: E402
from latam_trip_mcp.test_core import Base, LodgingRest, lodging  # noqa: E402


class TaskRest(LodgingRest):
    TABLES = LodgingRest.TABLES + ("tasks",)

    def patch(self, table, params, body, returning=None):
        hit = [r for r in self.tables[table] if self.picked(r, params)]
        for r in hit:
            r.update(json.loads(json.dumps(body)))
        return [{"id": r["id"]} for r in hit] if returning else None


class RunnerTest(Base):
    def setUp(self):
        super().setUp()
        self.rest = TaskRest()
        self.store.kind, self.store.rest = "supabase", self.rest

    def task(self, data, status="open", id=None):
        id = id or 10000 + len(self.rest.tables["tasks"])
        self.rest.tables["tasks"].append({"id": id, "type": None, "status": status, "title": f"[{data.get('type')}]",
                                          "data": data, "result": None, "done_at": None})
        return id

    def row(self, id):
        return next(r for r in self.rest.tables["tasks"] if r["id"] == id)

    def test_claim_takes_the_oldest_cloud_task_and_leaves_the_rest(self):
        self.task({"type": "flight_prices", "legs": []})
        self.task({"type": "refresh", "scope": "flights"})
        q = self.task({"type": "question", "text": "Is Tayrona open in December"})
        self.task({"type": "question", "text": "And in January"})
        out = self.core.call("claim_task")
        self.assertEqual(out["task"]["id"], q)
        self.assertEqual(self.row(q)["status"], "working")
        self.assertEqual(out["contract"]["tools"], runner.CONTRACTS["question"].tools)
        self.assertIn("never", out["contract"])
        self.core.call("claim_task")
        self.assertEqual(self.core.call("claim_task"), {"task": None, "left_for_simon": 2})

    def test_a_task_with_wrong_fields_is_failed_with_the_reason(self):
        bad = self.task({"type": "stay_prices", "lodging_id": "x"})
        self.assertIsNone(self.core.call("claim_task")["task"])
        self.assertEqual(self.row(bad)["status"], "failed")
        self.assertIn("missing room_ids", self.row(bad)["result"])

    def test_a_stay_task_gets_its_lodging_and_refuses_rooms_of_another(self):
        self.core.add("lodging", [lodging()])
        lid = self.rest.tables["lodgings"][0]["id"]
        rooms = [r["id"] for r in self.rest.tables["lodging_rooms"]]
        good = self.task({"type": "stay_prices", "lodging_id": lid, "room_ids": rooms[:1], "check_in": "2026-12-10", "check_out": "2026-12-14"})
        bad = self.task({"type": "stay_prices", "lodging_id": lid, "room_ids": ["nope"], "check_in": "2026-12-10", "check_out": "2026-12-14"})
        out = self.core.call("claim_task")
        self.assertEqual(out["task"]["id"], good)
        self.assertEqual([r["id"] for r in out["contract"]["lodging"]["rooms"]], rooms[:1])
        self.assertIsNone(self.core.call("claim_task")["task"])
        self.assertEqual(self.row(bad)["status"], "failed")

    def test_a_task_taken_by_another_run_is_skipped(self):
        a = self.task({"type": "question", "text": "a"})
        b = self.task({"type": "question", "text": "b"})
        real = self.rest.patch

        def race(table, params, body, returning=None):
            if params.get("id") == f"eq.{a}":
                self.row(a)["status"] = "working"  # the other run got there first
            return real(table, params, body, returning)
        self.rest.patch = race
        self.assertEqual(self.core.call("claim_task")["task"]["id"], b)

    def test_finish_closes_only_a_claimed_task_and_logs_it(self):
        q = self.task({"type": "question", "text": "a"})
        with self.assertRaises(Refused):
            self.core.call("finish_task", {"id": q, "result": "Yes"})
        self.core.call("claim_task")
        with self.assertRaisesRegex(Refused, "dash"):
            self.core.call("finish_task", {"id": q, "result": "Yes — open"})
        out = self.core.call("finish_task", {"id": q, "result": "# Open all year\nYes.", "outputs": []})
        self.assertEqual(out, {"done": q, "logged": True})
        self.assertEqual((self.row(q)["status"], self.row(q)["result"]), ("done", "# Open all year\nYes."))
        log = self.store.rows("task_log")
        self.assertEqual((log[-1]["issue"], log[-1]["summary"]), (q, "Open all year"))
        with self.assertRaises(Refused):
            self.core.call("finish_task", {"id": q, "result": "again"})

    def test_fail_closes_a_claimed_task_with_the_reason(self):
        q = self.task({"type": "question", "text": "a"})
        self.core.call("claim_task")
        self.assertEqual(self.core.call("fail_task", {"id": q, "reason": "The web was down."}), {"failed": q})
        self.assertEqual(self.row(q)["status"], "failed")

    def test_list_tools_change_the_lists_document(self):
        self.core.call("list_add", {"list": "beach", "type": "place", "id": "NOSA", "name": "Beaches"})
        with self.assertRaises(Refused):
            self.core.call("list_add", {"list": "beach", "type": "place", "id": "NOWHERE"})
        self.core.call("list_add", {"list": "beach", "type": "place", "id": "TAM"})
        self.core.call("list_remove", {"list": "beach", "type": "place", "id": "NOSA"})
        doc, _ = self.store.doc("lists.json")
        self.assertEqual([i["id"] for i in doc["lists"][0]["items"]], ["TAM"])

    def test_every_contract_names_its_tools_and_needs_fields(self):
        for typ, c in runner.CONTRACTS.items():
            self.assertTrue(c.tools and c.steps and c.writes, typ)
            for line in c.steps + c.tools + [c.does, c.writes]:
                self.assertFalse(any(d in line for d in runner.DASHES), (typ, line))


class SameListTest(unittest.TestCase):
    def test_the_trigger_and_the_runner_name_the_same_cloud_types(self):
        with open(os.path.join(REPO, "supabase", "migrations", "0018_task_runner_contract.sql"), encoding="utf-8") as fh:
            sql = fh.read()
        listed = re.search(r"in \(([^)]*)\)", sql.split("task_runs_in_cloud(t text, d jsonb)")[1]).group(1)
        self.assertEqual(sorted(re.findall(r"'(\w+)'", listed)), sorted(runner.CLOUD))

    def test_the_skill_and_the_doc_name_every_cloud_type(self):
        for path in (("plugin", "skills", "task-runner", "SKILL.md"), ("docs", "task-runner.md")):
            with open(os.path.join(REPO, *path), encoding="utf-8") as fh:
                text = fh.read()
            self.assertEqual([t for t in runner.CLOUD if f"`{t}`" not in text], [], path)


if __name__ == "__main__":
    unittest.main()
