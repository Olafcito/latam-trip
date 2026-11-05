// stay-rates: the live rooms and prices of a place to stay from Hostelworld (FEAT-002, TECH-003). The planner calls
// it when a place with a Hostelworld link is opened, and the worker calls it each morning for the dates that have a
// price already. It reads Hostelworld's own JSON, writes the rooms to lodging_rooms and one price per room to
// lodging_prices, and the planner gets the rows through realtime. A pasted link adds the place first.
// Owner only, or the worker with the worker key. Nothing of the content is logged.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HW = 'https://prod.apigee.hostelworld.com/legacy-hwapi-service/2.2/properties'
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const FRESH_MINUTES = 10
const MAX_NIGHTS = 30
const MAX_PHOTOS = 8
const SUMMARY_CHARS = 600
const FETCH_MS = 15_000

interface Body { lodging_id?: string; url?: string; place_id?: string; check_in?: string; check_out?: string; fresh_minutes?: number }
interface Money { value?: string | number; currency?: string }
interface Priced { ratePlan?: number; price?: Money }
interface HwRoom {
  id?: number | string; name?: string; capacity?: string | number; ensuite?: string; basicType?: string
  totalBedsAvailable?: number | null; totalRoomsAvailable?: number | null
  lowestPricePerNight?: Money; totalPrice?: Priced[]; ratePlans?: { id?: number; isDefault?: boolean }[]
  images?: { prefix?: string; suffix?: string }[]
}
interface HwAvailability {
  freeCancellationAvailable?: boolean; freeCancellationAvailableUntil?: string
  rooms?: { dorms?: HwRoom[]; privates?: HwRoom[] }
}
interface HwProperty {
  id?: string; name?: string; type?: string; address1?: string; address2?: string
  city?: { name?: string; country?: string }; latitude?: string; longitude?: string
  rating?: { overall?: number }; totalRatings?: string; description?: string
  images?: { prefix?: string; suffix?: string }[]; facilities?: { name?: string; facilities?: { name?: string }[] }[]
}
interface Room { id: string; name: string; site_id: string | null }

const reply = (status: number, body: unknown): Response =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } })
const fail = (status: number, error: string): Response => reply(status, { error })
const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

class Refused extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

/** The property id in a Hostelworld link, the first run of 4 to 8 digits in its path. The planner parses it the same way. */
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

const DAY = /^\d{4}-\d{2}-\d{2}$/
const nightsOf = (a: string, b: string): number => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000)
const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN
  return Number.isFinite(n) ? n : null
}
const image = (i: { prefix?: string; suffix?: string } | undefined): string | null =>
  i?.prefix ? `https://${i.prefix}${i.suffix ?? ''}` : null
const sameName = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()

async function hostelworld<T>(path: string): Promise<T> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), FETCH_MS)
  let res: Response
  try {
    res = await fetch(`${HW}/${path}`, { headers: { 'User-Agent': UA, Accept: 'application/json' }, signal: ctl.signal })
  } catch {
    throw new Refused(502, 'Hostelworld could not be reached.')
  } finally {
    clearTimeout(timer)
  }
  if (res.status === 404) throw new Refused(404, 'Hostelworld knows no place with that id.')
  if (!res.ok) throw new Refused(502, 'Hostelworld did not answer.')
  try {
    return (await res.json()) as T
  } catch {
    throw new Refused(502, 'Hostelworld gave an unreadable answer.')
  }
}

const KINDS: Record<string, string> = { HOSTEL: 'hostel', HOTEL: 'hotel', GUESTHOUSE: 'guesthouse', APARTMENT: 'apartment' }
const TAGS: [RegExp, string][] = [[/kitchen/i, 'kitchen'], [/breakfast/i, 'breakfast'], [/air ?con/i, 'aircon'], [/pool/i, 'pool']]

