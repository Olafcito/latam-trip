# Task runner: tasks that start Claude by themselves

A task the app saves used to wait until Simon told Claude "check the checklist". Now a new open task of a type that needs no browser and no mailbox starts a Claude routine within about a minute, and the routine works through every such open task (TECH-002).

## How it runs

1. The app inserts a row into `tasks`.
2. The trigger of `supabase/migrations/0017_task_runner.sql` checks the type. A cloud type (`question`, `lists_update`, `experience_research`, `place_research`, `stay_prices`, `stay_search`, `refresh`) makes one POST with pg_net to the routine's fire endpoint, with the text `task <id> <type>` and nothing of the task's data. A second task within two minutes makes no new call, since the run already started reads the whole table.
3. The routine "Trip checklist on new tasks" starts a cloud session on the repo with the latam-trip and Booking.com connectors. It claims each cloud task by setting it to working, does it as `trip-checklist` says, and leaves the rest open.
4. Every half hour pg_cron fires the routine again when a cloud task has been open for ten minutes, which catches a lost call and a task saved during a run.

Flight prices (Momondo and Google Flights in the built-in browser), Hostelworld prices, `booking`, `import_quotes` and `fix_parser` still wait for Simon's own checklist run, since they need his browser, his mailbox or a push.

Limits of the fire endpoint: 30 fires per hour per routine, 100 per account, no idempotency key. The runs count against the Claude subscription like any session. Docs: <https://platform.claude.com/docs/en/api/claude-code/routines-fire>.

## Setting it up, once

1. At <https://claude.ai/code/routines> create a routine named "Trip checklist on new tasks" on the `latam-trip` repo with the latam-trip and Booking.com connectors and the prompt below. No schedule.
2. In the routine, Add another trigger, API, Generate token. Copy the URL and the token. The token shows once.
3. In the Supabase SQL editor, store both in Vault:

       select vault.create_secret('<the URL>', 'task_runner_url');
       select vault.create_secret('<the token>', 'task_runner_token');

4. Run the migrations from the repo root: `uv run --quiet --no-project --with "psycopg[binary]" python -X utf8 supabase/migrate.py`.
5. Test: ask a question from the app. A session should appear under the routine within a minute.

Without the two Vault secrets the trigger does nothing, so the migration is safe to run first.

## The routine's prompt

```
This run was started because Simon's latam-trip planner added a task to the Supabase tasks table. The text passed with the run names the task id and type, or says sweep, but always work from the table itself, since several tasks may be open.

1. In the latam-trip repo, read CLAUDE.md and plugin/skills/trip-checklist/SKILL.md and follow them, with these differences for an unattended cloud run:
   - This environment has no Supabase key and no .env. Read and update tasks, and write results, through the latam-trip connector (its task, lodging, lodging price and other tools). If the connector is not available in this run, stop and say so in one line.
   - Work only on task types that need no browser and no mailbox: question, lists_update, experience_research, place_research, refresh with scope experiences, and the Booking.com part of stay_prices and stay_search through the Booking.com connector (1 adult, DKK, user_country_code dk). Leave every other open task untouched for Simon's own checklist run: flight_prices, fix_parser, booking, import_quotes, refresh of flights or stays, and Hostelworld prices.
   - Before working on a task, set it to working. Skip any task that is already working, since two runs can overlap. When it is done, write the result and set it to done as the skill says.
   - Never book, pay, sign in, tick consent boxes or solve captchas. Never write a price that was not seen on the site.
2. If no task of those types is open, stop at once without doing anything else.
3. End with a summary of at most five lines naming the tasks handled and the ones left for Simon, with no booking references, names or prices paid.
```
