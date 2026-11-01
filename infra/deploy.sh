#!/usr/bin/env bash
# Deploys latam-trip-worker to eu-west-1 from this PC. Uses AWS_PROFILE when set.
# The repo is public, so no account id or profile name goes in this file.
# Usage: bash infra/deploy.sh [--with-data] [--enable-schedules]
# The two schedules are made DISABLED unless --enable-schedules is given.
set -euo pipefail
export MSYS_NO_PATHCONV=1

winpath() { command -v cygpath >/dev/null 2>&1 && cygpath -m "$1" || printf '%s' "$1"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REGION="${AWS_REGION:-eu-west-1}"
NAME=latam-trip-worker
RUNTIME="${RUNTIME:-python3.14}"
AWS=(aws --region "$REGION")

STATE=DISABLED
ZIP_ARGS=()
for arg in "$@"; do
  if [ "$arg" = "--enable-schedules" ]; then STATE=ENABLED; else ZIP_ARGS+=("$arg"); fi
done

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
ZIP="$TMP/worker.zip"
python -I -X utf8 "$(winpath "$ROOT/infra/build_zip.py")" --out "$(winpath "$ZIP")" ${ZIP_ARGS[@]+"${ZIP_ARGS[@]}"}

ACCOUNT="$("${AWS[@]}" sts get-caller-identity --query Account --output text | tr -d '\r')"

if ! "${AWS[@]}" iam get-role --role-name "$NAME" >/dev/null 2>&1; then
  "${AWS[@]}" iam create-role --role-name "$NAME" --tags Key=project,Value=latam-trip \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
  "${AWS[@]}" iam attach-role-policy --role-name "$NAME" \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
fi
ROLE_ARN="$("${AWS[@]}" iam get-role --role-name "$NAME" --query Role.Arn --output text | tr -d '\r')"

# The private backup bucket. If the plain name belongs to another account, a suffix from the account id is used.
BACKUP=latam-trip-backups
HEAD="$("${AWS[@]}" s3api head-bucket --bucket "$BACKUP" 2>&1 || true)"
if printf '%s' "$HEAD" | grep -q "403\|Forbidden"; then
  BACKUP="latam-trip-backups-$(printf '%s' "$ACCOUNT" | sha256sum | cut -c1-8)"
  HEAD="$("${AWS[@]}" s3api head-bucket --bucket "$BACKUP" 2>&1 || true)"
fi
if printf '%s' "$HEAD" | grep -q "404\|Not Found"; then
  "${AWS[@]}" s3api create-bucket --bucket "$BACKUP" \
    --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
fi
"${AWS[@]}" s3api put-public-access-block --bucket "$BACKUP" \
  --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
"${AWS[@]}" s3api put-bucket-lifecycle-configuration --bucket "$BACKUP" --lifecycle-configuration \
  '{"Rules":[{"ID":"expire-90-days","Status":"Enabled","Filter":{"Prefix":""},"Expiration":{"Days":90}}]}'
"${AWS[@]}" s3api put-bucket-tagging --bucket "$BACKUP" \
  --tagging '{"TagSet":[{"Key":"project","Value":"latam-trip"}]}'

# The secret key goes from .env into SSM through a temp file and is never printed.
SECRET_NAME=/latam-trip/supabase-secret-key
grep -m1 '^SUPABASE_SECRET_KEY=' "$ROOT/.env" | cut -d= -f2- | tr -d '\r\n' | sed "s/^[\"']//; s/[\"']\$//" > "$TMP/secret"
"${AWS[@]}" ssm put-parameter --name "$SECRET_NAME" --type SecureString --overwrite \
  --value "file://$(winpath "$TMP/secret")" >/dev/null
rm -f "$TMP/secret"
"${AWS[@]}" ssm add-tags-to-resource --resource-type Parameter --resource-id "$SECRET_NAME" \
  --tags Key=project,Value=latam-trip

cat > "$TMP/access.json" <<EOF
{"Version":"2012-10-17","Statement":[
 {"Effect":"Allow","Action":"ssm:GetParameter","Resource":"arn:aws:ssm:$REGION:$ACCOUNT:parameter$SECRET_NAME"},
 {"Effect":"Allow","Action":"s3:PutObject","Resource":"arn:aws:s3:::$BACKUP/*"}]}
EOF
"${AWS[@]}" iam put-role-policy --role-name "$NAME" --policy-name latam-trip-worker-access \
  --policy-document "file://$(winpath "$TMP/access.json")"

SUPABASE_URL="$(grep -m1 '^SUPABASE_URL=' "$ROOT/.env" | cut -d= -f2- | tr -d '\r')"
CONFIG=(--handler infra/worker/handler.handler --runtime "$RUNTIME" --memory-size 1024 --timeout 300
        --environment "Variables={SUPABASE_URL=$SUPABASE_URL,BACKUP_BUCKET=$BACKUP}")

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

# Schedules. The scheduler role trusts only EventBridge Scheduler and may only invoke this function.
SCHED_ROLE=latam-trip-scheduler
FN_ARN="$("${AWS[@]}" lambda get-function --function-name "$NAME" --query Configuration.FunctionArn --output text | tr -d '\r')"
if ! "${AWS[@]}" iam get-role --role-name "$SCHED_ROLE" >/dev/null 2>&1; then
  "${AWS[@]}" iam create-role --role-name "$SCHED_ROLE" --tags Key=project,Value=latam-trip \
    --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"scheduler.amazonaws.com"},"Action":"sts:AssumeRole"}]}' >/dev/null
fi
cat > "$TMP/invoke.json" <<EOF
{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Action":"lambda:InvokeFunction","Resource":"$FN_ARN"}]}
EOF
"${AWS[@]}" iam put-role-policy --role-name "$SCHED_ROLE" --policy-name invoke-latam-trip-worker \
  --policy-document "file://$(winpath "$TMP/invoke.json")"
SCHED_ARN="$("${AWS[@]}" iam get-role --role-name "$SCHED_ROLE" --query Role.Arn --output text | tr -d '\r')"

schedule() {  # name, expression, action
  local verb=create-schedule
  "${AWS[@]}" scheduler get-schedule --name "$1" >/dev/null 2>&1 && verb=update-schedule
  cat > "$TMP/target.json" <<EOF
{"Arn":"$FN_ARN","RoleArn":"$SCHED_ARN","Input":"{\"action\":\"$3\"}","RetryPolicy":{"MaximumRetryAttempts":0}}
EOF
  for attempt in 1 2 3 4 5 6; do
    if "${AWS[@]}" scheduler "$verb" --name "$1" --schedule-expression "$2" --state "$STATE" \
         --flexible-time-window Mode=OFF --target "file://$(winpath "$TMP/target.json")" >/dev/null; then
      return 0
    fi
    [ "$attempt" = 6 ] && return 1
    sleep 5
  done
}
schedule latam-trip-worker-build "rate(1 minute)" build
schedule latam-trip-worker-backup "cron(0 3 * * ? *)" backup
echo "schedules $STATE, backups go to $BACKUP"
