# gf-2a learnings (Google Flights, multi-city CPH->X out 3 Dec 2026, LPB->CPH home)

## Cheapest 5 overall (all one ticket, verified on booking page, home 2 Feb)
1. 10,842 DKK GUA: KLM+COPA out 23h44 (AMS, PTY 4h51), home KLM/Avianca 29h15 (BOG 9h55, CTG, AMS), 1 ticket
2. 10,852 DKK SAL: KLM+COPA out 21h40 (AMS, PTY), same home, 1 ticket
3. 10,853 DKK SAL: AF+COPA out 20h33 (CDG, PTY), same home, 1 ticket
4. 10,969 DKK SJO: KLM+COPA out 19h35 (AMS, PTY), same home, 1 ticket
5. 10,970 DKK SJO: AF+COPA out 18h49 (CDG, PTY), same home, 1 ticket
Next: BOG KLM 14h30 out (AMS only) + same home = 11,271 (shortest outbound, 1 ticket).

## Hubs
Out: AMS 12 (KLM/SAS), PTY 11 (COPA), CDG 6 (AF), FRA/MUC 4 (LH), IST 3 (TK), BRU 3, YUL/YYZ 3 (AC).
Home from LPB: always LPB-BOG (Avianca AV224 dep 03:25) then BOG-CTG-AMS-CPH (KL codeshare, 29h15) or BOG-EWR-BRU-CPH (United/SAS, 27h, US transit) or BOG-PTY-IST-CPH (Turkish, 38-49h). Only 3 home itineraries exist on Google Flights for LPB.

## Price observations
- Home date is everything. Home 3 Feb: cheapest same-airline combo 22.5-30k DKK (two separate tickets, home via Newark = ESTA needed). Home 2 Feb: 10.8-11.3k on ONE KLM ticket. The 29h15 KLM home itinerary costs far more when flown 3 Feb (19.7k as add-on) than 2 Feb (essentially included).
- 3 Feb, one-ticket Turkish option exists for BOG 12,536 and SAL 12,162 but 33-37h out and 49h home (over_30h).
- vs known_prices: google VVI->CPH one-way 8,973; LPB->CPH is clearly worse served (3 itineraries, all 3 stops, 27-49h). Momondo known CPH<->BOG return 6,552 (AA): Google round trip equivalent here is open jaw to LPB so not comparable; bolt-on LPB home costs about 4-5k more than a plain return.
- Out price differences between hubs are tiny (GUA 10.8k, SAL 10.85k, SJO 10.97k, BOG 11.27k) when home 2 Feb.

## Next round should explore
- Home 2 Feb for all other open-jaw tasks (and 1 Feb / 4 Feb) with LPB origin; check whether cheaper/shorter home exists on Kiwi/Momondo/Expedia (e.g. LPB-LIM/BOG-MAD).
- Positioning: VVI (Santa Cruz) as home origin was 8,973 one-way; compare with LPB home plus overland, and LPB-VVI domestic flights.
- Check bag costs (1st checked bag fee on KLM fare) and whether a 9h55 BOG layover can be broken with a day-room.
- Not worth it: home 3 Feb via Newark (25-30k, separate tickets, ESTA), Turkish 49h itineraries, Canada routings for SJO.

## Problems
None blocking. Google Flights only lists 3 LPB home itineraries; extractor home-leg price column is the whole-trip total. One tab used (tab-4); localStorage.r set on google.com.
