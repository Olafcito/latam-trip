#!/usr/bin/env bash
# Creates what release.yml needs (TECH-008, task 1b.4 of the FEAT-006 plan): the AWS role latam-trip-release that
# GitHub's OIDC may take from the environment release, and that environment with its secrets and variable.
# Run it from this PC in Git Bash, with an AWS profile that may change IAM and a gh login that is admin on the repo.
# Uses AWS_PROFILE when set. Safe to run again.
# Every command is printed before it runs, with the account id shown as ${ACCOUNT} and the project URL as
# ${SUPABASE_URL}. Secrets go to gh on stdin and are never printed.
# --dry-run prints the commands and runs none of them, not even the ones that only read.
# The policy templates next to this file keep their placeholders. They are filled into a temp folder outside the repo,
# which is removed on exit.
# Not done here: the ruleset of finding 6, which TECH-008 describes, and the one full connector deploy that narrows
# kms:Decrypt, printed as the next step at the end.
# Reads .env at the repo root, or ENV_FILE when set, since a worktree has no .env of its own.
# Usage: bash infra/release/setup.sh [--dry-run]
set -euo pipefail
export MSYS_NO_PATHCONV=1
winpath() { command -v cygpath >/dev/null 2>&1 && cygpath -m "$1" || printf '%s' "$1"; }

DRY=0
case "${1:-}" in
  --dry-run) DRY=1 ;;
  "") ;;
  *) echo "usage: setup.sh [--dry-run]" >&2; exit 2 ;;
esac

HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$HERE/../.." && pwd)"
REGION="${AWS_REGION:-eu-west-1}"
REPO=Olafcito/latam-trip
ROLE=latam-trip-release
POLICY=release-connector-code
SITE_ROLE=latam-trip-deploy
ENVIRONMENT=release
AWS=(aws --region "$REGION")

ACCOUNT='${ACCOUNT}'
SUPABASE_URL='${SUPABASE_URL}'

