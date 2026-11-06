import type { PostgrestError } from '@supabase/supabase-js'
import type { SendOutcome } from './outbox'
import { parseTripsFile, type TripRow } from './repoTrips'
import { supabase } from './supabase'
import { tripRowErrors } from './tripRow'

// Trips through Supabase (spec 6.1 and 6.2). The planner reads trips_latest, saves through save_trip,
// deletes by setting deleted_at, and listens to Realtime on trips.

const CACHE_KEY = 'latam-planner.trips-latest'

export type SaveResult =
  | { status: 'saved'; id: string; version: number; skipped: boolean }
  /** it could not reach the database now. The caller keeps it in the outbox */
  | { status: 'queued'; reason: 'offline' | 'session' }
  /** the trip was deleted in another window, so the save was not made */
  | { status: 'deleted' }
  | { status: 'failed'; message: string }

type Failure = Pick<PostgrestError, 'message' | 'code'> & { status?: number }

/** What an error of a call means for a save. */
export function classify(e: Failure, online = typeof navigator === 'undefined' || navigator.onLine !== false): 'offline' | 'session' | 'deleted' | 'other' {
  if (/was deleted/i.test(e.message)) return 'deleted'
  if (e.status === 401 || e.status === 403 || e.code === '42501' || e.code === 'PGRST301' || e.code === 'PGRST303' || /jwt/i.test(e.message)) return 'session'
  if (!online || e.status === 0 || e.status === 502 || e.status === 503 || e.status === 504 || !e.code || /fetch|network|failed to load/i.test(e.message)) return 'offline'
  return 'other'
}

function cacheRows(rows: TripRow[]) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ trips: rows }))
  } catch {
    // storage blocked: the list is fetched again next time
  }
}

function cachedRows(): TripRow[] {
  try {
    return parseTripsFile(JSON.parse(localStorage.getItem(CACHE_KEY) ?? 'null'))
  } catch {
    return []
  }
}

/** The latest version of every trip that is not deleted. When the database cannot be reached, the last list read. */
export async function loadTrips(): Promise<TripRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('trips_latest').select('data').order('id')
  if (error) {
    const cached = cachedRows()
    if (cached.length) return cached
    throw new Error(error.message)
  }
  const rows = parseTripsFile({ trips: (data ?? []).map((r: { data: TripRow }) => r.data) })
  cacheRows(rows)
  return rows
}

/** The ids of trips deleted in some window, so a copy this browser still holds can go too. */
export async function loadDeletedIds(): Promise<string[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('trips').select('id').not('deleted_at', 'is', null)
  if (error) throw new Error(error.message)
  return [...new Set((data ?? []).map((r: { id: string }) => r.id))]
}

/** Every version of one trip, oldest first. */
export async function loadVersions(id: string): Promise<TripRow[]> {
  if (!supabase) return []
  const { data, error } = await supabase.from('trips').select('data').eq('id', id).order('version')
  if (error) throw new Error(error.message)
  return parseTripsFile({ trips: (data ?? []).map((r: { data: TripRow }) => r.data) })
}

/** One press of Save is one version. A row `tripdb check` would refuse is not sent. */
export async function saveTrip(row: TripRow): Promise<SaveResult> {
  const errs = tripRowErrors(row)
  if (errs.length) return { status: 'failed', message: `The trip cannot be stored: ${errs[0]}.` }
  if (!supabase) return { status: 'queued', reason: 'offline' }
  let res
  try {
    res = await supabase.rpc('save_trip', { trip: row })
  } catch {
    return { status: 'queued', reason: 'offline' }
  }
  if (!res.error) {
    const r = res.data as { id: string; version: number; skipped: boolean }
    return { status: 'saved', id: r.id, version: r.version, skipped: !!r.skipped }
  }
  const kind = classify({ message: res.error.message, code: res.error.code, status: res.status })
  if (kind === 'deleted') return { status: 'deleted' }
  if (kind === 'other') return { status: 'failed', message: res.error.message }
  return { status: 'queued', reason: kind }
}

/** The outbox sends through this. */
export async function sendQueued(row: TripRow): Promise<SendOutcome> {
  const r = await saveTrip(row)
  if (r.status === 'saved') return { status: 'saved' }
  if (r.status === 'queued') return { status: 'queued', reason: r.reason }
  if (r.status === 'deleted') return { status: 'deleted' }
  return { status: 'failed', message: r.message }
}

/** A delete is a soft delete on every version of the id, so the trip is gone from every window and can be restored. */
export async function deleteTrip(id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  if (!supabase) return { ok: false, message: 'Not connected.' }
  const { error } = await supabase.from('trips').update({ deleted_at: new Date().toISOString() }).eq('id', id).is('deleted_at', null)
  return error ? { ok: false, message: error.message } : { ok: true }
}

/** Calls cb on every change of trips. Returns the way to stop listening. Each call gets a channel of its own, since the client hands back a subscribed one of the same name. */
export function subscribeTrips(cb: () => void): () => void {
  if (!supabase) return () => {}
  const client = supabase
  const channel = client.channel(`trips-changes-${crypto.randomUUID()}`).on('postgres_changes', { event: '*', schema: 'public', table: 'trips' }, cb).subscribe()
  return () => {
    void client.removeChannel(channel)
  }
}

/** The project ref of the Supabase URL, which marks a browser as imported for this project only. */
export function projectRef(): string {
  try {
    return new URL((import.meta.env as Record<string, string | undefined>).VITE_SUPABASE_URL ?? '').hostname.split('.')[0]
  } catch {
    return ''
  }
}

/** The documents every person reads and only the admin writes. The others are a person's own, in user_documents. */
const SHARED_DOCS = ['cutover_done']

/** The table a document lives in. */
export function docTable(name: string): 'documents' | 'user_documents' {
  return SHARED_DOCS.includes(name) ? 'documents' : 'user_documents'
}

export async function readDoc(name: string): Promise<unknown> {
  if (!supabase) return null
  const { data, error } = await supabase.from(docTable(name)).select('data').eq('name', name).maybeSingle()
  if (error) throw new Error(error.message)
  return data ? (data as { data: unknown }).data : null
}

export async function writeDoc(name: string, data: unknown): Promise<void> {
  if (!supabase) return
  const table = docTable(name)
  const { error } = await supabase
    .from(table)
    .upsert({ name, data, updated_at: new Date().toISOString() }, { onConflict: table === 'documents' ? 'name' : 'owner_id,name' })
  if (error) throw new Error(error.message)
}

/** The journeys the browser import could not turn into rows. The planner lists them so they can be rebuilt by hand. */
export async function loadUnresolved(): Promise<{ id: string; name: string }[]> {
  try {
    const d = await readDoc('unresolved_journeys')
    return Array.isArray(d) ? (d as { id: string; name: string }[]).filter((j) => j && typeof j.id === 'string') : []
  } catch {
    return []
  }
}
