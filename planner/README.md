# LatAm trip planner

A small web app for planning the trip: pick a way in and a way home, build the journey between them, and compare totals. Vite + React + TypeScript, no backend.

## Run

```bash
cd planner
npm install
npm run sync-data   # optional, refreshes the offline copy in public/data
npm run dev         # http://localhost:5173
```

The Latam Trip shortcut on the Desktop runs `scripts/open.ps1`. It starts the dev server on http://localhost:5198 if it is not running and opens the app in the browser. The server keeps running in the background until the PC restarts, so later clicks open at once.

Other scripts:

| Script | What it does |
| --- | --- |
| `npm test` | Unit tests (date chaining and slack, totals with a shared ticket, mixing one-ways, shortest path, data checks) |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built `dist/` |

## Map tab

The Map tab is the route map from `../web`, imported through the `@map` alias in `vite.config.ts` and `tsconfig.json`. Its trips are the planner's journeys. Adding a leg on the map adds a place with 2 nights to the current journey, and "Show on map" in the journey builder opens the journey there. Every journey edited on the map is saved.

In dev the map reads `../data/web/*.json` from the repo. A build reads `data/web` from GitHub, with the offline copy as fallback.

## Data

At startup the app reads from the public repo on GitHub:

`https://raw.githubusercontent.com/Olafcito/latam-trip/main/`

- `data/inout.json` (ways in and home, tickets, ratings)
- `data/network/map.json` (places, roads, crawled flights)
- `data/bag_rules.json`, `data/quotes.csv`, `trip.json`

If GitHub can't be reached within 15 seconds it falls back to the copy in `public/data/`. The header shows which source is in use.

`npm run sync-data` downloads the files into `public/data/`. Point it at another repo or branch with env vars:

```bash
DATA_REPO=Olafcito/latam-trip DATA_BRANCH=main npm run sync-data
```

To read from somewhere else at runtime, set `VITE_DATA_BASE` when building, for example `VITE_DATA_BASE=./data/ npm run build` to always use the bundled copy.

## Deploy to GitHub Pages

The build uses `base: './'`, so `dist/` works from any sub-path.

1. `npm run sync-data && npm run build`
2. Publish `dist/` to Pages, for example with a workflow:

```yaml
# .github/workflows/planner.yml
name: planner
on: { push: { branches: [main] } }
permissions: { contents: read, pages: write, id-token: write }
jobs:
  build:
    runs-on: ubuntu-latest
    defaults: { run: { working-directory: planner } }
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: 22 }
      - run: npm ci
      - run: npm run sync-data
      - run: npm test
      - run: npm run build
      - uses: actions/upload-pages-artifact@v3
        with: { path: planner/dist }
  deploy:
    needs: build
    runs-on: ubuntu-latest
    environment: { name: github-pages }
    steps:
      - uses: actions/deploy-pages@v4
```

Then set Settings, Pages, Source to "GitHub Actions".

## Screens

1. **Pick in and out**: options from `inout.json` sorted by rating, filters saved in the browser, expand a row for both timelines and a small map. "Mix one-ways" combines oneways ways; ticket and Madrid ways keep their pair.
2. **Journey builder**: way in fixed at the top, way home at the bottom. Add places with nights, pick hops from `map.json` (crawled flights show "price seen for <date>"), or ask "route to exit" for the fastest or cheapest path. Dates, slack and warnings update live. Map (MapLibre with OpenFreeMap) and a calendar from 1 Dec to 5 Feb.
3. **Totals**: tickets (a shared ticket counted once), bag fees, hub nights, ground transport, flights, hours in the air and days per country. Save, export and import journeys as JSON, compare up to 3.

## Known limits

- A hop without a picked flight is assumed to leave at 08:00.
- The journey map needs OpenFreeMap; without it the map shows a plain background with the routes.
- Some flights in the data have no flight number; they show "?".
- Booking is out of scope.
