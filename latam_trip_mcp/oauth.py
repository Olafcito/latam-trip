"""A minimal OAuth 2.1 server for the latam-trip connector, after the Arte Suave connector.

There is one owner. A client registers and sends Simon to /authorize, which starts a flow and offers to email him the
app's own Supabase sign in link. The link opens the planner with ?connect=<flow>, on any device, where he allows the client.
The planner posts his Supabase session to /signin/approve, which checks it with Supabase auth and the admins table. The
authorize page polls /signin/status and goes on to the client with a code once the flow is approved. A passphrase, compared
in constant time with the SecureString parameter named by LATAMTRIP_PASSPHRASE_PARAM, stays as a fallback for when email
is slow. The client trades the code at /token for a bearer, with PKCE. Flows, codes, tokens and refresh tokens live hashed in
a DynamoDB table with a ttl. Nothing here logs or returns a secret.
"""
from __future__ import annotations

import base64, hashlib, hmac, json, os, secrets, time, urllib.parse

ACCESS_PREFIX = "lt_at_"
REFRESH_PREFIX = "lt_rt_"
CODE_PREFIX = "lt_ac_"
CLIENT_PREFIX = "lt_cl_"
FLOW_PREFIX = "lt_fl_"
CODE_TTL = 300
FLOW_TTL = 600
ACCESS_TTL = 30 * 24 * 3600
REFRESH_TTL = 180 * 24 * 3600
TRIES, WINDOW = 5, 300

FORWARD = ("client_id", "redirect_uri", "state", "code_challenge", "code_challenge_method", "scope", "resource")
_cache: dict = {}
_table_ref = None
_pass_ref = None
_owner_email = None


def enabled():
    return bool(os.environ.get("LATAMTRIP_SESSION_TABLE"))


def _table():
    global _table_ref
    if _table_ref is None:
        import boto3
        _table_ref = boto3.resource("dynamodb").Table(os.environ["LATAMTRIP_SESSION_TABLE"])
    return _table_ref


def _get(pk):
    return _table().get_item(Key={"pk": pk}).get("Item")


def _put(item):
    _table().put_item(Item=item)


def _delete(pk):
    _table().delete_item(Key={"pk": pk})


def _now():
    return int(time.time())


def _sha(v):
    return hashlib.sha256(v.encode()).hexdigest()


def _b64(b):
    return base64.urlsafe_b64encode(b).rstrip(b"=").decode()


def passphrase():
    global _pass_ref
    if _pass_ref is None:
        import boto3
        _pass_ref = boto3.client("ssm").get_parameter(Name=os.environ["LATAMTRIP_PASSPHRASE_PARAM"], WithDecryption=True)["Parameter"]["Value"]
    return _pass_ref


def load_supabase_env():
    """SUPABASE_URL and SUPABASE_SECRET_KEY, read from SSM when the environment does not hold them."""
    for env, param in (("SUPABASE_URL", "LATAMTRIP_URL_PARAM"), ("SUPABASE_SECRET_KEY", "LATAMTRIP_KEY_PARAM")):
        if not os.environ.get(env) and os.environ.get(param):
            import boto3
            os.environ[env] = boto3.client("ssm").get_parameter(Name=os.environ[param], WithDecryption=True)["Parameter"]["Value"]
    return os.environ["SUPABASE_URL"].rstrip("/"), os.environ["SUPABASE_SECRET_KEY"]


def _supa(method, path, body=None, bearer=None):
    """(status, parsed body) of a call to the Supabase project. bearer is a user's access token, else the secret key."""
    import urllib.error, urllib.request
    url, key = load_supabase_env()
    headers = {"apikey": key, "Authorization": f"Bearer {bearer or key}", "Content-Type": "application/json"}
    data = None if body is None else json.dumps(body).encode()
    req = urllib.request.Request(url + path, method=method, headers=headers, data=data)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            text = r.read().decode()
            return r.status, (json.loads(text) if text else None)
    except urllib.error.HTTPError as e:
        e.close()
        return e.code, None


