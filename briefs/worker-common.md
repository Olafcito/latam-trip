# Worker brief: common rules (all flight-search workers)

You are one worker in a flight-search crawl for Simon's trip: Copenhagen (CPH) to Latin America around 3 Dec 2026, home around 2 Feb 2027 (leave ends 3 Feb). One adult, economy.
Plan/spec: Claude Doc "Flight search plan: Latin America". You only do your assigned tasks and report.

## Hard rules
- NEVER book, pay, enter personal data, or tick any consent box. Search and read only.
- Do not reduce the crawl to the cheapest result only: record the TOP results of each search (up to 8 distinct itineraries per search), so we learn routings, hubs and carriers.
- Never guess a field. If the source does not show it, leave it null and add "incomplete" to flags.
- If a search costs absurdly much (over 20,000 DKK) record the cheapest 2 results and move on; do not dig further.
- Note price movements: compare with data/known_prices.json and say if a known itinerary looks more or less expensive now.

## Output (mandatory)
Append one JSON object per itinerary, one per line, to your file data/raw/<agent_name>.jsonl (create it). Use Python or `cat >>` — never overwrite other files.
Fields:
{
 "agent": str, "task_id": str, "source": "expedia|kiwi|momondo|google_flights|airline:XX",
 "observed_at": ISO datetime UTC, "structure": "return|open_jaw|one_way",
 "legs_requested": [{"from":"CPH","to":"GUA","date":"2026-12-03"}, ...],
 "rank": int (position in the result list, 1 = first shown),
 "price": number, "currency": str, "price_dkk": number or null,
 "tickets": int or null, "self_transfer": bool or null,
 "fare_brand": str or null, "cabin_bag": str or null, "checked_bag": "incl|paid|none|null",
 "out":  {"dep":"2026-12-03T10:05","arr":"...","hours":float,"stops":int,"via":["MAD"],"layover_h":[2.5],"carriers":["IB"],"flights":["IB3251","IB6341"],"overnight_layover":bool} or null,
 "home": same shape or null,
 "us_transit": bool or null, "changeable": "free|fee|no|unknown", "link": str or null,
 "flags": [str], "notes": str
}
Times are local times as shown. hours = total door-to-door duration shown by the site for that direction.

## Learnings (mandatory)
At the end write data/learnings/<agent_name>.md with:
- Cheapest 5 overall (one line each).
- Hubs/connection airports seen, with counts, and which carriers.
- Price observations: anything surprising, anything that looks higher or lower than data/known_prices.json.
- What the next round should explore (concrete pivots, combos, dates) and what looks not worth it.
- Problems met (captchas, blocked sites, tool errors).
Your final reply to the orchestrator: max 25 lines, the same points condensed, plus the number of rows written.

## Update 28 Oct 11:15 (overrides anything above)
- Main dates: out 2026-12-03, home 2027-02-03 (2027-02-02 optional). Use 3 Feb from now on; searches already done on 2 Feb are fine, do not redo them.
- Wait for every search to finish fully (progress bar gone / "search complete") before reading.
- Do NOT open every result. Many results are near-identical (same airlines, times within about 2 h, price within about 500 DKK): keep ONE representative. Record: the cheapest, the site's "best", the fastest, and any result whose CONDITIONS differ (other hub, other carrier, self-transfer, overnight layover, airport change, bags, much shorter or longer). Typically 3 to 6 rows per search. Only open a detail view when needed to learn a condition (via airports, self-transfer details, bags).
- Self-transfer ("egentransfer", separate tickets, "hacker fare"): always record the transfer airport, layover length, whether you must change airport, recheck bags or pass immigration, and any guarantee offered. Flag "self_transfer".
- More than 30 h in one direction is unacceptable: write one row with flag "over_30h" and do not explore it further. Value matters, not only price: a few hundred DKK difference is irrelevant, conditions (hours, layovers, tickets, bags) are what we compare.
- If a search only returns ridiculous options (over 30 h, overnight in airports, absurd price), try ONE adjustment (dates moved 1 to 2 days, or the obvious hub swapped), then mark the task "killed" with the reason and move on.

## Final reply format (strict, nothing else)
RESULT
agent: <name> | rows_written: <n> | file: data/raw/<name>.jsonl | learnings: data/learnings/<name>.md
tasks:
- <task_id> | done/killed/failed | best_dkk | out_h/home_h | carriers | via | note (kill reason, self-transfer etc.)
top5: <one line each: price, hours, carriers, via, tickets>
hubs: <airport:count, ...>
price_signals: <vs known_prices, one line>
next: <max 3 concrete follow-ups>
problems: <one line or none>
