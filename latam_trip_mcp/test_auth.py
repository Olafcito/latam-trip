"""Tests for the connector as a resource server on Supabase's OAuth server (TECH-010, FEAT-006 way 1).

The unit tests sign their own tokens with a key made here and need pyjwt[crypto], nothing online. The last class signs
two people in through the whole OAuth flow on the local Supabase stack, as claude.ai would, and runs only with
TRIPDB_DB_TESTS=1 and TRIPDB_ENV_FILE naming the file supabase/local_up.sh wrote. It needs fastmcp and uvicorn too:

  TRIPDB_DB_TESTS=1 TRIPDB_ENV_FILE=<file> uv run --quiet --no-project --python 3.12 --with "fastmcp==3.4.2" \\
    --with "uvicorn==0.54.0" --with "pyjwt[crypto]==2.10.1" python -I -X utf8 -m unittest discover -s latam_trip_mcp -p "test_auth.py" -v
"""
import asyncio, base64, hashlib, http.client, json, os, secrets, socket, sys, threading, time, unittest, urllib.parse
from unittest import mock

HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.path.abspath(os.path.join(HERE, ".."))
for p in (REPO, os.path.join(REPO, "plugin", "scripts"), os.path.join(REPO, "supabase"), os.path.join(REPO, "supabase", "tests")):
    if p not in sys.path:
        sys.path.insert(0, p)

import jwt  # noqa: E402
from cryptography.hazmat.primitives.asymmetric import ec  # noqa: E402

import tripdb_store  # noqa: E402
from latam_trip_mcp import oauth, server  # noqa: E402

URL = "https://proj.test"
ISS = URL + "/auth/v1"
PUBLISHABLE = "sb_publishable_TEST01"
KEY = ec.generate_private_key(ec.SECP256R1())
OTHER = ec.generate_private_key(ec.SECP256R1())


def token(key=KEY, **over):
    now = int(time.time())
    claims = {"iss": ISS, "aud": "authenticated", "sub": "TEST01-user", "role": "authenticated", "iat": now - 10,
              "exp": now + 3600, "client_id": "TEST01-client", "session_id": "TEST01-session"}
    claims.update(over)
    return jwt.encode({k: v for k, v in claims.items() if v is not None}, key, algorithm="ES256", headers={"kid": "TEST01"})


class FakeJwks:
    """Stands in for the project's JWKS: it reads the header as PyJWKClient does and hands back the public key."""

    def get_signing_key_from_jwt(self, t):
        jwt.get_unverified_header(t)
        return type("Key", (), {"key": KEY.public_key()})()


class Answer:
    status = 200

    def __init__(self, body=b"[]"):
        self.headers, self.body = {"Content-Range": "*/0"}, body

    def read(self):
        return self.body

    def __enter__(self):
        return self

    def __exit__(self, *a):
        return False


class AuthBase(unittest.TestCase):
    """The project URL and the publishable key in the environment, the JWKS faked, and every way to a key other than
    the publishable one closed: reading .env fails the test, and every Rest built is recorded."""

    def setUp(self):
        env = mock.patch.dict(os.environ, {"SUPABASE_URL": URL, "SUPABASE_PUBLISHABLE_KEY": PUBLISHABLE})
        env.start()
        self.addCleanup(env.stop)
        jwks = mock.patch.object(oauth, "_client", lambda iss: FakeJwks())
        jwks.start()
        self.addCleanup(jwks.stop)
        no_env = mock.patch.object(tripdb_store, "load_env", side_effect=AssertionError("the connector read .env"))
        no_env.start()
        self.addCleanup(no_env.stop)
        self.rests = []
        real = tripdb_store.Rest.__init__

        def record(rest, url, key, timeout=90, bearer=None):
            self.rests.append({"url": url, "key": key, "bearer": bearer})
            real(rest, url, key, timeout, bearer)
        built = mock.patch.object(tripdb_store.Rest, "__init__", record)
        built.start()
        self.addCleanup(built.stop)

    def guard(self):
        """The real guard with the real verify, in front of an app that records who reached it."""
        self.reached = []

        async def inner(scope, receive, send):
            self.reached.append(server.caller.get())
            await send({"type": "http.response.start", "status": 200, "headers": []})
            await send({"type": "http.response.body", "body": b"ok"})
        return server.guard(inner, oauth.verify_bearer, lambda h: "https://mcp.test")

    def call(self, bearer):
        out = []

        async def send(m):
            out.append(m)
        headers = [(b"authorization", f"Bearer {bearer}".encode())]
        asyncio.run(self.guard()({"type": "http", "path": "/mcp", "headers": headers}, None, send))
        return out[0]["status"], {k.decode(): v.decode() for k, v in out[0]["headers"]}


