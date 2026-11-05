# FEAT-003: The top hostels of every stop from Hostelworld

- Date: 2026-11-05
- Status: Building in the `hostel-search` worktree.

## 1. Problem

FEAT-002 prices a place once it is stored, and a pasted Hostelworld link stores one. But a stop starts empty, so Simon has to find each hostel on Hostelworld himself, copy its link and paste it in, stop by stop. Hostelworld's own search page lists every property of a city for given dates from a JSON endpoint that answers a plain request, so the store can be filled without him: the three most popular hostels of every stop, with photos, rooms and prices for the stop's dates.

A link pasted at the wrong stop is stored there as is. Dreamer Beach Club, a San Andrés hostel, was stored under Cartagena that way.

Hostelworld is asked by the planner, the morning worker and now the search. Nothing caps how often, so a busy morning could hit it hard enough to get the endpoint closed to us. Simon's limit is 30 requests a minute.

## 2. Journey

1. **Open a stop.** Simon opens Add accommodation at a stop with nights. If fewer than three Hostelworld places are stored there, the sheet asks Hostelworld at once: the live dot and two card shapes under the count, as the sheet already draws a search under way. The three most popular hostels come in as cards with their photos, rating and price for the stop's dates.
2. **Next morning.** The worker does the same for every stop with nights ahead in every saved trip, so a stop Simon has not opened yet is filled when he does.
3. **Paste a link at the wrong stop.** The add is refused with the town the place is in, and nothing is stored.
4. **Hostelworld is busy.** When the shared limit is reached, a call waits its turn. A call that would wait too long gives up and the stored places and prices stay.

## 3. Scope

- `stay-rates` gets a search request: `{ search: true, place_id, check_in, check_out, top? }`, `top` 3 by default and at most 5.
- The Hostelworld city of a map place is looked up by name once and remembered.
- Popularity is the number of Hostelworld ratings. The top are the hostels within 40 km of the map place with the most ratings among those rated 8.0 or more, filled up from the rest by ratings when fewer qualify. Hostelworld's own list order mixes in promoted places, so it is not used.
- A place the search finds that is hidden stays hidden and the next one takes its turn. A place stored at another stop is left there.
- Places the search adds are `added_by` claude.
- A pasted link to a place more than 60 km from the stop is refused.
- Every Hostelworld request from the function passes one gate in the database, 30 a minute across all callers.
- The morning `rates` run searches every stop with nights ahead, after the price refresh.
- The planner searches when the sheet opens at a stop with nights and fewer than three Hostelworld places, once per stop and dates in a session.

## 4. Non goals

- Other sites. Booking.com and Expedia give no photos or rooms through their connectors (see the memory note on photo sources and TECH-003).
- More than five places per stop, or a stop without nights.
- A search box for any town. The search is for the stops of a trip.

## 5. Acceptance

- A search for San Andrés (ADZ) for 8 to 13 Dec stores three hostels there with photos and priced rooms, and a second search the same minute adds nothing and fetches nothing.
- The Dreamer Beach Club link pasted at Cartagena is refused with the town it is in.
- 31 Hostelworld requests in one minute never leave the function. The 31st waits or is refused with `retry_after`.
- The morning run's result counts the stops searched and the places added.
- Opening Add accommodation at a stop with nights and no places shows the search under way, then the cards.
