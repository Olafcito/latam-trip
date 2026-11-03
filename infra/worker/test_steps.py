"""Tests of the worker steps. They need no network: a fake REST client stands in for the project.
Run: python -I -X utf8 -m unittest discover -s infra/worker -p "test_steps.py"
"""
import datetime as dt, hashlib, json, os, shutil, sys, tempfile, unittest
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, "..", ".."))
sys.path.insert(0, HERE)
import steps  # noqa: E402

UTC = dt.timezone.utc
NOW = dt.datetime(2026, 11, 1, 12, 0, 0, tzinfo=UTC)


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(text)


def ago(seconds):
    return (NOW - dt.timedelta(seconds=seconds)).isoformat()


class FakeRest:
    """Tables in memory. It understands the eq, in and is.null filters that steps.py sends, and a storage of bytes."""

    def __init__(self, **tables):
        self.tables = {k: [dict(r) for r in v] for k, v in tables.items()}
        self.files, self.made, self.deleted, self.puts = {}, {}, [], []

    def _match(self, row, params):
        for col, cond in (params or {}).items():
            if col in ("select", "order"):
                continue
            if cond == "is.null":
                ok = row.get(col) is None
            elif cond.startswith("eq."):
                ok = str(row.get(col)) == cond[3:]
            elif cond.startswith("in.("):
                ok = str(row.get(col)) in [x.strip('"') for x in cond[4:-1].split(",")]
            else:
                raise AssertionError(f"filter {cond}")
            if not ok:
                return False
        return True

    def get_all(self, table, params=None):
        return [dict(r) for r in self.tables.get(table, []) if self._match(r, params)]

    def insert(self, table, rows, on_conflict=None, returning=None, resolution=None):
        out = []
        for r in rows:
            held = self.tables.setdefault(table, [])
            if on_conflict and any(x.get(on_conflict) == r.get(on_conflict) for x in held):
                if resolution == "merge-duplicates":
                    for x in held:
                        if x.get(on_conflict) == r.get(on_conflict):
                            x.update(r)
                continue
            held.append(dict(r))
            out.append(dict(r))
        return out if returning else []

    def patch(self, table, params, body, returning=None):
        hit = [r for r in self.tables.get(table, []) if self._match(r, params)]
        for r in hit:
            r.update(body)
        return [dict(r) for r in hit] if returning else None

    def delete(self, table, params):
        self.tables[table] = [r for r in self.tables.get(table, []) if not self._match(r, params)]

    def storage_get(self, bucket, path):
        if path not in self.files:
            raise steps.RestError("404")
        return self.files[path]

    def storage_put(self, bucket, path, data, content_type="application/json", upsert=True, cache_control=None):
        self.files[path] = data if isinstance(data, bytes) else data.encode()
        self.made.setdefault(path, NOW)
        self.puts.append(path)

    def storage_list(self, bucket, prefix):
        return [{"name": p.split("/", 1)[1], "created_at": self.made[p].isoformat()} for p in self.files
                if p.startswith(prefix + "/")]

    def storage_delete(self, bucket, paths):
        for p in paths:
            self.files.pop(p, None)
            self.deleted.append(p)


def state(**over):
    base = {"dirty_at": ago(120), "dirty_since": ago(120), "built_dirty_at": None, "failed_dirty_at": None,
            "last_started": None, "last_finished": None, "last_error": None, "last_warning": None}
    base.update(over)
    return base


