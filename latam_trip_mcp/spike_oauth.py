"""FEAT-006 task 3.1, the OAuth 2.1 spike. Never merged. Proves or refutes way 1: Supabase Auth's own OAuth 2.1 server as the
authorization server of the latam-trip connector.

The script plays three parts on the local stack only:
- the MCP client, as claude.ai would: an unauthenticated call, the 401 and its resource_metadata, the protected resource
  metadata, authorization server discovery in the order of the 2025-11-25 MCP spec, dynamic client registration with
  Claude's callback, PKCE S256 with state and resource, then the token exchange and the refresh, form encoded.
- a stand in for the planner's consent route: the test user signs in with a password, reads the authorization by its
  authorization_id and approves it through /auth/v1/oauth/authorizations/<id>/consent.
- the connector: the real FastMCP tools of server.build_mcp behind a guard that verifies the bearer against
  /auth/v1/.well-known/jwks.json and builds a Core per request on PostgREST with the publishable key and that bearer.

Run (the env file is the one supabase/local_up.sh writes, outside the repo):
  TRIPDB_ENV_FILE=<file> uv run --quiet --no-project --python 3.12 --with "fastmcp==3.4.2" --with "uvicorn==0.54.0" \
    --with "pyjwt[crypto]==2.10.1" python -I -X utf8 latam_trip_mcp/spike_oauth.py [--wait-expiry]

--wait-expiry sleeps until the first access token has expired (jwt_expiry, 3600 s on the local stack) and then proves the
refresh. Nothing printed holds a token, an email or a user id. The stack needs [auth.oauth_server] in
supabase/local/supabase/config.toml.
"""
from __future__ import annotations

import argparse, base64, contextvars, hashlib, http.client, json, os, secrets, socket, sys, threading, time, urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
for p in (ROOT, os.path.join(ROOT, "plugin", "scripts"), os.path.join(ROOT, "supabase"), os.path.join(ROOT, "supabase", "tests")):
    if p not in sys.path:
        sys.path.insert(0, p)

import migrate  # noqa: E402
import users  # noqa: E402

CLAUDE_CALLBACK = "https://claude.ai/api/mcp/auth_callback"
LOOPBACK = ("http://localhost/callback", "http://127.0.0.1/callback")
RESULTS: list[dict] = []


def record(part, ok, **evidence):
    RESULTS.append({"part": part, "pass": bool(ok), **evidence})
    print(("PASS " if ok else "FAIL ") + part + " " + json.dumps(evidence, default=str))
    return ok


def note(part, **evidence):
    RESULTS.append({"part": part, "pass": None, **evidence})
    print("NOTE " + part + " " + json.dumps(evidence, default=str))


# ---- plain HTTP that never follows a redirect ----

def req(method, url, headers=None, body=None, form=None):
    """(status, headers dict with lower case names, parsed JSON or text). body goes as JSON, form as urlencoded."""
    u = urllib.parse.urlsplit(url)
    conn = (http.client.HTTPSConnection if u.scheme == "https" else http.client.HTTPConnection)(u.hostname, u.port, timeout=60)
    h = dict(headers or {})
    data = None
    if body is not None:
        data = json.dumps(body).encode()
        h.setdefault("Content-Type", "application/json")
    if form is not None:
        data = urllib.parse.urlencode(form).encode()
        h["Content-Type"] = "application/x-www-form-urlencoded"
    path = u.path + (("?" + u.query) if u.query else "")
    conn.request(method, path or "/", body=data, headers=h)
    r = conn.getresponse()
    raw = r.read()
    hdrs = {k.lower(): v for k, v in r.getheaders()}
    conn.close()
    try:
        parsed = json.loads(raw) if raw else None
    except ValueError:
        parsed = raw.decode("utf-8", "replace")
    return r.status, hdrs, parsed


def b64url(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def claims_of(token):
    """The payload of a JWT, unverified, for evidence only."""
    part = token.split(".")[1]
    return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))


def header_of(token):
    part = token.split(".")[0]
    return json.loads(base64.urlsafe_b64decode(part + "=" * (-len(part) % 4)))


# ---- the connector ----

_bearer = contextvars.ContextVar("bearer", default=None)


