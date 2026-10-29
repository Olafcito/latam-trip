"""Kept for old instructions: hands stay-price-worker rows to tripdb add-stays, which writes data/sources/stays.jsonl.

Usage: python -I -X utf8 plugin/skills/trip-checklist/scripts/stays_ingest.py FILE [--root DIR] [--usd 6.45] [--eur 7.46]
Prefer: python -I -X utf8 plugin/scripts/tripdb.py --root . add-stays FILE [--usd 6.45] [--eur 7.46]
"""
import os, subprocess, sys

a = sys.argv[1:]
root = os.path.abspath(a[a.index("--root") + 1]) if "--root" in a else os.getcwd()
rest = [x for i, x in enumerate(a) if x != "--root" and (i == 0 or a[i - 1] != "--root")]
tripdb = os.path.join(root, "plugin", "scripts", "tripdb.py")
sys.exit(subprocess.call([sys.executable, "-I", "-X", "utf8", tripdb, "--root", root, "add-stays", *rest]))
