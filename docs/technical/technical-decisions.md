# Technical decisions

Ids never change. Status is Proposed, Accepted, Implemented or Reconsidered. The plan author proposes, Simon accepts. A decision cites the FEAT or plan it came from, and a plan cites the TECH ids it relies on.

Format of an entry:

## TECH-NNN Short name

- **Decision.** What was chosen.
- **Reasoning.** Why, and what was weighed against it.
- **Applies to.** Files, tables or services.
- **Source.** The FEAT, plan or spec path.
- **Date.** **Status.**

## TECH-001 Reading bookings with the Claude API in an edge function

- **Decision.** Add booking reads a confirmation (a PDF, a screenshot, a saved .eml or pasted mail text) in the Supabase edge function `read-booking`. The planner sends the files inline as base64 with the leg and the text. The function checks the caller with `public.is_owner()`, asks the Claude Messages API for one forced `booking` tool call and returns its input. It reads with Haiku (`READ_BOOKING_MODEL`, default `claude-haiku-5-5`) and reads once more with Sonnet (`READ_BOOKING_FALLBACK`, default `claude-sonnet-5-5`) only when the first answer misses the reference, the price or a leg's departure. It stores no file, reads and writes no table and logs nothing of the content. The form opens filled in, and Simon checks and saves.
- **Reasoning.** The app has no mailbox access, so the confirmation has to come to it. Gmail API access was rejected because a public app reading mail needs Google's restricted scope review. A pasted Gmail link is kept as the booking's mail link and nothing more. The function holds the Anthropic key as a Supabase secret, so no key reaches the browser, and the owner check keeps others from spending it. Forwarding mail to an address of the app is the later step for other users. Haiku reads a plain confirmation well at a fraction of the cost, and the three fields it is checked on are the ones a booking is useless without, so Sonnet is paid for only when they are missing.
- **Applies to.** `supabase/functions/read-booking/`, `planner/src/lib/readBooking.ts`, the `ANTHROPIC_API_KEY`, `READ_BOOKING_MODEL` and `READ_BOOKING_FALLBACK` function secrets.
- **Source.** The Add booking task of the `feat/add-booking` worktree.
- **Date.** 2026-11-05. **Status.** Implemented.

## TECH-002 Open tasks start a Claude routine

- **Decision.** A trigger on `tasks` insert calls the fire endpoint of a Claude Code routine with pg_net, sending only the task id and type, with the URL and token in Supabase Vault. The routine runs the checklist for the task types that need no browser and no mailbox. A half hour pg_cron sweep fires it again for anything left open.
- **Reasoning.** The routine runs as Simon with his connectors, so Booking.com prices keep coming through the Booking.com connector and no API key is added. A GitHub Actions runner was weighed: it has no claude.ai connectors, needs an Anthropic API key and Supabase secrets, and Booking.com and Hostelworld block datacenter browsers. Browser tasks stay on Simon's machine.
- **Applies to.** `supabase/migrations/0017_task_runner.sql`, `docs/task-runner.md`, the routine "Trip checklist on new tasks".
- **Source.** Simon's request on 2026-11-05 for searches that run by themselves.
- **Date.** 2026-11-05. **Status.** Accepted.

## TECH-003 Live rates from Hostelworld through an edge function

- **Decision.** The Supabase edge function `stay-rates` reads a place's rooms and prices for a date range from Hostelworld's own unauthenticated JSON endpoints (`legacy-hwapi-service/2.2/properties/{id}/` and `.../availability/`), with a browser like user agent, one guest and DKK. It writes the rooms to `lodging_rooms`, remembering the site and the room's id there, and one `lodging_prices` row per room with the beds or rooms left. The planner calls it when a place with a Hostelworld link is opened and shows the stored rows first, the live ones through realtime. A pasted link adds the place through the same function. The build worker calls it at 05:00 UTC for every place and dates with a Hostelworld price ahead, with the key it already holds, which the function knows as the `STAY_RATES_WORKER_KEY` secret. The function is deployed with `--no-verify-jwt` because that key is not a JWT, and it checks the caller itself: the owner through `public.is_owner()`, or the worker key. It writes with the service role so the tables stay owner only.
- **Reasoning.** Simon needs prices now to book, and neither Booking.com nor Hostelworld gives an API without a partner contract. Hostelworld's site reads from an endpoint that answers a plain fetch, so a function in Supabase can read it without a browser, a key or Simon's PC, which the task runner's Hostelworld step needed. Booking.com was weighed and left for later: its pages give a bot challenge to a plain fetch, its connector gives one cheapest total per property with no rooms, and the data search engines index of it is static page content, not dated prices. Keeping the reading in the function rather than the worker means the planner and the worker share one path and one write rule. The endpoint is unofficial, so the function fails soft and the age mark shows a price going stale.
- **Applies to.** `supabase/functions/stay-rates/`, `supabase/migrations/0019_lodging_live_rates.sql`, `planner/src/lib/stayRates.ts`, `infra/worker/rates.py`, the `rates` schedule in `infra/deploy.sh`, the `STAY_RATES_WORKER_KEY` function secret.
- **Source.** `docs/product/features/FEAT-002-hostelworld-live-rates.md`.
- **Date.** 2026-11-05. **Status.** Implemented.