class Verifier:
    """Checks a bearer against the project's JWKS: signature, issuer, audience, expiry, role and a client_id claim, so
    only a token the OAuth server issued to a client passes, never a planner session."""

    def __init__(self, issuer):
        import jwt
        self.jwt = jwt
        self.issuer = issuer
        self.jwks = jwt.PyJWKClient(issuer + "/.well-known/jwks.json", cache_keys=True)
        self.last_error = None

    def verify(self, token):
        try:
            key = self.jwks.get_signing_key_from_jwt(token)
            c = self.jwt.decode(token, key.key, algorithms=["ES256", "RS256"], audience="authenticated", issuer=self.issuer,
                                options={"require": ["exp", "iat", "sub", "iss", "aud"]})
        except Exception as e:  # noqa: BLE001  any failure is a refusal
            self.last_error = type(e).__name__
            return None
        if c.get("role") != "authenticated":
            self.last_error = "role"
            return None
        if not c.get("client_id"):
            self.last_error = "no_client_id"
            return None
        self.last_error = None
        return c


def user_core(url, publishable, token, uid):
    """A Core on PostgREST as the user: the publishable key as apikey and the user's bearer, so RLS holds every call."""
    import tripdb, tripdb_store
    from latam_trip_mcp import core as mcp_core

    class UserRest(tripdb_store.Rest):
        def _call(self, method, path, body=None, headers=None, raw=None, retry=False):
            h = {"Authorization": "Bearer " + token}
            h.update(headers or {})
            return super()._call(method, path, body, h, raw, retry)

    store = tripdb_store.SupabaseStore.__new__(tripdb_store.SupabaseStore)
    store.paths = tripdb.Paths(ROOT)
    store.rest = UserRest(url, publishable)
    store._owner = uid
    return mcp_core.Core(store, owner=uid)


def build_connector(env, verifier, port):
    from latam_trip_mcp import server

    base = f"http://127.0.0.1:{port}"
    issuer = verifier.issuer
    prm = {"resource": base + "/mcp", "authorization_servers": [issuer], "scopes_supported": ["email"],
           "bearer_methods_supported": ["header"], "resource_name": "latam-trip (spike)"}

    def core_fn():
        token, uid = _bearer.get()
        return user_core(env["SUPABASE_URL"], env["SUPABASE_PUBLISHABLE_KEY"], token, uid)

    inner = server.build_mcp(core_fn).http_app(path="/mcp", stateless_http=True)
    meta_url = base + "/.well-known/oauth-protected-resource/mcp"

    async def send_json(send, status, payload, extra=()):
        await send({"type": "http.response.start", "status": status,
                    "headers": [(b"content-type", b"application/json"), *extra]})
        await send({"type": "http.response.body", "body": json.dumps(payload).encode()})

    async def app(scope, receive, send):
        if scope["type"] == "lifespan":
            return await inner(scope, receive, send)
        if scope["type"] != "http":
            return await inner(scope, receive, send)
        path = scope.get("path", "")
        if path.startswith("/.well-known/oauth-protected-resource"):
            return await send_json(send, 200, prm)
        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        given = headers.get("authorization", "")
        token = given[7:].strip() if given.lower().startswith("bearer ") else ""
        claims = verifier.verify(token) if token else None
        if not claims:
            challenge = f'Bearer resource_metadata="{meta_url}"'
            if token:
                challenge += ', error="invalid_token"'
            return await send_json(send, 401, {"error": "unauthorized"}, [(b"www-authenticate", challenge.encode())])
        _bearer.set((token, claims["sub"]))
        await inner(scope, receive, send)

    return app, base


def serve(app, port):
    import uvicorn
    srv = uvicorn.Server(uvicorn.Config(app, host="127.0.0.1", port=port, log_level=os.environ.get("SPIKE_LOG", "warning"), lifespan="on"))
    t = threading.Thread(target=srv.run, daemon=True)
    t.start()
    for _ in range(400):
        if not t.is_alive():
            break
        if srv.started:
            return srv
        time.sleep(0.05)
    raise SystemExit("the connector did not start")


def free_port():
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    return port


# ---- the MCP client ----

def mcp_call(base, method, params, bearer=None, rid=1):
    h = {"Accept": "application/json, text/event-stream", "MCP-Protocol-Version": "2025-06-18"}
    if bearer:
        h["Authorization"] = "Bearer " + bearer
    status, hdrs, body = req("POST", base + "/mcp", h, {"jsonrpc": "2.0", "id": rid, "method": method, "params": params})
    if isinstance(body, str) and "data:" in body:
        datas = [ln[5:].strip() for ln in body.splitlines() if ln.startswith("data:")]
        body = json.loads(datas[-1]) if datas else body
    return status, hdrs, body


