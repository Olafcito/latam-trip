import type { Booking, BookingFile } from '../data/types'
import { fileProblem } from './bookings'
import { clock, dec1, hours, kr, nextDayMark, thousands, weekdayDay } from './format'

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

/** sorts after every depart, so a row with none comes last */
const LAST = String.fromCharCode(0xffff)

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

/** An amount in its own currency, Danish style: "100", "1.250,50". */
function amount(n: number): string {
  const cents = Math.round(Math.abs(n) * 100) % 100
  return cents ? `${thousands(Math.trunc(n))},${String(cents).padStart(2, '0')}` : thousands(n)
}

function paid(b: Booking): string | null {
  // a second row of a shared ticket holds 0, and the first row holds the price
  if (b.price_dkk == null || !Number.isFinite(b.price_dkk)) return null
  if (b.price_dkk <= 0) return b.ticket ? 'On the shared ticket' : null
  const own = b.price != null && b.currency && b.currency.toUpperCase() !== 'DKK' ? `, paid as ${amount(b.price)} ${b.currency.toUpperCase()}` : ''
  return kr(b.price_dkk) + own
}

/** The fact rows that are set, in the order seller, price paid, bags, refundable, changeable, travellers above 1. */
export function boxFacts(b: Booking): Fact[] {
  const text = (s: string | null) => (s && s.trim() ? s.trim() : null)
  const rows: [Fact['key'], string, string | null][] = [
    ['seller', 'Seller', text(b.seller)],
    ['paid', 'Price paid', paid(b)],
    ['cabin', 'Cabin bag', text(b.cabin_bag)],
    ['checked', 'Checked bag', text(b.checked_bag)],
    ['refundable', 'Refundable', terms(b.refundable && REFUND[b.refundable], b.cancel_until)],
    ['changeable', 'Changeable', terms(b.changeable && CHANGE[b.changeable], b.change_until)],
    // the column holds 1 unless more were booked, and one traveller is not worth a row
    ['travellers', 'Travellers', b.travellers > 1 ? String(b.travellers) : null],
  ]
  return rows.filter((r): r is [Fact['key'], string, string] => r[2] != null).map(([key, label, value]) => ({ key, label, value }))
}

/** A fact as a chip: a short word or amount on it, the whole fact for its tooltip and for a screen reader. */
export interface BoxChip {
  key: Fact['key']
  text: string
  /** the last day the answer holds, "Mon 30 Nov" */
  until?: string
  /** ok reads green, part amber and no faint */
  tone?: 'ok' | 'part' | 'no'
  label: string
}

const REFUND_CHIP: Record<string, [string, BoxChip['tone']]> = { yes: ['Refundable', 'ok'], partly: ['Part refund', 'part'], no: ['No refund', 'no'] }
const CHANGE_CHIP: Record<string, [string, BoxChip['tone']]> = { yes: ['Changeable', 'ok'], fee: ['Change for a fee', 'part'], no: ['No changes', 'no'] }

/** A bag reads ok when it is included and no when it is not, else it stays plain. */
function bagTone(v: string): BoxChip['tone'] {
  if (/^(no|none|not)\b/i.test(v)) return 'no'
  return /includ/i.test(v) ? 'ok' : undefined
}

