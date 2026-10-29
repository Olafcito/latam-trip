# data

Everything the trip knows, in four folders with one role each.

| Folder | Role | Who writes it | Committed |
|---|---|---|---|
| `data/sources/` | The truth. Plain text, one file per table. | Only `tripdb` (tables) or a person editing a document | yes |
| `data/built/` | Everything derived from the sources, with `trip.db` holding all tables in one SQLite file. | `tripdb build` | yes |
| `data/web/` | The files the two apps read. | `tripdb build` | yes |
| `data/raw/` | Scratch output of a worker before tripdb adds it. | Workers | no |

Run tripdb from the repo root:

    python -I -X utf8 plugin/scripts/tripdb.py --root . <command>

`--help` lists the commands. `tripdb build` takes in the inbox, runs `tripdb check` and stops on any error, then rebuilds `data/built/`, `data/web/` and the `.claude/` copies of `plugin/`. It takes a few seconds. Tests: `python -I -X utf8 -m unittest discover -s plugin/scripts -p "test_*.py"`.

## Why plain files and one writer

The sources stay as JSONL and JSON in git, not as a database file. A text row shows up in a diff and in a review, a merge of two branches that both added quotes is a clean merge, and appending one line is safe while several workers run at once. `trip.db` is rebuilt from them in seconds, so it is a cache for queries and never edited.

One writer means one place that checks every row. tripdb refuses a row that breaks its table's schema and prints the line and the reason. It never overwrites a stored row unless asked with `--replace`, it skips a row it holds already, and it takes `data/sources/.tripdb.lock` while it writes and appends in one write, so workers can call it at the same time.

## Provenance

- Quotes keep their origin in the file name: `data/sources/quotes/<agent>.jsonl` is everything that worker found, and `manual-<time>.jsonl` came from the Momondo userscript through the inbox. Every quote row also carries `agent`, `source`, `observed_at` and `task_id`.
- Places, connections, profiles and place images carry an `origin` field with the agent that researched them. `--origin NAME` sets it, and the input file name is the default.
- Experiences and edges keep their `sources` or `source` and `source_year` as given by the researcher.
- `agent_usage.csv` records what every crawl round cost.

## Tables (data/sources, JSONL)

Fields marked with `*` are required. Everything else may be null or missing.

| Table | File | Kinds and fields | Same row when | Written by |
|---|---|---|---|---|
| quotes | `quotes/<agent>.jsonl` | `agent*`, `task_id`, `source*`, `observed_at*`, `structure*` (one_way, return, open_jaw, multi_city), `legs_requested*` (from, to, date, return_date), `rank`, `price`, `currency`, `price_dkk*`, `tickets`, `self_transfer`, `fare_brand`, `cabin_bag`, `checked_bag`, `out*`, `home`, `mid` (each leg: dep, arr, hours, stops, via, layover_h, carriers, flights, overnight_layover), `us_transit`, `changeable`, `link`, `flags`, `notes`, `trip_name` | same source, legs requested, leg times, carriers and price. A newer `observed_at` is stored again | `tripdb add-quotes FILE` and `tripdb ingest-inbox` |
| places | `places.jsonl` | kind `node`: `id*`, `name*`, `country*`, `lat*`, `lon*`, `type*`, `iata`, `popularity*`, `why`, `source`, `origin` | same `id` | `tripdb add-place FILE` |
| connections | `connections.jsonl` | kind `edge`: `from*`, `to*`, `mode*` (flight, bus, boat, train, colectivo, shuttle, chicken_bus), `operator`, `duration_h`, `duration_range`, `price_dkk`, `price_range_local`, `frequency`, `overnight`, `border`, `both`, `source`, `source_year`, `notes`, `origin` | same ends, mode and operator | `tripdb add-connection FILE` |
| profiles | `profiles.jsonl` | kind `profile`: `id*`, `checked_at`, `image`, `tagline`, `summary`, `things_to_do`, `touristy`, `hostels`, `sources`, `origin`. Kind `profile_hostels`: `id*`, `hostels*`, `currency_shown`, `eur_dkk`, `origin` | same kind and `id` | `tripdb add-profile FILE [--replace]` |
| place_images | `place_images.jsonl` | kind `profile_image`: `id*`, `image*` (url, page, credit, license, w, h), `origin` | same `id` | `tripdb add-image FILE [--replace]` |
| experiences | `experiences.jsonl` | kind `experience`: `id*`, `name*`, `category*`, `tags`, `places*`, `area`, `country*`, `lat*`, `lon*`, `summary`, `season`, `dec_jan`, `price`, `price_dkk`, `duration`, `requirements`, `details`, `researched*`, `checked_at`, `sources` | same `id` | `tripdb add-experience FILE`, `tripdb update-experience ID` |
| experience_images | `experience_images.jsonl` | kind `experience_image`: `id*`, `image*` | same `id` | `tripdb add-experience-image FILE [--replace]` |
| stays | `stays.jsonl` | kind `stay_quote`: `place*`, `site*`, `name*`, `type`, `room*`, `dkk_per_night*`, `nights*`, `rating`, `reviews`, `check_in*`, `check_out*`, `url`, `observed_at`, `task_id`, `notes` | same place, site, name, room and dates | `tripdb add-stays FILE` (USD and EUR become DKK) |
| trips | `trips.jsonl` | `id*`, `version*`, `name*`, `saved_at*`, `by*` (plan-trip, migration, planner), `why*`, `rank`, `option_id`, `way_in*` and `way_home*` (from, to, depart, arrive, price_dkk, tickets, timeline, airports, observed_at), `tickets` (id, price_dkk, observed_at), `places*` (node, hop, why, nights, arrive, depart, stay. A hop has from, to, mode, operator, hours, price_dkk, observed_at, flight) | every save adds a version. A save with the same content as the latest version is skipped | `tripdb save-trip FILE [--by plan-trip\|migration\|planner]` |
| task_log | `task_log.jsonl` | `issue*`, `type`, `task`, `done_at*`, `summary`, `outputs` | every call adds a row | `tripdb log-task` (called by `tasks.py done`) |
| agent_usage | `agent_usage.csv` | round, agent, model, tool, searches, tokens, tool_uses, seconds, rows | every call adds a row | `tripdb log-usage` |

