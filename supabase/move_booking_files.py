"""Moves the booking files of before FEAT-006 phase 2 into the admin's folder of the private bookings bucket.

Before migration 0028 a file lived at <booking id>/<file>. Now it lives at <owner id>/<booking id>/<file>, and every
file of before belongs to the admin. SQL cannot rename a stored file, so this moves each one through the Storage API to
<admin id>/<booking id>/<file> and then points the bookings rows at the new paths. Only a folder named by one of the
admin's booking ids is moved.

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


def legacy_files(api, booking_ids):
    """Every path <booking id>/<file> under a folder named by one of these booking ids. Any other folder, such as one
    named by a user id or by another person's booking, is left alone."""
    paths = []
    for bid in booking_ids:
        if "/" in bid:
            continue  # not a folder name
        paths += [f"{bid}/{e['name']}" for e in api.entries(bid + "/") if e.get("id") is not None]
    return paths


def moved(path, admin):
    return f"{admin}/{path}" if path and path.count("/") == 1 else path


def main(argv):
    apply = "--apply" in argv
    env = migrate.load_env()
    if not env.get("SUPABASE_URL") or not env.get("SUPABASE_SECRET_KEY"):
        raise SystemExit("move_booking_files: SUPABASE_URL and SUPABASE_SECRET_KEY are needed")
    api = Api(env)
    admin = api.admin_id()
    rows = api.need("GET", "/rest/v1/bookings?select=id,attachments&owner_id=eq." + admin)
    paths = legacy_files(api, [r["id"] for r in rows])
    changed = [r for r in rows if any(moved(a.get("path"), admin) != a.get("path") for a in r["attachments"])]
    print(f"files to move {len(paths)}, bookings to update {len(changed)}")
    if not apply:
        print("dry run, pass --apply to move")
        return 0
    failed = 0
    for path in paths:
        code, _ = api.call("POST", "/storage/v1/object/move",
                           {"bucketId": BUCKET, "sourceKey": path, "destinationKey": f"{admin}/{path}"})
        if code >= 300:
            failed += 1
    if failed:
        # the rows keep the old paths, which the admin can still read, and a second run moves the rest
        print(f"moved {len(paths) - failed}, failed {failed}, bookings left as they were")
        return 1
    for row in changed:
        files = [dict(a, path=moved(a.get("path"), admin)) for a in row["attachments"]]
        api.need("PATCH", f"/rest/v1/bookings?owner_id=eq.{admin}&id=eq.{urllib.parse.quote(row['id'])}",
                 {"attachments": files},
                 {"Prefer": "return=minimal"})
    print(f"moved {len(paths)}, bookings updated {len(changed)}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
