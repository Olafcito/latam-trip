#!/usr/bin/env bash
# Puts the connector's three SSM parameters. Reads the Supabase URL and secret key from the git ignored .env.
# The sign in passphrase is made here and never printed. Read it later from the SSM console or with
#   aws ssm get-parameter --name /latam-trip-mcp/signin-passphrase --with-decryption
# Uses AWS_PROFILE from the environment when set.
set -euo pipefail
export MSYS_NO_PATHCONV=1
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
AWS=(aws --region "${AWS_REGION:-eu-west-1}")
env_value() { grep -m1 "^$1=" "$ROOT/.env" | cut -d= -f2- | tr -d '\r' | sed -e "s/^[\"']//" -e "s/[\"']$//"; }
put() { "${AWS[@]}" ssm put-parameter --name "$1" --type "$2" --value "$3" --overwrite >/dev/null; }
put /latam-trip-mcp/supabase-url String "$(env_value SUPABASE_URL)"
put /latam-trip-mcp/supabase-secret-key SecureString "$(env_value SUPABASE_SECRET_KEY)"
if ! "${AWS[@]}" ssm get-parameter --name /latam-trip-mcp/signin-passphrase >/dev/null 2>&1; then
  put /latam-trip-mcp/signin-passphrase SecureString "$(python -c 'import secrets;print("-".join(secrets.token_hex(3) for _ in range(5)))')"
fi
for n in supabase-url supabase-secret-key signin-passphrase; do
  "${AWS[@]}" ssm add-tags-to-resource --resource-type Parameter --resource-id "/latam-trip-mcp/$n" --tags Key=project,Value=latam-trip >/dev/null
done
echo "parameters are in place"
