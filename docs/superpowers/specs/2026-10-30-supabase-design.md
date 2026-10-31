# All trip data in Supabase

Status: spec, written 30 Oct 2026 and updated 31 Oct 2026. Nothing in here is built. All work happens on the branch `supabase-migration`.

Simon decided these things:

- All data moves to Supabase, and data lives in one place only.
- Ask Claude works through the database, so no session pulls data.
- A proper database design with real keys, not the files copied into Postgres.
- Nobody ever runs a rebuild. New flight data may take 1 to 3 minutes to show.
- GitHub is out of the data path. Everything reads from and writes to Supabase.

Every other decision below was made while writing this spec and can be overturned.

Code stays in git. Only data moves, and after cutover no data is left in the repo.

The reasoning behind the schema is in [the data architecture review](2026-10-31-data-architecture-review.md). Where the two differ, this spec wins.

## 1. Intent

Trip data lives in three places that do not see each other.

| Store | Who writes | Who sees it |
|---|---|---|
| Files in `data/sources`, committed to git | `tripdb` from Claude sessions, the Momondo userscript | A browser, after a commit, a build and a push |
| `localStorage` of the planner, per browser and per port | The planner | That one browser |
| `localStorage` of the `web` app | The `web` app | That one browser |

So a trip saved by a Claude session does not reach an open planner until it is built and pushed, and a trip saved in a browser never leaves that browser. Simon has hit both: trips added in Claude desktop missing from the browser, and links like `/?trip=ctg-sal-xmas-cbb` that open nothing in another window.

Success looks like this:

- Save a trip anywhere and every other open window shows it within seconds, with no build and no push in between.
- New flight prices show in the app 1 to 3 minutes after they are written, with nobody running anything.
- Claude sessions use the same `tripdb` commands as today and the same checks refuse the same bad rows.
- No session pulls data before it works. A session asks the database for what it needs, and gets one true row per thing.
- Ask Claude in the app is one press. The task is in the database at once, with no GitHub page in between, and the app shows when it is done.
- The repo holds code only. `data/sources`, `data/built`, `data/web` and `planner/public/data` are gone from `main`. No data, task, build or backup runs through GitHub.
- If the Supabase project is lost, it can be rebuilt from the latest backup with one command.

## 2. What is there now

Counted on 31 Oct 2026.

| Data | Where | Size |
|---|---|---|
| Quotes | `data/sources/quotes/<agent>.jsonl`, 109 files | 3785 rows, 3.8 MB |
| Experiences | `experiences.jsonl` | 504 rows, 706 KB |
| Connections | `connections.jsonl` | 250 rows, 149 KB |
| Profiles | `profiles.jsonl` | 123 rows, 138 KB |
| Places | `places.jsonl` | 98 rows, 34 KB |
| Place images, experience images | `place_images.jsonl`, `experience_images.jsonl` | 67 and 25 rows |
| Stays | `stays.jsonl` | 35 rows, 19 KB |
| Trips | `trips.jsonl` | 12 rows, 8 trips, 56 KB |
| Task log | `task_log.jsonl` | Small |
| Agent usage | `agent_usage.csv` | 96 rows |
| Documents | `trip.json`, `bag_rules.json`, `known_prices.json`, `scenarios.json`, `experience_categories.json`, `lists.json`, `elevation.json`, `image_queries.json` | 45 KB |
| Inbox | `data/sources/inbox`, `processed`, `rejected` | Files from the userscript |
| Built | `data/built`, 12 MB, `data/web`, 5.47 MB | Made by `tripdb build`, committed today |
| Browser | `latam-planner.journeys`, `.current`, `.hidden`, `.seeded`, `.seed-file`, `.filters`, `latam-trip.trips`, `latam-trip.journey`, `latam-web.options` | Per browser |

`data/README.md` has the fields of every table and the rule for when two rows are the same row.

Facts that shaped the design:

- The data is clean. 0 orphans in 1,604 place references, and no field mixes types in any table.
- Identity is not clean. On the same 3,785 rows, `quote_key` gives 3,594 quotes, `qid` gives 3,582, and `quote_key` plus flight lists gives about 3,625. `quote_key` ignores flight numbers, so 24 to 28 keys hold two different flights. `qid` often has empty flights, so 33 qids fold different times.
- All 182 groups of repeated quotes are sightings on the same day, 0 across days. No code reads them as history.
- 15 rows are superseded by a later row with the same id, 10 in places and 5 in profiles. They disagree: `LPB` is a hub at lon -68.15 in one row and a city at lon -68.12 in the other.
- Profiles have two kinds per id. 38 of the 80 places with a profile have both `profile` and `profile_hostels`.
- 82 of 100 via airports and 14 of 39 requested airports are not in `places`. Airport facts sit in at least seven Python constants.
- All 58 references from trips to quotes use `qid`.
- No code filters inside a leg. Only 6 of 1,899 one way flight lists appear on more than one source, because of spelling, and 871 of 5,330 legs have no flight numbers. So a leg table would have no key.
- About 80% of the 5.47 MB of built bytes hold real logic, and 42% is true computation (`inout`, `dash_trips`, `dash_journeys`). `inout.py` also needs `map.json`. No schema removes the build.
- No table holds `\u0000`, which `jsonb` refuses.
- `jsonb` does not keep key order, so a byte for byte round trip is not possible. The round trip test compares parsed values.
- `tripdb.py` uses the standard library only and runs under `python -I`. Its tests are file based.
- Every pipeline script takes `--root`, so the pipeline can run on a folder that is not the repo. The steps use the standard library only, and the only network call is the optional `--fetch-elevation`.
- The eight build steps took 2.2 s in total on this PC, the slowest being `ingest.py` at 0.59 s and `inout.py` at 0.47 s.
- Way ids in `inout.json` are a counter (`inout.py:176`), so they change with each build. Table trips keep their own ways, but trips built in the planner store only ids, and no code turns a journey into a trip row.
- On this project on 31 Oct 2026, Postgres offers only the languages `sql` and `plpgsql`, with no `plpython` or `plv8`. Edge Functions run TypeScript with a limit of 2 s of CPU per request. So the Python pipeline cannot run inside Supabase.
- The desktop icon runs Vite in dev mode on 5198, so the `import.meta.env.DEV` branches are the path Simon uses every day.
- `quoteLink` points at `data/quotes.csv`, which no longer exists. That link is already dead.
- `data/sources/trip.json` holds no name, email, phone or passport data.

