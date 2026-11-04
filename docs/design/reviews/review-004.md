# Review 004: Trips list, compare tray and sign in

- Screen: trips-list
- Date: 2026-11-03
- Shot folder: `docs/design/shots/trips-list/1/`
- Source roast: `.superpowers/sdd/2026-11-03-ui-roast/roast-trips-1.md`

**Verdict.** A spreadsheet that learned to draw flags. It answers what the stops are and almost nothing else: which trip is the current plan, how long each is, and whether a price is real. Compare opens on rows where both trips say zero, and on the phone it is unusable.

| Id | Finding | Root cause | Journey step | Scope | Priority | Suggested fix as a task |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | No current plan marker | The pin icon is identical on every row and the booked chip sorts last | Step 2, know my current plan | Information architecture | Critical | Pin the current plan as its own card above the sortable list with a Current label that does not move, and make the pin a filled versus outline Make current action. |
| F2 | Prices lie by omission | Unpriced legs count as zero and the header says all in over a from price | Steps 2 and 3, compare cost | Design system | Critical | Never render an unknown as zero. Show a count with a hollow icon, outline totals when incomplete, and booked versus estimated as two segments of one bar. |
| F3 | The route strip does not tell trips apart | Equal width beads with look alike flags and a key free connector code | Step 2, tell them apart | Component | High | Replace it with the shared nights scaled timeline on one axis for every row, keeping the start and end labels. |
| F4 | Compare shows sameness and not difference | All rows are listed equally and the route is a sentence | Step 3, compare | Component | High | Lead with totals and a signed delta, then the stacked timelines, then flight and booked counts. Fold identical rows under one line and highlight only differing stops. |
| F5 | Compare on the phone is unusable | Three columns squeezed into a tray with two scroll axes | Step 3 on the phone | Screen | High | Open compare as a full height sheet, stack per metric with a swatch per trip, and allow no horizontal scroll. |

**Keep.** The start and end pins with city labels, the booked chip with a ticket icon and count, the cap of three with its counter, tinted selected rows, the phone strip that drops the home bookends, tertiary export and import links, and the price typography once honest.

Further findings: 9 more in the roast file (no visible way to open a trip, anonymous icon actions beside delete, truncated names, mixed rank and version labels, build chrome, the anonymous sign in card, the loud New trip button, the tray covering rows). See `.superpowers/sdd/2026-11-03-ui-roast/roast-trips-1.md`.
