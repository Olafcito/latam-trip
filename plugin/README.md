# flight-crawler

A Claude plugin that researches flights, stays, places and experiences for Simon's Latin America trip. Research rows and planned trips are stored in the shared Supabase project.

## Requirements

- Claude with a browser tool for flight research, or a cloud session linked to a computer with one.
- Python 3 and Node.
- The configured Supabase environment for `tripdb` commands.

## Run a crawl

Ask Claude to use `flight-crawl-orchestrator`. It expands a route tree into browser searches, dispatches the Momondo and Google Flights workers, checks their results and writes accepted rows using `tripdb`. The scheduled worker ingests inbox rows and builds the files read by the app. Nobody runs a local build for normal research.

`tripdb query TABLE` reads rows. `tripdb doc-get NAME` reads documents, and `tripdb file NAME` reads built app files. Use the matching `tripdb` command to save research and `tripdb status` to check the worker. See the Supabase data and table descriptions in `../data/README.md`.

## Contents

- `agents/`: browser worker instructions.
- `scripts/tripdb.py`: validated interface to the shared data store.
- `skills/flight-crawl-orchestrator/`: search expansion, review, ingest and scenario tools.
- `skills/momondo-search/`, `skills/gflights-search/`: page crawlers, URL builders and converters.

## Worker deployment

Changes to `tripdb.py` or the data pipeline reach the scheduled worker only through `bash infra/deploy.sh --enable-schedules`. The worker has daily build and backup schedules. Do not run live tests that call `test_reset()` against the cutover project.

## Safety

Workers search and read. They never book, pay, enter personal data, accept consent banners or create scheduled tasks.
