# FEAT-006 Many users Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Other travellers use latam-trip through their own Claude, each seeing and changing only their own private data on one shared catalogue, and every push to `main` tests, migrates and deploys by itself.

**Architecture:** The database enforces ownership: every private row carries `owner_id`, every policy checks `auth.uid()`, child tables use composite keys, and catalogue writes need `is_admin()`. The connector stops holding the secret key and acts as the signed in person, by the way the OAuth spike picks. A GitHub Actions release runs the tests against a local Supabase stack, applies migrations and updates the connector's code through an OIDC role that can do nothing else.

**Tech Stack:** Postgres and Supabase (Auth, PostgREST, Storage, edge functions in Deno), Python 3.12 (FastMCP connector on Lambda, tripdb, worker), React and Vite (planner, web), GitHub Actions, AWS (Lambda, S3, IAM OIDC, CloudFormation), the Supabase CLI for the local stack.

**Spec:** `docs/product/features/FEAT-006-many-users.md`, with PROD-007, PROD-008, TECH-005 and TECH-006. Where the code and the spec disagree, the spec wins and the disagreement is listed below.

## Global Constraints

- No em or en dashes and no semicolons in any prose, doc, commit message or UI text. SQL and code keep their syntax.
- No secret, email, user id, AWS account id or profile name in any file, fixture, log or commit. Fixtures use `TEST01`. Simon's user id comes from the `admins` table at run time, never from a file.
- Commit with `git -c user.name=Claude -c user.email=noreply@anthropic.com`, explicit paths only.
- Every phase runs in its own worktree from `origin/main`, merges alone, rebased on the latest `origin/main` with typecheck and tests passing.
- Sonnet implements and records. Opus implements the security sensitive batches: the release pipeline, owner columns and RLS, the OAuth spike and connector auth, `delete_account`.
- One code review per batch, commit by commit, with `/code-review` or `feature-dev:code-reviewer`, before merge. Fixes touching owner only data, the bucket or built files get a second look.
- Docs the phase touches are updated in the same commit. Meaningful failures go to `docs/harness-log.md`.
- Python runs with `-I -X utf8`. `tripdb` tests: `python -I -X utf8 -m unittest discover -s plugin/scripts -p "test_*.py"`. App checks: `npm run typecheck && npm test` in `web` and `planner`.
- Open questions are asked one at a time, before the phase that needs them: browser tasks for other users and user research into the catalogue before phase 4, the morning rates run before task 2.5, sign up and the passphrase fallback before phase 6. Legal is Simon's and blocks nothing.

## Review Focus

1. **Simon's writers between phases.** After `owner_id` is `not null`, the worker, `tripdb` on the PC and the connector still write with the secret key, where `auth.uid()` is null. Expected: their rows land on Simon as before, never fail. Test in task 2.2 (`test_service_insert_lands_on_admin`).
2. **Realtime under the new policies.** The planner listens to trips, lodgings, tasks and bookings. Expected: Simon still gets his changes live, and user B never gets one of A's. Test in task 2.1 (`test_realtime_is_owner_scoped`, a subscription per user on the local stack).
3. **A new trip version after the key change.** The trips key becomes `(owner_id, id, version)` and the planner saves versions with an upsert. Expected: saving a version works and two people may share a trip name. Test in task 2.3 (`remoteTrips.test.ts`, conflict columns).
4. **A task closed by the data while the PC still works it.** Expected: the later `tasks.py done` neither fails nor reopens it, and the data's result stays. Test in task 1.1 (`test_done_after_trigger_keeps_done`) and `test_tasks.py`.
5. **Delete half way.** The Storage API fails after some files are gone. Expected: the auth user and the rows stay, the call says what failed, a second call finishes. Test in task 6.3 (`test_delete_retries_after_storage_failure`).

## Disagreements and findings

Found while reading the code against the spec. Each is decided here unless it says ask.

