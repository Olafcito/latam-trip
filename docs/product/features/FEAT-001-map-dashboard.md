# FEAT-001: The map as the trip dashboard

- Date: 2026-11-04
- Status: Drafted

## 1. Problem

The planner Map tab and the public web map (they share `web/src/map`, per review-010) each try to be a geographic view of the trip and a place to manage it, without a structure that supports both at once. The sidebar runs destination description, a stay prompt, experiences, training spots, ratings, connections, modes, durations and prices as one vertical stream (review-010 F1). The camera does not fit what is open: a continent shows while the trip sits in a small crammed area (review-010 F2, review-008 F3), and a panel can throw the view out to a world map instead of fitting its subject (review-008 F3). Layers such as gyms and experiences replace the trip instead of sitting on it (review-008 F4). There is no clear first look: the map carries dozens of labels and routes while the selected thing gets a small, equally weighted panel (review-010 F3).

Simon's ruling on Q-011 settles why this keeps happening: the map is deliberately both a geographic overview and the operational planner, a geographic interface that doubles as the central management dashboard for places, experiences, training, stays and transport. The fixes above were blocked on this answer because a sidebar built for pure geography and one built for pure management are different shapes. This spec is the structure for the single surface that is both, not a redesign that picks one job over the other.

## 2. Journey

Numbered moments on the planner Map tab (Simon, during planning) and the public web map (a guest, or Simon himself reading research), on laptop and phone.

1. **See the whole trip.** Open the map and the active trip's route fills the frame, not a continent with an empty ocean half (review-010 F2, review-008 F3, REC-007).
2. **Read what a stop holds.** Tap a destination and see one place: where it sits, what is already saved there (a stay, experiences, training), and its connections in and out, organised in sections rather than one long stream (review-010 F1).
3. **Act on a stop.** From that same panel, manage the stop: add or edit a stay, a place, an experience or a training session, without leaving the map. This is the operational half of "both".
4. **Inspect a connection.** Tap a route between two stops and see it highlighted with its real detail (mode, duration, price), the camera fit to the leg, not the whole continent (review-008 F3, review-010 restructuring idea B).
5. **Browse a layer along the route.** Toggle gyms, experiences or training as an overlay on the trip, scoped along the route by default, with the trip still visible and the trip card still present (review-008 F4).
6. **Use it on the phone.** The same five moments with no control column sliding off the edge, no legend covering the zoom buttons, and the sheet behaving like the rest of the app's sheets (review-008 F5, REC-009, REC-010).
7. **A guest reads research (web map only).** Someone without a sign in opens the public map and gets the same geographic and contextual structure, minus the management actions that need an account (ties to Q-007, DES-028).

## 3. Goals

- One map and panel pair that is the geographic overview and the operational dashboard at the same time, not two screens or two modes.
- A contextual panel with distinct sections (overview, saved places, experiences, training, connections) instead of one mixed stream, resolving review-010 F1.
- A camera that fits whatever is open at every step of the journey: the trip, a stop, a connection, never a default world view, resolving review-010 F3 together with review-008 F3.
- Layers that sit on the trip as overlays and never replace it, scoped along the route by default (review-008 F4).
- A visible primary, secondary and tertiary order on screen so the first look matches the journey step (review-010 F3, restructuring idea C).

## 4. Non goals

- Settling the colour semantics for selection, saved places, ratings and warnings (Q-001, REC-018, REC-019). Those are open questions this spec depends on, not solved by it.
- Deciding whether the connection network shows by default to a planner versus a guest (Q-003). Left open per screen until decided separately.
- Redesigning the connections data model itself, only how it is presented in the panel and on the map.
- Any change to the trips list, the compare tray, or the trip page's own screen, which are separate screens in the design log.
- Splitting the map into separate "overview" and "management" products or modes. Simon's ruling on Q-011 rejects that split outright, both happen in the one surface.

## 5. User stories

1. As Simon, opening the map, I want the camera to fit the active trip's route so that I see the whole trip at a glance, not a continent with an empty ocean half.
2. As Simon, tapping a destination, I want its panel organised in sections for overview, saved places, experiences, training and connections so that I can read what is already there without scrolling one long stream.
3. As Simon, from an open stop's panel, I want to add or edit a stay, a place, an experience or a training entry without leaving the map so that managing the trip and viewing it stay the same action.
4. As Simon, tapping a connection, I want it highlighted with its mode, duration and price while the camera fits the two ends of that leg so that I can judge the leg without the view jumping out to the whole continent.
5. As Simon, turning on a layer such as gyms or experiences, I want it to sit on the trip as an overlay, scoped along the route by default, with the trip card still present, so that the trip never disappears while I browse.
6. As Simon, using the map on my phone, I want the same stop, connection and layer moments with the control column inside the safe area and the sheet behaving like the rest of the app's sheets, so that nothing slides off the edge or hides the zoom buttons.
7. As a guest, opening the public map signed out, I want the same geographic and contextual structure minus the actions that need an account, so that I can read the research without signing in.

