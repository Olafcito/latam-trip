# All trip data in Supabase

Status: spec only, written 30 Oct 2026. Nothing in here is built. Simon decided one thing: all data moves to Supabase. Every other decision below was made while writing this spec and can be overturned.

Code stays in git. Only data moves.

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
- Claude sessions use the same `tripdb` commands as today and the same checks refuse the same bad rows.
- Agents stop committing data, so `main` holds code and one daily snapshot.
- If the Supabase project is lost, it can be rebuilt from the snapshot with one command.

## 2. What is there now

Counted on 30 Oct 2026.

| Data | Where | Size |
|---|---|---|
| Quotes | `data/sources/quotes/<agent>.jsonl`, 108 files | 3736 rows, 3.8 MB |
| Experiences | `experiences.jsonl` | 504 rows, 706 KB |
| Connections | `connections.jsonl` | 250 rows, 149 KB |
| Profiles | `profiles.jsonl` | 123 rows, 138 KB |
| Places | `places.jsonl` | 98 rows, 34 KB |
| Place images, experience images | `place_images.jsonl`, `experience_images.jsonl` | 67 and 25 rows |
| Stays | `stays.jsonl` | 35 rows, 19 KB |
| Trips | `trips.jsonl` | 9 rows, 8 trips, 56 KB |
| Task log | `task_log.jsonl` | Small |
| Agent usage | `agent_usage.csv` | 96 rows |
| Documents | `trip.json`, `bag_rules.json`, `known_prices.json`, `scenarios.json`, `experience_categories.json`, `lists.json`, `elevation.json`, `image_queries.json` | 45 KB |
| Inbox | `data/sources/inbox`, `processed`, `rejected` | Files from the userscript |
| Built | `data/built`, 11 MB, `data/web`, 5.4 MB | Made by `tripdb build`, committed today |
| Browser | `latam-planner.journeys`, `.current`, `.hidden`, `.seeded`, `.seed-file`, `.filters`, `latam-trip.trips`, `latam-trip.journey`, `latam-web.options` | Per browser |

`data/README.md` has the fields of every table and the rule for when two rows are the same row. This spec does not repeat them, and they do not change.

Facts that shaped the design:

- 175 quote keys appear more than once, 181 extra rows in all. A plain unique constraint on the quote key would lose rows.
- No table holds `\u0000`, which `jsonb` refuses.
- `jsonb` does not keep key order, so a byte for byte round trip is not possible. The round trip test compares parsed values.
- `tripdb.py` uses the standard library only and runs under `python -I`. Its tests are file based.
- Every pipeline script takes `--root`, so the pipeline can run on a folder that is not the repo.
- Way ids in `inout.json` change with each build. Table trips keep their own ways, but trips built in the planner store only ids, and no code turns a journey into a trip row.
- The desktop icon runs Vite in dev mode on 5198, so the `import.meta.env.DEV` branches are the path Simon uses every day.
- `quoteLink` points at `data/quotes.csv`, which no longer exists. That link is already dead.
- `data/sources/trip.json` holds no name, email, phone or passport data.

## 3. Decisions at a glance

| Topic | Decision |
|---|---|
| Truth | Postgres in one Supabase project holds every table and document |
| Row shape | Typed key columns plus `data jsonb` with the whole original row |
| Python writer | `tripdb` stays the only one, same commands and checks, with its file access moved behind a store layer |
| HTTP | REST through `urllib`, so no new Python dependency |
| Planner writer | A new journey to row writer, then a `save_trip` database function shared with Python |
| Live updates | Realtime on trips, a local cache and an outbox for offline |
| Built files | Stay files, in a public Storage bucket |
| Pipeline | Unchanged, run on a pulled copy in a git ignored folder |
| Sign in | Magic link, public sign ups off, row level security for one owner |
| Userscript | Posts to an Edge Function with its own token |
| Task queue | GitHub Issues stays |
| Backup | A scheduled GitHub Action writes `data/sources` as a read only snapshot |
| Stays local | `data/raw`, UI preferences, the unsaved draft in `.current` |
| Stays in git | Code, `docs/learnings` |

## 4. Data model

### 4.1 Tables

