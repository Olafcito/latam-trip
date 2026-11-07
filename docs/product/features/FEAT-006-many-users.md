# FEAT-006 Many users through their own Claude

**Id.** FEAT-006. **Date.** 2026-11-06. **Status.** Reviewed.

## 1. Problem

latam-trip is built for one person. Simon wants to offer it to other travellers. Today everything assumes there is one user:

- **One owner.** Every RLS policy checks `public.is_owner()`, which reads one `owners` table. The connector's OAuth (`latam_trip_mcp/oauth.py`) emails a sign in link to that one owner only.
- **One key.** The connector reads the Supabase secret key from SSM and calls PostgREST with it, so it bypasses RLS. Whoever reaches the connector reads and writes every row. Putting the key in AWS, which is already done, keeps it out of the client but does not separate one user from another. One key means one identity.
- **Simon's PC does the work.** `stay_details`, flight crawls and other browser tasks run on Simon's PC through `trip-checklist` and `task-loop`. Task status only changes when that loop runs, so a place completed in a chat leaves its task open.
- **Shipping needs Simon's PC.** Migrations need `SUPABASE_PASSWORD` from the PC's `.env`, and the connector deploys with the PC's AWS credentials. A change pushed from anywhere else is not live until Simon runs two commands at home.
- **Simon's rules live in the product.** The skills carry his personal rules, such as Copenhagen as the home airport, the 30 hour limit and his table formats.

## 2. Journey

The product shape is decided (PROD-007, accepted): people use latam-trip through their own Claude, with the latam-trip connector and the plugin's skills. latam-trip hosts the data, the connector and the skills. The user brings their own Claude subscription and their own browser.

A new traveller:

1. **Hears about it and installs it.** On their laptop they add the latam-trip connector and plugin to their own Claude.
2. **Signs in.** The connector asks them to sign in with their email. They get a link, open it and allow their Claude. They never see a key.
3. **Sets their profile.** Their Claude asks for their home airport, currency, travel style and limits such as the longest journey they accept, and saves them through the connector.
4. **Plans.** They paste flight searches, Airbnb links and Booking.com wishlists into their Claude. The `add-lodging` skill adds the places and fills in photos, rooms and prices in the same session, through their own browser.
5. **Opens the planner.** They sign in to the planner on phone or laptop with the same email and see only their own trips, places to stay and bookings, on top of the shared map of places and connections.
6. **Asks for background work.** They press a button in the planner that queues a task. Their Claude does it the next time they run the task runner or checklist. A task closes itself as soon as its data is complete.
7. **Leaves.** They delete their account and everything that is theirs is gone. They can export it first.

Simon:

8. **Keeps his flow.** His own data moves to his user id unchanged. His PC loop keeps doing his tasks and only his.
9. **Ships from anywhere.** A push to `main`, from his PC or any Claude session, runs the tests, applies new migrations and deploys the connector. No step waits for his PC.

## 3. Goals

- Every person sees and changes only their own private data, enforced by the database, whatever the connector or the planner does.
- The connector acts as the signed in person and never uses the secret key for their requests.
- Shared research (places, connections, airports, place profiles and images, experiences) stays one shared catalogue that everyone reads. A person's own flight searches are theirs (PROD-008, accepted).
- A release is a push to `main`. Nobody runs migrations or deploys by hand.
- A task closes itself when the data it asked for is complete, whoever completed it.
- The plugin holds no one's personal rules. Each person's rules come from their profile.
- A person can export and delete everything that is theirs.

## 4. Non goals

