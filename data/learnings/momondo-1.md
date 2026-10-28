# Learnings: momondo-1 (momondo.dk, open jaw CPH->X, VVI/LPB->CPH, 1 adult, DKK)

## Cheapest 5 overall (not over_30h in either direction)
1. 8,278 DKK SJO-VVI (2 Feb): Ryanair 606 CPH-MAD + Iberojet 857 MAD-SJO, 18.3 h (3.4 h MAD, self-transfer, Mytrip/Kiwi-type); home VVI-BOG-MAD-CPH Avianca/Ryanair 28.8 h (10.8 h MAD layover, overnight). Self-transfer both ways, paid bags.
2. 8,566 DKK SJO-VVI (2 Feb): same out; home Avianca VVI-BOG-MAD + KLM MAD-AMS-CPH 26.4 h (self-transfer MAD, 6.7 h).
3. 8,909 DKK PTY-VVI (3 Feb): Ryanair + Air Europa via MAD 19.6 h out (5.6 h MAD, self-transfer); home 28.7 h via BOG/MAD (10.8 h MAD).
4. 9,021 DKK PTY-VVI (3 Feb): as 3, home via BOG-MAD-AMS 26.4 h.
5. 9,299 DKK GUA-VVI (2 Feb): KLM CPH-AMS-PTY-(SJO)-GUA 22.6-23.7 h, home BoA VVI-GRU + Air France GRU-CDG-CPH 19.1 h. Single operator chain (Flightnetwork), NOT self-transfer, 1 x cabin bag, checked bag paid.
Best "one ticket, sane hours": GUA-VVI 9,299 (22.6/19.1 h); BOG-VVI 9,767 (KLM 14.5 h out via AMS, home GOL+KLM via GRU/AMS 23.8 h); SAL-VVI 9,337 (KLM AMS-PTY 21.7 h out, 23.8 h home); SAP-VVI 12,338 (Air France/Copa via PTY both ways, 20.5/20.8 h, fastest sort); MDE-VVI 11,563 (KLM AMS-BOG 18.8 h, home 19.1 h GRU/CDG, fastest sort).

## Hubs seen (leg-level layover airports, counted per row/direction)
MAD 48 (Ryanair, Air Europa, Iberia, Avianca, Iberojet), BOG 34 (Avianca, LATAM), AMS 30 (KLM), GRU 15 and CDG 15 (BoA, GOL, Air France), PTY 12 (Copa, KLM, Air Europa), SJO 7, MEX 5, SDQ 4 (Hahn Air), CUR 4 (TUI Nederland), CUN 3, ARN/KEF/MCO 3 (Icelandair/Norwegian, US transit), LIS 3 (TAP), CUZ 3 (Avianca LPB home), MIA/ATL/YYZ/BUD/MRS/AGP/CMN 1-2 (junk/Kiwi).

## Price observations
- Open jaw ex-VVI costs 8.3k-10k almost everywhere because the VVI->CPH leg is the expensive part. Known: Google VVI->CPH one-way 8,973 and Expedia (user) GUA/VVI multi-city 10,500: momondo GUA-VVI 9,299 is about 1.2k lower than the Expedia 10,500 figure, and entire open jaws at 8.3-9.3k are cheaper than the VVI one-way alone on Google (different dates/fare types though).
- Cheapest results are nearly all Kiwi/Mytrip self-transfer chains with 10 h+ layovers or more than 30 h; "Annonce" (ad) offers are 200-2,000 DKK above the real lowest offer and must be ignored.
- Best-value (one ticket) options cost about 9.3-9.8k (GUA, BOG, SAL) and 11.5-12.3k (MDE, SAP when sorted fastest). Dates 3 Feb home gave similar prices to 2 Feb; home legs on 3 Feb via BOG/MAD still 28.7 h (MAD layover 10.8 h) cheaply, 19-24 h via GRU+CDG/AMS (BoA/GOL) at +500-1,000.
- LPB as home airport: 23.5 h home (LPB-BOG-MAD-CPH, Avianca+SAS 4304 same day, via CUZ sometimes) but outbound options to MDE/GUA/MGA were over 30 h when cheap; fastest outbound costs 12.3-17k (MGA: TAP via LIS/MIA 19.7 h + LPB home 23.5 h = 12,346, US transit MIA, Kiwi self-transfer).

## Next round
1. Fastest/"best" sorts were only checked for MDE-VVI, SAP-VVI, GUA-LPB, MGA-LPB; run duration_a / "best" for GUA, MGA, SJO, PTY, SAL, BOG ex-VVI and ex-LPB (combos KLM CPH-AMS-PTY/BOG with BoA/GOL home via GRU).
2. Date shifts: home 3 Feb vs 2 Feb on the PTY/SJO KLM combos; out 4 Dec for the Ryanair/Air Europa MAD options; check Avianca VVI-BOG overnight issue (03:45 departure, long MAD layover 10.8 h).
3. Check Copa PTY hub (SAP-VVI 20.5 h both ways one ticket) for MGA/SJO/GUA, and one-way splits (CPH->X plus VVI/LPB->CPH separately) for price.
Not worth it: anything via MAD-SDQ, MAD-CUN/MEX, KEF-MCO/MIA (>33 h, US transit), BUD/MRS Ryanair junk, Mytrip/Kiwi 50 h chains.

## Problems
- Browser pane is mobile layout; detail view is a dialog opened by clicking a card; result airlines only visible after expanding legs (done via JS). Tool JS timeout is 45 s, so crawls run in the background and are polled. A history.back bug sent one crawl to the previous URL (fixed; re-run). Cookie banner declined once. No captcha. IATA codes not shown, only airline names, so carriers lack codes. GUA/MGA (2 Feb) rows were written before the 28 Oct 11:15 update (8 rows each, includes near-duplicates).
- Search counts per task: 13 tasks, 47 rows. Not run: nothing skipped (SJO/PTY/SAL/CLO "fastest" sorts not run).
