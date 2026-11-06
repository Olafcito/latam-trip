import type { Booking } from '../data/types'
import { bookingOn, codeNode, type BookData } from './booked'
import { blank, readKr, type BookingFields, type DraftLeg, type DraftSegment } from './bookingDraft'
import { invokeRead, isHeic, PLAIN, toSend } from './readFiles'
import { supabase } from './supabase'

// Add booking: a ticket file, a saved mail or the pasted text of a confirmation is read by the read-booking
// function (supabase/functions/read-booking), which asks Claude for the booking's fields. What comes back
// opens the booking form filled in, to check and add. A pasted link alone is kept as the mail link and
// nothing is read, since the app has no access to the mailbox.

/** What a read gives the form: the rows of the leg, the fields it fills, and the fields the read could not find. */
export interface ReadDraft {
  rows: Partial<Booking>[]
  fields: BookingFields
  /** the form fields the confirmation did not hold, shown amber in the form */
  missing: (keyof BookingFields)[]
}

export type ReadResult = ({ ok: true } & ReadDraft) | { ok: false; message: string }

/** The booking the read function returns: the input of its booking tool. Every field but legs may be missing. */
export interface ReadBooking {
  legs?: { from?: string; to?: string; depart?: string; arrive?: string; segments?: Partial<DraftSegment>[] }[]
  reference?: string
  seller?: string
  seller_reference?: string
  fare?: string
  price?: { amount?: number; currency?: string }
  refundable?: string
  cancel_until?: string
  changeable?: string
  change_until?: string
  cabin_bag?: string
  checked_bag?: string
  travellers?: number
  url?: string
  not_found?: string[]
}

