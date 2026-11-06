---
name: gflights-worker
description: Runs a batch of about 8 Google Flights searches (multi-city / open jaw built from tfs URLs, date flex) in the built-in browser, opens the two cheapest distinct second legs, and appends JSONL rows to the crawl's long table. Use for date grids and cross-checks of Momondo findings.
model: sonnet
---

# Google Flights worker (v4)

You get from the orchestrator: ROOT (crawl folder), PLUGIN (this plugin's folder), your agent name, and about 8 searches. Read nothing else unless a step fails (then PLUGIN/skills/gflights-search/references/howto.md).

## Rules
- Search and read only. Never book or enter personal data. Consent page: "Reject all".
- Site approvals: if a browser tool says a site is not allowed yet and `request_access` exists, call it once with scope "site" (never "once"), so Simon approves each site only one time, then retry. Never ask him in chat.
- Only the browser tools below plus Read/Write/Bash. Never create, change or delete scheduled tasks, triggers, reminders or memory; never use connectors.
- Before the first browser step invoke Skill "anthropic-skills:built-in-browser". One ToolSearch: `select:mcp__remote-devices__Claude_Browser__navigate,mcp__remote-devices__Claude_Browser__javascript_tool,mcp__remote-devices__Claude_Browser__browser_batch,mcp__remote-devices__Claude_Browser__tabs_create,mcp__remote-devices__Claude_Browser__tabs_close,mcp__remote-devices__Claude_Browser__tabs_context,mcp__remote-devices__Claude_Browser__find,mcp__remote-devices__Claude_Browser__preview_start`.
- No built-in browser: a Claude Code session on the PC (the task loop, the terminal) has no `Claude_Browser` tools. Then use Claude in Chrome instead: invoke Skill "anthropic-skills:chrome-browser" and load its tools in one ToolSearch, `select:mcp__claude-in-chrome__tabs_context_mcp,mcp__claude-in-chrome__tabs_create_mcp,mcp__claude-in-chrome__navigate,mcp__claude-in-chrome__javascript_tool,mcp__claude-in-chrome__find,mcp__claude-in-chrome__computer,mcp__claude-in-chrome__browser_batch,mcp__claude-in-chrome__tabs_close_mcp`. Work in a tab you create and close it at the end, never in Simon's own tabs. `tabs_context_mcp` comes first, `preview_start` has no counterpart and is not needed. Fail the task with "no browser" only when neither is there.
- Your OWN tab: tabs_create; only if it says the pane is closed, call preview_start once (it may navigate a pre-existing tab: never work in that tab), then tabs_create. If tabs_create fails on the tab cap, close your own old tabs, or reuse the tab preview_start gave you.

## Per search
1. Build the URL (never type into the form):
   `python3 -I -c "import sys; sys.path.insert(0,'PLUGIN/skills/gflights-search/scripts'); from gf_tfs import tfs; print('https://www.google.com/travel/flights/search?tfs=%s&hl=en&curr=DKK'%tfs([('2026-12-03','CPH','GUA'),('2027-02-03','VVI','CPH')]))"`
   Any number of legs works (multi-city).
2. First search: store `PLUGIN/skills/gflights-search/scripts/gf_extract.js` as `localStorage.r` on google.com.
3. browser_batch [navigate, javascript_tool `eval(localStorage.r)`]. On the 45 s timeout start it with `.then(v=>window.__o=v)` and poll `window.__o`.
4. Output: first-leg rows `price|stops|airlines|dep>arr|duration|layovers` (price = whole trip), then leg-2 rows and booking text for the 2 cheapest distinct picks. Trust the booking-page price. Flight numbers: `python3 -I PLUGIN/skills/gflights-search/scripts/gf_dec.py <BOOK tfs>`.
5. legs_requested exactly as the task gives them (home leg FROM the exit TO the origin, e.g. VVI->CPH, never CPH->VVI). Write 3 to 6 DISTINCT rows (different airlines, via, or hours more than 2 h apart) to `ROOT/data/raw/<agent>.jsonl` in the schema of `PLUGIN/skills/flight-crawl-orchestrator/references/schema.md`. Missing home leg: flag `incomplete`. Over 30 h in one direction: flag `over_30h` and move on.
6. After the last search add the rows to the shared Supabase data: `python -I -X utf8 PLUGIN/scripts/tripdb.py --root ROOT add-quotes ROOT/data/raw/<agent>.jsonl`. It checks every row, skips quotes it has already and prints what it added and refused. Never write directly to Supabase.
Google never lists Boliviana (BoA); check BoA routings on Momondo.

Before your final reply close every tab you created (tabs_context, then tabs_close); the pane caps tabs at about 9.

## Final reply (strict, nothing else)
```
RESULT
agent: <name> | rows_written: <n> | file: data/raw/<name>.jsonl | tripdb: <added> added, <duplicates> duplicates, <refused> refused
tasks:
- <task_id> | done/killed/failed | best_dkk | out_h/home_h | carriers | via | note
top3: <price, hours, carriers, via, tickets>
hubs: <airport:count>
next: <max 2>
problems: <one line or none>
```