- **A hosted agent (shape B).** latam-trip runs no model and pays for no tokens.
- **New server side reads.** No new scraping from AWS or any datacenter. Browser reads happen only in the user's own Claude on their own device. The Hostelworld JSON reads of the `stay-rates` edge function (TECH-003, TECH-004) exist already and stay, scoped to the caller's own places. The model call in the `read-booking` edge function is open question 7.
- **Billing, plans and payments.**
- **Shared trips between people**, such as two travellers editing one trip. One owner per trip in this feature.
- **A marketing site or onboarding emails.**
- **New trip regions.** The shared catalogue stays Central America, Colombia and Bolivia.
- **An Airbnb or Booking.com partner integration.** Prices keep coming from the Booking.com connector, Hostelworld rates and the user's own browser.

## 5. User stories

1. As a new traveller, when I install latam-trip, I want to add the connector and the plugin to my own Claude so that I use my own subscription.
2. As a new traveller, when I connect, I want to sign in with my email so that my Claude acts as me.
3. As a traveller, when I start, I want to give my home airport, currency and limits once so that every search and table follows my rules.
4. As a traveller, when I add a place to stay, I want photos, rooms and prices filled in at once so that I can compare places right away.
5. As a traveller, on my phone, I want to see only my own trips and bookings on top of the shared map so that nobody else's data mixes in and mine is never shown to anyone.
6. As a traveller, when I queue a task, I want it to close by itself once the data is there so that my checklist only shows what is still open.
7. As a traveller, when I leave, I want to export and delete my data so that nothing of mine stays behind.
8. As Simon, after the move, I want my trips, places, bookings and tasks unchanged and my PC loop doing only my tasks so that nothing I rely on breaks.
9. As Simon, when I push a change, I want it tested, migrated and deployed by itself so that a change made from a chat is live without my PC.

## 6. Acceptance criteria

1. The plugin installs from the repo with documented steps. The connector URL is the same for everyone. Proved by following the steps in a fresh Claude account.
2. A new email can complete the OAuth flow and gets a bearer bound to its own Supabase user id. A flow started by one person cannot be approved into a bearer by another person who never saw the authorize page. Proved by a test of the sign in path with two users and a test where the approve step lacks the code shown on the authorize page. Sign up follows the rule settled in open question 1.
3. `get_profile` and `update_profile` exist on the connector. A new user without a profile is asked for one by the skills before the first search. Proved by a connector test and a skill dry run.
4. `add-lodging` works the same for any user. Its places get the user's id. Proved by a connector test that adds a lodging as user A and cannot read it as user B.
5. With the planner signed in as user B, no row of user A appears anywhere, and the shared map is the same for both. Proved by an RLS test per private table, run against a local Supabase stack, with two users, for select, insert, update and delete. The same matrix proves that user B cannot insert a room or price under user A's lodging, cannot learn whether one of A's ids exists through a key or unique index clash, cannot write any catalogue table, and cannot read or write a file under A's folder in the `bookings` bucket.
5a. No row of a second user reaches a file in the public `web` bucket or `derive_state`. Proved by extending `plugin/scripts/test_public_data.py` with a second owner's marked rows in every private table, `quotes` included, and by a worker test that the pull reads catalogue rows only.
6. A `stay_details` task is set to done by the database when its lodging has at least one photo and a price for the task's dates on every room. Proved by a migration test that completes a lodging through the connector and finds the task done.
7. `delete_account` removes every private row and file of the user and the auth user. `export_account` returns them as one JSON file. Proved by a test that counts rows per private table before and after.
8. After the move, every existing private row belongs to Simon's user id, and `tasks.py wait` and `list` return only his tasks. A task another user inserts does not start Simon's cloud routine. Proved by counts before and after in the migration test, by a `tasks.py` test with two users and by a migration test that `ping_task_runner` and `sweep_task_runner` ignore another owner's tasks.
9. A push to `main` runs the tripdb, connector and app tests, applies new migrations and deploys the connector, and stops before the deploy when a test fails. A pull request from a fork runs the tests with no secret and no AWS role. Proved by a workflow run on a branch, a pull request from a fork and the run logs.
10. The connector holds no secret key. Proved by a test that the request client is built from the user's token, and by a grep in CI that fails when `SUPABASE_SECRET_KEY` appears under `latam_trip_mcp/` or in `infra/mcp/`.

