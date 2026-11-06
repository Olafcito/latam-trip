"""Live tests of the database functions. They need TRIPDB_LIVE_TESTS=1 and the keys of a stack to run on.
They empty the database first, so they skip on a project without test_reset, which the real one dropped at cutover.
They run on the local stack: bash supabase/local_up.sh writes an env file outside the repo, and TRIPDB_ENV_FILE names it.
The values of that file win over the environment, and .env is not read then.
Run: TRIPDB_LIVE_TESTS=1 TRIPDB_ENV_FILE=<file> python -I -X utf8 -m unittest discover -s plugin/scripts -p "test_db_functions.py"
"""
import hashlib, json, os, re, threading, unittest, urllib.error, urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".."))
LIVE = os.environ.get("TRIPDB_LIVE_TESTS") == "1"


def read_env_file(path):
    out = {}
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            m = re.match(r"\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$", line)
            if m:
                out[m.group(1)] = m.group(2).strip("'\"")
    return out


def load_env():
    env = dict(os.environ)
    named = env.get("TRIPDB_ENV_FILE")
    if named:
        env.update(read_env_file(named))
        return env
    path = os.path.join(ROOT, ".env")
    if os.path.exists(path):
        for k, v in read_env_file(path).items():
            env.setdefault(k, v)
    return env


def call(env, method, path, body=None, key="SUPABASE_SECRET_KEY"):
    """(status, parsed body). key None sends no apikey at all."""
    headers = {"Content-Type": "application/json"}
    if key:
        headers["apikey"] = env[key]
    req = urllib.request.Request(env["SUPABASE_URL"].rstrip("/") + "/rest/v1/" + path, method=method, headers=headers,
                                 data=None if body is None else json.dumps(body).encode())
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            text = r.read().decode()
            return r.status, (json.loads(text) if text else None)
    except urllib.error.HTTPError as e:
        text = e.read().decode()
        e.close()
        try:
            return e.code, json.loads(text)
        except ValueError:
            return e.code, text


def reset(test):
    """Empty the project, or skip: the real project dropped test_reset at cutover, so these tests need a throwaway one."""
    code, body = call(test.env, "POST", "rpc/test_reset", {})
    if code == 404:
        test.skipTest("the project has no test_reset, so it is the real one. Point .env at a throwaway project to run these")
    test.assertIn(code, (200, 204), body)
    # a secret key write without owner_id lands on the one admin (0027), so the stack needs one
    import sys
    sys.path.insert(0, os.path.join(ROOT, "supabase", "tests"))
    import users
    users.admin(test.env)


def quote_row(qid, **over):
    row = {"quote_id": qid, "build_qid": "Q:" + qid[-6:], "agent": "t", "source": "momondo", "structure": "one_way",
           "first_seen": "2026-10-20T10:00:00Z", "last_seen": "2026-10-20T10:00:00Z",
           "first_from": "CPH", "first_to": "SJO", "last_from": "CPH", "last_to": "SJO",
           "first_date": "2026-12-03", "last_date": "2026-12-03", "price": 5200, "currency": "DKK", "price_dkk": 5200,
           "usable": 1, "flags": [], "legs_requested": [{"from": "CPH", "to": "SJO", "date": "2026-12-03"}],
           "out_leg": {"dep": "2026-12-03T06:00"}}
    row.update(over)
    return row