## 3. Decisions at a glance

| Topic | Decision |
|---|---|
| Truth | Postgres in one Supabase project holds every table and document |
| Row shape | Typed columns and real keys for everything with identity or that anyone filters on. `jsonb` for flight legs, trip bodies and nested content. One `extra jsonb` per table so no field is lost |
| Not relational | Legs, flights, carriers and trip stops stay `jsonb`. Nothing queries them and flights have no key |
| Python writer | `tripdb` stays the only one, same commands and checks, with its file access moved behind a store layer |
| HTTP | REST through `urllib`, so no new Python dependency |
| Agent writes | One call per batch, safe through unique constraints. No lease, no check then insert. Workers keep their `data/raw` scratch file and never write row by row |
| Planner writer | A new journey to row writer, then a `save_trip` database function shared with Python |
| Live updates | Realtime on `trips`, `tasks` and `derive_state` |
| Cache | Browser copies that only reads fill and that can be wiped at any time, see 6.3. Nothing is bundled with the app |
| Built files | Stay files, in a public Storage bucket, and the apps read them from there |
| Pipeline | Stays in Python, unchanged, and never gets ported to SQL |
| Rebuild | Automatic. A small worker asks Supabase each minute whether data changed, and builds if so, see section 7 |
| Worker host | One AWS Lambda that talks only to Supabase. GitHub Actions are not used for data |
| Agent reads | `tripdb query` for tables and `tripdb file` for built files. No pull |
| Sign in | Magic link, public sign ups off, row level security for one owner |
| Userscript | Calls database functions with its own token |
| Task queue | A `tasks` table replaces GitHub Issues |
| Backup | The same worker stores a dated archive daily in a private S3 bucket |
| Stays local | `data/raw`, UI preferences, the unsaved draft in `.current`, the outbox |
| Stays in git | Code, `docs/learnings` |

## 4. Data model

### 4.1 Tables

Every table has row level security with `is_owner()`, see 8.1, and `extra jsonb not null default '{}'` unless noted. A field with no column goes to `extra`, so a new field from an agent is never lost and a column can be added later. `kind` is not stored, as the table says what a row is, and `tripdb pull` writes it back.

| Table | Key | Foreign keys | Typed columns | `jsonb` |
|---|---|---|---|---|
| `airports` | `code` pk | | `name`, `city`, `country`, `lat`, `lon`. A row may be a stub with only a code | |
| `places` | `id` pk | `airport_code` to `airports`, nullable, from `iata` | `name`, `country`, `lat`, `lon`, `type`, `popularity`, `why`, `source`, `origin`, `updated_at` | `extra` |
| `connections` | `id` identity pk, unique `(from_id, to_id, mode, operator)` with `nulls not distinct` | `from_id`, `to_id` to `places` | `duration_h`, `price_dkk`, `frequency`, `overnight`, `border`, `both_ways`, `source`, `source_year`, `notes`, `origin` | `duration_range`, `price_range_local`, `extra` |
| `profiles` | `(place_id, kind)` pk | `place_id` to `places` | `kind`, `checked_at`, `tagline`, `summary`, `touristy`, `origin` | `image`, `things_to_do`, `hostels`, `sources`, `extra` |
| `place_images` | `place_id` pk | to `places` | `origin` | `image` |
| `experiences` | `id` pk | | `name`, `category`, `country`, `lat`, `lon`, `area`, `summary`, `season`, `dec_jan`, `price`, `price_dkk`, `duration`, `requirements`, `researched`, `checked_at`, `tags text[]`, `places text[]` | `details`, `sources`, `extra` |
| `experience_images` | `id` pk | None, as 11 of 25 ids are `cat-*` category images | | `image`, `extra` |
| `stays` | `id` identity pk, unique `(place_id, site, name, room, check_in, check_out)` | `place_id` to `places` | `type`, `dkk_per_night`, `nights`, `rating`, `reviews`, `url`, `property_id`, `observed_at`, `task_id`, `notes` | `extra` |
| `quotes` | `seq` identity pk, `quote_id` unique | `first_from`, `first_to`, `last_from`, `last_to` to `airports` | See 4.2 | `legs_requested`, `out_leg`, `mid_legs`, `home_leg`, `extra` |
| `trips` | `(id, version)` pk | | `saved_at`, `saved_by`, `deleted_at` | `data`, see 4.3. No `extra` |
| `documents` | `name` pk | | `version`, `updated_at` | `data`. No `extra` |
| `inbox` | `id` pk | | `file`, `status`, `reason`, `created_at`. `status` is `new`, `added` or `rejected`. Replaces the three inbox folders | `rows`. No `extra` |
| `tasks` | `id` pk | | `type`, `status`, `title`, `trip_id`, `trip_version`, `created_at`, `done_at`, `result`. `status` is `open`, `working`, `done` or `failed`. `result` is the markdown Claude writes back. Replaces GitHub Issues, see 8.3 | `data`, the task JSON of `docs/claude-tasks.md`. No `extra` |
| `task_log` | `seq` identity pk | | `issue`, `type`, `done_at`, `summary` | `task`, `outputs`, `extra` |
| `agent_usage` | `seq` identity pk | | The nine `USAGE_COLS` | None |
| `leases` | `name` pk | | `holder`, `expires_at`. One row, `build`. Writers do not use it | None |
| `derive_state` | Single row | | `dirty_at`, `built_dirty_at`, `failed_dirty_at`, `last_started`, `last_finished`, `last_error`, `manifest_hash`, `worker_version`, see 7.2 | None |
| `derived_options` | `id` pk | | `rank`, `total_dkk`, `way_in`, `way_home`, `build_at`. Replaced whole by each build, so agents can query ranked options without reading the 1.8 MB `inout.json` | `data`. No `extra` |
| `owners` | `user_id` pk | | The one signed in account allowed in. It holds an id, so no email address goes in the repo | None |

