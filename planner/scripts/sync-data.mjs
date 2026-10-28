// Downloads the crawler data from GitHub into public/data so the app also works offline.
// Usage: npm run sync-data   (optional: DATA_REPO=owner/repo DATA_BRANCH=main)
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repo = process.env.DATA_REPO ?? 'Olafcito/latam-trip'
const branch = process.env.DATA_BRANCH ?? 'main'
const base = `https://raw.githubusercontent.com/${repo}/${branch}/`
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data')

export const FILES = [
  'data/inout.json',
  'data/network/map.json',
  'data/quotes.csv',
  'data/bag_rules.json',
  'trip.json',
  // the Map tab's route map
  'data/web/places.json',
  'data/web/connections.json',
  'data/web/countries.json',
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
