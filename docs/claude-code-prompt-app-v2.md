Build the next version of the trip app in the repo Olafcito/latam-trip (the React app in `web/`, on `main`, the only branch). The UX and visual design is done separately in the Claude app; I'll attach that design. Implement the design as given, and don't invent the UX yourself. Where the design is silent, follow the brief and keep it simple, and list those choices at the end of your reply.

Read first:
- The design from the Claude app (attached): the screens, flows and look. This decides the UX.
- `docs/ux-brief-experiences-and-tasks.md`: the features and user stories the design was made from (experiences, saved lists, trip builder, asking Claude, freshness).
- `docs/claude-tasks.md`: the fixed contract for tasks (issue format, task types and fields, the prompt template for "Ask Claude now", the public issues endpoint).
- `DESIGN_HANDOFF.md` and `docs/route-map/MAP_DESIGN_HANDOFF.md`: the current app's design, for anything the new design doesn't cover.

Data (read only, built by `src/build_web_data.py`; don't change the exporters or anything in `data/`, and if you need a field that doesn't exist, list it at the end of your reply instead):
- `data/web/places.json`: now also has `experience_ids`, `saved_in` and `stay_quotes` per place.
- `data/web/experiences.json`, `data/web/experience_categories.json`, `data/web/lists.json`, `data/web/task_log.json`, `data/web/meta.json` (new).
- `data/web/connections.json` and the `dash_*.json` datasets (existing), for the trip builder's known prices.
Add the new files and fields to `web/src/data/types.ts` and the loader.

What to build (the screens come from the design; the functional details are below and in the brief):
1. Experiences: a tab per place, and browsing across all experiences with category filters (with category photos), plus filters for Dec/Jan fit, price, country, requirements and researched. Experiences without a map place still show on the map. Photo credits are visible.
2. Saved lists: save places and experiences with a note, view and edit lists, show saved items on the map. Saves are instant and kept in the browser. A "send to Claude" action turns unsent changes into one `lists_update` task, and the app shows what is unsent.
3. Trip builder in the trips part: flights between any two places, or a self-built itinerary of legs (from, to, date, flex days 0 to 3), using the nearest airport for places without one. Show what's already known per leg (cheapest and fastest, local clock times, hours, airlines, checked date) and which legs were never priced. Name, save and edit itineraries in the browser, and send one as a `flight_prices` task.
4. Ask Claude: actions on places, legs, itineraries and experiences (flight prices, stay prices, research an experience or a new place, a question). Each action builds a task per `docs/claude-tasks.md` and offers:
   - "Add to checklist": open the prefilled GitHub new-issue URL in a new tab.
   - "Ask Claude now": copy the prompt from the template to the clipboard, and open https://claude.ai/new in a new tab.
   A checklist view reads open and closed `claude-task` issues from the public REST API (no token; cache it and handle the 60 requests per hour limit and offline use) together with `task_log.json`.
5. Freshness: a discreet corner element with "last checked" times from `meta.json`, and an update button that sends a `refresh` task (scope all), plus per-item refresh where it makes sense. Show the age of individual prices.

Rules:
- No tokens, passwords or GitHub writes from the app. Simon submits every issue himself.
- Prices in kroner, local clock times, no em or en dashes in any UI copy. Never offer booking.
- It must work well on a phone.
- Keep `npm run typecheck` and `npm test` green. Add tests for building the task JSON, the issue URL and the prompt, for parsing the task JSON back out of an issue body, and for itinerary validation.
- Commit in small steps on `main` and push. End your reply with what's done, what's left, and any data fields you need from the crawler side.