## TECH-004 Finding the top hostels of a stop through Hostelworld's city list

- **Decision.** The `stay-rates` edge function takes a search request for a map place and dates. It finds the place's Hostelworld city by name through the unauthenticated `suggestions/` endpoint, once, and remembers it in `hostelworld_cities` for 30 days, a miss included. It reads every property of that city for the dates from the city list endpoint `legacy-hwapi-service/2.2/cities/{id}/properties/`, which Hostelworld's own search page uses. That endpoint needs the `api-key` header of Hostelworld's public web app, which the function holds as the `HOSTELWORLD_WEB_KEY` secret, never in the repo. It keeps the hostels within 40 km of the map place, ranks those rated 8.0 or more by number of ratings and fills from the rest by number of ratings, then adds and prices the top ones through the same path as a pasted link, with `added_by` claude. Every Hostelworld request of the function, the planner's, the worker's and the search's alike, first takes a turn from `public.take_site_call('hostelworld', 30)`, a gate in Postgres that counts the calls of the last minute under an advisory lock. A call waits its turn, gives up after about 45 seconds with `429` and `retry_after`, and makes no call when the gate cannot be asked. A pasted link to a place more than 60 km from the stop is refused, so a hostel cannot land at the wrong stop as Dreamer Beach Club of San Andres did at Cartagena.
- **Reasoning.** Simon's limit is 30 Hostelworld requests a minute, and the callers run in separate edge function instances, so the count has to live in one place they all reach, the database. Failing closed keeps the limit when the database is in trouble. The number of ratings is the plainest measure of popularity that the list gives, and the rating floor keeps a busy but poor place from the top. Hostelworld's own list order mixes in promoted places, so it was not used. The 40 km circle drops places a city list carries from nearby towns and islands. The city list is unofficial like the endpoints of TECH-003, so the search fails soft and what is stored stays.
- **Applies to.** `supabase/functions/stay-rates/`, `supabase/migrations/0020_hostelworld_search.sql`, the `HOSTELWORLD_WEB_KEY` function secret.
- **Source.** `docs/product/features/FEAT-003-hostelworld-city-search.md`.
- **Date.** 2026-11-05. **Status.** Implemented.

## TECH-005 Booking.com page details come from a headless read on Simon's PC through a queued stay_details task

- **Decision.** The task runner adds a Booking.com place through the connector with one room, the cheapest shown, and no photos, because the connector gives nothing more. A trigger on `public.lodgings` (migration 0022) then queues one open `stay_details` task for each Booking.com place that is added and not hidden, unless one is already open or working for it. The type is not a cloud type, so no run starts for it. On Simon's PC the checklist run reads the hotel page with `plugin/scripts/booking/read.mjs` in a headless browser, and `tripdb lodging-details FILE` stores every room, the room photos, the price of each room for the dates and the place photos. A room is matched to a stored one by its Booking.com room id, else by name among the rooms without an id, so the cheapest room the runner stored is adopted and not doubled. No room is deleted, and photos are replaced only when the read found some. If the headless read is blocked, a Sonnet subagent reads the same page in Simon's Chrome through the Chrome plugin and writes the same JSON. The read is read only: it never clicks a consent, signs in or solves a bot check.
- **Reasoning.** Booking.com gives a bot challenge to a plain fetch from a server and to datacenter browsers, as TECH-002 and TECH-003 found, so the page can only be read from Simon's own machine. A queued task keeps the work visible on the checklist and survives a PC that is off, where reading at add time could not. Keeping the type out of the cloud list leaves `task_runs_in_cloud` as 0021 left it.
- **Applies to.** `supabase/migrations/0022_stay_details_task.sql`, `plugin/scripts/tripdb.py` (`lodging-details`), `plugin/scripts/booking/`, `plugin/skills/trip-checklist/`, `docs/claude-tasks.md`.
- **Source.** Simon's request on 2026-11-05 that a place added from Booking.com gets its rooms found after it is added.
- **Date.** 2026-11-05. **Status.** Accepted.