def list_trip_ids(base, bearer):
    status, _, body = mcp_call(base, "tools/call", {"name": "list_trip", "arguments": {}}, bearer, rid=2)
    if status != 200 or not isinstance(body, dict) or "result" not in body:
        return status, None, body
    res = body["result"]
    if res.get("isError"):
        return status, None, res
    text = res["content"][0]["text"]
    out = json.loads(text)
    rows = out if isinstance(out, list) else out.get("rows") or out.get("items") or out.get("result") or []
    return status, sorted({r.get("id") for r in rows if isinstance(r, dict)}), None


def parse_challenge(value):
    out = {}
    for part in value[len("Bearer "):].split(","):
        if "=" in part:
            k, v = part.strip().split("=", 1)
            out[k] = v.strip('"')
    return out


def discover_as(issuer):
    """The authorization server metadata, tried in the order of the MCP spec 2025-11-25 for an issuer with a path."""
    u = urllib.parse.urlsplit(issuer)
    origin, path = f"{u.scheme}://{u.netloc}", u.path.rstrip("/")
    tries = [origin + "/.well-known/oauth-authorization-server" + path,
             origin + "/.well-known/openid-configuration" + path,
             origin + path + "/.well-known/openid-configuration"]
    seen = []
    for url in tries:
        status, _, body = req("GET", url)
        seen.append({"url": url.replace(origin, ""), "status": status})
        if status == 200 and isinstance(body, dict) and body.get("issuer") == issuer:
            return body, seen
    return None, seen


def pkce():
    verifier = b64url(secrets.token_bytes(32))
    return verifier, b64url(hashlib.sha256(verifier.encode()).digest())


def register(meta, redirect_uris, name="Claude"):
    return req("POST", meta["registration_endpoint"], body={
        "client_name": name, "redirect_uris": list(redirect_uris), "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"], "token_endpoint_auth_method": "none"})


def authorize(meta, client_id, redirect_uri, scope, resource, challenge, state):
    q = {"response_type": "code", "client_id": client_id, "redirect_uri": redirect_uri, "code_challenge": challenge,
         "code_challenge_method": "S256", "state": state}
    if scope is not None:
        q["scope"] = scope
    if resource is not None:
        q["resource"] = resource
    return req("GET", meta["authorization_endpoint"] + "?" + urllib.parse.urlencode(q))


def authorization_id_of(location):
    return (urllib.parse.parse_qs(urllib.parse.urlsplit(location).query).get("authorization_id") or [None])[0]


def consent(env, user_token, auth_id, action="approve"):
    """The planner's consent route, played here: the signed in user reads the request and answers it. When the user
    already granted this client these scopes, the GET answers with redirect_url at once and there is nothing to answer."""
    base = env["SUPABASE_URL"].rstrip("/") + "/auth/v1/oauth/authorizations/" + auth_id
    h = {"apikey": env["SUPABASE_PUBLISHABLE_KEY"], "Authorization": "Bearer " + user_token}
    s1, _, details = req("GET", base, h)
    if isinstance(details, dict) and details.get("redirect_url") and not details.get("authorization_id"):
        return s1, details, None, details
    s2, _, answer = req("POST", base + "/consent", h, {"action": action})
    return s1, details, s2, answer


def token(meta, form):
    return req("POST", meta["token_endpoint"], {"Accept": "application/json"}, form=form)


