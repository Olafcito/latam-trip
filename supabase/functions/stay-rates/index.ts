// stay-rates: the live rooms and prices of a place to stay from Hostelworld (FEAT-002, TECH-003). The planner calls
// it when a place with a Hostelworld link is opened, and the worker calls it each morning for the dates that have a
// price already. It reads Hostelworld's own JSON, writes the rooms to lodging_rooms and one price per room to
// lodging_prices, and the planner gets the rows through realtime. A pasted link adds the place first. A search adds
// and prices the most popular hostels of a map place's Hostelworld city (FEAT-003, TECH-004).
// Owner only, or the worker with the worker key. Nothing of the content is logged.
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.118.0'
import { countryName, km, pickCity, rankHostels, type Ranked } from './rank.ts'

const CORS: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const HW_BASE = 'https://prod.apigee.hostelworld.com/legacy-hwapi-service/2.2'
const HW = `${HW_BASE}/properties`
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'
const FRESH_MINUTES = 10
const MAX_NIGHTS = 30
const MAX_PHOTOS = 8
const SUMMARY_CHARS = 600
const FETCH_MS = 15_000
// The shared gate of migration 0020: 30 Hostelworld requests a minute across every caller, and a request gives up
// once it would have waited longer than this in all.
const GATE_SITE = 'hostelworld'
const GATE_PER_MINUTE = 30
const GATE_MAX_WAIT_S = 45
// The search: how many hostels by default and at most, how far from the map place, and how long a city is remembered.
const TOP_DEFAULT = 3
const TOP_MAX = 5
const SEARCH_KM = 40
// A pasted link to a property further than this from its map place is refused.
const LINK_KM = 60
const CITY_DAYS = 30

interface Body {
  lodging_id?: string; url?: string; place_id?: string; check_in?: string; check_out?: string; fresh_minutes?: number
  search?: boolean; top?: number
}
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

/** A refusal with its status, and fields that go into the reply beside the error, such as retry_after. */
class Refused extends Error {
  constructor(public status: number, message: string, public extra: Record<string, unknown> = {}) {
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

const sleep = (ms: number): Promise<void> => new Promise((done) => setTimeout(done, ms))

/** Takes a turn at the shared Hostelworld gate, waiting while the minute is full. Fails closed when the gate cannot be asked. */
async function takeTurn(db: SupabaseClient): Promise<void> {
  let waited = 0
  for (;;) {
    const { data, error } = await db.rpc('take_site_call', { p_site: GATE_SITE, p_per_minute: GATE_PER_MINUTE })
    const wait = typeof data === 'number' ? data : Number.NaN
    if (error || !Number.isFinite(wait)) throw new Refused(503, 'The Hostelworld gate could not be asked.')
    if (wait <= 0) return
    if (waited + wait > GATE_MAX_WAIT_S) {
      throw new Refused(429, 'Hostelworld is busy, try again in a minute.', { retry_after: Math.max(1, Math.ceil(wait)) })
    }
    await sleep(wait * 1000)
    waited += wait
  }
}

/** One GET to Hostelworld through the gate. The headers default to the browser user agent and JSON. */
async function hwGet<T>(db: SupabaseClient, url: string, headers: Record<string, string> = {}, notFound = 'Hostelworld knows no place with that id.'): Promise<T> {
  await takeTurn(db)
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), FETCH_MS)
  try {
    let res: Response
    try {
      res = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'application/json', ...headers }, signal: ctl.signal })
    } catch {
      throw new Refused(502, 'Hostelworld could not be reached.')
    }
    if (res.status === 404) throw new Refused(404, notFound)
    if (!res.ok) throw new Refused(502, 'Hostelworld did not answer.')
    try {
      return (await res.json()) as T
    } catch {
      throw new Refused(502, 'Hostelworld gave an unreadable answer.')
    }
  } finally {
    clearTimeout(timer)
  }
}

/** A property path under Hostelworld's properties endpoint, through the gate. */
const hostelworld = <T>(db: SupabaseClient, path: string): Promise<T> => hwGet<T>(db, `${HW}/${path}`)