# the command as it will run, with the account id and the project URL put back as placeholders
show() {
  local out="+" a
  for a in "$@"; do
    if [[ "$a" =~ ^[A-Za-z0-9_./:=,@+%-]+$ ]]; then out+=" $a"; else out+=" '$a'"; fi
  done
  [[ "$ACCOUNT" =~ ^[0-9]+$ ]] && out="${out//"$ACCOUNT"/\$\{ACCOUNT\}}"
  [[ "$SUPABASE_URL" == https://* ]] && out="${out//"$SUPABASE_URL"/\$\{SUPABASE_URL\}}"
  printf '%s\n' "$out" >&2
}
run() { show "$@"; [ "$DRY" = 1 ] || "$@"; }
text() { tr -d '\r'; }

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
case "$(cd "$TMP" && pwd)/" in "$ROOT"/*) echo "the temp folder is inside the repo, set TMPDIR" >&2; exit 1 ;; esac

fill() {
  echo "+ fill $(basename "$1") into the temp folder" >&2
  sed -e "s|\${ACCOUNT}|$ACCOUNT|g" -e "s|\${REGION}|$REGION|g" -e "s|\${REPO}|$REPO|g" -e "s|\${SUB_PREFIX}|$SUB_PREFIX|g" "$1" > "$2"
  if [ "$DRY" = 0 ] && grep -q '\${' "$2"; then echo "a placeholder is left in $(basename "$1")" >&2; exit 1; fi
}

echo ">> GitHub's OIDC subject must have the default form <prefix>:environment:<name>, where the prefix may carry the" >&2
echo "   owner and repo ids (use_immutable_subject). The trust takes the prefix GitHub reports." >&2
SUB_PREFIX='${SUB_PREFIX}'
show gh api "repos/$REPO/actions/oidc/customization/sub" --jq '[.use_default, .sub_claim_prefix] | @tsv'
if [ "$DRY" = 0 ]; then
  read -r DEFAULT_SUB SUB_PREFIX < <(gh api "repos/$REPO/actions/oidc/customization/sub" --jq '[.use_default, .sub_claim_prefix] | @tsv' | text)
  [ "$DEFAULT_SUB" = true ] || { echo "the repo customizes its OIDC subject, so the trust would never match" >&2; exit 1; }
  [[ "$SUB_PREFIX" =~ ^repo:Olafcito(@[0-9]+)?/latam-trip(@[0-9]+)?$ ]] || { echo "unexpected OIDC subject prefix" >&2; exit 1; }
fi

echo ">> account" >&2
show "${AWS[@]}" sts get-caller-identity --query Account --output text
if [ "$DRY" = 0 ]; then
  ACCOUNT="$("${AWS[@]}" sts get-caller-identity --query Account --output text | text)"
fi
OIDC="arn:aws:iam::$ACCOUNT:oidc-provider/token.actions.githubusercontent.com"

echo ">> the GitHub OIDC provider exists" >&2
run "${AWS[@]}" iam get-open-id-connect-provider --open-id-connect-provider-arn "$OIDC" --query ClientIDList --output text

echo ">> the site role's trust conditions, an exact sub under StringEquals is what finding 10 asks for" >&2
run "${AWS[@]}" iam get-role --role-name "$SITE_ROLE" --query "Role.AssumeRolePolicyDocument.Statement[].Condition" --output json

echo ">> role $ROLE" >&2
fill "$HERE/trust-policy.json" "$TMP/trust-policy.json"
fill "$HERE/role-policy.json" "$TMP/role-policy.json"
TRUST="file://$(winpath "$TMP/trust-policy.json")"
PERMS="file://$(winpath "$TMP/role-policy.json")"
show "${AWS[@]}" iam get-role --role-name "$ROLE" --query Role.RoleName --output text
if [ "$DRY" = 0 ] && "${AWS[@]}" iam get-role --role-name "$ROLE" --query Role.RoleName --output text >/dev/null 2>&1; then
  run "${AWS[@]}" iam update-assume-role-policy --role-name "$ROLE" --policy-document "$TRUST"
else
  run "${AWS[@]}" iam create-role --role-name "$ROLE" --assume-role-policy-document "$TRUST" \
    --description "GitHub release of latam-trip, updates the connector code" --tags Key=project,Value=latam-trip \
    --query Role.RoleName --output text
fi
run "${AWS[@]}" iam put-role-policy --role-name "$ROLE" --policy-name "$POLICY" --policy-document "$PERMS"

echo ">> GitHub environment $ENVIRONMENT, which only main may use" >&2
run gh api -X PUT "repos/$REPO/environments/$ENVIRONMENT" \
  -F "deployment_branch_policy[protected_branches]=false" -F "deployment_branch_policy[custom_branch_policies]=true" --silent
show gh api "repos/$REPO/environments/$ENVIRONMENT/deployment-branch-policies" --jq '.branch_policies[].name'
if [ "$DRY" = 1 ] || ! gh api "repos/$REPO/environments/$ENVIRONMENT/deployment-branch-policies" \
    --jq '.branch_policies[].name' | text | grep -qx main; then
  run gh api -X POST "repos/$REPO/environments/$ENVIRONMENT/deployment-branch-policies" -f name=main -f type=branch --silent
fi

echo ">> secrets and variable of $ENVIRONMENT" >&2
ENV_FILE="${ENV_FILE:-$ROOT/.env}"
env_value() { sed -n "s/^[[:space:]]*$1[[:space:]]*=[[:space:]]*//p" "$ENV_FILE" | tail -n 1 | text | sed -e "s/^[\"']//" -e "s/[\"']\$//"; }
echo "+ gh secret set SUPABASE_PASSWORD --env $ENVIRONMENT --repo $REPO < SUPABASE_PASSWORD from $(basename "$ENV_FILE")" >&2
if [ "$DRY" = 0 ]; then
  [ -f "$ENV_FILE" ] || { echo "no $ENV_FILE, set ENV_FILE" >&2; exit 1; }
  PASSWORD="$(env_value SUPABASE_PASSWORD)"
  [ -n "$PASSWORD" ] || { echo "SUPABASE_PASSWORD is not in $(basename "$ENV_FILE")" >&2; exit 1; }
  printf '%s' "$PASSWORD" | gh secret set SUPABASE_PASSWORD --env "$ENVIRONMENT" --repo "$REPO"
  unset PASSWORD
  SUPABASE_URL="$(env_value SUPABASE_URL)"
  [[ "$SUPABASE_URL" =~ ^https://[a-z0-9]+\.supabase\.co$ ]] || { echo "SUPABASE_URL in $(basename "$ENV_FILE") is not a project URL" >&2; exit 1; }
fi
run gh secret set AWS_RELEASE_ROLE_ARN --env "$ENVIRONMENT" --repo "$REPO" --body "arn:aws:iam::$ACCOUNT:role/$ROLE"
run gh variable set SUPABASE_URL --env "$ENVIRONMENT" --repo "$REPO" --body "$SUPABASE_URL"

echo ">> done. Next, once: AWS_PROFILE=<profile> bash infra/mcp/deploy.sh, which narrows kms:Decrypt" >&2
