"""Copy the plugin's skills and agents into .claude/ so Claude Code loads them automatically in this repo,
including Claude Code on the web (cloud sessions don't load plugins from settings). plugin/ stays the source:
edit there, then run this.

Usage: python3 -I src/sync_claude_dir.py [--root DIR]
"""
import os, shutil, sys

a = sys.argv[1:]
ROOT = os.path.abspath(a[a.index("--root") + 1]) if "--root" in a else os.getcwd()
src, dst = os.path.join(ROOT, "plugin"), os.path.join(ROOT, ".claude")
ignore = shutil.ignore_patterns("__pycache__", "*.pyc")
for kind in ("skills", "agents"):
    target = os.path.join(dst, kind)
    if os.path.exists(target):
        shutil.rmtree(target)
    shutil.copytree(os.path.join(src, kind), target, ignore=ignore)
    print(kind, sorted(os.listdir(target)))