def owner_email():
    """The address of the one owner, from the admins table and Supabase auth. It is never typed and never shown in full."""
    global _owner_email
    if _owner_email is None:
        code, rows = _supa("GET", "/rest/v1/admins?select=user_id&limit=1")
        if code != 200 or not rows:
            raise RuntimeError("no owner in the admins table")
        code, user = _supa("GET", f"/auth/v1/admin/users/{rows[0]['user_id']}")
        if code != 200 or not (user or {}).get("email"):
            raise RuntimeError("the owner has no email in Supabase auth")
        _owner_email = user["email"]
    return _owner_email


def masked(email):
    local, _, domain = (email or "").partition("@")
    return f"{local[:2]}…@{domain}" if domain else ""


def _send_link(redirect_to):
    """Supabase emails the owner its usual magic link, which signs in and lands on redirect_to."""
    code, _ = _supa("POST", "/auth/v1/otp?" + urllib.parse.urlencode({"redirect_to": redirect_to}),
                    {"email": owner_email(), "create_user": False})
    if code not in (200, 204):
        raise RuntimeError(f"Supabase did not send the link ({code})")


def _user_of(token):
    """The Supabase user id an access token belongs to, or None."""
    if not token:
        return None
    code, user = _supa("GET", "/auth/v1/user", bearer=token)
    return (user or {}).get("id") if code == 200 else None


def _is_owner(uid):
    code, rows = _supa("GET", f"/rest/v1/admins?select=user_id&user_id=eq.{urllib.parse.quote(uid)}")
    return code == 200 and bool(rows)


def check_passphrase(given):
    return bool(given) and hmac.compare_digest(hashlib.sha256(given.encode()).digest(), hashlib.sha256(passphrase().encode()).digest())


def too_many():
    """Counts wrong passphrases and link requests in a window, so the page cannot be guessed at or flood the inbox."""
    item = _get("oauth:tries") or {}
    return int(item.get("n", 0)) >= TRIES and int(item.get("ttl", 0)) > _now()


def count_miss():
    item = _get("oauth:tries") or {}
    n = int(item.get("n", 0)) + 1 if int(item.get("ttl", 0)) > _now() else 1
    _put({"pk": "oauth:tries", "n": n, "ttl": _now() + WINDOW})


def _flow_key(fid):
    return f"oauth:flow:{_sha(fid)}"


def _flow(fid):
    item = _get(_flow_key(fid)) if fid else None
    return item if item and int(item.get("ttl", 0)) >= _now() else None


def start_flow(params):
    """A sign in waiting for the owner, holding what /authorize was asked. Its id goes in the email link and the page."""
    fid = FLOW_PREFIX + secrets.token_urlsafe(24)
    _put({"pk": _flow_key(fid), "params": {k: params.get(k, "") for k in FORWARD}, "state": "waiting", "ttl": _now() + FLOW_TTL})
    return fid


def email_link(fid, app_url):
    """Email the owner a sign in link to the app for this flow. False when the flow is gone or there were too many tries."""
    if too_many():
        return False
    count_miss()
    if not _flow(fid):
        return False
    _send_link(f"{app_url.rstrip('/')}/?connect={fid}")
    return True


def flow_info(fid):
    """Who is asking, for the app's allow screen. Nothing secret."""
    item = _flow(fid)
    if not item:
        return None
    params = item["params"]
    client = get_client(params.get("client_id")) or {}
    return {"client": client.get("client_name") or "An app", "host": urllib.parse.urlsplit(params.get("redirect_uri", "")).netloc}


def approve_flow(fid, token):
    """The owner allows the flow from the app, with the app's own Supabase session."""
    item = _flow(fid)
    if not item or item.get("state") != "waiting":
        return False
    uid = _user_of(token)
    if not uid or not _is_owner(uid):
        return False
    _put({**item, "state": "approved"})
    return True