def full_flow(env, meta, client_id, redirect_uri, scope, resource, user):
    """authorize, consent by user, exchange. (tokens or None, evidence dict)."""
    verifier, challenge = pkce()
    state = b64url(secrets.token_bytes(16))
    s, h, body = authorize(meta, client_id, redirect_uri, scope, resource, challenge, state)
    ev = {"authorize_status": s}
    loc = h.get("location", "")
    auth_id = authorization_id_of(loc)
    if s not in (302, 303) or not auth_id:
        ev["authorize_body"] = body if isinstance(body, dict) else str(body)[:200]
        ev["location_has_error"] = "error=" in loc
        if "error=" in loc:
            q = urllib.parse.parse_qs(urllib.parse.urlsplit(loc).query)
            ev["error"] = q.get("error", [None])[0]
            ev["error_description"] = q.get("error_description", [None])[0]
        return None, ev
    ev["consent_url_path"] = urllib.parse.urlsplit(loc).path
    s1, details, s2, answer = consent(env, user.token, auth_id)
    ev.update(details_status=s1, approve_status=s2, auto_approved=s2 is None)
    if isinstance(details, dict):
        ev["details_keys"] = sorted(details)
        ev["details_scope"] = details.get("scope")
        ev["details_redirect_uri"] = details.get("redirect_uri")
        ev["details_client_name"] = (details.get("client") or {}).get("client_name") or (details.get("client") or {}).get("name")
    redirect = (answer or {}).get("redirect_url") or (answer or {}).get("redirect_to") if isinstance(answer, dict) else None
    if not redirect:
        ev["approve_body"] = answer
        return None, ev
    q = urllib.parse.parse_qs(urllib.parse.urlsplit(redirect).query)
    ev["redirect_target"] = redirect.split("?")[0]
    ev["state_matches"] = q.get("state", [None])[0] == state
    code = q.get("code", [None])[0]
    if not code:
        ev["redirect_error"] = q.get("error", [None])[0]
        return None, ev
    form = {"grant_type": "authorization_code", "code": code, "redirect_uri": redirect_uri, "client_id": client_id,
            "code_verifier": verifier}
    if resource is not None:
        form["resource"] = resource
    s, _, tok = token(meta, form)
    ev["token_status"] = s
    if s != 200:
        ev["token_body"] = tok
        return None, ev
    ev["token_keys"] = sorted(tok)
    ev["refresh_token_given"] = bool(tok.get("refresh_token"))
    ev["code"], ev["verifier"] = code, verifier  # used by the caller, removed before printing
    return tok, ev


def err(body):
    """The error name of an auth answer, whichever field it is in."""
    if not isinstance(body, dict):
        return body
    return body.get("error") or body.get("error_code") or body.get("msg")


def clean(ev):
    return {k: v for k, v in ev.items() if k not in ("code", "verifier")}


# ---- the run ----