class ShouldBuildTest(unittest.TestCase):
    def test_stops_when_clean(self):
        self.assertFalse(steps.should_build(state(built_dirty_at=ago(120)), NOW))
        self.assertFalse(steps.should_build(state(dirty_at=None), NOW))

    def test_stops_on_failed_dirty_at(self):
        self.assertFalse(steps.should_build(state(failed_dirty_at=ago(120)), NOW))
        self.assertTrue(steps.should_build(state(failed_dirty_at=ago(500)), NOW))

    def test_waits_for_a_quiet_minute(self):
        self.assertFalse(steps.should_build(state(dirty_at=ago(30), dirty_since=ago(100)), NOW))
        self.assertTrue(steps.should_build(state(dirty_at=ago(61), dirty_since=ago(100)), NOW))

    def test_builds_after_five_minutes_of_burst(self):
        self.assertFalse(steps.should_build(state(dirty_at=ago(5), dirty_since=ago(299)), NOW))
        self.assertTrue(steps.should_build(state(dirty_at=ago(5), dirty_since=ago(301)), NOW))

    def test_five_minute_gap(self):
        self.assertFalse(steps.should_build(state(last_started=ago(299)), NOW))
        self.assertTrue(steps.should_build(state(last_started=ago(300)), NOW))

    def test_a_newer_write_than_the_last_build_counts(self):
        self.assertTrue(steps.should_build(state(built_dirty_at=ago(500)), NOW))


class LeaseTest(unittest.TestCase):
    def test_a_missing_row_is_made_and_taken(self):
        rest = FakeRest()
        self.assertTrue(steps.take_lease(rest, "a", NOW))
        self.assertEqual(rest.tables["leases"][0]["holder"], "a")

    def test_lease_held_stops_the_run(self):
        rest = FakeRest(leases=[{"name": "build", "holder": "a", "expires_at": (NOW + dt.timedelta(seconds=100)).isoformat()}])
        self.assertFalse(steps.take_lease(rest, "b", NOW))
        self.assertEqual(rest.tables["leases"][0]["holder"], "a")

    def test_stale_lease_is_taken_after_600s(self):
        rest = FakeRest(leases=[{"name": "build", "holder": "a", "expires_at": (NOW - dt.timedelta(seconds=1)).isoformat()}])
        self.assertTrue(steps.take_lease(rest, "b", NOW))
        row = rest.tables["leases"][0]
        self.assertEqual(row["holder"], "b")
        self.assertEqual(steps._t(row["expires_at"]), NOW + dt.timedelta(seconds=600))

    def test_a_released_lease_is_free(self):
        rest = FakeRest(leases=[{"name": "build", "holder": None, "expires_at": None}])
        self.assertTrue(steps.take_lease(rest, "b", NOW))
        steps.release_lease(rest, "b")
        self.assertIsNone(rest.tables["leases"][0]["holder"])


