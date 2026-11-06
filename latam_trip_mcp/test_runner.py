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

    def task(self, data, status="open", id=None, owner="OWNER1"):
        id = id or 10000 + len(self.rest.tables["tasks"])
        self.rest.tables["tasks"].append({"id": id, "owner_id": owner, "type": None, "status": status, "created_at": "2026-11-01T09:00:00Z", "title": f"[{data.get('type')}]",
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

    def test_claim_gives_only_callers_tasks(self):
        theirs = self.task({"type": "question", "text": "B asks"}, owner="OWNER2")
        stale = self.task({"type": "question", "text": "B stale"}, status="working", owner="OWNER2")
        self.row(stale)["claimed_at"] = "2026-01-01T10:00:00+00:00"
        self.assertEqual(self.core.call("claim_task"), {"task": None, "left_for_simon": 0})
        mine = self.task({"type": "question", "text": "A asks"})
        self.assertEqual(self.core.call("claim_task")["task"]["id"], mine)
        self.assertEqual((self.row(theirs)["status"], self.row(stale)["status"]), ("open", "working"))
        self.assertEqual(self.row(stale)["claimed_at"], "2026-01-01T10:00:00+00:00")
        for tool, args in (("finish_task", {"id": theirs, "result": "x"}), ("fail_task", {"id": theirs, "reason": "x"})):
            with self.assertRaises(Refused):
                self.core.call(tool, args)
        self.assertEqual(self.row(theirs)["status"], "open")

    def test_a_task_with_wrong_fields_is_failed_with_the_reason(self):
        bad = self.task({"type": "stay_prices", "lodging_id": "x"})
        self.assertIsNone(self.core.call("claim_task")["task"])
        self.assertEqual(self.row(bad)["status"], "failed")
        self.assertIn("room_ids", self.row(bad)["result"])
        self.assertNotIn(";", self.row(bad)["result"])

    def test_a_task_whose_fields_have_the_wrong_shape_does_not_block_the_next(self):
        bad = self.task({"type": "lists_update", "list": "beach", "add": 5})
        worse = self.task({"type": "stay_prices", "lodging_id": "x", "room_ids": 3, "check_in": "2026-12-10", "check_out": "2026-12-14"})
        q = self.task({"type": "question", "text": "a"})
        self.assertEqual(self.core.call("claim_task")["task"]["id"], q)
        self.assertEqual((self.row(bad)["status"], self.row(worse)["status"]), ("failed", "failed"))

    def test_a_task_a_run_left_in_working_is_opened_again_after_three_hours(self):
        old = self.task({"type": "question", "text": "a"}, status="working")
        self.row(old)["claimed_at"] = "2026-01-01T10:00:00+00:00"
        mine = self.task({"type": "question", "text": "b"}, status="working")  # Simon's own run, never claimed
        self.assertEqual(self.core.call("claim_task")["task"]["id"], old)
        self.assertEqual(self.row(mine)["status"], "working")
        self.assertEqual(self.core.call("claim_task"), {"task": None, "left_for_simon": 0})

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

    def stay_search(self, **extra):
        return self.task({"type": "stay_search", "place_id": "TAM", "check_in": "2026-12-10", "check_out": "2026-12-14",
                          "top": 3, **extra})

    def test_a_stay_search_gets_the_place_and_the_lodgings_stored_there(self):
        self.core.add("lodging", [lodging()])
        self.rest.tables["lodgings"][0]["hidden"] = True
        t = self.stay_search()
        out = self.core.call("claim_task")
        self.assertEqual(out["task"]["id"], t)
        self.assertEqual(out["contract"]["place"]["id"], "TAM")
        self.assertEqual(out["contract"]["place"]["name"], "Tamarindo")
        self.assertEqual([(l["name"], l["hidden"]) for l in out["contract"]["stored"]], [("Test Hostel", True)])
        self.assertIn("add_lodging", " ".join(out["contract"]["tools"]))

    def test_a_stay_search_with_bad_dates_or_top_is_failed(self):
        bad = [self.stay_search(check_out="2026-12-10"), self.stay_search(check_out="2027-02-10"),
               self.stay_search(top=0), self.stay_search(top=6), self.stay_search(check_in="soon")]
        ok = self.stay_search(top=None)
        self.assertEqual(self.core.call("claim_task")["task"]["id"], ok)
        self.assertEqual([self.row(i)["status"] for i in bad], ["failed"] * 5)

    def stay_picks(self, **extra):
        return self.task({"type": "stay_picks", "place_id": "TAM", "check_in": "2026-12-10", "check_out": "2026-12-14", **extra})

    def test_stay_picks_gets_the_place_with_its_lat_and_lon(self):
        t = self.stay_picks()
        out = self.core.call("claim_task")
        self.assertEqual(out["task"]["id"], t)
        self.assertEqual((out["contract"]["place"]["lat"], out["contract"]["place"]["lon"]), (10.3, -85.84))
        self.assertIn("(rating - 7) / total_dkk", " ".join(out["contract"]["steps"]))

    def picks(self, *rows):
        out = self.core.add("lodging", [lodging(name=f"Pick {n}", links=[{"site": "booking", "url": f"https://example.com/b{n}"}], **r)
                                        for n, r in enumerate(rows)])
        return out["added"]

    def test_finish_of_stay_picks_refuses_a_place_it_did_not_add(self):
        ours = self.picks(dict(kind="hotel", rating=9.2, reviews=300))
        simons = self.core.add("lodging", [lodging(name="Simon's", added_by="simon", kind="guesthouse",
                                                   links=[{"site": "booking", "url": "https://example.com/s"}])])["added"]
        older = self.core.add("lodging", [lodging(name="Older", kind="guesthouse",
                                                  links=[{"site": "booking", "url": "https://example.com/o"}])])["added"]
        for r in self.rest.tables["lodgings"]:
            if r["id"] in older:
                r["created_at"] = "2026-10-01T10:00:00Z"
        t = self.stay_picks()
        self.core.call("claim_task")
        for bad in (simons, older):
            with self.assertRaises(Exception) as e:
                self.core.call("finish_task", {"id": t, "result": "Picks.", "outputs": ours + bad})
            self.assertIn("not Booking.com places this task added", str(e.exception))
        self.assertFalse(any(r.get("hidden") for r in self.rest.tables["lodgings"]))

    def test_finish_of_stay_picks_hides_what_the_rule_would_not_pick(self):
        ids = self.picks(dict(kind="hotel", rating=9.2, reviews=300), dict(kind="guesthouse", rating=9.0, reviews=200),
                         dict(kind="hotel", rating=7.6, reviews=900), dict(kind="apartment", rating=8.8, reviews=2),
                         dict(kind="hostel", rating=8.5, reviews=80))
        t = self.stay_picks()
        self.core.call("claim_task")
        out = self.core.call("finish_task", {"id": t, "result": "Three places.", "outputs": ids})
        hidden = {r["id"]: r.get("hidden") for r in self.rest.tables["lodgings"]}
        self.assertEqual(out["hidden"], ids[1:])
        self.assertEqual([bool(hidden[i]) for i in ids], [False, True, True, True, True])
        self.assertIn("kind guesthouse", self.row(t)["result"])
        self.assertIn("past the third", self.row(t)["result"])

    def test_finish_of_stay_picks_keeps_three_good_picks(self):
        ids = self.picks(dict(kind="hotel", rating=9.2, reviews=300), dict(kind="hostel", rating=8.4, reviews=60),
                         dict(kind="apartment", rating=8.9, reviews=25))
        t = self.stay_picks()
        self.core.call("claim_task")
        self.assertEqual(self.core.call("finish_task", {"id": t, "result": "Three places.", "outputs": ids}), {"done": t, "logged": True})

    def test_finish_of_stay_picks_refuses_outputs_that_are_not_lodgings_at_the_place(self):
        t = self.stay_picks()
        self.core.call("claim_task")
        with self.assertRaisesRegex(Refused, "not Booking.com places this task added at TAM"):
            self.core.call("finish_task", {"id": t, "result": "One place.", "outputs": ["nope"]})
        self.assertEqual(self.row(t)["status"], "working")

    def test_stay_picks_is_logged_without_its_note_or_outputs(self):
        ids = self.picks(dict(kind="hotel", rating=9.2, reviews=300))
        t = self.stay_picks(note="Three places in Tamarindo")
        self.core.call("claim_task")
        self.core.call("finish_task", {"id": t, "result": "Pick 0 at 1200 kroner.", "outputs": ids})
        log = self.store.rows("task_log")[-1]
        self.assertEqual((log["summary"], log["outputs"]), ("Picked", []))
        self.assertNotIn("note", log["task"])

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

    def test_finish_of_a_task_the_data_closed_keeps_its_result_and_logs(self):
        q = self.task({"type": "question", "text": "a"})
        self.core.call("claim_task")
        self.row(q).update(status="done", result="Closed by the data: 2 rooms priced for 2026-12-03 to 2026-12-06.")
        out = self.core.call("finish_task", {"id": q, "result": "Priced both rooms.", "outputs": []})
        self.assertEqual(out, {"done": q, "logged": True})
        self.assertEqual(self.row(q)["result"], "Closed by the data: 2 rooms priced for 2026-12-03 to 2026-12-06.")
        self.assertEqual(self.store.rows("task_log")[-1]["issue"], q)
        other = self.task({"type": "question", "text": "b"}, status="done")
        with self.assertRaises(Refused):
            self.core.call("finish_task", {"id": other, "result": "again"})

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
        mig = os.path.join(REPO, "supabase", "migrations")
        marker = "task_runs_in_cloud(t text, d jsonb)"
        newest = [f for f in sorted(os.listdir(mig)) if marker in open(os.path.join(mig, f), encoding="utf-8").read()][-1]
        with open(os.path.join(mig, newest), encoding="utf-8") as fh:
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