1. **No local Supabase stack exists.** `test_db_functions.py` runs only against a throwaway project that no longer exists, so every database test skips today. Phase 1 tests its migration inside a transaction that is rolled back, against the project. Phase 2 (task 2.0) builds the local stack and the same tests then run there in CI.
2. **Two migrations share the prefix `0024`.** `migrate.py` keys on the full name, so it works. The Supabase CLI keys on the number and would refuse, so the local stack runs from its own workdir with no migrations, and `migrate.py` applies ours.
3. **Service role writers and `owner_id default auth.uid()`.** The spec's default fails every secret key insert. The default becomes `coalesce(auth.uid(), public.admin_id())`, where `admin_id()` returns the one admin and raises when there is not exactly one. Phase 3 takes the secret key out of the connector, so after it only the worker and Simon's PC rely on the fallback, and both are his.
4. **Edge function deploys are not in the release.** The spec's release covers migrations and the connector. `stay-rates` and `read-booking` change in phase 2 and keep deploying from the PC with `npx supabase functions deploy`, because a Supabase access token in CI can change every project setting. Simon decides later whether they join.
5. **The deploy role cannot use CloudFormation.** `cloudformation deploy` with `CAPABILITY_NAMED_IAM` can create roles. The release updates the Lambda code only (`lambda update-function-code`). A template change stays a deploy Simon runs from the PC, which also brings the stack's `CodeS3Key` parameter back in line.
6. **The `.github/` ruleset cannot tell Simon from Claude.** Every push from the PC uses Simon's own GitHub credential, which is an admin and can bypass any ruleset. A branch ruleset can only require a pull request for every path, not for `.github/` alone. A push ruleset can restrict `.github/**`, but admins bypass it. The guard only holds if Claude pushes as a non admin identity, such as a fine grained token with Contents write and no Workflows permission set as the repo's credential, while Simon changes `.github/` by a pull request he approves. Decided in task 1b.4 without Simon, by his wish not to be asked: GitHub refuses push rules on a public repo, so `main` gets a ruleset against force pushes and deletion now, and the `.github/` review waits for a second GitHub account as Claude's push identity. TECH-008 holds the ruleset to make then.
7. **A pull request from a fork needs a second GitHub account.** GitHub does not let an account fork its own repo. Criterion 9's fork run waits for a second account, ideally the live run's.
8. **`stay_details` tasks carry no dates.** 10039 to 10041 have none. By `docs/claude-tasks.md`, the dates are then those of the lodging's latest price, and 0025 used the same rule. Live, it kept 10040 and 10041 open: a newer price for 3 to 8 December sat on some rooms while every room had one for 3 to 6. Migration 0026 judges a task without dates by the dates priced on every room, so the later migrations moved up by one.
9. **Lodging ids derive from names.** Adding the owner to `stable_id` changes the id Simon's next add of an existing hostel derives. `add_lodging` must find the stored place by place and name among the caller's lodgings before it trusts the id. Checked in task 2.3.
10. **The profile sheet.** The review suggests cutting it, but the spec's UX section keeps it. The spec wins, so it is task 5.3 with its roast.
11. **The `read-booking` cap has no number.** Proposed: 30 reads per owner per calendar month, in a function secret `READ_BOOKING_MONTHLY_CAP`, so Simon can change it without a deploy of code.
12. **Per owner caps, settled here as the spec asks.** Proposed: 2000 rows per owner in each private table, 100 tasks per owner per day, 200 MB per owner folder in the `bookings` bucket, 60 connector writes per user per minute. One table `owner_limits` holds them so they change without a migration.

---

## Phase 0: Records

### Task 0.1: Accept PROD-007 and PROD-008, commit this plan

**Files:**
- Modify: `docs/product/product-decisions.md` (PROD-007, PROD-008)
- Modify: `docs/product/features/FEAT-006-many-users.md` (status words of PROD-007 and PROD-008, open questions 6)
- Create: `docs/superpowers/plans/2026-11-06-feat-006-many-users.md`

- [ ] **Step 1:** Set both to Accepted. In PROD-007 the catalogue reads "places and connections", with a line that PROD-008 moved quotes to private. In the spec, "(PROD-007, proposed)" and "(PROD-008, proposed)" read accepted, and open question 6 reads settled by Simon on 2026-11-06.
- [ ] **Step 2: Commit and push** `docs: FEAT-006 plan, PROD-007 and PROD-008 accepted`.

---

## Phase 1: Tasks close themselves (its own small change, shipped first)

Worktree `task-close`. Sonnet, one batch. The migration goes live from the PC with `migrate.py`, since the release does not exist yet.

### Task 1.1: A stay_details task closes when its lodging is complete

**Files:**
- Create: `supabase/migrations/0025_task_close_by_data.sql`
- Create: `supabase/test_task_close.py`
- Modify: `supabase/migrate.py` (export `connect`, add `apply_file(cur, path)`)
- Modify: `docs/claude-tasks.md` (the `stay_details` row and "When a task is done"), `data/README.md` (tasks), `docs/technical/technical-decisions.md` (TECH-007), `plugin/skills/add-lodging/SKILL.md` (step 6 and the PC row: the task may already be done)
- Test: `supabase/test_task_close.py`, `plugin/skills/trip-checklist/scripts/test_tasks.py`

**Interfaces:**
- Produces: `public.stay_details_complete(p_lodging text, p_check_in date, p_check_out date) returns boolean`, `public.close_stay_details(p_lodging text) returns integer` (null closes every complete one, returns how many closed), trigger function `public.stay_details_follow_data()`. Phase 4 copies the pattern for `stay_prices`.

**The rule.** Complete means: `jsonb_array_length(photos) > 0`, at least one room, and every room has a `lodging_prices` row with exactly the dates. The dates are the task's `check_in` and `check_out`, else those of the lodging's latest price by `observed_at`. No price at all means not complete. Only `open` or `working` tasks close. The task gets `status = 'done'`, `done_at = now()` and the result `Closed by the data: N photos, M rooms, each priced for YYYY-MM-DD to YYYY-MM-DD.` The result holds no price.

**Triggers.** After insert or update of `photos` on `lodgings`, after insert, update or delete on `lodging_rooms` (a deleted unpriced room can complete a place), after insert or update on `lodging_prices`. Each calls `close_stay_details` for the one lodging. Security definer with `set search_path = public`, execute revoked from public, anon and authenticated, as in 0022.

**Backfill.** The migration ends with `select public.close_stay_details(null)`, which closes 10039 to 10041 by the same check.

