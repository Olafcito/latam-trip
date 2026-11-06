# FEAT-004: Three value places when a stop opens

- Date: 2026-11-06
- Status: Reviewed on 2026-11-06 (section 13). Simon answered Q1 to Q4 the same day. Waiting on his answers to the questions in section 13, then a plan.

## 1. Problem

Simon wants "the three initial hotels to identify value": near the centre or the beach, rated 8 or more, popular by their review count, and the best rating for the money. Not dorms, and not the places Hostelworld already gives. Today a stop starts empty until he presses Find accommodations (FEAT-003). That press adds the most popular Hostelworld hostels and, through the `stay_search` task, the Booking.com places rated 8.0 or more with the most reviews. Neither half looks at the distance to the centre or at the price, so the most reviewed place can be a far resort or the dearest hotel in town. And the search waits for a press, when Simon wants it to start as soon as he opens Add accommodation for a city.

## 2. Journey

1. **Open a new stop.** Simon opens Add accommodation at a stop with nights where no Booking.com place is stored yet, whether or not Hostelworld places are. Without pressing anything, the sheet shows Claude is on it, the same live mark FEAT-003 shows while Booking.com is asked.
2. **Close and come back.** He can close the sheet or go to another stop. The task runs in the cloud and the mark follows it when he comes back.
3. **Three value places come in.** Within a minute or two three cards arrive, each near the centre or on the beach, rated 8 or more, and the best rating for the money for the stop's dates, with the more reviewed place winning a close call. None is a hostel, so none repeats a Hostelworld card and none should be a dorm bed. Each card already shows its distance to the centre, or its beach tag, with its rating, review count and price, so he can compare the three at a glance.
4. **Rooms and photos follow.** Each new Booking.com place queues a `stay_details` task by itself (migration 0022), and the PC queue loop reads its rooms and photos.
5. **Open one and pick.** He opens a card, sees its rooms cheapest first, and picks a room as today.
6. **Want more.** Find accommodations still adds the popular Hostelworld hostels and more Booking.com places, as in FEAT-003, also while the three are still being found.
7. **Open the same stop again.** Nothing is queued a second time for the same place and dates, whether the first task is still running, done or failed.

## 3. Goals

- A new stop shows three good value places without a press.
- The value rule is written once, in the `stay_picks` contract in `latam_trip_mcp/runner.py`, which `claim_task` hands to the cloud run and to a PC run alike.
- Each card carries the facts the rule chose it on: distance or beach, rating with reviews, price.

## 4. Non goals

- No new screen and no change to the card's layout beyond what it already shows.
- No change to the Hostelworld half or to what the Find press adds.
- No Airbnb, no Expedia. Booking.com only, through the connector the routine already has.
- No ranking of places already stored, and no hiding of places already stored that the rule would not have picked.
- No change to the routine's prompt at claude.ai.
- No booking, ever.

## 5. User stories

- S1 (step 1). As Simon, opening Add accommodation at a new stop, I want the value search to start by itself, so that I do not have to know about a Find button.
- S2 (step 2). As Simon, after closing the sheet, I want the search to carry on and show its state when I return, so that I can plan another stop meanwhile.
- S3 (step 3). As Simon, comparing places, I want three places near the centre or the beach with the best rating for the money, so that the first places I see are worth picking.
- S3b (step 3). As Simon, I want none of the three to be a hostel, so that I get no dorm beds and nothing Hostelworld already shows.
- S4 (step 3). As Simon, I want each card to show its distance to the centre, or that it is on the beach, so that I can see why it was chosen.
- S5 (step 5). As Simon, inside a place, I want its rooms listed cheapest first, so that the price I compare is the first one I see. (Built as a fix on 2026-11-06.)
- S5b (step 6). As Simon, pressing Find accommodations while the three are still being found, I want the press to work, so that I get the Hostelworld places without waiting.
- S6 (step 7). As Simon, opening the same stop again, I want no second search, so that the checklist does not fill with repeats.

## 6. Acceptance criteria

