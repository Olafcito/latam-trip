// Downloads what the apps read (data/web, written by tripdb build) from GitHub into public/data so the app also works offline.
// Usage: npm run sync-data   (optional: DATA_REPO=owner/repo DATA_BRANCH=main)
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = process.env.DATA_REPO ?? 'Olafcito/latam-trip'
const branch = process.env.DATA_BRANCH ?? 'main'
const base = `https://raw.githubusercontent.com/${repo}/${branch}/`
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data')

export const FILES = [
  'data/web/inout.json',
  'data/web/map.json',
  'data/web/bag_rules.json',
  'data/web/trip.json',
  // when each kind of data was last checked (the freshness corner)
  'data/web/meta.json',
  // the Map tab's route map
  'data/web/places.json',
  'data/web/connections.json',
  'data/web/countries.json',
  'data/web/flights.json',
  // the ranked trips to start from
  'data/web/saved_trips.json',
  // every regional price by pair and day, for the fly-on leg picked in the trip hero
  'data/web/pair_dates.json',
]

let failed = 0
for (const file of FILES) {
  const target = resolve(root, file)
  try {
    const res = await fetch(base + file, { cache: 'no-store' })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const body = Buffer.from(await res.arrayBuffer())
    await mkdir(dirname(target), { recursive: true })
    await writeFile(target, body)
    console.log(`ok   ${file}  ${(body.length / 1024).toFixed(0)} KB`)
  } catch (err) {
    failed++
    console.error(`fail ${file}  ${err instanceof Error ? err.message : err}`)
  }
}
await writeFile(resolve(root, 'synced_at.txt'), new Date().toISOString() + '\n')
if (failed) process.exitCode = 1
