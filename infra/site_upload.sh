#!/usr/bin/env bash
# Uploads a built planner/dist to the site bucket and clears what must not stay cached.
# Hashed assets stay cached for a year. index.html is checked on every open. The data lives in Supabase and not in the build.
# Usage: SITE_DISTRIBUTION_ID=... bash infra/site_upload.sh
set -euo pipefail
export MSYS_NO_PATHCONV=1

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DIST_DIR="$ROOT/planner/dist"
command -v cygpath >/dev/null 2>&1 && DIST_DIR="$(cygpath -m "$DIST_DIR")"
BUCKET=s3://latam-trip-site
REGION="${AWS_REGION:-eu-west-1}"
AWS=(aws --region "$REGION")

"${AWS[@]}" s3 sync "$DIST_DIR" "$BUCKET" --only-show-errors \
  --exclude index.html --cache-control 'public,max-age=31536000,immutable'
"${AWS[@]}" s3 cp "$DIST_DIR/index.html" "$BUCKET/index.html" --only-show-errors --cache-control no-cache
# old assets go last, so a page open during the upload still finds its files
"${AWS[@]}" s3 sync "$DIST_DIR" "$BUCKET" --only-show-errors --delete --size-only
"${AWS[@]}" cloudfront create-invalidation --distribution-id "$SITE_DISTRIBUTION_ID" \
  --paths /index.html --query Invalidation.Id --output text
