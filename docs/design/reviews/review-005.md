# Review 005: Way in and way home picker

- Screen: way-picker
- Date: 2026-11-03
- Shot folder: `docs/design/shots/way-picker/1/`
- Source roast: `.superpowers/sdd/2026-11-03-ui-roast/roast-waypicker-1.md`

**Verdict.** A spreadsheet dressed up as a decision. The grid ranks pairs with unexplained scores and no price, the real price sits in a very long table, and no shot shows a control that applies the pair to the trip. On the phone the matrix and the table are unusable.

| Id | Finding | Root cause | Journey step | Scope | Priority | Suggested fix as a task |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | The grid ranks pairs without price or reason | Cells show a bare score and the price lives elsewhere | Step 2, pick the cheapest sensible pair | Component | Critical | Put the total price in every cell, carry rank in the cell colour, and show factor chips on hover or selection. |
| F2 | No visible way to pick a flight and apply it | The detail has booking links but no commit action | Steps 5 and 6, take the pair | Screen | Critical | Add a selected state per option and one primary button pinned to the detail, labelled with the result. Return to the trip with the new ends highlighted. |
| F3 | Return against one ways is split in two modes | The mix mode has its own scale and no running total | Step 3, compare ticket types | Information architecture | High | Drop the mode split and show the best one ticket and best two one ways option side by side with the difference. |
| F4 | On the phone the matrix and table are unusable | A two axis grid inside a scrolling page, with the price column cut off | Steps 1, 2 and 5 on the phone | Screen | High | Replace the matrix with ranked pair cards with the price large, add filter chips, and stack option rows as cards. |
| F5 | On desktop the pair detail opens below the fold | The detail renders under the grid and two cells look selected | Step 5, read the options | Screen | High | Use the empty right column as a sticky detail panel and give one strong selected state. |

**Keep.** The flight timeline cards, the moon icons for hub nights, the bag cost with an icon, country grouped rows with flags, the phone bottom sheet for the home airport, and the No US transit and Max hub nights filters.

Further findings: 10 more in the roast file (the one option home airport menu, a table that repeats near identical rows, three scoring scales, a heat map that marks only the top group, a garbled title, prose lines, flight card details, code only columns, lookalike segmented controls, build chrome). See `.superpowers/sdd/2026-11-03-ui-roast/roast-waypicker-1.md`.
