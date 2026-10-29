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
- Momondo one-way home crawl (mom-25b): MEX-CPH 2,372 (BA via ORD+LHR, one ticket, US transit), Iberia MEX-MAD-CPH 2,934 one ticket (arr 14:45), CUN-CPH 3,054 (Air Europa + SAS, 2 tickets), GDL-CPH 3,107 (Volaris + Icelandair via ORD-KEF). None beat the self-built Madrid chains once hours are priced in, so the in/out table did not change.
- Crawler issues seen: rank 1 was skipped on these one-way pages (crawl started at rank 2), and Mix & Match dialogs have no "Bookingmuligheder" section, so site, fare and bag fields come back empty. Fix in the crawler before the next Momondo round.
- 28 Oct evening: KLM + Copa sells Colombia in / Central America out on one ticket without US transit for only about 1,000 kr more than BA/AA via Miami (CPH-BOG / GUA-CPH 7,612; BOG / SAL 7,657; CTG / SAL 7,763). Home SAL/GUA 13:45 via Panama and Amsterdam, lands CPH 13:40 next day. Honduras (SAP, TGU, RTB) has no home flight without US transit at a sane time.
- Generated files (data/saved_trips.json, data/web/*) conflict when merging main into the planner branch: regenerate them after the merge instead of resolving by hand.

## Round 32/33 (28 Oct evening): scope change
- Simon's rule: long-haul is ALWAYS searched as one combined ticket from and back to Copenhagen (open jaw or multi-city). Never scout Europe one-ways into the region on their own. Regional hops inside the trip stay one-way.
- Scope now: Scenario A = Central America in (not Guatemala, not Colombia), Bolivia last, home from Santa Cruz (VVI). Scenario B = no Bolivia, Central America in, south out. Guadalajara dropped. No Colombia <-> Bolivia back and forth.
- One-way Europe to Bolivia (exp-32c): CPH-VVI about 8,100, MAD-VVI 6,900, MAD-LPB 6,100; CPH-LPB and CPH-CBB all over 30 h. Open jaws into Bolivia are cheaper per trip.
- Colombia to Honduras one-ways were 1,400 to 1,900 cheaper on 8 Jan than on 5 Jan (gf-32a): sweep regional dates, the spread is large.
- Lima: JetSMART and LATAM fly MDE/BOG-LIM nonstop (about 3 h); BoA LIM-VVI nonstop 01:00-04:30; no LIM-CBB flights.
- The derived tables (chains, inout, itineraries, map, seeds) and docs are refreshed only when the pipeline is run: run it after EVERY round, then sync the repo.
- preview_start navigated the 'seed' tab again (mom-32b): workers must never call preview_start while the pane is open; check tabs_context first.
- Hand-pasting generated tables into the Docs doc made them fall behind and cost ~30k characters per refresh. Since 28 Oct the tables live in a Dashboard artifact fed by two uploaded JSON files (SKILL.md step 3); refreshing is 2 uploads + 2 dataset updates.
- Whole-trip rating now weighs travel hours as much as cost (Simon, 28 Oct): 2 x (0.35 cost + 0.35 hours + 0.15 way home + 0.15 hassle); cost 5 at 7,000, -1 per 2,000; hours 5 at 34 h, -1 per 8 h (1 h ~ 250 kr). Regional hops are chosen by eff cost + 100 kr per hour, hops over 15 h skipped.
- Airline sites (round 34): avianca.com and copaair.com searched cleanly, no bot check. Copa sells no SJO-LPB; Cochabamba only via VVI with BoA. Avianca SJO-VVI was 2,847 on 10 Dec but 5,539 on 20 Jan; Copa SJO-VVI 2,400 on both dates. Return SJO-VVI-SJO on the airline sites is about 1,000 kr cheaper than two one-ways (Avianca), equal on Copa.
- inout.py kept only the cheapest ticket per city pair, which hid better-rated ones (SAL in / VVI home: 9,071 with a 23.8 h home landing 4 Feb hid 9,363 with BoA home 19.1 h landing 3 Feb). Since 28 Oct it rates up to 8 tickets per pair and keeps the best-rated.
- Round 35 (28 Oct 21:15): Momondo showed Sikkerhedstjek on mom-35a's 7th search; worker stopped. Cochabamba as home airport: no one-ticket home exists; all CBB home options are 2 tickets via Madrid (21.5 to 28.7 h) or BoA via La Paz + Avianca + SAS (28.7 h). Better: BoA CBB-VVI (8 departures/day, 404-479 kr) the evening before + the BoA/AF VVI ticket.
