#!/usr/bin/env bash
# Starts the local Supabase stack, applies every migration and the test helpers to it, and writes the env lines the
# database tests need to a file outside the repo. Needs Docker. Safe to run again: a running stack is reused and
# migrate.py skips what schema_migrations already lists.
# Usage: bash supabase/local_up.sh [ENV_FILE]
# The keys of the local stack are the CLI's fixed local defaults, never the project's.
# Then: TRIPDB_DB_TESTS=1 TRIPDB_LIVE_TESTS=1 TRIPDB_ENV_FILE=<ENV_FILE> and the test command.
set -euo pipefail
export MSYS_NO_PATHCONV=1
winpath() { command -v cygpath >/dev/null 2>&1 && cygpath -m "$1" || printf '%s' "$1"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# pinned, so a CLI release never changes the stack under the tests
CLI_VERSION=2.122.1
SUPABASE=(npx --yes "supabase@$CLI_VERSION")
WORKDIR="$(winpath "$ROOT/supabase/local")"
TMP="${RUNNER_TEMP:-${TMPDIR:-${TEMP:-/tmp}}}"
OUT="${1:-$TMP/latam-trip-local.env}"
UV="${UV:-uv}"

case "$(cd "$(dirname "$OUT")" 2>/dev/null && pwd)/" in
  "$ROOT"/*) echo "local_up: the env file must be outside the repo" >&2; exit 1 ;;
esac

echo ">> starting the local stack with the Supabase CLI $CLI_VERSION"
"${SUPABASE[@]}" start --workdir "$WORKDIR"

STATUS="$("${SUPABASE[@]}" status --workdir "$WORKDIR" -o env | tr -d '\r')"
val() { printf '%s\n' "$STATUS" | sed -n "s/^$1=\"\{0,1\}\([^\"]*\)\"\{0,1\}$/\1/p" | head -n1; }
API_URL="$(val API_URL)"
DB_URL="$(val DB_URL)"
SECRET="$(val SECRET_KEY)"; [ -n "$SECRET" ] || SECRET="$(val SERVICE_ROLE_KEY)"
PUBLISHABLE="$(val PUBLISHABLE_KEY)"; [ -n "$PUBLISHABLE" ] || PUBLISHABLE="$(val ANON_KEY)"
for v in API_URL DB_URL SECRET PUBLISHABLE; do
  [ -n "${!v}" ] || { echo "local_up: supabase status gave no $v" >&2; exit 1; }
done
case "$DB_URL" in
  *127.0.0.1*|*localhost*) ;;
  *) echo "local_up: the database URL is not on this machine, refusing" >&2; exit 1 ;;
esac

umask 077
{
  echo "SUPABASE_URL=$API_URL"
  echo "SUPABASE_DB_URL=$DB_URL"
  echo "SUPABASE_SECRET_KEY=$SECRET"
  echo "SUPABASE_PUBLISHABLE_KEY=$PUBLISHABLE"
} > "$OUT"

echo ">> applying the migrations and the test helpers"
TRIPDB_ENV_FILE="$(winpath "$OUT")" "$UV" run --quiet --no-project --with "psycopg[binary]" \
  python -I -X utf8 "$(winpath "$ROOT/supabase/migrate.py")" --db-url "$DB_URL" --helpers

echo "local_up: env written to $OUT"