## 6. Acceptance criteria

Story 1
- On opening the map with a trip active, the camera's fit bounds equal that trip's stops, not the map's full extent, and nothing renders a world view first.
- Opening a trip with stops concentrated in one area keeps the frame on that area, never zoomed to the whole continent.

Story 2
- The panel for a selected place renders its sections in one fixed order: overview, saved places, experiences, training, connections.
- A section with nothing to show for that place is left out entirely, never shown with an empty heading.
- The saved places section lists the experiences and training rows already marked for that place, the same marking the experiences layer already shows as Saved, not a separate list.

Story 3
- From the open stop panel, Add a place, add or edit a stay, add an experience and add a training entry are each reachable without closing the panel or leaving the map screen.
- Saving an edit from the panel updates the same panel in place and does not navigate to another screen, per PROD-003.

Story 4
- Tapping a connection line or its row in the panel highlights that connection and moves the camera to fit its two ends with padding, not the whole trip.
- The route panel shows the connection's mode, duration and price. A duration or price that is not known renders as a hollow mark per DES-013, never as zero and never as the word unknown.

Story 5
- Turning on the gyms or experiences layer keeps the trip line and the trip card drawn, dimmed but present, per DES-030.
- The layer's rows default to the stops and route of the open trip and widen to the whole map only on a further action from Simon.
- Turning the layer off returns the trip's own layers to how they looked before the layer went on.

Story 6
- At phone width, the control column sits inside the safe area at every sheet detent, peek, half and full, and never overlaps the legend or the zoom buttons.
- The phone sheet exposes one grabber, the three detents and one close control, matching the rest of the app's sheets per DES-017.
- No zoom buttons render on a touch viewport.

Story 7
- Signed out, the public map opens directly on the route with no sign in row and no empty planner state, per DES-028.
- The signed out panel renders the same section set with no add or edit control, and nothing from the lodgings or bookings tables appears anywhere on the page.

## 7. Functional requirements

- The camera recalculates its fit on every change of what is open, the whole trip, a selected stop or a selected connection, and never defaults to a world view.
- Selecting a place loads its overview, saved places, experiences, training and connections from the places, experiences and connections tables and from the stay records for that place id.
- The saved places section is built from the same mark data the experiences layer already reads, not a new store.
- A layer toggle, gyms or experiences, is an independent boolean. Turning one on never unmounts or hides the trip's own route, stops or trip card.
- A layer's default row set is scoped to the stops and route of the open trip. Widening to the whole map is a separate, explicit action.
- Panel actions write through the trip MCP tools that already back the existing Add a place, stay and experience flows, `add_place`, `add_stay`, `add_experience`, `add_connection` and their update and delete pairs, not a new write path.
- A stop, a stay, an experience, a training entry or a connection opens inside the panel over the map, never on a separate page, per PROD-003.
- The signed out web map omits add and edit controls and any lodgings or bookings derived content at render time, not by hiding them with styling, since the page and its bundle are public.

## 8. UX requirements

- DES-016. Every panel sets a camera that fits its subject, with padding equal to the panel width on desktop and the sheet height on the phone. No panel in this spec ever zooms out to a world view.
- DES-017. One phone sheet standard across every moment of this journey: a grabber, the peek, half and full detents, one close, and a compact control column inside the safe area that moves with the sheet. No zoom buttons on touch, and the legend lives behind the layers button.
- DES-029. The selected thing draws as the hero with its connections lit, the past quiet, the future plain, and the camera follows the selection through every moment.
- DES-030. A layer sits on the trip, never replaces it. The route stays drawn and dimmed, the trip card stays, and the default scope is along the route.
- DES-015 is still Proposed, and Q-001, Q-018 and Q-019 are open. The colour choices this spec needs, selection, booked, layer markers and the mode vocabulary, wait on that palette rather than inventing one here.
- Whether the panel's five sections are collapsible sections or tabs is not decided anywhere in the design log. The existing pattern on this screen, CityBody and PlaceSections, already folds long lists behind a Show all control rather than tabs, and the experiences layer already renders a Saved group the same way. This spec proposes keeping that one pattern, collapsible sections in a fixed order, for the product lead to confirm rather than introducing tabs as a new control.

## 9. Edge cases