- [ ] **Step 1: Write the failing tests.** `test_task_close.py` connects with `migrate.connect(env)`, opens one transaction, applies `0025_task_close_by_data.sql` in it when `schema_migrations` lacks it, runs each case on rows named `TEST01 ...` and always rolls back. Gate `TRIPDB_DB_TESTS=1`. Cases:
  - `test_complete_lodging_closes_open_task`: insert a lodging with a booking link (0024 queues the task), one room, no price, so status is `open`. Add a price for 2026-12-03 to 2026-12-06 and photos, so status is `done`, `done_at` is set and the result starts `Closed by the data: 1 photos, 1 rooms`.
  - `test_no_photos_stays_open`, `test_one_room_unpriced_stays_open` (two rooms, one price).
  - `test_task_dates_must_match`: task data with `check_in` 2026-12-10 and `check_out` 2026-12-12, price for 03 to 06, so `open`.
  - `test_latest_price_dates_when_task_has_none`: an older price for 01 to 02 on room 1 only and a newer one for 03 to 06 on both rooms, so `done`.
  - `test_working_closes_failed_untouched`: a `working` task closes, a `failed` one keeps its status and result.
  - `test_room_delete_completes`: deleting the only unpriced room closes the task.
  - `test_backfill_closes_complete`: `select close_stay_details(null)` returns the count and leaves no complete lodging with an open task.
  - `test_done_after_trigger_keeps_done`: after the trigger closed it, the patch `tasks.py done` sends leaves `status = 'done'`.
- [ ] **Step 2: Run** `TRIPDB_DB_TESTS=1 uv run --quiet --no-project --with "psycopg[binary]" python -I -X utf8 -m unittest supabase.test_task_close -v`. Expected: FAIL, the migration file does not exist.
- [ ] **Step 3: Write `0025_task_close_by_data.sql`** with the functions, the triggers and the backfill above, and a header comment in the style of 0022.
- [ ] **Step 4: Run the tests again.** Expected: PASS, and a count of rows after the rollback equals the count before.
- [ ] **Step 5: In `tasks.py`, `cmd_done` on a task that is already `done`** prints `already done by the data` and leaves the row and its result alone, and still logs to `task_log`. Test `test_done_on_done_task_keeps_result` in `test_tasks.py`. Run the tripdb and tasks tests.
- [ ] **Step 6: Docs and TECH-007** "Task status follows the data", Proposed. Commit `Tasks close themselves: a stay_details task is done once its lodging has photos and a price for its dates on every room`.
- [ ] **Step 7: Review, merge, apply.** Code review of the commit. Merge by the rule. Then `uv run --quiet --no-project --with "psycopg[binary]" python -X utf8 supabase/migrate.py` from the main checkout. Expected output `applied 0025_task_close_by_data.sql`.
- [ ] **Step 8: Verify** with the connector's `get_task` that 10039, 10040 and 10041 are `done` with the data's result. Expected: three done, nothing closed by hand.

---

## Phase 1b: Release pipeline (Opus)

Worktree `release`. Everything after ships through it.

### Task 1b.1: The local Supabase stack runs every migration

**Files:**
- Create: `supabase/local/supabase/config.toml` (project id `latam-trip-local`, studio, inbucket and analytics off, no migrations in this workdir)
- Create: `supabase/local_up.sh` (starts the stack with a pinned CLI, `npx --yes supabase@<exact version> start --workdir supabase/local`, then `migrate.py --db-url` with `--helpers`, then prints the env lines the tests need to a file outside the repo)
- Modify: `supabase/migrate.py` (`--db-url URL` or `SUPABASE_DB_URL`, which skips the pooler, uses `sslmode=disable` for localhost and never prints the URL)
- Modify: `plugin/scripts/test_db_functions.py` (`load_env` takes `TRIPDB_ENV_FILE`, so the tests point at the local stack)
- Modify: any migration that fails on a fresh stack, only with a new migration or a guard that is a no op on the project
- Test: `supabase/test_task_close.py` and `plugin/scripts/test_db_functions.py`, both on the local stack

- [ ] **Step 1:** Start Docker Desktop, run `bash supabase/local_up.sh`. Expected: every file in `supabase/migrations/` applies. Record each failure and its fix.
- [ ] **Step 2:** Run both test files with `TRIPDB_LIVE_TESTS=1 TRIPDB_DB_TESTS=1 TRIPDB_ENV_FILE=<that file>`. Expected: PASS, no skip.
- [ ] **Step 3: Commit** `A local Supabase stack runs every migration and the database tests`.

### Task 1b.2: Tests on every pull request and push, with no secret

**Files:**
- Create: `.github/workflows/test.yml`
- Modify: `docs/technical/technical-decisions.md` (TECH-008 Release pipeline, Proposed)

**Interfaces:**
- Produces: a reusable workflow (`on: workflow_call`) the release calls, also run `on: pull_request` and `on: push` to any branch but `main`.

- [ ] **Step 1: Write `test.yml`.** `permissions: contents: read` at the top. No `secrets`, no `id-token`, never `pull_request_target`. Jobs: python (tripdb tests, `tasks.py` tests, `python -I -X utf8 -m unittest discover -s latam_trip_mcp -p "test_*.py"`, `infra/worker` tests), node (typecheck and test in `web` and `planner`), database (`supabase/local_up.sh`, then the two database test files). Every third party action pinned to a full commit SHA with the tag in a comment. Concurrency per ref.
- [ ] **Step 2: Verify** on a pushed branch `ci/test-run`. Expected: all jobs green, the run log shows no secret and no AWS step.
- [ ] **Step 3: Commit** `Tests run on every pull request and branch push, with no secret`.

### Task 1b.3: Release on push to main

