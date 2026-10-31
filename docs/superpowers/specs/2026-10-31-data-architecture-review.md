# ADR: Data architecture for the latam-trip move to Supabase

**Status:** Accepted in part on 31 Oct 2026. Kept as the record of why the schema looks the way it does. [The spec](2026-10-30-supabase-design.md) is the design to build, and it wins where the two differ.

Changed since this review was written:

- Simon wants GitHub out of the data path, so the GitHub Action derive, `pg_cron`, `pg_net`, Vault and the GitHub backup are all replaced by one Python AWS Lambda that polls Supabase. See spec section 7.
- The worker uses a 60 second quiet period and a 5 minute gap, not 2 and 10 minutes.
- `profiles` has the primary key `(place_id, kind)`, not `place_id`, as 38 of 80 places have both kinds. The table below is wrong on this.
- `stays` also has `property_id`.
- A recount gave 3,625 distinct quotes and 28 split keys, against 3,626 and 24 here. The import test settles the exact numbers.
- Line numbers of the spec cited below refer to the version of 31 Oct 2026 before it was rewritten.

**Date:** 31 Oct 2026

**Scope:** `docs/superpowers/specs/2026-10-30-supabase-design.md` with its uncommitted edits, read against `data/sources`, `data/web`, `plugin/scripts/tripdb.py` and the pipeline. Numbers come from my own scripts over the JSONL and JSON files. I did not open `data/built/trip.db`, `.env` or any database. Anything marked "estimate" was not measured.

## Answer to the question

**Half yes.**

Yes, the row model in the spec is the wrong one. It is not a database design. It is the JSONL files stored in Postgres, with their workarounds carried across: no unique keys, later row wins, check then insert, a lease in place of constraints. In an empty project that costs nothing to fix.

No, the data is not a vibe coded mess, and a fully relational model would be a mistake. There are 0 orphans in 1,604 place references and no field with mixed types in any table. The one writer design worked.

The most important correction: **a better schema does not remove the rebuild.** About 80 percent of the built bytes hold real logic. The rebuild goes away by triggering it automatically, and that is independent of the row shape.

Vibe coding is a fair description of a specific set of things, listed below. What it left behind is missing identities and scattered reference data, not bad rows.

| Fair to call vibe coded | Evidence |
|---|---|
| Identities were never designed | Three different quote identities give 3,594, 3,582 and 3,626 distinct quotes on the same 3,785 rows. Way ids are a counter (`inout.py:176`) |
| Airports were never made an entity | 82 of 100 via airports and 14 of 39 requested airports are not in `places`. Their facts sit in at least seven Python constants: `HUB_META`, `TZ`, `US`, `EU_AIRPORTS`, `LONG_HAUL`, `EU`, `CONTEXT_AIRPORTS` |
| Copies drift | The EU sets disagree on VLC and RMU. `REG` in `itineraries.py:31` differs from `route_regions` in `trip.json`. Pick logic is duplicated in `dashboard_data.py:96` to `134` |
| Place id and airport code were blurred | 37 place ids equal their IATA code, 19 places have an IATA different from their id, 6 airports are shared by 17 places, and 4 three letter ids (TEQ, COR, TUP, PCM) are not airports at all |

| Not vibe coded, and worth keeping | Evidence |
|---|---|
| Referential discipline | 0 orphans: connection ends 500, profiles 123, images 67, experience places 463, stays 35, list items 23, trip nodes 139, hop ends 254 |
| Field discipline | 0 mixed types in any field of any table. Most core fields are 100 percent filled |
| Trips as versioned documents | 68 hops, 34 inline flights, all 34 agree with their quote on price and time |
| Built files for the apps | Open costs 505 KB gzip for planner plus route data, and nothing at all once cached |

## Context

One user, Supabase free plan, Postgres 17, project empty, departure 2 Dec 2026, about 4.5 weeks left. Agents write through a standard library Python CLI, so through REST and not the pooler (spec line 70). That means the measured 36 ms pooler insert is not what agents will see. The measured 40 to 90 ms per HTTPS call is the relevant figure.

