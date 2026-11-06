# The latam-trip connector

The connector lets an assistant read and change the trip data in Supabase: trips, flights, connections, stays, experiences, places, tasks, bookings and places to stay. It is an MCP server on AWS Lambda, and it works in Claude (web, desktop and phone) and Claude Code.

Server address:

```
https://n1e8j7vob1.execute-api.eu-west-1.amazonaws.com/mcp
```

Every planner account can connect its own assistant, and the assistant sees only that account's rows, as the planner does. Nothing about a trip is readable without a sign in.

## How the sign in works

The sign in is the planner's own Supabase sign in. Supabase is the authorization server, and the connector only checks the tokens it issues (TECH-010).

1. The assistant registers itself with Supabase and opens the planner's consent page.
2. If the planner is not signed in on that browser, it asks for the usual email link first. The link keeps the request and comes back to the consent page.
3. The page leads with Latam trip, names the app with the address it goes back to under it, and says what it may read and change. Press **Allow**, and the assistant goes on by itself. **Deny** sends it back with nothing.

Only Claude on claude.ai and Claude Code on the same computer (a `localhost` or `127.0.0.1` address) are let through. Any other return address is refused on the page.

The assistant holds a Supabase token for your account and renews it by itself, so the sign in is rare. When the same app connects again, the page passes it on without asking. A token the planner holds for itself is refused by the connector, so a browser session cannot stand in for a connection.

## Add it to Claude

On claude.ai or the desktop app:

1. Open **Settings**, then **Connectors**.
2. Press **Add custom connector**.
3. Name it `Latam trip` and paste the server address. Leave the advanced OAuth fields empty.
4. Press **Connect** and allow it as above.

A connector added on claude.ai also shows up in the Claude phone apps. Turn it on per chat from the tools menu.

## Add it to Claude Code

```bash
claude mcp add --transport http latam-trip https://n1e8j7vob1.execute-api.eu-west-1.amazonaws.com/mcp
```

Then run `/mcp` in Claude Code, pick `latam-trip` and choose **Authenticate**. A browser opens on the planner's consent page.

## The tools

Every type has five tools: `list_`, `get_`, `add_`, `update_` and `delete_`. Add takes a batch of rows and saves the good ones even when some are refused. Delete is soft, and `update_` with `restore: true` undoes the last delete or change.

| Type | Tools | Notes |
| --- | --- | --- |
| trip | `list_trip` `get_trip` `add_trip` `update_trip` `delete_trip` | Saved as versions. A change makes a new version and keeps the old ones. |
| flight | `list_flight` `get_flight` `add_flight` `update_flight` `delete_flight` | Needs only from, to, date and price in DKK. Stored as a chat quote. |
| connection | `list_connection` `get_connection` `add_connection` `update_connection` `delete_connection` | A bus, boat, train or other way between two places. |
| stay | `list_stay` `get_stay` `add_stay` `update_stay` `delete_stay` | The old crawled stay prices, a catalogue every signed in person reads. Only the admin may add, change or delete them, so `add_stay`, `update_stay` and `delete_stay` are refused for anyone else. Places to stay are lodgings. |
| experience | `list_experience` `get_experience` `add_experience` `update_experience` `delete_experience` | Things to do at a place. |
| place | `list_place` `get_place` `add_place` `update_place` `delete_place` | A town, beach or airport on the map. |
| task | `list_task` `get_task` `add_task` `update_task` `delete_task` | Work for the research agents. |
| booking | `list_booking` `get_booking` `add_booking` `update_booking` `delete_booking` | A ticket or a bed that is paid for, one row per leg or stay. `list_booking` takes `from`, `to`, `day` and `place`. Delete sets the booking cancelled and keeps the row. |
| lodging | `list_lodging` `get_lodging` `add_lodging` `update_lodging` `delete_lodging` | A place to stay that Simon asked for, with photos, rating, distances and rooms. `add_lodging` takes rooms under each lodging and prices under each room, and saves a lodging whole or not at all. `place_id` must be in the places and `tags` come from the tag words beach, pool, social, quiet, kitchen, breakfast, aircon and workspace. A lodging with the name of one stored at that place is that one, so a row sent again keeps its fields, adds the rooms and prices it lacked and is named in `skipped`. A place is never stored twice, and a row whose write failed halfway is finished by sending it again. `get_lodging` gives its rooms by name with their prices by dates. `list_lodging` takes `place` and leaves out hidden ones unless `where` has `hidden`. `update_lodging` changes the lodging alone. Delete hides it and keeps the row. |