def flow_status(fid):
    """waiting, done with the client's redirect (handed out once), or gone."""
    item = _flow(fid)
    if not item:
        return {"state": "gone"}
    if item.get("state") != "approved":
        return {"state": "waiting"}
    _delete(_flow_key(fid))
    return {"state": "done", "redirect": _code_redirect(item["params"])}


def _code_redirect(params):
    q = {"code": create_code(params["client_id"], params["redirect_uri"], params["code_challenge"])}
    if params.get("state"):
        q["state"] = params["state"]
    return f"{params['redirect_uri']}?{urllib.parse.urlencode(q)}"


def register_client(redirect_uris, name):
    cid = CLIENT_PREFIX + secrets.token_hex(16)
    _put({"pk": f"oauth:client:{cid}", "redirect_uris": redirect_uris, "client_name": name or "", "created_at": _now()})
    return {"client_id": cid, "client_id_issued_at": _now(), "redirect_uris": redirect_uris, "client_name": name or "",
            "token_endpoint_auth_method": "none", "grant_types": ["authorization_code", "refresh_token"], "response_types": ["code"]}


def get_client(cid):
    return _get(f"oauth:client:{cid}") if cid else None


def create_code(cid, redirect_uri, challenge):
    code = CODE_PREFIX + secrets.token_urlsafe(24)
    _put({"pk": f"oauth:code:{_sha(code)}", "client_id": cid, "redirect_uri": redirect_uri, "code_challenge": challenge, "ttl": _now() + CODE_TTL})
    return code


def consume_code(code):
    if not code:
        return None
    item = _get(f"oauth:code:{_sha(code)}")
    if not item:
        return None
    _delete(f"oauth:code:{_sha(code)}")
    return item if int(item.get("ttl", 0)) >= _now() else None


def _new_access():
    access = ACCESS_PREFIX + secrets.token_urlsafe(32)
    _put({"pk": f"oauth:token:{_sha(access)}", "ttl": _now() + ACCESS_TTL})
    return access


def issue_tokens(client_id=""):
    refresh = REFRESH_PREFIX + secrets.token_urlsafe(32)
    _put({"pk": f"oauth:refresh:{_sha(refresh)}", "client_id": client_id, "ttl": _now() + REFRESH_TTL})
    return _new_access(), refresh, ACCESS_TTL


def refresh_access(refresh, client_id=""):
    """Trade a refresh token for a new access token and a new refresh token. The old one stops working, and it only
    works for the client it was issued to."""
    if not refresh or not refresh.startswith(REFRESH_PREFIX):
        return None
    item = _get(f"oauth:refresh:{_sha(refresh)}")
    if not item or int(item.get("ttl", 0)) < _now():
        return None
    if item.get("client_id") and item["client_id"] != client_id:
        return None
    _delete(f"oauth:refresh:{_sha(refresh)}")
    access, new_refresh, exp = issue_tokens(item.get("client_id", ""))
    return access, exp, new_refresh


def resolve_access_token(token):
    if not token or not token.startswith(ACCESS_PREFIX):
        return False
    key, now = _sha(token), time.monotonic()
    hit = _cache.get(key)
    if hit and hit[1] > now:
        return hit[0]
    item = _get(f"oauth:token:{key}")
    ok = bool(item and int(item.get("ttl", 0)) >= _now())
    _cache[key] = (ok, now + 60.0)
    return ok


def verify_pkce(verifier, challenge):
    if not verifier or not challenge:
        return False
    return hmac.compare_digest(_b64(hashlib.sha256(verifier.encode()).digest()), challenge)


AS_PATH, PR_PATH, OIDC_PATH = "/.well-known/oauth-authorization-server", "/.well-known/oauth-protected-resource", "/.well-known/openid-configuration"