### Size and shape

| Fact | Number |
|---|---|
| Quotes | 3,785 rows, three days of crawling (28 to 30 Oct) |
| Built output | 5,467,465 bytes in `data/web` |
| Pipeline | 8 scripts, 1,779 lines, plus `tripdb.py` at 1,277 lines |
| Filters used by the pipeline | Top level fields only. No query filters on anything inside a leg |

### What the built files are, by bytes

| Class | Files | Bytes | Share |
|---|---|---|---|
| Direct | `trip`, `bag_rules`, `lists`, `trips`, `task_log`, `meta`, `experience_categories`, `countries` | 94,487 | 1.7% |
| Join with small logic | `experiences` (20 of 23 fields identical in all 504 rows) | 998,414 | 18.3% |
| Aggregates with logic | `places`, `connections`, `map`, `flights`, `pair_dates`, `dash_flights` | 2,084,523 | 38.1% |
| True computation | `inout`, `dash_trips`, `dash_journeys` | 2,290,041 | 41.9% |

`inout.py` also needs `map.json` as input. So turning `places` or `connections` into views would remove no pipeline code until the whole chain is ported.

### What hurts this owner, ranked

| Rank | Problem | Where | Depends on the schema? |
|---|---|---|---|
| 1 | The rebuild stays manual. `tripdb build` keeps its five steps and someone must run it | Spec lines 234 to 240 | No |
| 2 | Agents cannot query well. See below | Spec lines 93, 104 to 110, 172, 261 | Yes |
| 3 | Way ids change with each build, and automatic builds make that much worse. Saved journeys and the draft hold only ids | Spec lines 58, 218, 333, `inout.py:176` | No |
| 4 | Quote identity is unsettled and the id that trips use is not stored | `quote_key` in `tripdb.py:383`, `qid` in `ingest.py:130` | Yes |
| 5 | No airports entity | Constants above | Yes |
| 6 | Airline spellings. 176 spellings, and unknown checked bag fees show on 154 of 291 options | `chains.py:40` to `44` | No |
| 7 | Hard coded sets drift | Constants above | Partly |

**Rank 2 in detail.** The owner wants agents to query. Under the spec:

- `tripdb query places --eq row_id=LPB` returns two rows that disagree: "La Paz / El Alto" as a hub at lon -68.15, and "La Paz" as a city at lon -68.12. There are 15 such superseded rows, 10 in places and 5 in profiles. Line 172 offers views only for `trips_latest` and `quote_keys`, so the caller must know the later row wins.
- `quotes` has `agent`, `key` and `observed_at` as columns. Route, date and price are only inside `data`. The real query in `trip-checklist` line 27 finds the last seen time for the tickets of the top 10 trips, and that needs a join the table cannot do, because `qid` is computed during the build and never stored. All 58 references in trips use `qid`.

**Rank 3 in detail.** Today a build happens when someone runs it. With automatic builds it could be dozens of times a day, and each can renumber ways. Line 333 already plans a holding row, `unresolved_journeys`, for journeys whose ids stopped resolving. The fix is small, and must land before automatic builds do. All 916 ways have distinct content, so a hash of the key at `inout.py:172` works as a stable id. `WAYS` is a dict keyed by id and I found no frontend code that parses the id format.

**Rank 4 in detail.** Here are the three identities on the same rows:

| Identity | Distinct | Problem |
|---|---|---|
| `quote_key` (source, legs, times, carriers, price) | 3,594 | Ignores flight numbers. 24 keys hold two different filled flight lists, for example AA57 against AA6958 |
| `qid` (flights, via, dates, price) | 3,582 | Often has empty flights, so 33 qids fold different times, hiding 42 real itineraries from the build. All at equal price, so the cheapest totals are safe. The harm is a hidden departure time: 1 of 502 tickets and 19 of 300 dash flights sit on a folded qid, and 0 of 26 trip refs do |
| `quote_key` plus flight lists | 3,626 | Every class maps to exactly one `qid`, so it can replace both safely |

