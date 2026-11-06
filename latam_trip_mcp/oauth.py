"""The connector as an OAuth 2.1 resource server on Supabase Auth's own OAuth server (TECH-010, FEAT-006 way 1).

Supabase is the authorization server: it registers the client, sends the person to the planner's consent page, issues
the code and the tokens and refreshes them. The connector only names Supabase in its protected resource metadata and
checks each bearer against the project's JWKS. A good bearer is a token Supabase issued to an OAuth client for a signed
in user. A planner session has no client_id claim and is refused, so a token taken from the browser cannot drive the
connector. Nothing here reads a secret key, logs a token or returns one.
"""
from __future__ import annotations

import json, os, threading

ALGORITHMS = ["ES256", "RS256"]
AUDIENCE = "authenticated"
SCOPES = ["email"]
PRM_PATH = "/.well-known/oauth-protected-resource"

_jwks = {}
_jwks_lock = threading.Lock()


def supabase_url():
    """The project URL, from the environment or from the SSM parameter LATAMTRIP_URL_PARAM names."""
    return _param("SUPABASE_URL", "LATAMTRIP_URL_PARAM").rstrip("/")


def publishable_key():
    """The publishable key, from the environment or from the SSM parameter LATAMTRIP_PUBLISHABLE_KEY_PARAM names."""
    return _param("SUPABASE_PUBLISHABLE_KEY", "LATAMTRIP_PUBLISHABLE_KEY_PARAM")


def _param(env, param):
    if not os.environ.get(env) and os.environ.get(param):
        import boto3
        os.environ[env] = boto3.client("ssm").get_parameter(Name=os.environ[param], WithDecryption=True)["Parameter"]["Value"]
    value = os.environ.get(env)
    if not value:
        raise RuntimeError(f"{env} is not set and {param} names no parameter")
    return value


def issuer():
    return supabase_url() + "/auth/v1"


def _client(iss):
    """One PyJWKClient per issuer. It caches the keys and fetches the set again when a token names a kid it has not
    seen, so a key rotation needs no restart."""
    import jwt
    with _jwks_lock:
        c = _jwks.get(iss)
        if c is None:
            c = _jwks[iss] = jwt.PyJWKClient(iss + "/.well-known/jwks.json", cache_keys=True, lifespan=3600)
        return c


def verify_bearer(token, iss=None):
    """The user id (sub) of a good bearer, or None. Checks the signature against the JWKS, the issuer, the audience, exp
    and iat, role authenticated and a non empty client_id."""
    if not token:
        return None
    import jwt
    iss = iss or issuer()
    try:
        key = _client(iss).get_signing_key_from_jwt(token)
        claims = jwt.decode(token, key.key, algorithms=ALGORITHMS, audience=AUDIENCE, issuer=iss,
                            options={"require": ["exp", "iat", "sub", "iss", "aud"]})
    except Exception:  # noqa: BLE001  every failure is a refusal, the reason is not told to the caller
        return None
    if claims.get("role") != "authenticated" or not claims.get("client_id") or not claims.get("sub"):
        return None
    return claims["sub"]


def resource_url(base):
    return base.rstrip("/") + "/mcp"


def protected_resource_metadata_url(base):
    return base.rstrip("/") + PRM_PATH + "/mcp"


def is_metadata_path(path):
    return path == PRM_PATH or path.startswith(PRM_PATH + "/")


def protected_resource_metadata(base, iss=None):
    """RFC 9728 metadata. It names Supabase as the one authorization server."""
    return {"resource": resource_url(base), "authorization_servers": [iss or issuer()], "scopes_supported": SCOPES,
            "bearer_methods_supported": ["header"], "resource_name": "latam-trip"}


def challenge(base, token_given):
    """The WWW-Authenticate value of a 401. A token that was given and refused adds error="invalid_token", which tells
    the client to refresh or sign in again."""
    value = f'Bearer resource_metadata="{protected_resource_metadata_url(base)}"'
    return value + (', error="invalid_token"' if token_given else "")


async def send_json(send, status, payload, extra=()):
    await send({"type": "http.response.start", "status": status, "headers": [
        (b"content-type", b"application/json"), (b"cache-control", b"no-store"), *extra]})
    await send({"type": "http.response.body", "body": json.dumps(payload).encode()})