def seed(env, a, b):
    for u, tid, name in ((a, "TEST01-oauth-a", "TEST01 spike A"), (b, "TEST01-oauth-b", "TEST01 spike B")):
        data = {"id": tid, "version": 1, "name": name, "saved_at": "2026-11-06T00:00:00Z", "by": "migration",
                "why": "TEST01 OAuth spike", "way_in": {}, "way_home": {}, "places": []}
        s, body = u.rest.insert("trips", [{"id": tid, "version": 1, "data": data}],
                                on_conflict="owner_id,id,version", resolution="merge-duplicates")
        if s not in (200, 201):
            raise SystemExit(f"seeding a trip gave {s}: {body}")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--wait-expiry", action="store_true", help="wait for the access token to expire, then refresh")
    ap.add_argument("--out", help="write the results as JSON to this file, outside the repo")
    args = ap.parse_args()
    if not os.environ.get("TRIPDB_ENV_FILE"):
        raise SystemExit("set TRIPDB_ENV_FILE to the file supabase/local_up.sh wrote")
    if args.out and os.path.abspath(args.out).startswith(ROOT):
        raise SystemExit("--out must be outside the repo")
    env = migrate.load_env()
    users.refuse(env)
    issuer = env["SUPABASE_URL"].rstrip("/") + "/auth/v1"

    a, b = users.make_user(env, "oauth-a"), users.make_user(env, "oauth-b")
    seed(env, a, b)
    verifier = Verifier(issuer)
    port = free_port()
    app, base = build_connector(env, verifier, port)
    srv = serve(app, port)
    resource = base + "/mcp"

    # 1 discovery
    s, h, _ = mcp_call(base, "initialize", {"protocolVersion": "2025-06-18", "capabilities": {},
                                            "clientInfo": {"name": "spike", "version": "0"}})
    ch = parse_challenge(h.get("www-authenticate", "Bearer "))
    record("1a 401 with resource_metadata", s == 401 and "resource_metadata" in ch, status=s, challenge_keys=sorted(ch))
    s, _, prm = req("GET", ch["resource_metadata"])
    as_url = (prm or {}).get("authorization_servers", [None])[0]
    other_origin = urllib.parse.urlsplit(as_url).netloc != urllib.parse.urlsplit(base).netloc
    record("1b protected resource metadata names Supabase on another origin", s == 200 and prm.get("resource") == resource
           and other_origin, status=s, authorization_server=as_url, connector_origin=urllib.parse.urlsplit(base).netloc)
    meta, seen = discover_as(as_url)
    record("1c authorization server metadata found by the MCP 2025-11-25 order", meta is not None, tried=seen)
    if not meta:
        return finish(args, srv)
    record("1d metadata has S256, a registration endpoint and form token auth none",
           "S256" in meta.get("code_challenge_methods_supported", []) and bool(meta.get("registration_endpoint"))
           and "none" in meta.get("token_endpoint_auth_methods_supported", []),
           code_challenge_methods=meta.get("code_challenge_methods_supported"),
           scopes_supported=meta.get("scopes_supported"),
           cimd=meta.get("client_id_metadata_document_supported", False),
           registration_endpoint=meta.get("registration_endpoint", "").replace(env["SUPABASE_URL"].rstrip("/"), ""))
    rfc8414_2025_06 = req("GET", urllib.parse.urlsplit(as_url)._replace(path="/.well-known/oauth-authorization-server" +
                                                                        urllib.parse.urlsplit(as_url).path).geturl())[0]
    note("1e RFC 8414 path insertion alone, as a 2025-06-18 client tries first", status=rfc8414_2025_06)

    # 2 dynamic registration, as claude.ai
    s, _, client = register(meta, (CLAUDE_CALLBACK, *LOOPBACK))
    client_id = (client or {}).get("client_id") if isinstance(client, dict) else None
    record("2 dynamic client registration with Claude's callback and loopback", s in (200, 201) and bool(client_id),
           status=s, returned_keys=sorted(client) if isinstance(client, dict) else client,
           auth_method=(client or {}).get("token_endpoint_auth_method") if isinstance(client, dict) else None)
    if not client_id:
        return finish(args, srv)

    # 3 PKCE authorize, consent by A, token exchange, with resource and the scopes Claude would ask for
    scope = " ".join(prm["scopes_supported"] + (["offline_access"] if "offline_access" in meta.get("scopes_supported", []) else []))
    tok, ev = full_flow(env, meta, client_id, CLAUDE_CALLBACK, scope, resource, a)
    record("3 PKCE authorize, consent and token exchange with resource", tok is not None, scope_asked=scope, **clean(ev))
    if not tok:
        return finish(args, srv)
    s, _, again = token(meta, {"grant_type": "authorization_code", "code": ev["code"], "redirect_uri": CLAUDE_CALLBACK,
                               "client_id": client_id, "code_verifier": ev["verifier"], "resource": resource})
    record("3b a used code is refused", s >= 400, status=s, error=(again or {}).get("error") if isinstance(again, dict) else again)
    access, refresh = tok["access_token"], tok.get("refresh_token")
    c, hd = claims_of(access), header_of(access)
    record("3c the access token is A's and names the client", c.get("sub") == a.id and c.get("client_id") == client_id,
           alg=hd.get("alg"), kid_in_jwks=bool(hd.get("kid")), aud=c.get("aud"), iss=c.get("iss"), role=c.get("role"),
           scope=c.get("scope"), claim_names=sorted(c), expires_in=tok.get("expires_in"),
           resource_in_aud=resource in (c.get("aud") if isinstance(c.get("aud"), list) else [c.get("aud")]))

    # 4 the connector verifies the bearer against the JWKS and answers list_trip as A
    s, ids, err = list_trip_ids(base, access)
    record("4a connector verifies against the JWKS and list_trip runs as A", s == 200 and ids is not None
           and "TEST01-oauth-a" in ids and "TEST01-oauth-b" not in ids,
           status=s, trip_ids=ids, error=err, verify_error=verifier.last_error)
    s, _, _ = mcp_call(base, "tools/list", {}, a.token)
    record("4b a planner session token without client_id is refused by the connector", s == 401, status=s,
           verify_error=verifier.last_error)
    forged = access[:-4] + ("AAAA" if not access.endswith("AAAA") else "BBBB")
    s, _, _ = mcp_call(base, "tools/list", {}, forged)
    record("4c a token with a broken signature is refused", s == 401, status=s, verify_error=verifier.last_error)

    # 5 PostgREST with that bearer sees only A's rows
    rest_a = users.Rest(env["SUPABASE_URL"], env["SUPABASE_PUBLISHABLE_KEY"], access)
    s, rows = rest_a.select("trips", "select=id&id=like.TEST01-oauth-*")
    svc_s, svc_rows = users.service(env).select("trips", "select=id&id=like.TEST01-oauth-*")
    got = sorted({r["id"] for r in rows}) if s == 200 else rows
    record("5 PostgREST with the OAuth bearer returns only A's rows", s == 200 and got == ["TEST01-oauth-a"]
           and {"TEST01-oauth-a", "TEST01-oauth-b"} <= {r["id"] for r in svc_rows},
           status=s, rows_seen=got, rows_in_table=sorted({r["id"] for r in svc_rows}) if svc_s == 200 else svc_s)

    # 6 refresh, rotation, and the old refresh token
    if refresh:
        s, _, t2 = token(meta, {"grant_type": "refresh_token", "refresh_token": refresh, "client_id": client_id,
                                "resource": resource})
        ok = s == 200 and isinstance(t2, dict) and t2.get("access_token")
        record("6a refresh before expiry gives a new access token and a rotated refresh token", ok and
               t2.get("refresh_token") not in (None, refresh), status=s,
               keys=sorted(t2) if isinstance(t2, dict) else t2)
        if ok:
            c2 = claims_of(t2["access_token"])
            record("6b the refreshed token keeps the user and the client", c2.get("sub") == a.id and c2.get("client_id") == client_id,
                   same_session=c2.get("session_id") == c.get("session_id"))
            # GoTrue lets the parent of an unused active token through, for a client that lost a refresh answer
            s, _, t3 = token(meta, {"grant_type": "refresh_token", "refresh_token": refresh, "client_id": client_id})
            note("6c the parent of an unused refresh token, replayed at once", status=s,
                 same_refresh_returned=isinstance(t3, dict) and t3.get("refresh_token") == t2["refresh_token"])
            s, _, t4 = token(meta, {"grant_type": "refresh_token", "refresh_token": t2["refresh_token"], "client_id": client_id})
            time.sleep(12)  # past the default refresh_token_reuse_interval of 10 s
            s5, _, t5 = token(meta, {"grant_type": "refresh_token", "refresh_token": refresh, "client_id": client_id})
            record("6d a refresh token two rotations old is refused after the reuse window", s == 200 and s5 >= 400,
                   rotate_status=s, replay_status=s5, error=err(t5))
            s6, _, t6 = token(meta, {"grant_type": "refresh_token", "refresh_token": (t4 or {}).get("refresh_token", ""),
                                     "client_id": client_id})
            note("6e the newest refresh token after that replay, so the family was revoked or not", status=s6,
                 error=err(t6))
    else:
        record("6a refresh token issued", False, scope_asked=scope)

    probes(env, meta, client_id, resource, a, b)

    if args.wait_expiry:
        expiry_leg(env, meta, base, resource, a)
    else:
        note("7 refresh after expiry", skipped="run with --wait-expiry", expires_in=tok.get("expires_in"))
    return finish(args, srv)


