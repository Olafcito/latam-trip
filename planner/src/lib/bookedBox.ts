import type { Booking, BookingFile } from '../data/types'
import { fileProblem } from './bookings'
import { clock, dec1, hours, kr, nextDayMark, weekdayDay } from './format'

// What the booked box shows, read from the booking row alone (Task 8). The row is the truth, so a box
// whose leg has no picked flight, or another one, still shows everything the booking holds.

export interface BoxEnd {
  code: string
  city: string | null
  /** "06:00", or null for a day without a time */
  time: string | null
}

export interface BoxHead {
  from: BoxEnd
  to: BoxEnd & { mark: string }
  /** "Thu 3 Dec", or null without a day */
  day: string | null
}

const timeOf = (t: string | null) => (t && t.length >= 16 ? clock(t) : null)

/** The two codes with their cities, the day and the times. */
export function boxHead(b: Booking, city: (code: string) => string | null): BoxHead {
  const end = (code: string | null, t: string | null): BoxEnd => ({ code: code ?? '', city: code ? city(code) : null, time: timeOf(t) })
  return {
    from: end(b.from_code, b.depart),
    to: { ...end(b.to_code, b.arrive), mark: b.depart && b.arrive ? nextDayMark(b.depart, b.arrive) : '' },
    day: b.depart ? weekdayDay(b.depart) : null,
  }
}

export interface Fact {
  key: 'seller' | 'paid' | 'cabin' | 'checked' | 'refundable' | 'changeable' | 'travellers'
  label: string
  value: string
}

const REFUND: Record<string, string> = { yes: 'Yes', no: 'No', partly: 'Partly' }
const CHANGE: Record<string, string> = { yes: 'Yes', no: 'No', fee: 'For a fee' }

/** "Partly, until Mon 30 Nov", "Until Mon 30 Nov" without an answer, or the answer alone. */
function terms(answer: string | null | undefined, until: string | null): string | null {
  const last = until ? weekdayDay(until) : null
  if (answer && last) return `${answer}, until ${last}`
  return answer ?? (last ? `Until ${last}` : null)
}

function paid(b: Booking): string | null {
  // a second row of a shared ticket holds 0, and the first row holds the price
  if (b.price_dkk == null || !Number.isFinite(b.price_dkk)) return null
  if (b.price_dkk <= 0) return b.ticket ? 'On the shared ticket' : null
  const own = b.price != null && b.currency && b.currency.toUpperCase() !== 'DKK' ? `, paid as ${b.price} ${b.currency.toUpperCase()}` : ''
  return kr(b.price_dkk) + own
}

/** The fact rows that are set, in the order seller, price paid, bags, refundable, changeable, travellers. */
export function boxFacts(b: Booking): Fact[] {
  const text = (s: string | null) => (s && s.trim() ? s.trim() : null)
  const rows: [Fact['key'], string, string | null][] = [
    ['seller', 'Seller', text(b.seller)],
    ['paid', 'Price paid', paid(b)],
    ['cabin', 'Cabin bag', text(b.cabin_bag)],
    ['checked', 'Checked bag', text(b.checked_bag)],
    ['refundable', 'Refundable', terms(b.refundable && REFUND[b.refundable], b.cancel_until)],
    ['changeable', 'Changeable', terms(b.changeable && CHANGE[b.changeable], b.change_until)],
    ['travellers', 'Travellers', b.travellers > 0 ? String(b.travellers) : null],
  ]
  return rows.filter((r): r is [Fact['key'], string, string] => r[2] != null).map(([key, label, value]) => ({ key, label, value }))
}

export type BoxSegment =
  | { kind: 'flight'; from: string; to: string; depart: string; arrive: string; mark: string; what: string }
  | { kind: 'stop'; airport: string; time: string }

interface RawSegment { from: string; to: string; depart: string | null; arrive: string | null; what: string; layover: number | null }

const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)

/** One entry of the jsonb list, read leniently since a connector or a pick may write it. */
function readSegment(v: unknown): RawSegment | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const from = str(o.from) ?? str(o.origin)
  const to = str(o.to) ?? str(o.destination)
  if (!from || !to) return null
  const what = [str(o.carrier) ?? str(o.airline), str(o.number) ?? str(o.flight) ?? str(o.flight_number)].filter(Boolean).join(' ')
  const layover = typeof o.layover_h === 'number' && Number.isFinite(o.layover_h) ? o.layover_h : null
  return { from, to, depart: str(o.depart), arrive: str(o.arrive), what, layover }
}

/** Hours between two local stamps at the same airport, or null when one has no time. */
function between(a: string | null, b: string | null): number | null {
  if (!a || !b || a.length < 16 || b.length < 16) return null
  const h = (Date.parse(b.slice(0, 16) + 'Z') - Date.parse(a.slice(0, 16) + 'Z')) / 3.6e6
  return Number.isFinite(h) && h >= 0 ? h : null
}

/** The flights inside the booking with the time in each airport between. Empty for a single flight. */
export function boxSegments(b: Booking): BoxSegment[] {
  const segs = (b.segments ?? []).map(readSegment).filter((s): s is RawSegment => s != null)
  if (segs.length < 2) return []
  return segs.flatMap((s, i): BoxSegment[] => {
    const flight: BoxSegment = {
      kind: 'flight', from: s.from, to: s.to, depart: timeOf(s.depart) ?? '', arrive: timeOf(s.arrive) ?? '',
      mark: s.depart && s.arrive ? nextDayMark(s.depart, s.arrive) : '', what: s.what,
    }
    const next = segs[i + 1]
    if (!next) return [flight]
    const wait = between(s.arrive, next.depart) ?? s.layover
    return [flight, { kind: 'stop', airport: s.to, time: hours(wait) }]
  })
}

/** Why a chosen file cannot be added, in a plain sentence, or null when it can. Nothing is uploaded on a message. */
export function fileMessage(file: Pick<File, 'name' | 'type' | 'size'> | null | undefined): string | null {
  if (!file) return 'Choose a PDF or a photo to add.'
  return fileProblem(file)
}

/** The kind and the size a tile shows under the file's name. */
export function fileTile(f: BookingFile): { kind: string; size: string } {
  const kind = f.type === 'application/pdf' ? 'PDF' : f.type.startsWith('image/') ? 'Photo' : 'File'
  const size = f.size == null ? '' : f.size >= 1024 * 1024 ? `${dec1(f.size / (1024 * 1024))} MB` : `${Math.max(1, Math.round(f.size / 1024))} KB`
  return { kind, size }
}