Choices that need a reason:

- **Column names.** `from_id`, `to_id`, `both_ways`, `saved_by`, `out_leg`, `mid_legs` and `home_leg` avoid SQL keywords. The store layer maps them back to the file names, so the pipeline sees no change.
- **Profiles keep `kind` in the key.** `profile` and `profile_hostels` are separate rows of one place, and merging them would change what the pipeline reads.
- **`places text[]` on experiences, no junction table.** Only 2 rows have more than one place, `tripdb check` already refuses an unknown place, and a junction would turn `update-experience` into a two table write.
- **Times.** `dep` and `arr` stay strings in `jsonb`, as they are local clock times. `first_seen`, `last_seen` and other instants are `timestamptz`.
- **Airport stubs.** `add_quotes` inserts an unknown code with `on conflict do nothing`, so a new airport never blocks a crawl. Via airports stay in `jsonb` and have no foreign key.
- **Airport flags wait.** Columns like `is_us` are added on the day their Python constant is deleted, one at a time, after cutover. Adding them earlier would give those facts a second home.
- **No GIN index, partitions or partial indexes.** Nothing needs them at this size. Foreign keys get indexes, as do `(first_from, first_to, first_date)`, `(last_from, last_to, last_date)` and `build_qid`.

### 4.2 Quotes

One row per quote, not one row per sighting. Columns beyond the key and the `jsonb` legs:

`build_qid`, `agent`, `task_id`, `source`, `structure` with a check on its four values, `first_seen`, `last_seen`, `seen_count`, `first_date`, `last_date`, `price`, `currency`, `price_dkk`, `tickets`, `self_transfer`, `us_transit`, `out_hours`, `home_hours`, `usable`, `flags text[]`, `fare_brand`, `cabin_bag`, `checked_bag`, `changeable`, `link`, `notes`, `trip_name`.

- `quote_id` is a hash of `quote_key` plus the flight lists of every leg. It replaces both identities in storage.
- `build_qid` is today's `qid`, stored unchanged so trips resolve and the pipeline does not move. `qid` stays flawed as a build id, as fixing it would rename ways and tickets once. It can be fixed later in one planned step.
- `usable` is computed by `tripdb` with the rule in `ingest.py:136` to `141`, made importable. Lines 53 to 75 and 130 to 141 of `ingest.py` become functions for this, so each rule has one definition.

Import folds repeats into one row, with `first_seen`, `last_seen` and `seen_count`, and takes `seq` from the first file order, so `ingest.py` still keeps the first row of a qid. The count falls from 3,785 to about 3,625, and the import test records the exact number. Import stops if one `quote_id` maps to two `build_qid` values.

A write is one call to `add_quotes(rows jsonb)`, with the computed fields already on each row:

```sql
insert into quotes (...) values (...)
on conflict (quote_id) do update set
  last_seen = greatest(quotes.last_seen, excluded.last_seen),
  seen_count = quotes.seen_count + 1;
```

A plain REST upsert cannot do this, as it only overwrites. The function also inserts airport stubs, and returns the counts of added and seen again rows so `add-quotes` can print what it prints today.

| Step for 14 quotes | Old plan | This design |
|---|---|---|
| REST calls | 7: lease, 4 pages of keys, insert, release | 1 |
| Data read | About 3,600 keys, 600 KB | None |
| Estimated time | 0.3 to 0.7 s | About 0.1 s |
| Two writers at once | Safe only through the lease | Safe from the unique constraint |

Times are estimates from the measured 40 to 90 ms per HTTPS call. The measured 36 ms insert went through the pooler, which agents do not use.

### 4.3 Trips

A trip is a saved document with versions and is read whole, so `data jsonb` stays. Every save adds a version, and a save with the same content is skipped. Same content means `data` without `version`, `saved_at` and `by`, as in `_trip_content` today.

`save_trip(trip jsonb)` does this in one place for Python and the planner:

1. Takes an advisory lock on the trip id for the transaction.
2. Reads the latest version of the id.
3. Returns that version with `skipped: true` if the content is the same.
4. Otherwise inserts the next version, stamping `saved_at`.

`tripdb check` keeps wanting versions 1, 2, 3 with no gap. The `by` field is the column `saved_by`, and `data` keeps `by`.

`trips_latest` is a view of the newest version of each trip that is not deleted. Deleting sets `deleted_at` on every version of the id, and `delete-trip` does the same instead of removing rows. This replaces the per browser `hidden` list, so a trip deleted in one window is gone from all of them and can be restored.

`TRIP_HOP` must learn `parked` and the leg's own day. A `Hop` has both today and the table schema lists neither, so they would otherwise be lost on save.

### 4.4 Documents

`list-add` and `list-remove` edit a document, and two writers must not lose each other's change. Each edit reads `version`, writes with a condition on that version, and retries from the read if no row changed.

The other documents are edited by hand today. Two new commands cover that: `tripdb doc-get NAME` writes the document to a file, and `tripdb doc-put NAME FILE` checks it is valid JSON and stores it with the same version condition.

`web` app trips go to one `documents` row named `web_trips`, last write wins.

## 5. tripdb

