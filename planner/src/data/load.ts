import { dataBase } from '@map/data/remoteFiles'
import { observed } from '../lib/format'
import { getFile } from '../lib/remoteFiles'
import type { AppData, BagRule, InOut, MapData, Meta, TripParams } from './types'

// With VITE_DATA_BASE set the files come from the project's bucket through the cache (spec 6.3).
// Without it they come from the repo, and public/data (npm run sync-data) is the offline copy.
export const REMOTE_BASE = 'https://raw.githubusercontent.com/Olafcito/latam-trip/main/'
export const LOCAL_BASE = './data/'

async function getJson<T>(base: string, path: string, timeoutMs: number): Promise<T> {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(base + path, { cache: 'no-store', signal: ctrl.signal })
    if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`)
    return (await res.json()) as T
  } finally {
    clearTimeout(t)
  }
}

async function loadFrom(base: string, timeoutMs: number) {
  const [inout, map, bags, trip, meta] = await Promise.all([
    getJson<InOut>(base, 'data/web/inout.json', timeoutMs),
    getJson<MapData>(base, 'data/web/map.json', timeoutMs),
    getJson<BagRule[]>(base, 'data/web/bag_rules.json', timeoutMs).catch(() => [] as BagRule[]),
    getJson<TripParams>(base, 'data/web/trip.json', timeoutMs).catch(() => ({}) as TripParams),
    // when the data was last checked. Optional: without it the freshness corner shows ?
    getJson<Meta>(base, 'data/web/meta.json', timeoutMs).then(
      (m) => (m && typeof m.last_checked === 'object' && m.last_checked !== null ? m : null),
      () => null,
    ),
  ])
  return { inout, map, bags, trip, meta }
}

/** The same five files, from the cache of the bucket. A missing optional file gives its empty value. */
async function loadFromProject() {
  const [inout, map, bags, trip, meta] = await Promise.all([
    getFile<InOut>('inout.json'),
    getFile<MapData>('map.json'),
    getFile<BagRule[]>('bag_rules.json').catch(() => [] as BagRule[]),
    getFile<TripParams>('trip.json').catch(() => ({}) as TripParams),
    getFile<Meta>('meta.json').then(
      (m) => (m && typeof m.last_checked === 'object' && m.last_checked !== null ? m : null),
      () => null,
    ),
  ])
  return { inout, map, bags, trip, meta }
}

export async function loadData(): Promise<AppData> {
  if (dataBase()) return { ...(await loadFromProject()), source: 'project' }
  try {
    return { ...(await loadFrom(REMOTE_BASE, 15000)), source: 'github' }
  } catch (remoteErr) {
    try {
      return { ...(await loadFrom(LOCAL_BASE, 15000)), source: 'local' }
    } catch {
      throw remoteErr
    }
  }
}

/** The address of the quote sheet for one pair on one day, "BOG-VVI" and "2026-12-05". */
export function quoteLink(pair: string, date: string): string {
  return `?quote=${encodeURIComponent(pair)}@${encodeURIComponent(date)}`
}

/** Reads a quoteLink back, or null when the address holds none. */
export function readQuoteLink(search: string): { pair: string; date: string } | null {
  const v = new URLSearchParams(search).get('quote')
  const m = v ? /^([A-Z]{3}-[A-Z]{3})@(\d{4}-\d{2}-\d{2})$/.exec(v) : null
  return m ? { pair: m[1], date: m[2] } : null
}

/** The fact line of the header. With the project's files the built time is the one in meta.json. */
export function factLine(source: AppData['source'], inout: InOut, meta: Meta | null): string {
  if (source === 'project') return `Data from the project, built ${observed(meta?.built_at ?? inout.generated_at)}`
  return `Data from ${source === 'github' ? 'GitHub' : 'the offline copy'}, built ${observed(inout.generated_at)}`
}
