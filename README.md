# latam-trip

Simon's Latin America trip planner and research tools. The planner works on desktop and mobile browsers, and Supabase is the shared source of truth for trips and researched data.

## Apps

- `planner/` is the trip planner. Sign in with the configured account to save trips and keep them in sync across devices.
- `web/` is the route map and flight options view.
- `plugin/` contains the Claude research skills, workers and `tripdb` commands.

The planner reads its built map and pricing data from the Supabase `web` storage bucket through the worker's hash-aware cache. Trips are read and written in Supabase directly. The worker rebuilds derived files after database changes and runs scheduled builds and backups.

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

## Deploy

Site builds run from `.github/workflows/site.yml` when `main` changes. They use the three `VITE_*` repository variables and publish the planner build to the site bucket. Worker code and schedules are deployed with `bash infra/deploy.sh --enable-schedules`. Changes to `tripdb.py` or the build pipeline reach the worker only through that deployment script.
