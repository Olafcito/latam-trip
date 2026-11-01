"""The steps of latam-trip-worker (spec 7.2). Standard library only, so it runs under the Lambda runtime as it is.

should_build   step 3, whether a run has anything to do
take_lease     step 4, the build lease, stale after 600 seconds
run_build      steps 4 to 8
file_hash, changed_files, upload, replace_derived, refuse_empty_pull   steps 7 and 8
"""
import datetime as dt, hashlib, json, os, re, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "plugin", "scripts"))
import tripdb  # noqa: E402
import tripdb_store as store  # noqa: E402
from tripdb_store import Refused, RestError, parse_time  # noqa: E402

QUIET = 60            # seconds without a write before a build
BURST = 300           # a build starts once the oldest unbuilt write is this old
GAP = 300             # seconds between two starts
LEASE = 600           # a lease older than this is stale
BUCKET = "web"
WEB = "data/web"
HASH_KEEP = 3600      # hash copies live this long
TIMED_OUT = "the previous build did not finish, probably at its time limit"
REQUIRED = ("quotes", "places", "connections", "profiles", "experiences", "stays", "trips")
TRIPS_LINE = re.compile(r"data/sources/trips\.jsonl:(\d+): ")
TRIPS_ID = re.compile(r"data/sources/trips\.jsonl (\S+): ")


class BuildFailed(Exception):
    """A step failed. dirty_at is the value to record as failed_dirty_at, so the same data is not tried again."""

    def __init__(self, message, dirty_at=None):
        super().__init__(message)
        self.dirty_at = dirty_at


def iso(t):
    return t.astimezone(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "Z" if isinstance(t, dt.datetime) else t


def _t(v):
    if v is None or isinstance(v, dt.datetime):
        return v
    if isinstance(v, str):
        try:
            t = dt.datetime.fromisoformat(v.replace("Z", "+00:00"))
        except ValueError:
            return None
        return t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)
    return None


# ---- step 3 --------------------------------------------------------------------------------------

def should_build(state, now):
    """True when the data moved, nobody is writing (or the burst is old enough), and the last start is old enough."""
    dirty, built, failed = _t(state.get("dirty_at")), _t(state.get("built_dirty_at")), _t(state.get("failed_dirty_at"))
    if dirty is None or (built is not None and dirty <= built) or (failed is not None and dirty == failed):
        return False
    since = _t(state.get("dirty_since"))
    quiet = (now - dirty).total_seconds() >= QUIET
    old_burst = since is not None and (now - since).total_seconds() > BURST
    if not (quiet or old_burst):
        return False
    started = _t(state.get("last_started"))
    return started is None or (now - started).total_seconds() >= GAP


# ---- the lease -----------------------------------------------------------------------------------

def _eq(v):
    return "is.null" if v is None else "eq." + str(v)


def take_lease(rest, holder, now):
    """True when this run holds the build lease now. A free or stale lease is taken in one conditional update, so two
    runs never both get it."""
    rows = rest.get_all("leases", {"select": "name,holder,expires_at", "name": "eq.build"})
    if not rows:
        got = rest.insert("leases", [{"name": "build", "holder": holder, "expires_at": iso(now + dt.timedelta(seconds=LEASE))}],
                          on_conflict="name", returning="name", resolution="ignore-duplicates")
        return bool(got)
    row = rows[0]
    expires = _t(row.get("expires_at"))
    if row.get("holder") is not None and expires is not None and expires > now:
        return False
    got = rest.patch("leases", {"name": "eq.build", "holder": _eq(row.get("holder")), "expires_at": _eq(row.get("expires_at"))},
                     {"holder": holder, "expires_at": iso(now + dt.timedelta(seconds=LEASE))}, returning="name")
    return len(got) == 1


def release_lease(rest, holder):
    rest.patch("leases", {"name": "eq.build", "holder": "eq." + holder}, {"holder": None, "expires_at": None})


# ---- step 6 --------------------------------------------------------------------------------------

def drop_bad_trips(errors, root):
    """Takes check's errors. When every one of them is about rows of trips, drops every version of those ids from the pulled
    trips.jsonl and returns the ids. Any other error raises Refused, as only one bad trip may not stop new prices."""
    path = os.path.join(root, "data", "sources", "trips.jsonl")
    other = [e for e in errors if not (TRIPS_LINE.match(e) or TRIPS_ID.match(e))]
    if other:
        raise Refused(f"check found {len(errors)} errors, first: {other[0]}")
    lines = []
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            lines = fh.read().splitlines()
    ids, bad_lines = set(), set()
    for e in errors:
        m = TRIPS_LINE.match(e)
        if m:
            n = int(m.group(1))
            try:
                rec = json.loads(lines[n - 1])
            except (IndexError, ValueError):
                rec = None
            if isinstance(rec, dict) and isinstance(rec.get("id"), str):
                ids.add(rec["id"])
            else:
                bad_lines.add(n)
        else:
            ids.add(TRIPS_ID.match(e).group(1))
    keep = []
    for n, line in enumerate(lines, 1):
        try:
            rec = json.loads(line)
        except ValueError:
            rec = None
        if n in bad_lines or (isinstance(rec, dict) and rec.get("id") in ids):
            continue
        keep.append(line)
    store.write_atomic(path, "".join(l + "\n" for l in keep))
    return sorted(ids) + [f"line {n}" for n in sorted(bad_lines)]


