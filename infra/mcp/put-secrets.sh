#!/usr/bin/env bash
# Puts the connector's SSM parameters: the Supabase project URL and the publishable key, both plain String
# parameters, read from the git ignored .env. The connector holds no secret key (TECH-010). The parameters of the
# code before the switch are left as they are and deleted by hand the day after it.
# Uses AWS_PROFILE from the environment when set.
set -euo pipefail
export MSYS_NO_PATHCONV=1
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AWS=(aws --region "${AWS_REGION:-eu-west-1}")
env_value() { grep -m1 "^$1=" "$ROOT/.env" | cut -d= -f2- | tr -d '\r' | sed -e "s/^[\"']//" -e "s/[\"']$//"; }
put() { "${AWS[@]}" ssm put-parameter --name "$1" --type "$2" --value "$3" --overwrite >/dev/null; }
put /latam-trip-mcp/supabase-url String "$(env_value SUPABASE_URL)"
put /latam-trip-mcp/supabase-publishable-key String "$(env_value SUPABASE_PUBLISHABLE_KEY)"
for n in supabase-url supabase-publishable-key; do
  "${AWS[@]}" ssm add-tags-to-resource --resource-type Parameter --resource-id "/latam-trip-mcp/$n" --tags Key=project,Value=latam-trip >/dev/null
done
echo "parameters are in place"
