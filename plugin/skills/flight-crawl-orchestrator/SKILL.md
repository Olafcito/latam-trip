---
name: flight-crawl-orchestrator
description: Plan and run a crawler-style flight search for a long trip, covering returns, open jaws, multi-city, hub stopovers, alternative origins and date flex, with cheap Sonnet browser workers and one scored long table. Use when someone wants every sensible way in and out of a region compared on price, hours and conditions.
---

# Flight crawl orchestrator

You are the orchestrator. Workers do the browsing; you plan, dispatch, ingest, score and decide what to expand next. Keep your own context small: read workers' RESULT blocks and the ingest report, never raw pages.

## Project layout (ROOT, the user's crawl folder)
- `trip.json`: travellers, home airports, alternative origins, main dates, hard limits (max hours one way), scoring weights. Copy `templates/trip.example.json` and fill it in with the user.
- `briefs/scenarios.md`: the trip scenarios (L0), written with the user.
- `data/raw/<agent>.jsonl`: append-only quotes, one file per worker.
- `data/known_prices.json`: prices the user or earlier rounds found, for price-movement checks.
- `data/agent_usage.csv`: round, agent, model, tool, searches, tokens, tool_uses, seconds, rows.
- `data/crawl.db`, `data/quotes.csv`: built by `scripts/ingest.py`, the long table.

## Method (details in references/method.md)
Route tree: L0 scenario, L1 pattern `P:{start}>{entry}/{exit}>{end}` (multi-city `M:a>b+c>d+...`, regional `R:a>b`), L2 variant (vias, tickets, stopover), L3 date pair, L4 quote.
Expansion operators, run in this order, each a round of worker jobs:
1. E1 pattern enumeration: open jaws and returns for every plausible entry/exit, main dates.
2. E2 half patterns and regional one-ways the scenarios force (e.g. into the last country).
3. E3 date sweep: neighbouring dates on the best patterns only.
4. E4 hub mining: airports in 3+ of the top 10 or 25% of the top 20% become pivots.
5. E5 pivot stopovers: multi-city through pivots with a few days' stop.
6. E6 recombination: best outbound halves x best home halves x forced regional legs, as one multi-city search.
7. E7 carrier expansion: search the carriers that dominate the top (BoA, Copa, Avianca, KLM...).
8. E8 origin shift: alternative origins with buffer days (cheap positioning flight priced separately).
9. E9 cross-check: the shortlist on a second engine, and a re-check later to track prices.
10. E10 self-built chains: one-ways between the origin, cheap European hubs (MAD, BCN, LIS, CDG, AMS, FRA, LGW, IST) and Latin American leisure gateways (CUN, MEX, SDQ, PTY), plus the onward low-cost hops (Viva, Volaris, Arajet, JetSMART). `chains.py` joins them into ways in and home with self-transfers, day stops or 1 to 4 night stopovers, and `routes.py` prices whole trips from them. Users often find these themselves as Momondo "Mix & Match"; treat such a screenshot as a seed and search around it (other hubs, the reverse direction, the hop that follows).
Priority = gain x novelty x gap / cost. A branch is saturated after 8 tasks with no new best. Kill a branch whose results are all over the hard limit or absurd after one adjustment.

## Dispatch rules (learned the hard way, see references/lessons.md)
- Sonnet workers only (Haiku made mistakes that cost more than it saved). One job = about 8 searches: each agent has 50 to 70k tokens of fixed start-up cost and prompt caching makes later searches cheap.
- The worker brief is the agent file (`agents/momondo-worker.md`, `agents/gflights-worker.md`). The task prompt adds only: ROOT, PLUGIN, agent name, numbered tasks with task_id, legs, dates, neighbouring dates, and a one-line purpose per task.
- At most 2 browser workers at once on the same machine (tab cap, rate limits). Different engines can run in parallel.
- Run workers in the background; ingest when each RESULT arrives. Log usage to `data/agent_usage.csv` from the task notification.
- Momondo is the primary engine (finds hidden connections, BoA, self-transfer combos). Google Flights is for date grids and cross-checks. Expedia only as a scout. Kiwi was dropped (no bookable wins, checkout surcharges).
- Never let a worker book, pay, enter personal data, accept consent, or create scheduled tasks.

## After each round
1. `python3 -I PLUGIN/skills/flight-crawl-orchestrator/scripts/ingest.py --root ROOT`
2. `chains.py --root ROOT` (self-built ways in/home, data/chains.json), then `routes.py --root ROOT` (every region order for every main ticket and chain pair, data/routes.json), `evaluate.py` for named scenarios with bags, `build_map.py` for the map.
3. Update `briefs/scenarios.md` and the plan doc with what changed; fold worker `next:` and `problems:` lines into the agent files and references/lessons.md.
4. Pick the next round by the priority rule. Tell the user only what changed their options.
