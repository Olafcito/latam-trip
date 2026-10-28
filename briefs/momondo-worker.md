# Momondo worker (read this, nothing else) — v3, 28 Oct 12:00
Use ONLY the tools named here plus Read/Write/Bash for files. Never create, change or delete scheduled tasks, triggers or reminders. Never use any other connector.
Search and read only. Never book, pay, enter personal data, or click "Acceptér alle" (cookie banner: "Afvis alle").
Before the first browser step invoke Skill "anthropic-skills:built-in-browser". Load browser tools in ONE ToolSearch: select:mcp__remote-devices__Claude_Browser__navigate,mcp__remote-devices__Claude_Browser__javascript_tool,mcp__remote-devices__Claude_Browser__computer,mcp__remote-devices__Claude_Browser__tabs_create,mcp__remote-devices__Claude_Browser__tabs_close,mcp__remote-devices__Claude_Browser__tabs_context,mcp__remote-devices__Claude_Browser__find
Open a FRESH tab for EACH search and close it afterwards (a reused tab lets history.back() jump to the previous search and kill the run). Act only in your own tabs. Never run two crawls at once.

## Goal of each search
Find the remarkably different options, not many similar ones. For each search look at TWO views: Billigst (cheapest, sort=price_a) and Bedst (best). Keep the cheapest acceptable, the best, and any option whose conditions clearly differ (other hub, carrier, much shorter, self-transfer, overnight). 3 to 6 rows. A few hundred DKK do not matter; hours, layovers, tickets, bags do.
If BOTH views are horrendous (all over 30 h one way, overnight airport layovers, or absurd prices): try the dates 1 to 2 days either side once; if still horrendous, note it and mark the task "killed" with the reason.
Date flexibility: after the main search, run the same search on the neighbouring dates the task lists (if any) and keep only rows that are clearly better (cheaper by 500+ DKK or 3+ h shorter).

## URLs (DKK)
- Open jaw: https://www.momondo.dk/flight-search/CPH-GUA/2026-12-03/VVI-CPH/2027-02-03?sort=price_a
- Return:   https://www.momondo.dk/flight-search/CPH-GDL/2026-12-03/2027-02-03?sort=price_a
- One-way:  https://www.momondo.dk/flight-search/BOG-VVI/2027-01-28?sort=price_a
- Best view: try sort=bestflight_a; check that the active sort tab reads "Bedst"; if not, click the "Bedst" tab instead. Fastest: sort=duration_a.

## Per search (be patient)
1. navigate in a fresh tab, wait 8 s.
2. First search only: re-install the crawler (it was updated for one-ways): run the code in /home/claude/flight-crawler/src/momondo_crawler.js in a javascript_tool call, then
   localStorage.setItem('crawlsrc','window.parseDlg='+parseDlg.toString()+';window.crawl='+crawl.toString()+';window.lines='+lines.toString()+';window.run='+run.toString())
3. javascript_tool: eval(localStorage.getItem('crawlsrc')); window.__out=null; run(8,['<date1>','<date2 or date1>'],6).then(v=>window.__out=v).catch(e=>window.__out='ERR '+e); location.href
   run() itself waits for "Færdig" (search finished). Do not read results before that.
4. Wait 45 s, then poll window.__out (null = running; wait 15 s, poll again; up to 3 minutes). JS tool times out at 45 s: never await the crawl.
5. Save __out to /tmp/<agent>-<task>.txt and convert:
   python3 -I /home/claude/flight-crawler/src/momondo_lines.py <agent> <task_id> <date1> <date2|-> <LEG1> <LEG2|-> /tmp/<agent>-<task>.txt >> /home/claude/flight-crawler/data/raw/<agent>.jsonl
   LEG = FROM-TO, e.g. CPH-GUA VVI-CPH (open jaw), CPH-GDL GDL-CPH (return), BOG-VVI - (one-way, date2 "-").
   The converter drops near-identical rows and flags over_30h. Do not add rows by hand.
"Annonce" offers are ads: ignore. "Egentransfer" = self-transfer. "Mix & Match" = separate one-ways combined by Momondo (note it).

## Final reply (strict, nothing else)
RESULT
agent: <name> | rows_written: <n> | file: data/raw/<name>.jsonl
tasks:
- <task_id> | done/killed/failed | best_dkk | hours | carriers | via | note (best vs cheapest, dates tried)
top3: <price, hours, carriers, via, tickets>
hubs: <airport:count>
next: <max 2>
problems: <one line or none>
