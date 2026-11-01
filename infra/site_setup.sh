#!/usr/bin/env bash
# Creates the hosting for the planner in eu-west-1 from this PC and sets what GitHub needs to deploy it.
# Safe to run again. Uses AWS_PROFILE when set.
# The repo is public, so no account id or profile name goes in this file.
# Usage: bash infra/site_setup.sh
set -euo pipefail
export MSYS_NO_PATHCONV=1

REGION="${AWS_REGION:-eu-west-1}"
BUCKET=latam-trip-site
ROLE=latam-trip-deploy
REPO=Olafcito/latam-trip
# the managed CachingOptimized policy
CACHE_POLICY=658327ea-f89d-4fab-a63d-7e88639e58f6
AWS=(aws --region "$REGION")
TAG='Key=project,Value=latam-trip'

text() { tr -d '\r'; }

if ! "${AWS[@]}" s3api head-bucket --bucket "$BUCKET" >/dev/null 2>&1; then
  "${AWS[@]}" s3api create-bucket --bucket "$BUCKET" \
    --create-bucket-configuration "LocationConstraint=$REGION" >/dev/null
fi
"${AWS[@]}" s3api put-public-access-block --bucket "$BUCKET" --public-access-block-configuration \
  BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true
"${AWS[@]}" s3api put-bucket-tagging --bucket "$BUCKET" --tagging "TagSet=[{$TAG}]"

OAC="$("${AWS[@]}" cloudfront list-origin-access-controls \
  --query "OriginAccessControlList.Items[?Name=='$BUCKET'].Id | [0]" --output text | text)"
if [ "$OAC" = None ]; then
  OAC="$("${AWS[@]}" cloudfront create-origin-access-control --origin-access-control-config \
    "Name=$BUCKET,OriginAccessControlOriginType=s3,SigningBehavior=always,SigningProtocol=sigv4" \
    --query OriginAccessControl.Id --output text | text)"
fi

DIST="$("${AWS[@]}" cloudfront list-distributions \
  --query "DistributionList.Items[?Comment=='$BUCKET'].Id | [0]" --output text | text)"
if [ "$DIST" = None ]; then
  CONFIG="$(mktemp)"
  trap 'rm -f "$CONFIG"' EXIT
  # PriceClass_All, because the phone will be in South America
  cat > "$CONFIG" <<EOF
{"DistributionConfig":{
  "CallerReference":"$BUCKET","Comment":"$BUCKET","Enabled":true,"DefaultRootObject":"index.html",
  "HttpVersion":"http2and3","PriceClass":"PriceClass_All",
  "Origins":{"Quantity":1,"Items":[{"Id":"site","DomainName":"$BUCKET.s3.$REGION.amazonaws.com",
    "OriginAccessControlId":"$OAC","S3OriginConfig":{"OriginAccessIdentity":""}}]},
  "DefaultCacheBehavior":{"TargetOriginId":"site","ViewerProtocolPolicy":"redirect-to-https",
    "Compress":true,"CachePolicyId":"$CACHE_POLICY"}},
 "Tags":{"Items":[{"Key":"project","Value":"latam-trip"}]}}
EOF
  DIST="$("${AWS[@]}" cloudfront create-distribution-with-tags \
    --distribution-config-with-tags "file://$(cygpath -m "$CONFIG" 2>/dev/null || echo "$CONFIG")" \
    --query Distribution.Id --output text | text)"
fi
DIST_ARN="$("${AWS[@]}" cloudfront get-distribution --id "$DIST" --query Distribution.ARN --output text | text)"
DOMAIN="$("${AWS[@]}" cloudfront get-distribution --id "$DIST" --query Distribution.DomainName --output text | text)"

"${AWS[@]}" s3api put-bucket-policy --bucket "$BUCKET" --policy "{\"Version\":\"2012-10-17\",\"Statement\":[{
  \"Effect\":\"Allow\",\"Principal\":{\"Service\":\"cloudfront.amazonaws.com\"},\"Action\":\"s3:GetObject\",
  \"Resource\":\"arn:aws:s3:::$BUCKET/*\",\"Condition\":{\"StringEquals\":{\"AWS:SourceArn\":\"$DIST_ARN\"}}}]}"

ACCOUNT="$("${AWS[@]}" sts get-caller-identity --query Account --output text | text)"
OIDC="arn:aws:iam::$ACCOUNT:oidc-provider/token.actions.githubusercontent.com"
# GitHub's token may name the repo with its ids as well, so ask GitHub rather than build this from REPO
SUB="$(gh api "repos/$REPO/actions/oidc/customization/sub" --jq .sub_claim_prefix | text):ref:refs/heads/main"
TRUST="{\"Version\":\"2012-10-17\",\"Statement\":[{\"Effect\":\"Allow\",\"Principal\":{\"Federated\":\"$OIDC\"},
  \"Action\":\"sts:AssumeRoleWithWebIdentity\",\"Condition\":{\"StringEquals\":{
  \"token.actions.githubusercontent.com:aud\":\"sts.amazonaws.com\",
  \"token.actions.githubusercontent.com:sub\":\"$SUB\"}}}]}"
if "${AWS[@]}" iam get-role --role-name "$ROLE" >/dev/null 2>&1; then
  "${AWS[@]}" iam update-assume-role-policy --role-name "$ROLE" --policy-document "$TRUST"
else
  "${AWS[@]}" iam create-role --role-name "$ROLE" --tags "$TAG" --assume-role-policy-document "$TRUST" >/dev/null
fi
"${AWS[@]}" iam put-role-policy --role-name "$ROLE" --policy-name deploy-site --policy-document "{\"Version\":\"2012-10-17\",\"Statement\":[
  {\"Effect\":\"Allow\",\"Action\":\"s3:ListBucket\",\"Resource\":\"arn:aws:s3:::$BUCKET\"},
  {\"Effect\":\"Allow\",\"Action\":[\"s3:PutObject\",\"s3:DeleteObject\"],\"Resource\":\"arn:aws:s3:::$BUCKET/*\"},
  {\"Effect\":\"Allow\",\"Action\":\"cloudfront:CreateInvalidation\",\"Resource\":\"$DIST_ARN\"}]}"

ROLE_ARN="$("${AWS[@]}" iam get-role --role-name "$ROLE" --query Role.Arn --output text | text)"
printf '%s' "$ROLE_ARN" | gh secret set AWS_DEPLOY_ROLE_ARN --repo "$REPO"
gh variable set SITE_DISTRIBUTION_ID --repo "$REPO" --body "$DIST"
# the build needs these three, so pass them in the environment when you run this script
for v in VITE_SUPABASE_URL VITE_SUPABASE_KEY VITE_DATA_BASE; do
  [ -n "${!v:-}" ] && gh variable set "$v" --repo "$REPO" --body "${!v}"
done

echo "distribution $DIST"
echo "site https://$DOMAIN"
