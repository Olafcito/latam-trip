---
name: map-data
description: Find free Wikimedia Commons photos for map places in bulk from the built-in browser and add them to the place_images table with tripdb. Use when places on the route map lack a photo.
---

# Map data: place photos

- `scripts/commons_images.js`: run it in a tab on https://commons.wikimedia.org (same origin, so the API answers). `window.__img = null; findImages([{id:'ANT', q:'Antigua Guatemala'}, ...]).then(v => window.__img = v)`, then read `window.__img`. It returns one JSON line per place, `{"kind":"profile_image","id":..,"image":{url,page,credit,license,w,h}}`, landscape photos with a free licence and no people, or `image: null` when none fits.
- Save the lines to `data/raw/map-img-<n>.jsonl` and add them: `python -I -X utf8 plugin/scripts/tripdb.py --root . add-image data/raw/map-img-<n>.jsonl --origin map-img-<n>`. tripdb refuses a row with no image and skips a place that has a photo already (add `--replace` for a deliberate swap). The worker rebuilds the map after the write.
- Never sign in, upload or accept anything on Commons.

## Documentation

Follow `docs/README.md`. Read the docs that cover the work before starting, update them in the same commit as the change, and end the report with five lines: docs read, docs updated, decisions recorded, known gaps and open discrepancies. A change to what the map reads updates `data/README.md`.
