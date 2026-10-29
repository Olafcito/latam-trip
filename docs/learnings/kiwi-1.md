# kiwi-1 learnings (Kiwi MCP, discovery only)

Rows written: 176 in data/raw/kiwi-1.jsonl (13 returns x 8, 3 one-ways home x 8, 6 one-ways out x 8). All rows carry flag kiwi_discovery. Prices in DKK, locale da, economy, 1 adult. Kiwi returns 15 results per search; I recorded the top 8 by Kiwi's price order. Tickets and self_transfer are derived from the itinerary id (number of distinct ticket prefixes); tickets > 1 means virtual interlining, so no protection on missed connections.

## Cheapest 5 overall (full return, any date within the flex)
1. 6910 CPH-LIR (Liberia CR): TAP CPH-LIS-YYZ, Porter YTZ-YOW-LIR out 3 Dec; home JetBlue LIR-JFK, then LHR-STN change, Ryanair to CPH 2 Feb. 4 tickets, YYZ to YTZ airport change, 16h overnight, US transit JFK.
2. 7112 CPH-LIR: same TAP/YYZ idea, dep 3 Dec or 4 Dec variants, 4 tickets.
3. 7542 CPH-SJO: Ryanair FR606 CPH-MAD + Iberojet E9857 MAD-SJO out 3 Dec; home Iberojet E9858 + SAS SK4304 MAD-CPH 2 Feb. 4 tickets (2 per direction), only hub is MAD, no US transit.
4. 7578 CPH-SAP (San Pedro Sula): MAD, AMS, ATL combo, 4 tickets, US transit.
5. 7900 CPH-SJO: Air Canada CPH-FRA-YYZ-SJO on ONE ticket (tickets=1), but dep 2 or 4 Dec. 7977 for CPH-YYZ-SJO also one ticket, same date shift.
On-date (3 Dec out, 2 Feb home) only 1, 3, 6 above plus SJO 7542 exist in the top 8s.

## Per-destination best return (all 8 rows per search are in the jsonl)
GUA 7786 (5 tickets, date shifted) | SAP 7578 | SAL 8538 | MGA 10355 | SJO 7542 | LIR 6910 | PTY 9181 | BOG 8112 (single ticket Air Canada via YYZ, dep 2 Dec, cabin bag incl) | MDE 8480 | CTG 8757 | CLO 8669 | VVI 8845 | LPB 10457.
Kiwi returns are never cheaper than the known one-ticket prices: MGA known 6179 (American) vs Kiwi 10355; BOG known 6552 (American) vs Kiwi 8112; SJO known 7128 (KLM) vs Kiwi 7542. Kiwi return prices are mostly 4+ tickets, so not attractive for the return structure.

## One-way results (this is where Kiwi is cheap)
Home from Bolivia 2 Feb (all 2 tickets, Avianca feeder + MAD hop, no US transit):
- VVI-CPH 4160: AV166 VVI-BOG, AV46 BOG-MAD, Ryanair FR607 MAD-CPH. 28.75h door to door; AV46 lands MAD 23:25 and FR607 leaves 10:15 next day, so a 10.8h overnight at MAD (flagged).
- LPB-CPH 4177: AV224 LPB-BOG, AV182 BOG-MAD, FR607 MAD-CPH. 8.4h layover at BOG then MAD morning connection.
- CBB-CPH 4600: Boliviana OB626 CBB-LPB then the LPB route, 3 tickets.
Compare Google Flights VVI-CPH one-way 8973: Kiwi is about half, but with 10h+ layovers and separate tickets (bag re-check at MAD).
Out 3 Dec (one-way): GUA 4257 (3 Dec, Norwegian CPH-ARN, Icelandair ARN-KEF-MCO, Volaris MCO-GUA next day, 3 tickets, US transit with 14.2h overnight at MCO) | PTY 4518 on 3 Dec (FR606 + Air Europa UX55 MAD-PTY, 2 tickets) | MDE 4767 (FR606, World2fly MAD-SDQ, Arajet SDQ-MDE, 3 tickets, overnight SDQ) | BOG 4822 (3 Dec, 3 tickets, airport changes FCO/CIA and a 4-leg mess; not usable) | MGA 5906 (FR606, Avianca MAD-BOG-SAL-MGA) | SJO 4530 on 3 Dec (rank 10, not recorded: FR606 + Iberojet E9857 MAD-SJO, 1 stop, arrives 17:30 same day) and 3232 on 2 Dec (FR606 CPH-MAD, TAP MAD-LIS-YYZ, Air Canada YYZ-SJO, 2 tickets).
Open-jaw sums of one-ways (separate tickets, my arithmetic): GUA 4257 + VVI-CPH 4160 = 8417; PTY 4518 + VVI-CPH 4160 = 8678; MDE 4767 + LPB-CPH 4177 = 8944. All under the known Expedia GUA+VVI 10500, and under Google Flights VVI one-way alone (8973) for the first two. Treat as discovery; needs verification on a bookable source, and the 2-3 separate tickets carry missed-connection risk.

