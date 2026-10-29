"""Copy the plugin's skills and agents into .claude/ so Claude Code loads them automatically in this repo,
including Claude Code on the web (cloud sessions don't load plugins from settings). plugin/ stays the source:
edit there, then run this.

Skills installed with `npx skills add` are listed in skills-lock.json and are left alone.

Usage: python3 -I src/sync_claude_dir.py [--root DIR]
"""
import json, os, shutil, sys

a = sys.argv[1:]
ROOT = os.path.abspath(a[a.index("--root") + 1]) if "--root" in a else os.getcwd()
src, dst = os.path.join(ROOT, "plugin"), os.path.join(ROOT, ".claude")
lock = os.path.join(ROOT, "skills-lock.json")
external = set(json.load(open(lock))["skills"]) if os.path.exists(lock) else set()
ignore = shutil.ignore_patterns("__pycache__", "*.pyc")
for kind in ("skills", "agents"):
    target = os.path.join(dst, kind)
    keep = external if kind == "skills" else set()
    os.makedirs(target, exist_ok=True)
    for name in os.listdir(target):
        if name not in keep:
            path = os.path.join(target, name)
            shutil.rmtree(path) if os.path.isdir(path) else os.remove(path)
    for name in os.listdir(os.path.join(src, kind)):
        if name in keep:
            sys.exit(f"{kind}/{name} exists in plugin/ and in skills-lock.json, rename one of them")
        s = os.path.join(src, kind, name)
        shutil.copytree(s, os.path.join(target, name), ignore=ignore) if os.path.isdir(s) else shutil.copy2(s, target)
    print(kind, sorted(n for n in os.listdir(target) if n not in keep), f"(+{len(keep)} external)" if keep else "")