def is_oauth_path(path):
    return (path.startswith(AS_PATH) or path.startswith(PR_PATH) or path == OIDC_PATH or path.startswith("/signin/")
            or path in ("/register", "/authorize", "/token"))


def protected_resource_metadata_url(base):
    return f"{base}{PR_PATH}/mcp"


async def _body(receive):
    out = b""
    while True:
        m = await receive()
        out += m.get("body", b"")
        if not m.get("more_body"):
            return out


CORS = {"access-control-allow-origin": "*", "access-control-allow-methods": "GET, POST, OPTIONS",
        "access-control-allow-headers": "content-type, authorization, mcp-protocol-version"}


async def _send(send, status, body, ctype, extra=None):
    headers = [(b"content-type", ctype.encode())] + [(k.encode(), v.encode()) for k, v in {**CORS, **(extra or {})}.items()]
    await send({"type": "http.response.start", "status": status, "headers": headers})
    await send({"type": "http.response.body", "body": body})


async def _json(send, status, payload, extra=None):
    await _send(send, status, json.dumps(payload).encode(), "application/json", extra)


async def _redirect(send, location):
    await _send(send, 302, b"", "text/plain; charset=utf-8", {"location": location})


def _as_meta(base):
    return {"issuer": base, "authorization_endpoint": f"{base}/authorize", "token_endpoint": f"{base}/token",
            "registration_endpoint": f"{base}/register", "response_types_supported": ["code"],
            "grant_types_supported": ["authorization_code", "refresh_token"], "code_challenge_methods_supported": ["S256"],
            "token_endpoint_auth_methods_supported": ["none"], "scopes_supported": ["mcp"]}


def _pr_meta(base):
    return {"resource": f"{base}/mcp", "authorization_servers": [base], "scopes_supported": ["mcp"], "bearer_methods_supported": ["header"]}


def _err_redirect(uri, state, error, desc):
    q = {"error": error, "error_description": desc}
    if state:
        q["state"] = state
    return f"{uri}?{urllib.parse.urlencode(q)}"


async def handle(scope, receive, send, base):
    method, path = scope.get("method", "GET").upper(), scope.get("path", "")
    query = urllib.parse.parse_qs(scope.get("query_string", b"").decode())
    if method == "OPTIONS":
        return await _send(send, 204, b"", "text/plain")
    if path.startswith(AS_PATH) or path == OIDC_PATH:
        return await _json(send, 200, _as_meta(base))
    if path.startswith(PR_PATH):
        return await _json(send, 200, _pr_meta(base))
    if path == "/register" and method == "POST":
        try:
            body = json.loads(await _body(receive) or b"{}")
        except ValueError:
            return await _json(send, 400, {"error": "invalid_client_metadata"})
        uris = body.get("redirect_uris") or []
        if not isinstance(uris, list) or not uris:
            return await _json(send, 400, {"error": "invalid_redirect_uri", "error_description": "redirect_uris required"})
        return await _json(send, 201, register_client(uris, body.get("client_name", "")))
    if path == "/authorize":
        return await _authorize(receive, send, method, query)
    if path == "/token" and method == "POST":
        return await _token(receive, send)
    if path.startswith("/signin/"):
        return await _signin(receive, send, method, path, query)
    await _json(send, 404, {"error": "not_found"})


def app_url():
    return os.environ.get("LATAMTRIP_APP_URL", "https://d15amu9hjiumbd.cloudfront.net").rstrip("/")