/** The lodging row of a Hostelworld property, as the planner's Add place would fill it in. */
function lodgingOf(p: HwProperty, url: string, placeId: string): Record<string, unknown> {
  const names = (p.facilities ?? []).flatMap((g) => (g.facilities ?? []).map((f) => f.name ?? ''))
  const tags = TAGS.filter(([re]) => names.some((n) => re.test(n))).map(([, t]) => t)
  const address = [p.address1, p.city?.name].filter((s) => s && s.trim()).join(', ')
  const overall = num(p.rating?.overall)
  const summary = (p.description ?? '').replace(/\s+/g, ' ').trim()
  return {
    place_id: placeId,
    name: (p.name ?? '').trim() || `Hostelworld ${p.id}`,
    kind: KINDS[(p.type ?? '').toUpperCase()] ?? 'other',
    photos: (p.images ?? []).slice(0, MAX_PHOTOS).map(image).filter(Boolean).map((u) => ({ url: u, caption: null })),
    rating: overall === null ? null : Math.round(overall) / 10,
    reviews: num(p.totalRatings),
    rating_source: 'Hostelworld',
    address: address || null,
    lat: num(p.latitude),
    lon: num(p.longitude),
    tags,
    summary: summary ? summary.slice(0, SUMMARY_CHARS) : null,
    links: [{ site: 'hostelworld', url }],
    added_by: 'simon',
  }
}

async function isOwner(req: Request): Promise<boolean> {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_ANON_KEY')
  const auth = req.headers.get('Authorization')
  if (!url || !key || !auth) return false
  const client = createClient(url, key, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } })
  const { data, error } = await client.rpc('is_owner')
  return !error && data === true
}

/** The worker calls with the project's secret key as the bearer, the same key the function knows as its worker key. */
function isWorker(req: Request): boolean {
  const want = Deno.env.get('STAY_RATES_WORKER_KEY')
  const got = req.headers.get('Authorization')?.replace(/^Bearer\s+/i, '').trim()
  return !!want && !!got && got === want
}

function service(): SupabaseClient {
  const url = Deno.env.get('SUPABASE_URL')
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!url || !key) throw new Refused(500, 'The function has no database key.')
  return createClient(url, key, { auth: { persistSession: false } })
}

/** The stored lodging with this Hostelworld property id, by its links, else null. */
async function findByProperty(db: SupabaseClient, propertyId: string): Promise<{ id: string; place_id: string | null; hidden: boolean } | null> {
  const { data, error } = await db.from('lodgings').select('id, links, place_id, hidden').filter('links', 'cs', JSON.stringify([{ site: 'hostelworld' }]))
  if (error) throw new Refused(500, 'The places could not be read.')
  for (const row of data ?? []) {
    const links = Array.isArray(row.links) ? (row.links as { site?: string; url?: string }[]) : []
    if (links.some((l) => l.site === 'hostelworld' && typeof l.url === 'string' && hostelworldId(l.url) === propertyId)) return { id: row.id, place_id: row.place_id ?? null, hidden: row.hidden === true }
  }
  return null
}

interface Target { lodgingId: string; propertyId: string; link: string; created: boolean }

/** The place's own Hostelworld link with the dates on it, the link a price row keeps. */
function datedLink(link: string, checkIn: string, checkOut: string): string {
  try {
    const u = new URL(link.trim())
    u.searchParams.set('from', checkIn)
    u.searchParams.set('to', checkOut)
    u.searchParams.set('guests', '1')
    return u.toString()
  } catch {
    return link
  }
}