Every table has `seq bigint generated always as identity`, so reads can follow file order. Order matters: with `--replace` the later row wins in the build.

| Table | Primary key | Key columns | Notes |
|---|---|---|---|
| `quotes` | `seq` | `agent`, `key`, `observed_at` | `agent` is the file stem. `key` is the output of `quote_key`, indexed, not unique |
| `places`, `connections`, `profiles`, `place_images`, `experiences`, `experience_images`, `stays` | `seq` | `kind`, `row_id` | `row_id` is the identity `tripdb` uses today, indexed, not unique, because a replaced row is added after the old one |
| `task_log` | `seq` | `issue` | |
| `trips` | `id`, `version` | `saved_at`, `saved_by`, `deleted_at` | The `by` field is `saved_by` as a column because `by` is reserved in SQL. `data` keeps `by` |
| `agent_usage` | `seq` | The nine `USAGE_COLS` | Typed columns, no `data` |
| `documents` | `name` | `version`, `updated_at` | One row per JSON document, `data` is the document |
| `inbox` | `id` | `file`, `status`, `reason`, `created_at` | `status` is `new`, `added` or `rejected`. Replaces the three inbox folders |
| `leases` | `name` | `holder`, `expires_at` | Replaces the lock file across machines |
| `owners` | `user_id` | | The one signed in account allowed in. It holds an id, so no email address goes in the repo |

```sql
create table quotes (
  seq bigint generated always as identity primary key,
  agent text not null,
  key text not null,
  observed_at timestamptz,
  data jsonb not null
);
create index quotes_key on quotes (key);
```

### 4.2 Quotes

Import keeps every row, the 181 repeats included. `pair_dates` already takes the newest `observed_at` of a key, so the output does not change.

New rows follow `sort_quotes`: a key already stored is added again only when the observation is newer. A view `quote_keys` gives the newest `observed_at` per key, so `add-quotes` no longer reads every row just to find duplicates. Python computes `key`, so the planner and the database never need to know how.

### 4.3 Trips

Every save adds a version, and a save with the same content is skipped. Same content means `data` without `version`, `saved_at` and `by`, as in `_trip_content` today.

`save_trip(trip jsonb)` does this in one place for Python and the planner:

1. Takes an advisory lock on the trip id for the transaction.
2. Reads the latest version of the id.
3. Returns that version with `skipped: true` if the content is the same.
4. Otherwise inserts the next version, stamping `saved_at`.

`tripdb check` keeps wanting versions 1, 2, 3 with no gap.

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
| `SupabaseStore` | After cutover | REST on the project with the secret key |

`TRIPDB_STORE=supabase` selects the second. `SUPABASE_URL` and `SUPABASE_SECRET_KEY` come from the environment and are never written to a file in the repo.

Rules for `SupabaseStore`:

- Page every read, ordered by `seq`, until `Content-Range` says the total is reached. A short page does not prove the end, because the server may cap the page below the size asked for.
- Send the secret key on the `apikey` header.
- Use `Prefer: return=minimal` on inserts, in batches, and stop on the first failed batch with the row range in the message.
- `update-experience` patches the row by `seq`.
- `check` reports `table:seq` where it reported `file:line` today.

`Lock` becomes a lease row with the same timing: stale after 600 seconds, wait up to 120. `tripdb` commands take the `write` lease. The build takes a separate `build` lease and works on a pulled copy, so a build does not hold back an `add-quotes`.

New commands:

| Command | What it does |
|---|---|
| `tripdb import --from DIR` | Loads a `data/sources` folder into an empty project. Refuses if tables hold rows, unless `--wipe`. Used for the first load and for a restore |
| `tripdb pull [--to DIR]` | Writes all tables and documents out as the files of today, quotes per `agent`, in `seq` order |
| `tripdb doc-get`, `tripdb doc-put` | See 4.4 |

## 6. Planner and web

### 6.1 Reading and saving trips

The planner reads `trips_latest` directly, so a new trip needs no build. `/?trip=<id>` opens any stored trip. History comes from the older versions of the id.

Save stays explicit. It is the Save button at `TripPanel.tsx:339` and `TripDashboard.tsx:62`, so one press is one version, with no debounce.

