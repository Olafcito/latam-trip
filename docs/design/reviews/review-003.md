# Review 003: City sheets and map city panel

- Screen: city
- Date: 2026-11-03
- Shot folder: `docs/design/shots/city/1/`
- Source roast: `.superpowers/sdd/2026-11-03-ui-roast/roast-city-1.md`

**Verdict.** A travel guide with a booking form taped to it, when it should be a decision tool for where to sleep. The add form asks for amenities but not price or dates, so the stay list the journey promises cannot exist. The same city also has two different designs on the trip sheet and on the map panel.

| Id | Finding | Root cause | Journey step | Scope | Priority | Suggested fix as a task |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | The add form has no price, dates or area | The form was built from the amenity list, not the decision | Step 3, record a stay | Component | Critical | Put a large price per night with a live total, one tappable date range prefilled from the city, and an area field directly under the name. |
| F2 | Nights and dates are missing or half shown | The two surfaces compute different headers | Step 1, see the city's nights | Information architecture | High | Share one header with the nights count large and the full date range beside it. |
| F3 | The empty Where to stay state is a ghost button nothing points to | The slot is not shaped like the stay card it becomes | Step 2, start choosing a stay | Component | High | Make a filled slot with a bed icon, a warning tint on uncovered nights and a primary Add a place button, plus search buttons that carry the dates. |
| F4 | The same city comes in two designs | Two components exist for one object | Steps 1, 2, 4 | Design system | High | Build one city component with the same header, section order and counts in both frames. |
| F5 | The phone map shows controls and not the map | Controls and legend are not hidden or repositioned when a sheet opens | Close the panel and know where you are | Screen | High | Hide the legend and toggles while a city sheet is open, centre the city in the visible strip, and keep controls in the safe area. |

**Keep.** The hero photo, the bold nights figure at top right, Where to stay before the guide content, Hostel as default, the clear primary button with a plain Cancel, compact experience rows with counts, the dense connection chips when they have data, the pinned Open in map footer, and the side panel that keeps the route visible on desktop.

Further findings: 12 more in the roast file (the form priorities, the repeated lists, training that lists a city score and a boxing club, the long connection picker, the pinned hero over the form, stacked close buttons, prose in the footer, the photo credit, the unscaled rating dots, amber overuse, mixed control signals, sheet behaviour). See `.superpowers/sdd/2026-11-03-ui-roast/roast-city-1.md`.