Repeats are not history. All 182 repeat groups are same day sightings, 0 across days, and no code reads them as history. One row with `first_seen`, `last_seen` and `seen_count` loses nothing in use, and is what `ingest.py:144` to `150` does anyway.

**Rank 6, kept in proportion.** I expected this to be a ranking bug and it is not. Measured leg by leg, with my recomputation matching the stored cabin fee on 502 of 502 tickets, an alias map changes the cabin fee on 2 tickets, moves 0 option totals, and leaves the cheapest 10 unchanged. Checked fees are excluded from totals by design. What it does change is unknown checked fees, from 122 tickets to 38.

**Agent write speed is not a problem under any option.** See the costs under Decision.

## Decision

Two separate decisions.

**1. Adopt option C: typed core, jsonb at the leaves.** Real columns and real keys for everything with identity or that anyone filters on. jsonb for flight legs, trip bodies and other nested content. One `extra jsonb` on each table so open schemas never lose a field.

**2. Keep the pipeline in Python and files, and trigger it automatically.** A write to a source table marks data dirty. After a quiet period the database starts a GitHub Action that runs `tripdb build`. No logic moves to SQL.

The spec's other decisions stand: Realtime, `save_trip`, built files in a public bucket, the browser cache, one writer, tasks, sign in.

### Tables

"Today's identity" comes from `data/README.md`. Every table gets `extra jsonb` except where noted, and row level security with `is_owner()`.

| Table | Key | Foreign keys | Typed columns | jsonb |
|---|---|---|---|---|
| `places` | `id` text pk | `airport_code` to `airports`, nullable | `name`, `country`, `lat`, `lon`, `type`, `popularity`, `why`, `source`, `origin`, `updated_at` | `extra` |
| `airports` | `code` text pk | | `name`, `city`, `country`, `lat`, `lon`. Rows may be stubs with only a code | |
| `connections` | `id` identity pk, unique `(from_id, to_id, mode, operator)` with `nulls not distinct` | `from_id`, `to_id` to `places` | `duration_h`, `price_dkk`, `frequency`, `overnight`, `border`, `both_ways`, `source`, `source_year`, `notes`, `origin` | `duration_range`, `price_range_local` in `extra` |
| `profiles` | `place_id` text pk | to `places` | `checked_at`, `tagline`, `summary`, `touristy`, `origin` | `things_to_do`, `hostels`, `sources`, `extra` |
| `place_images` | `place_id` text pk | to `places` | `origin` | `image` |
| `experiences` | `id` text pk | | `name`, `category`, `country`, `lat`, `lon`, `area`, `summary`, `season`, `dec_jan`, `price`, `price_dkk`, `duration`, `requirements`, `researched`, `checked_at`, `tags text[]`, `places text[]` | `details`, `sources`, `extra` |
| `experience_images` | `id` text pk | none, see below | | `image` |
| `stays` | `id` identity pk, unique `(place_id, site, name, room, check_in, check_out)` | `place_id` to `places` | `type`, `dkk_per_night`, `nights`, `rating`, `reviews`, `url`, `observed_at`, `task_id`, `notes` | `extra` |
| `quotes` | `seq` identity pk, `quote_id` text unique not null | `first_from`, `first_to`, `last_from`, `last_to` to `airports` | `build_qid`, `agent`, `task_id`, `source`, `structure` with check, `first_seen`, `last_seen`, `seen_count`, `first_date`, `last_date`, `price`, `currency`, `price_dkk`, `tickets`, `self_transfer`, `us_transit`, `out_hours`, `home_hours`, `usable`, `flags text[]`, `fare_brand`, `cabin_bag`, `checked_bag`, `changeable`, `link`, `notes` | `legs_requested`, `out`, `mid`, `home`, `extra` |
| `trips` | `(id, version)` | | As spec | `data`, as spec |
| `documents`, `tasks`, `inbox`, `agent_usage`, `task_log`, `owners` | As spec | | As spec | As spec |
| `leases` | `name` | | One row only, `build`. Writers no longer use it | |
| `derive_state` | Single row | | `dirty_at`, `last_started`, `last_finished`, `last_error`, `manifest_hash` | |
| `derived_options` | `id` text pk | | `rank`, `total_dkk`, `way_in`, `way_home`, `build_at` | `data` |

