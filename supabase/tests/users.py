"""Two signed in users on the local stack, for the tests of per user row level security.

make_user(env, "a") gives test-a@example.test and make_user(env, "b") gives test-b@example.test. Each is made through
the GoTrue admin API with the secret key the first time, then signed in with a password. User.rest talks to PostgREST
on the publishable key with the user's bearer, so every request runs under row level security as that person.
User.storage does the same for the Storage API. admin(env) is A, after A is the one row of public.admins.

The env is the one migrate.load_env() reads, so TRIPDB_ENV_FILE names the local stack. The keys there are the
CLI's fixed local defaults. Nothing here may run on the project: refuse() stops any URL that is not this machine.
"""
import json, os, sys, urllib.error, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.dirname(HERE))
PASSWORD = "TEST01-password-local-only"


def refuse(env):
    host = urllib.parse.urlsplit(env.get("SUPABASE_URL", "")).hostname or ""
    if host not in ("127.0.0.1", "localhost", "::1"):
        raise SystemExit("users.py runs on the local stack only, set TRIPDB_ENV_FILE to the file local_up.sh wrote")


def http(method, url, headers=None, body=None, raw=None):
    """(status, parsed body or text). body is sent as JSON, raw as bytes."""
    h = dict(headers or {})
    data = raw
    if body is not None:
        data = json.dumps(body).encode()
        h.setdefault("Content-Type", "application/json")
    req = urllib.request.Request(url, method=method, headers=h, data=data)
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            text = r.read()
            code = r.status
    except urllib.error.HTTPError as e:
        text = e.read()
        code = e.code
        e.close()
    try:
        return code, (json.loads(text) if text else None)
    except ValueError:
        return code, text


class Rest:
    """PostgREST as one caller. key is the apikey, bearer the Authorization token (None sends the key alone)."""

    def __init__(self, url, key, bearer=None):
        self.base = url.rstrip("/") + "/rest/v1/"
        self.headers = {"apikey": key}
        if bearer:
            self.headers["Authorization"] = "Bearer " + bearer

    def call(self, method, path, body=None, prefer=None):
        h = dict(self.headers)
        if prefer:
            h["Prefer"] = prefer
        return http(method, self.base + path, h, body)

    def select(self, table, query="select=*"):
        return self.call("GET", f"{table}?{query}")

    def insert(self, table, rows, on_conflict=None, resolution=None):
        path = table + (f"?on_conflict={on_conflict}" if on_conflict else "")
        prefer = "return=representation" + (f",resolution={resolution}" if resolution else "")
        return self.call("POST", path, rows, prefer)

    def update(self, table, query, body):
        return self.call("PATCH", f"{table}?{query}", body, "return=representation")

    def delete(self, table, query):
        return self.call("DELETE", f"{table}?{query}", None, "return=representation")

    def rpc(self, name, body=None):
        return self.call("POST", "rpc/" + name, body or {})


class Storage:
    """The Storage API as one caller."""

    def __init__(self, url, key, bearer=None):
        self.base = url.rstrip("/") + "/storage/v1/"
        self.headers = {"apikey": key}
        if bearer:
            self.headers["Authorization"] = "Bearer " + bearer

    def upload(self, bucket, path, data, content_type="application/pdf", upsert=False):
        h = dict(self.headers, **{"Content-Type": content_type, "x-upsert": "true" if upsert else "false"})
        return http("POST", f"{self.base}object/{bucket}/{urllib.parse.quote(path)}", h, raw=data)

    def update(self, bucket, path, data, content_type="application/pdf"):
        h = dict(self.headers, **{"Content-Type": content_type})
        return http("PUT", f"{self.base}object/{bucket}/{urllib.parse.quote(path)}", h, raw=data)

    def download(self, bucket, path):
        return http("GET", f"{self.base}object/authenticated/{bucket}/{urllib.parse.quote(path)}", self.headers)

    def list(self, bucket, prefix):
        return http("POST", f"{self.base}object/list/{bucket}", self.headers, {"prefix": prefix, "limit": 100})

    def remove(self, bucket, paths):
        return http("DELETE", f"{self.base}object/{bucket}", self.headers, {"prefixes": list(paths)})

    def move(self, bucket, src, dst):
        return http("POST", f"{self.base}object/move", self.headers,
                    {"bucketId": bucket, "sourceKey": src, "destinationKey": dst})

    def sign(self, bucket, path):
        return http("POST", f"{self.base}object/sign/{bucket}/{urllib.parse.quote(path)}", self.headers,
                    {"expiresIn": 60})


class User:
    def __init__(self, env, uid, email, token):
        self.id, self.email, self.token = uid, email, token
        self.rest = Rest(env["SUPABASE_URL"], env["SUPABASE_PUBLISHABLE_KEY"], token)
        self.storage = Storage(env["SUPABASE_URL"], env["SUPABASE_PUBLISHABLE_KEY"], token)


def service(env):
    """PostgREST on the secret key, the way the worker and the PC write."""
    refuse(env)
    return Rest(env["SUPABASE_URL"], env["SUPABASE_SECRET_KEY"])


def service_storage(env):
    refuse(env)
    return Storage(env["SUPABASE_URL"], env["SUPABASE_SECRET_KEY"])


def _auth(env, path):
    return env["SUPABASE_URL"].rstrip("/") + "/auth/v1/" + path


def make_user(env, label):
    """The user test-<label>@example.test, made once and signed in afresh."""
    refuse(env)
    email = f"test-{label}@example.test"
    admin_h = {"apikey": env["SUPABASE_SECRET_KEY"], "Authorization": "Bearer " + env["SUPABASE_SECRET_KEY"]}
    code, body = http("POST", _auth(env, "admin/users"), admin_h,
                      {"email": email, "password": PASSWORD, "email_confirm": True})
    if code not in (200, 201, 422):
        raise RuntimeError(f"making {email} gave {code}: {body}")
    code, body = http("POST", _auth(env, "token?grant_type=password"), {"apikey": env["SUPABASE_PUBLISHABLE_KEY"]},
                      {"email": email, "password": PASSWORD})
    if code != 200:
        raise RuntimeError(f"signing in {email} gave {code}: {body}")
    return User(env, body["user"]["id"], email, body["access_token"])


def make_admin(env, user):
    """Make user the only admin, through PostgREST on the secret key, so it needs no database driver. admins after
    0027, owners before it."""
    svc = service(env)
    for table in ("admins", "owners"):
        code, body = svc.call("DELETE", f"{table}?user_id=neq.{user.id}")
        if code == 404 or (isinstance(body, dict) and body.get("code") in ("42P01", "PGRST205")):
            continue
        if code not in (200, 204):
            raise RuntimeError(f"clearing {table} gave {code}: {body}")
        code, body = svc.insert(table, [{"user_id": user.id}], on_conflict="user_id", resolution="ignore-duplicates")
        if code not in (200, 201):
            raise RuntimeError(f"making the admin in {table} gave {code}: {body}")
        return user
    raise RuntimeError("neither admins nor owners exists")


def admin(env):
    """User A, the one admin."""
    return make_admin(env, make_user(env, "a"))
