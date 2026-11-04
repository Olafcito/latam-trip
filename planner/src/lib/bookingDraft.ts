import type { Booking, BookingKind, CrawledFlight, FlightItem, InOut, Way } from '../data/types'
import { priceOfWays } from './options'
import { addDays } from './time'
import { dayDiff } from './format'

// The rows a booking form saves (spec 4.4). Picked flight fills them from the flight or way the leg has,
// Fill in yourself starts from the leg's ends and day alone, and Edit starts from the booked row. Every
// field but those is optional, so an empty one is left out of a new row and cleared on an edited one.

/** The leg a form is for: its kind, the codes of its two ends, its day and the trip it is marked in. */
export interface DraftLeg {
  kind: BookingKind
  from: string
  to: string
  /** "2026-12-20" */
  day: string
  tripId?: string | null
}

/** One flight inside a booking, in the shape the booked box reads. */
export interface DraftSegment {
  from: string
  to: string
  carrier?: string
  number?: string
  depart?: string
  arrive?: string
  /** the wait at `to` before the next flight, when the times there are not known */
  layover_h?: number
}

const isWay = (x: CrawledFlight | Way): x is Way => 'timeline' in x

/** Drops the keys whose value is undefined, so a segment holds only what is known. */
function known<T extends object>(o: T): T {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T
}

/** The airline of piece k of n: its own when there is one each, else all of them. */
function each(list: readonly string[] | undefined, k: number, n: number): string | undefined {
  if (!list?.length) return undefined
  return list.length === n ? list[k] : list.join(', ')
}

/** Pieces from the airports a trip goes through, the times known only at the two ends. */
function pieces(codes: string[], depart: string, arrive: string, carriers: readonly string[] | undefined, numbers: readonly string[] | undefined, waits: readonly (number | null)[]): DraftSegment[] {
  const n = codes.length - 1
  return codes.slice(0, -1).map((from, k) => known({
    from, to: codes[k + 1], carrier: each(carriers, k, n), number: each(numbers, k, n),
    depart: k === 0 ? depart : undefined, arrive: k === n - 1 ? arrive : undefined,
    layover_h: k < n - 1 ? waits[k] ?? undefined : undefined,
  }))
}

function flightSegments(leg: DraftLeg, f: CrawledFlight): DraftSegment[] {
  return pieces([leg.from, ...f.via, leg.to], f.depart, f.arrive, f.carriers, undefined, f.layover_h)
}

function waySegments(w: Way): DraftSegment[] {
  return w.timeline
    .filter((t): t is FlightItem => t.kind === 'flight')
    .flatMap((t) => pieces([t.from, ...t.connections.map((c) => c.airport), t.to], t.depart, t.arrive, t.carriers, t.flight_numbers, t.connections.map((c) => c.layover_h)))
}

/** The way a ticket way shares its ticket with, when the two are one purchase. */
function sharer(inout: Pick<InOut, 'ways'>, w: Way): Way | null {
  const p = w.paired_with ? inout.ways[w.paired_with] : undefined
  if (!p) return null
  const same = (!!w.shared_ticket && w.shared_ticket === p.shared_ticket) || p.tickets.some((t) => w.tickets.includes(t))
  return same ? p : null
}

function wayRow(leg: DraftLeg, w: Way, inout: Pick<InOut, 'tickets'>): Partial<Booking> {
  const t = w.tickets.map((id) => inout.tickets[id]).find(Boolean)
  // the page of the ticket, the one the way was found on
  const url = t?.link && /^https?:\/\//.test(t.link) ? t.link : null
  return {
    kind: 'flight', from_code: w.from, to_code: w.to, depart: w.depart, arrive: w.arrive,
    cabin_bag: t?.cabin_bag ?? null, checked_bag: t?.checked_bag ?? null, segments: waySegments(w),
    currency: 'DKK', source: 'picked', trip_id: leg.tripId ?? null, ticket: null, ...(url ? { url } : {}),
  }
}

/**
 * The rows of a picked flight or way: times, airline, the flights inside with the time in each airport between,
 * price and bags. A way on one ticket with the other way gives both rows, way in first, in one new ticket group,
 * with the price on the first row and 0 on the second, so a total counts it once.
 */