The main work is the writer from `Journey` to trip row, in `planner/src/lib/`:

- It starts from the last stored row of the id, so `rank`, `why` and `option_id` survive a save.
- It inlines `way_in`, `way_home` and `tickets`, because way ids do not outlive a build.
- It computes `totals` with the same `totals` function the screen shows.
- It keeps `parked` and the day of each leg.
- A TypeScript mirror of the required fields in `tripdb.py` refuses a row that `tripdb check` would refuse. `tripdb check` still reports any bad row that gets through.

Row to journey to row must give the same content, so opening a trip and pressing Save makes no new version.

### 6.2 Live updates

The planner subscribes to Realtime changes on `trips`. A change reloads `trips_latest`. If the open trip got a newer version and has unsaved edits, the planner shows a notice and leaves the edits alone. It never replaces work on screen without being told to.

`followTab` and the `storage` listener go away for trips, as Realtime covers other tabs.

### 6.3 Offline

The last `trips_latest` is cached in `localStorage`, so the planner opens with no network. A Save with no network goes to an outbox in `localStorage` and is sent in order on reconnect. Two saves of one trip from two places become two versions and the later one is the latest. Nothing is lost, as the earlier version stays in history.

### 6.4 What stays in the browser

Filters, pane state and `latam-web.options` are preferences of one window. `.current` stays too, as the unsaved draft. `.journeys`, `.hidden`, `.seeded`, `.seed-file`, `latam-trip.trips` and `latam-trip.journey` go after the import in 9.2.

## 7. Built files

Build output stays files. The pipeline writes files, the planner and the `web` app already read them by URL, and every one of them can be made again from the tables.

`tripdb build` becomes:

1. Take the `build` lease.
2. `tripdb pull` into `.work/` at the repo root, which is git ignored.
3. Run today's flow with `--root .work`: inbox, check, steps, publish, `pair_dates`, `export_trips`.
4. Upload `.work/data/web/*.json` to the public bucket `web`, under the same `data/web/` path, with `meta.json` last so a reader never sees a new stamp before the new files.
5. Release the lease.

`sync_claude_dir.py` is about the plugin, not data, so it stays a step of its own in the repo.

Readers:

| File | Change |
|---|---|
| `planner/src/data/load.ts` | `VITE_DATA_BASE` is the bucket URL. `quoteLink` needs a new target, see below |
| `planner/src/data/pairDates.ts`, `routeMap.ts` | Drop the `DEV` branch, so 5198 reads the bucket first and the local copy second |
| `planner/vite.config.ts` | `serve-repo-data` serves `.work/data/web` |
| `planner/scripts/sync-data.mjs` | Fetches the offline copy from the bucket |
| `web/src/data/load.ts` | Same `VITE_DATA_BASE` |

`quoteLink` is dead today. It goes to a small sheet in the app that shows the quote from `pair_dates`, not to a file.

To save egress, fetch `meta.json` uncached and the others with `?v=<stamp>`, so a reload with no new build costs one small file.

Agents and skills that read `data/sources`, `data/built` or `data/web` by path run `tripdb pull` first and read `.work/`. That covers the five agents with data paths, `plan-trip`, `latam-trips`, `trip-checklist`, `momondo-search`, `flight-crawl-orchestrator` and its references.

## 8. Access

### 8.1 Sign in

Magic link, public sign ups off, one account made in the dashboard, its id in `owners`. Row level security is on for every table, and each policy is `is_owner()`:

```sql
create function is_owner() returns boolean language sql stable security definer
  set search_path = ''
as $$ select exists (select 1 from public.owners where user_id = auth.uid()) $$;
```

| Client | Key | Reach |
|---|---|---|
| Planner, `web` | Publishable key `sb_publishable_...`, safe in the bundle | Only what the signed in owner may do |
| `tripdb`, the build | Secret key `sb_secret_...` | Everything, bypasses row level security |
| Userscript | Own `INBOX_TOKEN` | Only the Edge Function |

New keys from day one, as the legacy `anon` and `service_role` keys are being deprecated.

