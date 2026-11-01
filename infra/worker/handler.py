"""latam-trip-worker. EventBridge invokes it with {"action": ...}. It holds no data and has no endpoint.

hello: the phase 0 check. Runs the unchanged pipeline on the data bundled with --with-data, and tries the route to Supabase.
build: one EventBridge start of the build (spec 7). It decides, takes the lease, builds and uploads.
backup: a dump of every table, packed and written to the private backup bucket (spec 12).
"""
import datetime, os, shutil, sys, tarfile, tempfile, time, urllib.error, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(ROOT, "plugin", "scripts"))
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import tripdb  # noqa: E402
import tripdb_store as store  # noqa: E402
import steps  # noqa: E402

SECRET_PARAM = "/latam-trip/supabase-secret-key"


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


def load_secret():
    """The secret key lives in SSM. It is read once per container and kept only in the environment."""
    if os.environ.get("SUPABASE_SECRET_KEY"):
        return
    import boto3
    reply = boto3.client("ssm").get_parameter(Name=SECRET_PARAM, WithDecryption=True)
    os.environ["SUPABASE_SECRET_KEY"] = reply["Parameter"]["Value"].strip()


def rest():
    load_secret()
    return store.Rest(os.environ["SUPABASE_URL"], os.environ["SUPABASE_SECRET_KEY"])


def build(context):
    work = os.path.join(tempfile.gettempdir(), "work")
    holder = getattr(context, "aws_request_id", None) or "local"
    return steps.run_once(rest(), work, holder, version=version())


def backup():
    stamp = datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H-%M-%SZ")
    base = os.path.join(tempfile.gettempdir(), "backup")
    shutil.rmtree(base, ignore_errors=True)
    dump = os.path.join(base, "dump")
    counts = tripdb.cmd_dump(dump, rest=rest())
    archive = os.path.join(base, f"{stamp}.tar.gz")
    with tarfile.open(archive, "w:gz") as tar:
        tar.add(dump, arcname="dump")
    import boto3
    key = f"backups/{stamp}.tar.gz"
    boto3.client("s3").upload_file(archive, os.environ["BACKUP_BUCKET"], key)
    return {"key": key, "bytes": os.path.getsize(archive), "rows": counts}


def handler(event, context):
    action = (event or {}).get("action")
    if action == "hello":
        return hello()
    if action == "build":
        return build(context)
    if action == "backup":
        return backup()
    raise ValueError(f"unknown action {action!r}")
