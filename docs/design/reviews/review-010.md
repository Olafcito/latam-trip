# Review 010: Planner Map tab, external roast

- Screen: map-tab (applies to web-map too, both share `web/src/map`)
- Date: 2026-11-04
- Shot folder: none
- Source: external roast written by Simon himself, no shots taken. The reviewer's text is recorded here rewritten in house style. Findings are observations and no ruling has been made.

**Verdict.** 7.5 out of 10, a strong foundation. The reviewer finds the map beautiful but designed more for admiring than for planning. One screen is asked to be a map, a destination explorer, a travel planner, a gym directory, an experience browser and a transport overview. The advice is to keep the map centric layout and fix the sidebar architecture and the map composition before polishing icons, radii or shades of orange.

Scores given, all out of 10 and a subjective read of one screenshot, not a usability test: overall aesthetic 9, map visualisation 8.5, information architecture 5.5, visual hierarchy 6, information density 5, interaction clarity 6.5.

| Id | Finding | Root cause | Journey step | Scope | Priority | Suggested fix as a task | Relation to earlier reviews |
| --- | --- | --- | --- | --- | --- | --- | --- |
| F1 | Overloaded sidebar with mixed information architecture. Destination description, stay prompt, experiences, training spots, ratings, connections, modes, durations and prices run in one vertical stream, and a gym, an experience, a connection and a stay are different kinds of thing | Features were added one by one without rethinking the structure | Inspect a destination | Information architecture | Critical | Make the panel contextual with distinct sections for overview, saved places, experiences, training and connections, as collapsible sections or tabs. Decide what shows by default | New. Related to review-008 F4 (layers replace the trip) and REC-002. Blocked by Q-011 |
| F2 | Poor map viewport composition. The frame shows a continent while the trip sits in a small area, so the right half is empty ocean and the busiest region is crammed | The camera does not frame the active trip or the selection | See the trip | Map component | High | Frame the map around the active trip or the selected destination with an adaptive viewport that gives the itinerary the screen | Repeats review-008 F3 and review-009 F2, and REC-007. Confirmed by a second reviewer, not new |
| F3 | Weak visual hierarchy. The selected destination is a small panel while the map carries dozens of labels, diamonds, dashed routes and country names, so there is no clear first look | No tiering of what matters | Read the screen | Design system | High | Three levels. Primary is where am I and what am I looking at. Secondary is what can I do here. Tertiary is how do I get there. One primary focus at a time | New. Related to REC-008 and review-009 F5 (selection barely shows). Depends on Q-011 |
| F4 | Orange carries every meaning: destinations, connections, selection, prices and indicators | One accent for several jobs | Read the map | Design system | Medium | Define semantic colour rules, see REC-018. Meaning, not extra colours | Repeats review-008 F1 and REC-005. Confirmed by a second reviewer, not new. Overlaps Q-001 |
| F5 | Dense typography and metadata. Categories, prices and secondary labels are tiny even on a wide screen | Optimised for fitting information, not for reading | Scan the panel | Component | Medium | Raise the size of metadata, categories and prices and standardise type, spacing, badges and metadata styles. Keep the density | New |
| F6 | Unclear transport visualisation. Dotted orange lines radiate like an airline network even when a link is a bus or a boat, and the Bus, Boat and Flight filters are not echoed in the lines | One line style for every mode | Read the connections | Map component | Medium | A line pattern per transport mode, see REC-019. Stronger saved against potential destination markers, a stronger selected marker, labels that appear by zoom | Repeats review-008 F1 and review-009 F2, and REC-013. Confirmed by a second reviewer, not new |

Already open in review-008 or review-009: 3 of 6 (F2, F4, F6). New: 3 (F1, F3, F5).

## The roast, as recorded

1. The map is 80 percent empty and 20 percent fighting for its life. Central America and Colombia are crammed together, the right half is unused ocean, and the interesting information sits around Panama. The problem is distribution, not map size.
2. The sidebar is a Christmas tree of information, and nothing reconsiders the whole after each added feature.
3. Visual hierarchy is upside down, see F3.
4. Orange is the language of everything, see F4. Example rules: the selected destination gets a strong accent, other saved destinations are muted, routes are distinguishable by transport type, ratings get their own treatment, warnings keep a reserved colour. Introduce meaning, not five new colours.
5. The typography looks designed for a distant 4K screen, see F5.
6. Connections are a different product hiding in the sidebar. It has an inbound and outbound toggle, fourteen connections, grouping by country, modes, durations, prices and expandable details, but it reads as a directory of search results. The idea is to give connections their own interaction model, where selecting a destination reveals its connections with filters for mode, duration and cost. The In, Out and count controls need clearer hierarchy, and it is not obvious what the number stands for.
7. Markers and routes need a design system of their own. The diamonds are consistent, which is good. Consider line patterns per mode, saved places against potential destinations, more prominent selected markers, and labels on zoom so that not every destination is labelled at every zoom.

## Restructuring ideas

- Keep the map centric layout. Change how the information is organised.
- A. Contextual panel. Sections for destination overview, saved places, experiences, training and connections, as collapsible sections or tabs depending on patterns elsewhere in the app.
- B. An intelligent map. Selecting a destination focuses the viewport, selecting a connection highlights its route, zoom changes label density, filters control which routes and markers show, selected places get a distinct treatment.
- C. A map interaction hierarchy. Separate map controls, content filters, transport filters and selected location information, which are now spread around the map without a clear relation.
- The map and the panel should behave as one interface. Selecting a place on the map updates the panel, and selecting a connection in the panel highlights it on the map.

Principles the reviewer applies: progressive disclosure, Gestalt grouping, visual hierarchy, recognition over recall, information density, direct manipulation.

## Proposed order

1. Information architecture. Restructure the panel sections, set the hierarchy between destination, experiences, training and connections, and decide what shows by default.
2. Map composition. Automatic framing, less marker and label clutter, selected against unselected states, route differentiation.
3. Design system. Semantic colours, type, spacing, badges, metadata and interactive elements.
4. Interaction refinement. Connect map and panel, improve filters, zoom dependent labels, selected destination behaviour.

## Hypothesis, not a finding

Overview, then contextual detail, then deeper information, as a consistent pattern across the app instead of showing everything inside one component. The reviewer says to test it on the other screens before it becomes a principle. It is recorded as an emerging observation only.

Emerging patterns the reviewer named, with evidence: too much density (map and booking card), weak hierarchy (map and overview map), metadata competing with primary content (booking card and panel), components with too many responsibilities (map panel and booking card), inconsistent semantic colour (several screens). These are hypotheses and are not entered as recurring problems here.

## Open question raised

Q-011. Is the map A, a geographic overview of the trip, B, an operational planner, or C, both. The reviewer's instinct is C. The answer changes the sidebar design and its interaction model, so F1 and F3 wait on it.

## Biggest opportunity

Do not spend the next round on icons, radii or shades of orange. Fix the panel architecture and the map composition first.

## Keep

The map centric approach, the consistent diamond markers, the density in itself (a travel dashboard should hold information), the connections feature as a strong idea, and the beautiful map.

## Rulings

None yet. All findings stay open for Simon.