Redirect URLs list `http://localhost:5198`. Hosting the planner for the phone is a separate follow up, as Supabase does not provide it, and it adds one more redirect URL.

Never commit a key. Keys go in `.env.local`, which must be added to `.gitignore`, in the Claude environment settings, and in GitHub Actions secrets.

### 8.2 Userscript

An Edge Function `inbox` replaces the GitHub PUT to `data/sources/inbox`. It checks `INBOX_TOKEN`, inserts the rows with `status = 'new'` and returns the count. It does no row checks, as `ingest-inbox` keeps those, with the source rule and the rejected reasons.

Changes in `plugin/userscripts`: the `@connect` line in `build.js`, the upload and the self check in `momondo-save.core.js`, and `test/inbox.test.js`. `docs/momondo-save.md` gets new setup steps. The token lives only in the Tampermonkey store, as the GitHub token does today, and is never pasted into a chat, an issue or a repo file.

The GitHub token stays for opening issues, and can lose its contents permission.

### 8.3 Task queue

GitHub Issues with the label `claude-task` stays. It already reaches every session and needs no change. `tasks.py` keeps working, and `log-task` writes to `task_log` through the store.

## 9. Moving over

### 9.1 Phases

Each phase ends with something that works, and git stays the truth until phase 6.

| Phase | Work | Done when |
|---|---|---|
| 0. Go or no go | Simon creates the project, see section 10. Check each environment | This PC, cloud Claude sessions and Claude desktop all reach `*.supabase.co` with the secret |
| 1. Schema and import | Migrations in `supabase/migrations`, `tripdb import`, `tripdb pull` | Round trip test passes on real data and can be rerun at will |
| 2. Store layer | `FileStore`, `SupabaseStore`, leases, contract tests | Every `tripdb` test passes on both stores |
| 3. Planner | Sign in, row writer, `save_trip`, Realtime, outbox, one off import, behind a flag | Save in one window shows in another within seconds |
| 4. Build | `.work/`, upload, reader changes | The planner runs from the bucket, and `.work/data/web` matches a build from git |
| 5. Userscript | Edge Function, token, script update | A Momondo save lands in `inbox` and `ingest-inbox` adds it |
| 6. Cutover | See 9.3 | Agents write only to Supabase, and a daily snapshot runs |

If phase 0 fails for an environment, stop. An environment that cannot reach Supabase cannot run `tripdb`, and the plan needs a rethink before any code is written. Network access from cloud sessions is the likeliest place for this.

### 9.2 Importing browsers

On first sign in, each browser runs one import, once, marked by a `latam-planner.imported` key.

- Each entry of `latam-planner.journeys` goes through the row writer and `save_trip`, keeping its id.
- Each id in `hidden` becomes a soft delete.
- A journey whose way ids no longer resolve cannot become a row, so it goes unchanged to a `documents` row `unresolved_journeys`, and the planner lists it so it can be rebuilt by hand.
- Duplicates are left alone for Simon to clean up in the app.
- The `localStorage` keys are kept until phase 6 is proven, then removed.

### 9.3 Cutover

1. Stop agents. No Claude session writes during this.
2. Run `tripdb ingest-inbox` and a last build from git.
3. `tripdb import --from data/sources --wipe`.
4. Verify with the round trip test and `tripdb check`.
5. Set `TRIPDB_STORE=supabase` everywhere and `VITE_DATA_BASE` to the bucket.
6. Add `data/sources/.snapshot`. `FileStore` refuses to write to a folder holding that file, so a stale session cannot write to the snapshot.
7. Stop tracking `data/built` and `data/web`, and add them and `.work/` to `.gitignore`. `data/crawl.db` goes in too.
8. Update `CLAUDE.md`, `data/README.md`, `docs/momondo-save.md`, `docs/claude-tasks.md`, `plugin/README.md`, and the publish steps in `plugin/skills/trip-checklist/SKILL.md` and `plugin/skills/plan-trip/SKILL.md`.
9. Add the backup Action.

To roll back before step 7, set `TRIPDB_STORE` back and remove the marker. Git still holds everything up to the cutover.

## 10. What Simon must do

Claude cannot create accounts or enter real keys, so these come first.

