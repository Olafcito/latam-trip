import { parseTripsFile, type TripRow } from './repoTrips'
import { supabase } from './supabase'

// FEAT-007, a trip shared by a link. share_trip makes the link of a stored trip, stop_sharing ends it, and
// shared_trip(token) answers anyone holding a live link with the plan alone, with no sign in since 0040. The planner
// opens /?share=<token> read only, under an id of its own, so nothing the viewer does writes to the owner's trip or to
// the viewer's own.

/** The shape of a token share_trip makes: url safe base64 of 16 bytes, so 22 characters. */
export const SHARE_TOKEN = /^[A-Za-z0-9_-]{22,64}$/

/** The token a link carries, or null when it carries none or something that is not a token. */
export function shareParam(search: string): string | null {
  const raw = new URLSearchParams(search).get('share')?.trim()
  return raw && SHARE_TOKEN.test(raw) ? raw : null
}

/** The id a shared trip is opened under. It never meets an id of the viewer's own trips. */
export const sharedJourneyId = (token: string) => `shared-${token}`

/** The link a person sends: this page's own address with ?share=<token> and nothing else. */
export const shareUrl = (loc: { origin: string; pathname: string }, token: string) => `${loc.origin}${loc.pathname}?share=${token}`

/** The page address with ?share=<token> set and any trip or version taken away, or with share taken away. */
export function urlWithShare(href: string, token: string | null): string {
  const u = new URL(href)
  if (token) {
    u.searchParams.set('share', token)
    u.searchParams.delete('trip')
    u.searchParams.delete('v')
  } else u.searchParams.delete('share')
  return u.pathname + u.search + u.hash
}

/** What shared_trip answered as a trip row under the shared id, or null when it is not a trip. */
export function sharedRow(raw: unknown, token: string): TripRow | null {
  const [row] = parseTripsFile({ trips: [raw] })
  if (!row) return null
  return { ...row, id: sharedJourneyId(token), by: '', version: typeof row.version === 'number' ? row.version : 1, why: row.why ?? '' }
}

export type ShareResult = { ok: true; token: string } | { ok: false; message: string }

/** The live link of one of the viewer's stored trips, made when there is none. */
export async function shareTrip(id: string): Promise<ShareResult> {
  if (!supabase) return { ok: false, message: 'Sharing needs the trip database.' }
  const { data, error } = await supabase.rpc('share_trip', { trip_id: id })
  if (error) return { ok: false, message: error.message }
  return typeof data === 'string' && SHARE_TOKEN.test(data) ? { ok: true, token: data } : { ok: false, message: 'The link could not be made.' }
}

/** Ends the live link of one of the viewer's trips. */
export async function stopSharing(id: string): Promise<{ ok: boolean; message?: string }> {
  if (!supabase) return { ok: false, message: 'Sharing needs the trip database.' }
  const { error } = await supabase.rpc('stop_sharing', { trip_id: id })
  return error ? { ok: false, message: error.message } : { ok: true }
}

/** The token of the live link of one of the viewer's trips, or null when it is not shared. */
export async function liveShare(id: string): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('trip_shares').select('token').eq('trip_id', id).is('revoked_at', null).limit(1)
  if (error) throw new Error(error.message)
  return (data?.[0] as { token?: string } | undefined)?.token ?? null
}

/** The trip a live link of the viewer's own points at, or null. Row level security shows a person only their own links. */
export async function ownShare(token: string): Promise<string | null> {
  if (!supabase) return null
  const { data, error } = await supabase.from('trip_shares').select('trip_id').eq('token', token).is('revoked_at', null).limit(1)
  if (error) return null
  return (data?.[0] as { trip_id?: string } | undefined)?.trip_id ?? null
}

/** The shared trip, null when the link is dead, 'failed' when the database could not be asked. */
export async function loadShared(token: string): Promise<TripRow | null | 'failed'> {
  if (!supabase) return 'failed'
  const { data, error } = await supabase.rpc('shared_trip', { token })
  if (error) return 'failed'
  return data == null ? null : sharedRow(data, token)
}

export type Sent = 'shared' | 'copied' | 'cancelled' | 'failed'

/**
 * The link through the phone's own share sheet, or copied. The share sheet is for touch screens only: on a computer
 * the link goes to the clipboard, where it is pasted into whatever the person writes in.
 */
export async function sendLink(title: string, url: string): Promise<Sent> {
  const phone = typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(pointer: coarse)').matches
  if (phone && typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
    try {
      await navigator.share({ title, url })
      return 'shared'
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'cancelled'
      // a share sheet that would not open: the link is copied instead
    }
  }
  try {
    await navigator.clipboard.writeText(url)
    return 'copied'
  } catch {
    return 'failed'
  }
}
