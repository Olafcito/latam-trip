"""Packs latam-trip-worker into one zip. Paths keep their repo form, so PIPELINE in tripdb.py resolves.

Usage: python -I -X utf8 infra/build_zip.py --out PATH [--with-data]
  --with-data adds data/sources, for the phase 0 check only. The real worker holds no data.
"""
import glob, os, subprocess, sys, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
CODE = ("plugin/scripts/tripdb*.py", "plugin/skills/flight-crawl-orchestrator/scripts/*.py", "infra/worker/*.py")


def code_files():
    for pattern in CODE:
        for path in sorted(glob.glob(os.path.join(ROOT, pattern))):
            if not os.path.basename(path).startswith("test_"):
                yield path


def data_files():
    for folder, _, names in os.walk(os.path.join(ROOT, "data", "sources")):
        for name in sorted(names):
            yield os.path.join(folder, name)


def git_sha():
    return subprocess.run(["git", "rev-parse", "--short", "HEAD"], cwd=ROOT, capture_output=True, text=True, check=True).stdout.strip()


def build(out, with_data=False):
    files = list(code_files()) + (list(data_files()) if with_data else [])
    with zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED) as z:
        for path in files:
            z.write(path, os.path.relpath(path, ROOT).replace(os.sep, "/"))
        z.writestr("version.txt", git_sha() + "\n")
    return len(files)


if __name__ == "__main__":
    args = sys.argv[1:]
    print(build(args[args.index("--out") + 1], "--with-data" in args), "files")
