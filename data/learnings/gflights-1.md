# gflights-1 learnings (Google Flights, multi-city CPH -> X, VVI -> CPH, 1 adult economy, DKK)

## Cheapest 5 overall (entire-trip totals, one ticket, "Book with KLM")
1. 9061-9062 DKK  CPH-GUA out 3 Dec (KL AMS, CM PTY, 23h44 / 20h47 for 9646), VVI-CPH 2 Feb Gol+Air France (24h05) or 3 Feb Gol+KLM (23h45)
2. 9071 DKK  CPH-SAL (KL AMS, CM PTY, 21h40), home 3 Feb Gol+KLM 23h45
3. 9188 DKK  CPH-SJO (KL AMS, CM PTY, 19h35), home 3 Feb Gol+KLM 23h45 (COPA+KLM home 20h45 +610)
4. 9492 DKK  CPH-BOG 1 stop KLM via AMS (14h30!), home 2 Feb Gol+AF 24h05
5. 9808 DKK  CPH-MDE (KL AMS, CM PTY, 20h), home 2 Feb Gol+AF
Also: PTY 10496 (1 stop KLM 16h30), CLO 9885, MGA 12118 (expensive, via MEX).

## Hubs seen (outbound, counted over recorded rows)
AMS (KL, SK/KL) and PTY (Copa) dominate: nearly every cheap itinerary is KLM to AMS then Copa from Panama City. Also CDG (Air France + Copa/Avianca), FRA/MUC (Lufthansa + Avianca/LATAM/United), BRU (Brussels + Air Canada/United), ZRH (Swiss + Air Canada), MAD (SK+Air Europa/Iberia, always 17-23h overnight layover, over_30h), MEX (KL/SK + Aeromexico for MGA), YUL/YYZ (Air Canada), IAH/EWR (United, US transit).
Home VVI always via GRU (Gol G37639 11:55) then CDG (Air France) or AMS (KLM); VVI-BOG-YYZ-CPH (Avianca/Air Canada, 25h35) and VVI-PTY-AMS-CPH (Copa/KLM, 20h45, arr 13:40) also exist. No home option under 20h45.

## Price observations
- All cheapest-first-leg "From" prices are the total trip; the price rises by +0 to +300 for other home options. Home flights are nearly the same for every X, so the choice of X is driven by the outbound.
- CPH-GUA/VVI-CPH 9062 (2 Feb) vs known Expedia 10500 (2 Dec out / 3 Feb home): about 1400 cheaper now, and no baggage included either.
- Known Google Flights VVI->CPH one-way 8973 (26 Oct): the whole open jaw (out + home) costs about the same, i.e. the outbound CPH->Central America adds almost nothing on top of the home flight (cheapest-X open jaws 9062-9885). Known momondo American CPH->MDE / MGA->CPH 6933 is lower but a different structure.
- Dates: GUA 12-01 and 12-05 out (home 2 Feb) both 9062, 12-03 out with 2 Feb 9062, 3 Feb 9061, 31 Jan 9651 (+590). So +/-2 days out and 2 vs 3 Feb is flat, 31 Jan costs 590 more.
- Observed prices are stable between loads once results finished loading; the first load of BOG showed 13813 for KLM 1 stop (results not settled), the settled load shows 9492. Always wait about 6s extra.
- One odd result: PTY list contained LH 1 stop at 58155 and SAL 46124 (glitch/ultra fare), ignore.
- MGA: bookable through lastminute.com as "separate tickets" for 16954 vs 12118 at KLM: single-ticket is better.
- BOG 10765/10615 Lufthansa+Air Canada via Montreal 11h overnight layover, phone booking only: skip.

## Next round
- Outbound is the lever: try CPH-AMS-PTY/BOG combos on other days (Fri/Sat) and SAS/Norwegian separately-ticketed to AMS/CDG is not needed, KLM already cheap.
- Check Copa+KLM home (VVI-PTY-AMS-CPH 20h45, +610) vs Gol home (23h45) as the preferred home; compare Santa Cruz alternatives (VVI-LIM, VVI-BOG) for the out leg of other cities.
- Try X = LIM, UIO, SAP (San Pedro Sula) and other Copa hubs and CPH-PTY-VVI direct segments; also BOG->VVI Avianca A hours at different home dates.
- Not worth it: any itinerary via MAD (23h layover, over 30 h), Houston/Newark US transits, Lufthansa+Air Canada via Montreal, MGA via Mexico City (+2.5k).

## Problems met
- First attempt to open a tab via tabs_create failed until the pane was open; the "seed" tab belongs to the momondo worker and was not touched. Own tab was tab-1.
- Google consent page appeared; clicked "Reject all".
- Form typing did not work, so I built the multi-city search from the tfs URL parameter (protobuf, base64) with CPH/airport codes; this opens the form, pressing Search shows results. Selecting a first-leg row then the second leg works with JS clicks and aria-labels carry price, carriers, times, layovers.
- Flight numbers come from decoding the tfs in the booking page URL.
- Price labels sometimes differ between list and booking (BOG pick 2).
