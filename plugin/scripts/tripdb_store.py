"""The store layer of tripdb, standard library only (spec 5).

FileStore keeps the files of data/sources. SupabaseStore keeps the same rows in the Supabase project. get_store picks one
from TRIPDB_STORE. Both give the commands of tripdb.py the same methods.
Rest(url, key) talks to PostgREST and Storage with the secret key on the apikey header. A read pages until the
Content-Range total is reached, so a read that fails halfway raises and never returns part of a table.
The key is never printed and never put in a message.
"""
import contextlib, csv, datetime as dt, hashlib, io, json, math, os, re, sys, time, urllib.error, urllib.parse, urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
PIPELINE = os.path.join(HERE, "..", "skills", "flight-crawl-orchestrator", "scripts")
for _d in (PIPELINE, HERE):
    if _d not in sys.path:
        sys.path.insert(0, _d)
from quote_rules import quote_key  # noqa: E402
import quote_rules as qr  # noqa: E402
import tripdb_cols as cols  # noqa: E402


class Refused(Exception):
    """A request tripdb turns down. The message says why and goes to the user as it is."""


class RestError(Refused):
    pass


# ---- files ---------------------------------------------------------------------------------------

TIME_RE = re.compile(r"(\d{4}-\d{2}-\d{2})[T ](\d{2}):(\d{2})(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?$")


def parse_time(s):
    """ISO 8601 date and time (seconds and zone optional, zone-less is UTC) as an aware datetime, else None."""
    m = TIME_RE.match(s or "") if isinstance(s, str) else None
    if not m:
        return None
    try:
        t = dt.datetime.fromisoformat(s.replace(" ", "T").replace("Z", "+00:00"))
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=dt.timezone.utc)


def now_utc():
    return dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def read_jsonl(path):
    """[(line number, row or None, error or None)] for every non-empty line."""
    out = []
    if not os.path.exists(path):
        return out
    with open(path, encoding="utf-8") as fh:
        for n, line in enumerate(fh, 1):
            if not line.strip():
                continue
            try:
                out.append((n, json.loads(line), None))
            except json.JSONDecodeError as e:
                out.append((n, None, f"not JSON ({e.msg})"))
    return out


def rows_of(path):
    return [r for _, r, e in read_jsonl(path) if e is None]


def read_input_text(text):
    out = []
    for n, line in enumerate(text.splitlines(), 1):
        if not line.strip():
            continue
        try:
            out.append((n, json.loads(line), None))
        except json.JSONDecodeError as e:
            out.append((n, None, f"not JSON ({e.msg})"))
    return out


def read_input(path):
    if path == "-":
        text = sys.stdin.read()
    else:
        with open(path, encoding="utf-8") as fh:
            text = fh.read()
    return read_input_text(text)


def append_rows(path, rows):
    """Append rows to a JSONL file in one O_APPEND write, so concurrent writers never interleave lines."""
    if not rows:
        return
    os.makedirs(os.path.dirname(path), exist_ok=True)
    data = "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in rows).encode("utf-8")
    if os.path.exists(path) and os.path.getsize(path):
        with open(path, "rb") as fh:
            fh.seek(-1, os.SEEK_END)
            if fh.read(1) != b"\n":
                data = b"\n" + data
    fd = os.open(path, os.O_WRONLY | os.O_APPEND | os.O_CREAT | getattr(os, "O_BINARY", 0), 0o644)
    try:
        view = memoryview(data)
        while view:
            view = view[os.write(fd, view):]
    finally:
        os.close(fd)


def write_atomic(path, text):
    tmp = f"{path}.{os.getpid()}.tmp"
    with open(tmp, "w", encoding="utf-8", newline="\n") as fh:
        fh.write(text)
    os.replace(tmp, path)