async def _signin(receive, send, method, path, query):
    nocache = {"cache-control": "no-store"}
    if method == "GET":
        fid = query.get("flow", [""])[0]
        if path == "/signin/status":
            return await _json(send, 200, flow_status(fid), nocache)
        if path == "/signin/flow":
            info = flow_info(fid)
            return await _json(send, 200 if info else 404, info or {"error": "gone"}, nocache)
    if method == "POST":
        try:
            body = json.loads(await _body(receive) or b"{}")
        except ValueError:
            body = {}
        fid = str(body.get("flow") or "")
        if path == "/signin/email":
            try:
                sent = email_link(fid, app_url())
            except RuntimeError:
                return await _json(send, 502, {"sent": False, "error": "The email could not be sent. Use the passphrase instead."}, nocache)
            if not sent:
                return await _json(send, 429 if too_many() else 404, {"sent": False, "error": "Too many tries, or the page is old. Reload it."}, nocache)
            return await _json(send, 200, {"sent": True}, nocache)
        if path == "/signin/approve":
            return await _json(send, 200, {"ok": approve_flow(fid, str(body.get("access_token") or ""))}, nocache)
    await _json(send, 404, {"error": "not_found"})


async def _authorize(receive, send, method, query):
    if method == "POST":
        form = urllib.parse.parse_qs((await _body(receive)).decode())
        params = {k: form.get(k, [""])[0] for k in (*FORWARD, "passphrase")}
    else:
        params = {k: query.get(k, [""])[0] for k in FORWARD}
    uri, state, challenge = params["redirect_uri"], params.get("state", ""), params.get("code_challenge", "")
    client = get_client(params["client_id"])
    if not client:
        return await _send(send, 400, b"Unknown client.", "text/plain; charset=utf-8")
    if uri not in (client.get("redirect_uris") or []):
        return await _send(send, 400, b"Invalid redirect_uri.", "text/plain; charset=utf-8")
    if params.get("code_challenge_method", "S256") != "S256" or not challenge:
        return await _redirect(send, _err_redirect(uri, state, "invalid_request", "PKCE S256 required"))
    try:
        email = masked(owner_email())
    except Exception:
        # without Supabase the passphrase still signs in
        email = ""

    def page(err=None):
        html = login_page(params, err, start_flow(params) if email else "", email)
        return _send(send, 200, html.encode(), "text/html; charset=utf-8", {"cache-control": "no-store"})
    if method == "GET":
        return await page()
    if too_many():
        return await page("Too many tries. Wait a few minutes.")
    if not check_passphrase(params.get("passphrase", "")):
        count_miss()
        return await page("That passphrase is not right.")
    await _redirect(send, _code_redirect(params))


async def _token(receive, send):
    form = urllib.parse.parse_qs((await _body(receive)).decode())
    f = lambda n: form.get(n, [""])[0]
    nocache = {"cache-control": "no-store"}
    grant = f("grant_type")
    if grant == "refresh_token":
        got = refresh_access(f("refresh_token"), f("client_id"))
        if not got:
            return await _json(send, 400, {"error": "invalid_grant"})
        return await _json(send, 200, {"access_token": got[0], "token_type": "Bearer", "expires_in": got[1], "refresh_token": got[2], "scope": "mcp"}, nocache)
    if grant != "authorization_code":
        return await _json(send, 400, {"error": "unsupported_grant_type"})
    bad = lambda d: _json(send, 400, {"error": "invalid_grant", "error_description": d})
    data = consume_code(f("code"))
    if not data:
        return await bad("bad or expired code")
    if f("client_id") and f("client_id") != data["client_id"]:
        return await bad("client mismatch")
    if f("redirect_uri") != data["redirect_uri"]:
        return await bad("redirect_uri mismatch")
    if not verify_pkce(f("code_verifier"), data["code_challenge"]):
        return await bad("PKCE verification failed")
    access, refresh, exp = issue_tokens(data["client_id"])
    await _json(send, 200, {"access_token": access, "token_type": "Bearer", "expires_in": exp, "refresh_token": refresh, "scope": "mcp"}, nocache)


def esc(v):
    return str(v).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