async function target(db: SupabaseClient, body: Body): Promise<Target> {
  if (typeof body.url === 'string') {
    const propertyId = hostelworldId(body.url)
    if (!propertyId) throw new Refused(400, 'That is not a Hostelworld link to a place.')
    const had = await findByProperty(db, propertyId)
    if (had) {
      const wanted = typeof body.place_id === 'string' ? body.place_id.trim() : ''
      if (wanted && had.place_id !== wanted) throw new Refused(409, 'That place is already at another stop.')
      if (had.hidden) {
        const { error } = await db.from('lodgings').update({ hidden: false }).eq('id', had.id)
        if (error) throw new Refused(500, 'The place could not be shown again.')
      }
      return { lodgingId: had.id, propertyId, link: body.url.trim(), created: false }
    }
    if (typeof body.place_id !== 'string' || !body.place_id.trim()) throw new Refused(400, 'Say which place on the map the link belongs to.')
    const prop = await hostelworld<HwProperty>(`${propertyId}/`)
    const { data, error } = await db.from('lodgings').insert(lodgingOf(prop, body.url.trim(), body.place_id.trim())).select('id').single()
    if (error || !data) throw new Refused(500, 'The place could not be saved.')
    return { lodgingId: data.id, propertyId, link: body.url.trim(), created: true }
  }
  if (typeof body.lodging_id !== 'string' || !body.lodging_id.trim()) throw new Refused(400, 'Say which place to price.')
  const { data, error } = await db.from('lodgings').select('id, links').eq('id', body.lodging_id).maybeSingle()
  if (error) throw new Refused(500, 'The place could not be read.')
  if (!data) throw new Refused(404, 'There is no such place.')
  const links = Array.isArray(data.links) ? (data.links as { site?: string; url?: string }[]) : []
  const link = links.find((l) => l.site === 'hostelworld' && typeof l.url === 'string' && hostelworldId(l.url))
  if (!link) throw new Refused(400, 'The place has no Hostelworld link.')
  return { lodgingId: data.id, propertyId: hostelworldId(link.url as string) as string, link: link.url as string, created: false }
}

/** True when a Hostelworld price for these dates was written for the place within the fresh window. */
async function isFresh(db: SupabaseClient, lodgingId: string, checkIn: string, checkOut: string, minutes: number): Promise<boolean> {
  if (minutes <= 0) return false
  const since = new Date(Date.now() - minutes * 60_000).toISOString()
  const { data, error } = await db
    .from('lodging_prices')
    .select('id, lodging_rooms!inner(lodging_id)')
    .eq('lodging_rooms.lodging_id', lodgingId)
    .eq('site', 'hostelworld')
    .eq('check_in', checkIn)
    .eq('check_out', checkOut)
    .gte('observed_at', since)
    .limit(1)
  if (error) throw new Refused(500, 'The prices could not be read.')
  return (data ?? []).length > 0
}

const defaultTotal = (r: HwRoom): number | null => {
  const plan = r.ratePlans?.find((p) => p.isDefault)?.id
  const row = (r.totalPrice ?? []).find((t) => plan === undefined || t.ratePlan === plan) ?? r.totalPrice?.[0]
  return num(row?.price?.value)
}