export function fromPicked(leg: DraftLeg, picked: CrawledFlight | Way, inout: Pick<InOut, 'tickets' | 'ways'>): Partial<Booking>[] {
  if (!isWay(picked)) {
    const f = picked
    return [{
      kind: leg.kind, from_code: leg.from, to_code: leg.to, depart: f.depart, arrive: f.arrive,
      price_dkk: f.price_dkk, currency: 'DKK', cabin_bag: f.cabin_bag ?? null, checked_bag: f.checked_bag ?? null,
      segments: flightSegments(leg, f), source: 'picked', trip_id: leg.tripId ?? null, ticket: null,
      ...(f.site ? { seller: f.site } : {}),
    }]
  }
  const other = sharer(inout, picked)
  const priced = (ways: Way[]) => {
    const p = priceOfWays(inout as InOut, ways).price_dkk
    return p > 0 ? p : ways.reduce((n, w) => n + (w.price_dkk || 0), 0) || null
  }
  if (!other) return [{ ...wayRow(leg, picked, inout), price_dkk: priced([picked]) }]
  const pair = [picked, other].sort((a, b) => (a.depart < b.depart ? -1 : 1))
  const ticket = crypto.randomUUID()
  return pair.map((w, k) => ({ ...wayRow(leg, w, inout), ticket, price_dkk: k === 0 ? priced(pair) : 0 }))
}

/** A row with only the kind, the ends and the day, for Fill in yourself. */
export function blank(leg: DraftLeg): Partial<Booking> {
  return { kind: leg.kind, from_code: leg.from, to_code: leg.to, depart: leg.day }
}

/**
 * The rows Fill in yourself starts from: the picked flight or way with its codes, day and times, so Simon edits rather
 * than types. The seller, the link, the bags and the price come out of the rows because the form holds them, so a field he
 * empties is not saved from the pick. With nothing picked it is the blank row.
 */
export function manualRows(leg: DraftLeg, picked: Partial<Booking>[] | null | undefined): Partial<Booking>[] {
  if (!picked?.length) return [{ ...blank(leg), source: 'manual', trip_id: leg.tripId ?? null }]
  return picked.map((row, k) => {
    const { seller: _s, url: _u, cabin_bag: _c, checked_bag: _b, price_dkk, ...rest } = row
    return { ...rest, ...(k > 0 ? { price_dkk } : {}), source: 'manual' }
  })
}

/** What the form holds, as typed. Every field is a string and may be empty. */
export interface BookingFields {
  reference?: string
  seller?: string
  /** the seller's own order number */
  seller_reference?: string
  /** the fare name */
  fare?: string
  /** in kroner, "1.250" or "1250,50" */
  price?: string
  refundable?: '' | 'yes' | 'no' | 'partly'
  cancel_until?: string
  changeable?: '' | 'yes' | 'no' | 'fee'
  change_until?: string
  cabin_bag?: string
  checked_bag?: string
  url?: string
  notes?: string
  /** "2026-12-20", the day the leg leaves */
  day?: string
}

/** The fields one ticket shares, written to every row of it. The price and the day belong to the first row. */
const SHARED = ['seller', 'seller_reference', 'refundable', 'cancel_until', 'changeable', 'change_until', 'cabin_bag', 'checked_bag', 'url', 'notes'] as const
/** The fields each flight of a ticket may hold on its own: an airline gives each flight its reference. */
const OWN = ['reference', 'fare'] as const

/** A price in kroner read the Danish way, "1.250,50" or "1250". null for an empty one, NaN for one that is not a number. */
export function readKr(s: string | undefined): number | null {
  const t = (s ?? '').replace(/\s|kr\.?/gi, '')
  if (!t) return null
  const plain = t.includes(',') ? t.replace(/\./g, '').replace(',', '.') : /^\d{1,3}(\.\d{3})+$/.test(t) ? t.replace(/\./g, '') : t
  const n = Number(plain)
  return /^\d+(\.\d+)?$/.test(plain) && Number.isFinite(n) ? n : NaN
}

/** The stamp moved by as many days as from is to to, its clock time kept. */
function onDay(stamp: string, from: string, to: string): string {
  return addDays(stamp.slice(0, 10), dayDiff(from, to)) + stamp.slice(10)
}

/**
 * The rows to save: each draft row with what the form holds. A new row leaves out what is empty. With edit,
 * an emptied field is cleared, since it held something. A day typed in moves the first row, its times kept.
 * With own, the id of the row the form was opened on, the reference and the fare go to that row alone, so the
 * other flights of the ticket keep theirs. Without it, or when no row has that id, every row takes them.
 */
