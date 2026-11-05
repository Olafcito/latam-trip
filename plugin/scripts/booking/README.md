# Booking.com page reader

Reads one lodging's Booking.com page in a headless browser and writes its photos, rooms and the cheapest rate of each room to a JSON file. Read only. It never clicks, signs in or books.

## Setup

    cd plugin/scripts/booking
    npm install
    npx playwright-core install chromium-headless-shell

The second command is only needed when no `chromium_headless_shell-*` folder exists under `%LOCALAPPDATA%\ms-playwright` (`~/.cache/ms-playwright` on Linux).

## Usage

    node plugin/scripts/booking/read.mjs LODGING_ID [--check-in YYYY-MM-DD --check-out YYYY-MM-DD] --out FILE

- `SUPABASE_URL` and `SUPABASE_SECRET_KEY` come from the environment, else the first `.env` found walking up from the current directory, else the main checkout's `.env`.
- Dates come from the arguments, else the latest `lodging_prices` row of the lodging, else none. Without dates the rooms are listed with empty `prices`.
- FILE gets `{ "lodging_id", "photos", "rooms" }`. The command prints counts only.
- It exits non zero with a short reason when the page shows a bot check or has no room table.

## Parsing

`parse.mjs` holds pure functions from page HTML to `{ photos, rooms }` and needs no browser. `npm test` runs them against the trimmed pages in `fixtures/`.