/** The facts of a booking as chips, in the order boxFacts keeps. */
export function boxChips(b: Booking): BoxChip[] {
  return boxFacts(b).map((f): BoxChip => {
    const label = `${f.label}, ${f.value}`
    const chip = (text: string, more: Partial<BoxChip> = {}): BoxChip => {
      const c: BoxChip = { key: f.key, text, label }
      if (more.until) c.until = more.until
      if (more.tone) c.tone = more.tone
      return c
    }
    if (f.key === 'paid') return chip(b.price_dkk && b.price_dkk > 0 ? kr(b.price_dkk) : 'Shared ticket')
    if (f.key === 'cabin' || f.key === 'checked') return chip(f.value, { tone: bagTone(f.value) })
    if (f.key === 'refundable' || f.key === 'changeable') {
      const answer = f.key === 'refundable' ? b.refundable : b.changeable
      const until = f.key === 'refundable' ? b.cancel_until : b.change_until
      const [text, tone] = (answer && (f.key === 'refundable' ? REFUND_CHIP : CHANGE_CHIP)[answer]) || [f.key === 'refundable' ? 'Refund' : 'Change', undefined]
      return chip(text, { tone, until: until && answer !== 'no' ? weekdayDay(until) : undefined })
    }
    return chip(f.value)
  })
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

/**
 * The flights inside the booking with the time in each airport between. Empty for a single flight, unless single
 * is set and that flight names its airline or number, so the box can show which flight it is.
 */
export function boxSegments(b: Booking, opts: { single?: boolean } = {}): BoxSegment[] {
  const segs = (b.segments ?? []).map(readSegment).filter((s): s is RawSegment => s != null)
  if (segs.length < 2 && !(opts.single && segs.length === 1 && segs[0].what)) return []
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

/**
 * How long the booking takes, door to door, from its local times and the UTC offset of each end. null without
 * both offsets or both times, so a guess never shows.
 */
export function flightHours(b: Pick<Booking, 'from_code' | 'to_code' | 'depart' | 'arrive'>, offset: (code: string) => number | null): number | null {
  const a = b.from_code ? offset(b.from_code) : null
  const z = b.to_code ? offset(b.to_code) : null
  if (a == null || z == null || !b.depart || !b.arrive || b.depart.length < 16 || b.arrive.length < 16) return null
  // the local times alone, then the clocks moved back to one zone. Eastward a flight can land before it leaves in local time
  const local = (Date.parse(b.arrive.slice(0, 16) + 'Z') - Date.parse(b.depart.slice(0, 16) + 'Z')) / 3.6e6
  const h = local - (z - a)
  return Number.isFinite(h) && h > 0 ? h : null
}

/** One leg of a shared ticket, as a chip on the ticket row: its codes, its day, and whether it is this leg. */
export interface TicketLeg {
  from: string
  to: string
  /** "Wed 9 Dec", or null without a day */
  day: string | null
  here: boolean
}

/** A fact as a row of the box: its label, its value, a code to copy in mono, and the smaller facts after it. */
export interface BoxRow {
  key: Fact['key'] | 'fare'
  label: string
  /** null only on a shared ticket whose price is not known, so the legs still show */
  value: string | null
  /** a code read in mono and copied with one press, the seller's own number */
  mono?: string
  more?: string[]
  /** every leg of a ticket that covers more than one, this leg first */
  legs?: TicketLeg[]
}

/** The rows of the box, in the order seller, paid with the legs of its ticket, fare, bags, refund, change and travellers above 1. */
export function boxRows(b: Booking, list: readonly Booking[]): BoxRow[] {
  const text = (v: string | null | undefined) => (v && v.trim() ? v.trim() : null)
  const ticket = b.ticket ? list.filter((x) => x.status === 'booked' && x.ticket === b.ticket && x.id !== b.id) : []
  const group = [b, ...ticket]
  const order = (p: Booking, r: Booking) => {
    const dp = p.depart ?? LAST
    const dr = r.depart ?? LAST
    return dr < dp || (dr === dp && r.id < p.id)
  }
  // the first row of a ticket holds its price, the others 0: the earliest depart, then the lowest id, as paidPrice reads it
  const payer = group.reduce((p, r) => (order(p, r) ? r : p))
  const out: BoxRow[] = []
  const add = (key: BoxRow['key'], label: string, value: string | null, extra: Partial<BoxRow> = {}) => {
    if (value == null && !extra.legs) return
    const r: BoxRow = { key, label, value }
    if (extra.mono) r.mono = extra.mono
    if (extra.more?.length) r.more = extra.more
    if (extra.legs) r.legs = extra.legs
    out.push(r)
  }
  const seller = text(b.seller)
  const number = text(b.seller_reference)
  add('seller', 'Booked through', seller ?? (number ? 'Seller' : null), { mono: number ?? undefined })
  const dkk = payer.price_dkk
  const known = dkk != null && Number.isFinite(dkk) && dkk > 0
  const cur = payer.currency?.toUpperCase()
  const more = known && payer.price != null && cur && cur !== 'DKK' ? [`${amount(payer.price)} ${cur}`] : []
  const leg = (r: Booking): TicketLeg => ({ from: r.from_code ?? '', to: r.to_code ?? '', day: r.depart ? weekdayDay(r.depart) : null, here: r.id === b.id })
  // this leg first, then the others in the order they fly
  const legs = ticket.length ? [leg(b), ...[...ticket].sort((x, y) => (order(y, x) ? -1 : order(x, y) ? 1 : 0)).map(leg)] : undefined
  add('paid', 'Paid', known ? kr(dkk) : null, { more, legs })
  add('fare', 'Fare', text(b.fare))
  add('cabin', 'Cabin bag', text(b.cabin_bag))
  add('checked', 'Checked bag', text(b.checked_bag))
  add('refundable', 'Refundable', terms(b.refundable && REFUND[b.refundable], b.cancel_until))
  add('changeable', 'Changeable', terms(b.changeable && CHANGE[b.changeable], b.change_until))
  add('travellers', 'Travellers', b.travellers > 1 ? String(b.travellers) : null)
  return out
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
