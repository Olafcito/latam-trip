#!/usr/bin/env bash
# Deploys the latam-trip-mcp stack to eu-west-1 from this PC. Uses AWS_PROFILE from the environment when set.
# The repo is public, so no account id or profile name goes in this file.
# The SSM parameters under /latam-trip-mcp/ must exist first, see infra/mcp/put-secrets.sh.
# Usage: bash infra/mcp/deploy.sh [--code-only]
# --code-only is what the release runs (TECH-008). It builds and checks the zip as a full deploy does, uploads it to
# the deploy bucket, updates the function's code, waits for the update and checks that the connector answers 401
# without a bearer. It never touches CloudFormation or IAM, so a template change still needs a full deploy from
# this PC, which also brings the stack's CodeS3Key back in line with the code the release uploaded.
set -euo pipefail
export MSYS_NO_PATHCONV=1
winpath() { command -v cygpath >/dev/null 2>&1 && cygpath -m "$1" || printf '%s' "$1"; }

CODE_ONLY=0
case "${1:-}" in
  --code-only) CODE_ONLY=1 ;;
  "") ;;
  *) echo "usage: deploy.sh [--code-only]" >&2; exit 2 ;;
esac

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REGION="${AWS_REGION:-eu-west-1}"
STACK="${STACK:-latam-trip-mcp}"
FUNCTION=latam-trip-mcp
# the connector's public address, as in docs/connector.md
MCP_URL="${MCP_URL:-https://n1e8j7vob1.execute-api.eu-west-1.amazonaws.com/mcp}"
UV="${UV:-uv}"
AWS=(aws --region "$REGION")

BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT
DIST="$BUILD/pkg"; mkdir -p "$DIST/deps"

echo ">> installing Linux deps"
$UV pip install --python-platform x86_64-manylinux2014 --python-version 3.12 \
  --target "$(winpath "$DIST")/deps" --only-binary=:all: \
  "fastmcp==3.4.2" "uvicorn==0.54.0" "boto3==1.43.125" >/dev/null