- S1: Opening the sheet inserts exactly one `stay_picks` task when all of these hold: the stop has nights, its check in is today or later, no Booking.com lodging is stored at the place (hidden or not), no `stay_picks` task exists for the place and dates in any status, and none is open or working at the place for other dates. A unit test on the decision function covers each condition.
- S1: A stop that fails any condition inserts nothing.
- S2: With the task open or working, the sheet shows the live Booking.com mark after a reload. A shot proves it.
- S3: `finish_task` on a `stay_picks` task looks up the lodgings named in `outputs`, refuses outputs that are not lodgings at `place_id`, and hides every one rated under 8.0, with under 5 reviews or none, or of kind hostel, and every one past the third, naming them in the stored result. A test in `latam_trip_mcp` covers each.
- S3: The contract's worked example ranks a 9.2 at 600 kroner above an 8.1 at 500 kroner with equal reviews.
- S3: A run on a real stop adds at most three lodgings whose rating is 8.0 or more, whose review count meets the floor and whose `to_center_km` is set or whose tags hold beach. Checked once live on a stop with no Booking.com place, which also proves the auto insert, and once on Cartagena with a `stay_picks` task added by hand, since Cartagena already has Booking.com places from FEAT-003.
- S3b: In the same two live runs, once their `stay_details` tasks have run, none of the picks has a bed in a shared room as its cheapest room for the dates, judged by the room names stored.
- S4: `add_lodging` sets `to_center_km` from the lodging's and the place's lat and lon when the caller leaves it out and the lodging has both. A test in `latam_trip_mcp` covers it, and a shot shows it on the card.
- S5b: With a `stay_picks` task open, Find accommodations asks Hostelworld and inserts its `stay_search` task. A unit test covers it.
- S6: Opening the sheet twice for the same place and dates leaves one task. A unit test covers an open, a done and a failed task. The database refuses a second `stay_picks` row for the same place and dates, checked once live, and the app treats that refusal as already queued.

## 7. Functional requirements

- A new cloud task type, `stay_picks`, with data `place_id`, `check_in`, `check_out`, checked as `stay_search` data is (`_search_check`, with no `top`). It joins `CONTRACTS`, and so `CLOUD`, in `latam_trip_mcp/runner.py`, and `task_runs_in_cloud` in a new migration, kept equal by the existing test.
- The same migration adds a unique index on the place and dates of `stay_picks` rows, `((data->>'place_id'), (data->>'check_in'), (data->>'check_out')) where type = 'stay_picks'`, so two opens at once, on the phone and the laptop, still make one task.
- Its context is `stay_search`'s, with the place's lat and lon added for both types: the place and the lodgings stored there.
- The method is the contract's `steps`, as `stay_search`'s is, so the routine prompt and its "nothing else" rule stay as they are. The rule, in order:
  1. Search Booking.com for the place, dates, 1 adult, 1 room, DKK, user country dk, `minimum_review_score` 8. Run up to three searches (the centre, the beach in a town on the coast, and a lower nightly price band) and pool them, because one search returns about 10 properties and leaves the rating out of many of them.
  2. Keep properties with a rating of 8.0 or more, 5 reviews or more, a price for the dates and coordinates. A property with no rating shown is left out.
  3. Leave out every property of type Hostel or Capsule hotel, and any with hostel in its name. The connector gives one price and no room type, so such a price can be a dorm bed, and hostels are the Hostelworld half's job.
  4. Leave out places already stored at the place, by Booking.com link or by name, Hostelworld ones included, and any stored with hidden true.
  5. Keep those within 2 km of the place's lat and lon, or within 5 km and listed with the Beachfront or Beach facility. Widen the 2 km to 3 km, then 5 km, when fewer than three remain, and say so in the result.
  6. Rank by value: the rating points above 7, times the log of the review count, per krone of the stay's total. Written out, `(rating - 7) * log10(reviews) / total_dkk`. Take the top three. A worked example in the steps shows a 9.2 at 600 kroner above an 8.1 at 500 kroner with equal reviews.
- Each pick is written with `add_lodging` as `stay_search` writes it, with tags beach when it was kept for the beach facility, and `outputs` names the lodging ids in rank order. `add_lodging` fills `to_center_km` from the lodging's and the place's lat and lon when the caller leaves it out, using the `haversine_km` that `core.py` already has.
- `finish_task` checks a `stay_picks` finish as S3 says. A hidden pick keeps the `stay_details` task its insert queued.
- `tripdb.PUBLIC_LOG` gets `stay_picks`, keeping its type, place and dates with a fixed summary and no outputs, as `stay_prices` is kept, since its result names places and prices from owner only tables and `task_log` is published. `stay_search` gets the same line, as it lacks it today.
- The planner checks the S1 conditions when the sheet opens and inserts the task. A refused insert for a key that is there already counts as queued. The live mark reads `stay_picks` tasks as it reads `stay_search` tasks today.
- The Find press keeps its own guard: an open `stay_picks` task shows the mark but does not stop the press. The cloud run takes the older `stay_picks` first, so the `stay_search` after it skips the three picks as stored.

## Connector facts (read live on 2026-11-06)

