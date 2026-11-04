# Review 001: Trip map

- Screen: trip-map
- Date: 2026-11-03
- Shot folder: `docs/design/shots/trip-map/1/`
- Source roast: `.superpowers/sdd/2026-11-03-ui-roast/roast-map-1.md`

**Verdict.** The rest state has the right big idea: flags sized by nights, gold for flights, ground in teal, solid for booked and dashed for plan. It fails every time the viewer leans in. Central America, where most of the countries are, is a tiny smear while the empty ocean fills the frame, and opening or choosing a country does not move the camera.

| Id | Finding | Root cause | Journey step | Scope | Priority | Suggested fix as a task |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | Central America is unreadable and flags overlap | The camera fits a bounding box instead of the stops | Readable at drawn size | Screen | Critical | Fit the camera to the stops weighted by nights and add a magnified inset for the dense region. No two flags overlap at rest and every leg is at least 24 px long. |
| F2 | Opening a country only labels a blob | A tap changes labels but not the camera, and label placement changes geography between viewports | Open a country into its places | Component | High | Fly the camera to the country, draw real place dots joined in visit order with the same mode styling, no leader lines, and a fixed back control. |
| F3 | The phone wastes a third of the screen and flags are too small to tap | The map is a partial sheet and hit areas follow the drawn size | During the trip on the phone | Screen | High | Make the map full screen on the phone with floating title and bar, and give every flag a 44 px hit area. |
| F4 | Choosing a country does not make it the hero | Two tiers only and no camera move | Step country by country | Design system | High | Build three tiers (done, chosen, future), light the chosen country's legs, ease the camera, and add swipe and arrow key stepping. |
| F5 | Mode is encoded three incomplete ways | Colour on the map, glyphs in the bar, and the phone drops the filled glyphs | Flight versus bus, booked versus plan | Design system | High | Put the leg glyph between chips, give every leg including first and last one, redraw the bus and add a boat, and keep filled for booked and outlined for plan on both map and bar. |

**Keep.** Flags as markers sized by nights, gold for flight with teal for ground, solid versus dashed, midpoint chevrons, the dimming family of idea, the quiet dark basemap, and the title with its date range.

Further findings: 8 more in the roast file (the distorted dashboard strip, the unlabelled draw animation, the chip bar without a today, gold overuse, prose hints, home legs that miss the flags, size order at the small end, the desktop card in a void). See `.superpowers/sdd/2026-11-03-ui-roast/roast-map-1.md`.
