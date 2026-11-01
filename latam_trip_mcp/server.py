"""The latam-trip connector: FastMCP behind an ASGI guard that wants a bearer from the OAuth server in oauth.py.

The tools come from core.Core.tool_specs(). The Supabase secret key is read from SSM on the first call, never kept in the
template or the repo.
"""
import json, os, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
for p in (ROOT,):
    if p not in sys.path:
        sys.path.insert(0, p)

from latam_trip_mcp import core as mcp_core, oauth  # noqa: E402
import tripdb  # noqa: E402
import tripdb_store  # noqa: E402

_core = None


def get_core():
    """The Core on the Supabase store. The URL and secret key come from SSM when the environment does not hold them."""
    global _core
    if _core is None:
        for env, param in (("SUPABASE_URL", "LATAMTRIP_URL_PARAM"), ("SUPABASE_SECRET_KEY", "LATAMTRIP_KEY_PARAM")):
            if not os.environ.get(env) and os.environ.get(param):
                import boto3
                os.environ[env] = boto3.client("ssm").get_parameter(Name=os.environ[param], WithDecryption=True)["Parameter"]["Value"]
        _core = mcp_core.Core(tripdb_store.get_store(tripdb.Paths(ROOT), "supabase"))
    return _core


def build_mcp(core_fn=get_core):
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


def guard(inner, resolve, base_url_fn, oauth_on=True):
    """An ASGI app that serves the OAuth routes itself and lets a request through to inner only with a good bearer."""

    async def app(scope, receive, send):
        if scope["type"] != "http":
            return await inner(scope, receive, send)
        headers = {k.decode().lower(): v.decode() for k, v in scope.get("headers", [])}
        base = base_url_fn(headers)
        path = scope.get("path", "")
        if oauth_on and oauth.is_oauth_path(path):
            return await oauth.handle(scope, receive, send, base)
        given = headers.get("authorization", "")
        token = given[7:].strip() if given.lower().startswith("bearer ") else ""
        if not (token and resolve(token)):
            meta = oauth.protected_resource_metadata_url(base)
            body = json.dumps({"error": "unauthorized"}).encode()
            await send({"type": "http.response.start", "status": 401, "headers": [
                (b"content-type", b"application/json"), (b"www-authenticate", f'Bearer resource_metadata="{meta}"'.encode())]})
            await send({"type": "http.response.body", "body": body})
            return
        await inner(scope, receive, send)

    return app


def build_asgi():
    return guard(build_mcp().http_app(path="/mcp"), oauth.resolve_access_token, base_url)


def __getattr__(name):
    # uvicorn asks for app, built on first use so importing this module in a test needs no fastmcp
    if name == "app":
        globals()["app"] = build_asgi()
        return globals()["app"]
    raise AttributeError(name)
