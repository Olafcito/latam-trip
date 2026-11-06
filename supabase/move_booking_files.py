"""Moves the booking files of before FEAT-006 phase 2 into the admin's folder of the private bookings bucket.

Before migration 0028 a file lived at <booking id>/<file>. Now it lives at <owner id>/<booking id>/<file>, and every
file of before belongs to the admin. SQL cannot rename a stored file, so this moves each one through the Storage API to
<admin id>/<booking id>/<file> and points the bookings rows at the new paths. Only a folder named by one of the
admin's booking ids is moved. It works one booking at a time: it copies the booking's files, points its row at the
copies and then removes the files of before, and it stops at the first failure. So every booking names files that
exist, whether the run finished or not.

Run it once from the PC after the release that applied 0028:
    python -I -X utf8 supabase/move_booking_files.py           shows what would move
    python -I -X utf8 supabase/move_booking_files.py --apply   moves the files and updates the rows

It reads SUPABASE_URL and SUPABASE_SECRET_KEY like migrate.py does, from TRIPDB_ENV_FILE or .env. It prints counts
only, never a file name, a path or a booking. A second run finds nothing left to move, so it is safe to repeat.
"""
import json, os, sys, urllib.error, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import migrate

BUCKET = "bookings"


class Api:
    def __init__(self, env):
        self.base = env["SUPABASE_URL"].rstrip("/")
        key = env["SUPABASE_SECRET_KEY"]
        self.headers = {"apikey": key, "Authorization": "Bearer " + key}

    def call(self, method, path, body=None, headers=None):
        h = dict(self.headers, **(headers or {}))
        data = None
        if body is not None:
            h["Content-Type"] = "application/json"
            data = json.dumps(body).encode()
        req = urllib.request.Request(self.base + path, data=data, headers=h, method=method)
        try:
            with urllib.request.urlopen(req, timeout=60) as r:
                text = r.read().decode() or "null"
                return r.status, json.loads(text)
        except urllib.error.HTTPError as e:
            text = e.read().decode()
            try:
                return e.code, json.loads(text)
            except ValueError:
                return e.code, text

    def need(self, method, path, body=None, headers=None):
        code, got = self.call(method, path, body, headers)
        if code >= 300:
            raise SystemExit(f"move_booking_files: {method} {path.split('?')[0]} answered {code}")
        return got

    def admin_id(self):
        rows = self.need("GET", "/rest/v1/admins?select=user_id")
        if len(rows) != 1:
            raise SystemExit(f"move_booking_files: expected one admin, found {len(rows)}")
        return rows[0]["user_id"]

    def entries(self, prefix):
        out, offset = [], 0
        while True:
            page = self.need("POST", f"/storage/v1/object/list/{BUCKET}",
                             {"prefix": prefix, "limit": 1000, "offset": offset, "sortBy": {"column": "name", "order": "asc"}})
            out += page
            if len(page) < 1000:
                return out
            offset += 1000


def names(api, prefix):
    """The file names directly under a folder."""
    return [e["name"] for e in api.entries(prefix) if e.get("id") is not None]


def plan(api, admin, row):
    """The files of one booking's folder of before, and its attachments with every path whose file is or will be in
    the admin's folder rewritten to it. A booking id with a slash names no folder."""
    bid = row["id"]
    old = [] if "/" in bid else names(api, bid + "/")
    there = set() if "/" in bid else set(names(api, f"{admin}/{bid}/"))
    ready = there | set(old)
    files = [dict(a, path=f"{admin}/{a['path']}") if (a.get("path") or "").startswith(bid + "/")
             and a["path"].count("/") == 1 and a["path"].split("/", 1)[1] in ready else a for a in row["attachments"]]
    return old, there, files


def move_one(api, admin, row, old, there, files):
    """Copies the booking's files, points its row at the copies, then removes the files of before. A failure stops
    before the row changes, or after it points at copies that exist, so the row never names a missing file."""
    bid = row["id"]
    copied = []
    for name in old:
        if name in there:
            continue  # a run that stopped after the copy left it
        code, _ = api.call("POST", "/storage/v1/object/copy",
                           {"bucketId": BUCKET, "sourceKey": f"{bid}/{name}", "destinationKey": f"{admin}/{bid}/{name}"})
        if code >= 300:
            if copied:
                api.call("DELETE", f"/storage/v1/object/{BUCKET}", {"prefixes": copied})
            return False
        copied.append(f"{admin}/{bid}/{name}")
    if files != row["attachments"]:
        code, _ = api.call("PATCH", f"/rest/v1/bookings?owner_id=eq.{admin}&id=eq.{urllib.parse.quote(bid)}",
                           {"attachments": files}, {"Prefer": "return=minimal"})
        if code >= 300:
            return False  # the row still names the files of before, which are still there
    if old:
        code, _ = api.call("DELETE", f"/storage/v1/object/{BUCKET}", {"prefixes": [f"{bid}/{n}" for n in old]})
        if code >= 300:
            return False  # the row names the copies, and a second run removes what is left
    return True


def main(argv):
    apply = "--apply" in argv
    env = migrate.load_env()
    if not env.get("SUPABASE_URL") or not env.get("SUPABASE_SECRET_KEY"):
        raise SystemExit("move_booking_files: SUPABASE_URL and SUPABASE_SECRET_KEY are needed")
    api = Api(env)
    admin = api.admin_id()
    rows = api.need("GET", f"/rest/v1/bookings?select=id,attachments&owner_id=eq.{admin}&order=id")
    work = []
    for row in rows:
        old, there, files = plan(api, admin, row)
        if old or files != row["attachments"]:
            work.append((row, old, there, files))
    n_files = sum(len(w[1]) for w in work)
    n_rows = sum(1 for w in work if w[3] != w[0]["attachments"])
    print(f"files to move {n_files}, bookings to update {n_rows}")
    if not apply:
        print("dry run, pass --apply to move")
        return 0
    moved_files = updated = 0
    for row, old, there, files in work:
        if not move_one(api, admin, row, old, there, files):
            # every booking still names files that exist, and a second run carries on from here
            print(f"moved {moved_files}, bookings updated {updated}, stopped at a failure")
            return 1
        moved_files += len(old)
        updated += files != row["attachments"]
    print(f"moved {moved_files}, bookings updated {updated}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
