# Review 002: Trip page

- Screen: trip-page
- Date: 2026-11-03
- Shot folder: `docs/design/shots/trip-page/1/`
- Source roast: `.superpowers/sdd/2026-11-03-ui-roast/roast-story-1.md`

**Verdict.** A tidy itinerary editor that does not answer where the trip stands. It never says how long the trip is or how much is booked, the loudest object is the Save trip button, and open items look like done ones. The editing steppers are the heaviest thing on every stop row.

| Id | Finding | Root cause | Journey step | Scope | Priority | Suggested fix as a task |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | No trip status at the top | The header carries admin controls and a cost sentence instead of status | Step 1, see the state of the trip | Information architecture | Critical | Add a status row as the first block: nights with dates, cost with a paid share, booked and open chips that jump to the first open leg. Demote Save trip. |
| F2 | Open items do not stand out | Booked is a thin border and ground legs have no state | Step 3, find what is open | Design system | High | Make done quiet and open coloured with an inline action, give every mode the same marker, and add an Open only filter. |
| F3 | All costs shows trivia and not where the money goes | The expanded strip lists counts, zeros and unknowns | Step 5, understand cost | Component | High | Replace it with a breakdown by category, each a bar split into paid and estimated, hide zero rows, and show unknown fees as one hatched segment. |
| F4 | Stop rows lead with an editing stepper and bury dates | The stepper is the heaviest control and stops carry no date range | Step 2, read the order and dates | Component | High | Show name, date range and nights as a plain figure, reveal the stepper only on tap or in edit mode, and show a lock on locked stops. |
| F5 | Guatemala City says it is both passing through and four nights | Free nights belong to no place and are described in a sentence | Step 2, read the order and dates | Information architecture | High | Render free nights as their own timeline row with a dashed marker, dates and a number, with an action to assign them. |

**Keep.** Flags as stop markers, the vertical spine with alternating stops and legs, the green checked flight chip, consistent mode icons, the category split under the headline, the from and to bar on the bus card, and the phone layout without horizontal scroll.

Further findings: 6 more in the roast file (the thin bus card with airport codes on a park, no today on the phone, admin clutter in the header, thin leg rows, line styles, the popover hiding its anchor). See `.superpowers/sdd/2026-11-03-ui-roast/roast-story-1.md`.