The store layer is the seam. Today `rows_of`, `append_rows`, `write_atomic`, `load_doc`, `known_quotes` and `Lock` touch the disk directly. They move behind one interface with two implementations.

| Class | Used for | Reads and writes |
|---|---|---|
| `FileStore` | Tests, and until cutover | The files of today, so `test_tripdb.py` keeps working |
| `SupabaseStore` | After cutover, and in the worker | REST on the project with the secret key |

`TRIPDB_STORE=supabase` selects the second, and it becomes the default at cutover. `SUPABASE_URL` and `SUPABASE_SECRET_KEY` come from the environment, or from the git ignored `.env` at the root when they are not set. They are never written to a tracked file. Without them `tripdb` stops with a clear message and writes nothing.

`SupabaseStore` holds one table of column maps, from the fields of `data/README.md` to the columns of 4.1. Fields not in the map go to `extra`. Reading back must drop nulls for fields that were absent, so the pipeline gets the rows it gets today.

Rules for `SupabaseStore`:

- Page every read until `Content-Range` says the total is reached. A short page does not prove the end, because the server may cap the page below the size asked for.
- Send the secret key on the `apikey` header.
- `add-quotes` calls `add_quotes`. `cmd_add_quotes` at `tripdb.py:425` and `_add_rows` at `tripdb.py:490` move to upserts with `on_conflict`, ignoring duplicates, or merging with `--replace`. `quote_keys` and `known_quotes` are not ported.
- Use `Prefer: return=minimal` on inserts, in batches, and stop on the first failed batch with the row range in the message.
- `update-experience` patches the row by `id`.
- `check` reports `table:key` where it reported `file:line` today.

Writers take no lease, as constraints make two writers safe. The `build` lease stays so two builds never overlap, stale after 600 seconds. A build works on a pulled copy, so it never holds back an `add-quotes`.

New commands:

| Command | What it does |
|---|---|
| `tripdb import --from DIR` | Loads a `data/sources` folder into an empty project, folding repeats and superseded rows and creating airports. Refuses if tables hold rows, unless `--wipe`. Used for the first load and for a restore |
| `tripdb pull --to DIR` | Writes all tables and documents out as the files of today, quotes per `agent`, in `seq` order. Only the build and the backup use it. Agents do not |
| `tripdb query TABLE [--eq COL=VAL] [--in COL=A,B] [--gte COL=VAL] [--select COLS] [--limit N]` | Prints the matching rows as JSON lines. Reads tables, `trips_latest` and `derived_options`. It takes a table name, not SQL, so the same call works in every environment. `--in` looks up a trip's list of `build_qid` in one call |
| `tripdb file NAME` | Prints one built file from the bucket, for example `tripdb file places.json` |
| `tripdb status` | Prints `derive_state`, so a session can see whether its data has reached the app |
| `tripdb doc-get`, `tripdb doc-put` | See 4.4 |

`tripdb build` stays as the command the worker runs. Agents and skills stop calling it.

## 6. Planner and web

### 6.1 Reading and saving trips

The planner reads `trips_latest` directly, so a new trip needs no build. `/?trip=<id>` opens any stored trip. History comes from the older versions of the id.

Save stays explicit. It is the Save button at `TripPanel.tsx:339` and `TripDashboard.tsx:62`, so one press is one version, with no debounce.

The main work is the writer from `Journey` to trip row, in `planner/src/lib/`:

- It starts from the last stored row of the id, so `rank`, `why` and `option_id` survive a save.
- It inlines `way_in`, `way_home` and `tickets`, so a saved trip does not depend on any build.
- It computes `totals` with the same `totals` function the screen shows.
- It keeps `parked` and the day of each leg.
- A TypeScript mirror of the required fields in `tripdb.py` refuses a row that `tripdb check` would refuse. `tripdb check` still reports any bad row that gets through.

Row to journey to row must give the same content, so opening a trip and pressing Save makes no new version.

### 6.2 Live updates

The planner subscribes to Realtime changes on `trips`. A change reloads `trips_latest`. If the open trip got a newer version and has unsaved edits, the planner shows a notice and leaves the edits alone. It never replaces work on screen without being told to.

`followTab` and the `storage` listener go away for trips, as Realtime covers other tabs.

Both apps also subscribe to `derive_state`. When a build finishes, an open app fetches `meta.json` and swaps in the changed files, so new prices appear with no reload and no waiting for focus. If `last_error` is set, the app shows a strip that says the data has stopped updating. This strip is required, as an automatic build fails with nobody watching.

### 6.3 Cache and offline

The rule is show what the browser has at once, then check whether it is still current. That gives the speed of local files without a second home for the data.

| Data | Held in | Refreshed |
|---|---|---|
| Built files, 5.5 MB | The Cache API, by content hash | On open, on focus and on a `derive_state` change, `meta.json` is fetched uncached. Only files whose hash changed are downloaded, then swapped in without a reload |
| `trips_latest` | `localStorage` | On open, and on every Realtime change |
| Open tasks | Memory only | On open, and on every Realtime change |

Do not replace built files with row reads at open. A file on a CDN by hash beats running joins per open, and a cached open needs no network. Opening the planner costs 2.76 MB raw and 239 KB gzip, and route data adds 1.94 MB raw and 267 KB gzip. The gzip figures are computed, not observed.

Nothing ships with the app. A copy bundled at install would go stale the moment it was built, so `planner/public/data` and `planner/scripts/sync-data.mjs` are removed. The first open in a new browser downloads everything once, and every later open starts from the cache, with or without network.

A read from Supabase is the only thing that fills the cache, and wiping it loses nothing. The app must keep working if it is empty.

The outbox is the one exception, as it holds saves that have not reached Supabase yet. A Save with no network goes to an outbox in `localStorage` and is sent in order on reconnect, then removed. Two saves of one trip from two places become two versions and the later one is the latest. Nothing is lost, as the earlier version stays in history.

### 6.4 What stays in the browser

