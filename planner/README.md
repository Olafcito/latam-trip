# LatAm trip planner

A responsive trip planner backed by Supabase. Sign in to save a trip to the shared project and see it on your other devices.

## Run locally

Set `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` and `VITE_DATA_BASE` in the environment, then:

```bash
npm ci
npm run dev
```

The Vite server uses the same Supabase project as production. It does not serve repository data files. Never put the secret key in a browser environment or commit credentials.

## Checks

| Command | Purpose |
| --- | --- |
| `npm test` | Unit and component tests |
| `npm run typecheck` | TypeScript check |
| `npm run build` | Production build into `dist/` |
| `npm run preview` | Serve the built `dist/` |

## Data flow

The Map tab reads built files from the Supabase `web` storage bucket through a content-hash cache. Trips are read and written live in the `trips` table. Realtime updates refresh another open tab or device. Offline saves are queued in the browser and retried when the connection returns.

The worker rebuilds cached map and price files after data changes. Its schedules also create daily backups. Inspect it with `tripdb status` and deploy changes to `tripdb.py` or the pipeline only through `bash infra/deploy.sh --enable-schedules`.

## Deploy

`.github/workflows/site.yml` builds the planner on changes to `main` and uploads it to the site bucket. GitHub repository variables `VITE_SUPABASE_URL`, `VITE_SUPABASE_KEY` and `VITE_DATA_BASE` must be configured for the build. The bucket root is the production site and `/preview/` is a separate preview copy.

The app uses `base: './'` so it works at the root and at `/preview/`. The main site upload invalidates only `/index.html`; the preview upload is separate.
