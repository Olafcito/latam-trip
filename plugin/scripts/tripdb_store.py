"""The REST client of the Supabase project, standard library only (spec 5).

Rest(url, key) talks to PostgREST and Storage with the secret key on the apikey header. A read pages until the
Content-Range total is reached, so a read that fails halfway raises and never returns part of a table.
The key is never printed and never put in a message.
"""
import json, os, re, time, urllib.error, urllib.parse, urllib.request


class RestError(Exception):
    pass


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
        data = raw if raw is not None else (None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8"))
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
    def get_all(self, table, params=None, page=None):
        """Every row of a read, in the order the params ask for. Pages until Content-Range reaches the total."""
        page = page or self.PAGE
        q = _query(params)
        rows, total = [], None
        while total is None or len(rows) < total:
            start = len(rows)
            _, hdr, raw = self._call("GET", f"/rest/v1/{table}" + ("?" + q if q else ""), retry=True, headers={
                "Range-Unit": "items", "Range": f"{start}-{start + page - 1}", "Prefer": "count=exact"})
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
        return rows

    # ---- writes ----
    def insert(self, table, rows, on_conflict=None, returning=None, resolution=None):
        """Insert in batches. returning is a column list to get back, or None for nothing. Stops on the first failed batch."""
        out, batch, size, start = [], [], 0, 0
        for i, r in enumerate(rows):
            n = len(json.dumps(r, ensure_ascii=False))
            if batch and (len(batch) >= self.BATCH_ROWS or size + n > self.BATCH_BYTES):
                out += self._insert_batch(table, batch, on_conflict, returning, resolution, start, i)
                batch, size, start = [], 0, i
            batch.append(r)
            size += n
        if batch:
            out += self._insert_batch(table, batch, on_conflict, returning, resolution, start, start + len(batch))
        return out

    def _insert_batch(self, table, batch, on_conflict, returning, resolution, a, b):
        prefer = ["return=representation" if returning else "return=minimal"]
        if resolution:
            prefer.append(f"resolution={resolution}")
        q = {}
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

    def patch(self, table, params, body):
        self._call("PATCH", f"/rest/v1/{table}?{_query(params)}", body=body, headers={"Prefer": "return=minimal"})

    def delete(self, table, params):
        self._call("DELETE", f"/rest/v1/{table}?{_query(params)}", headers={"Prefer": "return=minimal"})

    def rpc(self, name, body=None):
        _, _, raw = self._call("POST", f"/rest/v1/rpc/{name}", body={} if body is None else body)
        return self._json(raw)

    # ---- storage ----
    def storage_put(self, bucket, path, data, content_type="application/json", upsert=True):
        if isinstance(data, str):
            data = data.encode("utf-8")
        self._call("POST", f"/storage/v1/object/{bucket}/{urllib.parse.quote(path)}", raw=data,
                   headers={"Content-Type": content_type, "x-upsert": "true" if upsert else "false"})

    def storage_get(self, bucket, path):
        _, _, raw = self._call("GET", f"/storage/v1/object/{bucket}/{urllib.parse.quote(path)}", retry=True)
        return raw