class RunTest(unittest.TestCase):
    """run_build and run_once with the heavy steps replaced."""

    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.work = os.path.join(self.tmp, "work")
        self.addCleanup(shutil.rmtree, self.tmp, True)

    def start(self, pull=None, build=None, ingest=None):
        def default_pull(to_dir, rest=None, root=None):
            web = os.path.join(self.work, "data", "web")
            os.makedirs(web, exist_ok=True)
            write(os.path.join(web, "inout.json"), json.dumps({"options": []}))
        for p in [mock.patch.object(steps.tripdb, "cmd_ingest_inbox", ingest or (lambda *a, **k: 0)),
                  mock.patch.object(steps.store, "SupabaseStore", lambda p: None),
                  mock.patch.object(steps.tripdb, "cmd_pull", pull or default_pull),
                  mock.patch.object(steps, "refuse_empty_pull", lambda root: None),
                  mock.patch.object(steps, "build_pulled", build or (lambda root: [])),
                  mock.patch.object(steps, "upload", lambda rest, work, meta=None, now=None: {"files": {}, "uploaded": [], "manifest_hash": "m"})]:
            p.start()
            self.addCleanup(p.stop)

    def run_with(self, rest, **kw):
        self.start(**kw)
        return steps.run_build(rest, self.work, "abc123", NOW)

    def test_success_records_the_build(self):
        rest = FakeRest(derive_state=[{"id": 1, **state(last_error="old")}])
        out = self.run_with(rest)
        self.assertTrue(out["built"], out)
        st = rest.tables["derive_state"][0]
        self.assertEqual(st["built_dirty_at"], st["dirty_at"])
        self.assertIsNone(st["last_error"])
        self.assertIsNone(st["dirty_since"])
        self.assertEqual(st["worker_version"], "abc123")
        self.assertEqual(st["manifest_hash"], "m")
        self.assertIsNotNone(st["last_finished"])

    def test_bad_trip_writes_last_warning_and_carries_on(self):
        rest = FakeRest(derive_state=[{"id": 1, **state()}])
        out = self.run_with(rest, build=lambda root: ["t-bad"])
        self.assertTrue(out["built"])
        st = rest.tables["derive_state"][0]
        self.assertIn("t-bad", st["last_warning"])
        self.assertIsNone(st["last_error"])
        self.assertEqual(st["built_dirty_at"], st["dirty_at"])

    def test_other_refusal_fails_and_sets_failed_dirty_at(self):
        rest = FakeRest(derive_state=[{"id": 1, **state()}])

        def refuse(root):
            raise steps.Refused("check found 3 errors")
        out = self.run_with(rest, build=refuse)
        self.assertFalse(out["built"])
        st = rest.tables["derive_state"][0]
        self.assertIn("check found 3 errors", st["last_error"])
        self.assertEqual(st["failed_dirty_at"], st["dirty_at"])
        self.assertIsNone(st["built_dirty_at"])
        self.assertFalse(steps.should_build(st, NOW + dt.timedelta(hours=1)))

    def test_failure_before_pull_uses_the_first_dirty_at(self):
        rest = FakeRest(derive_state=[{"id": 1, **state()}])
        first = rest.tables["derive_state"][0]["dirty_at"]

        def ingest(*a, **k):
            rest.tables["derive_state"][0]["dirty_at"] = ago(1)   # the ingest's own writes moved it
            raise steps.Refused("inbox broke")
        out = self.run_with(rest, ingest=ingest)
        self.assertFalse(out["built"])
        st = rest.tables["derive_state"][0]
        self.assertEqual(st["failed_dirty_at"], first)
        self.assertNotEqual(st["failed_dirty_at"], st["dirty_at"])

    def test_moved_dirty_at_sets_dirty_since(self):
        fake = rest = FakeRest(derive_state=[{"id": 1, **state()}])

        def pull(to_dir, rest=None, root=None):
            web = os.path.join(self.work, "data", "web")
            os.makedirs(web, exist_ok=True)
            write(os.path.join(web, "inout.json"), json.dumps({"options": []}))
            fake.tables["derive_state"][0]["dirty_at"] = ago(0)   # a write came in during the run
        out = self.run_with(rest, pull=pull)
        self.assertTrue(out["built"], out)
        st = rest.tables["derive_state"][0]
        self.assertIsNotNone(st["dirty_since"])
        self.assertNotEqual(st["built_dirty_at"], st["dirty_at"])

    def test_work_dir_wiped_each_run(self):
        os.makedirs(self.work)
        stale = os.path.join(self.work, "left_over.txt")
        write(stale, "x")
        rest = FakeRest(derive_state=[{"id": 1, **state()}])
        self.run_with(rest)
        self.assertFalse(os.path.exists(stale))

    def test_timed_out_run_recovers(self):
        rest = FakeRest(derive_state=[{"id": 1, **state(last_started=ago(700))}],
                        leases=[{"name": "build", "holder": "dead", "expires_at": ago(100)}])
        self.start()
        out = steps.run_once(rest, self.work, "new", NOW, "v1")
        self.assertTrue(out["built"], out)
        self.assertIsNone(rest.tables["derive_state"][0]["last_error"])
        self.assertIsNone(rest.tables["leases"][0]["holder"])

    def test_a_run_that_timed_out_twice_stops_and_says_so(self):
        rest = FakeRest(derive_state=[{"id": 1, **state(last_started=ago(700), last_error=steps.TIMED_OUT)}],
                        leases=[{"name": "build", "holder": "dead", "expires_at": ago(100)}])
        out = steps.run_once(rest, self.work, "new", NOW, "v1")
        self.assertFalse(out["built"])
        st = rest.tables["derive_state"][0]
        self.assertEqual(st["failed_dirty_at"], st["dirty_at"])
        self.assertTrue(st["last_error"].startswith(steps.TIMED_OUT))

    def test_new_data_after_two_timeouts_builds_again(self):
        rest = FakeRest(derive_state=[{"id": 1, **state(last_started=ago(700), last_error=steps.TIMED_OUT)}],
                        leases=[{"name": "build", "holder": "dead", "expires_at": ago(100)}])
        self.assertFalse(steps.run_once(rest, self.work, "new", NOW, "v1")["built"])
        st = rest.tables["derive_state"][0]
        self.assertIsNotNone(st["last_finished"])
        st["dirty_at"] = ago(100)  # a write after the data that was given up on
        self.start()
        out = steps.run_once(rest, self.work, "new", NOW, "v1")
        self.assertTrue(out["built"], out)
        self.assertIsNone(rest.tables["derive_state"][0]["last_error"])

    def test_a_held_lease_runs_nothing(self):
        rest = FakeRest(derive_state=[{"id": 1, **state()}],
                        leases=[{"name": "build", "holder": "other", "expires_at": (NOW + dt.timedelta(seconds=300)).isoformat()}])
        out = steps.run_once(rest, self.work, "me", NOW)
        self.assertFalse(out["built"])
        self.assertEqual(rest.tables["leases"][0]["holder"], "other")


