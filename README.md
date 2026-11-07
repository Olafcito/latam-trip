# latam-trip

Simon's Latin America trip planner and research tools. The planner works on desktop and mobile browsers, and Supabase is the shared source of truth for trips and researched data.

## Apps

- `planner/` is the trip planner. Sign in with the configured account to save trips and keep them in sync across devices.
- `web/` is the route map and flight options view.
- `plugin/` contains the Claude research skills, workers and `tripdb` commands.
- `latam_trip_mcp/` is the connector that lets Claude or ChatGPT read and change the trip data. How to add it and sign in is in [docs/connector.md](docs/connector.md).

The planner reads its built map and pricing data from the Supabase `web` storage bucket through the worker's hash-aware cache. Trips are read and written in Supabase directly. The worker rebuilds derived files after database changes and runs scheduled builds and backups.

## Install as a traveller

A short visual guide to adding the connector and starting a trip is at <https://d15amu9hjiumbd.cloudfront.net/?guide>. It needs no sign in.

Sign up is open. Type your email in the planner, open the link it sends, and your account is made on first use (PROD-009). Until Simon sets custom SMTP in Supabase, the built in mailer sends only to the addresses of the project's team, so a person outside it gets no link and cannot sign in yet.

1. **Add the connector to your own Claude.** The server address is in [docs/connector.md](docs/connector.md), with the steps for claude.ai, the desktop app, the phone apps and Claude Code. Leave the advanced OAuth fields empty.
2. **Sign in.** Press Connect. The planner asks for your email address and sends it a sign in link. A new address gets its account from that link. Open the link, check the app name on the page and press Allow. Your assistant then sees only your own trips, bookings, places to stay and files.
3. **Install the plugin in Claude Code, if you want the skills.** Run `/plugin marketplace add Olafcito/latam-trip`, then `/plugin install flight-crawler@latam-trip`. The skills read your profile through the connector, so ask Claude to set your profile (home airport, currency, longest journey, travel style and rules) before the first search. The `add-lodging` skill works through the connector alone. The steps that need the repo on disk, such as `tripdb`, are for Simon.
4. **Check it works.** Ask Claude to list your trips. A new account has none.

### What an assistant may do in your browser

Pages are read in your own browser and your own sign ins, on your device. An assistant working for you may open and read pages, search, and copy prices, photos, ratings and distances into your own rows through the connector. It must never:

- book, reserve or pay,
- sign in for you or enter a password,
- fill in or submit a form, or enter personal data,
- accept a consent banner or tick a box,
- solve a bot check, since a bot check means the read is blocked and it should say so,
- change an account, a booking or a setting on a site.

Stop and tell Claude if a site asks for any of these. Your data is described in the [privacy note](docs/product/privacy-note.md), including how to export and delete your account.

## Local development

Configure `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` and `VITE_DATA_BASE` in the local environment before starting an app. These values are also configured as GitHub Actions repository variables for deployment. Never commit secret keys or `.env` files.

```bash
cd planner
npm ci
npm run dev
```

The repo keeps only `data/README.md`. Live tables and documents are stored in Supabase and inspected with `tripdb query`, `tripdb doc-get`, `tripdb file` and `tripdb status`.

## Checks

```bash
cd planner && npm run typecheck && npm test
cd web && npm run typecheck && npm test
python -I -X utf8 -m unittest discover -s plugin/scripts -p "test_*.py"
```

The database tests run on a local Supabase stack in Docker, never on the project. `supabase/local_up.sh` starts it with a pinned Supabase CLI, applies every migration and the test helpers with `migrate.py --db-url`, and writes the local keys to an env file outside the repo, by default `latam-trip-local.env` in the temp folder.

```bash
bash supabase/local_up.sh "$TEMP/latam-trip-local.env"
export TRIPDB_ENV_FILE="$TEMP/latam-trip-local.env" TRIPDB_DB_TESTS=1 TRIPDB_LIVE_TESTS=1
uv run --quiet --no-project --with "psycopg[binary]" python -I -X utf8 supabase/test_task_close.py -v
python -I -X utf8 -m unittest discover -s plugin/scripts -p "test_db_functions.py"
npx --yes supabase@2.122.1 stop --workdir supabase/local --no-backup
```

## Deploy

Site builds run from `.github/workflows/site.yml` when `main` changes. They use the three `VITE_*` repository variables and publish the planner build to the site bucket. Worker code and schedules are deployed with `bash infra/deploy.sh --enable-schedules`. Changes to `tripdb.py` or the build pipeline reach the worker only through that deployment script.

Tests run from `.github/workflows/test.yml` on every pull request and every push to a branch other than `main`, with no secret. `.github/workflows/release.yml` is the release of TECH-008: on a push to `main` it runs the same tests, then applies new migrations and updates the connector's code with `infra/mcp/deploy.sh --code-only`. It needs the AWS role and the GitHub environment `release` that `infra/release/setup.sh` makes from the PC, and until they exist its release job fails. A full connector deploy, edge functions and the worker still deploy from the PC.