async function price(db: SupabaseClient, t: Target, checkIn: string, checkOut: string, nights: number): Promise<{ rooms: number; prices: number }> {
  const avail = await hostelworld<HwAvailability>(`${t.propertyId}/availability/?date-start=${checkIn}&num-nights=${nights}&guests=1&currency=DKK`)
  const seen: (HwRoom & { dorm: boolean })[] = [
    ...(avail.rooms?.dorms ?? []).map((r) => ({ ...r, dorm: true })),
    ...(avail.rooms?.privates ?? []).map((r) => ({ ...r, dorm: false })),
  ].filter((r) => r.id !== undefined && typeof r.name === 'string' && r.name.trim())

  const { data: stored, error } = await db.from('lodging_rooms').select('id, name, site_id').eq('lodging_id', t.lodgingId)
  if (error) throw new Refused(500, 'The rooms could not be read.')
  const rooms = (stored ?? []) as Room[]
  const byId = new Map(rooms.filter((r) => r.site_id).map((r) => [r.site_id as string, r]))
  const byName = new Map(rooms.filter((r) => !r.site_id).map((r) => [sameName(r.name), r]))

  const fresh: Record<string, unknown>[] = []
  const matched = new Map<string, Room>()
  for (const r of seen) {
    const siteId = String(r.id)
    const nameKey = sameName(r.name as string)
    const had = byId.get(siteId) ?? byName.get(nameKey)
    if (had) {
      if (!had.site_id) {
        byName.delete(nameKey)
        const photo = image(r.images?.[0])
        const { error: e } = await db.from('lodging_rooms').update({ site: 'hostelworld', site_id: siteId, ...(photo ? { photo } : {}) }).eq('id', had.id)
        if (e) throw new Refused(500, 'A room could not be updated.')
        had.site_id = siteId
      }
      matched.set(siteId, had)
      continue
    }
    fresh.push({
      lodging_id: t.lodgingId,
      name: (r.name as string).trim(),
      beds: num(r.capacity),
      private: !r.dorm,
      bathroom: r.ensuite === '1' ? 'private' : 'shared',
      site: 'hostelworld',
      site_id: siteId,
      photo: image(r.images?.[0]),
    })
  }
  if (fresh.length) {
    // A unique index on (lodging_id, site, site_id) lets two overlapping first calls meet here without doubling the rooms.
    const { error: e } = await db.from('lodging_rooms').upsert(fresh, { onConflict: 'lodging_id,site,site_id', ignoreDuplicates: true })
    if (e) throw new Refused(500, 'The rooms could not be saved.')
    const { data, error: e2 } = await db
      .from('lodging_rooms')
      .select('id, name, site_id')
      .eq('lodging_id', t.lodgingId)
      .eq('site', 'hostelworld')
      .in('site_id', fresh.map((f) => f.site_id as string))
    if (e2 || !data) throw new Refused(500, 'The rooms could not be saved.')
    for (const r of data as Room[]) if (r.site_id) matched.set(r.site_id, r)
  }

  const now = new Date().toISOString()
  const cancelUntil = avail.freeCancellationAvailable && typeof avail.freeCancellationAvailableUntil === 'string'
    ? avail.freeCancellationAvailableUntil.slice(0, 10)
    : null
  const url = datedLink(t.link, checkIn, checkOut)
  const prices: Record<string, unknown>[] = []
  for (const r of seen) {
    const room = matched.get(String(r.id))
    const perNight = num(r.lowestPricePerNight?.value)
    const total = defaultTotal(r)
    if (!room || (perNight === null && total === null)) continue
    const left = r.dorm ? r.totalBedsAvailable : r.totalRoomsAvailable
    prices.push({
      room_id: room.id,
      check_in: checkIn,
      check_out: checkOut,
      total_dkk: total,
      per_night_dkk: perNight,
      site: 'hostelworld',
      url,
      refundable: avail.freeCancellationAvailable ? 'yes' : 'no',
      cancel_until: cancelUntil,
      available: typeof left === 'number' && left >= 0 ? left : null,
      observed_at: now,
    })
  }
  if (prices.length) {
    const { error: e } = await db.from('lodging_prices').insert(prices)
    if (e) throw new Refused(500, 'The prices could not be saved.')
  }
  return { rooms: seen.length, prices: prices.length }
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail(405, 'Use POST.')
  if (!isWorker(req) && !(await isOwner(req))) return fail(403, 'Only the owner can ask for live rates.')

  let parsed: unknown
  try {
    parsed = await req.json()
  } catch {
    return fail(400, 'The request was not valid JSON.')
  }
  if (!isObject(parsed)) return fail(400, 'The request was not valid JSON.')
  const body = parsed as Body
  const checkIn = typeof body.check_in === 'string' ? body.check_in : ''
  const checkOut = typeof body.check_out === 'string' ? body.check_out : ''
  if (!DAY.test(checkIn) || !DAY.test(checkOut)) return fail(400, 'Give check_in and check_out as YYYY-MM-DD.')
  const nights = nightsOf(checkIn, checkOut)
  if (!Number.isFinite(nights) || nights < 1) return fail(400, 'check_out must be after check_in.')
  if (nights > MAX_NIGHTS) return fail(400, `At most ${MAX_NIGHTS} nights at a time.`)
  const freshMinutes = typeof body.fresh_minutes === 'number' && body.fresh_minutes >= 0 ? body.fresh_minutes : FRESH_MINUTES

  try {
    const db = service()
    const t = await target(db, body)
    if (!t.created && (await isFresh(db, t.lodgingId, checkIn, checkOut, freshMinutes))) {
      return reply(200, { lodging_id: t.lodgingId, created: false, fetched: false, rooms: 0, prices: 0 })
    }
    const counts = await price(db, t, checkIn, checkOut, nights)
    return reply(200, { lodging_id: t.lodgingId, created: t.created, fetched: true, ...counts })
  } catch (e) {
    if (e instanceof Refused) return fail(e.status, e.message)
    return fail(500, 'Live rates failed.')
  }
})