class DropBadTripsTest(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.root, True)
        os.makedirs(os.path.join(self.root, "data", "sources"))
        self.path = os.path.join(self.root, "data", "sources", "trips.jsonl")
        rows = [{"id": "a", "version": 1}, {"id": "b", "version": 1}, {"id": "b", "version": 2}, {"id": "c", "version": 1}]
        open(self.path, "w").write("".join(json.dumps(r) + "\n" for r in rows))

    def ids(self):
        with open(self.path) as fh:
            return [json.loads(l)["id"] for l in fh]

    def test_every_version_of_a_bad_trip_goes(self):
        out = steps.drop_bad_trips(["data/sources/trips.jsonl:3: places is empty"], self.root)
        self.assertEqual(out, ["b"])
        self.assertEqual(self.ids(), ["a", "c"])

    def test_a_versions_error_names_the_id(self):
        out = steps.drop_bad_trips(["data/sources/trips.jsonl a: versions [1, 3], expected 1 to 2 once each"], self.root)
        self.assertEqual(out, ["a"])

    def test_any_other_error_refuses_and_changes_nothing(self):
        with self.assertRaises(steps.Refused):
            steps.drop_bad_trips(["data/sources/trips.jsonl:3: places is empty", "data/sources/places.jsonl:9: lat missing"], self.root)
        self.assertEqual(self.ids(), ["a", "b", "b", "c"])

    @unittest.skipUnless(os.path.isdir(os.path.join(REPO, "data", "sources")), "needs data/sources")
    def test_real_sources_with_one_bad_trip(self):
        root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, root, True)
        shutil.copytree(os.path.join(REPO, "data", "sources"), os.path.join(root, "data", "sources"))
        trips = os.path.join(root, "data", "sources", "trips.jsonl")
        lines = open(trips, encoding="utf-8").read().splitlines()
        bad = json.loads(lines[0])
        bad["places"] = []
        lines[0] = json.dumps(bad)
        open(trips, "w", encoding="utf-8").write("".join(l + "\n" for l in lines))
        paths = steps.tripdb.Paths(root)
        errors, _ = steps.tripdb.run_check(paths, quiet=True, st=steps.store.FileStore(paths))
        self.assertTrue(errors)
        self.assertEqual(steps.drop_bad_trips(errors, root), [bad["id"]])
        errors, _ = steps.tripdb.run_check(paths, quiet=True, st=steps.store.FileStore(paths))
        self.assertEqual(errors, [])


# ---- upload and derived_options ------------------------------------------------------------------

class FilesTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.tmp, True)
        self.web = os.path.join(self.tmp, "data", "web")
        self.built = os.path.join(self.tmp, "data", "built")
        write(os.path.join(self.web, "places.json"), json.dumps({"generated_at": "t1", "places": [1]}))
        write(os.path.join(self.web, "inout.json"), json.dumps({"generated_at": "t1", "options": []}))
        write(os.path.join(self.web, "meta.json"), json.dumps({"built_at": "t1"}))
        write(os.path.join(self.built, "trip.db"), "db1")

    def test_hash_ignores_generated_at(self):
        a = os.path.join(self.tmp, "a.json")
        b = os.path.join(self.tmp, "b.json")
        write(a, json.dumps({"generated_at": "t1", "x": [1, 2]}))
        write(b, json.dumps({"x": [1, 2], "generated_at": "t2"}))
        self.assertEqual(steps.file_hash(a), steps.file_hash(b))
        write(b, json.dumps({"x": [1, 3], "generated_at": "t1"}))
        self.assertNotEqual(steps.file_hash(a), steps.file_hash(b))

    def test_changed_files(self):
        self.assertEqual(steps.changed_files(None, {"a": "1", "b": "2"}), ["a", "b"])
        self.assertEqual(steps.changed_files({"files": {"a": "1", "b": "9"}}, {"a": "1", "b": "2"}), ["b"])

    def test_only_changed_files_upload(self):
        rest = FakeRest()
        first = steps.upload(rest, self.tmp, now=NOW)
        self.assertEqual(sorted(first["uploaded"]), ["inout.json", "places.json"])
        rest.puts.clear()
        write(os.path.join(self.web, "inout.json"), json.dumps({"generated_at": "t2", "options": []}))   # only the stamp moved
        write(os.path.join(self.web, "places.json"), json.dumps({"generated_at": "t2", "places": [1, 2]}))
        second = steps.upload(rest, self.tmp, now=NOW)
        self.assertEqual(second["uploaded"], ["places.json"])
        self.assertNotIn("data/web/inout.json", rest.puts)
        stamp = json.loads(rest.files["data/web/inout.json"])["generated_at"]
        self.assertEqual(stamp, "t1")   # the unchanged file keeps its old stamp
        self.assertNotIn("built/trip.db", rest.puts)

    def test_meta_json_uploads_last(self):
        rest = FakeRest()
        steps.upload(rest, self.tmp, now=NOW)
        self.assertEqual(rest.puts[-1], "data/web/meta.json")
        meta = json.loads(rest.files["data/web/meta.json"])
        self.assertEqual(sorted(meta["files"]), ["inout.json", "places.json"])
        self.assertEqual(meta["built_at"], "t1")
        self.assertIn("built/trip.db", rest.files)

    def test_a_file_the_build_no_longer_makes_goes(self):
        rest = FakeRest()
        write(os.path.join(self.web, "trips.json"), json.dumps({"trips": [1]}))
        steps.upload(rest, self.tmp, now=NOW)
        os.remove(os.path.join(self.web, "trips.json"))
        steps.upload(rest, self.tmp, now=NOW)
        self.assertNotIn("data/web/trips.json", rest.files)
        self.assertNotIn("trips.json", json.loads(rest.files["data/web/meta.json"])["files"])
        self.assertIn("data/web/places.json", rest.files)

    def test_each_changed_file_is_stored_under_its_hash(self):
        rest = FakeRest()
        out = steps.upload(rest, self.tmp, now=NOW)
        for name, h in out["files"].items():
            self.assertIn(f"by-hash/{h}-{name}", rest.files)

    def test_hash_copies_older_than_an_hour_go(self):
        rest = FakeRest()
        rest.files["by-hash/old1-places.json"] = b"x"
        rest.made["by-hash/old1-places.json"] = NOW - dt.timedelta(seconds=3601)
        rest.files["by-hash/new1-places.json"] = b"x"
        rest.made["by-hash/new1-places.json"] = NOW - dt.timedelta(seconds=3500)
        steps.upload(rest, self.tmp, now=NOW)
        self.assertNotIn("by-hash/old1-places.json", rest.files)
        self.assertIn("by-hash/new1-places.json", rest.files)

    def test_copies_in_the_map_stay(self):
        rest = FakeRest()
        out = steps.upload(rest, self.tmp, now=NOW)
        name, h = next(iter(out["files"].items()))
        rest.made[f"by-hash/{h}-{name}"] = NOW - dt.timedelta(hours=5)
        steps.upload(rest, self.tmp, now=NOW)
        self.assertIn(f"by-hash/{h}-{name}", rest.files)