**Files:**
- Create: `.github/workflows/release.yml`
- Modify: `infra/mcp/deploy.sh` (`--code-only`: build and check the zip as today, upload to the deploy bucket, `aws lambda update-function-code --function-name latam-trip-mcp --s3-bucket --s3-key`, `aws lambda wait function-updated-v2`, then a smoke call that `POST /mcp` without a bearer answers 401 with `resource_metadata`)
- Modify: `infra/mcp/template.yaml` (`kms:Decrypt` on the one key: a parameter `SsmKmsKeyArn`, which `deploy.sh` resolves with `aws kms describe-key --key-id alias/aws/ssm`)
- Create: `infra/release/trust-policy.json`, `infra/release/role-policy.json` (with `${ACCOUNT}`, `${REGION}` and `${REPO}` placeholders filled at setup, never committed filled)
- Create: `infra/release/setup.sh` (prints each command before it runs it, see task 1b.4)

- [ ] **Step 1: Write `release.yml`.** `on: push: branches: [main]` and `workflow_dispatch`. Job `test` uses `./.github/workflows/test.yml`. Job `release` needs `test`, `environment: release`, `permissions: id-token: write, contents: read`, concurrency `release` without cancel. Steps: checkout, `uv`, `migrate.py` with `SUPABASE_PASSWORD` and `SUPABASE_URL` from the environment, `configure-aws-credentials` with `${{ secrets.AWS_RELEASE_ROLE_ARN }}`, `bash infra/mcp/deploy.sh --code-only`. A failed test stops the job before migrate.
- [ ] **Step 2: Role policy.** Allowed: `s3:PutObject` on `arn:aws:s3:::latam-trip-mcp-deploy-${ACCOUNT}-${REGION}/function-*`, `s3:GetObject` on the same, `lambda:UpdateFunctionCode`, `lambda:GetFunction`, `lambda:GetFunctionConfiguration` on `arn:aws:lambda:${REGION}:${ACCOUNT}:function:latam-trip-mcp`. Nothing else. Trust: `token.actions.githubusercontent.com` with `aud` equal to `sts.amazonaws.com` and `sub` equal to `repo:Olafcito/latam-trip:environment:release`, `StringEquals`, no wildcard.
- [ ] **Step 3: Commit** `Release: every push to main tests, migrates and updates the connector code`.

### Task 1b.4: AWS role, GitHub environment, secrets and ruleset (from this PC, each command shown first)

- [ ] **Step 1: Decide finding 6**, the Claude push identity, and set the ruleset that GitHub allows (TECH-008).
- [ ] **Step 2: Show, then run with his AWS profile:** check the GitHub OIDC provider exists, read the trust of the site role behind `AWS_DEPLOY_ROLE_ARN` and report whether its `sub` is exact (spec finding 10), create role `latam-trip-release` with the two policies, run `deploy.sh` in full once for the narrowed `kms:Decrypt`.
- [ ] **Step 3: Show, then run with gh:** create environment `release` with a deployment branch policy of `main` only, `gh secret set SUPABASE_PASSWORD --env release` read from `.env` without printing it, `gh secret set AWS_RELEASE_ROLE_ARN --env release`, `gh variable set SUPABASE_URL --env release`, the ruleset from step 1.
- [ ] **Step 4: Verify.** Push to main and read the run: tests, then `migrate: done`, then the deploy and the 401 smoke check. Then a commit that breaks one test on a branch shows the release would stop (a `workflow_dispatch` from that branch is refused by the environment). The fork pull request waits for a second GitHub account (finding 7).
- [ ] **Step 5:** CLAUDE.md "Checkouts and branches" and "tripdb" say that a push to main migrates and updates the connector, and what still deploys from the PC. TECH-008 to Implemented. Commit.

---

## Phase 2: Owner columns, composite keys, backfill, per user RLS (Opus)

Worktree `owners`. Simon is still the only user. The morning rates run was decided without Simon, by his wish not to be asked: it prices Simon's places only (`owner_id` of the admin), since every other place belongs to someone who has their own Claude to price it and the shared gate of 30 calls a minute stays his. Simon may widen it later.

### Task 2.0: Two user fixtures on the local stack

**Files:** Create `supabase/tests/users.py`.