## 7. Functional requirements

### Data: shared and private

| Kind | Tables | Who reads | Who writes |
|---|---|---|---|
| Shared catalogue | `places`, `connections`, `airports`, `place_images`, `profiles` (place profiles), `experiences`, `experience_images`, the shared documents such as `experience_categories.json` | Every signed in user. Anon has no table grant today (`0002_rls.sql` revokes them all) and the public map reads the catalogue from built files in the `web` bucket, so anon stays without grants | Admins only, through policies that check `is_admin()`. Simon is the only admin. Another user's research reaches the catalogue only after review (open question 4) |
| Private | `trips`, `bookings`, `lodgings`, `lodging_rooms`, `lodging_prices`, `quotes`, `tasks`, `task_log`, `inbox`, `agent_usage`, `user_profiles`, `user_documents` (a person's documents, see below), the `bookings` bucket | The owner only | The owner only |
| Service | `admins` (today's `owners`, renamed), `inbox_tokens`, `leases`, `derived_options`, `stays` (closed), `site_calls`, `hostelworld_cities`, `task_runner`, `schema_migrations` | The service role | The service role |
| Status | `derive_state` | Every signed in user, since the planner listens to it. It holds nothing about one person, so `last_warning` names no trip id | The service role |

- **Owner column.** Each private table gets `owner_id uuid not null references auth.users(id) on delete cascade`, defaulting to `auth.uid()`. Child tables (`lodging_rooms`, `lodging_prices`) get it too, so RLS needs no joins. A foreign key check bypasses RLS, so a plain `lodging_id` key would let user B attach a room to user A's lodging and probe A's ids. The child keys are therefore composite: `(lodging_id, owner_id)` references `lodgings (id, owner_id)` and `(room_id, owner_id)` references `lodging_rooms (id, owner_id)`, each parent with a unique `(id, owner_id)`.
- **Keys and unique indexes.** Every key and unique index on a private table includes `owner_id`, so one person's rows can never clash with or reveal another's. That covers the `trips` key, which becomes `(owner_id, id, version)` since trip ids are slugs of the trip name (`Core.new_trip`), the `trips_latest` view and `save_trip`, which match on owner and id, and `tasks_stay_picks_once` from `0023_stay_picks_task.sql`. Upserts follow: `planner/src/lib/lodgings.ts`, `planner/src/lib/remoteTrips.ts`, `web/src/data/supabase.ts` and `tripdb_store.py` name the new conflict columns.
- **Documents.** `documents` keeps the shared documents only. A person's documents (`lists.json`, `trip.json`, `mcp_trash.json`, `web_trips`, `way_id_map`, `unresolved_journeys`) move to a private `user_documents` keyed by `(owner_id, name)`. `mcp_trash.json` holds whole deleted booking and lodging rows, so it is private and never feeds the build. The plan confirms the list.
- **Policies.** `is_owner()` policies are replaced by `owner_id = (select auth.uid())` for select, insert, update and delete. Catalogue tables get a select policy for authenticated and write policies for `is_admin()` only. Every rule lives in the database, never only in the connector, because any signed in person can call PostgREST directly with their own token from the planner.
- **Bucket.** Files in the `bookings` bucket move to `<owner id>/<booking id>/<file name>`, and the storage policies check `(storage.foldername(name))[1] = (select auth.uid())::text`. Simon's files are moved in the backfill.
- **Functions and triggers.** Every security definer function that writes a private row sets `owner_id` itself: `queue_stay_details` copies `new.owner_id`, and `submit_inbox` and `submit_task` take the owner from `inbox_tokens.owner_id`, since an anon call has no `auth.uid()`. `ping_task_runner` and `sweep_task_runner` fire only for tasks of the routine's owner, Simon, so another person's task never starts or spends his routine. The edge functions `stay-rates` and `read-booking` drop `is_owner()`. `stay-rates` matches stored places by Hostelworld id among the caller's own lodgings only and writes with the caller's `owner_id`.
- **Backfill.** One migration sets `owner_id` to Simon's user id from the `owners` table on every existing private row, before `not null` is added. `owners` becomes `admins`.
- **`task_log`** becomes private. It reaches the public bucket today through `public_task_log` in `build_web_data.py`, and with more people it would show what each of them searched.
- **Quotes.** `quotes` is private (PROD-008, accepted). A person's searches name their home airport and their dates. Simon's crawled quotes keep feeding the public Options pane as today, since the pipeline is his.
- **Built files.** The build worker pulls catalogue tables and Simon's own quotes, never another owner's rows, and writes only those to the public `web` bucket (PROD-005). It stops pulling `trips` for the build, or pulls Simon's only, and `last_warning` names no trip id. Files for another person's trips are open question 3.
- **Ids.** Ids derived from names, such as `LODGING_NS` in `latam_trip_mcp/core.py`, include the owner id, so two people adding the same hostel get two rows.

### Connector

- **Acting as the user.** The bearer Claude holds must turn into a Supabase token for that one person, so RLS applies to every request. Three ways, in order of preference. The plan starts with a spike of the first.
  1. **Supabase Auth as the authorization server.** Supabase's OAuth 2.1 server (public beta) does dynamic client registration, PKCE and refresh rotation, and its access tokens are Supabase JWTs with the user and a `client_id` claim. The connector's protected resource metadata names Supabase as the authorization server, the planner hosts the consent screen (it has the `?connect=` allow screen already), and the connector checks each bearer against the project's JWKS and passes it on to PostgREST. Nothing is stored in the connector, and `oauth.py` mostly goes. The spike proves that Claude's connector client completes this flow with an authorization server on another origin.
  2. **Connector minted tokens.** The connector signs a short lived JWT for the user id bound to its own bearer, with a signing key Supabase trusts. The blast radius equals the secret key the connector holds today, but every request still runs under RLS, so a bug in the connector cannot mix two people's rows. The plan checks that Supabase accepts an imported signing key.
  3. **A stored Supabase session.** Only as a fallback, and never the planner's own session. Supabase refresh tokens are single use, and reuse outside a 10 second window revokes the whole session, so the planner and the connector sharing one session would log each other out. The connector creates a session of its own for the user at approve, keeps its refresh token encrypted with a KMS key, and refreshes under a per user conditional write lock in DynamoDB with the access token cached until it expires.
- **No secret key in the connector.** With catalogue writes behind `is_admin()` policies and `delete_account` as a database function, the connector Lambda needs no secret key at all. The secret key stays in the build worker and on Simon's PC.
- **OAuth for everyone.** For the second and third ways above, `/authorize` asks for an email and sends that address its Supabase sign in link, and `/signin/approve` binds the flow, the code and the bearer to the user id. The authorize page answers the same whether or not the email is known or allowed, so it reveals no account. The authorize page shows a short code, and the allow screen in the planner asks for it, so a person who only got the email cannot approve a flow someone else started. Registered clients get a ttl. The global `oauth:tries` counter becomes per email and per address, so one person's tries never lock everyone out. The passphrase fallback stays for Simon only, or is removed (open question 2).
- **Email.** Supabase's built in email only reaches the project's team, two messages an hour. A custom SMTP sender is set up before the first outside user.
- **Profile.** A `user_profiles` table, private, with home airport, currency, max hours in one direction, travel style and free text rules. Tools `get_profile` and `update_profile`. The skills read it instead of carrying Simon's rules.
- **Account tools.** `export_account` and `delete_account`, the second asking for the email again in the call. `delete_account` is a security definer function that deletes the caller's auth user, so `on delete cascade` takes every private row with it. The caller's files go first through the Storage API under the caller's own token. Every bearer of that user is revoked, which needs the bearers indexed by user id.
- **Limits.** Row and file caps per owner in the database, such as a trigger that refuses inserts past a count per table and a bucket size per folder, since the planner writes to PostgREST directly. The connector adds a rate limit on writes and a size cap per call on top.

### Tasks

- Tasks carry `owner_id`. `claim_task` gives only the caller's tasks. `tasks.py` on Simon's PC filters on his user id, from `.env`. That filter is the only thing between his PC loop, which holds the secret key and opens pages a task names, and another person's task text, so the plan weighs running the loop under Simon's own token instead.
- **Status follows the data.** A trigger on `lodgings`, `lodging_rooms` and `lodging_prices` sets an open or working `stay_details` task to done when its lodging is complete (photos and a price for the dates on every room), with a result that says what completed it. The same pattern is written for each task type whose output can be checked in the data, starting with `stay_prices`.
- The cloud task runner routine stays Simon's own. Other people run `task-runner` or `trip-checklist` in their own Claude.

### Plugin

- Every skill reads the profile through the connector for personal rules. Simon's rules in `trip-checklist`, `flight-crawl-orchestrator`, `plan-trip` and the worker agents move to his profile.
- Steps that need the repo on disk (`tripdb`, `read.mjs`) stay for Simon's PC. Every user path works through the connector alone, as `add-lodging` already allows.
- A README section explains install, sign in and the read only browser rules.

### Release pipeline

- A GitHub Actions workflow on push to `main`: the tests from CLAUDE.md, then `supabase/migrate.py`, then `infra/mcp/deploy.sh`.
- The repo is public. The workflow runs on `push` to `main` and `workflow_dispatch` only, never on `pull_request_target`. Pull requests, from forks included, run the tests in a separate workflow with `permissions: contents: read`, no secrets and no AWS role.
- The deploy job runs in a GitHub environment that only `main` may use, and the Supabase password and the AWS role live in that environment, not as repository secrets. Whether the environment also waits for Simon's approval is open question 8, since every Claude session may push to `main` and could change the workflow itself.
- AWS through GitHub's OIDC. The role's trust policy names this repository and that environment exactly, with no wildcard. The role updates the connector's code and nothing else. A template change that creates or changes IAM roles stays a deploy Simon runs, because a role that can create IAM roles can make itself an admin.
- Third party actions are pinned to a commit, not a tag.
- Migrations are tested against a local Supabase stack in the workflow before they reach the project. A Supabase branch costs a paid plan.
- The build worker deploy (`infra/deploy.sh`) joins later, on the same rules, since that stack holds the secret key.

### Privacy

- Data stays in the EU regions it is in today.
- The worker's backup dumps every table to the private backup bucket, so a deleted account lives on in backups until they expire. The privacy note says for how long.
- A privacy note covers what is stored, why, for how long and how to delete it. Simon checks the legal side with a lawyer before the first outside user (open question 5).

## 8. UX requirements

- The planner gets a sign in screen for any email, then shows the signed in person's own data. No owner wording anywhere.
- The planner never shows another person's rows, names or counts.
- The profile can be read and edited in the planner as well as through Claude. The form follows DES decisions for sheets. A new pattern with no decision behind it is flagged to `ui-roast`.

## 9. Edge cases

- **Expired or revoked session.** The connector answers with a sign in again message and never falls back to the secret key.
- **Same trip name.** Two people name a trip the same. Both save, since the trip key includes the owner.
- **Consent phishing.** Someone starts a flow and types another person's email. That person gets a real link, but without the code from the authorize page the allow screen refuses.
- **Room under someone else's place.** A direct PostgREST insert of a room with another owner's `lodging_id` fails on the composite key, the same way whether or not that lodging exists.
- **Same place twice.** Two people add the same hostel. They get two private rows, never one shared one.
- **Shared research from a user.** A user's `place_research` result must not reach the catalogue unreviewed.
- **Deleting with tasks under way.** Working tasks are closed as failed before the rows go.
- **Simon's backfill.** A row with no clear owner goes to Simon, and the migration reports how many rows it set.
- **Old bearers.** Bearers issued before this feature have no user id and are refused, so Simon signs in once again.
- **Abuse.** A client that sends thousands of rows is stopped by the rate limit with a clear refusal.
- **Public repo.** No user's email, id or data appears in a fixture, a log or a built file. Fixtures use `TEST01`.

## 10. Dependencies

- `supabase/migrations/` (new migrations for owner columns, composite keys, policies, backfill, `admins`, `user_profiles`, `user_documents`, task self close, `task_log` and `quotes` privacy, owner aware `queue_stay_details`, `submit_inbox`, `submit_task`, `ping_task_runner`, `sweep_task_runner`, the `bookings` bucket paths), `supabase/migrate.py`, `plugin/scripts/test_db_functions.py`.
- `supabase/functions/stay-rates/` and `supabase/functions/read-booking/`, which call `is_owner()` today and write with the service role.
- `latam_trip_mcp/oauth.py`, `server.py` (the one shared `Core` built on the secret key becomes one per request and user), `core.py`, `runner.py`, `infra/mcp/` (DynamoDB fields, IAM, and a KMS key only for the third way).
- Supabase Auth settings: custom SMTP, and the OAuth 2.1 server for the first way.
- `plugin/scripts/tripdb.py`, `tripdb_store.py`, `plugin/skills/trip-checklist/scripts/tasks.py`, the build worker in `infra/worker/`.
- `planner/` sign in and data loading. `web/` reads only the catalogue.
- `.github/workflows/` (new release workflow next to `site.yml`).
- Every skill and agent in `plugin/` that carries Simon's rules.
- Docs: `data/README.md`, `docs/claude-tasks.md`, `docs/task-runner.md`, `docs/product/product-overview.md`, `docs/technical/technical-decisions.md`, CLAUDE.md.
- Privacy: every private table above is owner only. The public `web` bucket gets catalogue data only.

## 11. Checks

- Tests: criteria 2, 3, 4, 5a, 6, 7, 8 and 10 as unit or migration tests. Criterion 5 as an RLS test matrix of every private table times four operations times two users. Criterion 9 as a workflow run.
- Live run: one full pass with a second test account, from install to delete, through every hop (connector, planner, task, self close), before the feature is called done. This follows the harness log lesson of 2026-11-06.
- Design: the sign in screen and the profile sheet get a roast through `ui-roast`.

## 12. Open questions

1. **Sign up.** Settled by Simon on 2026-11-07: open to anyone (PROD-009), because he wants people to just type their email and get in. Task 6.1 first shipped invite only on 2026-11-06, and migration 0038 opens it with the caps, the connector's write limit, confirm email and the stripped sign up password kept as guards. Blocker: Until Simon sets custom SMTP in Supabase, the built in mailer sends only to the addresses of the project's team, so a person outside it gets no link and cannot sign in yet. Setting it is Simon's step.
2. **Passphrase fallback.** Keep it for Simon or remove it. Simon decides.
3. **Per person built files.** Private bucket per owner, or computed on read by the planner. The implementer proposes, Simon decides.
4. **User research into the catalogue.** Whether a user's `place_research` or flight quotes may enter the shared catalogue, and who reviews them. Simon decides.
5. **Legal.** Terms and privacy note, and whether automated reads of Booking.com and Airbnb pages in a user's own browser are acceptable in a product that is marketed. Simon, with a lawyer.
6. **Quotes ownership.** Settled as private per owner (PROD-008, accepted), which changes the word quotes in PROD-007. Simon confirmed it on 2026-11-06.
7. **`read-booking`.** Settled by Simon on 2026-11-06: it stays, for every user, on latam-trip's own Claude API key, with a monthly cap of reads per owner enforced in the function and a clear refusal when the cap is reached. PROD-007 is amended to allow this one model call.
8. **Approval before a deploy.** Settled by Simon on 2026-11-06: no approval step on deploys. Every push to `main` tests, migrates and deploys by itself. Instead, a GitHub ruleset requires Simon's review for any change under `.github/`, the deploy role can deploy the connector stack and nothing else, and the connector's `kms:Decrypt` in `infra/mcp/template.yaml` is narrowed from every key to the one it needs.
9. **Browser tasks for other people.** `claim_task` gives only cloud types, and `trip-checklist` needs the repo and the secret key. Another person's `stay_details` or flight search task can then only close by the data trigger. Whether their Claude can claim browser tasks through the connector is for Simon.
10. **The morning rates run.** The build worker prices every place with a Hostelworld price each morning. For every user's places, or Simon's only, within the shared gate of 30 calls a minute. Simon decides.
11. **README safe defaults (task 6.4).** The spec and plan give the read only browser rules only as "documented in the README". The README takes them from `add-lodging` and `trip-checklist` (never book, reserve, pay, sign in, enter personal data, accept consent or solve a bot check) and adds, as a safe default, no form submits and no account or booking changes on a site. The plugin install steps use the marketplace in the repo (`/plugin marketplace add Olafcito/latam-trip`). Simon confirms the rules and the plugin being offered to outside people.
12. **Privacy note facts (task 6.4).** The draft note says nothing about the retention of the live data of an active account, the legal basis, the hosting regions beyond "the EU regions it is in today", or the name and address of the party responsible. Simon and the lawyer fill these in (open question 5).

## Build order

Each phase is shippable on its own and keeps Simon's flow working.

1. Release pipeline (section 7, Release pipeline). Everything after ships through it.
2. Owner columns, composite keys, backfill and per user RLS, with the RLS test matrix and the second owner in `test_public_data.py`. Simon is still the only user.
3. A spike of Supabase's OAuth 2.1 server with Claude, then the connector acts as the user by the way the spike picks. The secret key leaves the connector.
4. Tasks per owner and status that follows the data.
5. Profiles, and Simon's rules moved out of the plugin.
6. Open OAuth to new emails by the sign up rule, open since 2026-11-07 (PROD-009), plus export and delete.
7. Live run with a second test account.

Completeness: the outcome of the OAuth spike, the per owner caps and the confirmed list of personal `documents` names are thin and are settled in the plan.

## Review

Independent review of 2026-11-06, against the migrations up to `0024`, the connector, the edge functions, the worker and `site.yml`.

### What changed

- The table split. `quotes` moved from the catalogue to private (PROD-008, proposed), since a person's searches give their home airport and dates and Simon's quotes feed public built files. `documents` split into shared `documents` and a private `user_documents`. The service tables gained `site_calls`, `hostelworld_cities`, `task_runner` and `schema_migrations`, and `derive_state` got its own row because the planner reads it.
- The claim that anon reads the catalogue today was wrong. `0002_rls.sql` revokes every table grant from anon, and the map reads built files. Anon keeps only `submit_inbox` and `submit_task`, which now take the owner from the token.
- Catalogue writes go through `is_admin()` policies, with `owners` renamed `admins`, instead of the secret key. That and `delete_account` as a database function take the secret key out of the connector.
- Composite foreign keys for rooms and prices, owner aware keys and unique indexes (`trips`, `trips_latest`, `save_trip`, `tasks_stay_picks_once`, document names), owner folders in the `bookings` bucket, and owner aware security definer functions and triggers.
- "Acting as the user" now ranks Supabase's OAuth 2.1 server first, connector minted tokens second and a stored session last, with the reasons.
- OAuth hardening: a code that binds approval to the authorize page, uniform answers, per email limits, a client ttl, custom SMTP.
- Release pipeline hardening for a public repo. The build worker deploy moved later.
- New acceptance criteria 5a and the extended 2, 5, 8 and 9. Open questions 7 to 10. Non goal on server side reads reworded to match TECH-003 and TECH-004.

### What I would cut

- The profile sheet in the planner. Claude reads and writes the profile through two tools. The sheet, its roast and its DES work can wait for a person who asks for it.
- Status that follows the data. It fixes a problem that exists today with one user and needs none of the rest. It is a small feature of its own and could ship first, outside FEAT-006.
- The release pipeline as phase 1. It is the riskiest part for a public repo and does nothing for a second user. Tests on every push and a deploy of connector code only would be enough at first. Migrations could stay a deliberate step until the environment approval is decided.
- The write rate limit in the connector, once the database caps exist. It only covers one of two write paths.

### Security findings

1. **Sharing the planner's Supabase session would break both.** The spec stored "the person's Supabase session" from approve. Supabase refresh tokens are single use and reuse outside 10 seconds revokes the whole session, so the planner's next refresh would log the connector out, or the reverse. Lambda instances refreshing at the same time would trip the same rule. Fixed in the text by ranking the alternatives and requiring a separate session and a lock for the fallback.
2. **Storing refresh tokens adds a credential store without adding safety.** The connector Lambda held the secret key for service paths anyway, so a compromise of it already gave everything. Supabase's OAuth 2.1 server removes token storage and the KMS key. Minted tokens keep RLS on every request with no store. Both are better than the stored session.
3. **Another person's task would start Simon's routine.** `ping_task_runner` and `sweep_task_runner` in `0017` and `0018` fire Simon's routine for any open cloud task, on his token and his subscription. Fixed in the text.
4. **Cross owner clashes reveal and block.** Trip ids are name slugs and the key is `(id, version)`, so a second "Colombia" trip fails on the key and reveals that one exists. The same holds for `tasks_stay_picks_once` and document names, and an ignored duplicate upsert of a lodging id would silently save nothing. Fixed in the text.
5. **Foreign keys bypass RLS.** Without composite keys, user B can insert a room under user A's lodging, probe A's ids, and keep A's lodging from ever counting as complete for the self close trigger. Fixed in the text.
6. **The worker and the public bucket.** The worker pulls every row of `quotes`, `trips` and `task_log` with the secret key, `build_web_data.py` publishes `task_log`, the Options files come from all quotes, and `last_warning` can name trip ids that every signed in person can read. Fixed in the text, with a second owner in `test_public_data.py` as the proof.
7. **`stay-rates` crosses owners.** It finds a stored place by Hostelworld id across all lodgings with the service role, so a pasted link could answer "already at another stop" about someone else's place or price into their rows. Fixed in the text.
8. **Consent phishing.** With typed emails, anyone can start a flow and send a real allow link to someone else. Approval on another device is a feature, so a code from the authorize page is the guard. Fixed in the text.
9. **The global try counter** in `oauth.py` locks everyone out after five tries by anyone. Fixed in the text.
10. **The release pipeline.** CLAUDE.md lets every Claude session push to `main` without asking, and a push would deploy and migrate. A session working from a page it read could change the workflow and print the database password. The environment rules, exact OIDC trust and code only role narrow it. Only an approval step closes it (open question 8). The existing `site.yml` role trust could not be checked from the repo and should be checked for the same exact match.
11. **Private split.** Lodgings, tasks and the person's documents private is right. Lodgings could later share the facts of a hostel (photos, rooms) across people with private prices, notes and hidden, but that is an optimisation, not a fix.

### Questions only Simon can answer

- Open questions 1, 2, 4, 5, 7, 8, 9 and 10.
- Whether quotes private per owner is right (6 and PROD-008), and whether his own crawled quotes should keep reaching the public Options pane.
- Whether FEAT-006 waits for the OAuth spike, or the plan starts with the data layer while the spike runs.