export function formRows(rows: Partial<Booking>[], form: BookingFields, opts: { edit?: boolean; own?: string } = {}): Partial<Booking>[] {
  const mine = opts.own != null && rows.some((r) => r.id === opts.own) ? opts.own : null
  const put = (r: Partial<Booking>, key: keyof Booking, raw: string | undefined, value: unknown) => {
    if (raw === undefined) return
    if (raw.trim()) (r as Record<string, unknown>)[key] = value
    else if (opts.edit) (r as Record<string, unknown>)[key] = null
  }
  return rows.map((row, k) => {
    const r: Partial<Booking> = { ...row }
    for (const key of SHARED) put(r, key, form[key], form[key]?.trim())
    if (mine == null || row.id === mine) for (const key of OWN) put(r, key, form[key], form[key]?.trim())
    if (k > 0) return r
    const price = readKr(form.price)
    put(r, 'price_dkk', form.price, price)
    const day = form.day?.trim()
    const was = r.depart?.slice(0, 10)
    if (day && was && day !== was) {
      r.depart = onDay(r.depart!, was, day)
      if (r.arrive) r.arrive = onDay(r.arrive, was, day)
    } else if (day && !was) r.depart = day
    return r
  })
}

/** The form filled from a booked row, for Edit. */
export function fromRow(b: Partial<Booking>): BookingFields {
  const s = (v: string | null | undefined) => v ?? ''
  return {
    reference: s(b.reference), seller: s(b.seller), seller_reference: s(b.seller_reference), fare: s(b.fare), price: b.price_dkk == null ? '' : String(b.price_dkk).replace('.', ','),
    refundable: b.refundable ?? '', cancel_until: s(b.cancel_until), changeable: b.changeable ?? '', change_until: s(b.change_until),
    cabin_bag: s(b.cabin_bag), checked_bag: s(b.checked_bag), url: s(b.url), notes: s(b.notes), day: s(b.depart?.slice(0, 10)),
  }
}

/** A whole row out of the fields that were saved, as the table's defaults fill it, so it shows before the reload lands. */
export function savedRow(r: Partial<Booking>, id: string): Booking {
  const at = new Date().toISOString()
  return {
    kind: 'other', status: 'booked', from_code: null, to_code: null, depart: null, arrive: null, place_id: null, check_in: null, check_out: null,
    lodging_id: null, room_id: null, reference: null, seller: null, seller_reference: null, fare: null, url: null, price_dkk: null, price: null, currency: null, refundable: null,
    changeable: null, change_until: null, cancel_until: null, cabin_bag: null, checked_bag: null, segments: null, travellers: 1, trip_id: null,
    ticket: null, source: null, notes: null, attachments: [], created_at: at, updated_at: at,
    ...r, id,
  }
}

/** The bookings with the saved rows in: a row with an id changes in place, a new one is added. */
export function withSaved(list: Booking[], rows: Partial<Booking>[], ids: string[]): Booking[] {
  const next = [...list]
  rows.forEach((r, k) => {
    const id = r.id ?? ids[k]
    if (!id) return
    const at = next.findIndex((b) => b.id === id)
    if (at >= 0) next[at] = { ...next[at], ...r, id }
    else next.push(savedRow(r, id))
  })
  return next
}

/** The rows with the ids of the booked rows they change, by place. A row with no id to take is a new one. */
export function withIds(rows: Partial<Booking>[], ids: readonly (string | undefined)[]): Partial<Booking>[] {
  return rows.map((r, k) => (ids[k] ? { ...r, id: ids[k] } : r))
}

/** The booked rows of one booking: the row with the rest of its ticket, in the order they leave. */
export function rowsOf(list: Booking[], b: Booking): Booking[] {
  if (!b.ticket) return [b]
  return list.filter((x) => x.status === 'booked' && x.ticket === b.ticket).sort((x, y) => ((x.depart ?? '') < (y.depart ?? '') ? -1 : 1))
}

/** The ids a way changed from its booking writes over: both booked ways for a pair of rows, way in first, else the way's own. */
export function wayRebookIds(n: number, booked: { in: Booking | null; home: Booking | null }, dir: 'in' | 'home'): (string | undefined)[] {
  return n === 2 ? [booked.in?.id, booked.home?.id] : [booked[dir]?.id]
}
