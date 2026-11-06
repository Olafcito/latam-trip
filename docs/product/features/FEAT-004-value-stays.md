# FEAT-004: Three value places when a stop opens

- Date: 2026-11-06
- Status: Drafted. Simon answered the open questions on 2026-11-06. Waiting on the spec review, then a plan.

## 1. Problem

Simon wants "the three initial hotels to identify value": near the centre or the beach, rated 8 or more, popular by their review count, and the best rating for the money. Not dorms, and not the places Hostelworld already gives. Today a stop starts empty until he presses Find accommodations (FEAT-003). That press adds the most popular Hostelworld hostels and, through the `stay_search` task, the Booking.com places rated 8.0 or more with the most reviews. Neither half looks at the distance to the centre or at the price, so the most reviewed place can be a far resort or the dearest hotel in town. And the search waits for a press, when Simon wants it to start as soon as he opens Add accommodation for a city.

## 2. Journey

1. **Open a new stop.** Simon opens Add accommodation at a stop with nights where no Booking.com place is stored yet, whether or not Hostelworld places are. Without pressing anything, the sheet shows Claude is on it, the same live mark FEAT-003 shows while Booking.com is asked.
2. **Close and come back.** He can close the sheet or go to another stop. The task runs in the cloud and the mark follows it when he comes back.
3. **Three value places come in.** Within a minute or two three cards arrive, each near the centre or on the beach, rated 8 or more, and the best rating for the money for the stop's dates, with the more reviewed place winning a close call. None is a hostel, so none is a dorm bed and none repeats a Hostelworld card. Each card already shows its distance to the centre, rating, review count and price, so he can compare the three at a glance.
4. **Rooms and photos follow.** Each new Booking.com place queues a `stay_details` task by itself (migration 0022), and the PC queue loop reads its rooms and photos.
5. **Open one and pick.** He opens a card, sees its rooms cheapest first, and picks a room as today.
6. **Want more.** Find accommodations still adds the popular Hostelworld hostels and more Booking.com places, as in FEAT-003.
7. **Open the same stop again.** Nothing is queued a second time for the same place and dates, whether the first task is still running, done or failed.

## 3. Goals

- A new stop shows three good value places without a press.
- The value rule is written once, in one skill, and the cloud routine and a PC run both follow it.
- Each card carries the three facts the rule chose it on: distance, rating with reviews, price.

## 4. Non goals

- No new screen and no change to the card's layout beyond what it already shows.
- No change to the Hostelworld half or to the Find press.
- No Airbnb, no Expedia. Booking.com only, through the connector the routine already has.
- No ranking of places already stored, and no hiding of places the rule would not have picked.
- No booking, ever.

## 5. User stories

- S1 (step 1). As Simon, opening Add accommodation at a new stop, I want the value search to start by itself, so that I do not have to know about a Find button.
- S2 (step 2). As Simon, after closing the sheet, I want the search to carry on and show its state when I return, so that I can plan another stop meanwhile.
- S3 (step 3). As Simon, comparing places, I want three places near the centre or the beach with the best rating for the money, so that the first places I see are worth picking.
- S3b (step 3). As Simon, I want none of the three to be a hostel, so that I get no dorm beds and nothing Hostelworld already shows.
- S4 (step 3). As Simon, I want each card to show its distance to the centre, so that I can see why it was chosen.
- S5 (step 5). As Simon, inside a place, I want its rooms listed cheapest first, so that the price I compare is the first one I see. (Built as a fix on 2026-11-06.)
- S6 (step 7). As Simon, opening the same stop again, I want no second search, so that the checklist does not fill with repeats.

## 6. Acceptance criteria

- S1: Opening the sheet at a stop with nights, no Booking.com lodging at the place and no `stay_picks` task for the place and dates inserts exactly one `stay_picks` task. A unit test on the decision function covers each of the three conditions.
- S1: A stop with no nights, or with a Booking.com lodging already stored at the place, inserts nothing.
- S2: With the task open or working, the sheet shows the live Booking.com mark after a reload. A shot proves it.
- S3: The contract's check refuses a finish with more than three new lodgings, a lodging rated under 8.0, one with fewer than 5 reviews and one of kind hostel. A test in `latam_trip_mcp` covers each.
- S3: The skill's worked example ranks a 9.2 at 600 kroner above an 8.1 at 500 kroner with equal reviews.
- S3: A run on a real stop adds three lodgings whose rating is 8.0 or more, whose review count meets the floor and whose `to_center_km` is set. Checked once live on Cartagena and once on a smaller town.
- S4: `add_lodging` sets `to_center_km` from the lodging's and the place's lat and lon when the caller leaves it out. A test in `latam_trip_mcp` covers it, and a shot shows it on the card.
- S6: Opening the sheet twice for the same place and dates leaves one task. A unit test covers an open, a done and a failed task.

## 7. Functional requirements