const KINDS: Record<string, string> = { HOSTEL: 'hostel', HOTEL: 'hotel', GUESTHOUSE: 'guesthouse', APARTMENT: 'apartment' }
const TAGS: [RegExp, string][] = [[/kitchen/i, 'kitchen'], [/breakfast/i, 'breakfast'], [/air ?con/i, 'aircon'], [/pool/i, 'pool']]

/** The lodging row of a Hostelworld property, as the planner's Add place would fill it in. */
function lodgingOf(p: HwProperty, url: string, placeId: string, addedBy: 'simon' | 'claude'): Record<string, unknown> {
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
    added_by: addedBy,
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

interface Stored { id: string; place_id: string | null; hidden: boolean; added_by: string; link: string }

/** Every stored lodging with a Hostelworld link, by its Hostelworld property id. The first one stored wins a tie. */
async function storedByProperty(db: SupabaseClient): Promise<Map<string, Stored>> {
  const { data, error } = await db
    .from('lodgings')
    .select('id, links, place_id, hidden, added_by')
    .filter('links', 'cs', JSON.stringify([{ site: 'hostelworld' }]))
    .order('created_at')
  if (error) throw new Refused(500, 'The places could not be read.')
  const out = new Map<string, Stored>()
  for (const row of data ?? []) {
    const links = Array.isArray(row.links) ? (row.links as { site?: string; url?: string }[]) : []
    for (const l of links) {
      const id = l.site === 'hostelworld' && typeof l.url === 'string' ? hostelworldId(l.url) : null
      if (id && !out.has(id)) {
        out.set(id, { id: row.id, place_id: row.place_id ?? null, hidden: row.hidden === true, added_by: String(row.added_by ?? ''), link: l.url as string })
      }
    }
  }
  return out
}

/** The stored lodging with this Hostelworld property id, by its links, else null. */
async function findByProperty(db: SupabaseClient, propertyId: string): Promise<Stored | null> {
  return (await storedByProperty(db)).get(propertyId) ?? null
}

interface Target { lodgingId: string; propertyId: string; link: string; created: boolean }

/**
 * Refuses a pasted link to a property more than LINK_KM from the map place it is added at, naming the town it is
 * in. A place or property without coordinates passes.
 */
async function nearStop(db: SupabaseClient, prop: HwProperty, placeId: string): Promise<void> {
  const lat = num(prop.latitude)
  const lon = num(prop.longitude)
  if (lat === null || lon === null) return
  const { data, error } = await db.from('places').select('lat, lon').eq('id', placeId).maybeSingle()
  if (error) throw new Refused(500, 'The map place could not be read.')
  const pLat = num(data?.lat)
  const pLon = num(data?.lon)
  if (pLat === null || pLon === null || km(pLat, pLon, lat, lon) <= LINK_KM) return
  const town = (prop.city?.name ?? '').trim()
  throw new Refused(409, town ? `That place is in ${town}, not at this stop.` : 'That place is not at this stop.')
}

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
    const prop = await hostelworld<HwProperty>(db, `${propertyId}/`)
    await nearStop(db, prop, body.place_id.trim())
    const { data, error } = await db.from('lodgings').insert(lodgingOf(prop, body.url.trim(), body.place_id.trim(), 'simon')).select('id').single()
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
  const avail = await hostelworld<HwAvailability>(db, `${t.propertyId}/availability/?date-start=${checkIn}&num-nights=${nights}&guests=1&currency=DKK`)
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

interface Place { id: string; name: string | null; country: string | null; lat: number | null; lon: number | null }
interface City { id: string | null; name: string | null }
interface SearchResult {
  place_id: string; city_id: string | null; city: string | null; lodging_ids: string[]
  created: number; priced: number; rooms: number; prices: number
}

const DAY_MS = 86_400_000

/** The Hostelworld city of a map place, remembered for CITY_DAYS, else looked up by the place's name and remembered, a miss included. */
async function cityOf(db: SupabaseClient, place: Place): Promise<City> {
  const { data, error } = await db.from('hostelworld_cities').select('city_id, city, checked_at').eq('place_id', place.id).maybeSingle()
  if (error) throw new Refused(500, 'The Hostelworld city could not be read.')
  if (data && Date.now() - Date.parse(data.checked_at) < CITY_DAYS * DAY_MS) return { id: data.city_id ?? null, name: data.city ?? null }
  const name = (place.name ?? '').trim()
  const hit = name
    ? pickCity(await hwGet<unknown>(db, `${HW_BASE}/suggestions/?text=${encodeURIComponent(name)}`, {}, 'Hostelworld gave no suggestions.'), countryName(place.country))
    : null
  const city: City = { id: hit?.id ?? null, name: hit?.name ?? null }
  const { error: e } = await db
    .from('hostelworld_cities')
    .upsert({ place_id: place.id, city_id: city.id, city: city.name, checked_at: new Date().toISOString() }, { onConflict: 'place_id' })
  if (e) throw new Refused(500, 'The Hostelworld city could not be saved.')
  return city
}

/** The public Hostelworld page of a property, a link hostelworldId reads back. */
function propertyLink(r: Ranked): string {
  const slug = r.name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  return `https://www.hostelworld.com/hostels/p/${r.id}/${slug || 'hostel'}/`
}

/** A Hostelworld answer about one property that should not stop the search: it is gone or did not answer. */
const skippable = (e: unknown): boolean => e instanceof Refused && (e.status === 404 || e.status === 502)

/**
 * Finds the top hostels of a map place on Hostelworld for the dates, adds the new ones and prices those not priced
 * within the fresh window. A hostel stored hidden or at another stop is passed over and the next one takes its turn.
 */
async function search(db: SupabaseClient, placeId: string, checkIn: string, checkOut: string, nights: number, freshMinutes: number, top: number): Promise<SearchResult> {
  const key = Deno.env.get('HOSTELWORLD_WEB_KEY')?.trim()
  if (!key) throw new Refused(503, 'The Hostelworld web key is not set.')
  const { data: row, error } = await db.from('places').select('id, name, country, lat, lon').eq('id', placeId).maybeSingle()
  if (error) throw new Refused(500, 'The map place could not be read.')
  if (!row) throw new Refused(404, 'There is no such map place.')
  const place: Place = { id: row.id, name: row.name ?? null, country: row.country ?? null, lat: num(row.lat), lon: num(row.lon) }
  const result: SearchResult = { place_id: place.id, city_id: null, city: null, lodging_ids: [], created: 0, priced: 0, rooms: 0, prices: 0 }
  const stored = await storedByProperty(db)

  // A search already made for these dates: enough hostels it added here have fresh prices, so Hostelworld is not asked.
  const ours = [...stored.values()].filter((l) => l.place_id === place.id && !l.hidden && l.added_by === 'claude')
  if (ours.length >= top) {
    const fresh: string[] = []
    for (const l of ours) {
      if (fresh.length >= top) break
      if (await isFresh(db, l.id, checkIn, checkOut, freshMinutes)) fresh.push(l.id)
    }
    if (fresh.length >= top) {
      const { data: c } = await db.from('hostelworld_cities').select('city_id, city').eq('place_id', place.id).maybeSingle()
      return { ...result, city_id: c?.city_id ?? null, city: c?.city ?? null, lodging_ids: fresh }
    }
  }

  const city = await cityOf(db, place)
  if (!city.id) return result
  result.city_id = city.id
  result.city = city.name
  const list = await hwGet<{ properties?: unknown }>(
    db,
    `${HW_BASE}/cities/${encodeURIComponent(city.id)}/properties/?currency=DKK&application=web&date-start=${checkIn}&num-nights=${nights}` +
      '&guests=1&per-page=1000&show-rooms=1&property-num-images=30',
    { 'api-key': key, Origin: 'https://www.hostelworld.com', Referer: 'https://www.hostelworld.com/' },
    'Hostelworld knows no such city.',
  )
  const ranked = rankHostels(list?.properties, place, SEARCH_KM)

  for (const r of ranked) {
    if (result.lodging_ids.length >= top) break
    const had = stored.get(r.id)
    let t: Target
    if (had) {
      if (had.hidden || had.place_id !== place.id) continue
      t = { lodgingId: had.id, propertyId: r.id, link: had.link, created: false }
    } else {
      const link = propertyLink(r)
      if (hostelworldId(link) !== r.id) continue
      let prop: HwProperty
      try {
        prop = await hostelworld<HwProperty>(db, `${r.id}/`)
      } catch (e) {
        if (skippable(e)) continue
        throw e
      }
      const { data, error: e } = await db.from('lodgings').insert(lodgingOf(prop, link, place.id, 'claude')).select('id').single()
      if (e || !data) throw new Refused(500, 'The place could not be saved.')
      t = { lodgingId: data.id, propertyId: r.id, link, created: true }
      stored.set(r.id, { id: data.id, place_id: place.id, hidden: false, added_by: 'claude', link })
      result.created++
    }
    result.lodging_ids.push(t.lodgingId)
    if (!t.created && (await isFresh(db, t.lodgingId, checkIn, checkOut, freshMinutes))) continue
    try {
      const counts = await price(db, t, checkIn, checkOut, nights)
      result.priced++
      result.rooms += counts.rooms
      result.prices += counts.prices
    } catch (e) {
      if (!skippable(e)) throw e
    }
  }
  return result
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS })
  if (req.method !== 'POST') return fail(405, 'Ask with POST.')
  if (!isWorker(req) && !(await isOwner(req))) return fail(403, 'Only the owner can ask for live rates.')

  let parsed: unknown
  try {
    parsed = await req.json()
  } catch {
    return fail(400, 'The request could not be read.')
  }
  if (!isObject(parsed)) return fail(400, 'The request could not be read.')
  const body = parsed as Body
  const checkIn = typeof body.check_in === 'string' ? body.check_in : ''
  const checkOut = typeof body.check_out === 'string' ? body.check_out : ''
  if (!DAY.test(checkIn) || !DAY.test(checkOut)) return fail(400, 'The dates are not dates.')
  const nights = nightsOf(checkIn, checkOut)
  if (!Number.isFinite(nights) || nights < 1) return fail(400, 'The check out must be after the check in.')
  if (nights > MAX_NIGHTS) return fail(400, 'The stay is too long to price.')
  const freshMinutes = typeof body.fresh_minutes === 'number' && body.fresh_minutes >= 0 ? body.fresh_minutes : FRESH_MINUTES

  if (body.search === true) {
    const placeId = typeof body.place_id === 'string' ? body.place_id.trim() : ''
    if (!placeId) return fail(400, 'Say which place on the map to search.')
    const top = body.top === undefined ? TOP_DEFAULT : body.top
    if (typeof top !== 'number' || !Number.isInteger(top) || top < 1 || top > TOP_MAX) return fail(400, `Ask for 1 to ${TOP_MAX} places.`)
    try {
      return reply(200, await search(service(), placeId, checkIn, checkOut, nights, freshMinutes, top))
    } catch (e) {
      if (e instanceof Refused) return reply(e.status, { error: e.message, ...e.extra })
      return fail(500, 'The search failed.')
    }
  }

  try {
    const db = service()
    const t = await target(db, body)
    if (!t.created && (await isFresh(db, t.lodgingId, checkIn, checkOut, freshMinutes))) {
      return reply(200, { lodging_id: t.lodgingId, created: false, fetched: false, rooms: 0, prices: 0 })
    }
    const counts = await price(db, t, checkIn, checkOut, nights)
    return reply(200, { lodging_id: t.lodgingId, created: t.created, fetched: true, ...counts })
  } catch (e) {
    if (e instanceof Refused) return reply(e.status, { error: e.message, ...e.extra })
    return fail(500, 'Live rates failed.')
  }
})
