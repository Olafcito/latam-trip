"""The prune of OAuth clients nobody uses (TECH-010). Every connect from claude.ai registers a new dynamic client on
Supabase's OAuth server, so the list grows with each sign in and is never cleaned by Supabase itself. Once a day the
worker deletes the dynamic clients that are older than DAYS and have not been used for DAYS. A manual client is never
touched.

Listing and deleting go through the GoTrue admin API with the secret key the worker already holds, which answers the
whole list in one page. When a client was last used is not in that API: it is the newest activity of a session with
that oauth_client_id in auth.sessions, which only SQL can read. The step reads it from the RPC LAST_USED_RPC, which
returns rows of {client_id, last_used}. That function is not in a migration yet, so until it is the step deletes
nothing and says why. A client it cannot date is kept.
"""
import datetime, json, urllib.parse

DAYS = 30
MAX_DELETES = 50
LAST_USED_RPC = "oauth_client_last_used"
CLIENTS = "/auth/v1/admin/oauth/clients"


def _t(v):
    if not v:
        return None
    return datetime.datetime.fromisoformat(str(v).replace("Z", "+00:00"))


def stale(clients, last_used, now, days=DAYS):
    """The client ids to delete: dynamic, made before the cutoff, and either never used or last used before it.
    last_used maps a client id to its newest session activity."""
    cutoff = now - datetime.timedelta(days=days)
    out = []
    for c in clients:
        made = _t(c.get("created_at"))
        if c.get("registration_type") != "dynamic" or not c.get("client_id") or made is None or made >= cutoff:
            continue
        used = _t(last_used.get(c["client_id"]))
        if used is None or used < cutoff:
            out.append(c["client_id"])
    return sorted(out)


def list_clients(rest):
    _, _, raw = rest._call("GET", CLIENTS, retry=True)
    return (json.loads(raw or b"{}") or {}).get("clients") or []


def last_used(rest):
    """{client_id: last_used}, or None when the function is not there yet."""
    try:
        rows = rest.rpc(LAST_USED_RPC, {})
    except Exception as e:  # noqa: BLE001  a missing function is a reason to delete nothing
        return None, str(e)[:200]
    return {r["client_id"]: r.get("last_used") for r in rows or [] if r.get("client_id")}, None


def prune(rest, now=None, days=DAYS, limit=MAX_DELETES):
    """Deletes the stale dynamic clients, at most limit in one run. The result counts what it saw and did."""
    now = now or datetime.datetime.now(datetime.timezone.utc)
    clients = list_clients(rest)
    used, why = last_used(rest)
    if used is None:
        return {"clients": len(clients), "deleted": 0, "skipped": "no last use to judge by", "error": why}
    ids = stale(clients, used, now, days)
    deleted, failed = 0, []
    for cid in ids[:limit]:
        try:
            rest._call("DELETE", CLIENTS + "/" + urllib.parse.quote(cid, safe=""))
            deleted += 1
        except Exception as e:  # noqa: BLE001  one failed delete does not stop the others
            failed.append(str(e)[:200])
    return {"clients": len(clients), "stale": len(ids), "deleted": deleted, "failed": failed}
