"""The claude-task checklist on GitHub issues (see docs/claude-tasks.md).

Usage:
  python3 -I src/tasks.py list                      open tasks: number, type, title
  python3 -I src/tasks.py show N                    the task JSON of issue N
  python3 -I src/tasks.py done N SUMMARY_FILE [--outputs a,b] [--root DIR]
                                                    comment SUMMARY_FILE on issue N, close it, log it in task_log.jsonl
  python3 -I src/tasks.py url TASK_JSON_FILE        the prefilled new-issue link the app would open (for testing)
Needs the gh CLI (REST only).
"""
import datetime as dt, json, os, re, subprocess, sys, urllib.parse

REPO = "Olafcito/latam-trip"
LABEL = "claude-task"
TYPES = {"flight_prices", "stay_prices", "experience_research", "place_research", "lists_update", "question"}


def gh(*a, inp=None):
    r = subprocess.run(["gh", "api", *a], input=inp, capture_output=True, text=True)
    if r.returncode:
        sys.exit(r.stderr.strip())
    return json.loads(r.stdout) if r.stdout.strip() else None


def task_of(body):
    m = re.search(r"```json\s*(\{.*?\})\s*```", body or "", re.S)
    if not m:
        return None
    t = json.loads(m.group(1))
    if t.get("type") not in TYPES:
        raise ValueError(f"unknown task type {t.get('type')}")
    return t


def cmd_list():
    issues = gh(f"repos/{REPO}/issues?labels={LABEL}&state=open&per_page=100")
    for i in sorted(issues, key=lambda i: i["number"]):
        try:
            t = task_of(i["body"])
            kind = t["type"] if t else "NO TASK JSON"
        except (ValueError, json.JSONDecodeError) as e:
            kind = f"BAD TASK ({e})"
        print(f"#{i['number']}\t{kind}\t{i['title']}")
    print(f"{len(issues)} open")


def cmd_show(n):
    i = gh(f"repos/{REPO}/issues/{n}")
    print(json.dumps(task_of(i["body"]), ensure_ascii=False, indent=1))


def cmd_done(n, summary_file, outputs, root):
    body = open(summary_file, encoding="utf-8").read()
    t = task_of(gh(f"repos/{REPO}/issues/{n}")["body"])
    gh(f"repos/{REPO}/issues/{n}/comments", "-f", f"body={body}")
    gh(f"repos/{REPO}/issues/{n}", "-X", "PATCH", "-f", "state=closed", "-f", "state_reason=completed")
    first = next((l.strip("# ").strip() for l in body.splitlines() if l.strip()), "")
    with open(os.path.join(root, "data", "network", "task_log.jsonl"), "a", encoding="utf-8") as f:
        f.write(json.dumps({"issue": int(n), "type": t and t["type"], "task": t,
                            "done_at": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"),
                            "summary": first[:300], "outputs": outputs}, ensure_ascii=False) + "\n")
    print(f"closed #{n}")


def cmd_url(path):
    t = json.load(open(path, encoding="utf-8"))
    title = f"[{t['type']}] " + (t.get("note") or t.get("place") or t.get("text") or "")[:80]
    body = f"{t.get('note') or 'Task from the trip app.'}\n\n```json\n{json.dumps(t, ensure_ascii=False)}\n```\n"
    q = urllib.parse.urlencode({"labels": LABEL, "title": title, "body": body})
    print(f"https://github.com/{REPO}/issues/new?{q}")


if __name__ == "__main__":
    a = sys.argv[1:]
    root = os.path.abspath(a[a.index("--root") + 1]) if "--root" in a else os.getcwd()
    outs = a[a.index("--outputs") + 1].split(",") if "--outputs" in a else []
    if not a or a[0] == "list":
        cmd_list()
    elif a[0] == "show":
        cmd_show(a[1])
    elif a[0] == "done":
        cmd_done(a[1], a[2], outs, root)
    elif a[0] == "url":
        cmd_url(a[1])
    else:
        sys.exit(__doc__)