- Empty. A stop with nothing saved shows only its overview section, no empty saved places, experiences, training or connections heading.
- Very long. A stop with many experiences, training entries or connections keeps the panel's size with the existing Show all fold, rather than growing the panel to fit the list.
- Missing. A connection with no known duration or price renders the DES-013 hollow mark in both the panel and the map, never a zero and never the word unknown.
- Offline. Opening the map on the phone with no network keeps the last loaded trip and places on screen. A panel action that needs to write waits or disables rather than failing silently.
- A date outside the trip. A stay or a training entry saved for a place still shows in that place's panel even when its date range falls outside the open trip's current stop dates, per PROD-004.
- The phone. Opening a stop's panel never covers the zoom buttons or the legend, and the sheet's peek detent still shows the stop's name.
- The guest. Signed out, a stop with a lodging or a booking saved against it shows no trace of that record anywhere in the panel.

## 10. Dependencies

Planner (`planner/src`):
- `planner/src/screens/MapScreen.tsx`, the Map tab screen.
- `planner/src/components/PlannerMap.tsx`, the route map with the planner's journeys as its trips, and its `CityStays` block.
- `planner/src/components/TripPanel.tsx`, the trip pane beside the map.
- `planner/src/components/MiniMap.tsx`.
- `planner/src/data/routeMap.ts` and `planner/src/lib/mapTrips.ts`, which build the trip state the map draws.
- `planner/src/components/stays/AddPlace.tsx`, `StayCard.tsx` and `WhereToStay.tsx`, the stay actions this spec keeps reachable from the panel.

Web map (`web/src/map`, shared with the planner through the `@map` alias):
- `Panel.tsx`, `CityBody.tsx` and `PlaceSections.tsx`, the contextual panel and its sections.
- `CardParts.tsx` and `CardWindow.tsx`, the rows and windows a saved or layer item opens.
- `Controls.tsx`, `sheet.ts` and `ModeSheet.tsx`, the control column and the phone sheet.
- `layers.ts`, `RouteMap.tsx`, `tripDraw.ts` and `modeLayers.ts`, the camera fit, the trip drawing and the layer toggles.
- `GymsPanel.tsx`, `ExperiencesPanel.tsx`, `WayPanel.tsx` and `TripBar.tsx`, the layer and connection views.
- `../data/gyms.ts` and `cityFacts.ts`, read only here. Training is the training category of the experiences table, crawled data, not a table of its own.

Supabase tables: places, connections, experiences (training included, by category), stays, lodgings and bookings.

Trip MCP: `add_place`, `add_experience`, `add_stay`, `add_connection` and their get, list, update and delete pairs, already used by the stay and place actions above.

Privacy. Lodgings and bookings are owner only tables per PROD-005. The signed out web map, journey step 7, must never render a row from either table, and the public bucket and bundle must never carry one.

## 11. Checks

- Story 1's camera fit criteria get a test alongside the existing RouteMap and tripDraw tests, plus a screenshot of the map on opening a trip.
- Story 2's section order and omission criteria get a test alongside Panel.test.tsx and CityBody.test.tsx.
- Story 3's reachability criteria get a screenshot, since the claim is about layout, not data.
- Story 4's connection fit and hollow mark criteria get a test alongside tripDraw.test.ts and cardScan.test.tsx, plus a screenshot of the hollow mark.
- Story 5's layer overlay and default scope criteria get a test alongside modeLayers.test.ts.
- Story 6's safe area, detent and no zoom buttons criteria get a screenshot at phone width across peek, half and full, plus a test alongside sheet.test.ts.
- Story 7's signed out structure and privacy criteria get a screenshot of the signed out web map, plus a test that the render omits add, edit and lodgings or bookings content.
- A design review of the built screen judges all seven journey steps before this spec moves to Reviewed by design. This spec asks for it because the screen is the central dashboard, not because of a standing rule (DES-012 is Reconsidered).

## 12. Open questions

- Q-001 (design log). Which palette carries flight, selected, planned and primary action together. Blocks the colour parts of section 8. Decided by the senior designer.
- Q-003 (design log). Whether the connection network is on by default for a planner versus a guest. Decided by the product lead.
- Q-018, Q-019 (REC-018, REC-019, flagged). The semantic colour rule for the map and a route line pattern per transport mode. Decided by the senior designer.
- Whether the panel's five sections are collapsible sections or tabs. This spec proposes collapsible sections, following the existing CityBody, PlaceSections and experiences layer pattern. Decided by the product lead.
- What a saved places section holds exactly, only experiences and training already marked at that place, or also a bookmarked place itself with no marked item under it. Decided by the product lead, since no existing component draws this section today.

## Completeness

Every journey step has a story, and every story has acceptance criteria with a named check. Still thin: the saved places section has no existing component to copy and its exact shape is an open question, Q-001, Q-018 and Q-019 leave the colour pass of section 8 undecided, and whether the five sections are tabs or collapsible sections is a proposal here, not a decision.