1. Create a Supabase account and a free project in an EU region.
2. Create a second free project for contract tests. The free plan allows two.
3. Turn off public sign ups and make the one user.
4. Put the keys in `.env.local` on this PC, in the Claude environment settings and in GitHub Actions secrets.
5. Install the updated userscript and paste the new token into Tampermonkey in phase 5.

## 11. Limits and cost

The free plan fits: 500 MB of database, 1 GB of storage, 50 MB per file, 2 active projects, 60 connections, 500,000 Edge Function invocations, 200 peak Realtime connections and 2 million messages, 50,000 monthly auth users. Sources are about 5 MB, and the largest built file is 1.8 MB.

| Risk | Answer |
|---|---|
| A free project pauses after about a week of low activity | The daily backup Action reads the database. Check after a quiet week that this counts as activity |
| No automatic backups, no point in time recovery | The daily snapshot in git, restored with `tripdb import`. Up to a day of work can be lost |
| Egress: a full load is 5.4 MB, so 5 GB is about 940 full loads, and each build also downloads about 5 MB | The `?v=` scheme in section 7. Watch the Usage page for the first weeks |
| GitHub stops a scheduled Action after long repo inactivity | The Action fails loudly, and the trip dates keep the repo busy. Check it before any long pause |
| The public bucket and the public repo expose the data | Same exposure as today, as the repo is public. `trip.json` was checked and holds no personal details |
| A Supabase outage | The planner opens from its cache and queues saves. `tripdb` fails with a clear message and agents wait |

## 12. Backup

`.github/workflows/snapshot.yml` runs daily with the secret key from Actions secrets. It runs `tripdb pull --to data/sources`, keeps the `.snapshot` marker, and commits with a bot identity only if something changed. One restore is tested in phase 1 against the second project.

## 13. Tests

| Test | Proves |
|---|---|
| Round trip: import real `data/sources`, pull, compare parsed rows, order and counts | Nothing is lost. One commit reformats the snapshot to the pulled form, so later diffs are real changes |
| Store contract: the same suite on `FileStore`, and on `SupabaseStore` when `SUPABASE_TEST_URL` is set | The stores behave alike, including skipped, refused and replaced rows |
| `save_trip`: two saves at once, same content, next version | Versions stay 1, 2, 3 |
| Row level security: no key, publishable key signed out, a signed in non owner | None can read or write |
| Row writer: row to journey to row on every stored trip | Opening and saving makes no new version |
| Outbox: offline saves, reconnect, order | No save is lost |
| Build: `.work/data/web` against a build from the same data in git | The pipeline is unchanged |
| End to end: two windows, save in one | The other shows the trip within seconds |

## 14. Not in this spec

- Hosting the planner for the phone.
- Moving `pair_dates`, `inout` or other built files into tables.
- Rewriting the pipeline to read Postgres.
- More than one account.

## 15. Not verified

These came up while writing and could not be confirmed. Check each in phase 0 or 1.

- Whether PostgREST caps a page at 1000 rows on this plan. The paging rule in section 5 works either way.
- How Storage sets `cacheControl` and whether the CDN treats `?v=` as a new file.
- Egress on the free plan. The pricing page says 5 GB plus 5 GB cached, and the bandwidth docs say 10 GB in total.
- The exact rule for pausing. The FAQ of 27 Oct 2026 speaks of low activity.
- The rate limit on magic link emails from the built in mail service.
- The price of the Pro plan.

## 16. Sources

Read on 30 Oct 2026.

- https://supabase.com/pricing
- https://supabase.com/docs/guides/storage/serving/bandwidth
- https://supabase.com/docs/guides/storage/uploads/file-limits
- https://supabase.com/docs/guides/platform/compute-and-disk
- https://supabase.com/kb/faqs/platform/database-only-cost
- https://supabase.com/docs/guides/realtime/limits
- https://supabase.com/docs/guides/functions/pricing
- https://supabase.com/docs/guides/getting-started/api-keys
- https://supabase.com/docs/guides/getting-started/migrating-to-new-api-keys
- https://supabase.com/changelog/29260-upcoming-changes-to-supabase-api-keys