class UserTokenTest(AuthBase):
    def test_client_built_from_user_token(self):
        t = token()
        sent = []

        def urlopen(req, timeout=None):
            sent.append(req)
            return Answer()
        with mock.patch("urllib.request.urlopen", urlopen):
            core = server.core_for(t)
            core.call("list_trip", {})
        self.assertEqual(self.rests, [{"url": URL, "key": PUBLISHABLE, "bearer": t}])
        self.assertEqual(core.owner(), "TEST01-user")
        self.assertTrue(sent)
        for req in sent:
            self.assertTrue(req.full_url.startswith(URL + "/rest/v1/"), req.full_url)
            self.assertEqual(req.get_header("Apikey"), PUBLISHABLE)
            self.assertEqual(req.get_header("Authorization"), "Bearer " + t)

    def test_a_good_bearer_passes_the_guard_with_its_user(self):
        t = token()
        status, _ = self.call(t)
        self.assertEqual(status, 200)
        self.assertEqual(self.reached, [(t, "TEST01-user")])

    def test_expired_bearer_asks_to_sign_in_again(self):
        t = token(iat=int(time.time()) - 7200, exp=int(time.time()) - 60)
        status, head = self.call(t)
        self.assertEqual(status, 401)
        self.assertIn('error="invalid_token"', head["www-authenticate"])
        self.assertIn('resource_metadata="https://mcp.test/.well-known/oauth-protected-resource/mcp"', head["www-authenticate"])
        self.assertEqual(self.reached, [])
        with self.assertRaises(PermissionError):
            server.core_for(t)
        # never a fallback: no store was built, with any key, and .env was never read
        self.assertEqual(self.rests, [])

    def test_old_bearer_refused(self):
        old = "lt_at_" + secrets.token_urlsafe(32)
        self.assertIsNone(oauth.verify_bearer(old))
        self.assertEqual(self.call(old)[0], 401)
        self.assertEqual(self.rests, [])

    def test_session_token_without_client_id_refused(self):
        planner = token(client_id=None)
        self.assertIsNone(oauth.verify_bearer(planner))
        self.assertIsNone(oauth.verify_bearer(token(client_id="")))
        status, head = self.call(planner)
        self.assertEqual(status, 401)
        self.assertIn('error="invalid_token"', head["www-authenticate"])
        self.assertEqual(self.rests, [])

    def test_a_token_that_is_not_supabases_is_refused(self):
        self.assertIsNone(oauth.verify_bearer(token(key=OTHER)))
        self.assertIsNone(oauth.verify_bearer(token(iss="https://other.test/auth/v1")))
        self.assertIsNone(oauth.verify_bearer(token(aud="other")))
        self.assertIsNone(oauth.verify_bearer(token(role="anon")))
        self.assertIsNone(oauth.verify_bearer(token(role="service_role")))
        self.assertIsNone(oauth.verify_bearer(token(sub=None)))
        self.assertIsNone(oauth.verify_bearer(jwt.encode({"sub": "x"}, "TEST01" * 6, algorithm="HS256")))

    def test_a_store_as_a_user_needs_the_token_and_the_user(self):
        import tripdb
        paths = tripdb.Paths(REPO)
        for bearer, owner in ((None, "TEST01-user"), ("t", None), ("", "")):
            with self.assertRaises(tripdb_store.Refused):
                tripdb_store.SupabaseStore(paths, url=URL, key=PUBLISHABLE, bearer=bearer, owner=owner)
        self.assertEqual(self.rests, [])


