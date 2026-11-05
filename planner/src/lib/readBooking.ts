import type { Booking } from '../data/types'
import { blank, readKr, type BookingFields, type DraftLeg, type DraftSegment } from './bookingDraft'
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

function segmentsOf(list: Partial<DraftSegment>[] | undefined): DraftSegment[] {
  return (list ?? [])
    .filter((s) => clean(s.from) && clean(s.to))
    .map((s) => {
      const out: DraftSegment = { from: clean(s.from).toUpperCase(), to: clean(s.to).toUpperCase() }
      for (const k of ['carrier', 'number', 'depart', 'arrive'] as const) {
        const v = clean(s[k])
        if (v) out[k] = v
      }
      return out
    })
}

const upper = (s: string | undefined) => clean(s).toUpperCase()

/** The form's rows, fields and missing keys out of what the function read. Pure. */
export function draftOf(leg: DraftLeg, booking: ReadBooking, mailUrl?: string | null): ReadDraft {
  const read = (booking.legs ?? []).filter((l) => upper(l.from) && upper(l.to))
  const matches = (l: { from?: string; to?: string }) => upper(l.from) === leg.from.toUpperCase() && upper(l.to) === leg.to.toUpperCase()
  const first = read.find(matches)
  const ordered = first ? [first, ...read.filter((l) => l !== first).sort((a, b) => (clean(a.depart) < clean(b.depart) ? -1 : 1))] : read
  const ticket = ordered.length > 1 ? crypto.randomUUID() : null
  const cur = clean(booking.price?.currency).toUpperCase()
  const amount = booking.price?.amount
  const dkk = typeof amount === 'number' && Number.isFinite(amount) && cur === 'DKK'
  const price = dkk ? String(amount).replace('.', ',') : ''
  const paid = dkk ? readKr(price) : null

  const rows: Partial<Booking>[] = ordered.length
    ? ordered.map((l, k) => {
        const row: Partial<Booking> = { kind: leg.kind, from_code: upper(l.from), to_code: upper(l.to) }
        const depart = clean(l.depart)
        const arrive = clean(l.arrive)
        if (depart) row.depart = depart
        else if (k === 0) row.depart = leg.day
        if (arrive) row.arrive = arrive
        const segs = segmentsOf(l.segments)
        if (segs.length) row.segments = segs
        row.currency = 'DKK'
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
  put('cancel_until', booking.cancel_until)
  if (['yes', 'no', 'fee'].includes(clean(booking.changeable))) fields.changeable = clean(booking.changeable) as BookingFields['changeable']
  put('change_until', booking.change_until)
  put('cabin_bag', booking.cabin_bag)
  put('checked_bag', booking.checked_bag)
  put('url', booking.url)
  put('mail_url', mailUrl ?? undefined)
  if (!dkk && typeof amount === 'number' && Number.isFinite(amount) && cur) fields.notes = `Paid ${amount} ${cur}`

  const asked = new Set<keyof BookingFields>()
  for (const name of booking.not_found ?? []) {
    const key = clean(name) as keyof BookingFields
    if (FIELD_KEYS.includes(key) && key !== 'mail_url') asked.add(key)
  }
  for (const key of ['reference', 'price', 'checked_bag', 'cabin_bag'] as const) if (!fields[key]) asked.add(key)
  const missing = FIELD_KEYS.filter((k) => asked.has(k) && !fields[k])
  return { rows, fields, missing }
}

const HEIC = /\.(heic|heif)$/i
const isEml = (f: File) => /\.eml$/i.test(f.name) || f.type === 'message/rfc822'

async function base64Of(f: File): Promise<string> {
  const bytes = new Uint8Array(await f.arrayBuffer())
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

const PLAIN = 'The booking could not be read. Fill it in yourself.'

/** Reads a booking from files and pasted text for one leg. */
export async function readBooking(leg: DraftLeg, files: File[], text: string): Promise<ReadResult> {
  const link = mailLinkOf(text)
  if (link && !files.length) {
    return { ok: true, rows: [{ ...blank(leg), source: 'claude', trip_id: leg.tripId ?? null }], fields: { mail_url: link }, missing: [] }
  }
  if (!supabase) return { ok: false, message: 'Reading is not available without a connection.' }
  if (files.some((f) => HEIC.test(f.name) || /^image\/hei[cf]$/.test(f.type))) {
    return { ok: false, message: 'HEIC photos cannot be read. Share a screenshot or a PDF instead.' }
  }
  try {
    let all = text
    const sent: { name: string; type: string; data: string }[] = []
    for (const f of files) {
      if (isEml(f)) all += `\n\n${await f.text()}`
      else sent.push({ name: f.name, type: f.type, data: await base64Of(f) })
    }
    if (!all.trim() && !sent.length) return { ok: false, message: 'Add a file or paste the confirmation first.' }
    const { data, error } = await supabase.functions.invoke('read-booking', { body: { leg: { kind: leg.kind, from: leg.from, to: leg.to, day: leg.day }, text: all, files: sent } })
    if (error) {
      let message = PLAIN
      const ctx = (error as { context?: unknown }).context
      if (ctx instanceof Response) {
        const body = (await ctx.json().catch(() => null)) as { error?: string } | null
        if (body?.error) message = body.error
      }
      return { ok: false, message }
    }
    const booking = (data as { booking?: ReadBooking } | null)?.booking
    if (!booking) return { ok: false, message: PLAIN }
    return { ok: true, ...draftOf(leg, booking, link ?? linkIn(all)) }
  } catch {
    return { ok: false, message: PLAIN }
  }
}
