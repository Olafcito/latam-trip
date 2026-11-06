"""Apply the files of supabase/migrations to the project, once each, in name order.

Usage: uv run --quiet --no-project --with "psycopg[binary]" python -X utf8 supabase/migrate.py [--helpers]
Reads SUPABASE_PASSWORD and SUPABASE_URL from the environment or from the git ignored .env at the repo root.
The project ref comes from the URL. Applied files are recorded in public.schema_migrations.
--helpers also installs test_helpers.sql, and refuses once the cutover_done document exists.
The password is never printed.
"""
import glob, os, re, sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
POOLER = "aws-0-eu-west-1.pooler.supabase.com"


def load_env():
    env = dict(os.environ)
    path = os.path.join(ROOT, ".env")
    if os.path.exists(path):
        with open(path, encoding="utf-8") as fh:
            for line in fh:
                m = re.match(r"\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$", line)
                if m and m.group(1) not in env:
                    env[m.group(1)] = m.group(2).strip("'\"")
    return env


def connect(env):
    import psycopg
    pw, url = env.get("SUPABASE_PASSWORD"), env.get("SUPABASE_URL", "")
    m = re.match(r"https://([a-z0-9]+)\.supabase\.co", url)
    if not pw or not m:
        sys.exit("migrate: SUPABASE_PASSWORD and SUPABASE_URL must be set")
    return psycopg.connect(host=POOLER, port=5432, user=f"postgres.{m.group(1)}", password=pw, dbname="postgres",
                           sslmode="require", autocommit=False, connect_timeout=20)


def apply_file(cur, path):
    """Run one migration file on the cursor. It does not commit and does not record the file in schema_migrations."""
    with open(path, encoding="utf-8") as fh:
        cur.execute(fh.read())


def cutover_done(cur):
    cur.execute("select to_regclass('public.documents')")
    if cur.fetchone()[0] is None:
        return False
    cur.execute("select 1 from public.documents where name = 'cutover_done'")
    return cur.fetchone() is not None


def main(argv):
    helpers = "--helpers" in argv
    con = connect(load_env())
    with con, con.cursor() as cur:
        if helpers and cutover_done(cur):
            sys.exit("migrate: cutover_done exists, --helpers refused")
        cur.execute("create table if not exists public.schema_migrations (name text primary key, applied_at timestamptz not null default now())")
        cur.execute("select name from public.schema_migrations")
        done = {r[0] for r in cur.fetchall()}
        for f in sorted(glob.glob(os.path.join(HERE, "migrations", "*.sql"))):
            name = os.path.basename(f)
            if name in done:
                continue
            apply_file(cur, f)
            cur.execute("insert into public.schema_migrations (name) values (%s)", (name,))
            print(f"applied {name}")
        if helpers:
            with open(os.path.join(HERE, "test_helpers.sql"), encoding="utf-8") as fh:
                cur.execute(fh.read())
            print("installed test_helpers.sql")
    print("migrate: done")


if __name__ == "__main__":
    main(sys.argv[1:])
