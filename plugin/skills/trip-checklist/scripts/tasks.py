"""The claude-task checklist on the tasks table (see docs/claude-tasks.md).

Usage:
  python3 -I plugin/skills/trip-checklist/scripts/tasks.py list                      open and working tasks: number, type, status, title
  python3 -I plugin/skills/trip-checklist/scripts/tasks.py show N                    the task JSON of task N
  python3 -I plugin/skills/trip-checklist/scripts/tasks.py start N                   set task N to working
  python3 -I plugin/skills/trip-checklist/scripts/tasks.py done N SUMMARY_FILE [--outputs a,b] [--root DIR]
                                                    write SUMMARY_FILE as the result of task N, mark it done, log it with tripdb log-task
                                                    (a task the data already closed keeps its result and is only logged)
  python3 -I plugin/skills/trip-checklist/scripts/tasks.py wait [--every SECONDS] [--grace MINUTES]
                                                    poll until a task is for the PC, then print one JSON line per task and exit 0
  python3 -I plugin/skills/trip-checklist/scripts/tasks.py fail N REASON_FILE    set task N to failed with the file as its result
Needs SUPABASE_URL and SUPABASE_SECRET_KEY in the environment or in .env at the root. Standard library only.
"""
import datetime as dt, json, os, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "scripts"))
import tripdb_store  # noqa: E402

sys.path.insert(0, os.path.join(HERE, "..", "..", "..", ".."))
from latam_trip_mcp.runner import runs_in_cloud  # noqa: E402  (the rule for which task types a cloud routine takes)

TYPES = {"flight_prices", "stay_prices", "experience_research", "place_research", "lists_update", "question", "refresh",
         "fix_parser", "import_quotes", "booking", "stay_search", "stay_picks", "stay_details"}
# The fields a task of a type must carry. A stay_prices task prices rooms of a lodging that exists, so it names them.
NEEDS = {"stay_prices": ("lodging_id", "room_ids", "check_in", "check_out"), "booking": ("leg",),
         "stay_search": ("place_id", "check_in", "check_out"),
         "stay_picks": ("place_id", "check_in", "check_out"), "stay_details": ("lodging_id",)}
# The task log is public, in trip.db and the web data. A booking task's text says where the confirmation is and can
# carry a reference, a price or names, so only these fields of it are logged.
LOGGED = {"booking": ("type", "leg")}


def rest_of(root):
    env = tripdb_store.load_env(root)
    return tripdb_store.Rest(env.get("SUPABASE_URL"), env.get("SUPABASE_SECRET_KEY"))


def task_of(row):
    """The task JSON of a row. A row with no task JSON or an unknown type is an error the caller prints."""
    t = row.get("data")
    if not isinstance(t, dict):
        return None
    if t.get("type") not in TYPES:
        raise ValueError(f"unknown task type {t.get('type')}")
    return t


def logged(t):
    """The task JSON as the task log keeps it. A booking task keeps only its type and leg."""
    keep = LOGGED.get(t.get("type"))
    return {k: t[k] for k in keep if k in t} if keep else t


def missing(t):
    """The fields the task JSON lacks for its type. An old task can still be closed with done."""
    return [f for f in NEEDS.get(t.get("type"), ()) if t.get(f) in (None, "", [])]


def get_row(rest, n):
    rows = rest.get_all("tasks", {"id": f"eq.{int(n)}", "select": "*"})
    if not rows:
        sys.exit(f"no task {n}")
    return rows[0]


def cmd_list(rest):
    rows = rest.get_all("tasks", {"status": "in.(open,working)", "select": "id,type,status,title,data", "order": "id"})
    for r in rows:
        try:
            t = task_of(r)
            kind = t["type"] if t else "NO TASK JSON"
            if t and missing(t):
                kind = f"BAD TASK ({t['type']} needs {', '.join(missing(t))})"
        except ValueError as e:
            kind = f"BAD TASK ({e})"
        print(f"#{r['id']}\t{kind}\t{r['status']}\t{r['title']}")
    print(f"{len(rows)} open")


def cmd_show(rest, n):
    print(json.dumps(task_of(get_row(rest, n)), ensure_ascii=False, indent=1))


def cmd_start(rest, n):
    get_row(rest, n)
    rest.patch("tasks", {"id": f"eq.{int(n)}"}, {"status": "working"})
    print(f"started #{n}")


