# FEAT-003: Find accommodations at a stop

- Date: 2026-11-05
- Status: Building in the `hostel-search` worktree.

## 1. Problem

FEAT-002 prices a place once it is stored, and a pasted Hostelworld link stores one. But a stop starts empty, so Simon has to find each hostel himself, copy its link and paste it in, stop by stop. Hostelworld's own search page lists every property of a city for given dates from a JSON endpoint, and the task runner already has the Booking.com connector, so the planner can fill a stop on one press: the most popular hostels on Hostelworld at once, and suggestions from Booking.com as they come in.

A link pasted at the wrong stop is stored there as is. Dreamer Beach Club, a San Andrés hostel, was stored under Cartagena that way.

Hostelworld is asked by the planner, the morning worker and now the search. Nothing caps how often. Simon's limit is 30 requests a minute.

## 2. Journey

1. **Find.** Simon opens Add accommodation at a stop with nights and presses Find accommodations. The count turns live and the sheet shows it is asking Hostelworld and Booking.com, with card shapes under the places found so far.
2. **Hostelworld first.** Within seconds the three most popular Hostelworld hostels come in as cards with their photos, rating and price for the stop's dates.
3. **Booking.com meanwhile.** The task runner picks up the Booking.com half within a minute or two and adds its three suggestions with rating and price. Simon can close the sheet. The stop keeps filling, and the sheet shows the search still under way when he comes back.
4. **Done.** When both halves are in, the count settles. Pressing Find again for the same dates asks only for what is not stored yet.
5. **Paste a link at the wrong stop.** The add is refused with the town the place is in, and nothing is stored.
6. **Hostelworld is busy.** When the shared limit is reached, a call waits its turn. A call that would wait too long gives up, and the places and prices already stored stay.

## 3. Scope

- Find accommodations is a control on the Find & add tab of a stop with nights. It is the empty list's control, and with places stored it sits with the count.
- One press does two things:
  - It calls `stay-rates` with `{ search: true, place_id, check_in, check_out, top? }`. `top` is 3 by default and at most 5.
  - It saves a `stay_search` task `{ place_id, check_in, check_out, top: 3 }`, which starts the task runner.
- Hostelworld:
  - The Hostelworld city of a map place is looked up by name once and remembered.
  - Popularity is the number of ratings. The top are the hostels within 40 km of the map place that have the most ratings among those rated 8.0 or more. When fewer than `top` qualify, the rest are filled by number of ratings. Hostelworld's own list order mixes in promoted places, so it is not used.
- Booking.com: the run searches the stop's dates and keeps the most reviewed places rated 8.0 or more. It skips places already stored at the stop and adds each new one with its Booking.com link, rating and the cheapest price shown.
- A place the search finds that is hidden stays hidden, and the next one takes its turn. A place stored at another stop is left there.
- Places the search adds are `added_by` claude.
- A pasted link to a place more than 60 km from the stop is refused.
- Every Hostelworld request from the function passes one gate in the database, 30 a minute across all callers.

## 4. Non goals

- A sweep of every stop without a press.
- Photos from Booking.com. Its connector gives none (TECH-003).
- More than five places per site per press, or a stop without nights.
- A search box for any town. The search is for the stops of a trip.

## 5. Acceptance

- Find at San Andrés (ADZ) for 3 to 8 Dec stores three Hostelworld hostels there with photos and priced rooms within seconds. A second press the same minute adds nothing and fetches nothing from Hostelworld.
- The same press saves one `stay_search` task. Its run adds up to three Booking.com places at ADZ and closes the task.
- The sheet shows the search under way until the Hostelworld call has returned and the task is closed, also after the sheet is closed and opened again.
- The Dreamer Beach Club link pasted at Cartagena is refused with the town it is in.
- 31 Hostelworld requests in one minute never leave the function. The 31st waits or is refused with `retry_after`.