def expiry_leg(env, meta, base, resource, a):
    """A fresh grant, wait past exp, then the old token is refused everywhere and the refresh works."""
    s, _, client = register(meta, (CLAUDE_CALLBACK,))
    cid = client["client_id"]
    tok, ev = full_flow(env, meta, cid, CLAUDE_CALLBACK, "email offline_access", resource, a)
    if not tok:
        return record("7 refresh after expiry", False, **clean(ev))
    exp = claims_of(tok["access_token"])["exp"]
    wait = max(0, exp - time.time()) + 5
    print(f"waiting {int(wait)} s for the access token to expire")
    time.sleep(wait)
    s1, _, _ = list_trip_ids(base, tok["access_token"])
    s2, _ = users.Rest(env["SUPABASE_URL"], env["SUPABASE_PUBLISHABLE_KEY"], tok["access_token"]).select("trips", "select=id&limit=1")
    s, _, t2 = token(meta, {"grant_type": "refresh_token", "refresh_token": tok["refresh_token"], "client_id": cid,
                            "resource": resource})
    new = t2.get("access_token") if isinstance(t2, dict) else None
    s3, ids, _ = list_trip_ids(base, new) if new else (None, None, None)
    record("7 refresh after expiry", s1 == 401 and s2 == 401 and s == 200 and s3 == 200 and ids is not None
           and "TEST01-oauth-a" in ids and "TEST01-oauth-b" not in ids,
           connector_on_expired=s1, postgrest_on_expired=s2, refresh_status=s, connector_after_refresh=s3, trip_ids=ids)


