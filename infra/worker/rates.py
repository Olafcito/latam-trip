"""The morning rates refresh (FEAT-002). Every place and dates that have a Hostelworld price already is asked again
through the stay-rates edge function, so a stored price is never older than a day while the dates are ahead. The
worker holds no Hostelworld code: the function does the reading and the writing, the worker only says which."""
import datetime, json, urllib.error, urllib.request

TIMEOUT = 60


def wanted(rest, today):
    """(lodging_id, check_in, check_out) for every Hostelworld price whose check in is today or later, each once."""
    rows = rest.get_all("lodging_prices", {"select": "check_in,check_out,lodging_rooms(lodging_id)",
                                           "site": "eq.hostelworld", "check_in": f"gte.{today}"})
    out = []
    for r in rows:
        room = r.get("lodging_rooms") or {}
        key = (room.get("lodging_id"), r.get("check_in"), r.get("check_out"))
        if all(key) and key not in out:
            out.append(key)
    return sorted(out)


def post(url, key, body):
    """One call of the function. (status, reply dict). A refused call is a status and its error, never an exception."""
    req = urllib.request.Request(url, data=json.dumps(body).encode(), method="POST", headers={
        "Authorization": f"Bearer {key}", "apikey": key, "Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            return res.status, json.load(res)
    except urllib.error.HTTPError as e:
        try:
            return e.code, json.load(e)
        except ValueError:
            return e.code, {"error": "unreadable"}
    except (OSError, ValueError) as e:
        return 0, {"error": repr(e)}


def refresh(rest, call, today=None):
    """Asks for every wanted place and dates, forcing the fetch. call(body) gives (status, reply)."""
    today = today or datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    asked, fetched, failed = 0, 0, []
    for lodging_id, check_in, check_out in wanted(rest, today):
        asked += 1
        status, reply = call({"lodging_id": lodging_id, "check_in": check_in, "check_out": check_out, "fresh_minutes": 0})
        if status == 200 and reply.get("fetched"):
            fetched += 1
        else:
            failed.append({"lodging_id": lodging_id, "check_in": check_in, "status": status, "error": reply.get("error")})
    return {"asked": asked, "fetched": fetched, "failed": failed}