Filters, pane state and `latam-web.options` are preferences of one window. `.current` stays too, as the unsaved draft. `.journeys`, `.hidden`, `.seeded`, `.seed-file`, `latam-trip.trips` and `latam-trip.journey` go after the import in 9.2.

### 6.5 Ask Claude

`Ask Claude to check` in `FlightSheet.tsx` inserts a row in `tasks` through the signed in client, instead of opening a prefilled GitHub issue. One press sends it, and the button shows that it was sent.

The row carries the task JSON, plus `trip_id` and `trip_version` of the trip on screen when there is one. Claude reads that exact trip with `tripdb query`, so the task only has to say what to do, and no session needs a copy of the data first.

A strip in the app lists open and finished tasks from Realtime on `tasks`, with Claude's `result` readable in place. It replaces the GitHub issue link and the issue comment as the place to see an answer.

The app still cannot start Claude. Simon tells a session "check the checklist", as today.

## 7. Automatic build

### 7.1 Where the logic runs

Build output stays files. The pipeline writes files, the planner and the `web` app read them by URL, and every one of them can be made again from the tables.

The logic has to run outside Postgres, see section 2.

| Way | Verdict |
|---|---|
| Port to SQL or `plpgsql` | No. `chains`, `inout` and `itineraries` are 759 lines of search and scoring, and it would be a second implementation weeks before departure |
| Port to an Edge Function | No. It means rewriting 1,779 lines in TypeScript, under a 2 s CPU limit |
| GitHub Action | No. Simon wants GitHub out of the data path |
| Writer runs the build | No. It depends on every agent remembering, and that is the manual rebuild again |
| Small Python worker that only talks to Supabase | **Yes.** No code ported, one path, covers every writer |

The worker is one AWS Lambda, `latam-trip-worker`. It holds no data. It reads from Supabase, computes, and writes back to Supabase. The apps and agents never talk to it, so to them everything is a query on Supabase.

### 7.2 What happens

1. A statement trigger on `quotes`, `places`, `connections`, `profiles`, `place_images`, `experiences`, `experience_images`, `stays`, `task_log` and `inbox` sets `derive_state.dirty_at`. `documents` has a row trigger instead, as a statement trigger cannot see the row, with a `when` condition that skips `web_trips`, `way_id_map` and `unresolved_journeys`, which the pipeline does not read. `trips` and `tasks` have no trigger, as the apps read those directly.
2. EventBridge Scheduler starts the worker every minute.
3. The worker reads the one row of `derive_state`, and stops there unless all of these hold:
   - `dirty_at` is newer than `built_dirty_at` and is not `failed_dirty_at`.
   - No write came in the last 60 seconds.
   - The last start was at least 5 minutes ago.
4. It takes the `build` lease and runs `tripdb ingest-inbox`, so a Momondo save needs no session.
5. It reads `dirty_at` again and keeps that value, sets `last_started`, and runs `tripdb pull` into `/tmp/work`. Ingest happens before this read, so its own writes do not cause a second build.
6. It runs today's flow with `--root /tmp/work` and `sync=False`: check, steps, publish, `pair_dates`, `export_trips`.
7. It uploads `data/web/*.json` to the public bucket `web`, under the same `data/web/` path, with `meta.json` last so a reader never sees a new stamp before the new files. `meta.json` gains a `files` map of name to content hash, and each file is stored under its hash as well.
8. It replaces `derived_options`, sets `built_dirty_at` to the value from step 5, sets `last_finished` and `manifest_hash`, clears `last_error`, and releases the lease.

If a step fails, the old files stay live. The worker writes `last_error`, sets `failed_dirty_at` to the value from step 5 and releases the lease. It does not try again until new data moves `dirty_at`, so a refused row cannot burn the egress budget by retrying every 5 minutes. The strip in 6.2 tells Simon.

Delay from the last write to the app, estimated: 60 seconds of quiet, up to 60 seconds to the next start, and about 15 seconds of run, so about 1 to 2.5 minutes. During a long crawl the 5 minute gap sets the pace, so the app gets new prices at most every 5 minutes. The gap exists for egress, see section 11.

### 7.3 Worker setup

| Part | Setting |
|---|---|
| Runtime | Newest Python Lambda runtime, 1024 MB, 5 minute timeout, default 512 MB of `/tmp`, in `eu-west-1` next to the database |
| Package | A plain zip of `plugin/scripts/tripdb.py`, the pipeline scripts at the same relative paths so `PIPELINE` resolves, and `infra/worker/handler.py`. No dependencies, as all of it is standard library. The handler may use `boto3`, as the runtime includes it |
| Secret | `/latam-trip/supabase-secret-key` as an SSM SecureString, read at cold start and passed to `tripdb` through the environment |
| Schedules | `rate(1 minute)` for builds, and one daily for the backup in section 12 |
| Endpoint | None. EventBridge invokes it directly, so nothing is public and no token sits in the database |
| Naming | Everything prefixed `latam-trip-`, tagged `project=latam-trip` |
| Deploy | `infra/deploy.sh` from this PC, using `AWS_PROFILE` when set. It writes the git sha into the zip, and the worker stores it in `derive_state.worker_version`. The repo is public, so no account id or profile name goes in it |

A change to `tripdb.py` or the pipeline reaches the worker only through `deploy.sh`, so `CLAUDE.md` must say that, and `tripdb status` prints `worker_version` next to the local sha.

### 7.4 Stable way ids

This must land before automatic builds. Today each build can renumber ways, and automatic builds would make that dozens of times a day.

`inout.py:176` changes to a hash of the key at `inout.py:172`, about 3 lines. All 916 ways have distinct content, so the hash is safe. `WAYS` is a dict keyed by id, and no frontend code parses the id format.

The first build with hash ids also writes a one off document `way_id_map`, old id to new id, from the `inout.json` before it. The browser import in 9.2 uses it, so saved journeys survive the change.

