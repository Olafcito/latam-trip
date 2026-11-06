import type { Booking, LodgingPrice, LodgingRoom, LodgingSite } from '../data/types'
import { weekdayDay } from './format'
import { partDkk, priceFor, type StayPart } from './stays'
import { addDays } from './time'

// A stay at a stop turned from planned into booked. Booking a planned part is one bookings row of kind stay, with
// the stop, the place, the room, the trip and the part's nights, and what Simon gives: a file, a link or the details.
// A part that already has its row is changed in place, so a second confirmation never makes a second booking.

/** The prompt Use with AI copies, with the city filled in. */
export function stayPrompt(city: string): string {
  return (
    `Look through my Gmail for emails about accommodation in ${city}. Find any accommodation bookings or reservations ` +
    'and add them to my LATAM Trips itinerary, including the property name, dates, room type, price and booking reference. ' +
    'Let me review the results before saving.'
  )
}

export interface StayTarget {
  tripId: string
  placeId: string
  lodgingId: string | null
  roomId: string | null
  /** the first night and the number of nights */
  first: string
  nights: number
}

/** The new booking of a planned part: booked, typed in by Simon, from its first night to the morning after its last. */
export function stayDraft(t: StayTarget): Partial<Booking> {
  return {
    kind: 'stay',
    status: 'booked',
    place_id: t.placeId,
    lodging_id: t.lodgingId,
    room_id: t.roomId,
    trip_id: t.tripId,
    check_in: t.first,
    check_out: addDays(t.first, Math.max(1, t.nights)),
    source: 'manual',
  }
}

/** The row to save: a change to the booking the part has, or a new booking with the change on it. */
export function stayRow(had: Pick<Booking, 'id'> | null, t: StayTarget, change: Partial<Booking>): Partial<Booking> {
  return had ? { ...change, id: had.id } : { ...stayDraft(t), ...change }
}

/** A link worth keeping: http or https only. */
export function bookingLink(text: string): string | null {
  const t = text.trim()
  try {
    const u = new URL(t)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.toString() : null
  } catch {
    return null
  }
}

/** How it can be cancelled, in a few words, or null when nothing is known. */
export function cancelWords(refundable: LodgingPrice['refundable'] | Booking['refundable'], until: string | null | undefined): string | null {
  if (refundable === 'no') return 'Non-refundable'
  if (refundable === 'partly') return until ? `Partly refundable until ${weekdayDay(until)}` : 'Partly refundable'
  if (refundable === 'yes' || until) return until ? `Free cancellation until ${weekdayDay(until)}` : 'Free cancellation'
  return null
}

/** The price of the room seen nearest the part's nights, for its cancellation terms. */
export function partTerms(room: LodgingRoom | undefined, part: Pick<StayPart, 'first' | 'nights'>): LodgingPrice | null {
  if (!room || part.nights <= 0) return null
  const out = addDays(part.first, part.nights)
  const exact = room.prices.filter((p) => p.check_in === part.first && p.check_out === out)
  if (exact.length) return exact.reduce((a, b) => ((a.total_dkk ?? Infinity) <= (b.total_dkk ?? Infinity) ? a : b))
  const near = priceFor(room, part.first, part.nights)
  if (!near || near.exact) return null
  return room.prices.find((p) => p.check_in === near.check_in && p.check_out === near.check_out) ?? null
}

export interface StayMoney {
  /** a night, rounded */
  perNight: number | null
  total: number | null
  /** false when the price is from other dates */
  exact: boolean
}

/** What the part costs a night and in all, from the booking when its price is filled in, else from the room's prices. */
export function stayMoney(room: LodgingRoom | undefined, part: StayPart, paid: number | null): StayMoney {
  const nights = Math.max(1, part.nights)
  if (paid != null) return { perNight: Math.round(paid / nights), total: paid, exact: true }
  const total = partDkk(room, part)
  if (total == null) return { perNight: null, total: null, exact: false }
  const pr = room ? priceFor(room, part.first, part.nights) : null
  return { perNight: Math.round(total / nights), total, exact: !!pr?.exact }
}

// ---- the review of a stay confirmation (0024). Read from a file or typed in, Simon checks it before it is saved.