def run_tripdb(root, args):
    cmd = [sys.executable, "-I", "-X", "utf8", os.path.join(root, "plugin", "scripts", "tripdb.py"), "--root", root, *args]
    subprocess.run(cmd, check=True, env={**os.environ, "TRIPDB_STORE": "supabase"})


def cmd_done(rest, n, summary_file, outputs, root):
    body = open(summary_file, encoding="utf-8").read()
    row = get_row(rest, n)
    t = task_of(row)
    if row.get("status") == "done":
        # the database closed it already (a stay_details task whose lodging is complete), so its result stays
        print(f"already done by the data #{n}")
    else:
        done_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
        rest.patch("tasks", {"id": f"eq.{int(n)}"}, {"status": "done", "result": body, "done_at": done_at})
        print(f"done #{n}")
    first = next((l.strip("# ").strip() for l in body.splitlines() if l.strip()), "")
    if t and t.get("type") == "booking":
        # the log is public and Claude writes the summary and the outputs at close time, so a booking logs neither
        first, outputs = "Booked", []
    args = ["log-task", "--issue", str(int(n)), "--summary", first[:300], "--outputs", ",".join(outputs)]
    tmp = None
    if t:
        fd, tmp = tempfile.mkstemp(prefix=f"task-{n}-", suffix=".json")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(logged(t), f, ensure_ascii=False)
        args += ["--type", t["type"], "--task", tmp]
    try:
        run_tripdb(root, args)
    finally:
        if tmp:
            os.remove(tmp)


def cmd_fail(rest, n, reason_file):
    body = open(reason_file, encoding="utf-8").read()
    get_row(rest, n)
    done_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    rest.patch("tasks", {"id": f"eq.{int(n)}"}, {"status": "failed", "result": body, "done_at": done_at})
    print(f"failed #{n}")


def for_the_pc(row, grace_minutes, now):
    """A task the PC does: not a cloud type, or a cloud type the routine left open longer than the grace."""
    if not runs_in_cloud(row):
        return True
    made = tripdb_store.parse_time(row.get("created_at"))
    return made is not None and (now - made).total_seconds() > grace_minutes * 60


GIVE_UP = 10  # failed rounds in a row before wait stops, so a wrong key or a long outage is seen, not looped on


def cmd_wait(rest, every=60, grace=15, sleep=time.sleep, now=lambda: dt.datetime.now(dt.timezone.utc)):
    """Print nothing while no open task is for the PC. Then print one JSON line per task and return.
    A failed round is tried again. After GIVE_UP failed rounds in a row it prints one error line and exits 1."""
    failed = 0
    while True:
        try:
            rows = rest.get_all("tasks", {"status": "eq.open", "select": "id,type,title,data,created_at", "order": "id"})
            failed = 0
        except Exception as e:
            failed += 1
            if failed >= GIVE_UP:
                print(json.dumps({"error": f"the tasks table did not answer {failed} times in a row: {type(e).__name__}"}))
                sys.exit(1)
            rows = []
        mine = [r for r in rows if for_the_pc(r, grace, now())]
        if mine:
            for r in mine:
                t = r.get("data") if isinstance(r.get("data"), dict) else {}
                print(json.dumps({"id": r["id"], "type": r.get("type") or t.get("type"), "title": r.get("title")}, ensure_ascii=False))
            return
        sleep(every)


def main(a, rest=None):
    root = os.path.abspath(a[a.index("--root") + 1]) if "--root" in a else os.getcwd()
    outs = a[a.index("--outputs") + 1].split(",") if "--outputs" in a else []
    a = a or ["list"]
    if a[0] not in ("list", "show", "start", "done", "wait", "fail"):
        sys.exit(__doc__)
    rest = rest or rest_of(root)
    if a[0] == "list":
        cmd_list(rest)
    elif a[0] == "show":
        cmd_show(rest, a[1])
    elif a[0] == "start":
        cmd_start(rest, a[1])
    elif a[0] == "wait":
        flag = lambda k, d: float(a[a.index(k) + 1]) if k in a else d
        cmd_wait(rest, flag("--every", 60), flag("--grace", 15))
    elif a[0] == "fail":
        cmd_fail(rest, a[1], a[2])
    else:
        cmd_done(rest, a[1], a[2], outs, root)


if __name__ == "__main__":
    main(sys.argv[1:])