def refuse_empty_pull(root):
    """A pull with an empty trips file or an empty required table is a broken pull, never an empty trip."""
    src = os.path.join(root, "data", "sources")
    files = {"quotes": os.path.join(src, "quotes", "all.jsonl")}
    files.update({t: os.path.join(src, store.FILES[t]) for t in REQUIRED if t != "quotes"})
    for table in REQUIRED:
        rows = [r for r in store.rows_of(files[table]) if isinstance(r, dict)] if os.path.exists(files[table]) else []
        if not rows:
            raise Refused(f"the pull holds no rows of {table}, refusing to build")


def build_pulled(root):
    """check, drop the trips it refuses, then the unchanged pipeline on the pulled files. Returns the dropped ids."""
    paths = tripdb.Paths(root)
    errors, _ = tripdb.run_check(paths, quiet=True, st=store.FileStore(paths))
    dropped = drop_bad_trips(errors, root) if errors else []
    tripdb.cmd_build(paths, sync=False)
    return dropped


# ---- step 7 --------------------------------------------------------------------------------------

def file_hash(path):
    """Hash of a file's content. A JSON file is read without its top level generated_at, so a build that changes
    nothing else leaves the hash alone."""
    with open(path, "rb") as fh:
        raw = fh.read()
    if path.endswith(".json"):
        try:
            doc = json.loads(raw.decode("utf-8"))
        except ValueError:
            doc = None
        if isinstance(doc, dict):
            doc.pop("generated_at", None)
            raw = json.dumps(doc, sort_keys=True, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return hashlib.sha1(raw).hexdigest()[:16]


def changed_files(old_meta, files, key="files"):
    """The names in files (name to hash) that are new or have another hash than the old meta.json says."""
    old = (old_meta or {}).get(key) or {}
    return [n for n, h in files.items() if old.get(n) != h]


def _type(name):
    return {"json": "application/json", "csv": "text/csv", "db": "application/octet-stream"}.get(name.rsplit(".", 1)[-1], "application/octet-stream")


def _hashes(folder, skip=()):
    return {n: file_hash(os.path.join(folder, n)) for n in sorted(os.listdir(folder))
            if n not in skip and os.path.isfile(os.path.join(folder, n))}


def _put(rest, path, folder, name, cache=None):
    with open(os.path.join(folder, name), "rb") as fh:
        rest.storage_put(BUCKET, path, fh.read(), _type(name), cache_control=cache)


def prune_hash_copies(rest, files, now):
    """Deletes hash copies older than an hour that the current files map no longer names."""
    current = {f"{h}-{n}" for n, h in files.items()}
    gone = []
    for obj in rest.storage_list(BUCKET, "by-hash"):
        made = _t(obj.get("created_at") or obj.get("updated_at"))
        if obj["name"] not in current and made is not None and (now - made).total_seconds() > HASH_KEEP:
            gone.append("by-hash/" + obj["name"])
    if gone:
        rest.storage_delete(BUCKET, gone)
    return gone


def upload(rest, work_dir, meta=None, now=None):
    """Uploads the changed files of data/web, each also under its hash, then data/built, then meta.json last. Returns
    {"files": name to hash, "uploaded": names, "manifest_hash": hash of the map}."""
    now = now or dt.datetime.now(dt.timezone.utc)
    web, built = os.path.join(work_dir, "data", "web"), os.path.join(work_dir, "data", "built")
    try:
        old = json.loads(rest.storage_get(BUCKET, f"{WEB}/meta.json").decode("utf-8"))
    except (RestError, ValueError):
        old = None
    files = _hashes(web, skip=("meta.json",))
    built_files = _hashes(built) if os.path.isdir(built) else {}
    if meta is None:
        with open(os.path.join(web, "meta.json"), encoding="utf-8") as fh:
            meta = json.load(fh)
    meta = dict(meta)
    meta["files"] = files
    meta["built_files"] = built_files
    changed = changed_files(old, files)
    for name in changed:
        _put(rest, f"{WEB}/{name}", web, name)
        _put(rest, f"by-hash/{files[name]}-{name}", web, name, cache="max-age=31536000")
    for name in changed_files(old, built_files, "built_files"):
        _put(rest, f"built/{name}", built, name)
    store.write_atomic(os.path.join(web, "meta.json"), json.dumps(meta, ensure_ascii=False, indent=1) + "\n")
    rest.storage_put(BUCKET, f"{WEB}/meta.json", json.dumps(meta, ensure_ascii=False, indent=1).encode("utf-8"),
                     "application/json", cache_control="no-cache")
    prune_hash_copies(rest, files, now)
    manifest = hashlib.sha1(json.dumps(files, sort_keys=True).encode()).hexdigest()
    return {"files": files, "uploaded": changed, "manifest_hash": manifest}


# ---- step 8 --------------------------------------------------------------------------------------

def replace_derived(rest, inout, now=None):
    """derived_options becomes the options of inout.json, rank being the position in the array. Rows are upserted first and
    the ones no longer wanted deleted after, so a reader never sees the table empty."""
    now = iso(now or dt.datetime.now(dt.timezone.utc))
    rows, seen = [], set()
    for rank, o in enumerate(inout.get("options") or []):
        if o["id"] in seen:
            continue
        seen.add(o["id"])
        rows.append({"id": o["id"], "rank": rank, "total_dkk": o.get("total_dkk"), "way_in": o.get("way_in"),
                     "way_home": o.get("way_home"), "build_at": now, "data": o})
    rest.insert("derived_options", rows, on_conflict="id", resolution="merge-duplicates")
    stale = [r["id"] for r in rest.get_all("derived_options", {"select": "id"}) if r["id"] not in seen]
    for i in range(0, len(stale), 50):
        rest.delete("derived_options", {"id": "in.(" + ",".join(store.quoted(x) for x in stale[i:i + 50]) + ")"})
    return len(rows)


def set_state(rest, **values):
    rest.patch("derive_state", {"id": "eq.1"}, values)


def read_state(rest):
    rows = rest.get_all("derive_state", {"select": "*", "id": "eq.1"})
    return rows[0] if rows else {}


# ---- steps 4 to 8 --------------------------------------------------------------------------------

def run_build(rest, work_dir, version=None, now=None):
    """Runs steps 4 to 8 with the lease already held. Any failure writes last_error and failed_dirty_at and returns
    {"built": False, "error": ...}."""
    now = now or dt.datetime.now(dt.timezone.utc)
    first = read_state(rest)
    first_dirty = first.get("dirty_at")
    stage = "start"
    try:
        shutil.rmtree(work_dir, ignore_errors=True)
        os.makedirs(work_dir)
        set_state(rest, last_started=iso(now), worker_version=version)
        stage = "ingest"
        tripdb.cmd_ingest_inbox(tripdb.Paths(work_dir), store.SupabaseStore(tripdb.Paths(work_dir)))
        dirty_at = read_state(rest).get("dirty_at")
        read_at = iso(dt.datetime.now(dt.timezone.utc))
        stage = "pull"
        tripdb.cmd_pull(os.path.join(work_dir, "data", "sources"), rest=rest)
        stage = "check"
        refuse_empty_pull(work_dir)
        dropped = build_pulled(work_dir)
        stage = "upload"
        with open(os.path.join(work_dir, "data", "web", "inout.json"), encoding="utf-8") as fh:
            inout = json.load(fh)
        result = upload(rest, work_dir, now=now)
        stage = "options"
        n = replace_derived(rest, inout, now)
        done = dt.datetime.now(dt.timezone.utc)
        moved = _t(read_state(rest).get("dirty_at")) != _t(dirty_at)
        set_state(rest, built_dirty_at=dirty_at, last_finished=iso(done), manifest_hash=result["manifest_hash"], last_error=None,
                  last_warning=("trips left out of the build: " + ", ".join(dropped)) if dropped else None,
                  dirty_since=read_at if moved else None)
        return {"built": True, "uploaded": result["uploaded"], "options": n, "dropped": dropped}
    except Exception as e:  # a step failed, the old files stay live
        message = f"{stage}: {e}"[:1500]
        failed = dirty_at if stage not in ("start", "ingest") else first_dirty
        try:
            set_state(rest, last_error=message, failed_dirty_at=failed, last_finished=iso(dt.datetime.now(dt.timezone.utc)))
        except Exception as w:
            message += f" (and the state could not be written: {w})"
        return {"built": False, "error": message}


def run_once(rest, work_dir, holder, now=None, version=None):
    """What one EventBridge start does: decide, take the lease, build, release."""
    now = now or dt.datetime.now(dt.timezone.utc)
    state = read_state(rest)
    if not should_build(state, now):
        return {"built": False, "reason": "nothing to do"}
    if not take_lease(rest, holder, now):
        return {"built": False, "reason": "another run holds the lease"}
    try:
        started, finished = _t(state.get("last_started")), _t(state.get("last_finished"))
        if started is not None and (finished is None or finished < started):
            # the run before this one never wrote its end
            if (state.get("last_error") or "").startswith(TIMED_OUT):
                set_state(rest, failed_dirty_at=state.get("dirty_at"))
                return {"built": False, "error": "the build timed out twice, waiting for new data"}
            set_state(rest, last_error=TIMED_OUT)
        return run_build(rest, work_dir, version, now)
    finally:
        release_lease(rest, holder)