echo ">> assembling package"
cp -r "$ROOT/latam_trip_mcp" "$DIST/latam_trip_mcp"
rm -f "$DIST"/latam_trip_mcp/test_*.py
mkdir -p "$DIST/plugin/scripts" "$DIST/plugin/skills/flight-crawl-orchestrator/scripts"
cp "$ROOT"/plugin/scripts/*.py "$DIST/plugin/scripts/"
rm -f "$DIST"/plugin/scripts/test_*.py
cp "$ROOT/plugin/skills/flight-crawl-orchestrator/scripts/quote_rules.py" "$DIST/plugin/skills/flight-crawl-orchestrator/scripts/"
cp "$ROOT/infra/mcp/run.sh" "$DIST/run.sh"
sed -i 's/\r$//' "$DIST/run.sh"
find "$DIST" -name '__pycache__' -type d -prune -exec rm -rf {} +

echo ">> zipping"
ZIP="$BUILD/function.zip"
python -I -X utf8 - "$(winpath "$DIST")" "$(winpath "$ZIP")" <<'PY'
import os, sys, zipfile
dist, zpath = sys.argv[1], sys.argv[2]
with zipfile.ZipFile(zpath, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(dist):
        for f in files:
            p = os.path.join(root, f)
            rel = os.path.relpath(p, dist).replace("\\", "/")
            zi = zipfile.ZipInfo(rel)
            zi.external_attr = (0o755 if f == "run.sh" else 0o644) << 16
            zi.compress_type = zipfile.ZIP_DEFLATED
            with open(p, "rb") as fh:
                z.writestr(zi, fh.read())
names = zipfile.ZipFile(zpath).namelist()
for need in ("run.sh", "latam_trip_mcp/server.py", "plugin/scripts/tripdb.py", "plugin/skills/flight-crawl-orchestrator/scripts/quote_rules.py"):
    assert need in names, "missing " + need
assert any(n.startswith("deps/uvicorn/") for n in names), "uvicorn missing"
print("   zip ok:", len(names), "entries")
PY

ACCOUNT="$("${AWS[@]}" sts get-caller-identity --query Account --output text | tr -d '\r')"
BUCKET="latam-trip-mcp-deploy-${ACCOUNT}-${REGION}"
# the release role may not list or create buckets, so --code-only expects the bucket a full deploy made
if [ "$CODE_ONLY" = 0 ] && ! "${AWS[@]}" s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
  echo ">> creating the deploy bucket"
  "${AWS[@]}" s3api create-bucket --bucket "$BUCKET" --create-bucket-configuration LocationConstraint="$REGION" >/dev/null
  "${AWS[@]}" s3api put-public-access-block --bucket "$BUCKET" \
    --public-access-block-configuration BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
  "${AWS[@]}" s3api put-bucket-tagging --bucket "$BUCKET" --tagging 'TagSet=[{Key=project,Value=latam-trip}]'
fi
KEY="function-$(date +%s).zip"
"${AWS[@]}" s3 cp "$(winpath "$ZIP")" "s3://$BUCKET/$KEY" >/dev/null
SIZE="$("${AWS[@]}" s3api head-object --bucket "$BUCKET" --key "$KEY" --query ContentLength --output text | tr -d '\r')"
[ "$SIZE" -gt 1000000 ] || { echo "uploaded object is only $SIZE bytes" >&2; exit 1; }

# POST /mcp without a bearer must answer 401 and name the resource metadata. A cold start may take a few tries.
smoke() {
  local headers status i
  headers="$(mktemp)"
  for i in 1 2 3 4 5 6; do
    status="$(curl -sS -o /dev/null -D "$headers" -w '%{http_code}' -X POST -H 'content-type: application/json' \
      --data '{}' --max-time 30 "$MCP_URL" || true)"
    if [ "$status" = 401 ] && grep -qi '^www-authenticate:.*resource_metadata=' "$headers"; then
      rm -f "$headers"
      echo "   smoke ok: 401 with resource_metadata"
      return 0
    fi
    echo "   smoke try $i: status $status" >&2
    sleep 5
  done
  rm -f "$headers"
  echo "the connector did not answer 401 with resource_metadata" >&2
  return 1
}

if [ "$CODE_ONLY" = 1 ]; then
  echo ">> updating the code of $FUNCTION"
  "${AWS[@]}" lambda update-function-code --function-name "$FUNCTION" --s3-bucket "$BUCKET" --s3-key "$KEY" \
    --query LastUpdateStatus --output text | tr -d '\r'
  "${AWS[@]}" lambda wait function-updated-v2 --function-name "$FUNCTION"
  echo ">> smoke check"
  smoke
  exit 0
fi

# the connector decrypts its SSM parameters with the account's AWS managed SSM key and no other
SSM_KMS_KEY_ARN="$("${AWS[@]}" kms describe-key --key-id alias/aws/ssm --query KeyMetadata.Arn --output text | tr -d '\r')"

# AWS publishes the Lambda Web Adapter layer per region. Pass LWA_LAYER_ARN to choose one, else find the newest here.
LWA="${LWA_LAYER_ARN:-}"
if [ -z "$LWA" ]; then
  for v in 40 39 38 37 36 35 34 33 32 31 30 29 28 27 26 25; do
    arn="arn:aws:lambda:${REGION}:753240598075:layer:LambdaAdapterLayerX86:$v"
    if "${AWS[@]}" lambda get-layer-version-by-arn --arn "$arn" >/dev/null 2>&1; then LWA="$arn"; break; fi
  done
fi
[ -n "$LWA" ] || { echo "no Lambda Web Adapter layer found, set LWA_LAYER_ARN" >&2; exit 1; }
echo ">> deploying stack $STACK"
"${AWS[@]}" cloudformation deploy --stack-name "$STACK" --template-file "$(winpath "$ROOT/infra/mcp/template.yaml")" \
  --capabilities CAPABILITY_NAMED_IAM --parameter-overrides LwaLayerArn="$LWA" CodeS3Bucket="$BUCKET" CodeS3Key="$KEY" SsmKmsKeyArn="$SSM_KMS_KEY_ARN" \
  --tags project=latam-trip
"${AWS[@]}" cloudformation describe-stacks --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='McpEndpoint'].OutputValue" --output text | tr -d '\r'
echo ">> smoke check"
smoke
