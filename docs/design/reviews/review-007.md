# Review 007: Booked flight sheet

- Screen: booked flight sheet, part of the flight sheets (slug flight-sheets)
- Date: 2026-11-03
- Shot folder: `docs/design/shots/flight-sheets/1/` (the files starting 03, 06 and 07)
- Source roast: `.superpowers/sdd/2026-11-03-ui-roast/roast-booking.md` (an outside reviewer's roast, references redacted)

**Verdict.** The booked sheet reads like a bank transaction crossed with a boarding pass. Three visual identities compete: a loud green confirmation, dark flight information and grey metadata pills. The flight itself is clean, but the confirmation, the reference block and the notes take more space than the flight, and the notes show raw database text.

| Id | Finding | Root cause | Journey step | Scope | Priority | Suggested fix as a task |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | The green confirmation header takes more attention than the flight | Booked status is a full width banner | Read the booked ticket | Component | Medium | Shrink the banner to a small green check with a Booked label. |
| F2 | The booking reference block is too tall | A labelled section with large padding | Find the reference | Component | Low | Make it one compact row with a copy icon. |
| F3 | The notes show raw database text mixing airline, seller, reference, money and other flights | Imported strings were stored as the traveller's notes | Read what was booked | Design system | High | Store booking facts as structured fields and keep the notes for text the traveller writes. |
| F4 | The flight line and plane are almost invisible, and it is unclear whether times are local | Low contrast mark and no duration or zone cue | Read the flight | Component | Medium | Draw a stronger line with the duration on it and mark times as local. |
| F5 | The bottom date strip is crammed and shows a price on a booked day | The strip is reused unchanged on a booked leg | Trust a booked leg | Component | Medium | Remove prices from the strip on booked legs, or explain what the figure is. Compare DES-023. |

**Keep.** The clean airport pair and times of the flight section.

**Idea left open.** Clicking a date could show everything that day (flights, check ins, activities, transport). See Q-005 in the index.

Further findings: none beyond the five above.

**Update 2026-11-04, from review-011.** The booked flight sheet was rebuilt in commit `4501c87`, after this review and before any of these findings were ruled on. Review-011 found the shapes behind F1, F2 and F3 gone from the rebuilt sheet. They are recorded as resolved, not superseded, because the rebuild happened to fix them without anyone ruling on this review's suggested tasks. F4's structural half (a visible flight line with duration) is resolved the same way, but F4's colour complaint stays open, folded into Q-001. F5 is superseded, not resolved: the rebuilt sheet replaces the crammed strip with a day picker whose own new problems are recorded fresh in review-011, so review-011 carries F5's thread forward rather than this review.