A Cartagena search for 20 to 23 December, 1 adult, DKK, `minimum_review_score` 8, gave 10 properties. Each had `price.book` as the total for the stay in kroner, `accommodationType`, `facilities`, the address, district and coordinates. Only 3 of the 10 had a `rating` object with `review_score` and `number_of_reviews`. None had a distance, a room name or a room type. The connector has no sort and no value field. Its only levers are `minimum_review_score` (7 to 9), a nightly price range, accommodation types, facilities and the free text query.

## 8. UX requirements

- No new component. The live mark, the card shapes while searching and the card itself are FEAT-003's.
- The distance on a card is the one `StayCard` already renders from `to_center_km`, and the beach is the tag it already renders.
- No prose line about why a place was picked. The facts on the card are the reason (CLAUDE.md, let the interface carry the information).

## 9. Edge cases

- A small town with no rated property of 8.0 and 5 reviews: the distance widens as in step 5, and with none left the task finishes with no lodgings and a result that says so. The sheet shows the empty list with Find accommodations.
- A property with no coordinates is left out, as its distance cannot be known. Every place has lat and lon, as the places table requires them.
- Every search returns properties with no rating: the task finishes with no lodgings and a result that says so, and Find accommodations still works.
- The connector is down: the task fails with the reason, the mark goes away, and opening the sheet again does not queue another (S6). Find accommodations still works.
- Dates change in the sheet while a `stay_picks` task is open or working at the place: nothing new is queued. Once it is closed with no Booking.com place stored, new dates are a new key and a new task when the conditions hold.
- A stop whose check in is before today, opened during the trip: nothing is queued, since Booking.com sells no past nights.
- Several new stops opened in a row: each queues a task. A task saved under two minutes after the last fire, once the run has finished, waits for the half hour sweep (`docs/task-runner.md`), so it can take up to about 40 minutes.
- The phone on a weak signal: the insert fails quietly and is tried again the next time the sheet opens.

## 10. Dependencies

- `latam_trip_mcp/runner.py` (contract with its steps, context, the finish check) and `latam_trip_mcp/core.py` (`to_center_km` in `add_lodging`), and their tests. Live only after `infra/mcp/deploy.sh`.
- `plugin/scripts/tripdb.py` (`PUBLIC_LOG`) and its tests. The worker's copy follows only through `bash infra/deploy.sh --enable-schedules`.
- `supabase/migrations/0023_stay_picks_task.sql` (the cloud type list and the unique index). 0022 is taken by `stay_details`.
- `plugin/skills/task-runner/SKILL.md` (the list of task types), `plugin/skills/trip-checklist/SKILL.md` (its line for `stay_search` names `stay_picks` too), `docs/task-runner.md` (the table of cloud types, not the prompt), synced to `.claude/` with `sync_claude_dir.py`.
- `planner/src/components/stays/useStayFind.ts`, `planner/src/lib/tasks.ts`, `planner/src/components/story/StopFold.tsx`.
- Tables: `tasks` (owner only, the app inserts as the owner), `lodgings`, `lodging_rooms`, `lodging_prices` (owner only), `task_log` (published, see `PUBLIC_LOG` above). Nothing new in the public bucket.

## 11. Checks

- Tests: S1, S3, S4, S5b and S6 as written above, in `planner` and `latam_trip_mcp`, and `PUBLIC_LOG` in `plugin/scripts`.
- Live: one run on a stop with no Booking.com place, opened from the app, and one on Cartagena from a task added by hand, each looked at again after its `stay_details` tasks.
- Design: shots of steps 1 and 3. No roast, because the screen and its components do not change.

## 12. Decisions (Simon, 2026-11-06)

- Q1: a floor of 5 reviews is enough. Review count works as popularity in the value score instead of as a hard floor.
- Q2: near the centre or the beach both count. The connector shows no distance, so the centre is the place's lat and lon and the beach is Booking.com's Beachfront or Beach facility.
- Q3: the best rating for the money, not the cheapest. The connector cannot rank for it, so the contract computes the score.
- Q4: it runs at stops that have only Hostelworld places, never repeats them, and gives no dorms. Leaving out hostels does both.

Completeness: the value score has been worked by hand on one Cartagena search only. The live checks in section 11 test it on a second stop.

## 13. Review (2026-11-06)

Independent review against `runner.py`, `core.py`, migrations 0017, 0018, 0021 and 0022, `useStayFind.ts`, `tasks.ts`, the `task-runner` and `trip-checklist` skills and `docs/task-runner.md`. Verdict: ready to plan once Simon has answered the questions below. Q1 to Q4 were not reopened.

### What changed

