# FEAT-004: Three value places when a stop opens

- Date: 2026-11-06
- Status: Drafted. Waiting on Simon for the open questions before a plan.

## 1. Problem

Simon wants "the three initial hotels to identify value": near the centre, rated 8 or more with a substantial review count, and a good price. Today a stop starts empty until he presses Find accommodations (FEAT-003). That press adds the most popular Hostelworld hostels and, through the `stay_search` task, the Booking.com places rated 8.0 or more with the most reviews. Neither half looks at the distance to the centre or at the price, so the most reviewed place can be a far resort or the dearest hotel in town. And the search waits for a press, when Simon wants it to start as soon as he opens Add accommodation for a city.

## 2. Journey

1. **Open a new stop.** Simon opens Add accommodation at a stop with nights where no Booking.com place is stored yet. Without pressing anything, the sheet shows Claude is on it, the same live mark FEAT-003 shows while Booking.com is asked.
2. **Close and come back.** He can close the sheet or go to another stop. The task runs in the cloud and the mark follows it when he comes back.
3. **Three value places come in.** Within a minute or two three cards arrive, each near the centre, rated 8 or more by many guests and among the cheapest of those for the stop's dates. Each card already shows its distance to the centre, rating, review count and price, so he can compare the three at a glance.
4. **Open one and pick.** He opens a card, sees its rooms cheapest first, and picks a room as today.
5. **Want more.** Find accommodations still adds the popular Hostelworld hostels and more Booking.com places, as in FEAT-003.
6. **Open the same stop again.** Nothing is queued a second time for the same place and dates, whether the first task is still running, done or failed.

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
- S3 (step 3). As Simon, comparing places, I want three places near the centre, well rated by many guests and cheap among those, so that the first places I see are worth picking.
- S4 (step 3). As Simon, I want each card to show its distance to the centre, so that I can see why it was chosen.
- S5 (step 4). As Simon, inside a place, I want its rooms listed cheapest first, so that the price I compare is the first one I see. (Built as a fix on 2026-11-06.)
- S6 (step 6). As Simon, opening the same stop again, I want no second search, so that the checklist does not fill with repeats.

## 6. Acceptance criteria

- S1: Opening the sheet at a stop with nights, no Booking.com lodging at the place and no `stay_picks` task for the place and dates inserts exactly one `stay_picks` task. A unit test on the decision function covers each of the three conditions.
- S1: A stop with no nights, or with a Booking.com lodging already stored at the place, inserts nothing.
- S2: With the task open or working, the sheet shows the live Booking.com mark after a reload. A shot proves it.
- S3: The contract's check refuses a finish with more than three new lodgings, and a lodging rated under 8.0. A test in `latam_trip_mcp` covers both.
- S3: A run on a real stop adds three lodgings whose rating is 8.0 or more, whose review count meets the floor and whose `to_center_km` is set. Checked once live on Cartagena and once on a smaller town.
- S4: Each added lodging has `to_center_km` when Booking.com shows a distance, and the card shows it. A shot proves it.
- S6: Opening the sheet twice for the same place and dates leaves one task. A unit test covers an open, a done and a failed task.

## 7. Functional requirements

- A new cloud task type, `stay_picks`, with data `place_id`, `check_in`, `check_out`. It joins `CLOUD` in `latam_trip_mcp/runner.py` and `task_runs_in_cloud` in a new migration, kept equal by the existing test.
- Its context is the same as `stay_search`: the place and the lodgings stored there.
- Its method lives in a new skill, `plugin/skills/stay-picks/SKILL.md`, and the contract's steps point to it. The rule, in order:
  1. Search Booking.com for the place, dates, 1 adult, 1 room, DKK, user country dk.
  2. Keep properties rated 8.0 or more with at least 100 reviews.
  3. Keep those within 2 km of the centre by Booking.com's distance, or the nearest half when no distance is shown for any.
  4. Of those, the three with the lowest total for the stay. Ties go to the higher rating.
  5. When fewer than three remain, loosen in this order and say so in the result: the distance to 3 km, then the reviews to 50. Never the rating.
  6. Leave out places already stored or hidden, as `stay_search` does.
- Each pick is written with `add_lodging` as `stay_search` writes it, plus `to_center_km` from Booking.com's distance.
- The planner inserts the task when the sheet opens and the conditions in S1 hold. The live mark reads `stay_picks` tasks as it reads `stay_search` tasks today.
- The cloud routine prompt in `docs/task-runner.md` allows reading `plugin/skills/stay-picks/SKILL.md`, the one file outside the task-runner skill.

## 8. UX requirements

- No new component. The live mark, the card shapes while searching and the card itself are FEAT-003's.
- The distance on a card is the one `StayCard` already renders from `to_center_km`.
- No prose line about why a place was picked. The three facts on the card are the reason (CLAUDE.md, let the interface carry the information).

## 9. Edge cases

- A small town with no property rated 8.0 and 100 reviews: the rule loosens as in step 5, and with none left the task finishes with no lodgings and a result that says so. The sheet shows the empty list with Find accommodations.
- Booking.com shows no distance for any property: step 3 falls back to the nearest half by lat and lon to the place.
- The connector is down: the task fails with the reason, the mark goes away, and opening the sheet again does not queue another (S6). Find accommodations still works.
- Dates change in the sheet: a new place and dates key, so a new task when the conditions hold.
- The phone on a weak signal: the insert fails quietly and is tried again the next time the sheet opens.

## 10. Dependencies

- `latam_trip_mcp/runner.py` (contract, context, check) and its tests.
- `supabase/migrations/0022_stay_picks_task.sql` (the cloud type list).
- `plugin/skills/stay-picks/SKILL.md`, synced to `.claude/` with `sync_claude_dir.py`.
- `plugin/skills/task-runner/SKILL.md` (the list of task types) and `docs/task-runner.md` (the routine prompt).
- `planner/src/components/stays/useStayFind.ts`, `planner/src/lib/tasks.ts`, `planner/src/components/story/StopFold.tsx`.
- Tables: `tasks`, `lodgings`, `lodging_prices`. Nothing owner only and nothing new in the public bucket.

## 11. Checks

- Tests: S1, S3 and S6 as written above, in `planner` and `latam_trip_mcp`.
- Live: one run on Cartagena and one on a small town.
- Design: shots of steps 1 and 3. No roast, because the screen and its components do not change.

## 12. Open questions

- Q1, Simon: is 100 reviews the right floor, or should a hostel town count lower.
- Q2, Simon: is 2 km from the centre right, or should a beach town measure from the beach (`to_beach_km`) instead.
- Q3, Simon: "price good" here means the cheapest of the well rated places near the centre. Or should it be the best rating for the money, a 9.2 at 600 kroner beating an 8.1 at 500.
- Q4, Simon: should the automatic search also run at stops that already have Hostelworld places, as long as no Booking.com place is stored.

Completeness: the Booking.com connector's distance field is assumed, not yet checked. The plan's first task reads one live response to confirm it.
