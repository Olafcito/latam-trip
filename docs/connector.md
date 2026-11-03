# The latam-trip connector

The connector lets an assistant read and change the trip data in Supabase: trips, flights, connections, stays, experiences, places and tasks. It is an MCP server on AWS Lambda, and it works in Claude (web, desktop and phone), Claude Code and ChatGPT.

Server address:

```
https://n1e8j7vob1.execute-api.eu-west-1.amazonaws.com/mcp
```

Only the owner can sign in. Nothing about the trip is readable without a sign in.

## How the sign in works

When an assistant connects, it opens a page called **Connect Latam trip**. It has two ways in.

1. **Email me a sign in link** (the usual way). The page sends the same Supabase sign in email the planner sends. Open the link on any device. It opens the planner, signed in, with a screen that says **Connect ChatGPT to Latam trip** (or whichever app asked). Press **Allow**. The first page, the one the assistant opened, notices within two seconds and goes back to the assistant by itself. You can close the planner tab.
2. **Use the passphrase instead**. A fallback for when the email is slow. The passphrase is a secret kept in AWS SSM at `/latam-trip-mcp/signin-passphrase`, set with `infra/mcp/put-secrets.sh`. It is not your Supabase password.

A link lasts ten minutes and works once. Five link requests or wrong passphrases within five minutes lock the page for five minutes.

After a sign in, the assistant holds a token for 30 days and renews it by itself, so the sign in is rare. A renewal token that goes unused for 180 days runs out.

## Add it to Claude

On claude.ai or the desktop app:

1. Open **Settings**, then **Connectors**.
2. Press **Add custom connector**.
3. Name it `Latam trip` and paste the server address. Leave the advanced OAuth fields empty.
4. Press **Connect** and sign in as above.

A connector added on claude.ai also shows up in the Claude phone apps. Turn it on per chat from the tools menu.

## Add it to Claude Code

```bash
claude mcp add --transport http latam-trip https://n1e8j7vob1.execute-api.eu-west-1.amazonaws.com/mcp
```

Then run `/mcp` in Claude Code, pick `latam-trip` and choose **Authenticate**. A browser opens on the sign in page.

## Add it to ChatGPT

Custom connectors need developer mode, on a plan that has it.

1. Open **Settings**, then **Apps and Connectors**, then **Advanced settings**, and turn on **Developer mode**.
2. Back in **Apps and Connectors**, press **Create**.
3. Name it `Latam trip`, paste the server address, and pick **OAuth** as the authentication.
4. Tick that you trust the connector and press **Create**. ChatGPT opens the sign in page.
5. In a chat, turn the connector on from the tools menu (developer mode).

## The tools

Every type has five tools: `list_`, `get_`, `add_`, `update_` and `delete_`. Add takes a batch of rows and saves the good ones even when some are refused. Delete is soft, and `update_` with `restore: true` undoes the last delete or change.

| Type | Tools | Notes |
| --- | --- | --- |
| trip | `list_trip` `get_trip` `add_trip` `update_trip` `delete_trip` | Saved as versions. A change makes a new version and keeps the old ones. |
| flight | `list_flight` `get_flight` `add_flight` `update_flight` `delete_flight` | Needs only from, to, date and price in DKK. Stored as a chat quote. |
| connection | `list_connection` `get_connection` `add_connection` `update_connection` `delete_connection` | A bus, boat, train or other way between two places. |
| stay | `list_stay` `get_stay` `add_stay` `update_stay` `delete_stay` | A place to sleep with its price for given nights. |
| experience | `list_experience` `get_experience` `add_experience` `update_experience` `delete_experience` | Things to do at a place. |
| place | `list_place` `get_place` `add_place` `update_place` `delete_place` | A town, beach or airport on the map. |
| task | `list_task` `get_task` `add_task` `update_task` `delete_task` | Work for the research agents. |

Two more tools change the dates of a trip:

- `set_leg_date` puts one leg on a day. No other leg moves.
- `shift_leg` moves one leg and every later leg by a number of days.

Each tool describes its fields to the assistant, so asking in plain words works, for example "add the 450 DKK flight from San Jose to Liberia on 12 December".

## When it does not work

- **The page says "This sign in has run out".** The ten minutes passed, or the code was already used. Start the connection again from the assistant.
- **No email arrives.** Look in spam for a mail from Supabase. Wait a minute before asking again, the page locks after five tries. Or use the passphrase.
- **The planner shows the normal sign in screen instead of Allow.** The link was opened in a browser that was not signed in and the sign in did not finish. Send yourself the planner link from that screen. It keeps the connection and lands on Allow.
- **"Could not connect" after Allow.** The planner was signed in as someone who is not the owner. Sign out and use the owner's address.
- **ChatGPT has no Create button.** Developer mode is off, or the plan does not include it.
- **The assistant says it has no access any more.** Remove the connector and add it again. That runs a fresh sign in.

## For whoever runs it

- Code: `latam_trip_mcp/` (`server.py` is the app, `core.py` the tools, `oauth.py` the sign in).
- Deploy: `AWS_PROFILE=<profile> bash infra/mcp/deploy.sh`. Secrets go in first with `infra/mcp/put-secrets.sh`.
- Tests: `python -I -X utf8 -m unittest discover -s latam_trip_mcp -p "test_*.py"`. A test checks that every tool is named on this page.
- The planner's Allow screen is `planner/src/components/Connect.tsx`. Its address comes from `LATAMTRIP_APP_URL` in `infra/mcp/template.yaml`, and the connector's address from `VITE_CONNECTOR_URL` (it has a default).
