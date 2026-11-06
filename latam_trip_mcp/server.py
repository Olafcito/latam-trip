"""The latam-trip connector: FastMCP behind an ASGI guard that wants a bearer Supabase's OAuth server issued (oauth.py).

The tools come from core.Core.tool_specs(). Each request gets its own Core that goes as the bearer's user through the
publishable key, so the connector holds no secret key. The URL and the publishable key come from SSM.
"""
import contextvars, json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
for p in (ROOT,):
    if p not in sys.path:
        sys.path.insert(0, p)

from latam_trip_mcp import core as mcp_core, oauth  # noqa: E402
import tripdb  # noqa: E402
import tripdb_store  # noqa: E402

# (bearer, user id) of the request being served, set by guard
caller = contextvars.ContextVar("caller", default=None)


def core_for(token, sub=None):
    """A Core that goes as the bearer's user, built for this request and kept for nothing else. It runs on PostgREST
    with the publishable key as apikey and the token as bearer, so row level security holds every call. sub is the user
    id guard already verified. Without it the token is verified here. A refused token raises PermissionError and never
    falls back to another key."""
    sub = sub or oauth.verify_bearer(token)
    if not sub:
        raise PermissionError("the token is not valid, sign in again")
    store = tripdb_store.SupabaseStore(tripdb.Paths(ROOT), url=oauth.supabase_url(), key=oauth.publishable_key(),
                                       bearer=token, owner=sub)
    return mcp_core.Core(store, owner=sub)


def current_core():
    """The Core of the request being served."""
    got = caller.get()
    if not got:
        raise PermissionError("no signed in caller")
    return core_for(*got)


def build_mcp(core_fn=current_core):
    from fastmcp import FastMCP
    from fastmcp.exceptions import ToolError
    from fastmcp.tools import Tool
    from fastmcp.tools.tool import ToolResult

    mcp = FastMCP("latam-trip")
    specs = mcp_core.Core(None).tool_specs()

    def make(spec):
        class CoreTool(Tool):
            async def run(self, arguments):
                fn = {s["name"]: s["fn"] for s in core_fn().tool_specs()}[spec["name"]]
                try:
                    out = fn(**(arguments or {}))
                except tripdb_store.Refused as e:
                    raise ToolError(str(e))
                except TypeError as e:
                    raise ToolError(f"bad arguments: {e}")
                return ToolResult(content=json.dumps(out, ensure_ascii=False, default=str), structured_content=out if isinstance(out, dict) else {"result": out})
        return CoreTool(name=spec["name"], description=spec["description"], parameters=spec["schema"])

    for spec in specs:
        mcp.add_tool(make(spec))
    return mcp


def base_url(headers):
    override = os.environ.get("LATAMTRIP_PUBLIC_URL")
    if override:
        return override.rstrip("/")
    proto = headers.get("x-forwarded-proto", "https").split(",")[0].strip()
    return f"{proto}://{headers.get('host', '')}"


def guard(inner, verify, base_url_fn):
    """An ASGI app that serves the protected resource metadata and lets a request through to inner only with a bearer
    verify accepts. verify gives the user id or None. The token and the user id ride in a context variable for the call."""

    async def app(scope, receive, send):
        if scope["type"] != "http":
            return await inner(scope, receive, send)
        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        base = base_url_fn(headers)
        path = scope.get("path", "")
        if oauth.is_metadata_path(path):
            return await oauth.send_json(send, 200, oauth.protected_resource_metadata(base))
        given = headers.get("authorization", "")
        token = given[7:].strip() if given.lower().startswith("bearer ") else ""
        sub = verify(token) if token else None
        if not sub:
            return await oauth.send_json(send, 401, {"error": "invalid_token" if token else "unauthorized"},
                                         [(b"www-authenticate", oauth.challenge(base, bool(token)).encode())])
        reset = caller.set((token, sub))
        try:
            await inner(scope, receive, send)
        finally:
            caller.reset(reset)

    return app


def build_asgi():
    return guard(build_mcp().http_app(path="/mcp", stateless_http=True), oauth.verify_bearer, base_url)


def __getattr__(name):
    # uvicorn asks for app, built on first use so importing this module in a test needs no fastmcp
    if name == "app":
        globals()["app"] = build_asgi()
        return globals()["app"]
    raise AttributeError(name)