**Interfaces:**
- Produces: `make_user(env, label) -> User` with `.id`, `.token`, `.rest` (a PostgREST client on the publishable key with the user's bearer) and `.storage`. Users are `test-a@example.test` and `test-b@example.test`, made through the local GoTrue admin API, signed in with a password. `admin(env) -> User` is A after `insert into admins`.

### Task 2.1: The RLS matrix, written first

**Files:** Create `supabase/tests/test_rls.py`.

- [ ] **Step 1: Write the matrix.** `PRIVATE = ["trips", "bookings", "lodgings", "lodging_rooms", "lodging_prices", "quotes", "tasks", "task_log", "inbox", "agent_usage", "user_profiles", "user_documents"]`. For each table, A inserts a row, then: B's select returns none, B's update and delete change nothing, B's insert with `owner_id` of A is refused, A sees exactly A's rows. Plus:
  - `test_room_under_others_lodging_refused`: B inserts a room with A's `lodging_id`. Refused with the same error code as for an id that does not exist.
  - `test_price_under_others_room_refused`, the same for prices.
  - `test_same_trip_name_both_save`: A and B save trip id `colombia` version 1.
  - `test_unique_clash_reveals_nothing`: B's `stay_picks` task for A's place and dates saves.
  - `test_catalogue_read_only`: B selects `places` and gets rows, and each insert, update and delete on every catalogue table is refused. A as admin may write.
  - `test_bucket_folders`: B can neither list, read, write nor delete under `<A id>/` in `bookings`.
  - `test_service_insert_lands_on_admin`: a secret key insert into `lodgings` without `owner_id` lands on A.
  - `test_realtime_is_owner_scoped`: B's subscription to `lodgings` sees B's insert and not A's.
  - `test_derive_state_readable_names_no_trip`: B reads `derive_state` and `last_warning` holds no trip id.
- [ ] **Step 2: Run on the local stack.** Expected: FAIL on every cross owner case.

### Task 2.2: The owner migration

**Files:**
- Create: `supabase/migrations/0027_owners.sql` (`owners` renamed `admins`, `is_admin()`, `admin_id()`, `owner_id` with backfill and `not null`, composite keys, owner aware keys and indexes, `user_documents`, `user_profiles` table only, `owner_limits`, policies, owner aware definer functions)
- Create: `supabase/migrations/0028_bookings_bucket_folders.sql` (storage policies on `(storage.foldername(name))[1] = (select auth.uid())::text`)
- Create: `supabase/tests/test_owner_migration.py`
- Modify: `supabase/test_helpers.sql` (`test_reset` truncates the new tables)

Decided values:
- `owner_id uuid not null default coalesce(auth.uid(), public.admin_id()) references auth.users(id) on delete cascade` on each private table.
- `lodgings` gets `unique (id, owner_id)`. `lodging_rooms` gets `unique (id, owner_id)` and `foreign key (lodging_id, owner_id) references lodgings (id, owner_id) on delete cascade`. `lodging_prices` gets `foreign key (room_id, owner_id) references lodging_rooms (id, owner_id) on delete cascade`. The old single column keys go.
- `trips` key `(owner_id, id, version)`. `trips_latest` and `save_trip` match on owner and id. `tasks_stay_picks_once` and `lodging_rooms_site` gain `owner_id` first.
- `user_documents (owner_id, name)` key. The list moved from `documents` is confirmed in step 1 against the live names, starting from `lists.json`, `trip.json`, `mcp_trash.json`, `web_trips`, `way_id_map`, `unresolved_journeys`.
- `inbox_tokens.owner_id` for `submit_inbox` and `submit_task`. `queue_stay_details` copies `new.owner_id`.
- Catalogue tables: select for `authenticated`, insert, update and delete only `with check ((select public.is_admin()))`. Service tables keep no client policy. `derive_state` select for `authenticated`.
- The migration raises a notice with the rows it set per table.

- [ ] **Step 1:** List the live document names with `tripdb doc-get` and record the split in the migration's header.
- [ ] **Step 2: Write `test_owner_migration.py`.** On a fresh local stack: apply up to 0025, seed rows in every private table and two booking files, record counts, apply 0027 and 0028, then each private row has A's id, the counts match, the files moved to `<A id>/...` and `bookings` rows point at the new paths.
- [ ] **Step 3: Write the migrations.** Run `test_rls.py` and `test_owner_migration.py`. Expected: PASS.
- [ ] **Step 4: Commit** each migration with its tests.

### Task 2.3: Clients name the new keys

**Files:** Modify `planner/src/lib/lodgings.ts`, `planner/src/lib/remoteTrips.ts`, `web/src/data/supabase.ts`, `plugin/scripts/tripdb_store.py` (conflict columns and document names), `latam_trip_mcp/core.py` (`stable_id` takes the owner, `add_lodging` finds the place by place and name among the caller's rows first), the planner's booking file paths. Tests in the files beside them.

- [ ] Each upsert names `owner_id` among its conflict columns. Tests: `remoteTrips.test.ts` saves a second version, `lodgings.test.ts` upserts a room, `test_store_contract.py` names the new columns, `test_core.py` `test_re_add_keeps_existing_id`. Commit per app.

### Task 2.4: Edge functions act as the caller

**Files:** Modify `supabase/functions/stay-rates/index.ts`, `supabase/functions/read-booking/index.ts`. Create `supabase/migrations/0029_read_booking_cap.sql` (`read_booking_usage (owner_id, month, reads)` and `take_read_booking(cap int) returns boolean`).

- [ ] Both drop `is_owner()` and read the user from the JWT. `stay-rates` finds stored places by Hostelworld id among the caller's lodgings only and writes with the caller's `owner_id`. The worker key path writes with the admin's id. `read-booking` takes a turn from `take_read_booking` and answers 429 `{"error": "monthly_cap"}` past the cap. Deno tests per function. Deploy from the PC with `npx supabase functions deploy` after the merge. Update TECH-001 and TECH-003.

### Task 2.5: The worker and the public bucket

**Files:** Modify `infra/worker/steps.py`, `plugin/scripts/tripdb.py` (`cmd_pull` filters `quotes` and `trips` to `owner_id=eq.<admin id>` read from `admins` at run time, drops `task_log` from the pull), `plugin/scripts/build_web_data.py` (no `public_task_log`), `plugin/scripts/test_public_data.py`, `infra/worker/test_steps.py`.

- [ ] `test_public_data.py` adds a second owner's marked rows in every private table, `quotes` included, and no marker reaches a built file. `test_steps.py` `test_pull_reads_catalogue_and_admin_rows_only`. The rates run prices the admin's places only, `test_steps.py` `test_rates_run_prices_admin_places_only`. Deploy the worker with `bash infra/deploy.sh --enable-schedules` from the PC. Commit.

### Task 2.6: Docs

`data/README.md` (owner column, shared and private tables, `admins`, `user_documents`), `docs/technical/technical-decisions.md` (TECH-009 Ownership in the database, Proposed), CLAUDE.md Privacy. Commit with the last code commit of the phase.

### After the merge of phase 2

The release applies 0027 to 0029 and updates the connector. From the PC, at once and in this order: `npx supabase functions deploy stay-rates read-booking`, `bash infra/deploy.sh --enable-schedules`, then `python -I -X utf8 supabase/move_booking_files.py` to look and `--apply` to move the old booking files under the admin's folder. A later migration drops the temporary rule for one folder paths once nothing is left there. Until the functions are redeployed, a new Hostelworld room fails to store and reads have no cap. Until the worker is redeployed, builds fail and the old files stay live.

Left for phase 3: `Core(owner=...)` sets the owner only for the connector's own queries, while tasks, trips, the trash document and quotes still go through the store as the admin. Phase 3 hands the same owner to the store. Nothing passes another owner before then. Batch A also moved the task runner's admin only wakeup into 0027, so 0030 keeps only what is left of task 4.

---

## Phase 3: OAuth 2.1 spike, then the connector acts as the user (Opus)

### Task 3.1: Spike, not merged

Worktree `oauth-spike`. Time box one working session.

- [ ] Enable Supabase's OAuth 2.1 server on the project (Simon turns it on in the dashboard if the Management API needs a token he has not given). Run the connector locally behind ngrok with protected resource metadata that names Supabase as the authorization server, and a consent route in the planner dev server. Add it to Claude as a custom connector and call `list_trip`.
- [ ] **Pass:** Claude completes discovery, dynamic registration, PKCE and the token exchange with the authorization server on another origin, the connector verifies the bearer against `/auth/v1/.well-known/jwks.json`, and PostgREST with that bearer returns only that user's rows. Refresh works after the access token expires.
- [ ] **Record** the result as TECH-010 and in the harness log. Pass means way 1 below. Fail means way 2, connector minted tokens, after checking that Supabase accepts an imported signing key. Way 3 only if both fail, and then this plan is revised and shown to Simon before code.

### Task 3.2: The connector acts as the user (way 1)

**Files:** Modify `latam_trip_mcp/server.py` (per request `Core` on a `Rest` built from the bearer and the publishable key), `latam_trip_mcp/oauth.py` (keeps only the protected resource metadata and JWKS check), `infra/mcp/template.yaml` (SSM read of the URL and publishable key only, the DynamoDB table stays for rate limits), `planner/src/` consent route (the existing `?connect=` screen becomes the Supabase consent page). Tests: `latam_trip_mcp/test_auth.py`.

**Interfaces:** `server.core_for(token: str) -> Core`, `oauth.verify_bearer(token: str) -> str | None` (the user id).

- [x] Tests: `test_client_built_from_user_token`, `test_expired_bearer_asks_to_sign_in_again` (never a secret key fallback), `test_old_bearer_refused`, `test_two_users_sign_in` (criterion 2 on the local stack), `test_approve_needs_the_authorize_code` for ways 2 and 3 only.
- [x] `test.yml` gains the grep that fails when `SUPABASE_SECRET_KEY`, `supabase-secret-key` or a `sb_secret_` key appears under `latam_trip_mcp/` or `infra/mcp/`. It checks names only.
- [x] Fix round. Migration 0033 grants `add_quotes` to authenticated with `owner_id` from `auth.uid()`, adds the narrow security definer `add_airport_stubs` and makes `stays` a catalogue table. A flight change that keeps its quote id puts the old quote back when the new one is refused. The key set is kept 10 minutes and refetched for an unknown `kid` at most once a minute. The role reads the two exact SSM parameters with no `kms:Decrypt`. `deploy.sh --code-only` stops when the function lacks a variable the code reads. The consent page leads with Latam trip and says what a connection can read and change. Tests: `test_a_person_who_is_not_the_admin_saves_and_changes_a_flight`, `test_a_signed_in_person_reads_the_stays` and `JwksTest` in `test_auth.py`.
- [ ] Go live in the order in `docs/connector.md`, commands shown first: `put-secrets.sh`, the full `infra/mcp/deploy.sh`, the merge to `main` (the release applies 0033 and builds the planner), the live Auth settings, Simon signs in once again, and a day later the SSM secret key and passphrase parameters are deleted.
- [x] Follow up: the connector refuses past `connector_writes_per_minute` of `owner_limits` (60) per user, moved here from task 6.2. Done in migration 0037 with task 6.3, see task 6.2.

---

## Phase 4: Tasks per owner (Sonnet, with an Opus review of the SQL)

Ask first: browser tasks for other users, and user research into the catalogue.

### Task 4.1: Scoped claims and the PC loop

**Files:** `latam_trip_mcp/runner.py` (`claim_task` under the user's token, so RLS scopes it), `plugin/skills/trip-checklist/scripts/tasks.py` (every query adds `owner_id=eq.<TRIPDB_OWNER_ID>` from `.env`, and `start` refuses a row of another owner), no migration, since 0027 already limits `ping_task_runner` and `sweep_task_runner` to the admin's tasks.

- [x] Done: `tasks.py` refuses a `TRIPDB_OWNER_ID` that is not the admin, and the connector's claim, held-task and lodging reads use `Core.mine`. Tests: `test_tasks.py` `test_wait_and_list_see_only_the_owner` with two owners, `test_ping_ignores_other_owner` and `test_sweep_ignores_other_owner` on the local stack, `test_runner.py` `test_claim_gives_only_callers_tasks`. Running the loop under Simon's own token is weighed in TECH-011 and recommended once the connector can mint a session for him. Until then the filter plus the refusal in `start`.

### Task 4.2: stay_prices closes by the data

**Files:** `supabase/migrations/0030_stay_prices_close.sql`, tests in `supabase/test_task_close.py`.

- [x] Done as migration 0030. A `stay_prices` task is done when every room in `room_ids` has a price for its dates, seen after the task was queued. Same shape as 0025. Docs: `docs/claude-tasks.md`, `docs/task-runner.md`.

### Task 4.3: Task, inbox and task_log ids per owner

**Files:** `supabase/migrations/0031_task_ids_per_owner.sql`, the connector's task tools and undo in `latam_trip_mcp/core.py`, `supabase/tests/test_rls.py`.

- [x] Done as migration 0031 (`task_log` is keyed `(owner_id, seq)`, its identity column is `seq`). `tasks`, `inbox` and `task_log` are keyed `(owner_id, id)`. Claim, finish, fail, undo and the stay_details functions follow a task by owner and id. Test: `test_taken_task_id_is_as_free_as_a_fresh_one`, B inserting an id A holds gets the same answer as a fresh id. Clears the second gate of phase 6.

---

## Phase 5: Profiles, Simon's rules out of the plugin (Sonnet)

### Task 5.1: get_profile and update_profile

**Files:** `latam_trip_mcp/core.py`, `latam_trip_mcp/test_core.py`.

- [x] Fields: `home_airport` (IATA), `currency` (ISO), `max_hours` (number, the column 0027 made), `travel_style` (text), `rules` (free text). Test `test_profile_round_trip` and `test_no_profile_returns_empty_with_ask`.

### Task 5.2: Rules move to Simon's profile

- [x] Grep the skills and agents for Copenhagen, CPH, 30 hours and the table formats. Each becomes "from the profile". Simon's values go into his profile through `update_profile`, not into a file. Every skill that searches calls `get_profile` first and asks for one when it is empty. Dry run of `plan-trip` with an empty profile. Run `sync_claude_dir.py`.
- Known gap: `momondo_lines.py` still names its long journey flag `over_30h` and sets it at 30 hours. The workers keep rows by the task's `max_hours`, and the flag waits for the planner to read the profile in task 5.3. Stored prices stay in DKK, so the runner's results still speak kroner.

### Task 5.3: The profile sheet in the planner

- [x] A sheet by the DES sheet decisions, read and edit. The person mark at the end of the header opens it. `planner/src/lib/profile.ts` reads and saves the row and checks it as `profile_errors` does, `ProfileSheet.tsx` is the sheet.
- [x] Shot, roast through `design-roaster`, one fix round, as CLAUDE.md "Running a build". The roast scored 6 of 10. The fix round made unset rows look unset, gave Save the amber accent and moved errors into their own row. The concept changes it proposed went to Simon: save per row, rules as a list, travel style as chips, a currency picker.

---

## Phase 6: Sign up, export, delete (Opus for auth and delete, Sonnet for the rest)

Decided by default on 2026-11-06, since Simon asked not to be asked: sign up is invite only, through the `invites` table of task 6.1, and an outside user gets no passphrase fallback, only the email sign in. Simon can open sign up or add a fallback later without a migration of the rows.

Gate before the first outside account: Supabase Postgres Changes does not apply row level security to DELETE events, so every subscriber gets the deleted row's primary key. Every published private table is keyed by `owner_id` first (bookings, lodgings, lodging_rooms, lodging_prices, trips and, since 0031, tasks), so the key carries the other person's user id, and the `trips` key also the trip name. Phase 2 measured what B sees in `test_realtime_is_owner_scoped`. Before sign up opens, the planner moves to private broadcast channels with row level security on `realtime.messages`, or the private tables leave the realtime publication, and the test asserts B sees no DELETE of A's rows.

- [x] Cleared by migration 0034 (TECH-012): the six tables left the publication, and a statement level trigger tells each owner a statement touched on the private topic `owner:<user id>`, with the table as the event and no column of the row. Row level security on `realtime.messages` lets a person join their own topic only. The planner joins it once per tab through `ownerFeed.ts` and reads the rows again, as before. Tests: `test_no_private_table_is_published`, and `test_realtime_is_owner_scoped`, where B hears no event at all of A's insert, update or delete on any of the six tables, by Postgres Changes, on B's topic or by joining A's, which is refused, and A hears all three on A's topic.

Second gate before the first outside account: `tasks`, `inbox` and `task_log` keep identity ids that accept an explicit id, so B inserting an id A holds gets a 409 that says the id exists. Nothing else is learnt, the row stays hidden. They are not keyed `(owner_id, id)` in phase 2 because the connector's undo of a task delete inserts the old row with its id, and claim, finish and the stay_details functions follow a task by its id alone. Cleared by task 4.3: migration 0031 keys these three tables per owner the way phase 2 keyed lodgings and bookings, and `test_taken_task_id_is_as_free_as_a_fresh_one` in test_rls asserts that a taken id behaves like a fresh one. This gate does not touch the first: since 0031 a deleted task's DELETE event carries its owner's id too.

### Task 6.1: Sign up by the rule

- [x] Invite only means an `invites` table checked by a Supabase `before_user_created` auth hook, open means no check. Custom SMTP set by Simon before the first outside user. Planner sign in screen for any email, no owner wording, roasted.
- Done as migration 0036 and the local config's hook (TECH-010). `tripdb invite EMAIL` and `tripdb invites` add and list invites. The planner sends the email link to any address with `shouldCreateUser` on and shows a refusal as the invite state. Tests: `InviteTest` in test_rls (an invited address signs up and its invite is used, the case of the address does not matter, an uninvited address is refused, a used invite cannot sign up twice, people with an account sign in as before, a password given at sign up signs in neither before nor after the address is confirmed, a confirmed user made by the admin API signs in with its password, no client reads or writes invites), `InviteTest` in test_tripdb and `linkOutcome` in the planner. A stack started before 0036 runs `InviteTest` only against a second auth server with the hook on, named by `SUPABASE_AUTH_URL`. The roast waits for the coordinator.
- Live since 2026-11-06 (6fd3a5e): the hook is registered and sign up is on, and a sign up from an address with no invite is refused live with 403 by both the email link and the password sign up. Custom SMTP is still Simon's step before the first invite. Live steps at merge, after the release applies 0036: register the Postgres hook `before_user_created` as `pg-functions://postgres/public/hook_before_user_created` in Auth, Hooks. Then turn on "Allow new users to sign up" in Auth, Sign In. The hook goes first, so sign up is never open without it. Confirm email stays on in Auth, Sign In, Email (it is on live, `mailer_autoconfirm` false) and must never be turned off while sign up is open: sign up also opens email and password sign up at `/auth/v1/signup` to the public key, and with confirm email off a stranger who signs up with an invited address gets a session at once. The trigger `clear_signup_password` of 0036 clears the password every client sign up gives, so a stranger's password never signs in after the invitee confirms the address, and a user made with the admin API keeps its password. Simon sets custom SMTP before the first invite, and invites with `tripdb invite EMAIL`.

### Task 6.2: Caps

- [x] A trigger per private table refuses an insert past `owner_limits` and a storage policy refuses a file past the folder size. Tests on the local stack.
- [x] The connector refuses past 60 writes a minute per user. Done in migration 0037: `connector_call(p_write)` runs before every tool, counts a write per person and UTC minute in `connector_writes`, which no client reads or writes, and refuses the one past `connector_writes_per_minute` with a plain tool error. Reads are not counted. Tests: `test_the_61st_write_is_refused_and_another_person_is_unaffected` and `test_the_count_is_no_clients_to_read_or_write` in `latam_trip_mcp/test_account.py`.
- Done as migration 0035 for the rows, the tasks a day and the folder bytes. The tables that only grow get limits of their own (`rows_in_<table>`: trips 5000, lodgings 5000, lodging_rooms 25000, lodging_prices 100000, quotes 100000, tasks 5000, task_log 5000, agent_usage 10000), each the admin's live rows plus 26 weeks at 3 times the last week's growth (TECH-009). `user_profiles` has one row per person by its key and no row cap. Tests: `test_row_caps_per_person`, `test_growing_tables_have_limits_of_their_own`, `test_add_quotes_holds_the_quotes_cap`, `test_lodging_at_the_tasks_cap_comes_without_its_task`, `test_tasks_a_day_count_what_was_added_today` and `test_bookings_folder_cap` in test_rls, where the admin is refused like B.
- The connector's 60 writes a minute per user moves to the follow up of task 3.2, since it belongs to the connector that acts as the user.

### Task 6.3: export_account and delete_account

**Interfaces:** `export_account() -> {"tables": {name: rows}, "files": [paths]}`. `delete_account(email: str) -> {"deleted": counts}` via `public.delete_account(p_email text)`, security definer, which fails working tasks first and deletes the auth user so the cascade takes every row.

- [x] Files first through the Storage API under the user's token. Tests: `test_delete_counts_every_private_table`, `test_delete_needs_the_email`, `test_delete_retries_after_storage_failure`, `test_export_has_every_table`.
- Done as migration 0037 and the two connector tools. `may_delete_account` checks the email (any case) and refuses the admin before a file is removed. The connector then removes the caller's booking files under their token and lists the folder again, and `delete_account` refuses while a file is left, so a storage failure deletes nothing and a second call finishes. It fails the caller's working tasks, counts the rows of every `owner_id` table and deletes the auth user, and every key to `auth.users` cascades (the migration fails if one does not). `ACCOUNT_TABLES` and `SERVICE_TABLES` in `core.py` name every private table, and `test_every_owner_id_table_is_named_and_cascades` fails when a migration adds one they leave out. A deleted person's old token gets a plain tool error on every tool. Backups keep a deleted account's dumped rows up to 90 days (TECH-013). Tests in `latam_trip_mcp/test_account.py`, among them `test_delete_leaves_another_person_untouched` and `test_a_deleted_persons_old_token_fails_cleanly`.

### Task 6.4: README install section and the privacy note draft

- [ ] Install, sign in and the read only browser rules. The privacy note says what is stored, why, how long backups keep a deleted account, and how to delete. Marked as waiting for Simon's lawyer.

---

## Phase 7: Live run with a second test account

Needs a second Claude account and a second email from Simon.

- [ ] Install the plugin and connector from the README, sign in, set a profile, add a Booking.com place through `add-lodging`, open the planner as that user and see only those rows, queue a task and watch it close by the data, export, delete, then confirm every private table and the folder hold nothing of that user and Simon's counts are unchanged. Each hop is logged with what was seen. The feature is done only when the run passes. A failure goes to the harness log and back to the phase that owns it.
