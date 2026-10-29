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
| `flight_prices` | `legs`: list of `{from, to, date, flex_days}` (IATA codes, ISO dates, `flex_days` 0 to 3 = also search that many days before and after); optional `name` for a self-built itinerary | One leg = one-way, two legs back to the start = return, otherwise open jaw or multi-city. A self-built itinerary (for example CPH > CUN, CUN > GDL, GDL > GUA, VVI > CPH) is searched three ways: the legs touching Europe as one combined ticket from and back to Copenhagen, each regional leg as a one-way, and the whole thing as one multi-city search when it has 6 legs or fewer. Momondo workers via `flight-crawl-orchestrator`; results go into `data/crawl.db` and show up on the map, the dashboard and the itinerary. |
| `stay_prices` | `place` (map id), `check_in`, `check_out`, `kinds` (`hostel`, `hotel`), `room` (`dorm`, `private`, `any`), optional `max_dkk_per_night` | `stay-price-worker` on Hostelworld and Booking.com; rows go into `data/network/stays.jsonl` and the place panel. |
| `experience_research` | `experience` (id) or `place` + `question`; optional `dates` | Web research; the experience row in `data/network/experiences.jsonl` gets price, season, Dec/Jan conditions, booking and sources, and `researched: true`. A new experience gets a new row. |
| `place_research` | `name`, `country`, optional `question` | `place-profiler` and `network-researcher`: a new map place with profile, things to do and connections. |
| `lists_update` | `list` (id), `add` and `remove`: lists of `{type: place or experience, id, note}` | Applied to `data/network/lists.json`. |
| `question` | `text` | Answered in an issue comment. |
| `refresh` | `scope`: `all`, `flights`, `stays` or `experiences`; optional `item` (a connection pair, place id, experience id or itinerary name); `older_than_days` (default 3) | Re-runs the searches behind everything in scope that was last checked more than `older_than_days` ago: the top whole trips and long-haul tickets, the regional pairs they use and any self-built itineraries for flights; the latest dates asked for stays; researched experiences. The app's update button sends this. |

## When a task is done

Claude comments the result on the issue (a short table with prices, local clock times and sources), closes it, appends a line to `data/network/task_log.jsonl` (`issue`, `type`, `done_at`, `summary`, `outputs`) and rebuilds `data/web/`. The app shows done tasks from the issues or from `data/web/task_log.json`.

## Last checked

`data/web/meta.json` has `built_at` and `last_checked` per data type (`flights`, `stays`, `experiences`, `places`, `tasks`), for the app's update button. Single prices carry their own `observed_at`.