# ---- two people sign in on the local stack, as the spike did ----

CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback"


def req(method, url, headers=None, body=None, form=None):
    """(status, lower case headers, parsed body). Never follows a redirect."""
    u = urllib.parse.urlsplit(url)
    conn = (http.client.HTTPSConnection if u.scheme == "https" else http.client.HTTPConnection)(u.hostname, u.port, timeout=60)
    h, data = dict(headers or {}), None
    if body is not None:
        data, h["Content-Type"] = json.dumps(body).encode(), "application/json"
    if form is not None:
        data, h["Content-Type"] = urllib.parse.urlencode(form).encode(), "application/x-www-form-urlencoded"
    conn.request(method, (u.path or "/") + (("?" + u.query) if u.query else ""), body=data, headers=h)
    r = conn.getresponse()
    raw, hdrs = r.read(), {k.lower(): v for k, v in r.getheaders()}
    conn.close()
    try:
        return r.status, hdrs, json.loads(raw) if raw else None
    except ValueError:
        return r.status, hdrs, raw.decode("utf-8", "replace")


def b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def mcp_call(base, method, params, bearer):
    h = {"Accept": "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18", "Authorization": "Bearer " + bearer}
    status, hdrs, body = req("POST", base + "/mcp", h, {"jsonrpc": "2.0", "id": 1, "method": method, "params": params})
    if isinstance(body, str) and "data:" in body:
        body = json.loads([ln[5:].strip() for ln in body.splitlines() if ln.startswith("data:")][-1])
    return status, hdrs, body


class JwksTest(unittest.TestCase):
    """The real key client, with the fetch counted instead of sent."""

    def setUp(self):
        self.client = oauth._keys_class()(ISS + "/.well-known/jwks.json")
        self.keys = [self.jwk(KEY, "TEST01")]
        self.fetches = 0

        def fetch():
            self.fetches += 1
            data = {"keys": list(self.keys)}
            self.client.jwk_set_cache.put(data)
            return data
        self.client.fetch_data = fetch

    @staticmethod
    def jwk(key, kid):
        out = jwt.algorithms.ECAlgorithm.to_jwk(key.public_key(), as_dict=True)
        out.update(kid=kid, use="sig", alg="ES256")
        return out

    def test_the_key_set_is_kept_ten_minutes_and_no_key_is_kept_longer(self):
        self.assertEqual(self.client.jwk_set_cache.lifespan, 600)
        self.client.get_signing_key("TEST01")
        self.client.get_signing_key("TEST01")
        self.assertEqual(self.fetches, 1)
        self.keys = [self.jwk(OTHER, "TEST02")]  # Supabase withdrew TEST01
        later = time.monotonic() + 601
        with mock.patch("time.monotonic", lambda: later):
            with self.assertRaises(jwt.PyJWKClientError):
                self.client.get_signing_key("TEST01")
        self.assertEqual(self.fetches, 3)  # the expired set, then one more try for the missing kid

    def test_an_unknown_kid_fetches_the_set_at_most_once_a_minute(self):
        for _ in range(5):
            with self.assertRaises(jwt.PyJWKClientError):
                self.client.get_signing_key("TEST01-made-up")
        self.assertEqual(self.fetches, 2)
        later = time.monotonic() + 61
        with mock.patch.object(oauth.time, "monotonic", lambda: later):
            with self.assertRaises(jwt.PyJWKClientError):
                self.client.get_signing_key("TEST01-made-up")
        self.assertEqual(self.fetches, 3)

    def test_a_rotated_key_is_found_without_a_restart(self):
        self.client.get_signing_key("TEST01")
        self.keys.append(self.jwk(OTHER, "TEST02"))
        self.assertEqual(self.client.get_signing_key("TEST02").key_id, "TEST02")
        self.assertEqual(self.fetches, 2)


