# Hostelworld live rates implementation plan

> **For agentic workers:** This plan is run under the "Running a build" workflow in CLAUDE.md, in batches, each task its own commit.

**Goal:** Opening a place with a Hostelworld link prices its rooms for the dates within a few seconds, a pasted link adds a place, and the worker keeps the prices a day old at most (FEAT-002).

**Architecture:** Three batches. Batch A is the data side: migration 0019, the `tripdb` schemas, the `stayRates` library in the planner and the `stay-rates` edge function. Batch B is the UI: the live fetch on open, the age, left and free cancellation marks, the link row. Batch C is the worker's morning refresh. A and C run in the main session, B on an Opus implementer, in parallel.

**Tech Stack:** Supabase edge function on Deno with `supabase-js`, the Hostelworld legacy API JSON, React 18 and zustand in the planner, Python 3.12 in the Lambda worker.

**Spec:** `docs/product/features/FEAT-002-hostelworld-live-rates.md`. Decisions: TECH-003.

## Global Constraints

- The lodgings tables stay owner only. The function writes with the service role and checks the caller itself.
- Nothing of a price, a name or a reference reaches a built file, a commit, a doc or a test fixture. Fixtures use `TEST01`.
- No question marks and no prose recap lines in the UI. Plain sentences in docs, no semicolons as separators, no em or en dashes.
- Stage explicit paths only. Shots go to `docs/design/shots/live-rates/2026-11-05/` (git ignored).
- Commit identity `git -c user.name=Claude -c user.email=noreply@anthropic.com`, messages end `Co-Authored-By: Claude Fable 5.1 <noreply@anthropic.com>`.

## Batch A, data

- [x] Task 1. `planner/src/lib/stayRates.ts` with `hostelworldId`, `liveLink`, `fetchRates` (one call per place and dates per ten minutes), `addFromLink`, and the new type fields `site`, `site_id`, `photo` on rooms and `available` on prices, with the fixtures updated. Test `stayRates.test.ts`.
- [x] Task 2. Migration `0019_lodging_live_rates.sql`, the `LODGING_ROOM` and `LODGING_PRICE` schemas in `tripdb.py`, the connector's price check for `available`, the schema test fixtures.
- [x] Task 3. `supabase/functions/stay-rates/index.ts` and its README: owner or worker key, a place from a link, rooms matched by site id then name, one price per room, the fresh window.

## Batch B, UI (Opus)

- [x] Task 4. `useLiveRates` hook, the live dot while asking, the failure mark on the rooms section.
- [x] Task 5. Room marks from `roomMarks`: age, left, free cancellation. `AddStay` resolves the open place by id so the realtime reload shows.
- [x] Task 6. The link row on Find & add, `onLink` through `StaySearch` to `StopFold`, the new place opens.
- [x] Task 7. Styles in `acc.css`, phone first.

## Batch C, worker

- [x] Task 8. `infra/worker/rates.py` with `wanted` and `refresh`, the `rates` action in `handler.py`, the 05:00 UTC schedule in `deploy.sh`, test `test_rates.py`.

## Fix round

The code review found one must fix (the planner read at most 1000 prices) and seven should fixes, all built in 468f513 to 24cc43e. The roast's accepted points are in b46ad64. The spec's Outcome section has the rest.

## Review Focus

- The function's fresh check joins `lodging_prices` to `lodging_rooms` by the room. A place with rooms from two sites must not count a Booking.com price as fresh.
- A room matched by name gets its `site_id` written, so the next read matches by id even if Hostelworld renames it.
- `fetchRates` drops a failed call from its memory, so the next open tries again.
- The worker forces the fetch with `fresh_minutes` 0 and never reads Hostelworld itself.