def probes(env, meta, client_id, resource, a, b):
    """What Claude's other choices meet at Supabase. Notes, not the pass criterion."""
    # scope the current oauth.py advertises
    _, ev = full_flow(env, meta, client_id, CLAUDE_CALLBACK, "mcp", resource, a)
    note("P1 scope mcp", **clean(ev))
    # no scope at all
    tok, ev = full_flow(env, meta, client_id, CLAUDE_CALLBACK, None, resource, a)
    note("P2 no scope", refresh=bool(tok and tok.get("refresh_token")),
         token_scope=claims_of(tok["access_token"]).get("scope") if tok else None, **clean(ev))
    # email without offline_access
    tok, ev = full_flow(env, meta, client_id, CLAUDE_CALLBACK, "email", resource, a)
    note("P3 scope email only", refresh=bool(tok and tok.get("refresh_token")), **clean(ev))
    # no resource parameter
    tok, ev = full_flow(env, meta, client_id, CLAUDE_CALLBACK, "email", None, a)
    note("P4 no resource parameter", ok=tok is not None, aud=claims_of(tok["access_token"]).get("aud") if tok else None, **clean(ev))
    # a resource on another server
    tok, ev = full_flow(env, meta, client_id, CLAUDE_CALLBACK, "email", "https://elsewhere.example/mcp", a)
    note("P5 resource of another server", ok=tok is not None, aud=claims_of(tok["access_token"]).get("aud") if tok else None,
         **clean(ev))
    # Claude Code's loopback on a port that was not registered
    _, ev = full_flow(env, meta, client_id, "http://localhost:3118/callback", "email", resource, a)
    note("P6 loopback redirect with a port, registered without one", **clean(ev))
    s, _, c2 = register(meta, ("http://localhost:3118/callback",))
    note("P6b loopback redirect with a port, registered with it", register_status=s)
    # another person answers a request A already opened, on a fresh client so A meets the consent step
    _, _, fresh = register(meta, (CLAUDE_CALLBACK,))
    verifier, challenge = pkce()
    s, h, _ = authorize(meta, fresh["client_id"], CLAUDE_CALLBACK, "email", resource, challenge, "x")
    auth_id = authorization_id_of(h.get("location", ""))
    base = env["SUPABASE_URL"].rstrip("/") + "/auth/v1/oauth/authorizations/" + auth_id
    ha = {"apikey": env["SUPABASE_PUBLISHABLE_KEY"], "Authorization": "Bearer " + a.token}
    hb = {"apikey": env["SUPABASE_PUBLISHABLE_KEY"], "Authorization": "Bearer " + b.token}
    sa, _, _ = req("GET", base, ha)
    sb, _, bb = req("POST", base + "/consent", hb, {"action": "approve"})
    note("P7 B approves a request A opened", a_details=sa, b_approve=sb,
         b_error=bb.get("error_code") or bb.get("code") or bb.get("msg") if isinstance(bb, dict) else bb)
    # a request nobody opened yet, approved by B: the consent phishing case
    _, ev = full_flow(env, meta, client_id, CLAUDE_CALLBACK, "email", resource, b)
    note("P8 B approves a request someone else started, never opened", ok="token_status" in ev and ev["token_status"] == 200,
         **clean(ev))
    # a client name that pretends to be Claude, with a redirect elsewhere
    s, _, evil = register(meta, ("https://attacker.example/cb",), name="Claude")
    note("P9 DCR accepts any redirect host and any client name", register_status=s)


def finish(args, srv):
    srv.should_exit = True
    graded = [r for r in RESULTS if r["pass"] is not None]
    verdict = all(r["pass"] for r in graded) and bool(graded)
    print(("VERDICT PASS" if verdict else "VERDICT FAIL") + f" ({sum(r['pass'] for r in graded)} of {len(graded)} checks)")
    if args.out:
        with open(args.out, "w", encoding="utf-8") as f:
            json.dump({"verdict": verdict, "results": RESULTS}, f, indent=2, default=str)
    return 0 if verdict else 1


if __name__ == "__main__":
    sys.exit(main())