### 7.5 Readers

| File | Change |
|---|---|
| `planner/src/data/load.ts` | `VITE_DATA_BASE` is the bucket URL, read through the cache in 6.3. `quoteLink` needs a new target, see below |
| `planner/src/data/pairDates.ts`, `routeMap.ts` | Drop the `DEV` branch and read through the same cache |
| `planner/vite.config.ts` | `serve-repo-data` goes |
| `planner/scripts/sync-data.mjs` | Goes, see 6.3 |
| `web/src/data/load.ts` | Same `VITE_DATA_BASE` and the same cache |

`quoteLink` is dead today. It goes to a small sheet in the app that shows the quote from `pair_dates`, not to a file.

`sync_claude_dir.py` is about the plugin, not data, so it stays a step of its own in the repo, run by hand after skill changes.

Agents and skills that read `data/sources`, `data/built` or `data/web` by path change to `tripdb query` and `tripdb file`:

- `plan-trip` and `latam-trips` read `trips_latest`, `derived_options`, `tripdb file places.json` and the like.
- `refresh` in `trip-checklist` finds old prices with a query on `quotes`, not in `data/built/trip.db`. Line 27 looks up the tickets of the top 10 trips through `build_qid` with `--in`.
- `trip-checklist` and `tasks.py` work on `tasks`, see 8.3.
- The agents and the Momondo skills keep `data/raw` as scratch and write with `tripdb`, as they do today. Only the wording around their paths changes, and every "run `tripdb build`" step goes.
- The scripts of `flight-crawl-orchestrator` keep their paths, as the worker runs them on `/tmp/work`.

## 8. Access

### 8.1 Sign in

Magic link, public sign ups off, one account made in the dashboard, its id in `owners`. Row level security is on for every table, and each policy is `(select is_owner())`, so the check runs once per statement and not once per row:

```sql
create function is_owner() returns boolean language sql stable security definer
  set search_path = ''
as $$ select exists (select 1 from public.owners where user_id = auth.uid()) $$;
```

| Client | Key | Reach |
|---|---|---|
| Planner, `web` | Publishable key `sb_publishable_...`, safe in the bundle | Only what the signed in owner may do |
| `tripdb`, the worker | Secret key `sb_secret_...` | Everything, bypasses row level security |
| Userscript | Publishable key plus its own `INBOX_TOKEN` | Only the functions `submit_inbox` and `submit_task` |

New keys from day one, as the legacy `anon` and `service_role` keys are being deprecated. Default execute on `add_quotes` is revoked from `public`, `anon` and `authenticated`.

Redirect URLs list `http://localhost:5198`. Hosting the planner for the phone is a separate follow up, as Supabase does not provide it, and it adds one more redirect URL.

Never commit a key. Keys go in `.env` at the root, which is git ignored, in the Claude environment settings, and in SSM for the worker. The repo is public, so this matters. `.env` was added to `.gitignore` on 31 Oct 2026.

### 8.2 Userscript

The database function `submit_inbox(token, file, rows)` replaces the GitHub PUT to `data/sources/inbox`. It is `security definer`, compares `INBOX_TOKEN` with a hash stored in a table no client can read, inserts the rows with `status = 'new'` and returns the count. It does no row checks, as `ingest-inbox` keeps those, with the source rule and the rejected reasons.

`submit_task(token, task)` does the same for the `fix_parser` and `import_quotes` tasks the userscript opens as issues today.

A database function needs nothing deployed, unlike the Edge Function an earlier version of this spec used.

Changes in `plugin/userscripts`: the `@connect` line in `build.js`, the upload, the issue calls and the self check in `momondo-save.core.js`, and `test/inbox.test.js`. `docs/momondo-save.md` gets new setup steps. The token lives only in the Tampermonkey store, as the GitHub token does today, and is never pasted into a chat, an issue or a repo file. The GitHub token leaves the userscript.

### 8.3 Task queue

`tasks` replaces GitHub Issues with the label `claude-task`, so a task and its answer live with the rest of the data.

- `tasks.py` keeps its commands. `list` and `show` read `tasks`, `done` writes `result`, `status` and `done_at` and then runs `log-task`. A new `start` sets `working`. `url` goes, as there is no issue to prefill.
- `log-task` takes a task id. Rows already in `task_log` keep their issue numbers.
- `docs/claude-tasks.md` and `trip-checklist` are rewritten around the table.
- At cutover, the open `claude-task` issues become rows and are closed with a comment that points at the table. Closed issues stay on GitHub as history.

## 9. Moving over

### 9.1 Phases

All phases happen on `supabase-migration`, and each ends with something that works. `main` and its files stay the truth until phase 6, and agents may keep crawling there. Merge `main` into the branch regularly, taking either side of generated data as `CLAUDE.md` says.

| Phase | Work | Done when |
|---|---|---|
| 0. Go or no go | Simon finishes section 10. Check each environment. Deploy a hello version of the worker that runs the unchanged pipeline on a copy of the data in `/tmp` | This PC, cloud Claude sessions and Claude desktop all reach `*.supabase.co` with the secret, and the pipeline runs in the worker, with its time recorded |
| 1. Schema and import | Stable way ids from 7.4. Migrations in `supabase/migrations`, `add_quotes`, `tripdb import`, `tripdb pull` | Round trip test and golden compare pass on real data and can be rerun at will |
| 2. Store layer | `FileStore`, `SupabaseStore`, column maps, upserts, `build_qid` and `usable`, `tripdb query`, contract tests | Every `tripdb` test passes on both stores |
| 3. Planner | Sign in, row writer, `save_trip`, Realtime, outbox, one off import, behind a flag | Save in one window shows in another within seconds |
| 4. Worker and cache | Triggers, `derive_state`, the worker and its schedule, upload, `derived_options`, `tripdb file`, `tripdb status`, reader changes, the cache in 6.3, the error strip | A row written to the test project reaches an open planner with nobody running anything, the planner opens from cache with no network, and a failed build shows the strip |
| 5. Tasks and userscript | `tasks`, `tasks.py`, Ask Claude in the app, database functions, token, script update | One press in the app shows up in `tasks.py list`, its result shows in the app, and a Momondo save lands in `inbox` and reaches the app by itself |
| 6. Cutover | See 9.3 | Agents write only to Supabase, data is gone from `main`, and a daily backup runs |