Why each awkward call went the way it did:

- **Trips stay jsonb.** A trip is a saved document with versions. Reading it whole is the only use. Relational stops would add work for no query anyone runs.
- **Legs stay jsonb.** No code filters inside a leg. All pipeline scripts read `raw` and work in Python. A leg table also needs a key, and flights have none: only 6 of 1,899 one way flight lists appear on more than one source, because of spelling, and 871 of 5,330 leg occurrences have no flight numbers.
- **No GIN index, partitioning or partial indexes.** Nothing needs them at 3,626 rows (`advanced-jsonb-indexing`, `query-partial-indexes`, `schema-partitioning`). Keep the two composite indexes on first and last leg with date. Honestly a scan of this table is also fine.
- **`places text[]` on experiences, no junction table.** Only 2 rows have more than one place. The check at `tripdb.py:574` is already a hard error, with 0 orphans in 463 references. A junction would turn `update-experience` into a two table write. This is a deliberate departure from normal form.
- **`quotes.seq` as primary key, `quote_id` as unique.** This follows `schema-primary-keys` and keeps pull order. An upsert leaves `seq` alone on the first row, so `ingest.py` still keeps the first row of a qid.
- **`dep` and `arr` stay as strings in jsonb.** They are local clock times, so `timestamptz` would be wrong for them. This is a deliberate exception to `schema-data-types`. `first_seen` and `last_seen` do use `timestamptz`.
- **`usable` is written by tripdb** using the rule in `ingest.py:136` to `141`, so the rule has one definition. A SQL view would make a second one.
- **`from_id`, `to_id`, `both_ways`** avoid reserved words (`schema-lowercase-identifiers`). The store layer maps them back to `from`, `to`, `both`.
- **`experience_images` has no foreign key,** because 11 of 25 ids are `cat-*` category images. Splitting them is not worth doing now.
- **`airports` stubs.** `add_quotes` inserts unknown codes with `on conflict do nothing`, so a new airport never blocks a crawl. Via airports stay in jsonb and get no foreign key.
- **`airports` holds no flags yet.** Adding `is_us` or `utc_offset` while the Python constants are still read would create the second home the owner wants to avoid. Add each column on the day its constant is deleted.

### How each read is served, with no manual rebuild

| Reader | Data | Served by | Delay after a write |
|---|---|---|---|
| Planner, all browsers | Trips | `trips_latest`, Realtime, as spec | Seconds |
| Planner, `web` | Tasks | `tasks`, Realtime, as spec | Seconds |
| Planner, `web` | `inout`, `map`, `places`, `connections`, `experiences`, `flights`, `pair_dates`, `dash_*`, `trip`, `bag_rules`, `lists` | Bucket by hash through the cache in 6.3. Add Realtime on `derive_state` so an open app swaps files without waiting for focus | Quiet period plus a run. Estimate 1 to 3 minutes, not measured |
| Agents | Places, profiles, experiences, stays, connections | `tripdb query`, one row per identity | Immediate |
| Agents | Quotes by route, date, price, usable | `tripdb query quotes`. Add `--in` next to `--eq`, so a trip's `build_qid` list can be looked up in one call | Immediate |
| Agents | Ranked options | `tripdb query derived_options`. Do not make agents print the 1.8 MB `inout.json` | Same as built files |
| Ask Claude | The trip on screen | `trips` by id and version, as spec | Immediate |

