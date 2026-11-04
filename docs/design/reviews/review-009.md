# Review 009: Public web map

- Screen: web-map
- Date: 2026-11-03
- Shot folder: `docs/design/shots/web-map/1/`
- Source roast: `.superpowers/sdd/2026-11-03-ui-roast/roast-web-1.md`

**Verdict.** A researcher's workbench with the door left open. A guest meets a sign in form first, then a map of near identical dots with no lines, and the ranked trip options sit behind a ghost button while the primary slot goes to an empty planner. Tapping an option or a connection barely changes the map, and on the phone the options cover the whole screen.

| Id | Finding | Root cause | Journey step | Scope | Priority | Suggested fix as a task |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | The public link opens on a sign in form | The guest view reuses the signed in header | Steps 1 and 5, open the shared link | Information architecture | Critical | Delete the row and put sign in behind one person icon. |
| F2 | The overview is a pile of dots with no routes | The camera fits all cities and no network is drawn | Step 1, see the connections | Screen | High | Fit bounds to the researched cities, draw the network faintly, size markers by connectivity, and run a label collision pass. |
| F3 | Trips owns the top left and the research hides behind Options | The planner entry is primary and the word trips means two things | Steps 1 and 2, reach the options | Information architecture | High | Rename Options for what it holds, make it primary, and hide the device saved planner for guests. |
| F4 | The options table hides the price | A wide table with a repeated scenario column pushes the price off screen | Step 2, compare options | Component | High | Replace it with ranked cards: rating, route chain, large price, hours and chips. Move the scenario into the existing filter. |
| F5 | Tapping an option barely shows on the map and not at all on the phone | The selection draws a single ring and the pane fills the phone | Step 2, see the option on the map | Design system | High | Draw the full itinerary as numbered legs, dim the rest, fit the camera, and collapse the sheet to a peek card on the phone. |

**Keep.** The mode colour system across pills, lines, chips and cards, the city connection list grouped by country, the Flight versus Bus cards, the fares by date rows with a lowest marker, dimming and drawing on a city selection, proper bottom sheets for the city and route panels, and the restrained basemap.

Further findings: 10 more in the roast file (the options full screen page on the phone, the connections buried under a brochure, a route tap that leaves the map unchanged, phone chrome, the repeating and contradictory route panel, uneven connection chips, desktop manuals, flat rating pills, the wandering Trips button, two paragraphs of prose in the options pane). See `.superpowers/sdd/2026-11-03-ui-roast/roast-web-1.md`.
