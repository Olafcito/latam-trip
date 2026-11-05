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

The `read-booking` edge function (`supabase/functions/read-booking`) reads a booking confirmation for Add booking. It is owner only and touches no table. Its README has the deploy commands.

## Places to stay and live rates

`lodgings`, `lodging_rooms` and `lodging_prices` are owner only and never in a built file. A room keeps `site` and `site_id`, where it was read from and its id there, and a `photo`. A price keeps `available`, the beds (a dorm) or rooms (a private) left when it was seen. The `stay-rates` edge function (`supabase/functions/stay-rates`) reads a place's rooms and prices from Hostelworld for a date range and writes them to these tables, when the planner opens a place with a Hostelworld link, when a Hostelworld link is pasted to add a place, and each morning from the worker's `rates` action for every place and dates with a Hostelworld price ahead. Its README has the deploy commands and the worker key. The connector's `add_lodging_price` and `tripdb` check `available` against 0 and `site` against the known sites.

## Hostelworld gate and cities

`site_calls` and `hostelworld_cities` are read and written only by the `stay-rates` edge function with the service role. Row level security is on with no policies, so no signed in client sees them (`supabase/migrations/0020_hostelworld_search.sql`, TECH-004).

- `site_calls` holds one row per Hostelworld request in the last minute. The function `take_site_call(site, per_minute)` takes a turn: it returns 0 and counts the call when there is room, else the seconds to wait. Every Hostelworld request of the function passes it, 30 a minute across the planner, the worker and the search. Rows older than a minute are deleted on the next turn.
- `hostelworld_cities` remembers the Hostelworld city of a map place, `place_id` to `city_id` and `city`, with `checked_at`. A null `city_id` means Hostelworld has no city by that name, and the lookup is tried again after 30 days.