## Hubs seen (count of rows where the airport is a connection, 176 rows)
MAD 130, BOG 75, KEF 52, MIA 28, YYZ 27, LIS 26, MCO 25, JFK 22, AMS 18, PTY 13, LHR 13, FRA 13, CMN 11, ORY 11, SAL 10, EWR 9, CUR 9, ATL 9, CUZ 9, SDQ 8, AGP 8, GRU 7, VVI 7, ARN 6, IAD 6, CUN 6, CCS 6, EDI 6, FLL 6, CDG 6.
Carriers by rows: Ryanair FR 126, Avianca AV 112, Icelandair FI 52, Air Europa UX 28, TAP TP 26, SAS SK 23, Air Canada AC 23, Norwegian D8 21, Copa CM 21, KLM KL 20, JetBlue B6 17, Volaris Costa Rica Q6 16, Wingo P5 16, Iberojet E9 12, Boliviana OB 12, Royal Air Maroc AT 11, Transavia TO 10.

## Combos a normal one-ticket search could reproduce
- Madrid: Ryanair FR606/607 CPH-MAD as the cheap feeder (about 600 DKK) plus a long-haul from MAD: Air Europa UX55/56 MAD-PTY, Iberojet E9857/E9858 MAD-SJO, Avianca AV11/AV46/AV182/AV183 MAD-BOG, Iberia IB243 MAD-SJO, IB257 MAD-PTY. Single-ticket equivalents are IB/UX/AV direct from CPH with a connection in MAD; worth pricing on Expedia/Momondo as one ticket.
- Bogota: Avianca BOG-MAD (AV46, AV182, AV26) is the backbone of every cheap Bolivia-to-Europe result; AV166 VVI-BOG, AV224 LPB-BOG, AV104 LPB-CUZ-BOG feed it. A one-ticket VVI/LPB-BOG-MAD-CPH via Avianca + partner (Iberia/SAS/KLM) should be searchable.
- Panama: Copa CM771 CUR-PTY and CM182/CM876 PTY-GUA/BOG appear behind TUI fly Netherlands AMS-CUR (OR367) as a 3-ticket route; CPH-PTY via MAD on Air Europa is simpler.
- Lisbon/Toronto: TAP TP757 CPH-LIS, TP257 LIS-YYZ, Air Canada AC1457 YYZ-SJO; this is the only genuinely single-ticket cheap Kiwi routing (Air Canada via FRA or YYZ, 7900-7977 to SJO, 8112 to BOG), but with 2 or 4 Dec departure.
- Keflavik: Icelandair FI205/207 CPH-KEF then FI to JFK/EWR/IAD/BWI/MIA/MCO, onward with JetBlue, Copa, Volaris, Frontier, Arajet, Avianca. Cheap but 3-5 tickets, US transit, and overnights in the US. Icelandair KEF-MIA (FI691) then Avianca/Copa MIA onward is the cleanest variant (cabin bag included on Icelandair).
- Istanbul: no Turkish Airlines itinerary showed up in any top 8. Miami: appears as a self-transfer point (AV393/397/451 MIA-MGA/MGA, CM433 MIA-PTY) in MGA results.
- Odd hubs that appeared: CMN (Royal Air Maroc CPH-MAD/AGP-CMN-MIA, 5559-5950 one-way MGA), CCS (Estelar ES894 MAD-CCS then Wingo to BOG/MDE, 4339-4570 one-way, 4 tickets, dep 4 Dec, 22h overnight), CUR/BON (TUI fly), SDQ (World2fly/Arajet to MDE and BOG).