Loading speed is not affected by this. Planner open is 2,757,744 bytes raw and 238,602 gzip. Route data adds 1,944,196 raw and 266,689 gzip. A file on a CDN by hash beats running joins per open, and a cached open needs no network. Do not replace it with row reads.

### The automatic derive

| Part | What it does |
|---|---|
| Statement trigger on `quotes`, `places`, `connections`, `profiles`, `place_images`, `experiences`, `experience_images`, `stays`, `documents` | Sets `derive_state.dirty_at`. Not on `trips` or `tasks`, as those read directly |
| `pg_cron` each minute, with `pg_net` | If dirty, quiet for 2 minutes, and at least 10 minutes since the last start, sends `repository_dispatch` to GitHub. Token kept in Vault, scoped to this repo |
| `.github/workflows/derive.yml` | Runs unchanged `tripdb build` from spec section 7 with `concurrency` set to one. Free, as the repo is public |
| End of run | Writes `derive_state`, loads `derived_options`. If `dirty_at` is newer than the start, the next minute's check starts another run |
| Failure | `tripdb check` stops the run and old files stay live. `last_error` shows as a strip in the app. Without this, a refused row would stop updates silently |

The 10 minute gap matters for egress. Each run pulls about 5 MB (spec line 373). At 5 GB a month that is about 1,000 runs, or 33 a day, shared with app loads. During a crawl a short gap could spend that.

If `pg_cron` or `pg_net` is not available, the fallback is a scheduled Action every 5 minutes that reads `derive_state`. GitHub may delay these runs.

Alternatives for running the logic:

| Way | Verdict |
|---|---|
| Port to SQL views and functions | No. `chains`, `inout` and `itineraries` are 759 lines of search and scoring, and it would be a second implementation weeks before departure |
| Edge Function | No. It has no Python, so it is the same port |
| Writer runs the build at the end of a round | No. Depends on every agent remembering, and needs a working pipeline in every environment |
| GitHub Action on a dirty marker | **Yes.** No code ported, one path, covers every writer |
| Python Lambda on Simon's AWS | Faster, but a second cloud to run. Only if the Action delay proves unacceptable |

### True computations

They stay in Python, unchanged, in `chains.py`, `inout.py`, `itineraries.py`, `dashboard_data.py`. `tripdb pull` reconstructs the same JSONL, so the pipeline cannot tell the source changed. Spec section 14 is right to keep them out.

### How agents write, and what it costs

`add-quotes` becomes one call to a function `add_quotes(rows jsonb)`, with `quote_id`, `build_qid` and `usable` computed by Python first:

`insert ... on conflict (quote_id) do update set last_seen = greatest(quotes.last_seen, excluded.last_seen), seen_count = quotes.seen_count + 1`

A plain REST upsert cannot do this, as it only overwrites. Other tables use REST upsert with `on_conflict`, either ignoring duplicates or, with `--replace`, merging (`data-upsert`, `data-batch-inserts`).

| Step for 14 quotes | Spec | Option C |
|---|---|---|
| REST calls | 7: lease, 4 pages of `quote_keys`, insert, release | 1 |
| Data read | About 3,600 keys, about 600 KB, median key 135 bytes | None |
| Estimated time | 0.3 to 0.7 s | About 0.1 s |
| Two writers at once | Safe only through the lease | Safe from the unique constraint |

Both figures are estimates from the measured 40 to 90 ms. Neither is slow for a crawl that takes minutes, so **speed is not the reason to choose C.** The reason is that `lock-advisory` and `data-upsert` make the check then insert and the lease unnecessary, so that code never gets written.

Duplicate reads should be avoided by design elsewhere too: `tripdb query` with `--in` covers the trip lookup in one call (`data-n-plus-one`).

### How much code changes

