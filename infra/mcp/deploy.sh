#!/usr/bin/env bash
# Deploys the latam-trip-mcp stack to eu-west-1 from this PC. Uses AWS_PROFILE from the environment when set.
# The repo is public, so no account id or profile name goes in this file.
# The SSM parameters under /latam-trip-mcp/ must exist first, see infra/mcp/put-secrets.sh.
set -euo pipefail
export MSYS_NO_PATHCONV=1
winpath() { command -v cygpath >/dev/null 2>&1 && cygpath -m "$1" || printf '%s' "$1"; }

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
REGION="${AWS_REGION:-eu-west-1}"
STACK="${STACK:-latam-trip-mcp}"
UV="${UV:-uv}"
AWS=(aws --region "$REGION")

BUILD="$(mktemp -d)"
trap 'rm -rf "$BUILD"' EXIT
DIST="$BUILD/pkg"; mkdir -p "$DIST/deps"

echo ">> installing Linux deps"
$UV pip install --python-platform x86_64-manylinux2014 --python-version 3.12 \
  --target "$(winpath "$DIST")/deps" --only-binary=:all: \
  "fastmcp==3.4.2" uvicorn boto3 >/dev/null

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
if ! "${AWS[@]}" s3api head-bucket --bucket "$BUCKET" 2>/dev/null; then
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
  --capabilities CAPABILITY_NAMED_IAM --parameter-overrides LwaLayerArn="$LWA" CodeS3Bucket="$BUCKET" CodeS3Key="$KEY" \
  --tags project=latam-trip
"${AWS[@]}" cloudformation describe-stacks --stack-name "$STACK" \
  --query "Stacks[0].Outputs[?OutputKey=='McpEndpoint'].OutputValue" --output text | tr -d '\r'
