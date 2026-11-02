# Supabase migration takeover

Date: 1 Nov 2026
Branch: `supabase-migration`
Base commit: `45b1f09`

## Repository state

The branch was synced with `origin/supabase-migration` at the start of the takeover. The tracked tree was clean. Two pre-existing untracked paths were present: `.claude/settings.local.json` and `Microsoft/`. They were preserved. No cutover, merge to `main`, or deployment to the site bucket root occurred.

The migration plan labels Task 27 as the cutover and requires an explicit yes before running it. Task 27 remains untouched. An initial preview attempt used a restricted AWS profile and stopped before upload. A second configured profile successfully deployed the build to the existing `preview/` prefix and invalidated only `/preview/*`.

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
| Deep link to an older version after a fresh load | Failed against the old hosted preview and reproduced in a regression test. The fix captures `v` before opening the trip. After deployment, a fresh phone browser URL opened v3 of 6, retained `v=3`, had no horizontal overflow or question marks, and produced no page errors. |
| Data bucket reads and map | Passed. Eight Storage data files returned HTTP 200. The phone map rendered with one canvas, two test stops, no horizontal overflow, and no question marks. |
| Cache with Storage unavailable | Passed. After warming Cache API, Storage requests were blocked and the phone reopened the trip and map without page errors. |
| Map-tab save reaches Supabase | Passed on a disposable E2E trip. Renaming it in the Map tab saved version 3 with the new name. |
| Live `tripdb` save and browser Realtime | Passed on a synthetic E2E trip. tripdb saved versions 1 and 2. The signed-in phone list showed the new trip without a reload. The trip was later soft-deleted, with all three versions preserved. |
| Ask Claude task insert and result display | Passed on the E2E trip. The app inserted one `flight_prices` task with the trip id and version, showed “Sent to Claude,” and displayed the result after the row changed to done. The test task was then deleted. |
| MCP deployment and unauthenticated guard | Passed. Created the three required SSM parameters without printing their values, deployed the `latam-trip-mcp` stack, and confirmed its MCP endpoint returns HTTP 401 without a bearer. The protected resource metadata returned HTTP 200. |

The scratchpad also includes a new-trip picker attempt that used the wrong navigation path. It did not establish a product failure. A malformed local-storage fixture also caused a test-only error and passed when retried with a valid array fixture. An initial attempt to open the test bus leg opened its expected details popover rather than a flight sheet; the E2E fixture was then changed to an explicit flight leg for the task flow.

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
| Preview deployment | Passed with a configured AWS profile that has the required preview prefix and CloudFront access. The production bucket root was not touched. |

The first worker test invocation used a module import form that failed to locate `infra`. Rerunning with unittest discovery rooted at `infra/worker` passed.

## Skills and next actions

The migration plan names `superpowers:executing-plans` or `superpowers:subagent-driven-development`. The execution skill was installed from `obra/superpowers` into the user Codex skills folder and will be available next turn. The project UI design skills were not applied because this change does not alter the interface. No UI work was done.

The planner is available at `https://d15amu9hjiumbd.cloudfront.net/preview/index.html` for phone browser use. The MCP endpoint is `https://n1e8j7vob1.execute-api.eu-west-1.amazonaws.com/mcp`. Its OAuth passphrase is held in SSM at `/latam-trip-mcp/signin-passphrase`; an authenticated MCP client call and Simon's client connection remain to be verified. Task 27 and the site bucket root remain untouched. E2E fixtures from the interrupted Claude run were confirmed by name and soft-deleted. No real trip was changed or deleted.

## Continuation on 2 Nov 2026

Simon confirmed that a phone and PC sync when both use the `/preview/index.html` app and the same account. The site root still serves the previous file-based build, and browser-held trips have not been imported. This is a verified preview result, not completion of the cutover.

The migration branch already contains the latest `origin/main` commits at the start of this continuation; `git merge-base --is-ancestor origin/main HEAD` passed, so no merge was needed. The pre-existing untracked `Microsoft/` path remains untouched.

Completed Task 26 preparation by updating the remaining stale instructions in the plugin's `map-data`, `momondo-search`, and flight-crawl map schema docs, then synchronizing `.claude/` with `python -I plugin/scripts/sync_claude_dir.py --root .`. Commit: `6103505 Prepare skills for Supabase cutover`.

Fresh verification on the branch:

| Check | Result |
|---|---|
| Planner TypeScript | Passed (`npm.cmd run typecheck`). |
| Planner tests | 305 passed across 35 files. |
| Web TypeScript | Passed (`npm.cmd run typecheck`). |
| Web tests | 218 passed across 16 files. |
| tripdb Python suite | 146 passed, 29 skipped by default. |
| Worker suite | 37 passed. |
| Checklist task suite | 5 passed. |
| MCP suite | 28 passed. |
| Userscript suite | 46 passed. |
| `git diff --check` | Passed. |

Worker and checklist Python tests still emit existing `ResourceWarning` messages about unclosed files. No Supabase cutover, production-root deployment, or merge to `main` occurred during this continuation.