/** The review form, every field as typed. Money is in the confirmation's currency, dkk is the kroner total Simon gives. */
export interface StayForm {
  provider: LodgingSite | ''
  /** the name of another provider, "Casa Lola direct" */
  seller: string
  /** the link of another provider */
  sellerUrl: string
  reference: string
  checkIn: string
  checkOut: string
  /** local clock times, "15:00" */
  checkInTime: string
  checkOutTime: string
  room: string
  guests: string
  rooms: string
  /** the total of the stay, never a deposit */
  total: string
  currency: string
  /** what was paid when booking */
  paid: string
  /** the total in kroner, typed by Simon when the currency is not DKK */
  dkk: string
  refundable: 'yes' | 'no' | 'partly' | ''
  cancelUntil: string
  mailUrl: string
  /** the place's full address, offered to the lodging when it has none */
  address: string
}

/** The keys of the form, for the fields the confirmation did not state, shown amber. */
export type StayFormKey = keyof StayForm

/** The number in a typed amount: "106,754.76", "106.754,76", "1 220" and "1220 kr" all read. null for an empty one, NaN for one that is not a number. */
export function moneyOf(text: string | undefined): number | null {
  if (!(text ?? '').trim()) return null
  const t = (text ?? '').replace(/[\s ]|[a-z]{1,3}\.?$/gi, '')
  if (!t) return NaN
  if (!/^\d[\d.,]*$/.test(t)) return NaN
  const dot = t.lastIndexOf('.')
  const comma = t.lastIndexOf(',')
  let plain: string
  if (dot >= 0 && comma >= 0) {
    // both marks: the last one is the decimal point
    const decimal = dot > comma ? '.' : ','
    const thousands = decimal === '.' ? /,/g : /\./g
    plain = t.replace(thousands, '').replace(decimal, '.')
  } else if (dot >= 0 || comma >= 0) {
    const mark = dot >= 0 ? '.' : ','
    const parts = t.split(mark)
    // a mark that repeats, or is followed by three digits, groups thousands. Otherwise it is the decimal point.
    const groups = parts.length > 2 || (parts[1].length === 3 && parts[0].length <= 3 && parts[0] !== '0')
    plain = groups ? parts.join('') : parts.join('.')
  } else {
    plain = t
  }
  const n = Number(plain)
  return /^\d+(\.\d+)?$/.test(plain) && Number.isFinite(n) ? n : NaN
}

/** An amount as plain text for the form. */
const moneyText = (n: number | null | undefined): string => (typeof n === 'number' && Number.isFinite(n) ? String(n) : '')

/** The form for the target, from the booking it has or its dates alone. */
export function stayFormOf(t: StayTarget, booking: Booking | null): StayForm {
  const form: StayForm = {
    provider: '', seller: '', sellerUrl: '', reference: '',
    checkIn: t.first, checkOut: addDays(t.first, Math.max(1, t.nights)),
    checkInTime: '', checkOutTime: '', room: '', guests: '', rooms: '',
    total: '', currency: 'DKK', paid: '', dkk: '', refundable: '', cancelUntil: '', mailUrl: '', address: '',
  }
  if (!booking) return form
  const currency = (booking.currency ?? '').trim().toUpperCase() || 'DKK'
  return {
    provider: booking.provider ?? '',
    seller: booking.seller ?? '',
    sellerUrl: booking.seller_url ?? '',
    reference: booking.reference ?? '',
    checkIn: booking.check_in ?? form.checkIn,
    checkOut: booking.check_out ?? form.checkOut,
    checkInTime: booking.check_in_time ?? '',
    checkOutTime: booking.check_out_time ?? '',
    room: booking.room_name ?? '',
    guests: booking.travellers ? String(booking.travellers) : '',
    rooms: booking.rooms ? String(booking.rooms) : '',
    total: moneyText(booking.price),
    currency,
    paid: moneyText(booking.paid),
    dkk: currency === 'DKK' ? '' : moneyText(booking.price_dkk),
    refundable: booking.refundable ?? '',
    cancelUntil: booking.cancel_until ?? '',
    mailUrl: booking.mail_url ?? '',
    address: '',
  }
}

