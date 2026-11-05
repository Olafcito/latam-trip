# stay-rates

Edge function behind the live rates of a place to stay (FEAT-002, TECH-003). The planner calls it when a place with a Hostelworld link is opened, and the build worker calls it each morning for every place and dates that have a Hostelworld price already. It reads the property and its availability from Hostelworld's own JSON endpoints, writes the rooms to `lodging_rooms` and one price per room to `lodging_prices`, and the planner shows the rows through its realtime subscription. Prices are asked in DKK for one guest. Nothing of the content is logged.

Who may call it: the signed in owner (`public.is_owner()`), or the worker with the bearer token equal to the `STAY_RATES_WORKER_KEY` secret. The function writes with the service role key, so the owner only tables stay owner only.

Request, one of:

- `{ lodging_id, check_in, check_out }` prices a stored place by its Hostelworld link.
- `{ url, place_id, check_in, check_out }` adds the place behind a pasted Hostelworld link at that map place, then prices it. A link to a place that is stored already prices that one.

Both take an optional `fresh_minutes` (default 10). A Hostelworld price for the same place and dates observed within that window means no fetch and `fetched: false`. 0 forces a fetch. Dates are `YYYY-MM-DD`, at most 30 nights.

Response: `200 { lodging_id, created, fetched, rooms, prices }` or `4xx/5xx { error }`. `rooms` is how many rooms Hostelworld listed for the dates, `prices` how many price rows were written.

What it writes:

- A new place: name, kind from the type, up to 8 photos, rating as overall / 10, the number of ratings, address and town, coordinates, tags kitchen, breakfast, aircon and pool from the facility names, the description as the summary, the link, `added_by` simon.
- A room not stored yet: name, beds from capacity, private or dorm, bathroom from ensuite, `site` hostelworld, `site_id` and the first photo. A stored room is matched by `site_id`, else by name, and a room matched by name gets its `site_id` and photo.
- One `lodging_prices` row per room listed: per night and the total of the default rate plan in DKK, the site, a link with the dates, refundable from the free cancellation flag with its last day, and `available` beds (a dorm) or rooms (a private).

A room Hostelworld does not list for the dates gets no row, so its last price stays as it was. The age mark in the planner says when that was.

The gate: every request to Hostelworld first takes a turn from `public.take_site_call('hostelworld', 30)` (migration 0020), one gate in the database for the planner, the worker and the search together, 30 requests a minute. When the minute is full the request waits its turn. A request that would wait more than about 45 seconds in all gives up with `429 { error: 'Hostelworld is busy, try again in a minute.', retry_after }`, `retry_after` in whole seconds. What is stored already stays. When the gate itself cannot be asked, the function makes no Hostelworld call and answers `503`.

Secrets: `STAY_RATES_WORKER_KEY` (the project's secret key, which the worker already holds in SSM). `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `SUPABASE_SERVICE_ROLE_KEY` are set by Supabase.

From the repo root, with the project ref from the Supabase dashboard (the subdomain of `SUPABASE_URL`), and without printing the key:

    npx supabase secrets set --env-file <file with STAY_RATES_WORKER_KEY=...> --project-ref <ref>
    npx supabase functions deploy stay-rates --project-ref <ref> --no-verify-jwt

`--no-verify-jwt` is needed because the worker's key is not a JWT. The function checks the caller itself.
