# Claude tasks: the checklist between the app and Claude

The app never runs searches itself. It writes a task, and Claude does the work with the plugin (Sonnet browser workers for prices, web research for experiences and places), then writes the results back into the data.

## Two ways to hand a task over

1. **Add to checklist.** The app opens a prefilled GitHub issue in `Olafcito/latam-trip` with the label `claude-task`. Simon presses Submit. Later he tells Claude "check the checklist", and Claude runs the `trip-checklist` skill, which works through every open `claude-task` issue.
2. **Ask Claude now.** The app builds the same task as a ready prompt (below) that Simon pastes into, or opens directly in, a Claude chat with the repo attached.

Prefilled issue link (URL-encode title and body):

    https://github.com/Olafcito/latam-trip/issues/new?labels=claude-task&title=<title>&body=<body>

Open tasks can be read without a token from the public REST API, so the app can show the checklist live:

    https://api.github.com/repos/Olafcito/latam-trip/issues?labels=claude-task&state=all&per_page=100

## Issue format

Title: `[<type>] <short summary>`, for example `[stay_prices] Utila 10 to 14 Dec, dorm`.

Body: one human line, then exactly one fenced `json` block with the task:

    Hostel prices in Utila for 10 to 14 Dec, dorm or private.

    ```json
    {"type": "stay_prices", "place": "UTIL", "check_in": "2026-12-10", "check_out": "2026-12-14", "kinds": ["hostel"], "room": "any"}
    ```

The "Ask Claude now" prompt is:

    In the repo Olafcito/latam-trip, run the trip-checklist skill on this task now and write the results back:
    ```json
    {...the task...}
    ```

## Task types

All tasks may also carry `"note"` (free text from Simon) and `"from"` (`"app"`).

| type | fields | what Claude does |
|---|---|---|
| `flight_prices` | `legs`: list of `{from, to, date, flex_days}` (IATA codes, ISO dates, `flex_days` 0 to 3 = also search that many days before and after); optional `name` for a self-built itinerary; optional `all_flights` (true) to keep every flight on all of those days | One leg = one-way, two legs back to the start = return, otherwise open jaw or multi-city. A self-built itinerary (for example CPH > CUN, CUN > GDL, GDL > GUA, VVI > CPH) is searched three ways: the legs touching Europe as one combined ticket from and back to Copenhagen, each regional leg as a one-way, and the whole thing as one multi-city search when it has 6 legs or fewer. With `all_flights`, which the app's flight sheet sends, every date is a full search and every flight is kept instead of the few that differ most, so the planner's day lists fill up (the All flights section of `agents/momondo-worker.md`). Momondo workers via `flight-crawl-orchestrator`; results go into `data/built/trip.db` and show up on the map, the dashboard and the itinerary. |
| `stay_prices` | `place` (map id), `check_in`, `check_out`, `kinds` (`hostel`, `hotel`), `room` (`dorm`, `private`, `any`), optional `max_dkk_per_night` | `stay-price-worker`: Booking.com through the Booking.com connector (`accommodations_search`, 1 adult, DKK, `user_country_code` dk, per night is the total divided by the nights, property id and URL kept) and Hostelworld in the browser; rows go into `data/sources/stays.jsonl` through `tripdb add-stays` and the place panel. |
| `experience_research` | `experience` (id) or `place` + `question`; optional `dates` | Web research; the experience row in `data/sources/experiences.jsonl` (written with `tripdb add-experience` or `update-experience`) gets price, season, Dec/Jan conditions, booking and sources, and `researched: true`. A new experience gets a new row. |
| `place_research` | `name`, `country`, optional `question` | `place-profiler` and `network-researcher`: a new map place with profile, things to do and connections. |
| `lists_update` | `list` (id), `add` and `remove`: lists of `{type: place or experience, id, note}` | Applied to `data/sources/lists.json` with `tripdb list-add` and `list-remove`. |
| `question` | `text` | Answered in an issue comment. |
| `refresh` | `scope`: `all`, `flights`, `stays` or `experiences`; optional `item` (a connection pair, place id, experience id or itinerary name); `older_than_days` (default 3) | Re-runs the searches behind everything in scope that was last checked more than `older_than_days` ago: the top whole trips and long-haul tickets, the regional pairs they use and any self-built itineraries for flights; the latest dates asked for stays; researched experiences. The app's update button sends this. |
| `import_quotes` | `rows`: price rows in the worker format with `source: "momondo-manual"`, `observed_at` in UTC and, for a saved trip, `trip_name`. Also `count`, `legs`, `page` (the Momondo address), `from: "userscript"` and optional `trip_name`. When `rows_on_clipboard` is set, `rows` is empty and Simon pasted the full block over the issue text, so use the json block that has the rows. | Writes the rows unchanged to `data/sources/inbox/manual-<UTC timestamp>.jsonl`, one JSON row per line, and runs `tripdb build`, which ingests the inbox. The prices show in the app as saved by you. |
| `fix_parser` | `parser_version`, `reason` (for example `3 of 14 rows have empty legs`), `action` (`save_prices` or `save_trip`), `view`, `page`, `legs`, `dialog_text`, `dialog_chars` and optional `dialog_cut` | Reproduces the failure by running `parseDlg` from `momondo_crawler.js` on `dialog_text`, fixes the parser and bumps `PARSER_VERSION`. Saves the text as a new fixture with an expected file, runs `node plugin/userscripts/build.js` and `node --test "plugin/userscripts/**/*.test.js"`, then pushes. Tampermonkey updates the script by itself. Reports the new parser version in the issue. |

## When a task is done

Claude comments the result on the issue (a short table with prices, local clock times and sources), closes it, logs it in `data/sources/task_log.jsonl` with `tripdb log-task` (`issue`, `type`, `done_at`, `summary`, `outputs`) and rebuilds `data/web/` with `tripdb build`. The app shows done tasks from the issues or from `data/web/task_log.json`.

## Last checked

`data/web/meta.json` has `built_at` and `last_checked` per data type (`flights`, `stays`, `experiences`, `places`, `tasks`), for the app's update button. Single prices carry their own `observed_at`.
