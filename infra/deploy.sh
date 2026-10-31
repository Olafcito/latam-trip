#!/usr/bin/env bash
# Deploys latam-trip-worker to eu-west-1 from this PC. Uses AWS_PROFILE when set.
# The repo is public, so no account id or profile name goes in this file.
# Usage: bash infra/deploy.sh [--with-data]
set -euo pipefail
export MSYS_NO_PATHCONV=1

winpath() { command -v cygpath >/dev/null 2>&1 && cygpath -m "$1" || printf '%s' "$1"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGION="${AWS_REGION:-eu-west-1}"
NAME=latam-trip-worker
RUNTIME="${RUNTIME:-python3.14}"
AWS=(aws --region "$REGION")

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ZIP="$TMP/worker.zip"
python -I -X utf8 "$(winpath "$ROOT/infra/build_zip.py")" --out "$(winpath "$ZIP")" "$@"

if ! "${AWS[@]}" iam get-role --role-name "$NAME" >/dev/null 2>&1; then
  "${AWS[@]}" iam create-role --role-name "$NAME" --tags Key=project,Value=latam-trip \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  "${AWS[@]}" iam attach-role-policy --role-name "$NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
fi
ROLE_ARN="$("${AWS[@]}" iam get-role --role-name "$NAME" --query Role.Arn --output text | tr -d '\r')"

SUPABASE_URL="$(grep -m1 '^SUPABASE_URL=' "$ROOT/.env" | cut -d= -f2- | tr -d '\r')"
CONFIG=(--handler infra/worker/handler.handler --runtime "$RUNTIME" --memory-size 1024 --timeout 300
        --environment "Variables={SUPABASE_URL=$SUPABASE_URL}")

if "${AWS[@]}" lambda get-function --function-name "$NAME" >/dev/null 2>&1; then
  "${AWS[@]}" lambda update-function-code --function-name "$NAME" --zip-file "fileb://$(winpath "$ZIP")" >/dev/null
  "${AWS[@]}" lambda wait function-updated-v2 --function-name "$NAME"
  "${AWS[@]}" lambda update-function-configuration --function-name "$NAME" "${CONFIG[@]}" >/dev/null
else
  # a new role takes a few seconds to reach Lambda
  for attempt in 1 2 3 4 5 6; do
    if "${AWS[@]}" lambda create-function --function-name "$NAME" --role "$ROLE_ARN" --tags project=latam-trip \
         --zip-file "fileb://$(winpath "$ZIP")" "${CONFIG[@]}" >/dev/null; then
      break
    fi
    [ "$attempt" = 6 ] && exit 1
    sleep 5
  done
fi
"${AWS[@]}" lambda wait function-updated-v2 --function-name "$NAME"
echo "deployed $NAME"
