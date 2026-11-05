import type { Lodging } from '../data/types'
import { supabase } from './supabase'

// Live rates from Hostelworld (FEAT-002). Opening a place that has a Hostelworld link asks the stay-rates
// function (supabase/functions/stay-rates) for its rooms and prices for the dates. The function writes what it
// finds to lodging_rooms and lodging_prices, and the realtime subscription reloads the store, so the pane shows
// the stored price first and the live one a moment later. Nothing here holds a price: the store does.

/** What a call gives back: the lodging priced, whether the site was asked this time, and how many rows came. */
export type RatesResult =
  | { ok: true; lodging_id: string; fetched: boolean; rooms: number; prices: number }
  | { ok: false; message: string }

/** A call for the same place and dates within this many minutes is not sent again. The function skips it too. */
export const FRESH_MINUTES = 10

/** The property id in a Hostelworld link, the first run of 4 to 8 digits in its path. null for any other link. */
export function hostelworldId(url: string): string | null {
  let u: URL
  try {
    u = new URL(url.trim())
  } catch {
    return null
  }
  if (!/(^|\.)hostelworld\.com$/i.test(u.hostname)) return null
  const m = /\/(\d{4,8})(?=[/?#]|$)/.exec(u.pathname)
  return m ? m[1] : null
}

/** The Hostelworld link of a place, the one the live rates come from. null when it has none. */
export function liveLink(l: Pick<Lodging, 'links'>): string | null {
  return l.links.find((x) => x.site === 'hostelworld' && hostelworldId(x.url))?.url ?? null
}

interface Reply { lodging_id?: string; fetched?: boolean; rooms?: number; prices?: number; error?: string; retry_after?: number }

/** What a busy Hostelworld means for the caller, with the wait the function gave. */
export function busyMessage(retryAfter: number | undefined): string {
  const n = Math.max(1, Math.ceil(retryAfter ?? 60))
  const wait = n === 1 ? 'a second' : n < 60 ? `${n} seconds` : n < 120 ? 'a minute' : `${Math.ceil(n / 60)} minutes`
  return `Hostelworld is busy, try again in ${wait}.`
}

/** One call of the function: its reply, or the short message of why there is none. */
async function ask<T extends { error?: string }>(body: Record<string, unknown>): Promise<{ data: T | null } | { message: string }> {
  if (!supabase) return { message: 'Not connected.' }
  let data: T | null = null
  let error: unknown = null
  try {
    ;({ data, error } = await supabase.functions.invoke<T>('stay-rates', { body }))
  } catch (e) {
    error = e
  }
  if (!error) return { data }
  const ctx = (error as { context?: unknown }).context
  if (ctx instanceof Response) {
    let j: (T & { retry_after?: number }) | null = null
    try {
      j = (await ctx.json()) as T & { retry_after?: number }
    } catch {
      // the body was not JSON, the generic message below says enough
    }
    if (ctx.status === 429) return { message: busyMessage(j?.retry_after) }
    if (j?.error) return { message: j.error }
  }
  return { message: 'Hostelworld could not be asked right now.' }
}

async function call(body: Record<string, unknown>): Promise<RatesResult> {
  const r = await ask<Reply>(body)
  if ('message' in r) return { ok: false, message: r.message }
  const data = r.data
  if (!data?.lodging_id) return { ok: false, message: data?.error || 'Hostelworld gave no answer.' }
  return { ok: true, lodging_id: data.lodging_id, fetched: !!data.fetched, rooms: data.rooms ?? 0, prices: data.prices ?? 0 }
}

const recent = new Map<string, { at: number; done: Promise<RatesResult> }>()

/**
 * The live rooms and prices of a stored place for the dates. One call per place and dates per FRESH_MINUTES in
 * this session: a second call meanwhile shares the first's answer. The store gets the rows through realtime.
 */
export function fetchRates(lodgingId: string, checkIn: string, checkOut: string, now = Date.now()): Promise<RatesResult> {
  const key = `${lodgingId}|${checkIn}|${checkOut}`
  const had = recent.get(key)
  if (had && now - had.at < FRESH_MINUTES * 60000) return had.done
  const done = call({ lodging_id: lodgingId, check_in: checkIn, check_out: checkOut }).then((r) => {
    if (!r.ok) recent.delete(key)
    return r
  })
  recent.set(key, { at: now, done })
  return done
}

/** Notes that a place was priced for the dates just now, so the next fetchRates within FRESH_MINUTES makes no call. */
export function remember(lodgingId: string, checkIn: string, checkOut: string, result: RatesResult, now = Date.now()): void {
  if (result.ok) recent.set(`${lodgingId}|${checkIn}|${checkOut}`, { at: now, done: Promise.resolve(result) })
}

/**
 * A place from a pasted Hostelworld link, at a place on the map, with its rooms and prices for the dates. A link
 * to a place that is stored already prices that one and gives its id back.
 */
export function addFromLink(url: string, placeId: string, checkIn: string, checkOut: string): Promise<RatesResult> {
  if (!hostelworldId(url)) return Promise.resolve({ ok: false, message: 'That is not a Hostelworld link to a place.' })
  return call({ url: url.trim(), place_id: placeId, check_in: checkIn, check_out: checkOut })
}

/** What a search of the city of a stop gives back: the places at the stop it found, how many were new and priced. */
export type SearchResult =
  | { ok: true; place_id: string; city: string; lodging_ids: string[]; priced_ids: string[]; created: number; priced: number; rooms: number; prices: number }
  | { ok: false; message: string }

interface SearchReply {
  place_id?: string; city_id?: number | string; city?: string; lodging_ids?: string[]; priced_ids?: string[]
  created?: number; priced?: number; rooms?: number; prices?: number; error?: string
}

/** The most popular Hostelworld places of the city of a map place, stored at it with their rooms and prices for the dates (FEAT-003). */
export async function searchCity(placeId: string, checkIn: string, checkOut: string, top = 3): Promise<SearchResult> {
  const r = await ask<SearchReply>({ search: true, place_id: placeId, check_in: checkIn, check_out: checkOut, top })
  if ('message' in r) return { ok: false, message: r.message }
  const d = r.data
  if (!d || !Array.isArray(d.lodging_ids)) return { ok: false, message: d?.error || 'Hostelworld gave no answer.' }
  return {
    ok: true, place_id: d.place_id ?? placeId, city: d.city ?? '', lodging_ids: d.lodging_ids, priced_ids: Array.isArray(d.priced_ids) ? d.priced_ids : [],
    created: d.created ?? 0, priced: d.priced ?? 0, rooms: d.rooms ?? 0, prices: d.prices ?? 0,
  }
}

/** Forgets the calls made, for tests. */
export function resetRates(): void {
  recent.clear()
}