class Lock:
    """A lock file next to the sources. A lock older than STALE seconds is taken over."""
    STALE = 600

    def __init__(self, paths, timeout=120):
        self.path, self.timeout = paths.lock, timeout

    def __enter__(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        start = time.time()
        while True:
            try:
                fd = os.open(self.path, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
                os.write(fd, f"{os.getpid()} {dt.datetime.now(dt.timezone.utc).isoformat()}\n".encode())
                os.close(fd)
                return self
            except FileExistsError:
                try:
                    if time.time() - os.path.getmtime(self.path) > self.STALE:
                        os.remove(self.path)
                        continue
                except OSError:
                    continue
                if time.time() - start > self.timeout:
                    raise Refused(f"{self.path} is held by another tripdb run, try again or remove it if no run is active")
                time.sleep(0.1)

    def __exit__(self, *exc):
        try:
            os.remove(self.path)
        except OSError:
            pass


def known_quotes(paths):
    """quote key: newest observed_at over every quote file."""
    seen = {}
    if not os.path.isdir(paths.quotes):
        return seen
    for f in sorted(os.listdir(paths.quotes)):
        if f.endswith(".jsonl"):
            for q in rows_of(os.path.join(paths.quotes, f)):
                if isinstance(q, dict):
                    k, t = quote_key(q), parse_time(q.get("observed_at"))
                    if t and (k not in seen or t > seen[k]):
                        seen[k] = t
    return seen


def sort_quotes(rows, seen):
    """Split checked rows into (to append, duplicates). Within the batch the newest observation of a quote is
    kept. A quote already stored is appended again only when this observation is newer."""
    newest = {}
    for q in rows:
        k = quote_key(q)
        if k not in newest or parse_time(q["observed_at"]) > parse_time(newest[k]["observed_at"]):
            newest[k] = q
    keep, dups = [], len(rows) - len(newest)
    for k, q in newest.items():
        if k in seen and seen[k] >= parse_time(q["observed_at"]):
            dups += 1
        else:
            keep.append(q)
    return keep, dups


TRIP_META = ("version", "saved_at", "by")


def trip_content(t):
    return {k: v for k, v in t.items() if k not in TRIP_META}


def latest_trips(rows):
    """{id: latest row} plus {id: [every row, oldest first]} from the rows of trips.jsonl."""
    every = {}
    for r in rows:
        if isinstance(r, dict) and isinstance(r.get("id"), str):
            every.setdefault(r["id"], []).append(r)
    for vs in every.values():
        vs.sort(key=lambda r: r.get("version") if isinstance(r.get("version"), int) else 0)
    return {k: vs[-1] for k, vs in every.items()}, every


def load_env(root):
    """The environment, plus the git ignored .env at the root for names that the environment does not set."""
    env = dict(os.environ)
    path = os.path.join(root, ".env")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                m = re.match(r"\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$", line)
                if m and m.group(1) not in env:
                    env[m.group(1)] = m.group(2).strip("'\"")
    return env


def _query(params):
    if not params:
        return ""
    if isinstance(params, str):
        return params.lstrip("?")
    return "&".join(f"{k}={urllib.parse.quote(str(v), safe='(),.*:!-_')}" for k, v in params.items())


class Rest:
    PAGE = 1000
    BATCH_ROWS = 500
    BATCH_BYTES = 3_000_000

    def __init__(self, url, key, timeout=90):
        if not url or not key:
            raise RestError("SUPABASE_URL and SUPABASE_SECRET_KEY must be set, in the environment or in .env")
        self.url, self.key, self.timeout = url.rstrip("/"), key, timeout

    # ---- one call ----
    def _call(self, method, path, body=None, headers=None, raw=None, retry=False):
        """(status, headers, bytes). A connection error on a read is tried once more."""
        h = {"apikey": self.key}
        if body is not None:
            h["Content-Type"] = "application/json"
        h.update(headers or {})
        try:
            data = raw if raw is not None else (None if body is None else json.dumps(body, ensure_ascii=False, allow_nan=False).encode("utf-8"))
        except (UnicodeEncodeError, ValueError) as e:
            raise RestError(f"the body cannot be sent, it holds a NaN, an Infinity or a lone surrogate ({e})")
        for attempt in (0, 1):
            req = urllib.request.Request(self.url + path, method=method, headers=h, data=data)
            try:
                with urllib.request.urlopen(req, timeout=self.timeout) as r:
                    return r.status, r.headers, r.read()
            except urllib.error.HTTPError as e:
                text = e.read().decode("utf-8", "replace")[:600]
                e.close()
                raise RestError(f"{method} {path.split('?')[0]} gave {e.code}: {text}")
            except (urllib.error.URLError, ConnectionError, TimeoutError, OSError) as e:
                if retry and attempt == 0:
                    time.sleep(0.5)
                    continue
                raise RestError(f"{method} {path.split('?')[0]} failed: {getattr(e, 'reason', e)}")

    def _json(self, raw):
        return json.loads(raw.decode("utf-8")) if raw else None

    # ---- reads ----
    def get_all(self, table, params=None, page=None, limit=None):
        """Every row of a read (or the first limit rows), in the order the params ask for. Pages until Content-Range
        reaches the total."""
        page = page or self.PAGE
        q = _query(params)
        rows, total = [], None
        while (total is None or len(rows) < total) and (limit is None or len(rows) < limit):
            start = len(rows)
            end = start + page - 1 if limit is None else min(start + page, limit) - 1
            _, hdr, raw = self._call("GET", f"/rest/v1/{table}" + ("?" + q if q else ""), retry=True, headers={
                "Range-Unit": "items", "Range": f"{start}-{end}", "Prefer": "count=exact"})
            m = re.fullmatch(r"(?:(\d+)-(\d+)|\*)/(\d+)", hdr.get("Content-Range") or "")
            if not m:
                raise RestError(f"{table}: the answer carries no Content-Range")
            total = int(m.group(3))
            got = self._json(raw) or []
            if total > start and not got:
                raise RestError(f"{table}: got {start} of {total} rows, then an empty page")
            rows += got
            if len(rows) > total:
                raise RestError(f"{table}: got {len(rows)} rows for a total of {total}")
        return rows if limit is None else rows[:limit]

    # ---- writes ----
    def insert(self, table, rows, on_conflict=None, returning=None, resolution=None, columns=None):
        """Insert in batches. returning is a column list to get back, or None for nothing. Stops on the first failed batch.
        Each batch names its columns, the given ones or every key its rows use, so rows with different keys go in
        together and a key a row leaves out takes the column's default."""
        out, batch, size, start = [], [], 0, 0
        for i, r in enumerate(rows):
            n = len(json.dumps(r, ensure_ascii=False))
            if batch and (len(batch) >= self.BATCH_ROWS or size + n > self.BATCH_BYTES):
                out += self._insert_batch(table, batch, on_conflict, returning, resolution, start, i, columns)
                batch, size, start = [], 0, i
            batch.append(r)
            size += n
        if batch:
            out += self._insert_batch(table, batch, on_conflict, returning, resolution, start, start + len(batch), columns)
        return out

    def _insert_batch(self, table, batch, on_conflict, returning, resolution, a, b, columns=None):
        prefer = ["return=representation" if returning else "return=minimal", "missing=default"]
        if resolution:
            prefer.append(f"resolution={resolution}")
        q = {}
        # PostgREST takes a bulk insert whose rows have different keys only when columns names them all
        names = ",".join(columns or dict.fromkeys(k for r in batch for k in r))
        if names:
            q["columns"] = names
        if on_conflict:
            q["on_conflict"] = on_conflict
        if returning:
            q["select"] = returning
        try:
            _, _, raw = self._call("POST", f"/rest/v1/{table}" + ("?" + _query(q) if q else ""), body=batch,
                                   headers={"Prefer": ",".join(prefer)})
        except RestError as e:
            raise RestError(f"{table} rows {a} to {b - 1} refused: {e}")
        return self._json(raw) or [] if returning else []

    def patch(self, table, params, body, returning=None):
        """PATCH the rows the params pick. returning is a column list to get back, and then the rows come back."""
        q = dict(params)
        if returning:
            q["select"] = returning
        _, _, raw = self._call("PATCH", f"/rest/v1/{table}?{_query(q)}", body=body,
                               headers={"Prefer": "return=representation" if returning else "return=minimal"})
        return (self._json(raw) or []) if returning else None

    def delete(self, table, params):
        self._call("DELETE", f"/rest/v1/{table}?{_query(params)}", headers={"Prefer": "return=minimal"})

    def rpc(self, name, body=None):
        _, _, raw = self._call("POST", f"/rest/v1/rpc/{name}", body={} if body is None else body)
        return self._json(raw)

    # ---- storage ----
    def storage_put(self, bucket, path, data, content_type="application/json", upsert=True, cache_control=None):
        if isinstance(data, str):
            data = data.encode("utf-8")
        headers = {"Content-Type": content_type, "x-upsert": "true" if upsert else "false"}
        if cache_control:
            headers["Cache-Control"] = cache_control
        self._call("POST", f"/storage/v1/object/{bucket}/{urllib.parse.quote(path)}", raw=data, headers=headers)

    def _signed(self, rel):
        """The full address of a signed path that Storage gives relative to /storage/v1."""
        return self.url + ("" if rel.startswith("/storage/v1/") else "/storage/v1") + rel

    def storage_sign(self, bucket, path, expires=600):
        """A signed download URL for a file in a private bucket, valid for expires seconds."""
        _, _, raw = self._call("POST", f"/storage/v1/object/sign/{bucket}/{urllib.parse.quote(path)}", body={"expiresIn": expires})
        return self._signed(self._json(raw)["signedURL"])

    def storage_sign_upload(self, bucket, path):
        """A signed upload URL for one file in a bucket. Storage keeps it valid for 2 hours. The file goes up with a PUT,
        and replaces a file already at the path."""
        _, _, raw = self._call("POST", f"/storage/v1/object/upload/sign/{bucket}/{urllib.parse.quote(path)}", body={},
                               headers={"x-upsert": "true"})
        return self._signed(self._json(raw)["url"])

    def storage_list(self, bucket, prefix):
        """Every object directly below prefix, as the Storage list call gives them: name, created_at and updated_at."""
        out, offset = [], 0
        while True:
            _, _, raw = self._call("POST", f"/storage/v1/object/list/{bucket}", retry=True, body={
                "prefix": prefix, "limit": 1000, "offset": offset, "sortBy": {"column": "name", "order": "asc"}})
            got = self._json(raw) or []
            out += got
            if len(got) < 1000:
                return out
            offset += len(got)

    def storage_delete(self, bucket, paths):
        for i in range(0, len(paths), 100):
            self._call("DELETE", f"/storage/v1/object/{bucket}", body={"prefixes": paths[i:i + 100]})

    def storage_get(self, bucket, path):
        _, _, raw = self._call("GET", f"/storage/v1/object/{bucket}/{urllib.parse.quote(path)}", retry=True)
        return raw


# ---- the stores ----------------------------------------------------------------------------------
# A store keeps the rows of the trip data. The commands of tripdb.py check a row and then hand it to a store, so a command
# runs on the files of data/sources and on the Supabase project alike. A row is a record as the files write it.

FILES = {"places": "places.jsonl", "connections": "connections.jsonl", "profiles": "profiles.jsonl",
         "place_images": "place_images.jsonl", "experiences": "experiences.jsonl",
         "experience_images": "experience_images.jsonl", "stays": "stays.jsonl", "task_log": "task_log.jsonl",
         "trips": "trips.jsonl"}
USAGE_COLS = ["round", "agent", "model", "tool", "searches", "tokens", "tool_uses", "seconds", "rows"]
DIFFERS = "differs, add --replace to supersede it"


class AddResult:
    """What an add did. added counts the rows written (replaced of them over a stored row), skips lists every row left
    out as (index in the batch, key, why), and duplicates counts the quotes that were seen already."""

    def __init__(self):
        self.added = self.replaced = self.duplicates = 0
        self.skips = []

    @property
    def skipped(self):
        return len(self.skips)

    @property
    def differs(self):
        return sum(1 for _, _, why in self.skips if why.startswith("differs"))


def classify(keys, items, stored, same, replace):
    """Sort a batch against the stored rows. keys[i] is the identity of items[i], stored maps identity to the stored
    item and same(a, b) says whether two items agree. Returns (AddResult, {key: index of the item to write}). A repeat
    inside the batch counts as stored. With replace the last copy of a key wins."""
    res, pending = AddResult(), {}
    for i, (k, it) in enumerate(zip(keys, items)):
        if k in pending:
            if replace:
                pending[k] = i
            else:
                res.skips.append((i, k, "identical" if same(items[pending[k]], it) else DIFFERS))
            continue
        if k in stored and not replace:
            res.skips.append((i, k, "identical" if same(stored[k], it) else DIFFERS))
            continue
        pending[k] = i
    res.replaced = sum(1 for k in pending if k in stored)
    res.added = len(pending)
    return res, pending


QUERY_TABLES = ("airports", "places", "connections", "profiles", "place_images", "experiences", "experience_images", "stays",
                "quotes", "trips", "trips_latest", "documents", "user_documents", "inbox", "tasks", "task_log", "agent_usage", "leases",
                "derive_state", "derived_options")
COL_RE = re.compile("[a-z_][a-z0-9_]*")


def query_args(table, eq, in_, gte, select, limit):
    """Check a query and split it: ([(col, val)], [(col, [vals])], [(col, val)], [cols] or None, limit or None)."""
    if table not in QUERY_TABLES:
        raise Refused(f"unknown table {table!r}, expected one of {', '.join(QUERY_TABLES)}")

    def pairs(items, flag):
        out = []
        for it in items or ():
            col, eqs, val = str(it).partition("=")
            if not eqs or not COL_RE.fullmatch(col):
                raise Refused(f"{flag} wants COL=VALUE with a plain column name, not {it!r}")
            out.append((col, val))
        return out
    wanted = [(c, [x for x in v.split(",") if x != ""]) for c, v in pairs(in_, "--in")]
    sel = None
    if select:
        sel = [c.strip() for c in select.split(",")]
        bad = [c for c in sel if not COL_RE.fullmatch(c)]
        if bad:
            raise Refused(f"--select wants plain column names, not {bad[0]!r}")
    if limit is not None and (not str(limit).isdigit() or int(limit) < 1):
        raise Refused("--limit must be a whole number above 0")
    return pairs(eq, "--eq"), wanted, pairs(gte, "--gte"), sel, None if limit is None else int(limit)


def _text(v):
    return "true" if v is True else "false" if v is False else "" if v is None else str(v)


def _atleast(cell, val):
    try:
        return float(cell) >= float(val)
    except (TypeError, ValueError):
        return cell is not None and _text(cell) >= val


def query_rows(rows, eq, in_, gte, select, limit):
    """The rows that pass the tests, cut to the columns of select and to limit rows. Rows are database shaped dicts."""
    out = []
    for r in rows:
        if all(_text(r.get(c)) == v for c, v in eq) and all(_text(r.get(c)) in vs for c, vs in in_)                 and all(_atleast(r.get(c), v) for c, v in gte):
            out.append({c: r.get(c) for c in select} if select else r)
            if limit is not None and len(out) >= limit:
                break
    return out


class Store:
    kind = None

    def lock(self):
        return contextlib.nullcontext()

    def recompute_quotes(self, cfg):
        """Bring build_qid and usable of the stored quotes in line with a changed trip.json. The files hold neither."""
        return 0

    def query(self, table, eq=(), in_=(), gte=(), select=None, limit=None):
        raise NotImplementedError


class FileStore(Store):
    """The files of data/sources. paths says where they are. Every write holds the lock file next to them."""
    kind = "file"

    def __init__(self, paths):
        self.paths = paths

    def lock(self):
        return Lock(self.paths)

    def _file(self, table):
        return self.paths.src(FILES[table])

    def _rel(self, path):
        return os.path.relpath(path, self.paths.root).replace(os.sep, "/")

    def dest(self, table, name=None):
        """Where a table lives, for the line a command prints."""
        if table == "quotes":
            return self._rel(os.path.join(self.paths.quotes, name))
        if table == "documents":
            return self._rel(self.paths.src(name))
        return self._rel(self._file(table))

    # ---- reads ----
    def rows(self, table):
        return [r for r in rows_of(self._file(table)) if isinstance(r, dict)]

    def ids(self, table):
        return {r["id"] for r in self.rows(table) if "id" in r}

    def doc(self, name):
        """(data, version). A missing document is (None, None). The version is a hash of the file text. A file that is
        not JSON raises ValueError."""
        p = self.paths.src(name)
        if not os.path.exists(p):
            return None, None
        with open(p, "rb") as fh:
            raw = fh.read()
        return json.loads(raw.decode("utf-8")), hashlib.sha1(raw).hexdigest()

    def trips(self):
        latest, _ = latest_trips(self.rows("trips"))
        return list(latest.values())

    def trip_ids(self):
        return {r["id"] for r in self.rows("trips") if isinstance(r.get("id"), str)}

    def label(self, name):
        """A document or a table as the checks name it: its path below the root."""
        return self._rel(self.paths.src(FILES[name] if name in FILES else name))

    def check_rows(self, table):
        """(label, row or None, error or None) for every line of a table file, the label being file:line."""
        p = self._file(table)
        return [(f"{self._rel(p)}:{n}", r, e) for n, r, e in read_jsonl(p)]

    def check_quotes(self):
        out = []
        d = self.paths.quotes
        for f in sorted(os.listdir(d)) if os.path.isdir(d) else []:
            if f.endswith(".jsonl"):
                out += [(f"{self._rel(os.path.join(d, f))}:{n}", q, e) for n, q, e in read_jsonl(os.path.join(d, f))]
        return out

    def trip_versions(self):
        """{id: [version of every saved row, oldest first]}, deleted rows excluded."""
        _, every = latest_trips(self.rows("trips"))
        return {tid: [r.get("version") for r in vs] for tid, vs in every.items()}

    # ---- writes ----
    def add(self, table, rows, keys, replace=False):
        """Append the rows whose key is not stored yet. A stored key is skipped, or appended after the stored row with
        replace, and the later row wins in the build."""
        keyf = lambda r: tuple(r.get(k) for k in keys)
        strip = lambda r: {k: v for k, v in r.items() if k != "origin"}
        with self.lock():
            stored = {keyf(r): r for r in self.rows(table)}
            res, pending = classify([keyf(r) for r in rows], rows, stored, lambda a, b: strip(a) == strip(b), replace)
            append_rows(self._file(table), [rows[i] for i in pending.values()])
        return res

    def add_quotes(self, rows, name):
        """Append the quotes that are new, or seen again later than the stored sighting, to quotes/<name>."""
        res = AddResult()
        with self.lock():
            keep, res.duplicates = sort_quotes(rows, known_quotes(self.paths))
            append_rows(os.path.join(self.paths.quotes, name), keep)
        res.added = len(keep)
        return res

    def append(self, table, rec):
        """A row of task_log or agent_usage. These are logs, so nothing is compared."""
        with self.lock():
            if table == "task_log":
                append_rows(self._file(table), [rec])
                return
            cells = [rec[c] for c in USAGE_COLS]
            buf = io.StringIO()
            csv.writer(buf, lineterminator="\n").writerow(cells)
            dest = self.paths.src("agent_usage.csv")
            if not os.path.exists(dest):
                with open(dest, "w", encoding="utf-8", newline="") as fh:
                    fh.write(",".join(USAGE_COLS) + "\n")
            fd = os.open(dest, os.O_WRONLY | os.O_APPEND | getattr(os, "O_BINARY", 0))
            try:
                os.write(fd, buf.getvalue().encode("utf-8"))
            finally:
                os.close(fd)

    def update(self, table, key, patch, check=None):
        """Change fields of the stored row with this id. Returns (old, new), or None when there is no such row.
        check(new) lists the reasons to refuse."""
        dest = self._file(table)
        with self.lock():
            if not os.path.exists(dest):
                return None
            with open(dest, encoding="utf-8") as fh:
                lines = fh.read().splitlines()
            hits = [i for i, l in enumerate(lines) if l.strip() and json.loads(l).get("id") == key]
            if not hits:
                return None
            i = hits[-1]
            old = json.loads(lines[i])
            new = {**old, **patch}
            errs = check(new) if check else []
            if errs:
                raise Refused(f"{key}: " + "; ".join(errs))
            lines[i] = json.dumps(new, ensure_ascii=False)
            write_atomic(dest, "\n".join(lines) + "\n")
        return old, new

    def put_doc(self, name, data, version):
        """Write a document if it is still at this version. False when another writer changed it first."""
        with self.lock():
            if self.doc(name)[1] != version:
                return False
            write_atomic(self.paths.src(name), json.dumps(data, ensure_ascii=False, indent=1) + "\n")
        return True

    # ---- query ----
    def query(self, table, eq=(), in_=(), gte=(), select=None, limit=None):
        """Rows as the database would hold them, filtered here. A column the table lacks matches nothing."""
        eq, in_, gte, select, limit = query_args(table, eq, in_, gte, select, limit)
        if table == "quotes":
            rows = []
            for f in sorted(os.listdir(self.paths.quotes)) if os.path.isdir(self.paths.quotes) else []:
                if f.endswith(".jsonl"):
                    rows += [{**q, "agent": q.get("agent") or f[:-6]} for q in rows_of(os.path.join(self.paths.quotes, f))
                             if isinstance(q, dict)]
            cfg = self.doc("trip.json")[0] or {}
            rows = cols.fold_quotes(rows, cfg)
        elif table in ("trips", "trips_latest"):
            recs = self.rows("trips") if table == "trips" else self.trips()
            rows = [cols.trip_row(r) for r in recs]
        elif table in FILES and table in cols.COLS:
            rows = [cols.to_row(table, r) for r in self.rows(table)]
        else:
            raise Refused(f"{table} is kept in the project only, run with TRIPDB_STORE=supabase")
        return query_rows(rows, eq, in_, gte, select, limit)

    # ---- trips ----
    def save_trip(self, t):
        """The trip as the next version of its id. A trip with the content of the latest version is skipped. Returns
        {id, version, skipped}."""
        dest = self._file("trips")
        with self.lock():
            latest, _ = latest_trips(rows_of(dest))
            prev = latest.get(t["id"])
            if prev is not None and trip_content(prev) == trip_content(t):
                return {"id": t["id"], "version": prev["version"], "skipped": True}
            t = dict(t)
            t["version"] = (prev["version"] if prev else 0) + 1
            t["saved_at"] = now_utc()
            row = {k: t[k] for k in ("id", "version", "name", "saved_at", "by", "why") if k in t}
            row.update({k: v for k, v in t.items() if k not in row})
            append_rows(dest, [row])
        return {"id": row["id"], "version": row["version"], "skipped": False}

    def delete_trip(self, ids):
        """Remove every version of each id. Returns {id: versions removed} for the ids that were there."""
        dest = self._file("trips")
        found = {}
        with self.lock():
            keep = []
            for _, r, err in read_jsonl(dest):
                if err is None and isinstance(r, dict) and r.get("id") in ids:
                    found[r["id"]] = found.get(r["id"], 0) + 1
                elif err is None:
                    keep.append(r)
            if found:
                write_atomic(dest, "".join(json.dumps(r, ensure_ascii=False) + "\n" for r in keep))
        return found

    def remove(self, table, match):
        """Take the rows out whose fields equal match, and return them. For quotes match is {"quote_id": id}. Nothing else
        is touched, and a line that is not JSON stays where it is."""
        gone = []
        with self.lock():
            if table == "quotes":
                d = self.paths.quotes
                for f in sorted(os.listdir(d)) if os.path.isdir(d) else []:
                    if f.endswith(".jsonl"):
                        gone += self._cut(os.path.join(d, f), lambda r: cols.qr.quote_id(r) == match["quote_id"])
            else:
                gone = self._cut(self._file(table), lambda r: all(r.get(k) == v for k, v in match.items()))
        return gone

    @staticmethod
    def _cut(dest, hit):
        gone, keep = [], []
        if not os.path.exists(dest):
            return gone
        with open(dest, encoding="utf-8") as fh:
            lines = fh.read().splitlines()
        for line in lines:
            try:
                r = json.loads(line) if line.strip() else None
            except json.JSONDecodeError:
                r = None
            if isinstance(r, dict) and hit(r):
                gone.append(r)
            else:
                keep.append(line)
        if gone:
            write_atomic(dest, "".join(l + chr(10) for l in keep))
        return gone

    def restore_trip(self, tid, versions):
        """Bring a deleted trip back. versions are its rows as they were, oldest first. Returns how many came back."""
        dest = self._file("trips")
        with self.lock():
            have = {r.get("version") for r in rows_of(dest) if isinstance(r, dict) and r.get("id") == tid}
            back = [v for v in versions if v.get("version") not in have]
            append_rows(dest, back)
        return len(back)

    # ---- the inbox ----
    def inbox_new(self):
        """The inbox files waiting: [{id, file, lines: [(line number, row or None, error or None)]}]."""
        d = self.paths.inbox
        files = sorted(f for f in os.listdir(d) if f.endswith(".jsonl")) if os.path.isdir(d) else []
        return [{"id": f, "file": f, "lines": read_input(os.path.join(d, f))} for f in files]

    def inbox_mark(self, entry_id, status, reason, rejected):
        """Move the file to processed, and put the rejected rows ({line, reason, row}) in rejected. Returns where they went."""
        if rejected:
            append_rows(os.path.join(self.paths.rejected, entry_id), rejected)
        os.makedirs(self.paths.processed, exist_ok=True)
        os.replace(os.path.join(self.paths.inbox, entry_id), os.path.join(self.paths.processed, entry_id))
        return self._rel(os.path.join(self.paths.rejected, entry_id)) if rejected else None


def get_store(paths, kind=None):
    """The store a command works on: kind, else TRIPDB_STORE, else the files."""
    kind = kind or os.environ.get("TRIPDB_STORE") or "file"
    if kind == "file":
        return FileStore(paths)
    if kind == "supabase":
        return SupabaseStore(paths)
    raise Refused(f"TRIPDB_STORE is {kind!r}, expected file or supabase")


BS = chr(92)
ORDER = {"stays": "id", "connections": "id", "task_log": "seq"}
# Tables whose rows belong to one person. The secret key bypasses row level security, so every read, change and delete of
# these names the admin's owner id itself, and a write names it too.
PRIVATE_TABLES = frozenset({"trips", "trips_latest", "quotes", "tasks", "inbox", "task_log", "agent_usage", "bookings", "lodgings",
                            "lodging_rooms", "lodging_prices", "user_documents"})
# The documents a person owns, which live in user_documents under their id. Every other document is shared and stays in documents.
PERSONAL_DOCS = frozenset({"lists.json", "trip.json", "mcp_trash.json", "web_trips", "way_id_map", "unresolved_journeys",
                           "current_plan"})


def admin_id(rest):
    """The one admin's user id, read from admins at run time. Refuses when there is not exactly one."""
    got = rest.get_all("admins", {"select": "user_id"})
    if len(got) != 1:
        raise Refused(f"admins holds {len(got)} rows, it must hold exactly one for the secret key to know whose rows it reads")
    return got[0]["user_id"]


def quoted(v):
    """A value for an in.(...) filter: double quoted, with the quote and the backslash escaped."""
    return '"' + str(v).replace(BS, BS + BS).replace('"', BS + '"') + '"'


def has_nul(v):
    """True when a string anywhere in v, or a key of a dict in it, holds a NUL character. PostgreSQL cannot store one."""
    if isinstance(v, str):
        return chr(0) in v
    if isinstance(v, dict):
        return any(has_nul(k) or has_nul(x) for k, x in v.items())
    if isinstance(v, list):
        return any(has_nul(x) for x in v)
    return False


def has_unstorable(v):
    """True when v holds a NaN or an Infinity, or a string with a lone surrogate. PostgREST refuses the first, and the
    utf-8 encode of the body raises on the second."""
    if isinstance(v, float):
        return not math.isfinite(v)
    if isinstance(v, str):
        return any(0xD800 <= ord(c) <= 0xDFFF for c in v)
    if isinstance(v, dict):
        return any(has_unstorable(k) or has_unstorable(x) for k, x in v.items())
    if isinstance(v, list):
        return any(has_unstorable(x) for x in v)
    return False


class SupabaseStore(Store):
    """The same rows in the Supabase project, through the secret key. Without SUPABASE_URL and SUPABASE_SECRET_KEY the
    constructor stops, so nothing is written."""
    kind = "supabase"
    IN_CHUNK = 100

    def __init__(self, paths):
        self.paths = paths
        env = load_env(paths.root)
        self.rest = Rest(env.get("SUPABASE_URL"), env.get("SUPABASE_SECRET_KEY"))
        self._owner = None

    def owner(self):
        """The admin's user id, read once."""
        if self._owner is None:
            self._owner = admin_id(self.rest)
        return self._owner

    def _mine(self, table, params=None):
        """The params with the owner filter added when the table is private."""
        out = dict(params or {})
        if table in PRIVATE_TABLES:
            out["owner_id"] = "eq." + self.owner()
        return out

    def _docs(self, name):
        """The table and the filter a document has: a person's own in user_documents, the shared in documents."""
        dn = self._dn(name)
        if dn in PERSONAL_DOCS:
            return "user_documents", {"owner_id": "eq." + self.owner(), "name": "eq." + dn}
        return "documents", {"name": "eq." + dn}

    # ---- names ----
    @staticmethod
    def _dn(name):
        """The name a document has in the documents table: the file name, but way_id_map without .json."""
        return name[:-5] if name == "way_id_map.json" else name

    def label(self, name):
        return name[:-6] if name.endswith(".jsonl") else name

    def dest(self, table, name=None):
        return f"supabase {table}"

    @staticmethod
    def _keycols(table):
        m = cols.COLS[table]
        return [m.field_to_col[k] for k in m.key]

    # ---- reads ----
    def _raw(self, table, extra=None):
        params = {"select": "*", "order": ORDER.get(table, "seq")}
        params.update(extra or {})
        return self.rest.get_all(table, self._mine(table, params))

    def rows(self, table):
        return [cols.from_row(table, r) for r in self._raw(table)]

    def ids(self, table):
        return {r["id"] for r in self.rest.get_all(table, self._mine(table, {"select": "id", "order": "id"}))}

    def doc(self, name):
        table, where = self._docs(name)
        got = self.rest.get_all(table, {"select": "version,data", **where})
        return (got[0]["data"], got[0]["version"]) if got else (None, None)

    def _trip_rows(self):
        return self.rest.get_all("trips", self._mine("trips", {"select": "id,version,data", "deleted_at": "is.null", "order": "id,version"}))

    def trips(self):
        latest = {}
        for r in self._trip_rows():
            latest[r["id"]] = r["data"]
        return list(latest.values())

    def trip_ids(self):
        return {r["id"] for r in self.rest.get_all("trips", self._mine("trips", {"select": "id", "order": "id"}))}

    def trip_versions(self):
        out = {}
        for r in self._trip_rows():
            out.setdefault(r["id"], []).append(r["version"])
        return out

    def check_rows(self, table):
        if table == "trips":
            return [(f"trips:{r['id']}", r["data"], None) for r in self._trip_rows()]
        keys = cols.COLS[table].key
        out = []
        for raw in self._raw(table):
            rec = cols.from_row(table, raw)
            out.append((f"{table}:" + " ".join(str(rec.get(k)) for k in keys), rec, None))
        return out

    def check_quotes(self):
        return [(f"quotes:{raw['quote_id']}", cols.from_row("quotes", raw), None) for raw in self._raw("quotes")]

    # ---- add ----
    def _stored(self, table, rows):
        """{key tuple: comparable stored row} for the keys of these rows. The first key column picks the rows in chunks,
        the whole key is matched here."""
        kc = self._keycols(table)
        first = sorted({str(r[kc[0]]) for r in rows if r[kc[0]] is not None})
        want = {tuple(r[c] for c in kc) for r in rows}
        out = {}
        for i in range(0, len(first), self.IN_CHUNK):
            part = first[i:i + self.IN_CHUNK]
            for raw in self.rest.get_all(table, self._mine(table, {"select": "*", "order": ORDER.get(table, "seq"),
                                                                   kc[0]: "in.(" + ",".join(quoted(v) for v in part) + ")"})):
                k = tuple(raw.get(c) for c in kc)
                if k in want:
                    out[k] = cols.to_row(table, cols.from_row(table, raw))
        return out

    def add(self, table, rows, keys, replace=False):
        """Write the rows whose key is not stored. With replace a stored row is superseded: places and profiles merge as
        build_map.py does (a later value that is not null wins), the other tables take the new row."""
        if not rows:
            return AddResult()
        kc = self._keycols(table)
        new = [cols.to_row(table, r) for r in rows]
        if table in PRIVATE_TABLES:
            new = [{**r, "owner_id": self.owner()} for r in new]
        keyf = lambda row: tuple(row[c] for c in kc)
        strip = lambda row: {k: v for k, v in row.items() if k not in ("origin", "owner_id")}
        stored = self._stored(table, new)
        res, pending = classify([keyf(r) for r in new], new, stored, lambda a, b: strip(a) == strip(b), replace)
        if replace and table in ("places", "profiles"):
            fold = cols.fold_places if table == "places" else cols.fold_profiles
            for k, i in list(pending.items()):
                copies = [rows[j] for j in range(len(rows)) if keyf(new[j]) == k]
                pre = [cols.from_row(table, stored[k])] if k in stored else []
                new[i] = cols.to_row(table, fold(pre + copies)[0])
        write = [new[i] for i in pending.values()]
        conflict = ",".join((["owner_id"] if table in PRIVATE_TABLES else []) + kc)
        if table == "places":
            self._stubs(write)
        if replace:
            self.rest.insert(table, write, on_conflict=conflict, resolution="merge-duplicates")
            return res
        got = self.rest.insert(table, write, on_conflict=conflict, returning=conflict, resolution="ignore-duplicates")
        if len(got) < len(write):
            won = {tuple(g.get(c) for c in kc) for g in got}
            for k, i in pending.items():
                if k not in won:
                    res.skips.append((i, k, "stored by another writer"))
            res.skips.sort(key=lambda s: s[0])
            res.added = len(got)
        return res

    def _stubs(self, places):
        codes = sorted({p["airport_code"] for p in places if p.get("airport_code")})
        if codes:
            self.rest.insert("airports", [{"code": c} for c in codes], on_conflict="code", resolution="ignore-duplicates")

    def add_quotes(self, rows, name):
        """Hand the quotes to the add_quotes function with their computed fields. A quote that is stored already moves only
        last_seen and seen_count, so it counts as a duplicate here."""
        res = AddResult()
        if not rows:
            return res
        cfg = self.doc("trip.json")[0] or {}
        stem = name[:-6] if name.endswith(".jsonl") else name
        built = [cols.quote_row({**r, "agent": stem}, cfg) for r in rows]
        step = self.rest.BATCH_ROWS
        for a in range(0, len(built), step):
            b = min(a + step, len(built))
            try:
                out = self.rest.rpc("add_quotes", {"rows": built[a:b]})
            except RestError as e:
                raise RestError(f"quotes rows {a} to {b - 1} refused: {e}")
            res.added += out["added"]
        res.duplicates = len(rows) - res.added
        return res

    # ---- single rows ----
    def append(self, table, rec):
        row = cols.usage_row(rec) if table == "agent_usage" else cols.to_row(table, rec)
        if table in PRIVATE_TABLES:
            row = {**row, "owner_id": self.owner()}
        self.rest.insert(table, [row])

    def update(self, table, key, patch, check=None):
        raw = self.rest.get_all(table, self._mine(table, {"select": "*", "id": "eq." + str(key)}))
        if not raw:
            return None
        old = cols.from_row(table, raw[0])
        new = {**old, **patch}
        errs = check(new) if check else []
        if errs:
            raise Refused(f"{key}: " + "; ".join(errs))
        self.rest.patch(table, self._mine(table, {"id": "eq." + str(key)}), cols.to_row(table, new))
        return old, new

    def put_doc(self, name, data, version):
        table, where = self._docs(name)
        if version is None:
            row = {"name": self._dn(name), "version": 1, "data": data}
            if table == "user_documents":
                row["owner_id"] = self.owner()
            got = self.rest.insert(table, [row], on_conflict="owner_id,name" if table == "user_documents" else "name",
                                   returning="name", resolution="ignore-duplicates")
            return len(got) == 1
        got = self.rest.patch(table, {**where, "version": "eq." + str(version)},
                              {"version": version + 1, "updated_at": now_utc(), "data": data}, returning="name")
        return len(got) == 1

    def query(self, table, eq=(), in_=(), gte=(), select=None, limit=None):
        eq, in_, gte, select, limit = query_args(table, eq, in_, gte, select, limit)
        order = {"airports": "code", "trips": "id,version", "trips_latest": "id", "derived_options": "rank", "documents": "name", "user_documents": "name",
                 "inbox": "id", "tasks": "id", "leases": "name", "derive_state": "dirty_at"}.get(table, ORDER.get(table, "seq"))
        params = self._mine(table, {"select": ",".join(select) if select else "*", "order": order})
        tests = [(c, "eq." + v) for c, v in eq] + [(c, "in.(" + ",".join(quoted(x) for x in vs) + ")") for c, vs in in_]             + [(c, "gte." + v) for c, v in gte]
        for c, t in tests:
            if c in params:
                if c == "owner_id":
                    raise Refused("owner_id is set from admins, a query cannot name another owner")
                raise Refused(f"{c} has two tests, a query takes one test per column")
            params[c] = t
        return self.rest.get_all(table, params, limit=limit)

    def recompute_quotes(self, cfg):
        """Patch build_qid and usable on every quote whose value changes under cfg. Returns how many were patched."""
        n = 0
        for raw in self._raw("quotes"):
            now = cols.quote_row(cols.from_row("quotes", raw), cfg)
            patch = {c: now[c] for c in ("build_qid", "usable") if now[c] != raw.get(c)}
            if patch:
                self.rest.patch("quotes", self._mine("quotes", {"quote_id": "eq." + raw["quote_id"]}), patch)
                n += 1
        return n

    # ---- trips ----
    def save_trip(self, t):
        return self.rest.rpc("save_trip", {"trip": t})

    def delete_trip(self, ids):
        found = {}
        for tid in sorted(ids):
            got = self.rest.patch("trips", self._mine("trips", {"id": "eq." + tid, "deleted_at": "is.null"}), {"deleted_at": now_utc()}, returning="version")
            if got:
                found[tid] = len(got)
        return found

    def remove(self, table, match):
        """Delete the rows whose fields equal match. Returns the rows that were there."""
        if table == "quotes":
            params = self._mine("quotes", {"quote_id": "eq." + match["quote_id"]})
            raw = self.rest.get_all("quotes", {"select": "*", **params})
        else:
            m = cols.COLS[table]
            params = self._mine(table, {m.field_to_col[k]: ("is.null" if v is None else "eq." + str(v)) for k, v in match.items()})
            raw = self.rest.get_all(table, {"select": "*", **params})
        if raw:
            self.rest.delete(table, params)
        return [cols.from_row(table, r) for r in raw]

    def restore_trip(self, tid, versions):
        """Undo delete_trip: the versions come back with deleted_at null. Returns how many came back."""
        got = self.rest.patch("trips", self._mine("trips", {"id": "eq." + tid, "deleted_at": "not.is.null"}), {"deleted_at": None}, returning="version")
        return len(got)

    # ---- the inbox ----
    def inbox_new(self):
        out = []
        for e in self.rest.get_all("inbox", self._mine("inbox", {"select": "id,file,rows", "status": "eq.new", "order": "id"})):
            lines = []
            for n, r in enumerate(e["rows"] or [], 1):
                if isinstance(r, str):
                    try:
                        r = json.loads(r)
                    except json.JSONDecodeError as ex:
                        lines.append((n, None, f"not JSON ({ex.msg})"))
                        continue
                lines.append((n, r, None))
            out.append({"id": e["id"], "file": e["file"] or f"inbox-{e['id']}.jsonl", "lines": lines})
        return out

    def inbox_mark(self, entry_id, status, reason, rejected):
        self.rest.patch("inbox", self._mine("inbox", {"id": "eq." + str(entry_id)}), {"status": status, "reason": reason, "rejected": rejected or None})
        return f"inbox row {entry_id}"