const PROVIDER_NAME: Record<LodgingSite, string> = { booking: 'Booking.com', hostelworld: 'Hostelworld', airbnb: 'Airbnb', own: '', other: '' }
const DAY = /^\d{4}-\d{2}-\d{2}$/
const CLOCK = /^([01]\d|2[0-3]):[0-5]\d$/

/**
 * What the reviewed form changes on the booking, and the address to offer the lodging, or why it cannot be saved.
 * Empty fields change nothing. The address is not part of the change.
 */
export function formChange(f: StayForm): { ok: true; change: Partial<Booking>; address: string | null } | { ok: false; message: string } {
  const change: Partial<Booking> = {}
  const no = (message: string) => ({ ok: false as const, message })
  const text = (v: string) => v.trim()

  if (text(f.reference)) change.reference = text(f.reference)

  const checkIn = text(f.checkIn)
  const checkOut = text(f.checkOut)
  for (const d of [checkIn, checkOut]) if (d && !DAY.test(d)) return no('Dates need to be written like 2026-12-08.')
  if (checkIn && checkOut && checkOut <= checkIn) return no('Check-out needs to be after check-in.')
  if (checkIn) change.check_in = checkIn
  if (checkOut) change.check_out = checkOut
  const inTime = text(f.checkInTime)
  const outTime = text(f.checkOutTime)
  for (const c of [inTime, outTime]) if (c && !CLOCK.test(c)) return no('Times need to be written like 15:00.')
  if (inTime) change.check_in_time = inTime
  if (outTime) change.check_out_time = outTime

  if (text(f.room)) change.room_name = text(f.room)
  if (text(f.guests)) {
    const n = Number(text(f.guests))
    if (!Number.isInteger(n) || n < 1) return no('Guests need to be a whole number.')
    change.travellers = n
  }
  if (text(f.rooms)) {
    const n = Number(text(f.rooms))
    if (!Number.isInteger(n) || n < 1) return no('Rooms need to be a whole number.')
    change.rooms = n
  }

  const total = moneyOf(f.total)
  const paid = moneyOf(f.paid)
  const dkk = moneyOf(f.dkk)
  if (Number.isNaN(total)) return no('The total needs to be a number.')
  if (Number.isNaN(paid)) return no('The amount paid needs to be a number.')
  if (Number.isNaN(dkk)) return no('The total in kroner needs to be a number.')
  if (total != null && paid != null && paid > total) return no('The amount paid cannot be more than the total.')
  const currency = text(f.currency).toUpperCase() || 'DKK'
  if ((total != null || paid != null) && !/^[A-Z]{3}$/.test(currency)) return no('The currency needs to be a three letter code like EUR.')
  if (total != null) {
    change.price = total
    change.currency = currency
    change.price_dkk = currency === 'DKK' ? Math.round(total) : dkk != null ? Math.round(dkk) : null
  } else if (dkk != null) {
    change.price_dkk = Math.round(dkk)
  }
  if (paid != null) {
    change.paid = paid
    if (total == null) change.currency = currency
  }

  if (f.provider) {
    const name = text(f.seller)
    const link = text(f.sellerUrl)
    change.provider = f.provider
    if (f.provider === 'other') {
      if (!name) return no('Name the provider.')
      if (!bookingLink(link)) return no('Add the link of the provider, starting with http or https.')
    } else if (f.provider === 'own' && link && !bookingLink(link)) {
      return no('The link needs to start with http or https.')
    }
    if (f.provider === 'own' || f.provider === 'other') {
      if (name) change.seller = name
      change.seller_url = link ? bookingLink(link) : null
    } else {
      change.seller = PROVIDER_NAME[f.provider]
      change.seller_url = null
    }
  }

  const until = text(f.cancelUntil)
  if (until) {
    if (!DAY.test(until)) return no('The last day of free cancellation needs to be written like 2026-12-08.')
    change.cancel_until = until
  }
  if (f.refundable) change.refundable = f.refundable
  else if (until) change.refundable = 'yes'

  const mail = text(f.mailUrl)
  if (mail) {
    if (!/^https:\/\/\S+$/i.test(mail)) return no('The mail link needs to start with https.')
    change.mail_url = mail
  }

  return { ok: true, change, address: text(f.address) || null }
}