class BuildPulledTest(unittest.TestCase):
    def test_a_build_with_every_trip_dropped_is_refused(self):
        root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, root, True)
        src = os.path.join(root, "data", "sources")
        nl = chr(10)
        for table, name in steps.store.FILES.items():
            if table in steps.REQUIRED:
                write(os.path.join(src, name), json.dumps({"id": "x"}) + nl)
        write(os.path.join(src, "quotes", "all.jsonl"), json.dumps({"quote_id": "q"}) + nl)
        write(os.path.join(src, "trips.jsonl"), json.dumps({"id": "only", "version": 1}) + nl)
        built = []
        bad = ["data/sources/trips.jsonl:1: places is empty"]
        with mock.patch.object(steps.tripdb, "run_check", lambda *a, **k: (bad, 0)),                 mock.patch.object(steps.tripdb, "cmd_build", lambda *a, **k: built.append(1)),                 mock.patch.object(steps.store, "FileStore", lambda p: None):
            with self.assertRaisesRegex(steps.Refused, "trips"):
                steps.build_pulled(root)
        self.assertEqual(built, [])


class RefuseEmptyTest(unittest.TestCase):
    def setUp(self):
        self.root = tempfile.mkdtemp()
        self.addCleanup(shutil.rmtree, self.root, True)
        self.src = os.path.join(self.root, "data", "sources")
        for table, name in steps.store.FILES.items():
            if table in steps.REQUIRED:
                write(os.path.join(self.src, name), json.dumps({"id": "x"}) + "\n")
        write(os.path.join(self.src, "quotes", "all.jsonl"), json.dumps({"quote_id": "q"}) + "\n")

    def test_a_full_pull_passes(self):
        steps.refuse_empty_pull(self.root)

    def test_empty_trips_pull_is_refused(self):
        write(os.path.join(self.src, "trips.jsonl"), "")
        with self.assertRaisesRegex(steps.Refused, "trips"):
            steps.refuse_empty_pull(self.root)

    def test_empty_required_table_is_refused(self):
        for table in steps.REQUIRED:
            if table == "trips":
                continue
            path = os.path.join(self.src, "quotes", "all.jsonl") if table == "quotes" else os.path.join(self.src, steps.store.FILES[table])
            with open(path) as fh:
                keep = fh.read()
            write(path, "")
            with self.assertRaisesRegex(steps.Refused, table):
                steps.refuse_empty_pull(self.root)
            write(path, keep)

    def test_a_missing_file_is_refused(self):
        os.remove(os.path.join(self.src, "places.jsonl"))
        with self.assertRaisesRegex(steps.Refused, "places"):
            steps.refuse_empty_pull(self.root)


class DerivedTest(unittest.TestCase):
    def test_derived_options_keep_rank(self):
        rest = FakeRest(derived_options=[{"id": "gone", "rank": 0}, {"id": "b", "rank": 9}])
        inout = {"options": [{"id": "a", "total_dkk": 10, "way_in": "I1", "way_home": "H1"},
                             {"id": "b", "total_dkk": 20, "way_in": "I2", "way_home": "H2"},
                             {"id": "a", "total_dkk": 99}]}
        self.assertEqual(steps.replace_derived(rest, inout, NOW), 2)
        rows = {r["id"]: r for r in rest.tables["derived_options"]}
        self.assertEqual(sorted(rows), ["a", "b"])
        self.assertEqual((rows["a"]["rank"], rows["b"]["rank"]), (0, 1))
        self.assertEqual((rows["b"]["total_dkk"], rows["b"]["way_in"]), (20, "I2"))
        self.assertEqual(rows["a"]["data"]["total_dkk"], 10)


if __name__ == "__main__":
    unittest.main()
