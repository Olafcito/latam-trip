# Supabase Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task by task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move all latam-trip data into Supabase, so that a save anywhere shows everywhere within seconds and new prices reach the app in 1 to 3 minutes with nobody running a build.

**Architecture:** Postgres in one Supabase project holds every table and document. `tripdb` stays the only Python writer, with its file access behind a store layer that has a file and a REST implementation. One scheduled AWS Lambda pulls the tables to `/tmp`, runs the unchanged pipeline on them and uploads the built files to a public bucket, which the apps read through a browser cache.

**Tech Stack:** Python standard library under `python -I`, Postgres 17, PostgREST, Supabase Auth, Realtime and Storage, AWS Lambda and EventBridge Scheduler, S3, SSM, React 19, zustand, `@supabase/supabase-js`, vitest, Tampermonkey userscript.

**Spec:** [docs/superpowers/specs/2026-10-30-supabase-design.md](../specs/2026-10-30-supabase-design.md). The spec wins over this plan. Executors read both.

## Global Constraints

- Never print, commit or paste a key or the contents of `.env`.
- The repo is public. No AWS account id or profile name may go in it.
- Database access for migrations: pooler `aws-0-eu-west-1.pooler.supabase.com`, port 5432, user `postgres.<project ref>`, SSL. The direct host does not resolve from this PC.
- AWS: region `eu-west-1`, resources prefixed `latam-trip-`, tagged `project=latam-trip`. No public Function URL.
- `main` stays the truth until 9.3. Merge `main` into the branch at the start of each phase, taking either side of generated data as `CLAUDE.md` says.
- Do not run the cutover or merge to `main` without asking Simon.
- Phases 1 to 5 test only against the second project. The real project stays empty until cutover.
- `tripdb.py` and everything it imports use the standard library only and run under `python -I`, which leaves the script's folder off `sys.path`. Add the folder explicitly.
- `add_quotes` is never reachable with the publishable key.
- UI: never show a question mark and no prose recap lines. Build new UI from 21st components, not Claude Design's look.
- Docs and messages: plain sentences, no semicolons, no dashes as separators.
- Commit with `git -c user.name=Claude -c user.email=noreply@anthropic.com commit`. Never `git add -A`, as `.mcp.json` is untracked and is not ours.
- Fallback: if the round trip is not green by 8 Nov 2026, apply the fallback rule in 9.1 of the spec.
- Departure is 2 Dec 2026.

## Review Focus

1. A read that fails halfway. A dropped connection on page 3 of `pull` must fail the build, never publish a build from part of a table. Pinned in Task 7.
2. An empty or missing table at build time. Today an empty trips pull publishes 0 trips with no error, and only `bag_rules.json` is required. The worker must refuse a pull where `trips_latest` is empty or where a required table is empty. Pinned in Task 20.
3. A Lambda killed at its timeout while it holds the `build` lease. The next run must recover after the lease goes stale, and `derive_state` must not stay stuck with no `last_error`. Pinned in Task 19.
4. A save when the magic link session has expired, or after the trip was deleted in another window. The save goes to the outbox with a visible notice and is not lost, and a save of a deleted trip tells the user rather than bringing it back silently. Pinned in Task 16.
5. A scraped row holding `\u0000`, which `jsonb` refuses. One bad row in a crawl batch must be refused with its row number, and the good rows must still land, as the same rule holds on files today. Pinned in Task 11.

---

## File map

| Path | Job |
|---|---|
| `plugin/scripts/tripdb.py` | Commands. Calls a store, never the disk, after Task 10 |
| `plugin/scripts/tripdb_store.py` | `FileStore`, `SupabaseStore`, the REST client, `load_env` |
| `plugin/scripts/tripdb_cols.py` | Column maps, null rules, `to_row`, `from_row`, folding of repeats |
| `plugin/scripts/test_tripdb.py` | Existing suite, run on both stores through a fixture layer |
| `plugin/scripts/test_cols.py`, `test_store_contract.py`, `test_db_functions.py`, `test_roundtrip.py` | New suites. The last three skip unless `SUPABASE_TEST_URL` is set |
| `plugin/skills/flight-crawl-orchestrator/scripts/quote_rules.py` | `clean`, `normalise`, `pattern_of`, `via`, `build_qid`, `usable`, from `ingest.py`, no module state |
| `supabase/migrations/NNNN_*.sql` | Schema, functions, policies, triggers |
| `supabase/test_helpers.sql` | `test_reset()`. Applied to the second project only |
| `supabase/migrate.py` | Applies migrations through the pooler. Run with `uv run --no-project --with "psycopg[binary]"` |
| `infra/worker/handler.py` | Lambda entry, one `action` per schedule |
| `infra/worker/steps.py` | `should_build`, the build run, upload, backup. Testable without AWS |
| `infra/worker/test_steps.py` | Tests of `steps.py` |
| `infra/deploy.sh`, `infra/build_zip.py` | Packages and deploys, using `AWS_PROFILE` when set |
| `planner/src/lib/supabase.ts` | The one client, sign in, the feature flag |
| `planner/src/lib/tripRow.ts` | `journeyToRow`, `tripRowErrors` |
| `planner/src/lib/outbox.ts` | Offline saves |
| `planner/src/lib/remoteTrips.ts` | `loadTrips`, `saveTrip`, `deleteTrip`, the Realtime subscription |
| `planner/src/lib/remoteFiles.ts` | Built files through the Cache API |
| `planner/src/lib/importBrowser.ts` | The one off import in 9.2 |
| `web/src/data/remoteFiles.ts` | The same cache for the `web` app |

