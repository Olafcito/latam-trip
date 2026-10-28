# Lessons from running the crawl (Oct 2026, CPH to Latin America)

## Engines
- Momondo (momondo.dk, built-in browser, mobile layout): best engine. Finds hidden connections, Boliviana (BoA), Mix & Match one-ways and self-transfer chains. Results load progressively: wait for "Færdig". "Annonce" offers are ads 200 to 2,000 DKK above the real price. Identical searches on the same day gave identical prices.
- Momondo's cheapest results are mostly self-transfer chains (Kiwi/Mytrip) with 10 h+ layovers or more than 30 h. Always crawl the Bedst view too.
- Google Flights: typing into the form fails; build tfs URLs. Consent page first ("Reject all"). Prices settle about 6 s after rows appear. Never shows BoA. Good for date grids: 16k tokens per search in round 3 vs 40k in round 2 once the routine was stored.
- Expedia connector: about 30k tokens per call; da-DK locale returns "Unknown error" (use en-US, null location); no open jaw or multi-city; through-flights hide stops. Scout only.
- Kiwi connector: cheap only via 2 to 3 separate tickets; no bag prices; checkout surcharges. Dropped.

## Workers
- Haiku cost more in mistakes than it saved. Sonnet only.
- Fixed start-up cost is 50 to 70k tokens per agent. 8 searches in one job cost 237k tokens vs 352k for two jobs of 4. Use about 8 searches per job.
- Browser JS calls time out at 45 s: start crawls in the background with .then() and poll.
- Reusing a tab let history.back() jump to the previous search. Fresh tab per search, closed afterwards.
- The tab cap can block tabs_create; workers must close their own tabs.
- A worker once created a scheduled task by mistake. Every brief now forbids scheduled tasks, triggers, reminders and memory, and lists the only tools allowed.
- Workers that write rows by hand produce near-duplicates. The converters dedupe (same carriers and via, hours within 2, price within 500).
- Strict RESULT block: the orchestrator never reads raw pages.

## Routing facts found (this trip)
- Every open jaw home from Santa Cruz (VVI) goes via São Paulo (GRU, Gol or BoA) then Paris (Air France) or Amsterdam (KLM), 19 to 24 h; or Copa via Panama (PTY) + KLM, about 21 h, about +600 DKK. BoA+Air France (19.1 h) appears only on Momondo.
- The outbound adds little: open jaw CPH->X / VVI->CPH costs about the same as the VVI->CPH one-way alone (9.0k vs 9.0k).
- Plain returns via London+Miami (American Basic) are about 6,500 DKK, about 21 h each way, with US transit.
- La Paz as exit is far worse than Santa Cruz (22 to 30k on 3 Feb; about 11k with 29 h on 2 Feb).
- Regional one-ways into Bolivia late January are about 1,900 to 2,300 DKK (Avianca BOG-VVI direct 4.2 h, LATAM via Lima, Copa via Panama).

## Round 3 (28 Oct): 8 searches per Sonnet job
- Tokens per search fell: Google Flights 16k (from 40k), Momondo 21 to 23k per task including Bedst view and neighbouring dates (from 29k). Round 3 total: 483k tokens for 24 tasks, 110 rows.
- Momondo return dialogs label legs "Afrejse •" / "Hjemrejse •" (multi-city and open jaw: "Fly 1 •", "Fly 2 •"). The v3 crawler lumped both directions of a return into one leg. Fixed in v4; workers save window.__dlg0 to verify.
- The self-transfer flag was read from page-wide text and hit single-airline rows (e.g. LATAM via Lima). v4 reads "Egentransfer" per leg; ingest.py marks older single-carrier rows as self_transfer_unverified.
- "Sponsoreret" is an ad label like "Annonce".
- Workers patched the crawler privately in the page (localStorage crawlsrc2) instead of reporting: the brief now says to report problems, and the orchestrator owns the file.
- Regional legs found: cheap one-ways (1,900 to 2,300) mostly route via Lima and land around 04:00; the nonstop or same-day option costs 300 to 2,500 more. Nicaragua to Bolivia has no sane through product (killed).
- Guadalajara: CPH-GDL single tickets cost about 8.7k one-way or return (Air Canada via Toronto, KLM via Mexico City); GDL to Central America and Colombia is cheap (Aeromexico GDL-GUA 1,111, Volaris GDL-BOG direct 1,470).

## Round 4 (28 Oct): building tickets ourselves
- Momondo multi-city URLs with 3 legs load fine. Bundling the regional leg (BOG-LPB) into the main ticket did not save money (12,249 vs about 11,500 bought separately); engines price such bundles as the sum or worse. Default: buy the regional leg separately unless a multi-city search proves otherwise.
- A stopover on the way in is cheap: CPH-AMS-PTY, 4 days in Panama, PTY-SAL, VVI-CPH home cost 10,215 vs about 9,100 for the plain open jaw.
- The real return dialog text confirmed the v4 parser (Afrejse/Hjemrejse).
- Two workers in parallel: one ran its first crawl in a shared tab and history.back() jumped into the other worker's search. Brief: never use a tab you did not create.

