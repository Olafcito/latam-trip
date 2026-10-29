# expedia-1 learnings (Expedia connector, 28 Oct 2026)

Rows written: 169 in data/raw/expedia-1.jsonl. Prices are USD from the connector, converted at an assumed 6.45 DKK per USD (no FX lookup possible, proxy 403). Every row notes this. No booking links exist in the connector output (flag no_link). Nothing was booked or entered.

## Cheapest 5 overall (returns CPH-X-CPH, 3 Dec to 2 Feb, 1 adult)
1. MGA return, $991.71 = 6,397 DKK. American Basic Economy, out 20.7 h via LHR+MIA, home 21.5 h via MIA+HEL. Bag $85 extra each way, no changes.
2. RTB return, $1,031.72 = 6,655 DKK. American Basic, out 38.5 h (17 h MIA layover). Flag over_30h.
3. LIR return, $1,052.22 = 6,787 DKK. American Basic, out 39 h (20 h DFW layover). Flag over_30h.
4. MDE return, $1,065.38 = 6,872 DKK. American Basic via LHR+MIA both ways, 20.9 h out, 20.1 h home.
5. CLO return, $1,066.38 = 6,878 DKK. Same AA routing as MDE, 21.3 h out, 19.5 h home.
Best fully under 30 h each way: MGA, MDE, CLO (all AA Basic via LHR/MIA), SAP $1,097 (Delta Main, AMS+ATL out 28.8 h, 1st bag included).

Cheapest one-ways: LIR $887 (TAP+Air Canada, 39 h, 18h45 Toronto layover, over_30h), GUA $914 (KLM Light via AMS+PTY, 20.8 h), SAL $915 (AF via CDG+PTY, 23.9 h), SJO $916 (SK+avianca via CDG+BOG, 29.9 h), SJO $932 (Air France CDG, 1 stop, 16h25, same-day arrival), BOG $990 (KLM Light via AMS, 1 stop, 14h30, same-day arrival; best routing of the whole crawl).
Home one-ways 2 Feb: VVI $983 (GOL+TAP via GRU+LIS, 30h55, over_30h), VVI $1,374 (GOL+KLM via GRU+AMS, 23h45), LPB $962 (Turkish via BOG+IST, 38 h, over_30h), LPB $1,303 (avianca+Air Canada via BOG+YYZ, 25h55). CBB home: killed, 41 to 62 h only.

## Hubs and carriers (count of hub appearances across all rows)
MIA 80, LHR 62, AMS 55, CDG 52, BOG 37, PTY 35, ATL 33, HEL 24, GRU 19, YYZ 18, EWR 16, FRA 16, MUC 13, MAD 12, BRU 8, ZRH 8, DFW 6, SJO 4, MEX 3, IST 3, LIS 3.
Carriers by leg count: American 79 (mostly BA/Finnair-operated feeders, Basic Economy), KLM 48, avianca 38, Delta 31, Air France 27, SAS 22, United 20, Lufthansa 20, Air Canada 17, GOL 15, Boliviana 8, Iberia 8.
Patterns: AA via LHR or HEL then MIA is the cheap Central America engine. KLM via AMS then PTY (Copa) is the best-conditions family for GUA, SJO, MDE, CLO (bags paid but 12 kg carry-on, 20 to 23 h). AF/SAS via CDG then PTY or BOG (avianca) also works. Bolivia returns route through GRU (GOL/Boliviana), BOG, MAD or YYZ.

## Price observations vs data/known_prices.json
- MGA return $991.71 (6,397 DKK) is about 3.5 percent above the momondo American 6,179. Roughly flat.
- BOG return $1,175 (7,579 DKK) is about 16 percent above the momondo American 6,552, and below momondo KLM/AF 8,553. Expedia is not cheaper here.
- SJO return $1,102.66 (7,112 DKK) matches momondo KLM 7,128 (flat). But the SJO outbound alone is $932 one-way, so Expedia prices the return leg at only about $170 more: one-way building blocks beat nothing here, returns are well priced.
- VVI to CPH one-way KLM 23h45 is $1,374.20 = 8,864 DKK vs Google Flights 8,973: flat. Cheaper VVI one-ways exist ($983 TAP, 30h55) but exceed 30 h.
- VVI return (cheapest $1,594 = 10,284 DKK, Lufthansa Economy Comfort-labelled, MUC+GRU out 34 h) is close to the user's 10,500 Expedia GUA/VVI multi-city, so no saving on Expedia for Bolivia.
- Cheap fares are mostly US-hub (MIA/DFW/ATL/EWR) Basic Economy: add $85 bag each way, no changes. Many UA/TAP BOG rows show seats_left=0 (probably sold out at that fare).

## Next round should explore
1. MGA/MDE/CLO via AA Basic with 3 Feb home (brief change), and compare with KLM Light via AMS+PTY for MDE/CLO ($1,038 to $1,049 out one-way, 20 to 23 h) combined with an AA/KLM one-way home. Open-jaw MDE out, MGA home (known 6,933) vs Expedia one-ways.
2. Bolivia: nothing under 30 h and cheap on Expedia. Try Kiwi/Google for VVI via Madrid/Sao Paulo, and a Colombia or Panama final destination plus a separate Santa Cruz flight (known Santa Cruz to San Jose 20 Jan 2,482 DKK). A GUA/MDE out + VVI one-way home via KLM GRU-AMS is about 5,894 + 8,864 = 14,758 DKK, too high.
3. Re-run BOG, GUA, SAP, RTB, XPL returns with a larger limit if a bag-inclusive comparison is wanted (these five searches returned only 5 rows each before I found the limit parameter).
Not worth it: LIR, RTB, XPL, SAP, CTG, LPB (all over 30 h or 17 to 22 h US layovers), CBB (41 to 62 h), PTY return (UA basic, seats_left=0).

## Problems met
- Every call failed with "Unknown error" when using user_locale da-DK and a DK user_location object. Fix: user_locale en-US, user_location null. Worked afterwards.
- Without the limit parameter only 5 results come back; limit 8 works.
- No FX source reachable, so 6.45 DKK per USD is an assumption.
- Through-flights (KL749 AMS-BOG-CTG, KL3026 PTY-SJO-GUA, AV104 LPB-CUZ-BOG, TK900 BOG-PTY-IST) hide an intermediate stop; stop counts follow the source and the notes say so.
- After the 11:15 brief update I pruned one-way tasks to 3 to 6 representative rows (cheapest, fastest, different conditions) and added over_30h flags to every row above 30 h in a direction (82 rows). Returns recorded earlier keep up to 8 rows.
- CBB: one adjustment (3 Feb) was worse (59 to 62 h). Task killed.