---

## Phase 0: Go or no go

### Task 1: Keys and reachability

**Files:**
- Modify: `.env` (not tracked)
- Modify: `docs/superpowers/specs/2026-10-30-supabase-design.md` section 15

**Interfaces:**
- Produces: `SUPABASE_URL` in `.env`.

- [ ] **Step 1: Append `SUPABASE_URL=https://nwwhaxodxkhvadnpkppt.supabase.co` to `.env`** without reading the file into output. Skip if the name is already present.

- [ ] **Step 2: List which names from section 10 are missing**

Run a script that prints only names and present or missing for `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `SUPABASE_TEST_URL`, `SUPABASE_TEST_SECRET_KEY`, `SUPABASE_TEST_PASSWORD`. It must never print a value.

- [ ] **Step 3: Record the reachability result of each environment in section 15 of the spec**

This PC is the REST and Storage check with curl. A cloud session is a routine with no keys in it, reading the log with `RemoteTrigger`. Claude desktop is the one line Simon runs:

```
python -c "import urllib.request as u,urllib.error as e;exec('try: print(u.urlopen(\'https://nwwhaxodxkhvadnpkppt.supabase.co/rest/v1/\',timeout=20).status)\nexcept e.HTTPError as x: print(x.code)')"
```

Any HTTP status is a pass. A timeout, a connection error or a 403 from a proxy is a failure, and work stops there.

- [ ] **Step 4: Once the keys are in, repeat the check with the secret key in each environment.** Expected: 200 on `/rest/v1/` in all three.

- [ ] **Step 5: Upload `gate.txt` to a bucket `gate` with the secret key, read it back, delete both.** This settles the Storage line of section 15.

- [ ] **Step 6: Commit the spec change**

### Task 2: Hello worker

**Files:**
- Create: `infra/worker/handler.py`, `infra/build_zip.py`, `infra/deploy.sh`
- Modify: section 15 of the spec

**Interfaces:**
- Produces: `handler(event, context) -> dict`, with `event["action"]`. `build_zip.py --out PATH [--with-data]` writes a zip with `plugin/scripts/tripdb*.py`, the pipeline scripts at the same relative paths, `infra/worker/*.py` and a `version.txt` with the git sha. `deploy.sh` is the only way to ship the worker.

- [ ] **Step 1: Write `build_zip.py`.** Paths in the zip keep their repo relative form, so `PIPELINE` in `tripdb.py` resolves. `--with-data` adds `data/sources`, used by the hello version only.

- [ ] **Step 2: Write `handler.py` with `action: hello`.** It copies the bundled `data/sources` to `/tmp/work`, runs `cmd_build(Paths("/tmp/work"), sync=False)` under a timer, and does an HTTPS request to `SUPABASE_URL/rest/v1/`. It returns seconds, `sys.executable`, the build size and the HTTP status.

- [ ] **Step 3: Write `deploy.sh`.** Same shape as `arte-suave-mcp/infra/deploy.sh`: `set -euo pipefail`, `winpath`, `AWS=(aws --region "$REGION")`, profile added only when `AWS_PROFILE` is set. Creates role `latam-trip-worker` with the basic execution policy if absent, then creates or updates function `latam-trip-worker` with the newest Python runtime in `eu-west-1`, 1024 MB, 300 s, tag `project=latam-trip`.

- [ ] **Step 4: Deploy and invoke**

Run: `AWS_PROFILE=<memory note profile> bash infra/deploy.sh --with-data`, then `aws lambda invoke` with `{"action":"hello"}`.
Expected: `FunctionError` absent, the built files present, an HTTP status from Supabase.

- [ ] **Step 5: Confirm EventBridge Scheduler is allowed** by creating a disabled schedule `latam-trip-gate` and deleting it.

- [ ] **Step 6: Record the worker time, memory used and region results in section 15, and commit**

```bash
git add infra/worker/handler.py infra/build_zip.py infra/deploy.sh docs/superpowers/specs/2026-10-30-supabase-design.md
```

**Gate:** Stop here until this PC, cloud sessions and Claude desktop reach Supabase with the secret key, the pipeline runs in the worker, and the upload works. Tell Simon before going further if any fails.

---

## Phase 1: Schema and import

### Task 3: Stable way ids and `way-map`

**Files:**
- Modify: `plugin/skills/flight-crawl-orchestrator/scripts/inout.py:172-176`
- Modify: `plugin/scripts/tripdb.py`
- Test: `plugin/scripts/test_tripdb.py`

**Interfaces:**
- Produces: `way_key(w) -> tuple` in `inout.py`. Way id format `I` or `H` plus the first 10 hex of the SHA1 of `json.dumps(key)`. `cmd_way_map(paths, old, new)`, which writes the document `way_id_map` as `{old_id: new_id}`.

- [ ] **Step 1: Write the failing tests** `test_way_ids_stable_across_builds` (two builds on the same root give equal id sets), `test_way_ids_stable_with_one_new_quote` (every old id is still there), and `test_way_map_matches_on_key` (fixture old and new `inout` files give the expected map, and a way with no match is absent).

- [ ] **Step 2: Run them.** Run: `python -I -X utf8 -m unittest discover -s plugin/scripts -p "test_*.py"`. Expected: FAIL.

- [ ] **Step 3: Change `add_way` to use the hash, and add `tripdb way-map --old OLD --new NEW`.** Keep the old counter `inout.json` from `git show main:data/web/inout.json` as the input for the real map.

- [ ] **Step 4: Run the tests.** Expected: PASS. The planner suite stays green too (`cd planner; npm test`), as no code parses ids.

- [ ] **Step 5: Commit.** The rebuilt data files stay out of this commit.

### Task 4: `quote_rules.py`

**Files:**
- Create: `plugin/skills/flight-crawl-orchestrator/scripts/quote_rules.py`
- Modify: `plugin/skills/flight-crawl-orchestrator/scripts/ingest.py`, `plugin/scripts/test_tripdb.py`

**Interfaces:**
- Produces: `clean(q)`, `normalise(q, cfg)`, `pattern_of(q, cfg)`, `via(leg)`, `build_qid(q, cfg) -> str`, `usable(q, cfg) -> int`, `leg_dates(q) -> (first_date, last_date)`, `quote_id(q) -> str`, a `Q2:` free SHA1 hex of `quote_key` plus the flight lists of every leg. `cfg` is the parsed `trip.json`.

- [ ] **Step 1: Write the failing test** `test_rules_match_ingest`: for every row of a real sample of 200 quotes, `build_qid` and `usable` equal the columns of a `trip.db` built by the current code.

- [ ] **Step 2: Run it.** Expected: FAIL with an import error.

- [ ] **Step 3: Move the rules.** `ingest.py` adds `sys.path.insert(0, HERE)` and calls `quote_rules`, keeping its CLI, its output and `obs_key` the same.

- [ ] **Step 4: Run the suite, then a full build on a scratch copy, and compare `data/web` with the same build before the change.** Expected: the files are identical apart from `generated_at`.

- [ ] **Step 5: Commit**

### Task 5: Migrations and runner

**Files:**
- Create: `supabase/migrate.py`, `supabase/test_helpers.sql`, `supabase/migrations/0001_schema.sql`, `0002_rls.sql`, `0003_add_quotes.sql`
- Test: `plugin/scripts/test_db_functions.py`

**Interfaces:**
- Produces: every table of 4.1 and 4.2 with the names shown there. `is_owner()`. `add_quotes(rows jsonb) returns jsonb` with `{"added": n, "seen_again": n}`. `test_reset()`. `migrate.py --target test|real [--helpers]`, where `real` needs a typed `--yes-real`, reads `SUPABASE_TEST_PASSWORD` or `SUPABASE_PASSWORD`, takes the project ref from the URL, records applied files in `public.schema_migrations`, and never prints the password.

- [ ] **Step 1: Write `0001_schema.sql` from 4.1 and 4.2.** `tasks` and `inbox_tokens` land here too, so the policy file covers all of them. `connections` uses `nulls not distinct`. `tasks.id` starts at 10000. `structure` has its check. Foreign keys and the indexes in 4.1 get created. `seen_count int not null default 1`.

- [ ] **Step 2: Write `0002_rls.sql`.** Row level security on every table including `schema_migrations`, with `(select is_owner())` policies except `inbox_tokens`. `is_owner` as in 8.1.

- [ ] **Step 3: Write `0003_add_quotes.sql`.** Group by `quote_id`, keep the first row with the newest `last_seen`, `seen_count` as the group size, insert stubs for the four airport columns with `on conflict do nothing`, insert with the `on conflict` in 4.2, return counts. Revoke execute from `public`, `anon`, `authenticated`.

- [ ] **Step 4: Write the failing tests in `test_db_functions.py`**

`test_same_batch_twice` (`seen_count` is 2, row count 1), `test_batch_repeats_a_quote` (`seen_count` is the group size), `test_new_airport_makes_a_stub`, `test_two_writers_at_once` (two threads, one row, right count), `test_publishable_key_cannot_call_add_quotes` (401 or 403, and needs `SUPABASE_TEST_PUBLISHABLE_KEY`, skipped until set), `test_no_key_reads_nothing`.

- [ ] **Step 5: Apply and run**

Run: `uv run --quiet --no-project --with "psycopg[binary]" python -X utf8 supabase/migrate.py --target test --helpers`, then `python -I -X utf8 -m unittest plugin/scripts/test_db_functions.py`.
Expected: PASS.

- [ ] **Step 6: Commit**

### Task 6: Column maps

**Files:**
- Create: `plugin/scripts/tripdb_cols.py`, `plugin/scripts/test_cols.py`

**Interfaces:**
- Produces: `COLS: dict[table, TableMap]`, each with `field_to_col`, `key`, `drop_nulls`. `to_row(table, rec) -> dict`, unmapped fields go to `extra`. `from_row(table, row) -> dict`. `fold_places(rows)`, `fold_profiles(rows)`, `fold_quotes(rows, cfg)`.

- [ ] **Step 1: Write the failing tests.** `test_round_trip_each_table` (a real sample row of each table survives `to_row` then `from_row`, by parsed value), `test_unknown_field_goes_to_extra`, `test_quote_null_mid_dropped`, `test_experience_nulls_kept` (none of the 2,775 fields go), `test_profile_hostels_absent_fields_dropped`, `test_observed_at_reads_back_as_last_seen_in_z`, `test_fold_places_98_to_88`, `test_fold_profiles_123_to_118`, `test_later_null_image_keeps_image`, `test_fold_quotes_stops_on_two_qids` with the `float(price_dkk)` compare.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.** Name mapping from 4.1: `from` to `from_id`, `to` to `to_id`, `both` to `both_ways`, `by` to `saved_by`, `out` to `out_leg`, `mid` to `mid_legs`, `home` to `home_leg`, `iata` to `airport_code`, `id` to `place_id` on profiles and images.

- [ ] **Step 4: Run.** Expected: PASS.

- [ ] **Step 5: Commit**

### Task 7: `import` and `pull`

**Files:**
- Create: `plugin/scripts/tripdb_store.py` (REST client part), `plugin/scripts/test_roundtrip.py`
- Modify: `plugin/scripts/tripdb.py`

**Interfaces:**
- Consumes: `tripdb_cols`, `quote_rules`.
- Produces: `load_env(root) -> dict`. `Rest(url, key)` with `get_all(table, params) -> list`, `insert(table, rows, on_conflict=None, returning=None)`, `patch`, `rpc(name, body)`, `storage_put`, `storage_get`. `cmd_import(paths_or_dir, wipe=False)`, `cmd_pull(to_dir)`.

- [ ] **Step 1: Write the failing tests.** `test_get_all_pages_to_content_range`, with a fake server that caps pages under the size asked for. `test_get_all_raises_when_a_page_fails` and `test_get_all_raises_on_short_total`, so a read that fails halfway never returns part of a table. `test_import_refuses_when_rows_exist`. `test_round_trip_real_data`, which imports `data/sources`, pulls, and compares parsed rows and order per table, recording the counts. `test_foreign_keys_hold_on_real_data`.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement `Rest` with `urllib`**, the secret key on `apikey`, retry once on a connection error on reads, and `Prefer: count=exact`. A read ends only when `Content-Range` reaches the total.

- [ ] **Step 4: Implement `import` and `pull`.** Import fills `airports` first, with the 14 stubs, then the tables in foreign key order, then documents. Pull sorts by `seq`, writes `quotes/all.jsonl`, and folds nothing.

- [ ] **Step 5: Run.** Expected: PASS, and the counts go in section 13 of the spec as the import test's record.

- [ ] **Step 6: Commit**

### Task 8: Golden compare

**Files:**
- Modify: `plugin/scripts/test_roundtrip.py`

- [ ] **Step 1: Write `test_golden_compare`.** Build from `pull`, build from the same data in git, and diff `data/web` by parsed value. The test holds the expected differences of section 13: 19 in connections, 57 in `inout.json`, 3 in `pair_dates`, plus stamps. Any other difference fails with the paths.

- [ ] **Step 2: Run.** Expected: PASS. If a difference has no explanation, stop and find it.

- [ ] **Step 3: Commit, and note the date. This is the 8 Nov fallback line.**

### Task 9: `dump` and `restore`

**Files:**
- Modify: `plugin/scripts/tripdb.py`, `plugin/scripts/test_roundtrip.py`

**Interfaces:**
- Produces: `cmd_dump(to_dir)`, `cmd_restore(from_dir, wipe=False)`.

- [ ] **Step 1: Write the failing test** `test_dump_restore_dump`: dump, `test_reset`, restore, dump, the two dumps are equal including soft deletes and `seen_count`, then a new row gets a fresh identity. `test_restore_refuses_when_rows_exist`.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.** One JSON lines file per table with all columns. A `reset_identity(table text, col text)` function in `0004_restore.sql`, secret key only, moves each sequence past the highest value.

- [ ] **Step 4: Run, then commit**

---

## Phase 2: Store layer

### Task 10: `FileStore` seam

**Files:**
- Create: `FileStore` in `plugin/scripts/tripdb_store.py`
- Modify: `plugin/scripts/tripdb.py`, `plugin/scripts/test_tripdb.py`

**Interfaces:**
- Produces: `class Store` with `rows(table) -> list[dict]`, `add(table, rows, keys, replace=False) -> AddResult`, `add_quotes(rows, name) -> AddResult`, `update(table, key, patch)`, `doc(name) -> (data, version)`, `put_doc(name, data, version) -> bool`, `trips() -> list`, `save_trip(trip) -> dict`, `delete_trip(id)`, `lock()`. `AddResult` holds `added`, `skipped`, `replaced`, and `differs`. `get_store(paths) -> Store`, reading `TRIPDB_STORE`.

- [ ] **Step 1: Move the disk calls of `rows_of`, `append_rows`, `write_atomic`, `load_doc`, `known_quotes` and `Lock` behind `FileStore`.** No behaviour changes. Commands take the store from `get_store`.

- [ ] **Step 2: Add the fixture layer.** `Base.write` writes through the active store, so one suite can run on both.

- [ ] **Step 3: Run.** Run the unittest line from Task 3. Expected: every old test passes with no assertion changed.

- [ ] **Step 4: Commit**

### Task 11: `SupabaseStore` writes

**Files:**
- Modify: `plugin/scripts/tripdb_store.py`, `plugin/scripts/tripdb.py`
- Create: `plugin/scripts/test_store_contract.py`

**Interfaces:**
- Produces: `SupabaseStore(Store)`, same methods. Without `SUPABASE_URL` and `SUPABASE_SECRET_KEY` it stops with a clear message and writes nothing.

- [ ] **Step 1: Write the failing contract tests**, run on both stores: `test_add_skips_identical`, `test_add_reports_differs`, `test_add_replace_merges`, `test_add_quotes_counts_match_todays_print`, `test_refused_row_changes_nothing`, `test_nul_row_refused_with_row_number_and_rest_land`, `test_batches_stop_with_row_range`.

- [ ] **Step 2: Run.** Expected: `SupabaseStore` cases FAIL.

- [ ] **Step 3: Implement.** `add` reads the batch's keys with `in` in one call, and then upserts with `on_conflict`, asking for key columns only. `add_quotes` reads `trip.json`, computes the fields with `quote_rules`, and calls the function. Refuse `\u0000` in the shared row checks, so both stores behave alike.

- [ ] **Step 4: Run all of `test_tripdb.py` with `TRIPDB_STORE=supabase` against the second project.** Expected: PASS.

- [ ] **Step 5: Commit**

### Task 12: Trips and documents

**Files:**
- Create: `supabase/migrations/0005_trips.sql`
- Modify: `plugin/scripts/tripdb.py`, `plugin/scripts/tripdb_store.py`, `plugin/scripts/test_db_functions.py`

**Interfaces:**
- Produces: `save_trip(trip jsonb) returns jsonb`, with `id`, `version`, `skipped`, `security invoker`, execute revoked from `public` and `anon`. View `trips_latest`. `cmd_doc_get(name, file)`, `cmd_doc_put(name, file)`.

- [ ] **Step 1: Write the failing tests.** `test_save_trip_two_at_once` (versions 1, 2), `test_same_content_skipped` (ignoring `version`, `saved_at`, `by`), `test_soft_delete_hides_every_version`, `test_list_add_two_writers_lose_nothing`, `test_doc_put_stale_version_retries`, `test_doc_put_rejects_bad_json`, `test_doc_put_trip_json_recomputes_qid_and_usable`.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.** The content compare strips the three `TRIP_META` keys in SQL. `cmd_save_trip`, `cmd_delete_trip`, `cmd_list_add` and `cmd_list_remove` go through the store. `doc-put trip.json` patches `build_qid` and `usable` on every quote that changed.

- [ ] **Step 4: Run, then commit**

### Task 13: `query`, inbox, check and logs

**Files:**
- Modify: `plugin/scripts/tripdb.py`, `plugin/scripts/tripdb_store.py`, `plugin/scripts/test_store_contract.py`

**Interfaces:**
- Produces: `cmd_query(table, eq, in_, gte, select, limit)`. `Store.inbox_new() -> list`, `Store.inbox_mark(id, status, reason, rejected)`.

- [ ] **Step 1: Write the failing tests.** `test_query_eq_in_gte_select_limit`, `test_query_prints_json_lines`, `test_query_rejects_an_unknown_table`, `test_ingest_inbox_marks_added_and_rejected` with `rejected` in the shape of today's files, `test_check_reports_table_key`, `test_log_task`, `test_log_usage`, `test_update_experience`.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.** Accepted names in `query` are the tables of 4.1, `trips_latest` and `derived_options`.

- [ ] **Step 4: Run both stores, then commit**

---

## Phase 3: Planner

Every planner task runs `cd planner; npm test; npx tsc --noEmit`. New behaviour sits behind `VITE_SUPABASE_URL`. Without it the planner behaves as today.

### Task 14: Client and sign in

**Files:**
- Create: `planner/src/lib/supabase.ts`, a sign in screen in `planner/src/components/`
- Modify: `planner/package.json`, `planner/src/App.tsx`

**Interfaces:**
- Produces: `supabase` client or `null`, `remoteEnabled(): boolean`, `useSession()`.

- [ ] **Step 1: Add `@supabase/supabase-js`, pinned, and write `planner/src/lib/supabase.test.ts`** for `remoteEnabled` with and without the env value.

- [ ] **Step 2: Implement magic link sign in** with the redirect to `http://localhost:5198`.

- [ ] **Step 3: Run the suite and commit**

### Task 15: Row writer

**Files:**
- Create: `planner/src/lib/tripRow.ts`, `planner/src/lib/tripRow.test.ts`

**Interfaces:**
- Consumes: `TripRow`, `rowToJourney` from `repoTrips.ts`.
- Produces: `journeyToRow(j: Journey, last: TripRow | null, inout: InOut, totals: Totals): TripRow`, `tripRowErrors(r: TripRow): string[]`, mirroring `TRIP`, `TRIP_WAY`, `TRIP_TICKET`, `TRIP_PLACE`, `TRIP_HOP`, `TRIP_FLIGHT` in `tripdb.py:157-172`.

- [ ] **Step 1: Write the failing tests.** `opening and saving every stored trip makes the same content`, over all of `data/web/trips.json`. `keeps rank, why, option_id from the last row`. `inlines way_in, way_home and tickets`. `keeps parked and the day of each hop`. `keeps lastNights`. `sets by to planner`. `refuses what tripdb check refuses`.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.** `totals` come from the same function the screen shows.

- [ ] **Step 4: Run, then commit**

### Task 16: Trips through Supabase

**Files:**
- Create: `planner/src/lib/remoteTrips.ts`, `planner/src/lib/outbox.ts` and their tests
- Modify: `planner/src/store.ts`, `planner/src/lib/repoTrips.ts`, `planner/src/App.tsx`

**Interfaces:**
- Produces: `loadTrips(): Promise<TripRow[]>`, `loadVersions(id)`, `saveTrip(row): Promise<SaveResult>`, `deleteTrip(id)`, `subscribeTrips(cb): () => void`. `outbox.enqueue(row)`, `outbox.flush(send)`, `outbox.size()`.

- [ ] **Step 1: Write the failing tests.** `outbox keeps order and removes only after a send`, `a save offline goes to the outbox and shows a notice`, `an expired session goes to the outbox rather than losing the save`, `a save of a trip deleted elsewhere tells the user`, `a change to the open trip with unsaved edits shows a notice and leaves the edits`, `two saves make two versions`, `deep link opens any stored trip`.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.** `saveJourney` calls `saveTrip` when `remoteEnabled()`. Realtime on `trips` reloads `trips_latest`. `followTab` and the `storage` listener go for trips. `hidden` stops being written. `.current` stays.

- [ ] **Step 4: Run, then try two windows on the second project with `playwright`.** Expected: a save in one shows in the other within seconds.

- [ ] **Step 5: Commit**

### Task 17: Browser import, ready for later

**Files:**
- Create: `planner/src/lib/importBrowser.ts`, `planner/src/lib/importBrowser.test.ts`
- Modify: `web/src` trips storage

**Interfaces:**
- Produces: `importBrowser(deps): Promise<ImportReport>`.

- [ ] **Step 1: Write the failing tests** for each line of 9.2: `translates way ids with the map`, `a wrong first or last node goes to unresolved_journeys`, `a local edit of an old version imports as a new id`, `hidden soft deletes only with no newer version`, `the marker holds the project ref`, `a second run does nothing`, `a test import does not block the real one`, `web trips import once into web_trips`.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement, and list `unresolved_journeys` in the planner.**

- [ ] **Step 4: Run, then commit.** It runs for real only after cutover.

---

## Phase 4: Worker and cache

### Task 18: Triggers

**Files:**
- Create: `supabase/migrations/0006_derive.sql`
- Modify: `plugin/scripts/test_db_functions.py`

**Interfaces:**
- Produces: triggers of 7.2 step 1. `derive_state` with one row. `leases` with one row `build`. Publication of `trips`, `tasks` and `derive_state` to `supabase_realtime`.

- [ ] **Step 1: Write the failing tests.** `test_each_table_sets_dirty`, `test_dirty_since_set_only_when_empty`, `test_web_trips_doc_is_ignored`, also for `way_id_map` and `unresolved_journeys`, `test_trips_and_tasks_do_not_set_dirty`.

- [ ] **Step 2: Apply, run, commit**

### Task 19: Worker decision and run

**Files:**
- Create: `infra/worker/steps.py`, `infra/worker/test_steps.py`
- Modify: `infra/worker/handler.py`, `plugin/scripts/tripdb.py`

**Interfaces:**
- Consumes: `cmd_pull`, `cmd_build`, `cmd_ingest_inbox`, `get_store`.
- Produces: `should_build(state: dict, now: datetime) -> bool`, `take_lease(rest, holder, now) -> bool`, `run_build(rest, work_dir) -> dict`, `drop_bad_trips(errors, root) -> list[str]`.

- [ ] **Step 1: Write the failing tests.** `test_stops_when_clean`, `test_stops_on_failed_dirty_at`, `test_waits_for_a_quiet_minute`, `test_builds_after_five_minutes_of_burst`, `test_five_minute_gap`, `test_stale_lease_is_taken_after_600s`, `test_lease_held_stops_the_run`, `test_timed_out_run_recovers` (a held stale lease and a `last_started` with no `last_finished` lead to a new run), `test_bad_trip_writes_last_warning_and_carries_on`, `test_other_refusal_fails_and_sets_failed_dirty_at`, `test_failure_before_pull_uses_the_first_dirty_at`, `test_moved_dirty_at_sets_dirty_since`, `test_work_dir_wiped_each_run`.

- [ ] **Step 2: Run.** Run: `python -I -X utf8 -m unittest infra/worker/test_steps.py`. Expected: FAIL.

- [ ] **Step 3: Implement steps 3 to 6 of 7.2, in that order.** `cmd_build` runs with `FileStore`, `--root /tmp/work` and `sync=False`.

- [ ] **Step 4: Run, then commit**

### Task 20: Upload and `derived_options`

**Files:**
- Modify: `infra/worker/steps.py`, `infra/worker/test_steps.py`
- Create: `supabase/migrations/0007_bucket.sql`

**Interfaces:**
- Produces: `file_hash(path) -> str`, ignoring `generated_at`. `changed_files(old_meta, files) -> list`. `upload(rest, work_dir, meta) -> dict`. `replace_derived(rest, inout) -> int`. `refuse_empty_pull(root)`.

- [ ] **Step 1: Write the failing tests.** `test_hash_ignores_generated_at`, `test_only_changed_files_upload`, `test_meta_json_uploads_last`, `test_hash_copies_older_than_an_hour_go`, `test_copies_in_the_map_stay`, `test_empty_trips_pull_is_refused`, `test_empty_required_table_is_refused`, `test_derived_options_keep_rank`.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement steps 7 and 8 of 7.2.** Public bucket `web`, 50 MB limit, created in the migration.

- [ ] **Step 4: Run, then commit**

### Task 21: Schedule, secret, backup

**Files:**
- Modify: `infra/deploy.sh`, `infra/worker/handler.py`, `infra/worker/steps.py`, `CLAUDE.md`

**Interfaces:**
- Produces: `action: build`, `action: backup`. SSM parameter `/latam-trip/supabase-secret-key`. Bucket `latam-trip-backups`, private with a 90 day expiry. `tripdb status` shows `worker_version`.

- [ ] **Step 1: Extend `deploy.sh`.** Create the bucket with a suffix if the name is taken, public access blocked. The SSM parameter comes from `.env` for the target named on the command line. The role gets SSM read on that path, and S3 write on that bucket. Add both schedules, disabled unless `--enable-schedules` is given. They run as role `latam-trip-scheduler`, which trusts `scheduler.amazonaws.com` and may only invoke the worker. Phase 0 created that role by hand, so `deploy.sh` must keep it and retry for a few seconds when it is new. `version.txt` becomes `worker_version`.

- [ ] **Step 2: Add the `CLAUDE.md` note** that a change to `tripdb.py` or the pipeline reaches the worker only through `deploy.sh`.

- [ ] **Step 3: Deploy against the second project, enable, and write a row.** Expected: the file in the bucket changes with nobody running anything. Time it and put the delay in section 15.

- [ ] **Step 4: Run the worker row of section 13.** Row the check refuses. Trip the check refuses. A burst with no quiet minute. Run the backup and restore it into an empty test state.

- [ ] **Step 5: Commit**

### Task 22: `file`, `run`, `status`

**Files:**
- Modify: `plugin/scripts/tripdb.py`, `plugin/scripts/test_store_contract.py`

**Interfaces:**
- Produces: `cmd_file(name)`, `cmd_run(script, args)`, `cmd_status()`.

- [ ] **Step 1: Write the failing tests.** `test_file_prints_places`, `test_file_built_prefix`, `test_file_unknown_name_says_so`, `test_run_evaluate_on_temp_root` and the same for each script in section 5, `test_run_rejects_an_unknown_script`, `test_status_prints_worker_version_and_local_sha`.

- [ ] **Step 2: Run, implement, run, commit**

### Task 23: Readers and cache

**Files:**
- Create: `planner/src/lib/remoteFiles.ts`, `planner/src/lib/remoteFiles.test.ts`, `web/src/data/remoteFiles.ts`
- Modify: `planner/src/data/load.ts`, `pairDates.ts`, `routeMap.ts`, `planner/src/App.tsx:182`, `planner/vite.config.ts`, `web/vite.config.ts`, `web/src/data/load.ts`
- Create: a sheet for `quoteLink`, and the strip in `planner/src/components/`

**Interfaces:**
- Produces: `getFile(name): Promise<T>`, `refresh(): Promise<string[]>`, `subscribeBuilds(cb)`. `DataStrip` shows `last_error` and `last_warning`.

- [ ] **Step 1: Write the failing tests.** `opens from cache with no network`, `an empty cache downloads and fills`, `only a changed hash downloads`, `meta.json is fetched uncached`, `a failed refresh keeps the old file`, `the strip shows when last_error is set`, `routeMap reads trips_latest`, `the fact line takes its time from meta.json`.

- [ ] **Step 2: Run.** Expected: FAIL.

- [ ] **Step 3: Implement.** `/data` middleware and the `DEV` branches go when the flag is on. `sync-data.mjs` and `planner/public/data` stay until cutover.

- [ ] **Step 4: Run both apps.** Expected: a row in the second project reaches an open planner with nobody running anything, the planner opens with the network off, and a failed build shows the strip.

- [ ] **Step 5: Commit**

---

## Phase 5: Tasks and userscript

### Task 24: Tasks

**Files:**
- Modify: `plugin/skills/trip-checklist/scripts/tasks.py`, `planner/src/lib/tasks.ts`, `planner/src/components/story/FlightSheet.tsx:292`
- Create: a tasks strip in `planner/src/components/`, `plugin/skills/trip-checklist/scripts/test_tasks.py`

**Interfaces:**
- Produces: `tasks.py list`, `show N`, `start N`, `done N SUMMARY_FILE [--outputs a,b] [--root DIR]`, all on `tasks`, with `gh` gone. `insertTask(task, tripId, version)`, `subscribeTasks(cb)`.

- [ ] **Step 1: Write the failing tests.** `test_list_shows_open_and_working`, `test_show_prints_task_json`, `test_start_sets_working`, `test_done_writes_result_and_logs`, and in the planner, `one press inserts one row and the button says sent`, `a result shows in place`, `the row carries trip_id and trip_version`.

- [ ] **Step 2: Run, implement, run, commit**

### Task 25: Userscript and functions

**Files:**
- Create: `supabase/migrations/0008_userscript.sql`
- Modify: `plugin/userscripts/build.js`, `momondo-save.core.js`, `test/inbox.test.js`, `docs/momondo-save.md`, `plugin/scripts/test_db_functions.py`

**Interfaces:**
- Produces: `submit_inbox(token text, file text, rows jsonb) returns int`, `submit_task(token text, task jsonb) returns bigint`, both `security definer` with `search_path = ''`. `tripdb inbox-token --name NAME`, which prints the token once and stores only its hash.

- [ ] **Step 1: Write the failing tests.** `test_wrong_token_writes_nothing`, `test_right_token_inserts_new`, `test_publishable_key_signed_out_reaches_no_table`, `test_inbox_tokens_is_unreadable`, and the same pair in `test/inbox.test.js` for the new request shape.

- [ ] **Step 2: Run, implement, run.** `@connect` becomes the Supabase host. The GitHub token and the issue calls leave the script.

- [ ] **Step 3: Check a save end to end on the second project.** It lands in `inbox` and reaches the app by itself.

- [ ] **Step 4: Commit**

---

## Phase 6: Cutover

### Task 26: Prepare

**Files:**
- Modify: the docs listed in 9.3 step 9, and every skill and agent named in 7.5

- [ ] **Step 1: Change skills and agents to `tripdb query` and `tripdb file`, and drop every "run `tripdb build`" step.** Edit in `plugin/`, then run `python -I plugin/scripts/sync_claude_dir.py --root .`.

- [ ] **Step 2: Run every suite on the branch and report the result to Simon.**

- [ ] **Step 3: Commit**

### Task 27: Cutover

- [ ] **Step 1: Ask Simon.** Nothing below runs without a yes in chat.

- [ ] **Step 2: Follow 9.3 steps 1 to 10 in order, reporting after each.**

- [ ] **Step 3: Run the browser import on port 5198 and report the import result.**

- [ ] **Step 4: After a quiet week, confirm the project did not pause, and check egress on the Usage page.**
