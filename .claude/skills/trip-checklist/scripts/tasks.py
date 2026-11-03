"""The claude-task checklist on the tasks table (see docs/claude-tasks.md).

Usage:
  python3 -I plugin/skills/trip-checklist/scripts/tasks.py list                      open and working tasks: number, type, status, title
  python3 -I plugin/skills/trip-checklist/scripts/tasks.py show N                    the task JSON of task N
  python3 -I plugin/skills/trip-checklist/scripts/tasks.py start N                   set task N to working
  python3 -I plugin/skills/trip-checklist/scripts/tasks.py done N SUMMARY_FILE [--outputs a,b] [--root DIR]
                                                    write SUMMARY_FILE as the result of task N, mark it done, log it with tripdb log-task
Needs SUPABASE_URL and SUPABASE_SECRET_KEY in the environment or in .env at the root. Standard library only.
"""
import datetime as dt, json, os, subprocess, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, os.path.join(HERE, "..", "..", "..", "scripts"))
import tripdb_store  # noqa: E402

TYPES = {"flight_prices", "stay_prices", "experience_research", "place_research", "lists_update", "question", "refresh",
         "fix_parser", "import_quotes"}
# The fields a task of a type must carry. A stay_prices task prices rooms of a lodging that exists, so it names them.
NEEDS = {"stay_prices": ("lodging_id", "room_ids", "check_in", "check_out")}


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
    t = task_of(get_row(rest, n))
    done_at = dt.datetime.now(dt.timezone.utc).isoformat(timespec="seconds")
    rest.patch("tasks", {"id": f"eq.{int(n)}"}, {"status": "done", "result": body, "done_at": done_at})
    first = next((l.strip("# ").strip() for l in body.splitlines() if l.strip()), "")
    print(f"done #{n}")
    args = ["log-task", "--issue", str(int(n)), "--summary", first[:300], "--outputs", ",".join(outputs)]
    tmp = None
    if t:
        fd, tmp = tempfile.mkstemp(prefix=f"task-{n}-", suffix=".json")
        with os.fdopen(fd, "w", encoding="utf-8") as f:
            json.dump(t, f, ensure_ascii=False)
        args += ["--type", t["type"], "--task", tmp]
    try:
        run_tripdb(root, args)
    finally:
        if tmp:
            os.remove(tmp)


def main(a, rest=None):
    root = os.path.abspath(a[a.index("--root") + 1]) if "--root" in a else os.getcwd()
    outs = a[a.index("--outputs") + 1].split(",") if "--outputs" in a else []
    a = a or ["list"]
    if a[0] not in ("list", "show", "start", "done"):
        sys.exit(__doc__)
    rest = rest or rest_of(root)
    if a[0] == "list":
        cmd_list(rest)
    elif a[0] == "show":
        cmd_show(rest, a[1])
    elif a[0] == "start":
        cmd_start(rest, a[1])
    else:
        cmd_done(rest, a[1], a[2], outs, root)


if __name__ == "__main__":
    main(sys.argv[1:])