Where a table allows `--replace`, the later row wins in the build.

## Trips

A planned trip is a row of `trips.jsonl`. `tripdb save-trip FILE` takes one trip, a list of trips or JSONL. A trip without an `id` gets one made from its name. Each save of an existing id adds the next `version`, with `saved_at`, `by` and a `why` for the trip and for each stop. It prints the id and the version, and the planner opens the trip at `/?trip=<id>`. `tripdb check` makes sure the versions of a trip run 1, 2, 3 without a gap.

`tripdb build` writes `data/web/trips.json` with the latest version of every trip and a short history of the earlier ones. The planner lists those trips next to the trips kept in the browser. A trip edited in the planner is saved in the browser only and never written back to the table.

## Documents (data/sources, JSON)

These are single JSON files that a person edits by hand. tripdb has no writer for them, except `lists.json`. `tripdb check` makes sure each one parses and that `trip.json` and `bag_rules.json` exist, and `tripdb build` copies them into the `documents` table of `trip.db`.

| File | What it holds | Written by |
|---|---|---|
| `trip.json` | Travellers, home airports, dates, hour limit, scoring weights | by hand |
| `bag_rules.json` | Bag prices per carrier that the scoring adds to a fare | by hand |
| `bag_fees.json` | Researched bag fees per airline and fare, with notes | by hand |
| `known_prices.json` | Prices Simon saw outside the crawl, with where and when | by hand |
| `scenarios.json` | The named trip scenarios | by hand |
| `experience_categories.json` | Categories for experiences, their keywords and the place categories they match | by hand |
| `lists.json` | Saved lists of places and experiences | `tripdb list-add`, `tripdb list-remove` |
| `elevation.json` | Altitude cache per place | `tripdb build --fetch-elevation` |
| `image_queries.json` | Search terms for place images | by hand |

## Inbox

The Momondo userscript saves what Simon finds by hand as `data/sources/inbox/manual-<time>.jsonl`, one quote per line with `source: "momondo-manual"`. `tripdb ingest-inbox` (and every `tripdb build`) checks each line, drops a quote it holds already and keeps the newest `observed_at`, appends the rest to `data/sources/quotes/manual-<time>.jsonl` and moves the file to `inbox/processed/`. Lines it refuses go to `inbox/rejected/<file>` with the reason.

## Built (data/built)

| File | Made by |
|---|---|
| `trip.db` | `ingest.py` (quotes, with `ok`, `eff_cost` and the flattened legs), then tripdb loads every other table and the documents |
| `chains.json` | `chains.py`: self-built ways in and home |
| `routes.json` | `routes.py`: every region order for every main ticket and chain pair |
| `inout.json`, `inout.csv` | `inout.py`: city in by city out, rated |
| `itineraries.json` | `itineraries.py`: whole trips |
| `map.json`, `nodes.csv`, `edges.csv` | `build_map.py`: places, connections and profiles merged |

## Web (data/web)

| File | Made by |
|---|---|
| `places.json`, `connections.json`, `countries.json`, `flights.json`, `experiences.json`, `experience_categories.json`, `lists.json`, `task_log.json`, `meta.json` | `build_web_data.py` |
| `dash_trips.json`, `dash_journeys.json`, `dash_flights.json` | `dashboard_data.py` |
| `trips.json` | tripdb from `trips.jsonl`: the latest version of every trip, with its history |
| `inout.json`, `map.json` | copied from `data/built/` |
| `trip.json`, `bag_rules.json` | copied from `data/sources/` |
| `pair_dates.json` | `tripdb build` (`write_pair_dates`): every regional one-way quote by pair and departure date |

### pair_dates.json

Every known price for every regional flight pair, in both directions, grouped by the local departure date. The long-haul tickets are left out: any quote from or to a European airport, the home airports and the alt origins in `trip.json`. Quotes flagged `incomplete`, `ad_offer` or `over_30h` and quotes over the hour limit are left out too. The same quote seen more than once is one entry with its newest `observed_at`. Each date lists its quotes cheapest first. The keys are short to keep the file small:

    {"pairs": {"GUA-SAP": {"2026-12-21": [
      {"p": 1359, "d": "15:40", "a": "18:50", "h": 3.17, "c": ["Avianca"], "s": 1, "src": "momondo-manual", "at": "2026-10-29T13:13Z"}
    ]}}}

| Key | Meaning |
|---|---|
| `p` | price in kr |
| `d`, `a` | local departure and arrival clock times |
| `n` | how many days later it lands, only when it lands on a later day |
| `h` | hours door to door |
| `c` | airlines |
| `s` | stops |
| `src` | where the price came from: `momondo`, `google_flights`, `expedia`, `kiwi`, `airline:AV`, or `momondo-manual` for a price Simon saved with the Momondo userscript |
| `at` | when it was last seen, UTC |

The planner reads `data/web/` from GitHub raw on `main` first, then from `planner/public/data/`, which `npm run sync-data` fills.

## Learnings

What each crawl round taught about the sites lives in `docs/learnings/`. Those files are notes for people and agents, not data, and nothing reads them.