STUB = ("QTA", "QTB")  # made up codes, so the stub function has to write them
PLACE = "TMCPAUTH"


@unittest.skipUnless(os.environ.get("TRIPDB_DB_TESTS") == "1", "set TRIPDB_DB_TESTS=1 and TRIPDB_ENV_FILE to the local stack")
class TwoUsersSignInTest(unittest.TestCase):
    """Two people connect the same client through Supabase's OAuth server and the planner's consent step, and the real
    connector answers each with their own trips only. Its own users and TEST01 trips, never another test's."""

    @classmethod
    def setUpClass(cls):
        import migrate, users, uvicorn
        cls.env = env = migrate.load_env()
        users.refuse(env)
        cls.users = users
        cls.a, cls.b = users.make_user(env, "mcp-auth-a"), users.make_user(env, "mcp-auth-b")
        port = cls.free_port()
        cls.base = f"http://127.0.0.1:{port}"
        cls.saved = mock.patch.dict(os.environ, {"SUPABASE_URL": env["SUPABASE_URL"].rstrip("/"),
                                                 "SUPABASE_PUBLISHABLE_KEY": env["SUPABASE_PUBLISHABLE_KEY"],
                                                 "LATAMTRIP_PUBLIC_URL": cls.base})
        cls.saved.start()
        cls.srv = uvicorn.Server(uvicorn.Config(server.build_asgi(), host="127.0.0.1", port=port, log_level="warning", lifespan="on"))
        cls.thread = threading.Thread(target=cls.srv.run, daemon=True)
        cls.thread.start()
        for _ in range(400):
            if cls.srv.started:
                break
            time.sleep(0.05)
        else:
            raise RuntimeError("the connector did not start")

    @classmethod
    def tearDownClass(cls):
        cls.srv.should_exit = True
        cls.thread.join(10)
        for u in (cls.a, cls.b):
            u.rest.delete("trips", "id=like.TEST01-mcp-auth-*")
        cls.clean_catalogue()
        cls.saved.stop()

    @classmethod
    def clean_catalogue(cls):
        """Only the rows these tests make: B's flights from the made up airport, the airports, the stay and its place."""
        svc = cls.users.service(cls.env)
        svc.delete("quotes", f"owner_id=eq.{cls.b.id}&first_from=eq.{STUB[0]}")
        svc.delete("airports", f"code=in.({','.join(STUB)})")
        svc.delete("stays", f"place_id=eq.{PLACE}")
        svc.delete("places", f"id=eq.{PLACE}")

    @staticmethod
    def free_port():
        s = socket.socket()
        s.bind(("127.0.0.1", 0))
        port = s.getsockname()[1]
        s.close()
        return port

    def seed(self):
        """Each person's own TEST01 trip, put again right before a read because other database tests share the stack."""
        for u, tid in ((self.a, "TEST01-mcp-auth-a"), (self.b, "TEST01-mcp-auth-b")):
            data = {"id": tid, "version": 1, "name": tid, "saved_at": "2026-11-06T00:00:00Z", "by": "migration",
                    "why": "TEST01 sign in test", "way_in": {}, "way_home": {}, "places": []}
            s, body = u.rest.insert("trips", [{"id": tid, "version": 1, "data": data}],
                                    on_conflict="owner_id,id,version", resolution="merge-duplicates")
            self.assertIn(s, (200, 201), body)

    def discover(self):
        """401, the protected resource metadata, then the authorization server metadata in the MCP spec's order."""
        s, h, _ = req("POST", self.base + "/mcp", {"Accept": "application/json, text/event-stream"},
                      {"jsonrpc": "2.0", "id": 1, "method": "initialize", "params": {}})
        self.assertEqual(s, 401)
        challenge = h["www-authenticate"]
        meta_url = challenge.split('resource_metadata="', 1)[1].split('"', 1)[0]
        s, _, prm = req("GET", meta_url)
        self.assertEqual(s, 200)
        self.assertEqual(prm["resource"], self.base + "/mcp")
        issuer = prm["authorization_servers"][0]
        self.assertEqual(issuer, self.env["SUPABASE_URL"].rstrip("/") + "/auth/v1")
        u = urllib.parse.urlsplit(issuer)
        origin, path = f"{u.scheme}://{u.netloc}", u.path.rstrip("/")
        for url in (origin + "/.well-known/oauth-authorization-server" + path, origin + "/.well-known/openid-configuration" + path,
                    origin + path + "/.well-known/openid-configuration"):
            s, _, meta = req("GET", url)
            if s == 200 and isinstance(meta, dict) and meta.get("issuer") == issuer:
                return prm, meta
        self.fail("no authorization server metadata")

    def sign_in(self, meta, client_id, user, resource):
        """authorize, the consent step as the planner answers it, the code exchange. The access token."""
        verifier = b64url(secrets.token_bytes(32))
        state = b64url(secrets.token_bytes(16))
        q = {"response_type": "code", "client_id": client_id, "redirect_uri": CLAUDE_CALLBACK, "scope": "email",
             "resource": resource, "code_challenge": b64url(hashlib.sha256(verifier.encode()).digest()),
             "code_challenge_method": "S256", "state": state}
        s, h, _ = req("GET", meta["authorization_endpoint"] + "?" + urllib.parse.urlencode(q))
        self.assertIn(s, (302, 303))
        auth_id = urllib.parse.parse_qs(urllib.parse.urlsplit(h["location"]).query)["authorization_id"][0]
        at = self.env["SUPABASE_URL"].rstrip("/") + "/auth/v1/oauth/authorizations/" + auth_id
        hdr = {"apikey": self.env["SUPABASE_PUBLISHABLE_KEY"], "Authorization": "Bearer " + user.token}
        s, _, ask = req("GET", at, hdr)
        self.assertEqual(s, 200, ask)
        if ask.get("authorization_id"):
            self.assertEqual(ask["redirect_uri"], CLAUDE_CALLBACK)
            s, _, ask = req("POST", at + "/consent", hdr, {"action": "approve"})
            self.assertEqual(s, 200, ask)
        back = urllib.parse.parse_qs(urllib.parse.urlsplit(ask.get("redirect_url") or ask.get("redirect_to")).query)
        self.assertEqual(back["state"][0], state)
        s, _, tok = req("POST", meta["token_endpoint"], {"Accept": "application/json"}, form={
            "grant_type": "authorization_code", "code": back["code"][0], "redirect_uri": CLAUDE_CALLBACK,
            "client_id": client_id, "code_verifier": verifier, "resource": resource})
        self.assertEqual(s, 200, tok)
        return tok["access_token"]

    def trips(self, bearer):
        s, _, body = mcp_call(self.base, "tools/call", {"name": "list_trip", "arguments": {}}, bearer)
        self.assertEqual(s, 200, body)
        self.assertFalse(body["result"].get("isError"), body)
        return sorted(r["id"] for r in json.loads(body["result"]["content"][0]["text"])["rows"] if r["id"].startswith("TEST01-mcp-auth-"))

    def connect(self):
        """One client registered the way claude.ai registers, and both people signed in through it. Their tokens."""
        prm, meta = self.discover()
        s, _, client = req("POST", meta["registration_endpoint"], body={
            "client_name": "Claude", "redirect_uris": [CLAUDE_CALLBACK], "grant_types": ["authorization_code", "refresh_token"],
            "response_types": ["code"], "token_endpoint_auth_method": "none"})
        self.assertIn(s, (200, 201), client)
        return (self.sign_in(meta, client["client_id"], self.a, prm["resource"]),
                self.sign_in(meta, client["client_id"], self.b, prm["resource"]))

    def tool(self, bearer, name, args, refused=False):
        s, _, body = mcp_call(self.base, "tools/call", {"name": name, "arguments": args}, bearer)
        self.assertEqual(s, 200, body)
        self.assertEqual(bool(body["result"].get("isError")), refused, body)
        text = body["result"]["content"][0]["text"]
        return text if refused else json.loads(text)

    def test_a_person_who_is_not_the_admin_saves_and_changes_a_flight(self):
        a, b = self.connect()
        self.clean_catalogue()
        out = self.tool(b, "add_flight", {"rows": [{"from": STUB[0], "to": STUB[1], "date": "2026-12-12", "price": 450,
                                                     "notes": "TEST01"}]})
        self.assertEqual(out["refused"], [], out)
        first = out["added"][0]
        moved = self.tool(b, "update_flight", {"id": first, "patch": {"price": 400}})["updated"]
        self.assertNotEqual(moved, first)
        # a change that keeps the quote id takes the stored quote out and puts the new one in
        same = self.tool(b, "update_flight", {"id": moved, "patch": {"notes": "TEST01 again"}})["updated"]
        self.assertEqual(same, moved)
        got = self.tool(b, "get_flight", {"id": same})
        self.assertEqual((got["price_dkk"], got["notes"]), (400, "site=chat; TEST01 again"))
        self.tool(b, "get_flight", {"id": first}, refused=True)
        # A sees none of it
        self.tool(a, "get_flight", {"id": same}, refused=True)
        self.assertEqual(self.tool(a, "list_flight", {"where": {"from": STUB[0]}})["rows"], [])
        svc = self.users.service(self.env)
        # the made up airports came in as stubs, though B cannot write the catalogue
        _, rows = svc.select("airports", f"select=code&code=in.({','.join(STUB)})&order=code")
        self.assertEqual([r["code"] for r in rows], list(STUB))
        # owner_id comes from the token, never from the row
        _, quotes = svc.select("quotes", f"select=owner_id&quote_id=eq.{same}")
        self.assertEqual(quotes, [{"owner_id": self.b.id}])

    def test_a_signed_in_person_reads_the_stays(self):
        a, b = self.connect()
        svc = self.users.service(self.env)
        got = svc.insert("places", [{"id": PLACE, "name": "TEST01 place"}], on_conflict="id", resolution="merge-duplicates")
        self.assertIn(got[0], (200, 201), got)
        stay = {"place_id": PLACE, "site": "TEST01", "name": "TEST01 hostel", "room": "TEST01 dorm",
                "check_in": "2026-12-03", "check_out": "2026-12-06", "dkk_per_night": 100}
        got = svc.insert("stays", [stay], on_conflict="place_id,site,name,room,check_in,check_out", resolution="merge-duplicates")
        self.assertIn(got[0], (200, 201), got)
        for who in (a, b):
            rows = self.tool(who, "list_stay", {"where": {"place": PLACE}})["rows"]
            self.assertEqual(len(rows), 1, rows)

    def test_two_users_sign_in(self):
        a, b = self.connect()
        self.seed()
        self.assertEqual(self.trips(a), ["TEST01-mcp-auth-a"])
        self.seed()
        self.assertEqual(self.trips(b), ["TEST01-mcp-auth-b"])
        # the planner session of the same person is not a connector token
        s, h, _ = mcp_call(self.base, "tools/list", {}, self.a.token)
        self.assertEqual(s, 401)
        self.assertIn('error="invalid_token"', h["www-authenticate"])


if __name__ == "__main__":
    unittest.main()