Two tools keep the caller's own profile, one row per person in `user_profiles`:

- `get_profile` gives `home_airport` (three capital letters), `currency` (ISO 4217, three capital letters), `max_hours` (the longest journey in one direction, above 0), `travel_style` and `rules` (free text). A person with no profile gets every field empty, `empty: true` and an `ask` that tells Claude to ask the person for it before the first search.
- `update_profile` takes the fields to change in `patch` and keeps the others. A field set to null is cleared. An unknown field or a bad value is refused with the reason.

The planner's profile sheet, opened from the person mark at the end of its header, reads and writes the same row. It checks the fields by the same rules and marks a bad one on its own row.

Two more tools change the dates of a trip:

- `set_leg_date` puts one leg on a day. No other leg moves.
- `shift_leg` moves one leg and every later leg by a number of days, up to the first booked leg.

A booked leg holds its day. `set_leg_date`, `shift_leg` and `update_trip` refuse to move it, and `update_trip` also refuses to drop it or change its ends. `shift_leg` leaves it and every leg after it where they are. Change or cancel the booking first.

Two tools attach files to a booking. They go in the private `bookings` bucket, and only PDF and photo types are taken.

- `attach_booking_file` takes a file of up to 4 MB as base64, such as a PDF from a mail.
- `attach_booking_upload` gives a signed upload URL for a larger file, valid for 2 hours. A file with the same name is replaced. The entry's size is null until the upload is confirmed, so an attachment with size null may not be in the bucket yet.

`add_lodging_price` adds prices to rooms that exist, one row per room and date range in DKK. A row for a room that does not exist is refused. It never makes a lodging, so a stay price task only writes prices.

Five tools are for the task runner (`docs/task-runner.md`), the cloud run that does tasks by itself:

- `claim_task` takes the oldest open task a cloud run may do, checks its fields, sets it to working and gives it back with its contract: what to do, the steps, the only tools to use, what to write and what never to do. Other task types stay open for Simon.
- `finish_task` stores the result of a claimed task, sets it done and logs it. A result with an em or en dash, or over 8000 characters, is refused.
- `fail_task` closes a claimed task as failed with the reason.
- `list_add` and `list_remove` put a place or an experience on one of the saved lists or take it off.

Two tools are for the account itself:

- `export_account` gives every row the account holds, table by table with the profile included, and the paths of its booking files. It gives no file contents.
- `delete_account` deletes the account and everything in it, and cannot be undone. It needs the account's own email, typed by the person, never filled in by the assistant. The email is compared without regard to case. The admin's account cannot be deleted this way. The booking files go first, and if one cannot be removed nothing else is deleted and the same call can run again. Then the working tasks are failed and the account is removed with every row it owns, and the tool answers with the number of rows that went from each table. The invite of the account's email goes too, so signing up again needs a fresh `tripdb invite`. The connection stops working at once, and the next call answers that the account was deleted. The daily backups keep some of the rows up to 90 days before they expire (TECH-013).

A person may make 60 changes a minute through the connector. The 61st is refused with a plain message to wait a minute. Reading is not counted.

Bookings, their references, prices and files live only in the owner only table and the private bucket, never in a built file. Places to stay, their rooms and prices live only in their owner only tables too.

Each tool describes its fields to the assistant, so asking in plain words works, for example "add the 450 DKK flight from San Jose to Liberia on 12 December".

## When it does not work

- **The planner shows its normal sign in screen.** That browser was not signed in. Send yourself the link from that screen. It keeps the request and lands on the consent page.
- **The page says the request has run out.** It was already answered, or it is old. Start the connection again from the assistant.
- **The page refuses the return address.** The app is not Claude or Claude Code. Only those two are let through.
- **The assistant says it has no access any more.** Its renewal ran out or was revoked. Remove the connector and add it again. That runs a fresh sign in.