- **The rule moved from a new skill into the contract's steps.** The routine's prompt says to use the task-runner skill "and nothing else" and not to read other files, and it lives in the routine at claude.ai, so a repo edit to `docs/task-runner.md` would not change it. TECH-002 put every task's method in the connector so the prompt never changes, and `stay_search` already carries a rule as long as this one in its steps. A PC run already gets the contract from `claim_task` (`trip-checklist` says so for `stay_search`), so the rule is still written once and both runs follow it. The skill, its sync and the prompt change are cut.
- **The S3 guard was rewritten.** A contract's `check` reads the task's data at claim time and never sees what was written, so it could not refuse a finish. The guard is now in `finish_task` and works on `outputs`. It hides an offender instead of refusing, because a refused finish leaves the lodgings written and a run that has no tool to take them away. It reads `outputs`, not every lodging added since `claimed_at`, so a `stay_search` from a Find press in a second run at the same place is never hidden by mistake.
- **S6 got a unique index.** The app is the owner, so it can read every task, and a select before the insert works for the common case. Two opens at once, on the phone and the laptop, or the double effect in a dev build, race that select. A partial unique index on place and dates makes one task certain, and the app reads its refusal as queued.
- **S1 gained two conditions.** No task while another is open or working at the place for other dates, so moving the dates in the sheet does not queue one per pick. No task for a check in before today, which would only fail during the trip.
- **The beach exception got a 5 km cap.** As written, a Beachfront resort 30 km out, on Barú from Cartagena, passed step 5, which is the far resort the problem names. Beach picks also get the beach tag, so the card shows why one 4 km from the centre was chosen (S4).
- **The hostel rule was widened** to Capsule hotel and hostel in the name, and step 2 now needs a price and coordinates. See the dorm question below.
- **Privacy.** `task_log` is published in the built data, and `public_log_row` scrubs only `booking` and `stay_prices`. Live `task_log` already holds two `stay_search` rows with the task's note and the lodging ids as outputs, and the contract asks the result to name the places. `stay_picks` and `stay_search` both go into `PUBLIC_LOG`. The spec's "nothing owner only" line was corrected.
- **The live check was split.** Cartagena already has Booking.com places from FEAT-003, so opening it would queue nothing. The auto path is proven on a stop with no Booking.com place, and Cartagena gets a task added by hand.
- **Smaller.** S5b and the Find guard: today `find()` returns at once while any Booking.com task is marked, so the auto task would have silenced the press for a minute or two. The context gains lat and lon, which `stay_search`'s lacks. The edge case of a place with no lat and lon was replaced, as the places schema requires both. The deploys of the MCP and the worker were added, and the debounce edge case.

### Findings with no edit

- **The worked example holds.** 2.2 / 600 is 0.0037 and 1.1 / 500 is 0.0022, at any equal review count of 2 or more.
- **The stay_details interplay** is sound: three Booking.com picks queue three PC tasks, the mark reads by type so they never show as searching, and a hidden pick still gets read. The cost is volume. Every new stop Simon opens adds three tasks to the PC checklist, so a pass over 15 stops is 45 page reads.
- **A simpler path was weighed.** A `rank: "value"` field on `stay_search` would need no migration and no new mark query. It was not taken: S6 needs a key of its own, kept apart from Find's repeatable `stay_search`, and one contract with two rules is harder to follow than two contracts.

### What I would cut

- If the build runs heavy, the S3 guard in `finish_task` is the first cut. The contract's steps and the two live checks would still prove the rule.
- The third search, the lower price band, until a live run shows two searches leave fewer than three candidates.

### Questions only Simon can answer

1. **The review weight.** The journey says the more reviewed place wins a close call, but `log10(reviews)` runs from 0.7 at 5 reviews to 3.7 at 5000. A 9.0 with 2000 reviews at 900 kroner beats a 9.0 with 20 reviews at 400 kroner. Keep it, or shrink each rating toward 8.0 by its reviews instead, `(reviews * rating + 20 * 8) / (reviews + 20)` in place of `rating`, with no log, so reviews settle close calls only. Simon decides, before the plan.
2. **Dorms.** Leaving out hostels removes most dorm beds but not all. A guesthouse or hotel that sells beds shows its dorm price as its one price, and the score divides by price, so it is the very place the rule favours. The S3b live check will show how often. Is a dorm slipping through acceptable until then, or should a pick whose `stay_details` read finds a shared room as its cheapest be hidden. Simon decides.
3. **Unrated places.** Only 3 of 10 properties showed a rating, though the search's `minimum_review_score` already means all 10 are 8 or more. In a small town that can leave fewer than three. Fill from those last, with their rating read later by `stay_details`, or keep them out as Q1 implies. Simon decides after the first live run.
4. **A booked stop.** Should a stop with a booked stay queue nothing, as its stay is settled. Simon decides.

Proposed PROD decision, status Proposed: a stop with nights and no Booking.com place gets one value search when its sheet first opens, once per place and dates, and never again on its own.
