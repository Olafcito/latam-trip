import { dataBase } from '@map/data/remoteFiles'
import { observed } from '../lib/format'
import { getFile } from '../lib/remoteFiles'
import type { AppData, BagRule, InOut, MapData, Meta, TripParams } from './types'

/** Reads the built data from Supabase's public bucket through the hash-aware cache. */
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
  if (!dataBase()) throw new Error('Supabase data is not configured. Set VITE_DATA_BASE before starting the app.')
  return { ...(await loadFromProject()), source: 'project' }
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
export function factLine(_source: AppData['source'], inout: InOut, meta: Meta | null): string {
  return `Data from the project, built ${observed(meta?.built_at ?? inout.generated_at)}`
}