## Rounds 5 and 6 (28 Oct): origin shift and cross-check
- Origin shift paid off: Madrid start/end on Avianca via Bogotá is 5,700 (20.6 h / 14.7 h) against 9,071 from Copenhagen (18.5 h / 23.8 h); with the positioning flight, cabin bag and train it still wins by about 1,000 and is much shorter. Always run E8 when the long-haul home leg dominates the price.
- Date drivers can be one-sided: the 2 Dec outbound was 1,500 cheaper than 3 Dec while the home date made no difference. Sweep each leg's date separately (2 x 2 matrix) before sweeping both.
- Separate one-ways did not beat the open jaw (3,081 + 3,317 vs 5,700).
- Google Flights cross-check: Google never listed the Avianca-only open jaw as one ticket and priced Madrid options 1,300 to 1,700 higher (2 tickets). Momondo OTAs (Flysmarter, Trip.com, Mytrip) sell combinations Google does not show. Treat Momondo-only fares as unverified until the seller page is read.
- Ad cards make Momondo skip result numbers (nocard). Crawler v4.1 crawls the cards that exist.
- preview_start can navigate a pre-existing tab: workers call it only when the pane is closed and never work in that tab.
- Tight connections: the scoring now adds a penalty for layovers under 1 h (tight_connection).

## Map data (28 Oct)
- Web-only research workers (WebSearch/WebFetch) built the network fast: about 25 nodes and 50 to 73 edges per region in 9 to 11 minutes, 180k tokens each.
- The workspace proxy blocks Wikimedia Commons, upload.wikimedia.org, the Wikipedia API, Hostelworld and Rome2rio. Images and hostel prices therefore come from a browser worker (Commons API called from a commons.wikimedia.org tab: one JS loop for all nodes; Hostelworld city pages for dorm/private "from" prices).
- Profilers fill text well from Wikivoyage/guides but leave prices null when sources disagree (correct behaviour). Hostelz "from" prices can be implausible (US$0.77 dorm): do not use them.
- The browser pane caps tabs at about 9. Workers leave tabs behind when they stop early, so the orchestrator lists tabs (tabs_context) between rounds and closes those no running worker owns.
- Momondo cards whose only offers are ads (site "Sponsoreret"/"Annonce") are now skipped by the crawler; segment lines followed by an authority notice ("Service mellem ... godkendelse") now read the airline from the next line. Workers had been cleaning these by hand.
- Google Flights workers sometimes wrote the home leg reversed (MAD->VVI instead of VVI->MAD); ingest.py now normalises it and flags legs_fixed.
- Switching computers changes Momondo's layout (wide desktop: a nav drawer is also a [role=dialog] and cards open via "Vælg"). Narrowing the pane to a mobile width triggered Momondo's bot check ("Sikkerhedstjek"), which only a person may pass. Keep one browser profile and width for the whole crawl, and pace Momondo searches.

## Round 25 (28 Oct): self-built chains
- Simon found on Momondo a Mix & Match CPH-MAD-CUN + Viva CUN-GDL (4,771) and VVI-MAD + Norwegian MAD-CPH next day (3,645). Two one-ways with a night in a hub can beat one-ticket open jaws, and the night is a free stopover. Engines show these only for one-way searches.
- chains.py builds them from all one-way quotes: about 700 products gave about 800 ways in and 150 ways home in under a second. Cabin-bag fees on low-cost legs (Viva Zero, Norwegian LowFare, Ryanair) and hostel nights are added so totals stay honest.
- Cheap hub legs found: Ryanair CPH-MAD 186-235 (Expedia shows 0 seats left: verify), Air Europa MAD-CUN nonstop 2,877, World2Fly MAD-SDQ 3,032, Arajet SDQ-MDE 880, Volaris CUN-GUA nonstop 1,294, Viva CUN-GDL 737, Iberia MEX-MAD nonstop 2,796, Air Europa CUN-MAD nonstop 2,598.
- Expedia's one-way results include Toluca (TLC) for MEX queries: flag airport_change.
- Momondo one-way crawl (mom-25a): CPH-CUN 3,141 (Ryanair + Air Europa via MAD) and 3,482 (Norwegian + Air Europa, 17.4 h); CPH-MEX/GDL chains 3,650 to 4,300; KLM + TUI via Curaçao reaches BOG/MDE/GUA for 4,800 to 5,100. Simon's exact 4,771 GDL chain (overnight in Cancún) did not show again: such stopover chains appear only on some dates, so build them from separate one-ways instead.
- Known crawler issue: Viva legs inside Momondo chains sometimes read an arrival of 23:59; treat those arrival times as suspect until the dialog parser is fixed.
