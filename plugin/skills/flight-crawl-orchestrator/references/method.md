# Method: the route tree and how it grows

## Levels
- L0 scenario: a way to shape the whole trip (e.g. open jaw ending in the last country; plain return plus regional side legs; a start or end in a side-trip city). Scenarios live in briefs/scenarios.md and are compared on totals (main ticket + forced regional legs).
- L1 pattern: start>entry / exit>end. `P:CPH>GUA/VVI>CPH` (open jaw), `P:CPH>BOG/BOG>CPH` (return), `M:CPH>PTY+PTY>SAL+VVI>CPH` (multi-city), `R:BOG>LPB` (regional one-way), `P:CPH>GDL/*` (half).
- L2 variant: the concrete routing (vias, number of tickets, stopover length).
- L3 date pair (or date tuple for multi-city).
- L4 quote: one observed price at one time. Append-only.

## Search space
Entries/exits: every airport in the region that the user would plausibly start or end in, plus the hubs that keep showing up. Origins: home airport plus alternative origins with buffer days (positioning flight priced separately). Dates: main dates first, neighbours (±1 to 2 days) only on patterns that are in the top 20%.

## Expansion operators (one worker job each)
| Op | What | When |
|---|---|---|
| E1 | open jaws + returns for each entry/exit on main dates | first round |
| E2 | regional one-ways the scenarios force; half patterns | right after E1 |
| E3 | date sweep on the best patterns | when the top 20% is known |
| E4 | hub mining: airports in 3+ of the top 10, or in 25% of the top 20% | after each ingest (automatic) |
| E5 | multi-city through pivots with a stop of a few days | after E4 |
| E6 | recombine best outbound half x best home half x forced regional leg in one multi-city search | after E2 |
| E7 | carriers that dominate the top, searched directly or by their hubs | when a carrier shows in 3+ of the top 10 |
| E8 | alternative origins (positioning + buffer days) | when the home leg dominates the price |
| E9 | cross-check the shortlist on a second engine; re-check over days for price movement | before deciding; then on a schedule |

## Priority
priority = gain x novelty x gap / cost
- gain: how much the search could beat the current best effective cost of its scenario
- novelty: 1 for a new pattern or hub, 0.3 for a date neighbour, 0.1 for a repeat
- gap: 1 if the scenario lacks a priced forced leg (scenarios.py "missing"), else 0.5
- cost: tokens per search for the engine (Momondo about 15 to 30k, Google Flights about 16k, Expedia about 30k)
A branch is saturated after 8 tasks with no new best. A branch is killed when all results break the hard limit or are absurd after one adjustment.

## Building tickets ourselves
Engines price a multi-city search as one ticket when one airline group covers it, otherwise as combined one-ways (Momondo "Mix & Match") or self-transfer. So E6 is run as a multi-city search: if the engine finds a single ticket cheaper than the parts, it wins; if not, the scenario total from scenarios.py (separate tickets) stands.