def login_page(params, error=None, flow="", email=""):
    hidden = "".join(f'<input type="hidden" name="{esc(k)}" value="{esc(params.get(k, ""))}">' for k in FORWARD)
    err = f'<p class="error">{esc(error)}</p>' if error else ""
    host = urllib.parse.urlsplit(params.get("redirect_uri", "")).netloc
    mail = f"""<p class="sub">We'll email a sign in link to <span style="white-space:nowrap">{esc(email)}</span>. Open it on any device and this page goes on by itself.</p>
<button type="button" id="send">Email me a sign in link</button>
<p class="note" id="note" role="status" aria-live="polite"></p>""" if flow and email else ""
    return f"""<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Connect Latam trip</title>
<style>
:root{{color-scheme:light dark}}*{{box-sizing:border-box}}
body{{margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:#10130f;color:#eef1ea;padding:24px}}
.card{{width:100%;max-width:380px;background:#181d16;border:1px solid #2a3126;border-radius:16px;padding:32px}}
h1{{font-size:1.25rem;margin:0 0 4px}}p.sub{{margin:0 0 20px;color:#a0aa98;font-size:.9rem;line-height:1.45}}
label{{display:block;font-size:.8rem;margin:16px 0 6px}}
input[type=password]{{width:100%;padding:11px 13px;border-radius:10px;border:1px solid #38412f;background:#10130f;color:#eef1ea;font-size:1rem}}
button{{width:100%;margin-top:4px;padding:12px;border:0;border-radius:10px;background:#5aa05a;color:#fff;font-size:1rem;font-weight:600;cursor:pointer}}
button:disabled{{opacity:.6;cursor:default}}
.note{{min-height:1.2em;margin:14px 0 0;font-size:.85rem;color:#c9d4c0;line-height:1.45}}
details{{margin-top:24px;border-top:1px solid #2a3126;padding-top:16px}}summary{{cursor:pointer;color:#a0aa98;font-size:.85rem}}
details button{{margin-top:16px;background:#2c3528}}
.error{{background:#3a1c18;border:1px solid #6a3029;color:#ffb9b0;padding:10px 12px;border-radius:10px;font-size:.85rem}}
</style></head><body>
<div class="card">
<h1>Connect Latam trip</h1><p class="sub">Sends you back to {esc(host)} when you're signed in.</p>
{err}{mail}
<details{"" if mail and not error else " open"}><summary>Use the passphrase instead</summary>
<form method="post" action="/authorize">{hidden}
<label for="p">Passphrase</label>
<input id="p" name="passphrase" type="password" required autocomplete="current-password">
<button type="submit">Sign in</button>
</form></details>
</div>
<script>
(() => {{
  const flow = {json.dumps(flow)}, send = document.getElementById('send'), note = document.getElementById('note')
  if (!flow || !send) return
  let until = 0
  const poll = async () => {{
    if (Date.now() > until) {{ note.textContent = 'The link has run out. Reload the page to get a new one.'; return }}
    try {{
      const r = await (await fetch('/signin/status?flow=' + encodeURIComponent(flow), {{ cache: 'no-store' }})).json()
      if (r.state === 'done') {{ note.textContent = 'Signed in. Going back now.'; location.href = r.redirect; return }}
      if (r.state === 'gone') {{ note.textContent = 'This sign in has run out. Reload the page to start again.'; return }}
    }} catch (e) {{}}
    setTimeout(poll, 2000)
  }}
  send.addEventListener('click', async () => {{
    send.disabled = true
    note.textContent = 'Sending'
    try {{
      const res = await fetch('/signin/email', {{ method: 'POST', headers: {{ 'content-type': 'application/json' }}, body: JSON.stringify({{ flow }}) }})
      const r = await res.json()
      if (!r.sent) {{ note.textContent = r.error || 'The link could not be sent.'; send.disabled = false; return }}
      note.textContent = 'Sent. Open the email, press the link and allow the connection. This page waits for you.'
      send.textContent = 'Email sent'
      until = Date.now() + {FLOW_TTL * 1000}
      poll()
    }} catch (e) {{
      note.textContent = 'The link could not be sent. Check the connection and try again.'
      send.disabled = false
    }}
  }})
}})()
</script>
</body></html>"""
