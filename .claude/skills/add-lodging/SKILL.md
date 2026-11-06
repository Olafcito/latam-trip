---
name: add-lodging
description: The one flow for adding a place to stay to latam trips, whoever adds it. Covers Airbnb, Booking.com and Hostelworld links or wishlists Simon pastes in a chat, the task runner's stay_search and stay_picks, and the stay_details task that completes a place. A place counts as added only with photos, every room and a price for the trip's dates. Use whenever a place to stay is added or its details are filled in.
---

# Add a place to stay

This skill is the only description of how a place to stay gets into the trip. `trip-checklist`, `task-loop`, the task runner's contracts and every chat session follow it. Change the flow here and nowhere else.

## Done means complete

A place is added only when it has all of this:

- **Photos.** Up to 8 place photos, up to 12 for an Airbnb listing.
- **Every room** the site offers for 1 adult, each with name, private, bathroom, beds and the site's room id.
- **A price per room** for the dates, in DKK, for 1 adult, with `refundable` and `cancel_until`.
- **Rating and reviews**, with the site as `rating_source`.

Never report a place as added while one of these is missing. If a read could not get something, the report names it and the reason.

## Dates

Take the dates from the link. Otherwise use the nights of that stop in the trip, or the task's `check_in` and `check_out`. In a chat with no dates anywhere, ask Simon once.

## Steps

1. **Resolve the links.** A wishlist lists several places, so read it first. A Booking.com `mywishlist.html` link reads with WebFetch. Note that a wishlist shows its own dates, so "sold out" there says nothing about the trip's dates.
2. **Find the place and check for duplicates.** Find the `place_id` with `list_place`, then call `list_lodging` with that place. A stored place with the same name is the same place.
3. **Gather the cheap facts.**

   | Site | Source | Gives | Never gives |
   |---|---|---|---|
   | Booking.com | `accommodations_search` with `hotel_names`, 1 adult, the dates, `currency` DKK, `user_country_code` dk | Cheapest price for the dates, coordinates, address, facilities | Photos, room names. WebFetch of the hotel page hits a bot check |
   | Airbnb | WebFetch of the listing | Title, room type, beds, bathroom, rating, amenities, some photos | The price, which only loads in a browser |
   | Hostelworld | The hostel page and the `stay-rates` edge function | Photos, rating, rooms and prices | Nothing missing |

4. **Add it.** Call `add_lodging` with `added_by` set to `simon` when Simon gave the link or asked for the place, and `claude` when a task found it. Booking.com and Airbnb places start with one room, and the database queues a `stay_details` task for each (migrations 0022 and 0024).
5. **Fill in the details at once, without asking.** In a chat this happens in the same turn as the add.
   - **Booking.com.** On Simon's PC with the repo, run `node plugin/scripts/booking/read.mjs LODGING_ID [--check-in YYYY-MM-DD --check-out YYYY-MM-DD] --out FILE`, then `python -I -X utf8 plugin/scripts/tripdb.py --root . lodging-details FILE`. Run `npm install` in `plugin/scripts/booking` once first. Use `--dry` to look before writing. If the headless read is blocked, or the session has no repo or no `.env`, a browser worker reads the page and records every room with its cheapest price for the dates, `refundable`, `cancel_until` and the room id, plus up to 8 `cf.bstatic.com/.../max1024x768/` photos. With the repo, the worker writes the same JSON and `lodging-details` stores it. Without the repo, it calls `add_lodging` again with the same name to add the rooms with their prices, and `update_lodging` for the photos.
   - **Airbnb.** A browser worker opens the listing with the dates, `adults=1` and `currency=DKK`. It reads the total for the stay with every fee, discount and tax, whether the dates are available, `refundable`, `cancel_until`, and up to 12 gallery photos at `im_w=1200`. It writes the price with `add_lodging_price` on the stored room, then calls `update_lodging` with the photos and a notes line on the fee breakdown. Airbnb hides the exact location until booking, so lat and lon stay empty.
   - **Hostelworld.** The `stay-rates` edge function prices the rooms when the link is added. Check with `get_lodging` after about a minute.
6. **Check.** Call `get_lodging` for each place and confirm the photos, the rooms and a price for the dates on each room. If something is missing, send one more worker for it, then name what is still missing in the report.
7. **Report.** One table with one row per place: kind, rating, total for the stay and refundable. Then flag only what is missing, and why.

## Who does which step

| Who | Steps |
|---|---|
| A chat session where Simon pastes links | All of them, with the details from browser workers in the same turn |
| The cloud task runner, for `stay_search` and `stay_picks` | 1 to 4, by the contract `claim_task` gives. The cloud has no browser, so step 5 is left to the `stay_details` task the database queues. The result says the details are queued |
| `trip-checklist` or `task-loop` on the PC, for `stay_details` | 5 and 6 for the one place in the task, then `tasks.py done` with the counts of rooms, prices and photos stored |

## Browser workers

- **Who.** Sonnet subagents only, at most 2 at once. Use the built-in browser first and Claude in Chrome when it is missing. Open pages without asking.
- **Read only.** Never book, reserve, pay, sign in, tick a consent box or solve a bot check. A bot check means the read is blocked, so report it.
- **Prices.** DKK, 1 adult, with `per_night_dkk` as the total divided by the nights, rounded. `observed_at` needs a time (`YYYY-MM-DDTHH:MM`), since a date alone is refused.
- **One price per room.** A room keeps one price per dates and site. When a site shows both a refundable and a non refundable rate, store the cheaper one and put the other, with its last day to cancel, in the room's notes.
- **The brief.** Give each worker the lodging ids, the room ids from the `add_lodging` reply, the links with dates, and the fields above. Ask for one compact table back per place.
