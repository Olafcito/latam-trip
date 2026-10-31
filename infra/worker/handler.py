"""latam-trip-worker. EventBridge invokes it with {"action": ...}. It holds no data and has no endpoint.

hello: the phase 0 check. Runs the unchanged pipeline on the data bundled with --with-data, and tries the route to Supabase.
"""
import os, shutil, sys, tempfile, time, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "plugin", "scripts"))
import tripdb  # noqa: E402


def version():
    with open(os.path.join(ROOT, "version.txt"), encoding="utf-8") as fh:
        return fh.read().strip()


def reach(url):
    """Any HTTP status means the route works."""
    start = time.time()
    try:
        status = urllib.request.urlopen(url, timeout=20).status
    except urllib.error.HTTPError as e:
        status = e.code
    except OSError as e:
        return {"failed": repr(e), "seconds": round(time.time() - start, 2)}
    return {"http": status, "seconds": round(time.time() - start, 2)}


def tree_size(path):
    return sum(os.path.getsize(os.path.join(d, n)) for d, _, names in os.walk(path) for n in names)


def hello():
    work = os.path.join(tempfile.gettempdir(), "work")
    shutil.rmtree(work, ignore_errors=True)
    shutil.copytree(os.path.join(ROOT, "data", "sources"), os.path.join(work, "data", "sources"))
    start = time.time()
    tripdb.cmd_build(tripdb.Paths(work), sync=False)
    seconds = round(time.time() - start, 2)
    return {"version": version(), "python": sys.version.split()[0], "executable": sys.executable, "build_seconds": seconds,
            "built_mb": round(tree_size(os.path.join(work, "data", "built")) / 1e6, 2),
            "web_mb": round(tree_size(os.path.join(work, "data", "web")) / 1e6, 2),
            "web_files": len(os.listdir(os.path.join(work, "data", "web"))),
            "supabase": reach(os.environ["SUPABASE_URL"] + "/rest/v1/")}


def handler(event, context):
    action = (event or {}).get("action")
    if action == "hello":
        return hello()
    raise ValueError(f"unknown action {action!r}")
