# Supabase migration takeover

Date: 1 Nov 2026
Branch: `supabase-migration`
Base commit: `45b1f09`

## Repository state

The branch was synced with `origin/supabase-migration` at the start of the takeover. The tracked tree was clean. Two pre-existing untracked paths were present: `.claude/settings.local.json` and `Microsoft/`. They were preserved. No cutover, merge to `main`, or deployment to the site bucket root occurred.

The migration plan labels Task 27 as the cutover and requires an explicit yes before running it. Task 27 remains untouched. The permitted preview deployment was attempted after the fix, but AWS denied `cloudfront:ListDistributions` before any upload. The bucket was not changed.

## Claude handoff

The available Claude scratchpad contains E2E scripts `s00.js` through `s09.js`, screenshots, and `final-review.md`. The latest task transcript and an `e2e-report.md` were not available. The final review was static only, ran no tests, and reported 3 critical, 10 important, and 17 minor findings at the time it was written. Later branch commits may have changed those findings, so they need current verification before being treated as open bugs.

The interrupted E2E run stopped when its agent hit a weekly API limit. It had signed in a phone and desktop browser, created clearly named E2E trips, and begun checks. The exact original 14-item checklist was not present in the available files. This report records observed results and leaves checks without evidence marked open.

## E2E evidence

| Area | Result |
|---|---|
| Sign in and redirect handling | Passed on phone and desktop. Allowed preview redirect was accepted. |
| Trip list consistency | Passed. Phone and desktop lists matched the `trips_latest` rows. |
| Offline save and retry | Passed on an E2E trip. One queued save became one new version after reconnect and the outbox cleared. |
| No-op save | Passed. An unchanged trip stayed saved and did not add a version. |
| Version history and selection | Passed in the existing trip view. Older version contents matched, URL selection updated, and Latest returned to the latest row. |
| Save an older version | Passed on an E2E trip. Saving the selected older content created one new version. |
| Signed-out row security | Passed. The publishable key could not read trips or call `add_quotes`. |
| Local storage separation | Passed with valid legacy storage fixtures. The preview left the legacy app keys unchanged. |
| Small screen layout samples | Lists, map, dashboard, and version history showed no horizontal overflow or visible question marks in the captured checks. |
| Deep link to an older version after a fresh load | Failed against the hosted preview. Opening a trip synchronously updated the address and removed `v` before the handler read it. A regression test reproduced the failure. The fix now captures `v` before opening the trip. The regression test passes, and a local production build opened v3 of 6 from a fresh URL with no page errors. The hosted preview still needs this fix deployed and retested. |
| Data bucket refresh and map edit round trip | Not verified in the surviving E2E artifacts. |
| Ask Claude task insert and result display | Not verified. The tasks table was empty during the baseline query. |
| Live `tripdb` write and browser Realtime update | Not verified by this takeover. Existing two-browser E2E evidence did show cross-window trip sync. |
| MCP connector round trip | Not verified. The Codex session has no connected Latam Trip MCP tool. |

The scratchpad also includes a new-trip picker attempt that used the wrong navigation path. It did not establish a product failure. A malformed local-storage fixture also caused a test-only error and passed when retried with a valid array fixture.

## Code change and regression test

`planner/src/App.tsx` now reads the requested version before `openTrip` can notify the URL subscriber. A new test in `planner/src/App.deepLink.test.ts` covers the synchronous subscriber case.

The regression test failed before the behavior change because version 2 did not open. After the change, it passed and the URL retained `v=2`.

## Verification

| Check | Result |
|---|---|
| Planner TypeScript check | Passed with `npm run typecheck`. |
| Planner tests | Passed, 305 tests across 35 files. |
| Web TypeScript check | Passed with `npm run typecheck`. |
| Web tests | Passed, 218 tests across 16 files. |
| tripdb Python suite | Passed, 146 tests, 29 skipped because live tests were not enabled. |
| Worker suite | Passed, 37 tests. Python emitted existing ResourceWarnings for unclosed files in tests. |
| Trip checklist task suite | Passed, 5 tests. Python emitted existing ResourceWarnings in `tasks.py`. |
| MCP Python suite | Passed, 28 tests. |
| Local production build | Passed. Vite reported the existing large chunk warning. |
| Preview deployment | Blocked before upload because the available AWS identity lacks `cloudfront:ListDistributions`. |

The first worker test invocation used a module import form that failed to locate `infra`. Rerunning with unittest discovery rooted at `infra/worker` passed.

## Skills and next actions

The migration plan names `superpowers:executing-plans` or `superpowers:subagent-driven-development`. Neither skill is present in the active Codex skill catalog. The project UI design skills were not applied because this change does not alter the interface. No skill installation or UI work was done.

Remaining work is to deploy the build to the existing preview prefix with an AWS identity that can list or invalidate the distribution, then repeat the fresh version deep link check. Verify the data bucket and map round trip, task insertion and result display, live `tripdb` save and Realtime, and MCP connector round trip. Clean up only records confirmed to be E2E fixtures. Keep Task 27 and the site bucket root untouched.
