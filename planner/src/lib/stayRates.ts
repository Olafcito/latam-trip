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

interface Reply { lodging_id?: string; fetched?: boolean; rooms?: number; prices?: number; error?: string }

async function call(body: Record<string, unknown>): Promise<RatesResult> {
  if (!supabase) return { ok: false, message: 'Not connected.' }
  let data: Reply | null = null
  let error: unknown = null
  try {
    ;({ data, error } = await supabase.functions.invoke<Reply>('stay-rates', { body }))
  } catch (e) {
    error = e
  }
  if (error) {
    const ctx = (error as { context?: unknown }).context
    if (ctx instanceof Response) {
      try {
        const j = (await ctx.json()) as Reply
        if (j?.error) return { ok: false, message: j.error }
      } catch {
        // the body was not JSON, the generic message below says enough
      }
    }
    return { ok: false, message: 'Hostelworld could not be asked right now.' }
  }
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

/**
 * A place from a pasted Hostelworld link, at a place on the map, with its rooms and prices for the dates. A link
 * to a place that is stored already prices that one and gives its id back.
 */
export function addFromLink(url: string, placeId: string, checkIn: string, checkOut: string): Promise<RatesResult> {
  if (!hostelworldId(url)) return Promise.resolve({ ok: false, message: 'That is not a Hostelworld link to a place.' })
  return call({ url: url.trim(), place_id: placeId, check_in: checkIn, check_out: checkOut })
}

/** Forgets the calls made, for tests. */
export function resetRates(): void {
  recent.clear()
}