const URL_ONLY = /^https?:\/\/\S+$/i
const MAIL_LINK = /https?:\/\/(?:mail\.google\.com|outlook\.(?:live|office|office365)\.com)\/[^\s<>"')]+/i

/** The link in text that is a link and nothing else, as pasted from Gmail. */
export function mailLinkOf(text: string): string | null {
  const t = text.trim()
  return URL_ONLY.test(t) ? t : null
}

/** The first Gmail or Outlook link inside longer text. */
export function linkIn(text: string): string | null {
  return text.match(MAIL_LINK)?.[0] ?? null
}

const FIELD_KEYS: (keyof BookingFields)[] = ['reference', 'seller', 'seller_reference', 'fare', 'price', 'refundable', 'cancel_until', 'changeable', 'change_until', 'cabin_bag', 'checked_bag', 'url', 'mail_url', 'notes', 'day']

const clean = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

const DATE = /^\d{4}-\d{2}-\d{2}$/
const STAMP = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/

/** The text when it has the shape of a date or a local clock time, else empty. The read is Claude's, so its shape is checked. */
const shaped = (re: RegExp, v: unknown): string => {
  const t = clean(v)
  return re.test(t) ? t : ''
}

function segmentsOf(list: Partial<DraftSegment>[] | undefined): DraftSegment[] {
  return (list ?? [])
    .filter((s) => clean(s?.from) && clean(s?.to))
    .map((s) => {
      const out: DraftSegment = { from: clean(s.from).toUpperCase(), to: clean(s.to).toUpperCase() }
      for (const k of ['carrier', 'number'] as const) {
        const v = clean(s[k])
        if (v) out[k] = v
      }
      for (const k of ['depart', 'arrive'] as const) {
        const v = shaped(STAMP, s[k])
        if (v) out[k] = v
      }
      return out
    })
}

const upper = (s: string | undefined) => clean(s).toUpperCase()

/** What draftOf knows of the store: the bookings made and the data that matches airports to places. */
export interface Known {
  bookings: Booking[]
  data: BookData
}

/**
 * The form's rows, fields and missing keys out of what the function read. Pure.
 * The leg is found among the read legs by its places, so Bogota and BOG are one. When none is found, the first read leg
 * is taken as this leg and gets its ends, so the booking attaches to it. Other legs that are already booked are left out.
 */
export function draftOf(leg: DraftLeg, booking: ReadBooking, mailUrl?: string | null, known?: Known): ReadDraft {
  const node = (code: string) => (known ? codeNode(known.data, code) : code)
  const mine = { from: node(leg.from.toUpperCase()), to: node(leg.to.toUpperCase()) }
  const read = (booking.legs ?? []).filter((l) => upper(l?.from) && upper(l?.to))
  const same = (l: { from?: string; to?: string }) => node(upper(l.from)) === mine.from && node(upper(l.to)) === mine.to
  const stamp = (l: { depart?: string }) => shaped(STAMP, l.depart)
  const first = read.find(same)
  const rest = (first ? read.filter((l) => l !== first) : read.slice(1)).filter((l) => {
    const day = stamp(l).slice(0, 10)
    return !(known && day && bookingOn(known.bookings, known.data, { from: node(upper(l.from)), to: node(upper(l.to)), day }))
  })
  const head = first ?? read[0]
  const ordered = head ? [head, ...rest.sort((a, b) => (stamp(a) < stamp(b) ? -1 : 1))] : []
  const ticket = ordered.length > 1 ? crypto.randomUUID() : null
  const cur = clean(booking.price?.currency).toUpperCase()
  const amount = booking.price?.amount
  const finite = typeof amount === 'number' && Number.isFinite(amount) && amount >= 0
  const dkk = finite && cur === 'DKK'
  const price = dkk ? String(amount).replace('.', ',') : ''
  const paid = dkk ? readKr(price) : null
  const foreign = finite && !!cur && !dkk

  const rows: Partial<Booking>[] = ordered.length
    ? ordered.map((l, k) => {
        // this leg's row carries the leg's own ends when the read named it differently
        const row: Partial<Booking> = { kind: leg.kind, from_code: k === 0 && !first ? leg.from : upper(l.from), to_code: k === 0 && !first ? leg.to : upper(l.to) }
        const depart = stamp(l)
        const arrive = shaped(STAMP, l.arrive)
        if (depart) row.depart = depart
        else if (k === 0) row.depart = leg.day
        if (arrive) row.arrive = arrive
        const segs = segmentsOf(l.segments)
        if (segs.length) row.segments = segs
        row.currency = 'DKK'
        if (k === 0 && foreign) {
          // paid in another currency: the booked box reads these as "paid as 120 USD", the kroner field stays for the person
          row.price = amount as number
          row.currency = cur
        }
        row.source = 'claude'
        row.trip_id = leg.tripId ?? null
        row.ticket = ticket
        if (ticket) row.price_dkk = k === 0 ? paid : 0
        return row
      })
    : [{ ...blank(leg), source: 'claude', trip_id: leg.tripId ?? null }]

  const fields: BookingFields = {}
  const put = (key: keyof BookingFields, v: string | undefined) => {
    const t = clean(v)
    if (t) (fields as Record<string, string>)[key] = t
  }
  put('reference', booking.reference)
  put('seller', booking.seller)
  put('seller_reference', booking.seller_reference)
  put('fare', booking.fare)
  put('price', price)
  if (['yes', 'no', 'partly'].includes(clean(booking.refundable))) fields.refundable = clean(booking.refundable) as BookingFields['refundable']
  put('cancel_until', shaped(DATE, booking.cancel_until))
  if (['yes', 'no', 'fee'].includes(clean(booking.changeable))) fields.changeable = clean(booking.changeable) as BookingFields['changeable']
  put('change_until', shaped(DATE, booking.change_until))
  put('cabin_bag', booking.cabin_bag)
  put('checked_bag', booking.checked_bag)
  put('url', booking.url)
  put('mail_url', mailUrl ?? undefined)

  const asked = new Set<keyof BookingFields>()
  for (const name of booking.not_found ?? []) {
    const key = clean(name) as keyof BookingFields
    if (FIELD_KEYS.includes(key) && key !== 'mail_url') asked.add(key)
  }
  for (const key of ['reference', 'price', 'checked_bag', 'cabin_bag'] as const) if (!fields[key]) asked.add(key)
  const missing = FIELD_KEYS.filter((k) => asked.has(k) && !fields[k])
  return { rows, fields, missing }
}

export { MAX_IMAGE_BYTES, MAX_SENT_BYTES, MAX_SENT_FILES } from './readFiles'

/**
 * Reads a booking from files and pasted text for one leg. A HEIC photo is not read, the caller keeps it for the booking.
 * known is the bookings made, so a return leg that is booked already is not added again.
 */
export async function readBooking(leg: DraftLeg, files: File[], text: string, known?: Known): Promise<ReadResult> {
  const readable = files.filter((f) => !isHeic(f))
  const link = mailLinkOf(text)
  if (link && !readable.length) {
    return { ok: true, rows: [{ ...blank(leg), source: 'claude', trip_id: leg.tripId ?? null }], fields: { mail_url: link }, missing: [] }
  }
  if (!supabase) return { ok: false, message: 'Reading is not available without a connection.' }
  try {
    const sent = await toSend(files, text)
    if (!sent.ok) return sent
    const res = await invokeRead({ leg: { kind: leg.kind, from: leg.from, to: leg.to, day: leg.day }, text: sent.text, files: sent.files })
    if (!res.ok) return res
    const booking = (res.data as { booking?: ReadBooking } | null)?.booking
    if (!booking) return { ok: false, message: PLAIN }
    return { ok: true, ...draftOf(leg, booking, link ?? linkIn(sent.text), known) }
  } catch {
    return { ok: false, message: PLAIN }
  }
}
