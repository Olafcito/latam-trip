# Scenarios (L0, above route patterns) — added 28 Oct 11:26
Total cost of a scenario = main ticket (Europe in/out) + the regional legs the scenario forces. Compare scenarios on that total, plus hours and conditions.

- SC1 Open jaw, Bolivia last: CPH -> Central America or Colombia (3 Dec), VVI/LPB -> CPH (3 Feb, 2 Feb optional). Forced regional legs: one flight from Central America/Colombia into Bolivia late January.
- SC2 Return to Central America/Colombia, no Bolivia at the end: CPH <-> X (3 Dec / 3 Feb). Forced regional legs: none (Bolivia optional, see SC3).
- SC3 Bolivia for Christmas: main ticket as SC2 (return) or SC1, plus a Bolivia round trip around Christmas (in about 18-22 Dec, out about 26-29 Dec) from/to Central America or Colombia. Forced regional legs: X -> LPB/VVI/CBB and back (or onward).

Note (Simon, 28 Oct 11:27): SC3 is mainly an analytics question for the regional (inter-LatAm) legs and can be combined with Colombia (e.g. Bolivia over Christmas reached from or returning to Colombia). It is NOT a main-ticket search priority now: handle it in regional-leg prioritisation and post-run analytics (scenario totals = main ticket + forced regional legs).

- SC4 Guadalajara (added 28 Oct 11:52): Guadalajara (GDL) for about a week at the start or end, then fly on (e.g. Volaris GDL<->MDE direct, 2,608 DKK return 2/4 Dec found by Simon). Variants: CPH<->GDL return; CPH->GDL out + other exit home; start elsewhere and end in GDL; GDL as a return-trip side trip. Prioritise in analytics like SC3.

## Forced regional legs (used by scripts/scenarios.py, 28 Oct 12:20)
- Bolivia is visited last and entered via La Paz (LPB), then Cochabamba, then Santa Cruz (VVI); home from VVI. So SC1 adds one leg X -> LPB (late January, window 24 to 30 Jan) unless the main ticket already includes it.
- SC2 (return elsewhere) adds X -> LPB plus VVI -> exit airport (about 1 Feb) before the flight home.
- SC4 adds GDL -> next country (about 10 Dec) when GDL is the entry.