If phase 0 fails for an environment, stop. An environment that cannot reach Supabase cannot run `tripdb`, and the plan needs a rethink before any code is written. Network access from cloud sessions is the likeliest place for this.

**Fallback rule.** If the round trip for this schema is not green by 8 Nov 2026, keep `quotes`, `places` and `airports` as in 4.1, and store every other table as key columns plus `data jsonb`, with a view giving one latest row per id. Those three tables carry nearly all the benefit.

### 9.2 Importing browsers

On first sign in, each browser runs one import, once, marked by a `latam-planner.imported` key.

- Way ids are translated with `way_id_map` first, see 7.4.
- Each entry of `latam-planner.journeys` goes through the row writer and `save_trip`, keeping its id.
- Each id in `hidden` becomes a soft delete.
- A journey whose way ids still do not resolve cannot become a row, so it goes unchanged to a `documents` row `unresolved_journeys`, and the planner lists it so it can be rebuilt by hand.
- Duplicates are left alone for Simon to clean up in the app.
- The `localStorage` keys are kept until phase 6 is proven, then removed.

### 9.3 Cutover

1. Stop agents. No Claude session writes during this.
2. Merge `main` into the branch, then run `tripdb ingest-inbox` and a last build from git.
3. `tripdb import --from data/sources --wipe`.
4. Verify with the round trip test, the golden compare and `tripdb check`.
5. Move the open `claude-task` issues into `tasks`, see 8.3.
6. Set `TRIPDB_STORE=supabase` everywhere and `VITE_DATA_BASE` to the bucket. Enable both worker schedules.
7. Run the backup once by hand. Restore that archive into the second project and check it with the round trip test.
8. Remove `data/sources`, `data/built`, `data/web`, `planner/public/data` and `planner/scripts/sync-data.mjs`, and add `data/` to `.gitignore`, keeping `data/README.md`.
9. Update `CLAUDE.md`, `data/README.md`, `docs/momondo-save.md`, `docs/claude-tasks.md`, `plugin/README.md`, `plugin/skills/latam-trips/SKILL.md`, and the publish steps in `plugin/skills/trip-checklist/SKILL.md` and `plugin/skills/plan-trip/SKILL.md`. `CLAUDE.md` must stop saying that `data/` is the truth, and must say how the worker is deployed.
10. Merge `supabase-migration` into `main`, push, confirm `git log main..supabase-migration` is empty, and delete the branch.

To roll back before step 8, set `TRIPDB_STORE` back and disable the schedules. After step 8, git history and the backup both hold the data, but the history is not rewritten, so the old files stay visible there.

## 10. What Simon must do

Claude cannot create accounts or read keys from the dashboard, so these come first.

Done on 31 Oct 2026: the project `nwwhaxodxkhvadnpkppt` in `eu-west-1`, on Postgres 17, and the database password in `.env`. The project was checked and is empty.

1. Copy the publishable key and the secret key from Project Settings, API Keys, into `.env` as `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`.
2. Turn off public sign ups, add the one user, and add `http://localhost:5198` to the redirect URLs.
3. Create a second free project for contract tests and the restore test. Put its URL and secret key in `.env` as `SUPABASE_TEST_URL` and `SUPABASE_TEST_SECRET_KEY`.
4. Add the first two keys to the Claude environment settings used by cloud sessions and Claude desktop.
5. Install the updated userscript and paste the new token into Tampermonkey in phase 5.

Claude writes the SSM parameters from `.env` and deploys the worker from this PC. Signing in to the Supabase MCP with `/mcp` is useful for looking at data in a session, but nothing in this spec depends on it. The database password is enough to apply migrations through the `aws-0-eu-west-1` pooler on port 5432. The direct host `db.nwwhaxodxkhvadnpkppt.supabase.co` does not resolve from this PC.

## 11. Limits and cost

The Supabase free plan fits: 500 MB of database, 1 GB of storage, 50 MB per file, 2 active projects, 60 connections, 200 peak Realtime connections and 2 million messages, 50,000 monthly auth users. Sources are about 5 MB, and the largest built file is 1.8 MB.

The worker should cost about nothing. Polling each minute is about 43,200 Lambda starts a month, well inside the free tier of 1 million, and the private backups are a few MB a day.

| Risk | Answer |
|---|---|
| A free project pauses after about a week of low activity | The worker reads the database each minute. Check after a quiet week that this counts as activity |
| No automatic backups, no point in time recovery | The daily archive, restored with `tripdb import`. Up to a day of work can be lost |
| Egress: a full load is 5.5 MB, so 5 GB is about 900 full loads, and each build also downloads about 5 MB, so about 1,000 builds a month shared with app loads | The hashes in `meta.json`, the cache in 6.3, and the 5 minute gap between builds. Watch the Usage page for the first weeks, and raise the gap if a crawl spends too much |
| The worker fails with nobody watching | Old files stay live, `last_error` shows as the strip in 6.2, and `tripdb status` prints it |
| The worker runs old code | `worker_version` shows in `tripdb status`. It can only be deployed from this PC, see section 14 |
| The public bucket exposes built data | Same exposure as today, as the repo is public. `trip.json` was checked and holds no personal details |
| A session in an environment with no route to Supabase can do nothing, as no copy exists in the repo | Phase 0 checks each environment. This is the price of one home for the data |
| A Supabase outage | The planner opens from its cache and queues saves. `tripdb` fails with a clear message and agents wait |