## For whoever runs it

- Code: `latam_trip_mcp/` (`server.py` is the app, `core.py` the tools, `oauth.py` the protected resource metadata and the bearer check against the project's JWKS). The connector serves no sign in route of its own.
- Supabase Auth settings (live and in `supabase/local/supabase/config.toml`): the OAuth 2.1 server on, dynamic client registration on, the authorization path `/` and `site_url` the planner's address, so Supabase sends the consent request to the planner's root with `?authorization_id=`.
- Deploy: `AWS_PROFILE=<profile> bash infra/mcp/deploy.sh` deploys the whole stack from the PC. The project URL and the publishable key go into SSM first with `infra/mcp/put-secrets.sh`. The connector has no secret key, and the old secret key and passphrase parameters are deleted the day after the switch. Once the release is set up (TECH-008), a push to `main` runs `deploy.sh --code-only` from `.github/workflows/release.yml`, which only updates the function's code. A change to `template.yaml` still needs the full deploy. `--code-only` first reads the function's configuration and stops, before it uploads anything, when `LATAMTRIP_URL_PARAM` or `LATAMTRIP_PUBLISHABLE_KEY_PARAM` is missing, so code that needs a new variable never runs on a function that lacks it. Run the full deploy then and release again. Both end with a check that `POST /mcp` without a bearer answers 401.
- The smoke check calls no tool with a token. A token for the live connector comes only from a person signing in through the consent page, and Supabase's refresh tokens are used once, so the release would need a standing account with its password in the environment `release`, and that account's token reads its rows. The release keeps no such account. A tool call as a person is tested in `latam_trip_mcp/test_auth.py`, which signs two people in through the whole OAuth flow on the local stack and runs their tools. After a release that changes the sign in, ask the assistant to list the trips once.
- The switch to the OAuth server goes live in this order, each step from the PC unless named otherwise:
  1. `bash infra/mcp/put-secrets.sh` puts the project URL and the publishable key in SSM.
  2. `bash infra/mcp/deploy.sh` in full deploys the new template and this code together, so the function gets the new variables and loses the secret key's.
  3. Merge to `main`. The release applies migration 0033, ships the same code with `--code-only`, which now finds the variables, and builds the planner with the new consent page.
  4. Change the live Supabase Auth settings: the OAuth 2.1 server on, dynamic client registration on, the authorization path `/` and `site_url` the planner's address.
  5. Remove the connector in Claude and add it again, which signs in through the consent page, then ask it to list the trips.
  6. A day later, delete the SSM parameters `supabase-secret-key` and `signin-passphrase` under `/latam-trip-mcp/`.

  Steps 2 to 5 run back to back, from the commit that merges. Between them the old connections stop working and a flight cannot be saved until 0033 is applied. A release before step 2 stops at the configuration check and ships nothing. Until step 6 a rollback is a full `deploy.sh` of the commit before the switch, with the live Auth settings put back.
- Tests: `python -I -X utf8 -m unittest discover -s latam_trip_mcp -p "test_*.py"`. A test checks that every tool is named on this page. `test_auth.py` and `test_account.py` also run on the local stack with `TRIPDB_DB_TESTS=1`, as the database job of `.github/workflows/test.yml` does. A test there fails when a migration adds an `owner_id` table that `ACCOUNT_TABLES` or `SERVICE_TABLES` in `core.py` does not name.
- The write limit is `connector_writes_per_minute` in `owner_limits` (60), counted per owner and minute in `connector_writes` by `connector_call` (migration 0037). Every tool calls it before it runs, so a refused change writes nothing. A read is not counted, but it is refused too when the account was deleted.
- The planner's consent step is `planner/src/components/Consent.tsx` with `planner/src/lib/consent.ts`. Supabase sends the person to the planner's root with `?authorization_id=`. The page reads the request with the person's session, refuses a redirect host other than `claude.ai`, `localhost` and `127.0.0.1`, follows an already approved request at once, and answers allow or deny. The request survives the magic link sign in.
