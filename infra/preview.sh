#!/usr/bin/env bash
# Builds the planner with Supabase switched on and puts it under preview/ in the site bucket, so the real thing can be
# tried on a phone and a PC before the cutover. The root of the bucket, and so the site people open, is not touched.
# Reads SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY (the key that is safe in a browser) from .env. Uses AWS_PROFILE when set.
# Sign in redirects back to /preview/ only when it is on the redirect list of the Supabase project.
# Usage: bash infra/preview.sh
set -euo pipefail
export MSYS_NO_PATHCONV=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT/planner/dist"
command -v cygpath >/dev/null 2>&1 && DIST_DIR="$(cygpath -m "$DIST_DIR")"
BUCKET=s3://latam-trip-site
PREFIX=preview
REGION="${AWS_REGION:-eu-west-1}"
AWS=(aws --region "$REGION")

text() { tr -d '\r'; }
# one value of .env, without sourcing the file and without printing it
env_value() { grep -E "^$1=" "$ROOT/.env" | head -n1 | cut -d= -f2- | text | sed -e 's/^"//' -e 's/"$//'; }

SUPABASE_URL="$(env_value SUPABASE_URL)"
SUPABASE_PUBLISHABLE_KEY="$(env_value SUPABASE_PUBLISHABLE_KEY)"
[ -n "$SUPABASE_URL" ] && [ -n "$SUPABASE_PUBLISHABLE_KEY" ] || { echo "SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY must be set in .env" >&2; exit 1; }

# the built data files sit in the public Storage bucket web, under data/web/
export VITE_SUPABASE_URL="${SUPABASE_URL%/}"
export VITE_SUPABASE_KEY="$SUPABASE_PUBLISHABLE_KEY"
export VITE_DATA_BASE="${SUPABASE_URL%/}/storage/v1/object/public/web/"

(cd "$ROOT/planner" && npm run build)

DIST="$("${AWS[@]}" cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='latam-trip-site'].Id | [0]" --output text | text)"
[ -n "$DIST" ] && [ "$DIST" != None ] || { echo "The site distribution was not found." >&2; exit 1; }

"${AWS[@]}" s3 sync "$DIST_DIR" "$BUCKET/$PREFIX/" --only-show-errors \
  --exclude index.html --cache-control 'public,max-age=31536000,immutable'
"${AWS[@]}" s3 cp "$DIST_DIR/index.html" "$BUCKET/$PREFIX/index.html" --only-show-errors --cache-control no-cache
# old assets go last, so a page open during the upload still finds its files
"${AWS[@]}" s3 sync "$DIST_DIR" "$BUCKET/$PREFIX/" --only-show-errors --delete --size-only
"${AWS[@]}" cloudfront create-invalidation --distribution-id "$DIST" \
  --paths "/$PREFIX/*" --query Invalidation.Id --output text | text
echo "preview https://$("${AWS[@]}" cloudfront get-distribution --id "$DIST" --query Distribution.DomainName --output text | text)/$PREFIX/index.html"