## Price observations vs known_prices.json
- Known one-ticket American CPH-MGA 6179 return is far below any Kiwi MGA return (10355+) and below even Kiwi's one-way MGA 5378 (dep 4 Dec) to 5906.
- Known KLM CPH-SJO 7128 return beats Kiwi's 7542.
- Known American CPH-BOG 6552 return beats Kiwi's 8112.
- Kiwi one-way VVI-CPH 4160 and LPB-CPH 4177 versus Google Flights VVI-CPH 8973: much lower on Kiwi, but separate tickets and long waits. The known Expedia multi-city GUA out + VVI home at 10500 looks high against Kiwi one-way sums (about 8400 to 8700).
- Returns to VVI (8845) and LPB (10457) are expensive on Kiwi, while one-ways home from VVI/LPB are cheap. Pricing return-to-Colombia/Central America plus a separate Bolivia-to-CPH one-way is the pattern Kiwi supports.
- Kiwi's cheapest results often use 2 or 4 Dec out and 1 or 3 Feb home. The 3 Dec / 2 Feb exact dates cost more (flag date_shifted_out / date_shifted_home marks these rows).

## Next round
- Price as single tickets on Expedia/Momondo: CPH-PTY via MAD (Ryanair/Iberia/Air Europa), CPH-SJO via MAD (Iberia/Iberojet), CPH-BOG via MAD (Avianca/Iberia), and home VVI/LPB-BOG-MAD-CPH.
- Test the open-jaw: out to GUA/PTY/MDE on 3 Dec, home from VVI or LPB on 2 Feb; compare with Expedia 10500.
- Check the Dec 2 and Dec 4 departures for the single-ticket Air Canada YYZ routing (SJO 7900, BOG 8112) since both are within a day of the target date.
- Check Ryanair FR606 times (06:10 CPH-MAD) for the 3 Dec departure; the cheap long-haul connection leaves MAD 13:00 to 16:20.
- Not worth it: Kiwi returns to GUA/MGA/MDE/CLO/CTG/LPB (all 8500 to 10500 with 4-6 tickets), anything via CCS (Estelar plus Wingo, Venezuela), and Keflavik-US itineraries with overnights in Orlando/New York.

## Problems met
- Kiwi tool has no per-itinerary baggage price: only personalItem/cabinBag/checkedBag counts; checked bag is none in all rows, cabin bag included only where Kiwi shows cabinBag 1 (Icelandair fares, Air Canada BOG rank 1).
- Several itineraries mix airports in a connection (LGW/LHR, ORY/CDG, FCO/CIA, WMI/WAW, EWR/JFK, YYZ/YTZ); these are flagged airport_change and need a ground transfer.
- Large return outputs (about 50k chars) are saved to file by the tool; smaller one-way outputs came inline only and were transcribed by hand into the jsonl, so typo risk is limited to the one-way out rows (checked against price list).
- Kiwi often lists duplicate-looking itineraries differing only by the first feeder flight (e.g. SAS vs Norwegian CPH-ARN); I kept them as separate ranks.
- Rank 9 and 10 results were not recorded (cap of 8 per search); notable omitted rows: SJO one-way rank 9 (4524, Icelandair/JetBlue 3 Dec) and rank 10 (4530, FR606 + E9857, 3 Dec), SJO return rank 9 (8005, Swiss/Air Canada via ZRH-YYZ).