## 12. Backup

The worker's daily schedule runs `tripdb pull` into `/tmp`, packs it into one `.tar.gz` and stores it in the private S3 bucket `latam-trip-backups`, with public access blocked and a 90 day expiry rule. The bucket name gets a suffix if the name is taken. It commits nothing.

This is not a second home for the data. It is a dated archive that nothing reads but a restore: download it, unpack it and run `tripdb import --from DIR --wipe`. One restore is tested in phase 6 against the second project.

## 13. Tests

| Test | Proves |
|---|---|
| Round trip: import real `data/sources`, pull, compare parsed rows and order per table | Nothing is lost. Repeats and superseded rows fold as designed, and the counts are recorded |
| Golden compare: `data/web` from a build on `pull` against a build from the same data in git. Every difference must be explained | The pipeline is unchanged. Expected differences: the `at` format in `pair_dates`, as 172 short `observed_at` values gain seconds, and the quote row count |
| Store contract: the same suite on `FileStore`, and on `SupabaseStore` when `SUPABASE_TEST_URL` is set | The stores behave alike, including skipped, refused and replaced rows |
| `add_quotes`: two writers at once, the same batch twice, a new airport | One row per quote, `seen_count` is right, and no crawl is blocked |
| Foreign keys on real data | Any row today only a note in `check` that a key would refuse is found at import, not during a crawl |
| `save_trip`: two saves at once, same content, next version | Versions stay 1, 2, 3 |
| Row level security: no key, publishable key signed out, a signed in non owner | None can read or write. `add_quotes` cannot be called with the publishable key |
| Row writer: row to journey to row on every stored trip | Opening and saving makes no new version |
| Stable ids: two builds of the same data, then a build with one new quote | Way ids do not move |
| Outbox: offline saves, reconnect, order | No save is lost |
| Cache: open with no network, wipe it, a build that changes one file | The app opens offline, an empty cache is fine, and only the changed file is downloaded |
| Tasks: press in the app, `tasks.py list`, `done` | The task arrives, and the result shows in the app within seconds |
| Userscript functions: a wrong token, and any table reached with the publishable key signed out | Nothing is written |
| Worker: write a row, wait. Write a row the check refuses, wait. Keep writing through a quiet period | The file updates with nobody running anything, the strip shows and no retry loop starts, and no build starts mid burst |
| End to end: two windows, save in one | The other shows the trip within seconds |

## 14. Not in this spec

- Hosting the planner for the phone. Until then the app runs on this PC, and the first thing a phone needs is a hosted copy. Worth doing before 2 Dec 2026, as a separate piece of work.
- Deploying the worker from a cloud session. It deploys from this PC only, so a pipeline fix made from the phone during the trip would not reach the worker. Worth settling alongside hosting.
- Starting Claude from the app.
- Moving `pair_dates`, `inout` or other built files into tables.
- Porting any pipeline logic to SQL or Edge Functions.
- Normalising legs, flights or trips, and an airline table.
- GIN indexes, partitions, or a junction table for experiences.
- Fixing `qid`, unless a hidden flight time turns out to matter.
- Airline spelling aliases in `bag_rules.json` and `chains.py`. They would cut unknown checked bag fees from 122 tickets to 38 and change no option total, so they are a small change of their own.
- Rewriting git history to remove old data.
- More than one account.

## 15. Not verified

These came up while writing and could not be confirmed. Check each in phase 0 or 1.

- Whether cloud Claude sessions and Claude desktop reach `*.supabase.co`. This PC does, checked on 31 Oct 2026.
- Whether the Python pipeline runs as is in Lambda, with `subprocess` and `sys.executable`, and how long a full run takes. About 15 seconds is an estimate from 2.2 s of steps on this PC.
- Whether the organisation that owns the AWS account allows `eu-west-1` and EventBridge Scheduler. Other work there runs in `eu-north-1`.
- Whether Lambda reaches Supabase with no extra network setup.
- Whether PostgREST caps a page at 1000 rows on this plan. The paging rule in section 5 works either way.
- How Storage sets `cacheControl`, whether it serves gzip, and whether the CDN treats a file stored under a new hash as new.
- Egress on the free plan. The pricing page says 5 GB plus 5 GB cached, and the bandwidth docs say 10 GB in total. Also whether a gzip pull counts its compressed size.
- The exact rule for pausing. The FAQ of 27 Oct 2026 speaks of low activity.
- The rate limit on magic link emails from the built in mail service.
- Golden equality under this schema. It needs a database, so it has not been run.
- How many journeys in browsers already have dead way ids. They live in `localStorage`.
- The exact distinct quote count. Two counts gave 3,625 and 3,626, and 24 and 28 split keys. The import test settles it.
- The price of the Pro plan.

## 16. Sources

Read on 30 and 31 Oct 2026.

- https://supabase.com/pricing
- https://supabase.com/docs/guides/storage/serving/bandwidth
- https://supabase.com/docs/guides/storage/uploads/file-limits
- https://supabase.com/docs/guides/platform/compute-and-disk
- https://supabase.com/kb/faqs/platform/database-only-cost
- https://supabase.com/docs/guides/realtime/limits
- https://supabase.com/docs/guides/functions/pricing
- https://supabase.com/docs/guides/functions/limits
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
- https://supabase.com/changelog/29260-upcoming-changes-to-supabase-api-keys

The schema was reviewed against Supabase's `supabase-postgres-best-practices` rules on 31 Oct 2026, in particular `schema-constraints`, `schema-primary-keys`, `schema-data-types`, `schema-foreign-key-indexes`, `data-upsert`, `data-batch-inserts`, `lock-advisory`, `advanced-jsonb-indexing`, `security-rls-basics` and `security-rls-performance`.
