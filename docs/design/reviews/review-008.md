# Review 008: Planner Map tab

- Screen: map-tab
- Date: 2026-11-03
- Shot folder: `docs/design/shots/map-tab/1/`
- Source roast: `.superpowers/sdd/2026-11-03-ui-roast/roast-maptab-1.md`

**Verdict.** The desktop first frame is the best thing here, with the route on a dark map and the pane clear of it. After that the screen falls apart. The route cannot be told from the network of possible connections, every panel throws the camera out to a world view and then covers the subject, and layers replace the trip instead of sitting on it.

| Id | Finding | Root cause | Journey step | Scope | Priority | Suggested fix as a task |
| --- | --- | --- | --- | --- | --- | --- |
| F1 | The trip route cannot be told from the connection network | Both use the same yellow dash family and all layers default on | Step 1, see my route | Design system | Critical | Make the trip the only saturated line with chevrons, draw the network desaturated and only after a city tap, and default the mode layers off. |
| F2 | Stop markers and labels collide in the dense region | No collision pass and no merging | Step 1, read the stops | Component | High | Collide labels by priority, merge overlapping stops into a stacked badge that fans out on tap, and always label the fly in and fly home cities. |
| F3 | The camera abandons the route when a panel opens | No per panel camera and the panel covers the subject | Steps 2 and 3, inspect an offer | Design system | High | Fit each panel's subject with panel sized padding, draw the offered leg bold with the rest dimmed, and never zoom out to the world. |
| F4 | Layers replace the trip | Gyms and experiences are exclusive tabs ranked over the whole continent | Step 4, find gyms along the route | Information architecture | High | Make layers independent overlays with the route dimmed and the trip card kept, default scope along the route grouped by stop, and preselect the owner's discipline. |
| F5 | The phone controls form a wall and slide off the edge | Controls are positioned against the viewport, not the sheet or safe area | Step 5, use it on the phone | Screen | High | Drop zoom buttons, fold the mode pills into one layers button, and anchor one compact column to the sheet. |

**Keep.** The desktop first frame, green for fly in and orange for fly home used the same way in the map and the pane, tight leg rows, stop cards with a flag, a number and a nights chip, the collapsed mini trip card, gym score colours, and calm experience clusters.

Further findings: 11 more in the roast file (the one option way in panel, a leg offer that leads with what it does not know, the gym marker noise, the one stop phone sheet, instruction prose, two legends, truncation, the cryptic status chip, the spreadsheet look of the way in panel, desktop leftovers, the loud Save trip). See `.superpowers/sdd/2026-11-03-ui-roast/roast-maptab-1.md`.
