# stay-rates

Edge function behind the live rates of a place to stay (FEAT-002, TECH-003) and the search for accommodations at a stop (FEAT-003, TECH-004). The planner calls it when a place with a Hostelworld link is opened, and the build worker calls it each morning for every place and dates that have a Hostelworld price already. It reads the property and its availability from Hostelworld's own JSON endpoints, writes the rooms to `lodging_rooms` and one price per room to `lodging_prices`, and the planner shows the rows through its realtime subscription. Prices are asked in DKK for one guest. Nothing of the content is logged.

Who may call it: the signed in owner (`public.is_owner()`), or the worker with the bearer token equal to the `STAY_RATES_WORKER_KEY` secret. The function writes with the service role key, so the owner only tables stay owner only.

Request, one of:

- `{ lodging_id, check_in, check_out }` prices a stored place by its Hostelworld link.
- `{ url, place_id, check_in, check_out }` adds the place behind a pasted Hostelworld link at that map place, then prices it. A link to a place that is stored already prices that one. A link to a place more than 60 km from the map place is refused with `409` and the town the place is in, and nothing is stored. A place or map place without coordinates is not checked.
- `{ search: true, place_id, check_in, check_out, top? }` finds the most popular Hostelworld hostels of a map place for the dates, adds the new ones and prices them. `top` is 3 by default, 1 to 5.

Both take an optional `fresh_minutes` (default 10). A Hostelworld price for the same place and dates observed within that window means no fetch and `fetched: false`. 0 forces a fetch. Dates are `YYYY-MM-DD`, at most 30 nights.

Response: `200 { lodging_id, created, fetched, rooms, prices }` or `4xx/5xx { error }`. `rooms` is how many rooms Hostelworld listed for the dates, `prices` how many price rows were written.

The search:

1. The Hostelworld city of the map place comes from `hostelworld_cities` when it was checked within 30 days. Else the place's name goes to Hostelworld's `suggestions/` and the first city in the place's country is taken, compared without case or accents (the first city at all when the place has no country). The answer is remembered, a miss included. No city gives `200` with no `lodging_ids`.
2. The city list `cities/{id}/properties/` gives every property of the city for the dates. It needs the `api-key` header with the `HOSTELWORLD_WEB_KEY` secret.
3. Only hostels within 40 km of the map place count, when the place has coordinates. Those rated 8.0 or more come first by number of ratings, then the rest by number of ratings. Hostelworld's own order mixes in promoted places and is not used.
4. Down that ranking until `top` are taken: a hostel stored at this place counts and is priced unless its price is fresh. A hostel stored hidden or at another place is passed over and does not count, and a hidden one stays hidden. A new one is added as a pasted link would add it, with `added_by` claude, and priced.

Response: `200 { place_id, city_id, city, lodging_ids, priced_ids, created, priced, rooms, prices }`. `lodging_ids` are the hostels taken, in order, `priced_ids` are those of them priced now or found with a fresh price, the others had no price asked or it failed, `created` and `priced` count the places added and priced, `rooms` and `prices` are summed over them. When enough visible places at the stop with a Hostelworld link, whoever added them, have a fresh price for the dates, Hostelworld is not asked at all and those are returned with zero counts. A second search in the fresh window asks Hostelworld for the city list at most.

What it writes:

- A new place: name, kind from the type, up to 8 photos, rating as overall / 10, the number of ratings, address and town, coordinates, tags kitchen, breakfast, aircon and pool from the facility names, the description as the summary, the link, `added_by` simon.
- A room not stored yet: name, beds from capacity, private or dorm, bathroom from ensuite, `site` hostelworld, `site_id` and the first photo. A stored room is matched by `site_id`, else by name, and a room matched by name gets its `site_id` and photo.
- One `lodging_prices` row per room listed: per night and the total of the default rate plan in DKK, the site, a link with the dates, refundable from the free cancellation flag with its last day, and `available` beds (a dorm) or rooms (a private).

A room Hostelworld does not list for the dates gets no row, so its last price stays as it was. The age mark in the planner says when that was.

The gate: every request to Hostelworld first takes a turn from `public.take_site_call('hostelworld', 30)` (migration 0020), one gate in the database for the planner, the worker and the search together, 30 requests a minute. When the minute is full the request waits its turn. A request that would wait more than about 45 seconds in all gives up with `429 { error: 'Hostelworld is busy, try again in a minute.', retry_after }`, `retry_after` in whole seconds. What is stored already stays. When the gate itself cannot be asked, the function makes no Hostelworld call and answers `503`.

Secrets: `STAY_RATES_WORKER_KEY` (the project's secret key, which the worker already holds in SSM). `HOSTELWORLD_WEB_KEY`, Hostelworld's public web app key, which the city list needs. It is set the same way as the worker key and never committed, logged or returned. Without it the search answers `503` before any Hostelworld call, and the other requests work as before. `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are set by Supabase.

From the repo root, with the project ref from the Supabase dashboard (the subdomain of `SUPABASE_URL`), and without printing the key:

    npx supabase secrets set --env-file <file with STAY_RATES_WORKER_KEY=... and HOSTELWORLD_WEB_KEY=...> --project-ref <ref>
    npx supabase functions deploy stay-rates --project-ref <ref> --no-verify-jwt

`--no-verify-jwt` is needed because the worker's key is not a JWT. The function checks the caller itself.

Tests of the ranking, the distance and the city choice, without the network, from the repo root:

    npx deno test supabase/functions/stay-rates/
