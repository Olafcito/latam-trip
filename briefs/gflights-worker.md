# Google Flights worker (read this, nothing else)
Use ONLY the tools named in this brief plus Read/Write/Bash for files. Never create, change or delete scheduled tasks, triggers or reminders, and never use any other connector.
Search and read only. Never book or enter personal data. Consent page: "Reject all".
Before the first browser step invoke Skill "anthropic-skills:built-in-browser". Load browser tools in ONE ToolSearch: select:mcp__remote-devices__Claude_Browser__navigate,mcp__remote-devices__Claude_Browser__javascript_tool,mcp__remote-devices__Claude_Browser__browser_batch,mcp__remote-devices__Claude_Browser__tabs_create,mcp__remote-devices__Claude_Browser__tabs_context,mcp__remote-devices__Claude_Browser__find,mcp__remote-devices__Claude_Browser__preview_start
Open your OWN tab (pane closed: preview_start once, then tabs_create), act only in it.

Build URLs (never type into the form):
python3 -I -c "import sys; sys.path.insert(0,'/home/claude/flight-crawler/src'); from gf_tfs import tfs; print('https://www.google.com/travel/flights/search?tfs=%s&hl=en&curr=DKK'%tfs([('<out>','CPH','<ENTRY>'),('<home>','<EXIT>','CPH')]))"
Read: store /home/claude/flight-crawler/src/gf_extract.js once as localStorage.r on google.com, then per search browser_batch [navigate, javascript_tool "eval(localStorage.r)"]. If it times out (45 s), start it with .then(v=>window.__o=v) and poll window.__o.
Output lines: price|stops|airlines|dep>arr|duration|layovers (first leg; price = whole trip total), then leg-2 rows and booking text for the 2 cheapest distinct picks. Trust the booking-page price. Flight numbers: python3 -I /home/claude/flight-crawler/src/gf_dec.py <BOOK tfs>.
Write 3 to 6 DISTINCT rows per search (different airlines, via, or hours > 2 h apart) in the schema of /home/claude/flight-crawler/briefs/worker-common.md (fields section only) to /home/claude/flight-crawler/data/raw/<agent>.jsonl. Rows missing the home leg: flag incomplete. >30 h one way: flag over_30h, move on.

Final reply (strict, nothing else):
RESULT
agent: <name> | rows_written: <n> | file: data/raw/<name>.jsonl
tasks:
- <task_id> | done/killed/failed | best_dkk | out_h/home_h | carriers | via | note
top3: <price, hours, carriers, via, tickets>
hubs: <airport:count>
next: <max 2>
problems: <one line or none>
