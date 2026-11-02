# Supabase cutover completion

Date: 2 November 2026

## Release

The Supabase cutover is complete. Supabase is the source of truth for shared trip and research data. The tracked repository no longer contains `data/sources`, `data/built` or `data/web`. The planner and map read the worker-built files from the Supabase bucket, and trips are read and written in the `trips` table.

Commit `754f50e Finish Supabase repository cutover` was merged to `main` by fast-forward and pushed. GitHub Actions deployment run `41469324492` completed successfully. The production root and its JavaScript bundle returned HTTP 200. `/preview/index.html` also returned HTTP 200 after the root deployment.

Production planner: <https://d15amu9hjiumbd.cloudfront.net/>

MCP endpoint: <https://n1e8j7vob1.execute-api.eu-west-1.amazonaws.com/mcp>

## Data and worker verification

- `cutover_done` is present. `trips_latest` returns 9 current trips. There is no `unresolved_journeys` document.
- The exact pre-import data dump and the scheduled worker backup are preserved under the ignored migration workspace. The backup restore was compared table by table before repository data removal.
- Eight published app files returned HTTP 200 from the Supabase bucket.
- The worker deployment completed successfully. Build and backup schedules are both `ENABLED`.
- The latest worker build has no error or warning. Its last build metadata reports version `ec2c7c6`; the deployed worker bundle was refreshed from `main` at `754f50e`. Since the project was clean, deployment did not force a data rebuild just to rewrite that metadata. The next normal data build updates it.
- Simon previously confirmed that his phone and PC synced through the preview app under the same account. The root deployment uses the same Supabase project and app build. This resumed session verified the live root and bundle over HTTP but did not attach to a signed-in browser for another interactive phone/PC session.
- The original 14-item E2E checklist was not present in the interrupted task files. The earlier takeover report records the available phone/desktop E2E evidence and regression fix. No real trips were removed from Supabase.

## MCP verification

The deployed MCP server passed an authenticated OAuth 2.1 authorization-code flow with PKCE, MCP initialization, and `tools/list`. The server returned 37 tools. The temporary verification client and its access and refresh token records were removed immediately after the check. No trip or research data was read or changed by this check.

Claude Code's user configuration now includes the `latam-trip` MCP server. It completed OAuth authentication, and `claude mcp list` reports it as connected. The 37 tools are available in Claude Code.

## Final checks

| Check | Result |
|---|---|
| Planner TypeScript | Passed |
| Planner tests | 302 passed, 34 files |
| Planner production build | Passed; existing large-chunk advisory remains. The build contains no local data snapshot. |
| Web TypeScript | Passed |
| Web tests | 216 passed, 2 skipped because the committed corpus was removed |
| tripdb suite | 146 passed; 62 skipped, including live destructive tests and tests requiring the removed corpus |
| Worker suite | 37 passed, 1 skipped |
| Checklist task suite | 5 passed |
| MCP Python suite | 28 passed |
| Userscript suite | 46 passed |
| `git diff --check` | Passed |

The local ignored `planner/public/data` snapshot was preserved. Vite now disables `publicDir`, so this old local copy is not used by the app or included in production builds. The `Microsoft/` untracked directory was also preserved.

## Commit history

- `6103505 Prepare skills for Supabase cutover`
- `44ceab5 Record cutover preparation verification`
- `c101900 Preserve live Supabase trips for cutover`
- `ec2c7c6 Drop Supabase test reset at cutover`
- `754f50e Finish Supabase repository cutover`
- `15bc733 Document Supabase cutover release`