@unittest.skipUnless(LIVE, "set TRIPDB_LIVE_TESTS=1 to run against the project")
class AddQuotesTest(unittest.TestCase):
    def setUp(self):
        self.env = load_env()
        reset(self)

    def add(self, rows, key="SUPABASE_SECRET_KEY"):
        return call(self.env, "POST", "rpc/add_quotes", {"rows": rows}, key)

    def stored(self, qid):
        code, rows = call(self.env, "GET", f"quotes?quote_id=eq.{qid}&select=quote_id,seen_count,first_seen,last_seen,price_dkk")
        self.assertEqual(code, 200, rows)
        return rows

    def test_same_batch_twice(self):
        batch = [quote_row("Q2:a1")]
        self.assertEqual(self.add(batch), (200, {"added": 1, "seen_again": 0}))
        self.assertEqual(self.add(batch), (200, {"added": 0, "seen_again": 1}))
        rows = self.stored("Q2:a1")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["seen_count"], 2)

    def test_batch_repeats_a_quote(self):
        batch = [quote_row("Q2:b1", last_seen="2026-10-20T10:00:00Z", price_dkk=111),
                 quote_row("Q2:b1", last_seen="2026-10-22T10:00:00Z", price_dkk=222),
                 quote_row("Q2:b1", last_seen="2026-10-21T10:00:00Z", price_dkk=333)]
        self.assertEqual(self.add(batch), (200, {"added": 1, "seen_again": 0}))
        rows = self.stored("Q2:b1")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["seen_count"], 3)
        self.assertTrue(rows[0]["last_seen"].startswith("2026-10-22T10:00:00"))
        self.assertEqual(float(rows[0]["price_dkk"]), 222)

    def test_older_sighting_does_not_move_last_seen_back(self):
        self.add([quote_row("Q2:c1", last_seen="2026-10-25T10:00:00Z")])
        self.add([quote_row("Q2:c1", last_seen="2026-10-21T10:00:00Z")])
        rows = self.stored("Q2:c1")
        self.assertTrue(rows[0]["last_seen"].startswith("2026-10-25T10:00:00"))
        self.assertEqual(rows[0]["seen_count"], 2)

    def test_new_airport_makes_a_stub(self):
        self.assertEqual(self.add([quote_row("Q2:d1", first_to="ZZZ", last_to="ZZZ")])[0], 200)
        code, rows = call(self.env, "GET", "airports?code=eq.ZZZ&select=code,name")
        self.assertEqual((code, rows), (200, [{"code": "ZZZ", "name": None}]))

    def test_two_writers_at_once(self):
        results = []

        def writer():
            results.append(self.add([quote_row("Q2:e1")]))
        threads = [threading.Thread(target=writer) for _ in range(2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertTrue(all(code == 200 for code, _ in results), results)
        rows = self.stored("Q2:e1")
        self.assertEqual(len(rows), 1)
        self.assertEqual(rows[0]["seen_count"], 2)

    def test_publishable_key_cannot_call_add_quotes(self):
        code, _ = self.add([quote_row("Q2:f1")], key="SUPABASE_PUBLISHABLE_KEY")
        self.assertIn(code, (401, 403))
        self.assertEqual(self.stored("Q2:f1"), [])

    def test_no_key_reads_nothing(self):
        self.add([quote_row("Q2:g1")])
        for key in (None, "SUPABASE_PUBLISHABLE_KEY"):
            for table in ("quotes", "trips", "documents", "inbox_tokens", "admins", "tasks"):
                code, body = call(self.env, "GET", table + "?select=*", key=key)
                self.assertTrue(code in (401, 403) or body == [], (key, table, code, body))
        code, _ = call(self.env, "POST", "quotes", [quote_row("Q2:g2")], key="SUPABASE_PUBLISHABLE_KEY")
        self.assertIn(code, (401, 403))
        self.assertEqual(self.stored("Q2:g2"), [])


@unittest.skipUnless(LIVE, "set TRIPDB_LIVE_TESTS=1 to run against the project")
class SaveTripTest(unittest.TestCase):
    def setUp(self):
        self.env = load_env()
        reset(self)

    def save(self, trip, key="SUPABASE_SECRET_KEY"):
        return call(self.env, "POST", "rpc/save_trip", {"trip": trip}, key)

    def test_save_trip_two_at_once(self):
        results = []

        def writer(n):
            results.append(self.save({"id": "t9", "name": "x", "why": str(n), "by": "t"}))
        threads = [threading.Thread(target=writer, args=(n,)) for n in (1, 2)]
        for t in threads:
            t.start()
        for t in threads:
            t.join()
        self.assertTrue(all(code == 200 for code, _ in results), results)
        self.assertEqual(sorted(b["version"] for _, b in results), [1, 2])
        code, rows = call(self.env, "GET", "trips?id=eq.t9&select=version,saved_by,data&order=version")
        self.assertEqual([r["version"] for r in rows], [1, 2])
        self.assertEqual([r["data"]["version"] for r in rows], [1, 2])
        self.assertEqual(rows[0]["saved_by"], "t")

    def test_same_content_skipped(self):
        self.save({"id": "t8", "name": "x", "by": "a", "version": 1, "saved_at": "2026-10-20T10:00:00Z"})
        code, body = self.save({"id": "t8", "name": "x", "by": "b", "version": 7, "saved_at": "2026-11-01T10:00:00Z"})
        self.assertEqual((code, body["version"], body["skipped"]), (200, 1, True))
        code, body = self.save({"id": "t8", "name": "y"})
        self.assertEqual((body["version"], body["skipped"]), (2, False))

    def test_soft_delete_hides_every_version(self):
        self.save({"id": "t7", "name": "x"})
        self.save({"id": "t7", "name": "y"})
        code, _ = call(self.env, "PATCH", "trips?id=eq.t7&version=eq.2", {"deleted_at": "2026-11-01T10:00:00Z"})
        self.assertIn(code, (200, 204))
        code, rows = call(self.env, "GET", "trips_latest?id=eq.t7&select=id")
        self.assertEqual((code, rows), (200, []))
        code, body = self.save({"id": "t7", "name": "z"})
        self.assertEqual(code, 400, body)

    def test_publishable_key_cannot_call_save_trip(self):
        code, _ = self.save({"id": "t6", "name": "x"}, key="SUPABASE_PUBLISHABLE_KEY")
        self.assertIn(code, (401, 403))
        code, rows = call(self.env, "GET", "trips?id=eq.t6&select=id")
        self.assertEqual(rows, [])


@unittest.skipUnless(LIVE, "set TRIPDB_LIVE_TESTS=1 to run against the project")
class DirtyTriggerTest(unittest.TestCase):
    """Spec 7.2 step 1: a write to a table the pipeline reads moves derive_state.dirty_at."""
    WRITES = {
        "quotes": lambda: ("rpc/add_quotes", {"rows": [quote_row("Q3:t1")]}),
        "places": lambda: ("places", {"id": "ZT1", "name": "Test", "country": "CR", "type": "city"}),
        "task_log": lambda: ("task_log", {"issue": 1, "type": "t", "summary": "x"}),
        "inbox": lambda: ("inbox", {"file": "t.jsonl", "rows": []}),
    }

    def setUp(self):
        self.env = load_env()
        reset(self)

    def state(self):
        code, rows = call(self.env, "GET", "derive_state?select=dirty_at,dirty_since&id=eq.1")
        self.assertEqual(code, 200, rows)
        return rows[0]

    def put(self, path, body):
        code, out = call(self.env, "POST", path, body)
        self.assertIn(code, (200, 201, 204), out)

    def test_each_table_sets_dirty(self):
        for table in ("quotes", "places", "task_log", "inbox"):
            call(self.env, "POST", "rpc/test_reset", {})
            self.assertIsNone(self.state()["dirty_at"])
            path, body = self.WRITES[table]()
            self.put(path, body)
            st = self.state()
            self.assertIsNotNone(st["dirty_at"], table)
            self.assertIsNotNone(st["dirty_since"], table)

    def test_documents_set_dirty(self):
        self.put("documents", {"name": "lists.json", "data": {"lists": []}})
        self.assertIsNotNone(self.state()["dirty_at"])

    def test_dirty_since_set_only_when_empty(self):
        self.put("documents", {"name": "lists.json", "data": {"lists": []}})
        first = self.state()
        self.put("documents", {"name": "bag_rules.json", "data": {}})
        second = self.state()
        self.assertEqual(second["dirty_since"], first["dirty_since"])
        self.assertGreater(second["dirty_at"], first["dirty_at"])

    def test_web_trips_doc_is_ignored(self):
        for name in ("web_trips", "way_id_map", "unresolved_journeys"):
            self.put("documents", {"name": name, "data": {}})
            self.assertIsNone(self.state()["dirty_at"], name)
            code, _ = call(self.env, "PATCH", f"documents?name=eq.{name}", {"data": {"a": 1}})
            self.assertIn(code, (200, 204))
            self.assertIsNone(self.state()["dirty_at"], name)
            code, _ = call(self.env, "DELETE", f"documents?name=eq.{name}")
            self.assertIn(code, (200, 204))
            self.assertIsNone(self.state()["dirty_at"], name)

    def test_trips_and_tasks_do_not_set_dirty(self):
        code, body = call(self.env, "POST", "rpc/save_trip", {"trip": {"id": "tt1", "name": "x", "by": "t"}})
        self.assertEqual(code, 200, body)
        self.put("tasks", {"type": "t", "status": "open", "title": "x"})
        self.assertIsNone(self.state()["dirty_at"])


@unittest.skipUnless(LIVE, "set TRIPDB_LIVE_TESTS=1 to run against the project")
class UserscriptTest(unittest.TestCase):
    """Spec 8.2: submit_inbox and submit_task check a token and are the only way in for the publishable key."""
    TOKEN = "mmk_test_token_for_the_suite"

    def setUp(self):
        self.env = load_env()
        reset(self)
        h = hashlib.sha256(self.TOKEN.encode("utf-8")).hexdigest()
        code, body = call(self.env, "POST", "inbox_tokens?on_conflict=name", [{"name": "suite", "token_hash": h}])
        self.assertIn(code, (200, 201, 204), body)

    def tearDown(self):
        call(self.env, "DELETE", "inbox_tokens?name=eq.suite")

    def rows(self, table):
        code, body = call(self.env, "GET", table + "?select=*")
        self.assertEqual(code, 200, body)
        return body

    def inbox(self, token, rows=None, key="SUPABASE_PUBLISHABLE_KEY"):
        return call(self.env, "POST", "rpc/submit_inbox", {"token": token, "file": "manual-1.jsonl", "rows": [{"a": 1}, {"a": 2}] if rows is None else rows}, key)

    def task(self, token, task=None, key="SUPABASE_PUBLISHABLE_KEY"):
        return call(self.env, "POST", "rpc/submit_task", {"token": token, "task": task or {"type": "fix_parser", "title": "[fix_parser] x"}}, key)

    def test_wrong_token_writes_nothing(self):
        for token in ("nope", "", self.TOKEN + "x"):
            code, _ = self.inbox(token)
            self.assertGreaterEqual(code, 400)
            code, _ = self.task(token)
            self.assertGreaterEqual(code, 400)
        self.assertEqual(self.rows("inbox"), [])
        self.assertEqual(self.rows("tasks"), [])

    def test_right_token_inserts_new(self):
        self.assertEqual(self.inbox(self.TOKEN), (200, 2))
        rows = self.rows("inbox")
        self.assertEqual(len(rows), 1)
        self.assertEqual((rows[0]["status"], rows[0]["file"], rows[0]["rows"]), ("new", "manual-1.jsonl", [{"a": 1}, {"a": 2}]))
        code, tid = self.task(self.TOKEN)
        self.assertEqual(code, 200)
        self.assertGreaterEqual(tid, 10000)
        t = self.rows("tasks")
        self.assertEqual((t[0]["type"], t[0]["status"], t[0]["title"]), ("fix_parser", "open", "[fix_parser] x"))

    def test_empty_rows_check_the_token_and_write_nothing(self):
        self.assertEqual(self.inbox(self.TOKEN, []), (200, 0))
        self.assertEqual(self.rows("inbox"), [])
        self.assertGreaterEqual(self.inbox("wrong", [])[0], 400)

    def test_a_userscript_task_has_one_of_two_types(self):
        code, _ = self.task(self.TOKEN, {"type": "flight_prices"})
        self.assertGreaterEqual(code, 400)
        self.assertEqual(self.rows("tasks"), [])

    def test_publishable_key_signed_out_reaches_no_table(self):
        self.inbox(self.TOKEN)
        for table in ("inbox", "tasks", "inbox_tokens", "quotes", "trips", "documents", "admins"):
            code, body = call(self.env, "GET", table + "?select=*", key="SUPABASE_PUBLISHABLE_KEY")
            self.assertTrue(code in (401, 403) or body == [], (table, code, body))
        for table, row in (("inbox", {"file": "x"}), ("tasks", {"type": "question"}), ("inbox_tokens", {"name": "z", "token_hash": "z"})):
            code, _ = call(self.env, "POST", table, [row], key="SUPABASE_PUBLISHABLE_KEY")
            self.assertIn(code, (401, 403))
        self.assertEqual(len(self.rows("inbox")), 1)
        self.assertEqual(self.rows("tasks"), [])

    def test_inbox_tokens_is_unreadable(self):
        code, body = call(self.env, "GET", "inbox_tokens?select=*", key="SUPABASE_PUBLISHABLE_KEY")
        self.assertTrue(code in (401, 403) or body == [], (code, body))
        code, body = call(self.env, "GET", "rpc/submit_inbox", key="SUPABASE_PUBLISHABLE_KEY")
        self.assertNotEqual(code, 200)


if __name__ == "__main__":
    unittest.main()
