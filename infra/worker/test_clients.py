"""Tests of the OAuth client prune. No network: a fake REST client that answers the admin list, records each delete
and answers or refuses the last use function.
Run: python -I -X utf8 -m unittest discover -s infra/worker -p "test_clients.py"
The ids are made up."""
import datetime, json, os, sys, unittest

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import clients  # noqa: E402

NOW = datetime.datetime(2026, 11, 6, 12, tzinfo=datetime.timezone.utc)


def ago(days):
    return (NOW - datetime.timedelta(days=days)).isoformat().replace("+00:00", "Z")


def client(cid, made_days_ago, kind="dynamic"):
    return {"client_id": cid, "client_name": "TEST01", "registration_type": kind, "created_at": ago(made_days_ago)}


class FakeRest:
    def __init__(self, listed, used=None, refuse_rpc=False, fail=()):
        self.listed, self.used, self.refuse_rpc, self.fail = listed, used or [], refuse_rpc, set(fail)
        self.deleted, self.rpcs = [], []

    def _call(self, method, path, body=None, headers=None, retry=False):
        if method == "GET":
            assert path == clients.CLIENTS
            return 200, {}, json.dumps({"clients": self.listed}).encode()
        assert method == "DELETE" and path.startswith(clients.CLIENTS + "/")
        cid = path.rsplit("/", 1)[1]
        if cid in self.fail:
            raise RuntimeError(f"DELETE {path} gave 500")
        self.deleted.append(cid)
        return 204, {}, b""

    def rpc(self, name, body=None):
        self.rpcs.append(name)
        if self.refuse_rpc:
            raise RuntimeError(f"POST /rest/v1/rpc/{name} gave 404: PGRST202")
        return self.used


class PruneTest(unittest.TestCase):
    def test_only_old_unused_dynamic_clients_go(self):
        listed = [client("old-unused", 40), client("old-used-long-ago", 60), client("old-used-lately", 60),
                  client("new", 3), client("manual", 400, kind="manual")]
        used = [{"client_id": "old-used-long-ago", "last_used": ago(45)},
                {"client_id": "old-used-lately", "last_used": ago(2)}]
        rest = FakeRest(listed, used)
        out = clients.prune(rest, now=NOW)
        self.assertEqual(sorted(rest.deleted), ["old-unused", "old-used-long-ago"])
        self.assertEqual(out, {"clients": 5, "stale": 2, "deleted": 2, "failed": []})
        self.assertEqual(rest.rpcs, [clients.LAST_USED_RPC])

    def test_a_client_made_lately_is_kept_even_if_never_used(self):
        rest = FakeRest([client("fresh", clients.DAYS - 1)])
        clients.prune(rest, now=NOW)
        self.assertEqual(rest.deleted, [])

    def test_without_the_last_use_function_nothing_is_deleted(self):
        rest = FakeRest([client("old-unused", 400)], refuse_rpc=True)
        out = clients.prune(rest, now=NOW)
        self.assertEqual(rest.deleted, [])
        self.assertEqual(out["deleted"], 0)
        self.assertEqual(out["skipped"], "no last use to judge by")
        self.assertIn("PGRST202", out["error"])

    def test_one_run_deletes_at_most_the_limit(self):
        rest = FakeRest([client(f"c{i:02d}", 90) for i in range(7)])
        out = clients.prune(rest, now=NOW, limit=3)
        self.assertEqual(rest.deleted, ["c00", "c01", "c02"])
        self.assertEqual((out["stale"], out["deleted"]), (7, 3))

    def test_a_failed_delete_does_not_stop_the_others(self):
        rest = FakeRest([client("a", 90), client("b", 90), client("c", 90)], fail={"b"})
        out = clients.prune(rest, now=NOW)
        self.assertEqual(rest.deleted, ["a", "c"])
        self.assertEqual(out["deleted"], 2)
        self.assertEqual(len(out["failed"]), 1)
        self.assertIn("gave 500", out["failed"][0])

    def test_a_client_without_an_id_or_a_date_is_kept(self):
        listed = [{"registration_type": "dynamic", "created_at": ago(90)}, {"client_id": "undated", "registration_type": "dynamic"}]
        rest = FakeRest(listed)
        clients.prune(rest, now=NOW)
        self.assertEqual(rest.deleted, [])

    def test_the_id_is_quoted_into_the_path(self):
        rest = FakeRest([client("a/b", 90)])
        clients.prune(rest, now=NOW)
        self.assertEqual(rest.deleted, ["a%2Fb"])


if __name__ == "__main__":
    unittest.main()