| File | Change | Size |
|---|---|---|
| `supabase/migrations/` | DDL for C in place of the spec's DDL, plus trigger, cron and `add_quotes` | Same order as the spec, about 200 lines more (estimate) |
| `plugin/scripts/tripdb.py` | Store layer as spec. Add a table of column maps with `extra` handling. Rows with absent fields read back without nulls. `quote_key` at 383 adds flights. `cmd_add_quotes` at 425 and `_add_rows` at 490 go to upsert in `SupabaseStore`. `quote_keys` and `known_quotes` are not ported. Add `--in` | About 150 lines more than the spec, and some less (estimate) |
| `ingest.py` | Lines 53 to 75 and 130 to 141 become importable, so tripdb computes `build_qid` and `usable` the same way. `qid` itself unchanged | Small |
| `inout.py` | Line 176 uses a hash of the key at line 172 | 3 lines |
| `chains.py`, `bag_rules.json` | Alias lookup at lines 40 to 44, aliases in the document. No table, as only the build reads it | About 5 lines plus about 176 aliases |
| `.github/workflows/derive.yml` | New | About 30 lines |
| Planner | As spec, plus a Realtime subscribe on `derive_state` and the error strip | Small |
| Other pipeline scripts | None | 0 |

## Options considered

Effort figures are my estimates and were not measured.

### A. Key columns plus jsonb, as written

- **Complexity:** Low to build. Moderate later, as every reader must know the later row rule.
- **Cost:** Base plan. Free plan fits.
- **Fit for 4.5 weeks:** Good on paper. It does not meet "agents get data by querying", so it ships a known gap.
- **Pros:** Exact round trip with no column mapping. Fastest to start. Tolerates any new field.
- **Cons:** Stale rows returned by query. No filter on route, date or price without jsonb paths, and `--eq` is not specified for those. Needs lease, `quote_keys` and check then insert. Enforces nothing (`schema-constraints`). Spends the empty project on a design that needs migrating.

### A plus. As written, with patches

Add a latest row view per table, add `qid`, route and date columns to `quotes`.

- **Complexity:** Low, but the workarounds stay.
- **Cost:** About half a day more.
- **Fit:** Very good. **This is the fallback.**
- **Pros:** Fixes rank 2. Keeps the exact round trip.
- **Cons:** Keeps the lease, the repeats and `kind`. The database still enforces no identity. More views to keep in step.

### B. Fully relational

Tables for legs, flights, carriers, trip stops and tickets.

- **Complexity:** High. All 8 pipeline scripts read nested `raw` and would need the JSON put back together.
- **Cost:** About 3 weeks more, on 4.5 weeks that must also hold the trip planning itself.
- **Fit:** Poor.
- **Pros:** Textbook integrity. Leg level queries.
- **Cons:** No reliable key for flights. 0 queries need legs. The only saving is a little storage on a 500 MB plan at about 5 MB of sources. A rewrite risk with no user visible gain.

### C. Typed core, jsonb at the leaves (chosen)

- **Complexity:** Moderate, mostly one column map and null handling.
- **Cost:** About 2 days more than A, partly returned by code not written.
- **Fit:** Good, if decided before phase 1, while the project is empty.
- **Pros:** Query returns one true row. The database enforces identity. No lease on writes. Route and date filters work. The data's stable shape suits it: places 11 of 12 fields at 100 percent, quotes 12 of 23 at 100 percent and none under 39.
- **Cons:** Round trip is no longer exact. Absent and null merge, and 172 short `observed_at` values gain seconds, so `at` in `pair_dates` changes format. Foreign keys can refuse a row that today is only a note. The first run will find such cases.

## Trade-off analysis

**C against A.** The spec chose jsonb for one honest reason: "the whole original row" makes the round trip trivial. That reason is real for a migration, and it lasts about a week. The cost lasts for the life of the data. The usual argument for jsonb is that the shape is unknown, and the numbers say it is known: no mixed types, stable scalar fields. Open schemas are the remaining risk, and `extra` covers that.

**C against B.** Normalization pays when things get queried, shared or updated in pieces. Legs are none of those. Key plus jsonb is the right shape in this design too, for `derived_options`, a disposable table of computed rows.