- A new cloud task type, `stay_picks`, with data `place_id`, `check_in`, `check_out`. It joins `CLOUD` in `latam_trip_mcp/runner.py` and `task_runs_in_cloud` in a new migration, kept equal by the existing test.
- Its context is the same as `stay_search`: the place (with its lat and lon) and the lodgings stored there.
- Its method lives in a new skill, `plugin/skills/stay-picks/SKILL.md`, and the contract's steps point to it. The rule, in order:
  1. Search Booking.com for the place, dates, 1 adult, 1 room, DKK, user country dk, `minimum_review_score` 8. Run up to three searches (the centre, the beach in a town on the coast, and a lower nightly price band) and pool them, because one search returns about 10 properties and leaves the rating out of many of them.
  2. Keep properties with a rating of 8.0 or more and 5 reviews or more. A property with no rating shown is left out.
  3. Leave out every property of type Hostel. The connector gives one price and no room type, so a hostel's price can be a dorm bed, and hostels are the Hostelworld half's job.
  4. Leave out places already stored at the place, by Booking.com link or by name, Hostelworld ones included, and any stored with hidden true.
  5. Keep those within 2 km of the place's lat and lon, or listed with the Beachfront or Beach facility. Widen to 3 km, then 5 km, when fewer than three remain, and say so in the result.
  6. Rank by value: the rating points above 7, times the log of the review count, per krone of the stay's total. Written out, `(rating - 7) * log10(reviews) / total_dkk`. Take the top three.
- Each pick is written with `add_lodging` as `stay_search` writes it. `add_lodging` fills `to_center_km` from the lodging's and the place's lat and lon when the caller leaves it out, using the `haversine_km` that `core.py` already has.
- The planner inserts the task when the sheet opens and the conditions in S1 hold. The live mark reads `stay_picks` tasks as it reads `stay_search` tasks today.
- The cloud routine prompt in `docs/task-runner.md` allows reading `plugin/skills/stay-picks/SKILL.md`, the one file outside the task-runner skill.

## Connector facts (read live on 2026-11-06)

A Cartagena search for 20 to 23 December, 1 adult, DKK, `minimum_review_score` 8, gave 10 properties. Each had `price.book` as the total for the stay in kroner, `accommodationType`, `facilities`, the address, district and coordinates. Only 3 of the 10 had a `rating` object with `review_score` and `number_of_reviews`. None had a distance, a room name or a room type. The connector has no sort and no value field. Its only levers are `minimum_review_score` (7 to 9), a nightly price range, accommodation types, facilities and the free text query.

## 8. UX requirements

- No new component. The live mark, the card shapes while searching and the card itself are FEAT-003's.
- The distance on a card is the one `StayCard` already renders from `to_center_km`.
- No prose line about why a place was picked. The three facts on the card are the reason (CLAUDE.md, let the interface carry the information).

## 9. Edge cases

- A small town with no rated property of 8.0 and 5 reviews: the distance widens as in step 5, and with none left the task finishes with no lodgings and a result that says so. The sheet shows the empty list with Find accommodations.
- A place with no lat and lon: the distance step is skipped and the result says so, and `to_center_km` stays empty.
- Every search returns properties with no rating: the task finishes with no lodgings and a result that says so, and Find accommodations still works.
- The connector is down: the task fails with the reason, the mark goes away, and opening the sheet again does not queue another (S6). Find accommodations still works.
- Dates change in the sheet: a new place and dates key, so a new task when the conditions hold.
- The phone on a weak signal: the insert fails quietly and is tried again the next time the sheet opens.

## 10. Dependencies

- `latam_trip_mcp/runner.py` (contract, context, check) and `latam_trip_mcp/core.py` (`to_center_km` in `add_lodging`), and their tests.
- `supabase/migrations/0023_stay_picks_task.sql` (the cloud type list). 0022 is taken by `stay_details`.
- `plugin/skills/stay-picks/SKILL.md`, synced to `.claude/` with `sync_claude_dir.py`.
- `plugin/skills/task-runner/SKILL.md` (the list of task types) and `docs/task-runner.md` (the routine prompt).
- `planner/src/components/stays/useStayFind.ts`, `planner/src/lib/tasks.ts`, `planner/src/components/story/StopFold.tsx`.
- Tables: `tasks`, `lodgings`, `lodging_prices`. Nothing owner only and nothing new in the public bucket.

## 11. Checks

- Tests: S1, S3 and S6 as written above, in `planner` and `latam_trip_mcp`.
- Live: one run on Cartagena and one on a small town.
- Design: shots of steps 1 and 3. No roast, because the screen and its components do not change.

## 12. Decisions (Simon, 2026-11-06)

- Q1: a floor of 5 reviews is enough. Review count works as popularity in the value score instead of as a hard floor.
- Q2: near the centre or the beach both count. The connector shows no distance, so the centre is the place's lat and lon and the beach is Booking.com's Beachfront or Beach facility.
- Q3: the best rating for the money, not the cheapest. The connector cannot rank for it, so the skill computes the score.
- Q4: it runs at stops that have only Hostelworld places, never repeats them, and gives no dorms. Leaving out hostels does both.

Completeness: the value score has been worked by hand on one Cartagena search only. The live checks in section 11 test it on a smaller town.
