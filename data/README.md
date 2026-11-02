# Shared trip data

The repo no longer contains a data snapshot. Supabase is the single source of truth for researched data, planned trip versions, tasks, documents and the inbox.

## Read and write

Run commands from the repository root:

```bash
python -I -X utf8 plugin/scripts/tripdb.py --root . --help
python -I -X utf8 plugin/scripts/tripdb.py --root . status
python -I -X utf8 plugin/scripts/tripdb.py --root . query trips_latest
python -I -X utf8 plugin/scripts/tripdb.py --root . doc-get trip.json
```

`tripdb query TABLE` reads table rows. `tripdb doc-get NAME` reads a stored document, and `tripdb file NAME` reads a worker-built app file. Use the matching `tripdb` write command for changes. `tripdb check` validates database state. Never edit a second local source copy or write directly to Supabase outside the supported commands.

Planned trips live in the `trips` table. `tripdb save-trip FILE` saves a new version and prints its id. The planner opens it at `/?trip=<id>` and syncs it across signed-in devices.

The app's built map and research files live in the public Supabase `web` bucket. A scheduled worker rebuilds and publishes them after data changes. Worker health is shown by `tripdb status`; worker deployment is `bash infra/deploy.sh --enable-schedules`.

## Backups and safety

The scheduled worker stores private backups in `latam-trip-backups`. Use `tripdb dump` and `tripdb restore` only for an explicitly reviewed recovery. A restore can replace project tables, so verify the target and archive before running `--wipe`. Never use test reset helpers against the live project.