**The golden compare is what makes C safe.** The spec already plans a build compare (section 13). `data/web` from `pull` against today's output must match, and each difference must be explained. Expected: `at` format, and the row count falling from 3,785 to 3,626. If it passes, the pipeline is proven unchanged whatever the schema.

**Fallback rule.** If the round trip for C is not green by 8 Nov, keep `quotes` and `places` as in C and use A plus for the rest. Those two tables carry nearly all the benefit.

## Consequences

**Easier:** Agents get true rows by query. Writes are one call and safe at once. New data reaches the app with nobody running anything. Way ids survive builds. The data has one definition of a quote.

**Harder:** The round trip needs normalising. A new field goes to `extra` until someone adds a column. Connection writes must follow place writes. An automatic build can fail unattended, so the error strip is required, not optional.

**Accepted:** App data lags writes by a few minutes, except trips and tasks. Reference constants stay in Python for now. `qid` remains flawed as a build id, because changing it would rename ways and tickets once. It can be fixed later in one planned step.

**Not worth doing before 2 Dec:**

- Porting any logic to SQL or Edge Functions.
- Normalising legs, flights or trips.
- Replacing built file delivery with rows.
- GIN indexes, partitions, a junction for experiences.
- Fixing qid, unless a hidden flight time actually matters.
- An airline table.
- Validating node ids inside `save_trip`. `tripdb check` reports them, and there are 0 orphans in 139.

**Out of this review but worth saying:** the app runs only on this PC until a hosted copy exists (spec line 403). "Same data in every browser" gives little during the trip without it.

## Action items

Before phase 1:

1. [ ] Decide C, and the fallback rule.
2. [ ] Update spec sections 3, 4.1, 4.2, 5 and 7. Fix stale numbers: line 53 says 175 keys and 181 rows, and today it is 182 and 191. Line 206 says 5.3 MB, and it is 5.47 MB.
3. [ ] Add to phase 0: `pg_cron`, `pg_net` and Vault on the free plan, Action start latency, and whether Storage serves gzip.
4. [ ] Add `(select is_owner())` in policies (`security-rls-performance`). Revoke default execute on `add_quotes` from `public` and `anon` (`security-rls-basics`).

Can land now, on today's files, ahead of the move:

5. [ ] Stable way ids at `inout.py:176`. Must come before automatic builds.
6. [ ] Airline aliases in `bag_rules.json`, lookup in `chains.py`.

During the phases:

7. [ ] Phase 1: DDL for C, `add_quotes`, `import`, `pull`, the golden compare.
8. [ ] Phase 2: column maps, upserts, `tripdb query --in`, `build_qid` and `usable`.
9. [ ] Phase 4: `derive.yml`, trigger, cron, `derive_state`, error strip, then `derived_options`.
10. [ ] After cutover, one at a time with the golden compare: move each airport constant to `airports` and resolve VLC and RMU.

## Not verified

- `pg_cron`, `pg_net` and Vault on the free plan. The Action fallback exists if not.
- End to end derive latency. The 1 to 3 minute figure is an estimate. Local `tripdb build` is 2.8 s, the rest is GitHub.
- Whether Storage serves gzip. The gzip figures above are computed, not observed.
- Golden equality from `pull` under C. Not run, as it needs a database.
- REST call counts and write times are estimates from the measured call time.
- Effort figures.
- How many journeys in browsers already have dead way ids. They live in `localStorage`.
- The airline alias map is mine. Bag effects are only as good as that map.

## Supabase rules cited

`schema-constraints`, `schema-primary-keys`, `schema-data-types`, `schema-lowercase-identifiers`, `schema-partitioning`, `data-upsert`, `data-batch-inserts`, `data-n-plus-one`, `lock-advisory`, `advanced-jsonb-indexing`, `query-partial-indexes`, `security-rls-basics`, `security-rls-performance`. Read as reference text only.
