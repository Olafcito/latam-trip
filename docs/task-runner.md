# Task runner: tasks that start Claude by themselves

A task the app saves used to wait until Simon told Claude "check the checklist". Now a new open task of a type that needs no browser and no mailbox starts a Claude routine within about a minute, and the routine works through every such open task (TECH-002).

## How it runs

1. The app inserts a row into `tasks`.
2. The trigger checks the type (`supabase/migrations/0017_task_runner.sql`, redefined in `0018_task_runner_contract.sql`). A cloud task makes one POST with pg_net to the routine's fire endpoint, with the text `task <id> <type>` and nothing of the task's data. A second task within two minutes makes no new call, since the run already started takes every open cloud task.
3. The routine "Trip checklist on new tasks" starts a cloud session on the repo with the latam-trip and Booking.com connectors. It follows the `task-runner` skill: `claim_task`, do the task by its contract, `finish_task` or `fail_task`, and again until `claim_task` gives no task. A task saved during a run is handled in that run.
4. Every half hour pg_cron fires the routine again when a cloud task has been open for ten minutes, which catches a lost call and a task saved after a run has checked for the last time.

## The cloud tasks and their contract

The connector, not the prompt, decides what a run may do (`latam_trip_mcp/runner.py`). The cloud types are:

| Type | Does | Writes |
| --- | --- | --- |
| `question` | Answers the question in the result | Nothing but the result |
| `lists_update` | Adds to or takes off a saved list | The lists, through `list_add` and `list_remove` |
| `experience_research` | Researches one experience | One experience row |
| `stay_prices` | Prices the named rooms on Booking.com. Hostelworld is the edge function's job | `lodging_prices` rows for those rooms |
| `stay_picks` | Finds three good value places at one stored place on Booking.com for the dates when a stop with nights and no Booking.com place is first opened (FEAT-004): rated 8.0 or more, hostel, hotel or apartment, near the centre or on the beach, few reviewed ones left out, ranked by rating per krone. `finish_task` hides a pick that breaks the rule | At most three new lodgings with one room and its price each, through `add_lodging` |
| `stay_search` | Finds the best rated places at one stored place on Booking.com for the dates and adds them, skipping the ones stored or hidden. Hostelworld is searched by the `stay-rates` edge function in the same press | New lodgings with one room and its price each, through `add_lodging` |
| `refresh` | Checks old experience rows again, scope `experiences` only | Experience rows |

`claim_task` takes the oldest open task of those types, checks its fields against its type, sets it to working with a conditional update so two runs never take the same task, and gives it back with its contract: `does`, `steps`, the only `tools` to use, what it `writes`, what it must `never` do and how to write the `result`. A task with wrong fields is closed as failed with the reason and the run moves on. The claim stamps `claimed_at`, and a task a run claimed but never closed, because the run crashed or timed out, is opened again by the next claim after three hours. The sweep starts a run for it. `finish_task` and `fail_task` close only a task that is working, and `finish_task` refuses a result over 8000 characters or with an em or en dash. The list of types lives in `CLOUD` in `runner.py` and in the newest migration that defines `task_runs_in_cloud` (0021), and a test keeps the two equal.

What the server cannot enforce is which other connector tools a run calls. The contract's `tools` and the skill limit that, and every write tool still checks its own rows.

Hostelworld prices come from the `stay-rates` edge function when a place is opened and each morning from the worker, not from a task (FEAT-002). Flight prices (Momondo and Google Flights in the built-in browser), `place_research`, `refresh` of flights or stays, `booking`, `import_quotes` and `fix_parser` wait for Simon's own checklist run, since they need his browser, his mailbox, the workers or a push.

Limits of the fire endpoint: 30 fires per hour per routine, 100 per account, no idempotency key. The runs count against the Claude subscription like any session. Docs: <https://platform.claude.com/docs/en/api/claude-code/routines-fire>.

## Setting it up, once

1. At <https://claude.ai/code/routines> create a routine named "Trip checklist on new tasks" on the `latam-trip` repo with the latam-trip and Booking.com connectors and the prompt below. No schedule.
2. In the routine, Add another trigger, API, Generate token. The token shows once. Put the routine URL in `.env` as `TASK_RUNNER_URL` and the token as `TASK_RUNNER_KEY`.
3. Claude stores both in Vault as `task_runner_url` and `task_runner_token` over the database connection in `supabase/migrate.py`, reading them from `.env` without printing them. The URL stored is the fire endpoint `https://api.anthropic.com/v1/claude_code/routines/<trig id>/fire`, built from the `trig_` id in the routine URL. Simon does not open the SQL editor.
4. Claude fires one test run with `select public.fire_task_runner('sweep')` and checks that `net._http_response` holds a 200 with a session id.

Without the two Vault secrets the trigger does nothing. Done on 2026-11-05.

## The routine's prompt

Paste this as the routine's prompt. Everything else lives in the skill and the connector, so the prompt does not change when a task type does.

```
Use the task-runner skill (plugin/skills/task-runner/SKILL.md) and nothing else.
Call claim_task on the latam-trip connector, do the task exactly as its contract says, close it with finish_task or fail_task, and repeat until claim_task returns no task.
Do not read other files in the repo, do not edit code and do not commit.
```

